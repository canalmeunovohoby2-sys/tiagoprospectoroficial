// Attachments (5.26) — materializa anexos do chat no workspace do projeto com
// segurança, para o Cline acessar/ler/analisar de verdade (não só dataURL).
//
// O workspace é um mapa de TEXTO (persistido em generated_code). Imagens/binários
// são guardados como DATA URL (string base64) no arquivo do workspace — assim o
// conteúdo sobrevive ao persistir/carregar, o Cline pode ler e, se quiser usar
// a imagem no site, embuti-la inline (funciona em preview/export/standalone).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface ChatAttachment {
  name?: string;
  mediaType?: string;
  dataUrl?: string;
  label?: string;
}

/** Dimensões reais do PNG/JPG (o agente dimensiona o layout sem precisar "ver"). */
function imageSize(buf: Buffer, mediaType: string): { width: number; height: number } | null {
  try {
    if (/png$/i.test(mediaType) && buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (/jpe?g$/i.test(mediaType)) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch { /* ignora */ }
  return null;
}

/**
 * O anexo foi REALMENTE usado no projeto? Verdadeiro quando o caminho público (ou o
 * nome do arquivo) aparece em algum arquivo de código do site. Usado para exigir a
 * aplicação (1 rodada de correção) e para NUNCA dizer "feito" sem referência real.
 */
export function attachmentApplied(files: Record<string, string>, attachments: MaterializedAttachment[]): boolean {
  const images = attachments.filter((a) => /^image\//i.test(a.mediaType) && !/svg/i.test(a.mediaType));
  if (!images.length) return true; // só imagens entram nesta exigência
  const code = Object.entries(files ?? {})
    .filter(([p]) => /\.(tsx|jsx|ts|js|html?|css)$/i.test(p))
    .map(([, c]) => c)
    .join("\n");
  return images.some((a) => code.includes(a.publicPath ?? a.path) || code.includes(a.name));
}

export interface MaterializedAttachment {
  name: string;
  path: string;      // caminho real dentro do workspace (ex.: assets/meu-pet.png)
  /** Caminho servido pelo site (/assets/<nome>, via public/). Use ESTE no código. */
  publicPath?: string;
  mediaType: string;
  bytes: number;     // tamanho decodificado (para validação)
  /** Dimensões reais (PNG/JPG) — ajuda o agente a dimensionar sem "ver". */
  width?: number;
  height?: number;
  dataUrl: string;   // conteúdo materializado (texto) — guardado no arquivo
}

const MAX_BYTES = 2_200_000; // ~2MB

function isAllowedName(name: string): boolean {
  if (!name) return false;
  const clean = name.replace(/\\/g, "/");
  const parts = clean.split("/").filter(Boolean);
  if (parts.length !== 1) return false; // sem subpastas/.. / absoluto
  if (/\.env($|\.)/i.test(name)) return false;
  if (/\.(exe|bat|cmd|sh|ps1|dll|so|dylib|apk|js|ts|mjs|html?)$/i.test(name)) return false;
  if (/[\x00-\x1f]/.test(name)) return false;
  return true;
}

function extFor(mediaType: string): string {
  if (/^image\/png$/i.test(mediaType)) return "png";
  if (/^image\/jpe?g$/i.test(mediaType)) return "jpg";
  if (/^image\/webp$/i.test(mediaType)) return "webp";
  if (/^image\/gif$/i.test(mediaType)) return "gif";
  if (/^image\/svg\+xml$/i.test(mediaType)) return "svg";
  if (/^text\/plain$/i.test(mediaType)) return "txt";
  if (/^text\/markdown$/i.test(mediaType)) return "md";
  if (/^application\/json$/i.test(mediaType)) return "json";
  if (/^application\/pdf$/i.test(mediaType)) return "pdf";
  return "";
}

export interface MaterializeResult {
  ok: boolean;
  attachments: MaterializedAttachment[];
  errors: string[];
}

// Materializa anexos no workspace (ex.: assets/<slug>-<nome>). Seguro.
export function materializeAttachments(
  workspaceRoot: string,
  attachments: ChatAttachment[] | undefined | null,
): MaterializeResult {
  const out: MaterializedAttachment[] = [];
  const errors: string[] = [];
  if (!Array.isArray(attachments) || attachments.length === 0) return { ok: true, attachments: [], errors };

  const assetsDir = join(workspaceRoot, "assets");
  mkdirSync(assetsDir, { recursive: true });

  attachments.forEach((att, idx) => {
    if (!att || typeof att !== "object") { errors.push(`Anexo ${idx}: inválido.`); return; }
    const rawName = (att.name ?? att.label ?? "anexo").trim();
    const dataUrl = typeof att.dataUrl === "string" ? att.dataUrl.trim() : "";
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
    if (!m) { errors.push(`Anexo ${idx} ("${rawName || "?"}"): dados inválidos.`); return; }
    const mediaType = (att.mediaType && extFor(att.mediaType)) ? (att.mediaType || "") : (m[1] || "");
    if (!extFor(mediaType)) { errors.push(`Anexo ${idx} ("${rawName || "?"}"): tipo não permitido (${mediaType || "desconhecido"}).`); return; }
    const approx = Math.round((m[3].length * 3) / 4);
    if (approx === 0 || approx > MAX_BYTES) { errors.push(`Anexo ${idx} ("${rawName || "?"}"): vazio ou grande demais (>~2MB).`); return; }

    const base = (rawName || `anexo-${idx + 1}`).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    const slug = (base.split(".")[0] || `anexo-${idx + 1}`).slice(0, 40);
    const ext = extFor(mediaType);
    const safeName = `${slug}-${idx + 1}.${ext}`;
    if (!isAllowedName(safeName)) { errors.push(`Anexo ${idx}: nome não permitido.`); return; }

    // Grava o arquivo REAL no workspace (bytes decodificados), não a data URL como
    // texto: o site referencia `assets/<nome>` e o agente lê o conteúdo de verdade.
    // (Antes gravava a data URL em utf8 — o arquivo em disco era texto "data:image/…",
    // o que corrompia a logo/foto e impedia o uso real no projeto.)
    const isB64 = !!m[2];
    const payload = m[3] ?? "";
    let fileBuf: Buffer;
    try {
      fileBuf = isB64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
    } catch {
      errors.push(`Anexo ${idx} ("${rawName || "?"}"): conteúdo inválido.`);
      return;
    }
    if (fileBuf.length === 0 || fileBuf.length > MAX_BYTES) { errors.push(`Anexo ${idx} ("${rawName || "?"}"): vazio ou grande demais (>~2MB).`); return; }
    const normalizedDataUrl = `data:${mediaType};base64,${isB64 ? payload : fileBuf.toString("base64")}`;
    const filePath = join(assetsDir, safeName);
    writeFileSync(filePath, fileBuf);
    // CÓPIA PÚBLICA: o Vite serve `public/` na raiz, então `/assets/<nome>` funciona
    // no site real (build/preview). Sem isso a logo existia no workspace mas NÃO
    // aparecia no site renderizado.
    let publicPath: string | undefined;
    try {
      const pubDir = join(workspaceRoot, "public", "assets");
      mkdirSync(pubDir, { recursive: true });
      writeFileSync(join(pubDir, safeName), fileBuf);
      publicPath = `/assets/${safeName}`;
    } catch { /* sem public/: segue apenas com o caminho do workspace */ }
    const imgSize = imageSize(fileBuf, mediaType);
    out.push({
      name: safeName,
      path: `assets/${safeName}`,
      publicPath,
      mediaType,
      bytes: fileBuf.length,
      width: imgSize?.width,
      height: imgSize?.height,
      dataUrl: normalizedDataUrl,
    });
  });

  return { ok: errors.length === 0, attachments: out, errors };
}
