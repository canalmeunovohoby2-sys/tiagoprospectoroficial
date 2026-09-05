// Firecrawl Search â€” usa o Provider Key Pool (8 chaves, failover sequencial).
import type { PoolExecuteResult } from "../_shared/provider-pool.ts";
import { runWithKeyPool, type PoolFailure } from "../_shared/provider-pool.ts";

export interface NormalizedResult {
  title: string;
  url: string;
  description: string;
  content: null;
}

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/search";
const MAX_LIMIT = 20;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function runFirecrawlSearch(query: string, limit: number): Promise<{
  provider: "firecrawl";
  keyIndex?: string;
  results: NormalizedResult[];
  error?: { code: string; message: string; attemptedKeys: string[] };
}> {
  const safeLimit = Math.max(1, Math.min(MAX_LIMIT, limit));

  const execute = async (apiKey: string): Promise<PoolExecuteResult<NormalizedResult[]>> => {
    try {
      const res = await fetch(FIRECRAWL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query, limit: safeLimit }),
      });

      if (res.status !== 200) {
        return { ok: false, statusCode: res.status, errorCode: `HTTP_${res.status}` };
      }
      const data = await res.json().catch(() => null);
      if (!data || typeof data !== "object" || !Array.isArray((data as { data?: unknown }).data)) {
        return { ok: false, statusCode: 200, errorCode: "INVALID_RESPONSE" };
      }
      const results = (data as { data: Array<Record<string, unknown>> }).data
        .filter((item) => item && typeof item === "object" && typeof item.url === "string")
        .slice(0, safeLimit)
        .map((item) => ({
          title: str(item.title),
          url: str(item.url),
          description: str(item.description).slice(0, 600),
          content: null,
        }));
      return { ok: true, value: results, statusCode: 200, resultCount: results.length };
    } catch {
      return { ok: false, errorCode: "NETWORK" };
    }
  };

  const pool = await runWithKeyPool({ provider: "firecrawl", execute });
  if (!pool.ok) { const failure = pool as PoolFailure; return { provider: "firecrawl", results: [], error: { code: failure.code, message: failure.message, attemptedKeys: failure.attemptedKeys } }; }
  return { provider: "firecrawl", keyIndex: pool.keyIndex, results: pool.value };
}

// Abre uma página (scrape) e devolve o conteúdo em texto/markdown.
export async function runFirecrawlScrape(url: string): Promise<{
  provider: "firecrawl";
  kind: "scrape";
  keyIndex?: string;
  content: string | null;
  error?: { code: string; message: string; attemptedKeys: string[] };
}> {
  const execute = async (apiKey: string): Promise<PoolExecuteResult<string>> => {
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      });
      if (res.status !== 200) {
        return { ok: false, statusCode: res.status, errorCode: `HTTP_${res.status}` };
      }
      const data = await res.json().catch(() => null);
      if (!data || typeof data !== "object") {
        return { ok: false, statusCode: 200, errorCode: "INVALID_RESPONSE" };
      }
      const raw = data as Record<string, unknown>;
      const item = raw.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : raw;
      const md = typeof item.markdown === "string" ? item.markdown : typeof item.content === "string" ? item.content : "";
      if (!md || md.trim().length < 40) {
        return { ok: false, statusCode: 200, errorCode: "EMPTY_CONTENT" };
      }
      return { ok: true, value: md, statusCode: 200 };
    } catch {
      return { ok: false, errorCode: "NETWORK" };
    }
  };

  const pool = await runWithKeyPool({ provider: "firecrawl", execute });
  if (!pool.ok) {
    const failure = pool as PoolFailure;
    return { provider: "firecrawl", kind: "scrape", content: null, error: { code: failure.code, message: failure.message, attemptedKeys: failure.attemptedKeys } };
  }
  return { provider: "firecrawl", kind: "scrape", keyIndex: pool.keyIndex, content: pool.value };
}
