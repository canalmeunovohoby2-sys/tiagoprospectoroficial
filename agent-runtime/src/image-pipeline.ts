// Image Pipeline (6.0) — transforma ImageIntent em pesquisa real, extrai e
// SELECIONA candidatos de imagem de forma racional/auditável, evitando repetição.
// Reutiliza o mecanismo de pesquisa existente (adapter injetável → determinístico
// nos testes; real usa web_search/runSearchQuery). NUNCA fabrica URL. NUNCA usa
// Gemini como fallback. Puro e testável.
import { buildImageIntent, intentToQuery, heroQueries, type ImageIntent, type ImageProjectContext } from "./image-intent.js";
import { runSearchQuery } from "./research.js";

export interface ImageSearchResult {
  url?: string;
  title?: string;
  description?: string;
}

export interface ImageCandidate {
  url: string;
  source: string;
  title: string;
  description: string;
  query: string;
  relevance: number;      // 0..1 aderência ao intent (heurístico)
  reason: string;         // por que foi escolhido
  rejected: boolean;
  rejectionReason?: string;
}

export type ImageSearchFn = (query: string) => Promise<ImageSearchResult[]>;

// ===== PESQUISA DE IMAGEM REAL =====
// Auditoria forense: o caminho antigo era busca WEB textual + regex "a URL parece
// imagem?" — não é pesquisa de imagens e era a causa de "foto sem relação com o
// segmento". Agora o caminho PRINCIPAL é o mecanismo real já existente no projeto:
// Supabase Edge `get-images` → Pexels (URLs diretas do CDN + alt real para relevância).
// O web search continua apenas como FALLBACK (nunca inventa URL).
function imageEnv(): { url?: string; key?: string } {
  return {
    url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    key:
      process.env.SUPABASE_ANON_KEY ??
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      process.env.VITE_SUPABASE_ANON_KEY ??
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

type AssetLike = Record<string, unknown>;
const primeiroTexto = (a: AssetLike, chaves: string[]): string => {
  for (const k of chaves) {
    const v = a[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

/** Extrai a URL real do asset (aceita os formatos usados pelo normalizeImageList). */
export function assetToResult(a: AssetLike): ImageSearchResult | null {
  const url = primeiroTexto(a, ["url", "imageUrl", "src", "srcLarge", "large", "regular", "original", "srcOriginal"]);
  if (!/^https?:\/\//i.test(url)) return null;
  const alt = primeiroTexto(a, ["alt", "description", "title", "name"]);
  const autor = primeiroTexto(a, ["photographer", "author", "credit"]);
  return { url, title: alt || autor, description: [alt, autor].filter(Boolean).join(" · ") };
}

/** Busca real de imagens pelo mecanismo do projeto (get-images → Pexels). */
export async function searchImagesViaEdge(query: string, count = 6, orientation?: "landscape" | "portrait" | "square"): Promise<ImageSearchResult[]> {
  const { url, key } = imageEnv();
  if (!url) return [];
  const res = await fetch(`${url.replace(/\/+$/, "")}/functions/v1/get-images`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { apikey: key, Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ query: query.slice(0, 120), count: Math.max(1, Math.min(30, count)), ...(orientation ? { orientation } : {}) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as { assets?: AssetLike[] } | null;
  const assets = Array.isArray(json?.assets) ? json!.assets : [];
  return assets.map(assetToResult).filter((r): r is ImageSearchResult => Boolean(r));
}

/** Valida que a URL responde de verdade como imagem (HTTP 200 + content-type image/*). */
export async function validateImageUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-2047" }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return false;
    const tipo = String(res.headers.get("content-type") ?? "").toLowerCase();
    return tipo.startsWith("image/");
  } catch {
    return false;
  }
}

// ===== CURADORIA DETERMINÍSTICA (rodada "imagens curadas") =====
// A escolha final NÃO pode depender só do ranking textual: candidatos claramente
// fora do contexto (ex.: "soldier/military" num site de energia solar) são barrados
// por uma barreira OBJETIVA de metadados; termos do vertical elevam a prioridade.
const FORA_DE_CONTEXTO = /(soldier|military|war\b|weapon|gun\b|army|troop|battle|rifle|missile|bomb|tank\b|sniper|soldado|militar|guerra|arma\b|ex[ée]rcito|tiro)/i;

/** Sinais de relevância do nicho (segmento + palavras do vertical), sem "if por segmento". */
export function nicheSignals(ctx: ImageProjectContext): string[] {
  const base = `${ctx?.segment ?? ""} ${ctx?.positioning ?? ""} ${ctx?.architecture ?? ""}`
    .toLowerCase()
    .split(/[^a-zà-ú0-9]+/)
    .filter((w) => w.length >= 4);
  const extras: Record<string, string[]> = {
    "energia solar": ["solar", "panel", "photovoltaic", "photovolta", "install", "inverter", "rooftop", "renewable"],
    academia: ["fitness", "gym", "training", "workout", "weights", "exercise", "treino"],
    saude: ["clinic", "consult", "health", "care", "patient"],
    restaurante: ["food", "dish", "kitchen", "restaurant", "meal"],
    odontologia: ["dental", "dentist", "teeth", "clinic"],
    usinagem: ["cnc", "machining", "metal", "lathe", "factory", "industrial"],
  };
  const chave = Object.keys(extras).find((k) => String(ctx?.segment ?? "").toLowerCase().includes(k));
  return Array.from(new Set([...base, ...(chave ? extras[chave] : [])]));
}

/** Rejeita candidato cujo metadado é claramente fora do contexto comercial. */
export function foraDoContexto(c: ImageCandidate): boolean {
  return FORA_DE_CONTEXTO.test(`${c.title} ${c.description} ${c.url}`);
}

/** Ordena por relevância ao nicho (forte > parcial > sem relação) sem falso negativo. */
export function rankCurated(cands: ImageCandidate[], ctx: ImageProjectContext): ImageCandidate[] {
  const sinais = nicheSignals(ctx);
  const pontos = (c: ImageCandidate): number => {
    const t = `${c.title} ${c.description}`.toLowerCase();
    return sinais.reduce((acc, s) => acc + (t.includes(s) ? 1 : 0), 0);
  };
  return cands
    .filter((c) => !foraDoContexto(c))
    .map((c) => ({ ...c, relevance: Math.min(1, c.relevance * 0.4 + Math.min(1, pontos(c) / 3) * 0.6) }))
    .sort((a, b) => b.relevance - a.relevance);
}

/** Bloco com os candidatos JÁ CURADOS para o modelo (evita lista indiscriminada). */
export function formatCuratedImages(role: string, cands: ImageCandidate[], ctx: ImageProjectContext = {} as ImageProjectContext): string {
  const top = rankCurated(cands, ctx).slice(0, 4);
  if (top.length === 0) return `IMAGENS CURADAS (${role}): nenhuma adequada — componha sem imagem em vez de usar uma imagem errada.`;
  return [
    `IMAGENS CURADAS PARA ESTA SEÇÃO (${role}) — use UMA destas (URL + alt), nunca outra fonte para imagem de apresentação:`,
    ...top.map((c, i) => `  ${i + 1}. ${c.url}\n     alt: ${c.title || c.description || role}`),
  ].join("\n");
}

export const defaultImageSearch: ImageSearchFn = async (q) => {
  // 1) MECANISMO REAL (Pexels via edge get-images)
  try {
    const reais = await searchImagesViaEdge(q, 6);
    if (reais.length > 0) return reais;
  } catch {
    /* segue para o fallback */
  }
  // 2) FALLBACK: mecanismo de pesquisa existente (web) — sem fabricar URL.
  const r = await runSearchQuery(q, 6).catch(() => ({ ok: false, results: [] as ImageSearchResult[], error: "indisponível" }));
  return (r.ok ? r.results : []).map((x) => ({ url: x.url, title: x.title, description: x.description })) as ImageSearchResult[];
};

// Regex para dizer se uma URL "parece imagem" (heurística simples, sem banco).
const IMAGE_URL = /unsplash\.com|images\.unsplash|pexels\.com|\.(jpe?g|png|webp|avif)(\?|$)|source\.unsplash|picsum|i\.imgur/i;
const CLEAR_IMAGE = /\.(jpe?g|png|webp|avif)(\?|$)/i;

export function looksLikeImage(url: string): boolean {
  return IMAGE_URL.test(url) || CLEAR_IMAGE.test(url);
}

/** Extrai candidatos de imagem de resultados de pesquisa (sem fabricar URLs). */
export function extractImageCandidates(results: ImageSearchResult[], query: string): ImageCandidate[] {
  const cands: ImageCandidate[] = [];
  for (const r of results ?? []) {
    const url = String(r?.url ?? "").trim();
    if (!url) continue;
    const title = String(r?.title ?? "").trim();
    const description = String(r?.description ?? "").trim();
    // URL claramente de imagem (favicon/ícone/logo do site não serve).
    if (!looksLikeImage(url)) continue;
    if (/favicon|logo\.svg|apple-touch|icon\.png/i.test(url)) continue;
    cands.push({
      url, source: new URL(url, "https://imagem.invalid").hostname || "search",
      title, description, query, relevance: 0, reason: "", rejected: false,
    });
  }
  return cands;
}

function weightOf(text: string, terms: string[]): number {
  if (!terms.length) return 0;
  const t = text.toLowerCase();
  let hits = 0;
  for (const term of terms) if (t.includes(term.toLowerCase())) hits++;
  return hits / terms.length;
}

/** Heurística simples de aderência ao intent (não é um sistema rígido). */
export function scoreCandidate(c: ImageCandidate, intent: ImageIntent): number {
  const terms = [intent.subject, intent.mood, intent.treatment, intent.role].filter(Boolean);
  const text = `${c.title} ${c.description}`;
  const bw = weightOf(text, terms);
  const hasSubject = weightOf(c.description, intent.subject.split(" ").filter((w) => w.length > 2)) + weightOf(c.title, intent.subject.split(" ").filter((w) => w.length > 2));
  return Math.min(1, bw * 0.6 + hasSubject * 0.4);
}

export interface CandidateSelection {
  candidate: ImageCandidate | null;
  rejectedCount: number;
  reason: string;
  /** true quando todos os candidatos foram ruins → o chamador deve buscar com query alternativa. */
  needsFallback: boolean;
}

/** Seleciona o melhor candidato não-rejeitado (ou indica fallback). */
export function selectImageCandidate(opts: {
  candidates: ImageCandidate[];
  intent: ImageIntent;
  usedUrls?: Set<string>;
}): CandidateSelection {
  const used = opts.usedUrls ?? new Set<string>();
  const cands = (opts.candidates ?? []).map((c) => ({
    ...c,
    rejected: c.rejected || used.has(c.url) || foraDoContexto(c),
    rejectionReason: used.has(c.url) ? "URL já utilizada no projeto" : foraDoContexto(c) ? "metadado fora do contexto comercial" : c.rejectionReason,
    relevance: c.relevance || scoreCandidate(c, opts.intent),
  }));
  const valid = cands.filter((c) => !c.rejected);
  if (valid.length === 0) {
    return {
      candidate: null,
      rejectedCount: cands.length,
      reason: "Nenhum candidato de imagem adequado/novo. Pesquise com uma query alternativa (heroQueries) ou informe honestamente a ausência de candidato verificável.",
      needsFallback: true,
    };
  }
  const best = [...valid].sort((a, b) => b.relevance - a.relevance)[0];
  best.reason = `relevance ${best.relevance.toFixed(2)} · adere a "${best.query}" | subjects/mood do intent`;
  if (best.relevance < 0.25) { return { candidate: null, rejectedCount: cands.length - valid.length, reason: "Nenhum candidato com relevancia minima segura - buscar query alternativa ou compor sem imagem.", needsFallback: true }; }
  return { candidate: best, rejectedCount: cands.length - valid.length, reason: best.reason, needsFallback: false };
}

/** Pipeline determinístico de pesquisa de imagem (intent → query → search → select). */
export async function planImage(
  ctx: ImageProjectContext,
  role: "hero" | "service" | "product" | "editorial" | "background" | "detail" | "testimonial" | "location",
  search: ImageSearchFn,
  usedUrls: Set<string>,
): Promise<{ intent: ImageIntent; query: string; queries: string[]; candidates: ImageCandidate[]; selection: CandidateSelection }> {
  const intent = buildImageIntent(ctx, role);
  const queries = role === "hero" ? heroQueries(intent, ctx) : [intentToQuery(intent, ctx)];
  let candidates: ImageCandidate[] = [];
  let selection: CandidateSelection = { candidate: null, rejectedCount: 0, reason: "", needsFallback: true };
  for (const q of queries) {
    const results = await search(q).catch(() => []);
    const cands = extractImageCandidates(results, q);
    candidates = [...candidates, ...cands];
    selection = selectImageCandidate({ candidates, intent, usedUrls });
    if (!selection.needsFallback) break;
  }
  return { intent, query: queries[0] ?? "", queries, candidates, selection };
}
