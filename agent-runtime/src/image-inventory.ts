// Image Inventory (6.0) — inventário DAS imagens já usadas no projeto (extraído dos
// arquivos reais) + detecção de repetição, para que o agente NÃO reutilize a mesma
// URL/semelhantes sem justificativa. Puro e testável. Não usa banco — deriva dos
// arquivos do workspace (estado real), como pedido.

export interface ImageRecord {
  url: string;
  localPath?: string;
  alt?: string;
  /** contexto bruto de onde apareceu (html/css) para localizar a seção. */
  source?: string;
}

/** Extrai imagens reais dos arquivos (index.html com <img>, css com url(...)). */
export function collectImageInventory(files: Record<string, string>): ImageRecord[] {
  const recs: ImageRecord[] = [];
  for (const [path, content] of Object.entries(files ?? {})) {
    const text = String(content ?? "");
    const isCss = /\.(css)$/i.test(path);
    if (/\.(html|css)$/i.test(path)) {
      // <img src="..." alt="...">
      for (const m of text.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)) {
        const tag = m[0];
        const url = m[1];
        if (!url || /^data:/i.test(url)) continue;
        const alt = /alt=["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
        recs.push({ url, alt, source: path });
      }
      // background url(...) no CSS/HTML
      for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
        const url = m[1]?.trim();
        if (!url || /^data:/i.test(url)) continue;
        recs.push({ url, source: path });
      }
    }
    // assets locais referenciados em qualquer arquivo
    for (const m of text.matchAll(/["'](\.\/)?(assets\/[^"']+)["']/gi)) {
      const local = m[2];
      if (local) recs.push({ url: local, localPath: local, source: path });
    }
  }
  return recs;
}

export function countByUrl(records: ImageRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of records) out[r.url] = (out[r.url] ?? 0) + 1;
  return out;
}

/** Há alguma URL repetida sem justificativa (mais de 1x)? */
export function repeatedUrls(records: ImageRecord[]): string[] {
  const c = countByUrl(records);
  return Object.entries(c).filter(([, n]) => n > 1).map(([u]) => u);
}

/** Aviso de repetição/baixa variedade para o agente (honesto, sem inventar). */
export function suggestImageDiversity(records: ImageRecord[]): string | null {
  const distinct = new Set(records.map((r) => r.url)).size;
  if (records.length >= 4 && distinct < 3) {
    return `Pouca variedade de imagens (${records.length} usos, só ${distinct} URLs distintas). Não repita a mesma foto; diversifique (enquadramento/temática) conforme a direção criativa.`;
  }
  const rep = repeatedUrls(records);
  if (rep.length) {
    return `Imagens repetidas no projeto: ${rep.map((u) => u.slice(0, 60)).join(", ")}. Evite usar a mesma URL em mais de uma seção sem justificativa.`;
  }
  return null;
}

/** Imagens já usadas (URLs) para evitar repetição ao adicionar nova. */
export function usedUrls(records: ImageRecord[]): Set<string> {
  return new Set(records.map((r) => r.url));
}
