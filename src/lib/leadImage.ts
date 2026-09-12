export type LeadImageResolution = { url: string | null; hasImage: boolean };

/**
 * Resolve a imagem real do lead (guardada em `photo_name`).
 * Aceita apenas http/https, prioriza HTTPS e nunca inventa imagem:
 * sem URL válida → { url: null, hasImage: false } (a UI mostra "Sem imagem").
 */
export function resolveLeadImage(photoName: unknown): LeadImageResolution {
  if (typeof photoName !== "string") return { url: null, hasImage: false };
  const raw = photoName.trim();
  if (!raw) return { url: null, hasImage: false };
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { url: null, hasImage: false };
    }
    if (u.protocol === "http:") u.protocol = "https:";
    return { url: u.toString(), hasImage: true };
  } catch {
    return { url: null, hasImage: false };
  }
}
