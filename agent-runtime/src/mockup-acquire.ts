// Mockup acquisition (6.10) — aquisição OPERACIONAL de mockups reais.
// Provider-agnostic (Mockup World é só source.provider). Distingue:
// URL encontrada ≠ asset baixado ≠ asset válido ≠ asset liberado comercialmente.
// NÃO fabrica asset, NÃO inventa licença, NÃO aceita HTML salvo como imagem,
// NÃO marca commercial por inferência. downloader usa fetch INJETÁVEL (testável).
import { readFileSync, writeFileSync, statSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { createHash } from "node:crypto";
import type { LicenseStatus } from "./mockup-library.js";

export type ImageKind = "png" | "jpeg" | "webp" | "psd" | "other";
export type AcquisitionStatus = "downloaded" | "validated" | "blocked" | "unknown";

export interface AssetValidation { ok: boolean; size: number; type: ImageKind | null; width?: number; height?: number; error?: string; hash?: string; }

export function sniffImageKind(buf: Buffer): ImageKind | null {
  if (!buf || buf.length < 8) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.toString("ascii", 0, 4) === "8BPS") return "psd";
  return null;
}

const be32 = (b: Buffer, o: number) => (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
const be24 = (b: Buffer, o: number) => (b[o] << 16) | (b[o + 1] << 8) | b[o + 2];

function pngDims(b: Buffer): { width: number; height: number } | null {
  // PNG: 0x89 'PNG' 0D 0A 1A 0A | IHDR length(4) "IHDR" | width(4) height(4)
  if (b.length < 24) return null;
  if (b.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: be32(b, 16), height: be32(b, 20) };
}

function jpegDims(b: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof && i + 9 < b.length) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

function webpDims(b: Buffer): { width: number; height: number } | null {
  const c = b.toString("ascii", 12, 16);
  if (c === "VP8X") { return { width: be24(b, 24) + 1, height: be24(b, 27) + 1 }; }
  if (c === "VP8L") { const p = b[21] | (b[22] << 8) | (b[23] << 16); return { width: (p & 0x3fff) + 1, height: ((p >> 14) & 0x3fff) + 1 }; }
  if (c === "VP8 ") { return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff }; }
  return null;
}

function psdDims(b: Buffer): { width: number; height: number } | null {
  if (b.length < 26) return null;
  return { height: be32(b, 18), width: be32(b, 22) };
}

export function readImageDimensions(buf: Buffer, kind: ImageKind | null): { width: number; height: number } | null {
  if (!kind) return null;
  if (kind === "png") return pngDims(buf);
  if (kind === "jpeg") return jpegDims(buf);
  if (kind === "webp") return webpDims(buf);
  if (kind === "psd") return psdDims(buf);
  return null;
}

export function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Validação física de um arquivo já presente (rejeita HTML-como-imagem/arquivo inválido). */
export function validateAssetFile(path: string, opts: { hash?: boolean } = {}): AssetValidation {
  if (!existsSync(path)) return { ok: false, size: 0, type: null, error: "arquivo não existe" };
  const st = statSync(path);
  if (st.size === 0) return { ok: false, size: 0, type: null, error: "arquivo vazio" };
  const buf = readFileSync(path);
  const kind = sniffImageKind(buf);
  if (!kind) return { ok: false, size: st.size, type: null, error: "não é imagem/PSD reconhecida (possível HTML salvo como imagem)" };
  const dims = readImageDimensions(buf, kind);
  return { ok: true, size: st.size, type: kind, width: dims?.width, height: dims?.height, hash: opts.hash ? sha256(path) : undefined };
}

export interface DownloadOptions { fetcher?: typeof fetch; timeoutMs?: number; maxBytes?: number; }
export interface DownloadResult { ok: boolean; size: number; type: ImageKind | null; error?: string; }

/** Download seguro: rejeita respostas não-2xx, HTML, vazias e grandes demais. */
export async function downloadAssetSafe(url: string, destPath: string, opts: DownloadOptions = {}): Promise<DownloadResult> {
  const fetcher = opts.fetcher ?? ((input: any, init?: any) => fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetcher(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) return { ok: false, size: 0, type: null, error: `HTTP ${res.status}` };
    const ctype = res.headers.get("content-type") ?? "";
    if (/text\/html|text\/plain/.test(ctype)) return { ok: false, size: 0, type: null, error: "resposta HTML — não baixar como imagem (HTML salvo como imagem)" };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return { ok: false, size: 0, type: null, error: "arquivo vazio" };
    if (buf.length > (opts.maxBytes ?? 40_000_000)) return { ok: false, size: 0, type: null, error: "arquivo grande demais" };
    const kind = sniffImageKind(buf);
    if (!kind) return { ok: false, size: buf.length, type: null, error: "não é imagem/PSD reconhecida (possível HTML salvo como imagem)" };
    writeFileSync(destPath, buf);
    return { ok: true, size: buf.length, type: kind };
  } catch (e) {
    return { ok: false, size: 0, type: null, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// ---- Importação local (fallback honesto): detecta arquivos reais já colocados.
export interface ScannedLocal { path: string; type: ImageKind | null; size: number; width?: number; height?: number }

export function scanLocalMockups(dir: string): ScannedLocal[] {
  if (!existsSync(dir)) return [];
  const out: ScannedLocal[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { walk(join(d, e.name)); continue; }
      if (!/\.(png|jpe?g|webp|psd)$/i.test(e.name)) continue;
      const full = join(d, e.name);
      const v = validateAssetFile(full);
      if (!v.ok) continue; // apenas assets VÁLIDOS entram no inventário
      out.push({ path: full, type: v.type, size: v.size, width: v.width, height: v.height });
    }
  };
  mkdirSync(dir, { recursive: true });
  walk(dir);
  return out;
}

export interface AcquiredRecord {
  path: string;
  url: string;
  provider: string;
  licenseStatus: LicenseStatus;
  commercialAllowed: boolean;
  verified: boolean;
  status: AcquisitionStatus;
}

/** Associa um arquivo local a um registro de aquisição (licença NUNCA inferida). */
export function associateLocalAsset(path: string, url: string, provider: string, licenseStatus: LicenseStatus, commercialAllowed: boolean): AcquiredRecord {
  return {
    path,
    url,
    provider,
    licenseStatus,
    commercialAllowed,
    verified: false, // verificação de licença é manual/documentada, nunca inferida
    status: licenseStatus === "unknown" || !commercialAllowed ? "blocked" : "validated",
  };
}
