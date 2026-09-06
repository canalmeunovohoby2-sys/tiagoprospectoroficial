// Extrai paleta do SITE REAL (código renderizável) para o PDF — prioridade
// sobre o design_system quando o site implementa identidade própria.
interface Rgb { r: number; g: number; b: number }
function hexToRgb(hex: string): Rgb | null {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(n)) return null;
  const num = parseInt(n, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function sat({ r, g, b }: Rgb): number {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : ((mx - mn) / mx);
}
const NEUTRALS = new Set(["#ffffff", "#000000", "#f8fafc", "#fafafa", "#f3f4f6", "#e5e7eb", "#f1f5f9"]);

export function extractSitePalette(files: Record<string, string>): Partial<Record<string, string>> {
  const text = Object.values(files ?? {}).join("\n").toLowerCase();
  const matches = text.match(/#[0-9a-f]{3,8}\b/g) ?? [];
  const count = new Map<string, number>();
  for (const raw of matches) {
    const hex = raw.slice(0, 7);
    if (!hexToRgb(hex)) continue;
    count.set(hex, (count.get(hex) ?? 0) + 1);
  }
  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const colored = ranked.filter((c) => !NEUTRALS.has(c));
  const out: Partial<Record<string, string>> = {};
  if (colored[0]) out.primary = colored[0];
  if (colored[1] && colored[1] !== colored[0]) out.secondary = colored[1];
  const accent = [...colored].sort((a, b) => sat(hexToRgb(b)!) - sat(hexToRgb(a)!))[0];
  if (accent) out.accent = accent;
  return out;
}
