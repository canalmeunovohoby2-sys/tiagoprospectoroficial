import { useEffect, useState } from "react";
import { KeyRound, Plug, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const AI_PROVIDERS: Array<{ id: string; label: string; defaultModel: string }> = [
  { id: "deepseek", label: "DeepSeek", defaultModel: "deepseek-chat" },
  { id: "nvidia", label: "NVIDIA NIM", defaultModel: "deepseek-ai/deepseek-v4-flash-0731" },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o-mini" },
  { id: "gemini", label: "Gemini", defaultModel: "gemini-2.5-flash" },
];

interface ProviderState {
  provider: string;
  label: string;
  hasKey: boolean;
  maskedKey: string | null;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  fallbackProvider: string | null;
  keyInput: string;
  saving: boolean;
  testing: boolean;
  testResult: {
    ok?: boolean;
    message?: string;
    kind?: string;
    reply?: string;
    latencyMs?: number;
    provider?: string;
    model?: string;
    enabled?: boolean;
    isDefault?: boolean;
  } | null;
  error: string | null;
}

async function callAiConfig(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("ai-config", { body });
  if (error) {
    // O supabase-js só expõe "Edge Function returned a non-2xx status code".
    // Tenta ler o corpo real da resposta para mostrar o motivo verdadeiro.
    let detail = "";
    try {
      const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
      if (ctx?.json) {
        const parsed = (await ctx.json()) as { error?: unknown } | null;
        if (parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string" && parsed.error) {
          detail = ` — ${parsed.error}`;
        }
      }
    } catch {
      /* sem corpo legível */
    }
    throw new Error(`${error.message || "Falha ao acessar configuração de IA"}${detail}`);
  }
  return data as Record<string, unknown>;
}

export function AiProvidersSettings() {
  const [providers, setProviders] = useState<ProviderState[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadError, setReloadError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setReloadError(null);
    try {
      const data = await callAiConfig({ action: "list" });
      const items = (data.providers as Array<Record<string, unknown>>) ?? [];
      setProviders(
        AI_PROVIDERS.map((cat) => {
          const found = items.find((p) => p.provider === cat.id);
          return {
            provider: cat.id,
            label: String(found?.label ?? cat.label),
            hasKey: Boolean(found?.hasKey),
            maskedKey: (found?.maskedKey as string | null) ?? null,
            model: String(found?.model ?? cat.defaultModel),
            enabled: found ? Boolean(found.enabled) : false,
            isDefault: Boolean(found?.isDefault),
            fallbackProvider: (found?.fallbackProvider as string | null) ?? null,
            keyInput: "",
            saving: false,
            testing: false,
            testResult: null,
            error: null,
          };
        }),
      );
    } catch (e) {
      setReloadError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function patch(provider: string, part: Partial<ProviderState>) {
    setProviders((prev) => prev.map((p) => (p.provider === provider ? { ...p, ...part } : p)));
  }

  async function save(p: ProviderState) {
    patch(p.provider, { saving: true, error: null });
    try {
      await callAiConfig({
        action: "set",
        provider: p.provider,
        apiKey: p.keyInput || undefined,
        model: p.model,
        enabled: p.enabled,
        isDefault: p.isDefault,
        fallbackProvider: p.fallbackProvider || undefined,
      });
      await load();
    } catch (e) {
      patch(p.provider, { error: e instanceof Error ? e.message : "Falha ao salvar" });
    } finally {
      patch(p.provider, { saving: false });
    }
  }

  async function test(p: ProviderState) {
    patch(p.provider, { testing: true, testResult: null, error: null });
    try {
      const data = await callAiConfig({ action: "test", provider: p.provider, model: p.model });
      const activated = Boolean(data.activated) || Boolean(data.isDefault);
      if (activated) {
        // Teste real OK → provider vira o ATIVO (uso global). Recarrega estados.
        await load();
      }
      patch(p.provider, {
        testResult: {
          ok: Boolean(data.ok),
          message: String(data.message ?? ""),
          kind: String(data.kind ?? ""),
          reply: typeof data.reply === "string" ? data.reply : undefined,
          latencyMs: typeof data.latencyMs === "number" ? data.latencyMs : undefined,
          provider: typeof data.provider === "string" ? data.provider : undefined,
          model: typeof data.model === "string" ? data.model : undefined,
          enabled: typeof data.enabled === "boolean" ? data.enabled : undefined,
          isDefault: Boolean(data.isDefault),
        },
      });
      if (activated) {
        window.dispatchEvent(new Event("ai-config-validated"));
      }
    } catch (e) {
      patch(p.provider, { testResult: { ok: false, message: e instanceof Error ? e.message : "Falha no teste" } });
    } finally {
      patch(p.provider, { testing: false });
    }
  }

  async function removeKey(p: ProviderState) {
    patch(p.provider, { saving: true, error: null });
    try {
      await callAiConfig({ action: "remove_key", provider: p.provider });
      await load();
    } catch (e) {
      patch(p.provider, { error: e instanceof Error ? e.message : "Falha" });
    } finally {
      patch(p.provider, { saving: false });
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando provedores…</div>;
  }

  return (
    <div className="space-y-4">
      {reloadError && <p className="text-sm text-destructive">{reloadError}</p>}
      <p className="text-xs text-muted-foreground">
        As chaves ficam armazenadas somente no servidor (Supabase). Nunca são exibidas por completo — você verá apenas o estado (últimos 4 dígitos).
        Salvar apenas grava a chave/modelo. Para o provedor virar o <strong>provider ativo (uso global)</strong>, clique em <strong>TESTAR</strong>: só uma chamada real bem-sucedida ativa o provedor e substitui o ativo anterior.
      </p>
      {providers.map((p) => (
        <div key={p.provider} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium">
              <span className="text-base">{p.provider === "nvidia" ? "🟢" : p.provider === "deepseek" ? "🐋" : p.provider === "gemini" ? "💎" : "⚡"}</span>
              {p.label}
              {p.isDefault && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">PADRÃO</span>}
              {p.hasKey ? <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600"><KeyRound className="h-3 w-3" /> {p.maskedKey}</span> : <span className="text-[10px] text-muted-foreground">sem chave</span>}
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => void test(p)} disabled={!p.hasKey || p.testing} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40">
                {p.testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plug className="h-3 w-3" />} Testar
              </button>
              {p.hasKey && (
                <button type="button" onClick={() => void removeKey(p)} title="Remover chave" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs">
              <span className="text-muted-foreground">API Key {p.hasKey ? "(nova opcional)" : ""}</span>
              <input type="password" value={p.keyInput} onChange={(e) => patch(p.provider, { keyInput: e.target.value })} placeholder={p.hasKey ? "•••••••••••• (deixe vazio para manter)" : `Chave ${p.label}`} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">Modelo</span>
              <input type="text" value={p.model} onChange={(e) => patch(p.provider, { model: e.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={p.enabled} onChange={(e) => patch(p.provider, { enabled: e.target.checked })} /> Ativado
            </label>
            <span className="flex items-center gap-1.5">
              Fallback
              <select value={p.fallbackProvider ?? ""} onChange={(e) => patch(p.provider, { fallbackProvider: e.target.value || null })} className="rounded-md border border-border bg-background px-1.5 py-1 text-xs">
                <option value="">— nenhum —</option>
                {AI_PROVIDERS.filter((x) => x.id !== p.provider).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </span>
            {!p.isDefault && p.hasKey && (
              <span className="text-[10px] text-amber-600">Salvo, mas ainda não ativo — clique em TESTAR para validar e ativar.</span>
            )}
            {p.isDefault && <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">✓ Validado e ATIVO (uso global)</span>}
            <button type="button" onClick={() => void save(p)} disabled={p.saving} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {p.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Salvar
            </button>
          </div>

          {p.error && <p className="mt-2 text-xs text-destructive">{p.error}</p>}
          {p.testResult && (
            <div className={`mt-2 text-xs ${p.testResult.ok ? "text-emerald-600" : "text-destructive"}`}>
              <p>
                {p.testResult.ok ? "✓ Conexão válida." : `✗ ${p.testResult.message ?? "Falha no teste."}`}
                {typeof p.testResult.latencyMs === "number" && <span className="text-muted-foreground"> · {(p.testResult.latencyMs / 1000).toFixed(1)}s</span>}
              </p>
              {p.testResult.reply && (
                <p className="mt-1 rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px] break-words">
                  {p.testResult.reply}
                </p>
              )}
              {p.testResult.ok && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Provedor: {p.testResult.provider ?? p.provider} · Modelo: {p.testResult.model ?? p.model}
                  {p.testResult.isDefault && <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">USO GLOBAL (padrão)</span>}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
