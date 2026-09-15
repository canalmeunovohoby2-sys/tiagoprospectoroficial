// IMAGENS NO PREVIEW (WebContainer) — inlining SOMENTE na projeção.
//
// Por que: o preview roda no WebContainer e algumas imagens externas não carregam
// ali (política/isolamento/CORS/hotlink), embora funcionem no site publicado.
// Solução: baixar a imagem UMA vez no front e trocar a URL por `data:` URIs
// APENAS nos arquivos enviados ao WebContainer. Nada é persistido, o publicado
// mantém as URLs originais (que já funcionam) e nunca usamos placeholder.
//
// Best-effort: qualquer falha mantém a URL original (nunca piora o preview).

const IMG_URL = /https?:\/\/[^\s"'`()<>\\]+\.(?:png|jpe?g|webp|gif|avif|svg)(?:\?[^\s"'`()<>\\]*)?/gi;
const PROXY_IMG = /https?:\/\/[^\s"'`()<>\\]*(?:googleusercontent|gps-cs-s|places\/|pexels|unsplash)[^\s"'`()<>\\]*/gi;

export interface InlineResult {
  files: Record<string, string>;
  inlined: number;
  failed: number;
  bytes: number;
}

function collectUrls(files: Record<string, string>, limit: number): string[] {
  const found = new Set<string>();
  for (const [path, content] of Object.entries(files)) {
    if (!/\.(tsx|jsx|ts|js|css|html?|json|md)$/i.test(path) || typeof content !== "string") continue;
    for (const re of [IMG_URL, PROXY_IMG]) {
      for (const m of content.matchAll(re)) {
        const url = m[0];
        if (url.startsWith("data:")) continue;
        if (/localhost|127\.0\.0\.1|webcontainer/i.test(url)) continue;
        found.add(url);
        if (found.size >= limit) return [...found];
      }
    }
  }
  return [...found];
}

async function toDataUrl(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow", ...(typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? { signal: AbortSignal.timeout(timeoutMs) } : {}) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!type.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0) return null;
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(buf).toString("base64");
    return `data:${type};base64,${b64}`;
  } catch {
    return null;
  }
}

/**
 * Baixa as imagens referenciadas e substitui as URLs por `data:image/...` nos
 * arquivos da PROJEÇÃO (preview). Retorna os arquivos (possivelmente iguais).
 */
export async function inlineRemoteImagesInFiles(
  files: Record<string, string>,
  opts?: { maxImages?: number; maxBytes?: number; timeoutMs?: number },
): Promise<InlineResult> {
  const maxImages = opts?.maxImages ?? 12;
  const maxBytes = opts?.maxBytes ?? 2_500_000;
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const urls = collectUrls(files, maxImages);
  if (urls.length === 0) return { files, inlined: 0, failed: 0, bytes: 0 };

  const map = new Map<string, string>();
  let failed = 0;
  let bytes = 0;
  await Promise.all(urls.map(async (u) => {
    const data = await toDataUrl(u, timeoutMs);
    if (!data) { failed += 1; return; }
    bytes += data.length;
    if (bytes > maxBytes) { failed += 1; return; }   // teto de peso: mantém a URL
    map.set(u, data);
  }));
  if (map.size === 0) return { files, inlined: 0, failed, bytes: 0 };

  const out: Record<string, string> = {};
  let inlined = 0;
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== "string") { out[path] = content; continue; }
    let next = content;
    for (const [url, data] of map) {
      if (!next.includes(url)) continue;
      next = next.split(url).join(data);
      inlined += 1;
    }
    out[path] = next;
  }
  return { files: out, inlined, failed, bytes };
}
