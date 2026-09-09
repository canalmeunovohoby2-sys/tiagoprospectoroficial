// Branding persist (6.3) — lógica PURA de merge/persistência dos arquivos do
// Branding em site_projects.generated_code, sem apagar arquivos não relacionados.
// Testável sem Supabase. A fonte de verdade permanece site_projects.generated_code;
// brand-state.json + assets/brand/*.svg são o estado derivado.
import type { BrandSnapshotLike } from "@/lib/brandingView";

export const BRAND_STATE_FILE = "brand-state.json";
export const BRAND_ASSET_PREFIX = "assets/brand/";

export function isBrandFile(path: string): boolean {
  const p = String(path ?? "");
  return p === BRAND_STATE_FILE || p.startsWith(BRAND_ASSET_PREFIX);
}

/** Faz merge SEGURO: sobrescreve apenas arquivos do Branding, preserva o resto. */
export function mergeBrandFiles(current: Record<string, unknown>, incoming: Record<string, string>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  for (const [path, content] of Object.entries(incoming ?? {})) {
    if (isBrandFile(path) && typeof content === "string") next[path] = content;
  }
  return next;
}

/** Extrai o snapshot de branding a partir do mapa de arquivos (estado persistido). */
export function extractBrandSnapshot(files: Record<string, unknown>): BrandSnapshotLike | null {
  const raw = files?.[BRAND_STATE_FILE];
  if (!raw || typeof raw !== "string") return null;
  try {
    const base = JSON.parse(raw) as BrandSnapshotLike;
    const variants: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
      const m = /^assets\/brand\/(.+)\.svg$/.exec(path);
      if (m && typeof content === "string") variants[m[1]] = content;
    }
    return { ...base, variants: { ...(base.variants ?? {}), ...variants } };
  } catch {
    return null;
  }
}

/** Valida que os arquivos retornados pelo /run realmente contêm o estado de branding. */
export function hasBrandState(files: Record<string, unknown>): boolean {
  return extractBrandSnapshot(files) !== null;
}
