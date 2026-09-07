// AI Health Check — diagnóstico sanitizado dos providers do AI Gateway.
// Nunca retorna chaves/secrets/prompts. Testa apenas o provider ativo.
import { AIProviderConfigurationError, DEFAULT_PROVIDER } from "../_shared/ai.ts";

export type ProviderName = "nvidia" | "deepseek" | "openai" | "gemini" | "ollama" | "openrouter";
export type ProviderStatus = "online" | "rate_limited" | "unavailable" | "timeout" | "not_configured" | "configuration_error" | "error" | "configured";

export const PROVIDER_NAMES: ProviderName[] = ["nvidia", "deepseek", "openai", "gemini", "ollama", "openrouter"];

export const PROVIDER_DEFS: Record<ProviderName, { apiKeyEnv: string; modelEnv: string; defaultModel: string }> = {
  nvidia: { apiKeyEnv: "NVIDIA_API_KEY", modelEnv: "NVIDIA_MODEL", defaultModel: "deepseek-ai/deepseek-v4-flash-0731" },
  deepseek: { apiKeyEnv: "DEEPSEEK_API_KEY", modelEnv: "DEEPSEEK_MODEL", defaultModel: "deepseek-chat" },
  openai: { apiKeyEnv: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", defaultModel: "gpt-4o-mini" },
  gemini: { apiKeyEnv: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL", defaultModel: "gemini-2.5-flash" },
  ollama: { apiKeyEnv: "OLLAMA_API_KEY", modelEnv: "OLLAMA_MODEL", defaultModel: "qwen2.5-coder:3b-instruct" },
  openrouter: { apiKeyEnv: "OPENROUTER_API_KEY", modelEnv: "OPENROUTER_MODEL", defaultModel: "openrouter/auto" },
};

function isProvider(v: string): v is ProviderName {
  return v === "nvidia" || v === "deepseek" || v === "openai" || v === "gemini" || v === "ollama" || v === "openrouter";
}

export function resolveProviderModel(getEnv: (k: string) => string | undefined, provider: ProviderName): string {
  const def = PROVIDER_DEFS[provider];
  return getEnv("AI_MODEL") ?? getEnv(def.modelEnv) ?? def.defaultModel;
}

export function providerConfigured(getEnv: (k: string) => string | undefined, provider: ProviderName): boolean {
  const key = getEnv(PROVIDER_DEFS[provider].apiKeyEnv);
  return typeof key === "string" && key.trim().length > 0;
}

export function classifyErrorKind(kind: string | undefined): ProviderStatus {
  switch (kind) {
    case "rate_limit": return "rate_limited";
    case "timeout": return "timeout";
    case "upstream": return "unavailable";
    case "missing_key":
    case "config": return "configuration_error";
    case "bad_request":
    case "auth":
    case "empty": return "error";
    default: return "error";
  }
}

export interface HealthProviderInfo {
  name: ProviderName;
  configured: boolean;
  status: ProviderStatus;
  latencyMs?: number;
  model?: string;
  errorKind?: string;
  /** Provider ativo do USUÁRIO (validado com sucesso via TESTAR) — não só env. */
  validated?: boolean;
}

export interface HealthConfigOverride {
  /** Provider ativo escolhido pelo usuário (ai_provider_config com is_default). */
  activeProvider?: ProviderName | null;
  activeModel?: string | null;
  activeApiKey?: string;
  fallbackProvider?: ProviderName | null;
  providers?: Partial<Record<ProviderName, { hasKey?: boolean; validated?: boolean; model?: string | null }>>;
}

export interface HealthPayload {
  activeProvider: ProviderName | null;
  activeModel: string | null;
  fallbackProvider: ProviderName | null;
  testedProvider: ProviderName | null;
  providers: HealthProviderInfo[];
  checkedAt: string;
}

export async function runHealthCheck(opts: {
  getEnv: (k: string) => string | undefined;
  runProvider: (provider: ProviderName, model: string, apiKey?: string) => Promise<{ model: string }>;
  /** Config do usuário (provider ativo validado) — sobrepõe o default de env. */
  config?: HealthConfigOverride | null;
}): Promise<HealthPayload> {
  const { getEnv, runProvider } = opts;
  const cfg = opts.config;
  const envActiveRaw = getEnv("AI_PROVIDER") ?? DEFAULT_PROVIDER;
  const envActive: ProviderName | null = isProvider(envActiveRaw) ? envActiveRaw : null;
  const rawFallback = getEnv("AI_FALLBACK_PROVIDER");
  const envFallback: ProviderName | null = rawFallback && isProvider(rawFallback) ? rawFallback : null;
  // Com usuário autenticado (config presente): o ativo é SOMENTE a IA validada
  // (is_default com chave). Sem IA validada → não há ativo (env NÃO é fallback).
  const active: ProviderName | null = cfg ? (cfg.activeProvider ?? null) : envActive;
  const fallback: ProviderName | null = cfg ? (cfg.fallbackProvider ?? null) : envFallback;

  const providers: HealthProviderInfo[] = PROVIDER_NAMES.map((name) => {
    const envConfigured = providerConfigured(getEnv, name);
    const uc = cfg?.providers?.[name];
    const userHasKey = Boolean(uc?.hasKey);
    const configured = userHasKey || envConfigured;
    const userModel = uc?.model ?? null;
    return {
      name,
      configured,
      status: configured ? "configured" : "not_configured",
      validated: !!uc?.validated,
      model: configured ? (userModel ?? resolveProviderModel(getEnv, name)) : undefined,
    };
  });

  // Teste de conectividade apenas no provider ativo (chamada mínima e barata).
  let tested: ProviderName | null = null;
  if (active) {
    const entry = providers.find((p) => p.name === active);
    const started = Date.now();
    if (entry && entry.configured) {
      tested = active;
      try {
        const result = await runProvider(active, entry.model ?? resolveProviderModel(getEnv, active), cfg?.activeApiKey);
        entry.status = "online";
        entry.latencyMs = Date.now() - started;
        entry.model = result.model;
        entry.validated = true;
      } catch (e) {
        entry.latencyMs = Date.now() - started;
        const kind = e instanceof AIProviderConfigurationError ? e.kind
          : (e && typeof e === "object" && "kind" in e ? String((e as { kind: unknown }).kind) : undefined);
        entry.status = classifyErrorKind(kind);
        if (kind && kind !== "missing_key") entry.errorKind = kind;
      }
    } else if (entry) {
      entry.status = "not_configured";
    }
  }

  return {
    activeProvider: active,
    activeModel: active ? (cfg?.activeModel && active === cfg?.activeProvider ? cfg.activeModel : resolveProviderModel(getEnv, active)) : null,
    fallbackProvider: fallback,
    testedProvider: tested,
    providers,
    checkedAt: new Date().toISOString(),
  };
}
