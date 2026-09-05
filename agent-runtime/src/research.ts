// Research (5.26) — pesquisa web de referência para direção criativa contextual.
// O Cline/agente usa web_search quando agregar valor (tendências do segmento,
// referências de sites premium, técnicas de UI). Resultados são REFERÊNCIA —
// nunca para copiar layout/site de terceiros.
//
// Chaves lidas do ambiente: TAVILY_API_KEY_01..08 ou TAVILY_API_KEY (falha
// honesta se nenhuma estiver configurada — o agente continua sem pesquisa).

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

function envKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const k = process.env[`TAVILY_API_KEY_${String(i).padStart(2, "0")}`] ?? process.env[`TAVILY_API_KEY_${i}`];
    if (k && !keys.includes(k)) keys.push(k);
  }
  const single = process.env.TAVILY_API_KEY;
  if (single && !keys.includes(single)) keys.push(single);
  return keys;
}

/** Indica se há alguma chave de pesquisa configurada nesta instância. */
export function researchEnabled(): boolean {
  return envKeys().length > 0;
}

export interface ResearchSnippet {
  query: string;
  results: Array<{ title: string; url: string; description: string }>;
}

export interface ResearchOutcome {
  ok: boolean;
  snippets: ResearchSnippet[];
  error?: string;
}

export function buildResearchQueries(businessName: string, segment: string, city?: string | null): string[] {
  const name = businessName || segment || "negócio";
  const place = city ? ` ${city}` : "";
  const seg = segment || "negócio local";
  return [
    `melhores sites de ${seg}${place} referência visual 2026`,
    `tendências de design para ${seg} 2026 ${name}`,
    `site premium ${seg}${place} exemplo`,
  ].slice(0, 2);
}

// Executa UMA busca com failover pelas chaves. Nunca lança.
export async function runSearchQuery(query: string, maxResults = 5): Promise<{ ok: boolean; results: ResearchSnippet["results"]; error?: string }> {
  const keys = envKeys();
  if (keys.length === 0) {
    return { ok: false, results: [], error: "web_search indisponível (nenhuma chave de pesquisa configurada nesta instância)." };
  }
  if (!query.trim()) return { ok: false, results: [], error: "query vazia" };
  const limit = Math.max(1, Math.min(6, maxResults));
  let lastError = "";
  for (const key of keys) {
    try {
      const res = await fetch(TAVILY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ query: query.slice(0, 400), max_results: limit, search_depth: "basic" }),
        signal: AbortSignal.timeout(12_000),
      });
      if (res.status !== 200) { lastError = `HTTP ${res.status}`; continue; }
      const data = (await res.json().catch(() => null)) as { results?: Array<{ title?: string; url?: string; content?: string }> } | null;
      if (!data || !Array.isArray(data.results)) { lastError = "resposta inválida"; continue; }
      const results = data.results
        .filter((r) => typeof r?.url === "string")
        .slice(0, limit)
        .map((r) => ({
          title: String(r.title ?? "").slice(0, 160),
          url: String(r.url ?? "").slice(0, 300),
          description: String(r.content ?? "").slice(0, 600),
        }));
      if (results.length) return { ok: true, results };
      lastError = "sem resultados";
    } catch (e) {
      lastError = e instanceof Error ? e.message : "erro de rede";
    }
  }
  return { ok: false, results: [], error: lastError || "sem resultados" };
}

// Executa as pesquisas (best-effort, com timeout). Nunca lança.
export async function researchBusiness(opts: {
  businessName?: string | null;
  segment?: string | null;
  city?: string | null;
  maxResults?: number;
}): Promise<ResearchOutcome> {
  if (envKeys().length === 0) {
    return { ok: false, snippets: [], error: "web_search indisponível (nenhuma chave de pesquisa configurada nesta instância)." };
  }
  const queries = buildResearchQueries(opts.businessName ?? "", opts.segment ?? "", opts.city ?? null);
  const maxResults = Math.max(1, Math.min(6, opts.maxResults ?? 5));
  const snippets: ResearchSnippet[] = [];
  let lastError = "";
  for (const query of queries) {
    const r = await runSearchQuery(query, maxResults);
    if (r.ok) snippets.push({ query, results: r.results });
    else lastError = r.error ?? lastError;
  }
  if (snippets.length === 0) {
    return { ok: false, snippets: [], error: `pesquisa falhou (${lastError || "sem resultados"})` };
  }
  return { ok: true, snippets };
}

// Texto curto para injetar na missão (limite de caracteres p/ não inflar o contexto).
export function formatResearch(research: ResearchOutcome, maxChars = 2600): string {
  if (!research.ok || research.snippets.length === 0) return "";
  const lines: string[] = [];
  for (const s of research.snippets.slice(0, 2)) {
    lines.push(`Queries: "${s.query}"`);
    for (const r of s.results.slice(0, 4)) {
      lines.push(`- ${r.title || r.url}`);
      if (r.description) lines.push(`  ${r.description.slice(0, 200)}`);
    }
  }
  const body = lines.join("\n");
  return body.length > maxChars ? body.slice(0, maxChars) + "\n…(pesquisa truncada)" : body;
}
