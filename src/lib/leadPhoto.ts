// URL da foto real do estabelecimento via Edge Function proxy (place-photo).
// A API key do Google fica apenas no servidor; aqui só montamos a URL pública.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

/**
 * Monta a URL da foto do Google Places para um lead.
 * Retorna null quando não há foto — a UI deve mostrar o estado "sem imagem".
 */
export function leadPhotoUrl(photoName: string | null | undefined, width = 640): string | null {
  const name = (photoName ?? "").trim();
  if (!name || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/functions/v1/place-photo?name=${encodeURIComponent(name)}&w=${width}`;
}
