// URL da imagem do lead — 100% gratuita (Wikimedia ou imagem do próprio site
// oficial, já resolvidas no backend e persistidas em `photo_name` como URL).
// Sem Google Photos/Places: se não houver URL http válida, retorna null e a UI
// mostra "Sem imagem".
export function leadPhotoUrl(photoName: string | null | undefined): string | null {
  const name = (photoName ?? "").trim();
  if (!name) return null;
  return /^https?:\/\//i.test(name) ? name : null;
}
