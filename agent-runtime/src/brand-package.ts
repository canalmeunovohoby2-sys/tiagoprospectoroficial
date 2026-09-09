// Brand Package (12) — ZIP profissional completo da identidade visual, montado
// exclusivamente a partir dos ARQUIVOS REAIS persistidos do projeto:
//   - SVGs reais (assets/brand/*.svg) + exports PNG transparentes (SVG real)
//   - brand-state.json + identidade.json (dados reais)
//   - paleta.txt / tipografia.txt (leves, derivados de dados reais)
//   - mockups reais (ArtifactStore, only aplicadas+persistidas)
//   - master-output.psd real (quando disponível) — NUNCA o Master original
//   - manual-identidade.pdf real (FASE 11, versão atual validada)
//   - README.txt para o cliente + manifesto interno BrandPackageManifest
// Segurança: allowlist explícita, sem `../`, sem outro projeto, sem .env/secrets,
// sem arquivos internos do runtime. Validação: abre o ZIP, checa estrutura,
// proibidos, tamanhos e sha256 (integridade arquivo-original == dentro do ZIP).
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require("jszip") as { new (): JSZipLike };
import { ArtifactStore } from "./artifact-store.js";
import { loadBrandPdf, buildBrandPdfData, hexToRgb, rgbToCmyk, type PdfBrandData } from "./brand-pdf.js";
import { STATE_PATH, ASSET_DIR } from "./branding-state.js";

interface JSZipLike { file: (name: string, data: Buffer | string | Uint8Array) => unknown; folder: (name: string) => JSZipLike; generateAsync: (opts: { type: "nodebuffer"; compression: "DEFLATE" | "STORE"; compressionOptions?: { level: number } }) => Promise<Buffer>; files: Record<string, { name: string; async: (t: "nodebuffer" | "string") => Promise<Buffer | string> }>; loadAsync: (b: Buffer) => Promise<{ files: Record<string, { name: string; async: (t: string) => Promise<Buffer | string> }> }>; }
export interface BrandPackageInput { stateFiles: Record<string, string>; projectId: string; store: ArtifactStore; }
export interface BrandPackageFileInfo { path: string; type: string; size: number; sha256: string; }
export interface BrandPackageManifest {
  packageId: string; projectId: string; versionId: string;
  identityVersion?: number | string | null; pdfVersion?: string | null; mockupVersion?: string | null;
  identityName: string; files: BrandPackageFileInfo[]; fileCount: number; totalBytes: number;
  createdAt: string; validatedAt: string | null; validationOk: boolean;
}
export interface BrandPackageResult {
  zipBuffer: Buffer; manifest: BrandPackageManifest; zipSizeBytes: number;
  validation: { ok: boolean; checks: string[]; issues: string[] };
}

const LOGO_MAP: Record<string, { folder: string; name: string; label: string }> = {
  primary: { folder: "SVG", name: "logo-principal", label: "Logo principal" },
  symbol: { folder: "SVG", name: "simbolo", label: "Símbolo" },
  horizontal: { folder: "VARIACOES", name: "horizontal", label: "Horizontal" },
  vertical: { folder: "VARIACOES", name: "vertical", label: "Vertical" },
  monoLight: { folder: "VARIACOES", name: "monocromatica-clara", label: "Monocromática (claro)" },
  monoDark: { folder: "VARIACOES", name: "negativa", label: "Negativa" },
};
const KEY_LABEL = (k: string) => LOGO_MAP[k]?.label ?? k;
const APP_ID_RE = /^[A-Za-z0-9 _-]{1,40}$/;
const PROHIBITED = [/mockup-master\.psd\.psd$/i, /\.env$/i, /\.git\//i, /node_modules/i, /\.tmp/i, /(^|\/)package\.json$/i];

function sha256(b: Buffer): string { return createHash("sha256").update(b).digest("hex"); }

export function svgToPngBuffer(svg: string, w: number, h: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const clib = require("@napi-rs/canvas") as { loadImage: (b: Buffer) => Promise<{ width: number; height: number }>; createCanvas: (w: number, h: number) => { getContext: (s: string) => { drawImage: (i: unknown, a: number, b: number, cw?: number, ch?: number) => void }, toBuffer: (m: string) => Buffer; width: number; height: number } };
        const img = await clib.loadImage(Buffer.from(svg));
        const c = clib.createCanvas(w, h);
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toBuffer("image/png"));
      } catch (e) { reject(e); }
    })();
  });
}

function safeBranch(name: string): boolean { return APP_ID_RE.test(name); }

function brandBundle(stateFiles: Record<string, string>): { data: PdfBrandData | null; identity: string | null } {
  const data = buildBrandPdfData(stateFiles, []);
  const identity = stateFiles[STATE_PATH] ?? null;
  return { data, identity };
}

function paletteTxt(data: PdfBrandData): string {
  const colors: Array<[string, string]> = [["Primária", data.palette.primary], ["Secundária", data.palette.secondary], ["Destaque", data.palette.accent], ["Fundo", data.palette.background], ["Texto", data.palette.foreground]];
  const lines = ["IDENTIDADE VISUAL\n", "PALETA CROMÁTICA\n"];
  for (const [name, hex] of colors) {
    const rgb = hexToRgb(hex);
    const cmyk = rgbToCmyk(rgb);
    lines.push(`${name}\nHEX  ${hex}\nRGB  ${rgb.r}, ${rgb.g}, ${rgb.b}\nCMYK ${cmyk.c}/${cmyk.m}/${cmyk.y}/${cmyk.k}\n`);
  }
  lines.push("CMYK = conversão técnica RGB→CMYK (não é perfil ICC de impressão).");
  return lines.join("\n");
}
function typographyTxt(data: PdfBrandData): string {
  return [
    "IDENTIDADE VISUAL\n",
    "TIPOGRAFIA\n",
    `Família (heading): ${data.typography.heading}`,
    `Família (corpo): ${data.typography.body}`,
    `Pesos: ${data.typography.weights}`,
    `Hierarquia: ${data.identity.hierarchy || "—"}`,
    "",
    "Observação: o manual PDF compõe com fontes padrão internas como fallback (as fontes precisas da identidade são registradas acima; podem ser instaladas como webfonts no site).",
  ].join("\n");
}
function identityJson(data: PdfBrandData): string {
  if (!data.concept) return "{}";
  return JSON.stringify({
    name: data.name, palette: data.palette, typography: data.typography,
    concept: data.concept, construction: data.construction,
    identity: data.identity, variants: Object.keys(data.variants),
  }, null, 2);
}
function readmeTxt(data: PdfBrandData | null, name: string, fileCount: number, totalKB: number): string {
  return [
    `${data?.name ?? name} — Identidade Visual`,
    `Versão e data: ver manifest`,
    "",
    "CONTEÚDO DO PACOTE",
    "01-LOGO — logo principal, símbolo (SVG real) e variações (+ PNG transparente exportado do SVG real)",
    "02-IDENTIDADE — brand-state.json e identidade.json (dados reais do projeto)",
    "03-CORES — paleta.txt (HEX, RGB, CMYK conversão técnica)",
    "04-TIPOGRAFIA — tipografia.txt (famílias, pesos, hierarquia, observação de fallback)",
    "05-MOCKUPS — aplicações reais geradas pelo PSD Master (PNG real)",
    "06-MANUAL — manual-identidade.pdf (manual da identidade, FASE 11)",
    "07-ARQUIVOS-EDITAVEIS — master-output.psd (PSD final com a identidade aplicada)",
    "",
    `Arquivos: ${fileCount} · ~${totalKB} KB`,
    "Observações: o arquivo PSD final é a versão com a identidade aplicada; o Master original nunca é distribuído.",
  ].join("\n");
}

export async function buildBrandPackage(input: BrandPackageInput): Promise<BrandPackageResult> {
  const versionId = new Date().toISOString().replace(/[:.]/g, "-");
  const { data, identity } = brandBundle(input.stateFiles);
  const name = data?.name ?? (identity ? (JSON.parse(identity).name ?? "Identidade") : "Identidade");
  const root = `IDENTIDADE-VISUAL-${name.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-").toUpperCase().slice(0, 60)}`;
  const zip = new JSZip();
  const files: BrandPackageFileInfo[] = [];
  const forbidden: string[] = [];
  const put = (path: string, bytes: Buffer, type: string) => {
    if (PROHIBITED.some((re) => re.test(path))) { forbidden.push(path); return; }
    zip.file(path, bytes);
    files.push({ path, type, size: bytes.length, sha256: sha256(bytes) });
  };

  // 01-LOGO: SVGs reais (+ PNG transparente exportado)
  const logoKeys = Object.keys(LOGO_MAP);
  for (const k of logoKeys) {
    const svg = input.stateFiles[`${ASSET_DIR}/${k}.svg`];
    if (!svg) continue;
    const row = LOGO_MAP[k];
    put(`${root}/01-LOGO/${row.folder}/${row.name}.svg`, Buffer.from(svg, "utf8"), "logo-svg");
    try {
      const png = await svgToPngBuffer(svg, 480, 288);
      put(`${root}/01-LOGO/PNG/${row.name}.png`, png, "logo-png");
    } catch { /* sem PNG se falhar — não fabrica */ }
  }

  // 02-IDENTIDADE
  if (identity) put(`${root}/02-IDENTIDADE/brand-state.json`, Buffer.from(identity, "utf8"), "identity");
  if (data) put(`${root}/02-IDENTIDADE/identidade.json`, Buffer.from(identityJson(data), "utf8"), "identity");

  // 03-CORES / 04-TIPOGRAFIA
  if (data) {
    put(`${root}/03-CORES/paleta.txt`, Buffer.from(paletteTxt(data), "utf8"), "colors");
    put(`${root}/04-TIPOGRAFIA/tipografia.txt`, Buffer.from(typographyTxt(data), "utf8"), "typography");
  }

  // 05-MOCKUPS (reais, persistidas) — só aplicadas/persistidas (current/ só tem essas)
  const current = await input.store.listProjectFiles(input.projectId, "current/");
  for (const rel of current) {
    if (!/\.png$/i.test(rel)) continue;
    const appId = rel.split("/").pop()!.replace(/\.png$/, "");
    if (!safeBranch(appId)) continue;
    const buf = await input.store.getMockupFile(input.projectId, rel);
    if (buf) put(`${root}/05-MOCKUPS/${appId}.png`, buf, "mockup");
  }

  // 06-MANUAL (PDF real, versão atual)
  const pdf = await loadBrandPdf(input.store, input.projectId);
  if (pdf?.currentPdf && pdf.currentMeta?.validationOk !== false) {
    put(`${root}/06-MANUAL/manual-identidade.pdf`, pdf.currentPdf, "pdf");
  }

  // 07-ARQUIVOS-EDITAVEIS (PSD final real — NUNCA o Master)
  const psd = await input.store.getMockupFile(input.projectId, "current/master-output.psd");
  if (psd) put(`${root}/07-ARQUIVOS-EDITAVEIS/master-output.psd`, psd, "psd");

  // README para o cliente + manifesto interno
  const totalKB = Math.round(files.reduce((s, f) => s + f.size, 0) / 1024);
  put(`${root}/README.txt`, Buffer.from(readmeTxt(data, name, files.length, totalKB), "utf8"), "readme");
  const manifest: BrandPackageManifest = {
    packageId: `pkg-${versionId}`, projectId: input.projectId, versionId,
    identityVersion: null, pdfVersion: pdf?.currentMeta?.versionId ?? null,
    mockupVersion: (await input.store.currentManifest(input.projectId))?.currentVersionId ?? null,
    identityName: name, files, fileCount: files.length, totalBytes: files.reduce((s, f) => s + f.size, 0),
    createdAt: new Date().toISOString(), validatedAt: null, validationOk: false,
  };
  zip.file(`${root}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
  const validation = await validateBrandPackage(zipBuffer, manifest);
  manifest.validatedAt = validation.ok ? new Date().toISOString() : null;
  manifest.validationOk = validation.ok;
  return { zipBuffer, manifest, zipSizeBytes: zipBuffer.length, validation };
}

export async function validateBrandPackage(zipBuffer: Buffer, expected: BrandPackageManifest): Promise<{ ok: boolean; checks: string[]; issues: string[] }> {
  const checks: string[] = []; const issues: string[] = [];
  const sig = zipBuffer.subarray(0, 4).toString("latin1");
  checks.push(`assinatura ZIP: ${sig === "PK\x03\x04" ? "ok" : "inválida"}`);
  if (sig !== "PK\x03\x04") issues.push("assinatura ZIP inválida");
  let entries: Record<string, { name: string; async: (t: string) => Promise<Buffer | string> }> = {};
  let loaded = false;
  try { const z = await new JSZip().loadAsync(zipBuffer); entries = z.files; loaded = true; checks.push("ZIP abre: ok"); } catch (e) { issues.push("ZIP não abre: " + (e instanceof Error ? e.message : String(e))); checks.push("ZIP abre: falhou"); }
  if (!loaded) return { ok: false, checks, issues };
  const names = Object.keys(entries).filter((n) => !n.endsWith("/"));
  checks.push(`arquivos no ZIP: ${names.length}`);
  // obrigatórios
  for (const must of ["README.txt", "manifest.json"]) if (!names.some((n) => n.endsWith(must))) issues.push(`faltando obrigatório: ${must}`);
  // proibidos
  for (const n of names) for (const re of PROHIBITED) if (re.test(n)) issues.push(`arquivo proibido incluído: ${n}`);
  // integridade: cada arquivo do manifesto deve ter sha256 idêntico ao conteúdo no ZIP
  for (const exp of expected.files) {
    const entry = names.find((n) => n.endsWith(exp.path) || n === exp.path);
    if (!entry) { issues.push(`arquivo ausente do ZIP: ${exp.path}`); continue; }
    const data = await entries[entry].async("nodebuffer") as Buffer;
    if (sha256(data) !== exp.sha256) issues.push(`hash diverge: ${exp.path}`);
    else if (data.length !== exp.size) issues.push(`tamanho diverge: ${exp.path}`);
  }
  checks.push(`integridade sha256: ${issues.filter((i) => i.startsWith("hash")).length === 0 ? "ok" : "falhou"}`);
  return { ok: issues.length === 0, checks, issues };
}

export async function persistBrandPackage(store: ArtifactStore, projectId: string, zipBuffer: Buffer, manifest: BrandPackageManifest): Promise<void> {
  const base = "package";
  await store.putProjectFile(projectId, `${base}/versions/${manifest.versionId}.zip`, zipBuffer);
  await store.putProjectFile(projectId, `${base}/versions/${manifest.versionId}.json`, Buffer.from(JSON.stringify(manifest, null, 2)));
  await store.putProjectFile(projectId, `${base}/current.zip`, zipBuffer);
  await store.putProjectFile(projectId, `${base}/current.json`, Buffer.from(JSON.stringify(manifest, null, 2)));
  let versions: string[] = [];
  const prev = await store.getProjectFile(projectId, `${base}/versions.json`);
  if (prev) { try { versions = JSON.parse(prev.toString()); } catch { versions = []; } }
  if (!versions.includes(manifest.versionId)) versions.push(manifest.versionId);
  await store.putProjectFile(projectId, `${base}/versions.json`, Buffer.from(JSON.stringify(versions)));
}

export async function loadBrandPackage(store: ArtifactStore, projectId: string): Promise<{ currentZip: Buffer | null; currentManifest: BrandPackageManifest | null; versions: string[] } | null> {
  const base = "package";
  const zip = await store.getProjectFile(projectId, `${base}/current.zip`);
  const mBuf = await store.getProjectFile(projectId, `${base}/current.json`);
  let versions: string[] = [];
  const vs = await store.getProjectFile(projectId, `${base}/versions.json`);
  if (vs) { try { versions = JSON.parse(vs.toString()); } catch { versions = []; } }
  return {
    currentZip: zip ?? null,
    currentManifest: mBuf ? (JSON.parse(mBuf.toString()) as BrandPackageManifest) : null,
    versions,
  };
}

export async function generateAndPersistBrandPackage(input: BrandPackageInput): Promise<BrandPackageResult & { persisted: boolean }> {
  const r = await buildBrandPackage(input);
  await persistBrandPackage(input.store, input.projectId, r.zipBuffer, r.manifest);
  return { ...r, persisted: r.validation.ok && r.zipBuffer.length > 0 };
}

// ---- Manifesto (texto) para a UI — o ZIP binário NUNCA vai para generated_code ----
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
export const PACKAGE_RESULT_REL = "assets/packages/package-result.json";
export const PACKAGE_HISTORY_REL = "assets/packages/package-history.json";

export interface BrandPackageResultText {
  status: "ready" | "error";
  packageId: string; versionId: string; identityName: string;
  fileCount: number; totalBytes: number; zipSizeBytes: number;
  createdAt: string; validationOk: boolean; persisted: boolean;
  packageRelPath: string; reason?: string;
}

export function brandPackageResultText(manifest: BrandPackageManifest, opts: { persisted: boolean; zipSizeBytes: number; status?: "ready" | "error"; reason?: string }): BrandPackageResultText {
  return {
    status: opts.status ?? (opts.persisted && manifest.validationOk ? "ready" : "error"),
    packageId: manifest.packageId, versionId: manifest.versionId, identityName: manifest.identityName,
    fileCount: manifest.fileCount, totalBytes: manifest.totalBytes, zipSizeBytes: opts.zipSizeBytes,
    createdAt: manifest.createdAt, validationOk: manifest.validationOk, persisted: opts.persisted,
    packageRelPath: "package/current.zip", reason: opts.reason,
  };
}

export function writeBrandPackageManifest(workspaceRoot: string, manifest: BrandPackageManifest, opts: { persisted: boolean; zipSizeBytes: number; status?: "ready" | "error"; reason?: string }): Record<string, string> {
  const result = brandPackageResultText(manifest, opts);
  let history: BrandPackageResultText[] = [];
  const hp = join(workspaceRoot, PACKAGE_HISTORY_REL);
  if (existsSync(hp)) { try { history = JSON.parse(readFileSync(hp, "utf8")); } catch { history = []; } }
  history.push({ ...result });
  mkdirSync(join(workspaceRoot, "assets/packages"), { recursive: true });
  writeFileSync(join(workspaceRoot, PACKAGE_RESULT_REL), JSON.stringify(result, null, 2));
  writeFileSync(hp, JSON.stringify(history, null, 2));
  return { [PACKAGE_RESULT_REL]: JSON.stringify(result, null, 2), [PACKAGE_HISTORY_REL]: JSON.stringify(history, null, 2) };
}
