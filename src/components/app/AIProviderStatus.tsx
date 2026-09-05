import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
