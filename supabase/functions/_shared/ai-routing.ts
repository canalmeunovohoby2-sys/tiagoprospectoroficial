// AI Routing (5.37) — seleção central de provedor/modelo por projeto com
// fallback. Lógica PURA e compartilhada (Deno edge + testes). Não duplica o
// gateway `_shared/ai.ts`: resolve apenas QUAL provedor/modelo/fallback usar.
// Chaves nunca transitam aqui — continuam exclusivas do ambiente/Supabase.
import {
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_NVIDIA_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_PROVIDER,
  type ProviderName,
} from "./ai.ts";

export interface ExecutionPreference {
  provider?: string | null;
  model?: string | null;
  fallback?: string | null;
}

export interface ResolvedExecution {
  ok: boolean;
  provider: ProviderName;
  model: string;
  fallbackProvider?: ProviderName;
  source: "project" | "global";
  error?: string;
}

export const AI_PROVIDERS: Array<{ id: ProviderName; label: string; defaultModel: string }> = [
  { id: "deepseek", label: "DeepSeek", defaultModel: DEFAULT_DEEPSEEK_MODEL },
  { id: "nvidia", label: "NVIDIA NIM", defaultModel: DEFAULT_NVIDIA_MODEL },
  { id: "openai", label: "OpenAI", defaultModel: DEFAULT_OPENAI_MODEL },
  { id: "gemini", label: "Gemini", defaultModel: DEFAULT_GEMINI_MODEL },
];

const PROVIDER_DEFAULTS: Record<ProviderName, string> = {
  deepseek: DEFAULT_DEEPSEEK_MODEL,
  nvidia: DEFAULT_NVIDIA_MODEL,
  openai: DEFAULT_OPENAI_MODEL,
  gemini: DEFAULT_GEMINI_MODEL,
};

function isProvider(v: string | null | undefined): v is ProviderName {
  return v === "deepseek" || v === "nvidia" || v === "openai" || v === "gemini";
}

function cleanModel(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

// Resolve a configuração de EXECUÇÃO usada por uma chamada.
// ordem: preferências do projeto → preferências globais → padrão do produto.
// Erros de CONFIGURAÇÃO não caem em fallback silencioso (o erro volta p/ corrigir).
export function resolveExecutionConfig(opts: {
  project?: ExecutionPreference | null;
  global?: ExecutionPreference | null;
  knownModels?: string[];
}): ResolvedExecution {
  const project = opts?.project;
  const global = opts?.global;
  const requested = project?.provider ?? global?.provider;
  const source: "project" | "global" = (project?.provider || project?.model || project?.fallback) ? "project" : "global";

  if (requested != null && String(requested).trim() !== "" && !isProvider(String(requested).trim())) {
    return { ok: false, provider: DEFAULT_PROVIDER, model: PROVIDER_DEFAULTS[DEFAULT_PROVIDER], source, error: `Provedor de execução desconhecido: "${requested}". Use deepseek, nvidia, openai ou gemini.` };
  }
  const provider: ProviderName = isProvider(requested) ? requested : DEFAULT_PROVIDER;

  const requestedModel = project?.model ?? global?.model;
  const model = cleanModel(requestedModel) || PROVIDER_DEFAULTS[provider];
  if (cleanModel(requestedModel) && opts?.knownModels?.length && !opts.knownModels.includes(cleanModel(requestedModel))) {
    return { ok: false, provider, model: PROVIDER_DEFAULTS[provider], source, error: `Modelo "${cleanModel(requestedModel)}" não está disponível para ${provider}.` };
  }

  let fallbackProvider: ProviderName | undefined;
  const fallbackReq = project?.fallback ?? global?.fallback;
  if (fallbackReq != null && String(fallbackReq).trim() !== "") {
    const fb = String(fallbackReq).trim();
    if (fb === provider) {
      return { ok: false, provider, model, source, error: "O provedor de fallback não pode ser igual ao provedor principal." };
    }
    if (!isProvider(fb)) {
      return { ok: false, provider, model, source, error: `Provedor de fallback desconhecido: "${fb}".` };
    }
    fallbackProvider = fb;
  }

  return { ok: true, provider, model, fallbackProvider, source };
}

export function providerLabel(id: ProviderName): string {
  return AI_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}
