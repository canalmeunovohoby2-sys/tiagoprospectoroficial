// Cor de marca personalizável — aplicada globalmente via CSS custom properties
// (--brand-h/--brand-s/--brand-l) usadas por --primary/--ring/gradientes/sombras.
import { safeLocalStorage } from "@/lib/safeStorage";

export const DEFAULT_BRAND = "#ED2C2C"; // padrão do prospector (vermelho)

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let m = (hex || "").replace(/^#/, "").trim();
  if (m.length === 3) m = m.split("").map((c) => c + c).join("");
  if (m.length !== 6) return { h: 0, s: 84, l: 55 };
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Aplica a cor de marca no <html> (variáveis CSS) — vale para todo o app. */
export function applyBrandColor(hex: string) {
  if (typeof window === "undefined") return;
  const { h, s, l } = hexToHsl(hex);
  const root = document.documentElement;
  root.style.setProperty("--brand-h", String(h));
  root.style.setProperty("--brand-s", `${s}%`);
  root.style.setProperty("--brand-l", `${l}%`);
}

export function readBrandColor(): string {
  if (typeof window === "undefined") return DEFAULT_BRAND;
  return safeLocalStorage.getItem("lh-brand") || DEFAULT_BRAND;
}

export function setBrandColor(hex: string) {
  applyBrandColor(hex);
  try {
    const v = hex.trim().startsWith("#") ? hex.trim() : `#${hex.trim()}`;
    safeLocalStorage.setItem("lh-brand", v);
  } catch { /* best-effort */ }
}
