import JSZip from "jszip";
import { collectSpecImages, sanitizeSlug, buildProjectFiles, buildPackageJson, buildViteConfig, buildTsconfig, buildReadme } from "./siteExportCore";

function extFrom(url: string, mime: string): string {
  if (mime === "image/png") return "png";
  const m = /\.(jpe?g|png|webp)/i.exec(url);
  return m ? (m[1] === "jpeg" ? "jpg" : m[1]) : "jpg";
}

async function fetchImage(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.type.startsWith("image/") && blob.size > 500 ? blob : null;
  } catch {
    return null;
  }
}

/** Baixa a imagem como bytes (sem depender de Blob.arrayBuffer em todos os ambientes). */
async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!type.startsWith("image/") || bytes.byteLength <= 500) return null;
    return { bytes, type };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// LEGADO: reconstrói o site a partir da spec. Usado apenas quando o projeto
// NÃO tem workspace real (`generated_code`/`draftFiles`) — projetos antigos.
// ---------------------------------------------------------------------------
export async function exportProjectZip(spec: Record<string, unknown>): Promise<{ blob: Blob; name: string }> {
  const business = (spec.business && typeof spec.business === "object" ? spec.business : {}) as Record<string, unknown>;
  const company = typeof business.name === "string" ? business.name : "Meu Site";
  const root = sanitizeSlug(company, "meu-site");

  const urls = collectSpecImages(spec as never);
  const assetSrc: Record<string, string> = {};
  const external: string[] = [];
  const zip = new JSZip();
  const assets = zip.folder(`${root}/public/assets`)!;

  let index = 0;
  for (const url of urls) {
    const blob = await fetchImage(url);
    if (blob) {
      const ext = extFrom(url, blob.type);
      const path = `assets/img-${index}.${ext}`;
      assets.file(`img-${index}.${ext}`, blob);
      assetSrc[url] = `./${path}`;
    } else {
      external.push(url);
      assetSrc[url] = url;
    }
    index++;
  }

  const files = buildProjectFiles(spec as never, assetSrc, external);
  for (const [path, content] of Object.entries(files)) zip.file(path, content);

  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, name: `${root}-site.zip` };
}

export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await fetchImage(url);
    if (!blob) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function saveBlob(blob: Blob, fileName: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------------------------------------------------------------------------
// NOVO: exporta o ESTADO REAL do projeto (workspace/draftFiles), preservando
// caminhos relativos. Inclui logo SVG, favicon, imagens, CSS/JS, site.json etc.
// NUNCA inclui segredos/.env/node_modules/arquivos de runtime ou de outros projetos.
// ---------------------------------------------------------------------------

/** Caminhos que NÃO pertencem ao site e/ou não devem sair no ZIP. */
const BLOCKED_PATH = /(^|\/)(?:node_modules|\.git|\.kilo|\.vscode|supabase|\.next|dist|build)(\/|$)/i;
const SECRET_FILE = /(?:^|\/)\.env(?:\.(?:local|production|development|test|staging))?$/i;
const BLOCKED_EXT = /\.(pem|key|p12|pfx|keystore)$/i;

/** Sanitiza o mapa de arquivos reais: preserva o site, remove segredos/lixo. */
export function filterWorkspaceFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawPath, content] of Object.entries(files ?? {})) {
    if (typeof content !== "string") continue;
    const path = rawPath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
    if (!path || path.endsWith("/")) continue;
    if (path === ".env.example") { out[path] = content; continue; }
    if (SECRET_FILE.test(path)) continue;
    if (BLOCKED_EXT.test(path)) continue;
    if (BLOCKED_PATH.test(path)) continue;
    out[path] = content;
  }
  return out;
}

function workspaceSlug(files: Record<string, string>): string {
  try {
    const j = JSON.parse(files["src/site.json"] ?? "{}") as { business?: { name?: unknown } };
    const n = j?.business?.name;
    if (typeof n === "string" && n.trim()) return sanitizeSlug(n, "meu-site");
  } catch { /* site.json ausente/ inválido */ }
  const title = files["index.html"]?.match(/<title>([^<]*)<\/title>/i)?.[1];
  if (title) return sanitizeSlug(title.split(/[—|-]/)[0].trim(), "meu-site");
  return "meu-site";
}

/** Caminho relativo de `assetPath` a partir do diretório do arquivo `fromFile`. */
function relFromFile(fromFile: string, assetPath: string): string {
  const fromDir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
  const f = fromDir.split("/").filter(Boolean);
  const t = assetPath.split("/").filter(Boolean);
  let i = 0;
  while (i < f.length && i < t.length && f[i] === t[i]) i++;
  const up = f.length - i;
  const rel = [...Array(up).fill(".."), ...t.slice(i)].join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/** URLs http(s) de imagem raster presentes no conteúdo (src, srcset, url(...)). */
const IMG_URL_RE = /https?:\/\/[^\s"'`()<>]+?\.(?:png|jpe?g|webp|avif|gif)(?:\?[^\s"'`()<>]*)?/gi;

function rewriteImageRefs(content: string, filePath: string, map: Map<string, string>): string {
  if (map.size === 0) return content;
  let out = content;
  for (const [url, assetPath] of map) {
    if (!out.includes(url)) continue;
    out = out.split(url).join(relFromFile(filePath, assetPath));
  }
  return out;
}

/**
 * Exporta o ZIP a partir dos ARQUIVOS REAIS do projeto (workspace/draftFiles).
 * - Preserva caminhos relativos (o site continua funcionando ao extrair).
 * - Baixa imagens remotas para `assets/` e reescreve referências (site autossuficiente).
 * - Remove `.env`/segredos/node_modules/runtime; adiciona scaffolding se faltar.
 */
export async function exportWorkspaceZip(files: Record<string, string>): Promise<{ blob: Blob; name: string; bytes: Uint8Array }> {
  const cleaned = filterWorkspaceFiles(files);
  const slug = workspaceSlug(cleaned);

  // 1) Coleta URLs remotas de imagem (raster) referenciadas pelo projeto real.
  const raws = new Set<string>();
  for (const content of Object.values(cleaned)) {
    for (const m of content.matchAll(IMG_URL_RE)) raws.add(m[0]);
  }

  // 2) Baixa cada uma e define o caminho local (assets/img-N.ext).
  const refMap = new Map<string, string>(); // variante-da-URL -> caminho local
  const assets: Array<{ path: string; bytes: Uint8Array }> = [];
  let index = 0;
  for (const raw of raws) {
    const url = raw.replace(/&amp;/g, "&");
    const img = await fetchImageBytes(url);
    if (!img) continue; // falhou → mantém a URL remota (site continua funcionando online)
    const ext = extFrom(url, img.type);
    const assetPath = `assets/img-${index}.${ext}`;
    assets.push({ path: assetPath, bytes: img.bytes });
    refMap.set(raw, assetPath);
    const escaped = raw.replace(/&/g, "&amp;");
    if (escaped !== raw) refMap.set(escaped, assetPath);
    index++;
  }

  // 3) Reescreve referências por arquivo (relativo à pasta do próprio arquivo).
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(cleaned)) {
    out[path] = rewriteImageRefs(content, path, refMap);
  }

  // 4) Scaffolding (Vite) apenas se o projeto real ainda não tiver — para abrir
  //    e rodar no VS Code sem depender do runtime.
  const scaffold: Record<string, string> = {
    "package.json": buildPackageJson(slug),
    "vite.config.ts": buildViteConfig(),
    "tsconfig.json": buildTsconfig(),
    "README.md": buildReadme({ business: { name: slug } } as never, slug, []),
    ".env.example": "# O projeto é estático e não requer variáveis de ambiente.\n",
  };
  for (const [path, content] of Object.entries(scaffold)) if (!(path in out)) out[path] = content;

  // 5) ZIP: raiz = slug, com todos os arquivos reais + imagens baixadas.
  const zip = new JSZip();
  const folder = zip.folder(slug)!;
  for (const [path, content] of Object.entries(out)) folder.file(path, content);
  for (const a of assets) folder.file(a.path, a.bytes);

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const blob = new Blob([bytes], { type: "application/zip" });
  return { blob, name: `${slug}-site.zip`, bytes };
}
