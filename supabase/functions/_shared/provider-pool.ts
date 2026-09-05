// Provider Key Pool — Tavily / Firecrawl
// Carrega até 8 secrets por provider (NOME_API_KEY_01..08), ignora ausentes e
// tenta sequencialmente (uma tentativa por chave, sem paralelismo) até o
// primeiro sucesso. Chaves nunca saem deste módulo em respostas/logs/erros.

export type PoolProviderName = "tavily" | "firecrawl";

export type PoolExecuteResult<T> =
  | { ok: true; value: T; statusCode?: number; resultCount?: number }
  | { ok: false; statusCode?: number; errorCode?: string };

export interface PoolSuccess<T> {
  ok: true;
  provider: PoolProviderName;
  keyIndex: string;
  value: T;
  attemptedKeys: string[];
  durationMs: number;
}

export interface PoolFailure {
  ok: false;
  provider: PoolProviderName;
  code: string;
  message: string;
  attemptedKeys: string[];
  durationMs: number;
}

export type PoolResult<T> = PoolSuccess<T> | PoolFailure;

const cooldown = new Map<string, number>(); // `${provider}:${keyIndex}` -> expiresAt
const DEFAULT_COOLDOWN_MS = 30_000;
const KEY_COUNT = 8;

function getEnv(key: string): string | undefined {
  const deno = (globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  return deno?.env?.get(key);
}

function cooldownTtlMs(): number {
  const raw = Number(getEnv("PROVIDER_KEY_COOLDOWN_MS") ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_COOLDOWN_MS;
}

function keyId(provider: PoolProviderName, index: string): string {
  return `${provider}:${index}`;
}

export function isKeyCooling(provider: PoolProviderName, index: string): boolean {
  const until = cooldown.get(keyId(provider, index)) ?? 0;
  return Date.now() < until;
}

function markCooldown(provider: PoolProviderName, index: string): void {
  cooldown.set(keyId(provider, index), Date.now() + cooldownTtlMs());
}

// Exclusivo para testes — reinicia o cooldown em memória.
export function clearKeyCooldowns(): void {
  cooldown.clear();
}

export interface PoolKeyEntry {
  index: string; // número da secret (ex.: "02")
  key: string;
}

// Carrega as chaves configuradas na ordem 01..08, ignorando secrets ausentes
// e preservando o índice original de cada uma.
export function loadProviderKeys(provider: PoolProviderName): PoolKeyEntry[] {
  const prefix = provider.toUpperCase();
  const entries: PoolKeyEntry[] = [];
  for (let i = 1; i <= KEY_COUNT; i++) {
    const index = String(i).padStart(2, "0");
    const value = getEnv(`${prefix}_API_KEY_${index}`);
    if (value && value.trim().length > 0) entries.push({ index, key: value.trim() });
  }
  return entries;
}

function logSummary(entry: {
  provider: PoolProviderName;
  keyIndex: string;
  status?: number;
  errorCode?: string;
  durationMs: number;
  resultCount?: number;
}): void {
  // Nunca inclui a chave nem headers/URLs com credenciais.
  console.info("[provider-pool]", {
    provider: entry.provider,
    keyIndex: entry.keyIndex,
    status: entry.status ?? null,
    errorCode: entry.errorCode ?? null,
    durationMs: Math.round(entry.durationMs),
    resultCount: entry.resultCount ?? null,
  });
}

/**
 * Executa `execute(apiKey)` com cada chave na ordem 01..08 (uma por vez).
 * Para no primeiro sucesso. Chaves em cooldown são puladas enquanto houver
 * outras disponíveis; se todas estiverem em cooldown, a ordem normal é usada
 * (o cooldown nunca impede a execução de todas as chaves).
 */
export async function runWithKeyPool<T>(opts: {
  provider: PoolProviderName;
  execute: (apiKey: string) => Promise<PoolExecuteResult<T>> | PoolExecuteResult<T>;
}): Promise<PoolResult<T>> {
  const { provider, execute } = opts;
  const entries = loadProviderKeys(provider);
  const startedAt = Date.now();

  if (entries.length === 0) {
    return {
      ok: false,
      provider,
      code: "NO_KEYS",
      message: `Nenhuma chave configurada para o provedor ${provider}.`,
      attemptedKeys: [],
      durationMs: Date.now() - startedAt,
    };
  }

  const available = entries.filter((entry) => !isKeyCooling(provider, entry.index));
  const order = available.length > 0 ? available : entries;

  const attemptedKeys: string[] = [];

  for (const entry of order) {
    const idx = entry.index;
    attemptedKeys.push(idx);
    const attemptStarted = Date.now();
    let result: PoolExecuteResult<T>;
    try {
      result = await execute(entry.key);
    } catch {
      result = { ok: false, errorCode: "NETWORK" };
    }
    const durationMs = Date.now() - attemptStarted;

    if (result.ok) {
      logSummary({ provider, keyIndex: idx, status: result.statusCode ?? 200, durationMs, resultCount: result.resultCount });
      return {
        ok: true,
        provider,
        keyIndex: idx,
        value: result.value,
        attemptedKeys,
        durationMs: Date.now() - startedAt,
      };
    }

    const failedResult = result as Extract<PoolExecuteResult<T>, { ok: false }>;
    logSummary({ provider, keyIndex: idx, status: failedResult.statusCode, errorCode: failedResult.errorCode, durationMs });
    markCooldown(provider, idx);
  }

  return {
    ok: false,
    provider,
    code: "ALL_KEYS_FAILED",
    message: `Todas as chaves configuradas do provedor ${provider} falharam.`,
    attemptedKeys,
    durationMs: Date.now() - startedAt,
  };
}
