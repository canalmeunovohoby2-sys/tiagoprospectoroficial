// Thumbnails REAIS dos projetos do Studio.
//
// Reutiliza a infraestrutura EXISTENTE de captura (Agent Runtime /capture, que
// compila o React e fotografa o site no Chromium) — a mesma usada pelo PDF.
// Aqui só: (a) assinatura do código para saber quando o thumb ficou velho,
// (b) redução da captura para um thumbnail leve e (c) estado do thumb no card.

import { captureWorkspaceScreenshots } from "@/lib/siteProjectsApi";
import { isBootstrapFiles } from "@/lib/studio/reactTemplate";
import { projectKindOf, type SiteProjectRow } from "@/data/siteProjects";

export interface ThumbnailSettings {
  thumbnail?: string;
  thumbnailSig?: string;
  codeSig?: string;
}

export function thumbnailSettings(project: Pick<SiteProjectRow, "settings"> | null | undefined): ThumbnailSettings {
  const s = project?.settings && typeof project.settings === "object" ? (project.settings as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);
  return { thumbnail: str(s.thumbnail), thumbnailSig: str(s.thumbnailSig), codeSig: str(s.codeSig) };
}

/** Assinatura estável do código (ordem-independente) para invalidar o thumb. */
export function hashProjectFiles(files: Record<string, string> | null | undefined): string {
  if (!files) return "";
  const entries = Object.entries(files)
    .filter(([, v]) => typeof v === "string")
    .map(([p, v]) => `${p}:${v.length}`)
    .sort();
  let h = 2166136261;
  for (const e of entries) for (let i = 0; i < e.length; i++) { h ^= e.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return `${entries.length}-${h.toString(36)}`;
}

export type ThumbnailState = "ready" | "stale" | "missing" | "unavailable";

/**
 * Estado do thumbnail do card:
 * - unavailable: projeto React ainda no bootstrap (o site real ainda não existe);
 * - ready: tem thumb e a assinatura bate com o código atual;
 * - stale: tem thumb, mas o código mudou depois (precisa atualizar);
 * - missing: nunca capturado.
 */
export function thumbnailState(project: SiteProjectRow, files?: Record<string, string> | null): ThumbnailState {
  const { thumbnail, thumbnailSig, codeSig } = thumbnailSettings(project);
  if (projectKindOf(project) === "react" && files && isBootstrapFiles(files)) return "unavailable";
  if (!thumbnail) return "missing";
  if (codeSig && thumbnailSig && codeSig === thumbnailSig) return "ready";
  return "stale";
}

/** Reduz uma captura (data URL) para um thumbnail leve (JPEG). */
export async function downscaleDataUrl(dataUrl: string, maxWidth = 720, quality = 0.72): Promise<string | null> {
  if (!dataUrl) return null;
  if (typeof document === "undefined" || typeof Image === "undefined") return dataUrl;
  return new Promise<string | null>((resolve) => {
    let settled = false;
    const done = (v: string | null) => { if (!settled) { settled = true; resolve(v); } };
    // Em ambientes sem decodificação de imagem (ex.: jsdom) o onload nunca dispara —
    // o timeout devolve a captura original (nunca trava a galeria).
    const timer = setTimeout(() => done(dataUrl), 1500);
    try {
      const img = new Image();
      img.onload = () => {
        clearTimeout(timer);
        try {
          const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
          const w = Math.max(1, Math.round(img.width * ratio));
          const h = Math.max(1, Math.round(img.height * ratio));
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) { done(dataUrl); return; }
          ctx.drawImage(img, 0, 0, w, h);
          done(canvas.toDataURL("image/jpeg", quality));
        } catch { done(dataUrl); }
      };
      img.onerror = () => { clearTimeout(timer); done(dataUrl); };
      img.src = dataUrl;
    } catch { clearTimeout(timer); done(dataUrl); }
  });
}

/** Captura a PRIMEIRA DOBRA real do site (desktop) e devolve um thumbnail leve. */
export async function captureSiteThumbnail(files: Record<string, string>): Promise<string | null> {
  try {
    const shots = await captureWorkspaceScreenshots(files);
    if (!shots.desktop) return null;
    return (await downscaleDataUrl(shots.desktop)) ?? shots.desktop;
  } catch {
    return null;
  }
}
