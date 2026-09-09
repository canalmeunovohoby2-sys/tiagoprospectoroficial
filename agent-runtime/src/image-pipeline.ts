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

// Adapter REAL: reutiliza o mecanismo de pesquisa existente (runSearchQuery),
// que devolve páginas/texto (pode NÃO conter URLs de imagem). Sem fabricar URL.
export const defaultImageSearch: ImageSearchFn = async (q) => {
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
    rejected: c.rejected || used.has(c.url),
    rejectionReason: used.has(c.url) ? "URL já utilizada no projeto" : c.rejectionReason,
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
  return { candidate: best, rejectedCount: cands.length - valid.length, reason: best.reason, needsFallback: best.relevance < 0.25 };
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
