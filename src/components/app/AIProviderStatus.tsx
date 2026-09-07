import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAgentTicket } from "@/lib/agentTicket";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ProviderInfo {
  name: string;
  configured: boolean;
  status: string;
  latencyMs?: number;
  model?: string;
}
interface HealthPayload {
  activeProvider: string | null;
  activeModel: string | null;
  fallbackProvider: string | null;
  testedProvider: string | null;
  providers: ProviderInfo[];
}

const LABELS: Record<string, string> = {
  online: "Online",
  configured: "Configurado",
  not_configured: "Não configurado",
  rate_limited: "Limite atingido",
  unavailable: "Indisponível",
  timeout: "Timeout",
  configuration_error: "Erro de configuração",
  error: "Erro",
};

const DOTS: Record<string, string> = {
  online: "🟢",
  configured: "🟡",
  not_configured: "⚪",
  rate_limited: "🟠",
  unavailable: "🔴",
  timeout: "🔴",
  configuration_error: "🟠",
  error: "🔴",
};

export function AIProviderStatus() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [runtimeProof, setRuntimeProof] = useState<{ provider?: string; model?: string; source?: string; warning?: string } | null>(null);

  // PROVA REAL: pergunta ao Agent Runtime qual IA ele vai USAR para este
  // usuário (vem do runtime-ai-config → ai_provider_config validado).
  const proveRuntime = async () => {
    if (proofLoading) return;
    setProofLoading(true);
    setRuntimeProof(null);
    try {
      const { data: rc, error: rcErr } = await supabase.functions.invoke<{ runtimeUrl?: string }>("runtime-config", { body: {} });
      if (rcErr || !rc?.runtimeUrl) {
        setRuntimeProof({ warning: "Agent Runtime não está configurado (runtime-config sem URL)." });
        return;
      }
      const { data: user } = await supabase.auth.getUser();
      const token = await getAgentTicket();
      if (!token) {
        setRuntimeProof({ warning: "Não autenticado para consultar a IA do gerador (ticket não emitido)." });
        return;
      }
      const res = await fetch(`${String(rc.runtimeUrl).replace(/\/+$/, "")}/agent-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: user?.user?.id }),
      });
      const cfg = (await res.json().catch(() => null)) as { ok?: boolean; provider?: string; model?: string; config_source?: string; warning?: string; blocked_reason?: string } | null;
      setRuntimeProof({
        provider: cfg?.ok === false ? undefined : cfg?.provider,
        model: cfg?.ok === false ? undefined : cfg?.model,
        source: cfg?.ok === false ? undefined : cfg?.config_source,
        warning: cfg?.ok === false ? (cfg?.blocked_reason ?? cfg?.warning ?? "Execução bloqueada: nenhuma IA validada na conta.") : (cfg?.warning ?? null),
      });
    } catch (e) {
      setRuntimeProof({ warning: e instanceof Error ? e.message : "Falha ao consultar o Agent Runtime." });
    } finally {
      setProofLoading(false);
    }
  };

  const run = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data: payload, error } = await supabase.functions.invoke<HealthPayload>("ai-health", { body: {} });
      if (error) throw error;
      if (!payload) throw new Error("Resposta vazia do health check");
      setData(payload);
      setLastChecked(new Date().toLocaleTimeString("pt-BR"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao executar health check");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => { run(); /* eslint-disable-next-line */ }, []);
  // Ao validar/ativar um provider nas configurações, o status ativo atualiza na hora.
  useEffect(() => {
    const handler = () => { run(); };
    window.addEventListener("ai-config-validated", handler);
    return () => window.removeEventListener("ai-config-validated", handler);
    /* eslint-disable-next-line */
  }, [run]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display font-semibold text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" /> Inteligência Artificial
        </h2>
        <Button size="sm" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          Testar conexão
        </Button>
      </div>

      {!data && !loading && <p className="text-sm text-muted-foreground">Clique em “Testar conexão” para verificar os provedores de IA.</p>}
      {loading && !data && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando provedores…</p>}

      {data && (
        <div className="space-y-4">
          <button type="button" onClick={proveRuntime} disabled={proofLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
            {proofLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
            Provar IA usada no gerador de sites
          </button>
          {runtimeProof && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-semibold">Prova real (Agent Runtime)</p>
              {runtimeProof.warning && <p className="text-amber-600">{runtimeProof.warning}</p>}
              {runtimeProof.provider && (
                <p>IA usada pelo gerador: <strong className="capitalize">{runtimeProof.provider}</strong> · modelo <span className="font-mono">{runtimeProof.model}</span></p>
              )}
              {runtimeProof.source && (
                <p className="text-muted-foreground">
                  Origem: {runtimeProof.source === "user_config" ? "config da sua conta (validada via TESTAR)" : runtimeProof.source === "request" ? "definida no pedido" : "padrão do ambiente"}
                </p>
              )}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Provider ativo</p>
              <p className="font-semibold text-sm mt-1 capitalize">{data.activeProvider ?? "—"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Modelo</p>
              <p className="font-mono text-xs mt-1 break-words">{data.activeModel ?? "—"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Fallback</p>
              <p className="text-sm mt-1 capitalize">{data.fallbackProvider ?? "Não configurado"}</p>
            </Card>
          </div>

          <Card className="p-4 space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Providers</p>
            {data.providers.map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-2 border-b border-border/40 last:border-0 py-2">
                <span className="text-sm font-medium capitalize">{p.name}</span>
                <span className="flex items-center gap-1.5 text-xs">
                  {DOTS[p.status] ?? "⚪"} {LABELS[p.status] ?? p.status}
                  {typeof p.latencyMs === "number" && p.status === "online" && <span className="text-muted-foreground">· {(p.latencyMs / 1000).toFixed(1)}s</span>}
                  {p.model && <span className="text-muted-foreground font-mono max-w-[220px] truncate">· {p.model}</span>}
                </span>
              </div>
            ))}
          </Card>

          {lastChecked && <p className="text-[11px] text-muted-foreground">Último teste: {lastChecked}</p>}
        </div>
      )}
    </div>
  );
}
