// ============================================================================
// FASE 2 — PESQUISA DE REFERÊNCIAS VISUAIS
//
// Usa as ferramentas de pesquisa JÁ EXISTENTES (Tavily/Firecrawl em research.ts)
// para encontrar 3-5 referências reais por projeto e registrar URL + princípio.
//
// Regras de honestidade:
// - Só devolve URLs que vieram da busca; nunca inventa referência.
// - Sem ferramenta/chave disponível → { researched: false } e a geração continua
//   com o repertório do modelo (sem citar URLs inexistentes).
// - Limite de 2 consultas e timeout por consulta (não atrasa a geração).
// - Cache por negócio (24h) para não repetir pesquisa desnecessária.
// ============================================================================

import type { BusinessContext } from "../../tools.js";
import { runSearchQuery, runFirecrawlSearch, researchEnabled, firecrawlEnabled } from "../../research.js";
import type { ArtReference } from "./art-direction.js";
import { hashString } from "./art-direction.js";

export interface VisualReferencesResult {
  references: ArtReference[];
  researched: boolean;
  note: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 50;
const cache = new Map<string, { result: VisualReferencesResult; at: number }>();

export function clearReferencesCache(): void {
  cache.clear();
}

const SKIP_HOST = /(facebook|instagram|youtube|wikipedia|google\.|bing\.|yelp|tripadvisor|linkedin|tiktok|pinterest)\./i;

function clean(s: unknown, max = 180): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

function queriesFor(business: BusinessContext, artHint: string): string[] {
  const seg = clean(business.segment ?? business.category ?? "negócio local", 60);
  const city = clean(business.city ?? "", 40);
  const hint = clean(artHint, 80);
  // 1ª consulta: contexto do negócio. 2ª consulta: linguagem visual (NÃO o nicho).
  return [
    `${seg} ${city} site profissional design referência`.replace(/\s+/g, " ").trim(),
    `web design studio portfolio ${hint || "editorial institucional"} site`.replace(/\s+/g, " ").trim(),
  ];
}

function toRefs(results: unknown[]): ArtReference[] {
  const out: ArtReference[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    const o = r as { url?: unknown; title?: unknown; snippet?: unknown; content?: unknown };
    const url = clean(o?.url, 500);
    if (!/^https?:\/\//i.test(url) || SKIP_HOST.test(url)) continue;
    const base = url.replace(/[#?].*$/, "");
    if (seen.has(base)) continue;
    seen.add(base);
    const principle = clean(o?.snippet ?? o?.content ?? o?.title, 180);
    if (!principle) continue;
    out.push({ url: base, source: "busca web", principle });
  }
  return out;
}

export async function findVisualReferences(opts: {
  business: BusinessContext;
  /** Pista de posicionamento/linguagem (ex.: trecho do pedido do usuário). */
  artHint?: string;
  max?: number;
  timeoutMs?: number;
  fresh?: boolean;
  now?: () => number;
}): Promise<VisualReferencesResult> {
  const b = opts.business;
  const max = Math.max(3, Math.min(opts.max ?? 5, 5));
  const timeoutMs = Math.max(3_000, Math.min(opts.timeoutMs ?? 8_000, 15_000));
  const key = [b.name ?? "", b.segment ?? "", b.category ?? "", b.city ?? "", clean(opts.artHint, 60)]
    .join("::").toLowerCase();
  const now = opts.now ? opts.now() : Date.now();

  if (!opts.fresh) {
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) return hit.result;
  }

  const tavily = researchEnabled();
  const firecrawl = firecrawlEnabled();
  if (!tavily && !firecrawl) {
    const result: VisualReferencesResult = {
      references: [],
      researched: false,
      note: "pesquisa web indisponível (sem chave) — repertório do modelo, sem URLs inventadas",
    };
    cache.set(key, { result, at: now });
    return result;
  }

  const queries = queriesFor(b, opts.artHint ?? "");
  const collected: unknown[] = [];
  let attempts = 0;
  let okAny = false;

  for (const q of queries) {
    if (collected.length >= max || attempts >= 2) break;
    attempts++;
    const run = tavily
      ? withTimeout(runSearchQuery(q, 6), timeoutMs, { ok: false, results: [] as Array<{ title: string; url: string; description: string }> })
      : withTimeout(runFirecrawlSearch(q, 6), timeoutMs, { ok: false, results: [] as Array<{ title: string; url: string; description: string }> });
    const res = await run;
    if (res?.ok) okAny = true;
    for (const r of (res?.results ?? []) as unknown[]) collected.push(r);
    if (!okAny && !tavily) break;
  }

  const references = toRefs(collected).slice(0, max);
  const result: VisualReferencesResult = {
    references,
    researched: references.length > 0,
    note: references.length
      ? `${references.length} referência(s) real(is) consultada(s) — princípios extraídos dos resumos da busca`
      : okAny
        ? "busca executou, mas nenhum resultado utilizável foi retornado"
        : "busca indisponível nesta execução",
  };
  if (result.references.length === 0) result.researched = false;

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { result, at: now });
  return result;
}

/** Chave estável para testes/caches externos. */
export function referencesKey(b: BusinessContext, artHint = ""): string {
  return `${hashString([b.name, b.segment, b.city, artHint].join("::").toLowerCase())}`;
}
