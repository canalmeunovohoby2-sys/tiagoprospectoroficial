// Tavily Search — usa o Provider Key Pool (8 chaves, failover sequencial).
import type { PoolExecuteResult } from "../_shared/provider-pool.ts";
import { runWithKeyPool, type PoolFailure } from "../_shared/provider-pool.ts";

export interface NormalizedResult {
  title: string;
  url: string;
  description: string;
  content: null;
}

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const MAX_LIMIT = 20;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function runTavilySearch(query: string, limit: number): Promise<{
  provider: "tavily";
  keyIndex?: string;
  results: NormalizedResult[];
  error?: { code: string; message: string; attemptedKeys: string[] };
}> {
  const safeLimit = Math.max(1, Math.min(MAX_LIMIT, limit));

  const execute = async (apiKey: string): Promise<PoolExecuteResult<NormalizedResult[]>> => {
    try {
      const res = await fetch(TAVILY_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query, max_results: safeLimit, search_depth: "basic" }),
      });

      if (res.status !== 200) {
        return { ok: false, statusCode: res.status, errorCode: `HTTP_${res.status}` };
      }
      const data = await res.json().catch(() => null);
      if (!data || !Array.isArray((data as { results?: unknown }).results)) {
        return { ok: false, statusCode: 200, errorCode: "INVALID_RESPONSE" };
      }
      const results = (data as { results: Array<Record<string, unknown>> }).results
        .filter((item) => item && typeof item === "object" && typeof item.url === "string")
        .slice(0, safeLimit)
        .map((item) => ({
          title: str(item.title),
          url: str(item.url),
          description: str(item.content).slice(0, 600),
          content: null,
        }));
      return { ok: true, value: results, statusCode: 200, resultCount: results.length };
    } catch {
      return { ok: false, errorCode: "NETWORK" };
    }
  };

  const pool = await runWithKeyPool({ provider: "tavily", execute });
  if (!pool.ok) { const failure = pool as PoolFailure; return { provider: "tavily", results: [], error: { code: failure.code, message: failure.message, attemptedKeys: failure.attemptedKeys } }; }
  return { provider: "tavily", keyIndex: pool.keyIndex, results: pool.value };
}
