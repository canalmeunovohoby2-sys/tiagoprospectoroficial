import { useEffect, useState } from "react";
import { Cloud, HardDrive, Loader2, RefreshCw, Wand2 } from "lucide-react";
import {
  getAgentRuntimeMode,
  localRuntimeHealth,
  setAgentRuntimeMode,
  LOCAL_AGENT_RUNTIME_URL,
  type AgentRuntimeMode,
} from "@/lib/siteProjectsApi";

// Provider de IA ≠ onde o runtime executa. Este seletor define ONDE o agente roda:
// neste computador (runtime local em localhost) ou na nuvem (runtime remoto).
const OPTIONS: Array<{ id: AgentRuntimeMode; label: string; hint: string; Icon: typeof Wand2 }> = [
  {
    id: "auto",
    label: "Automático",
    hint: "Usa o agente conectado neste computador (recomendado).",
    Icon: Wand2,
  },
  {
    id: "local",
    label: "Este computador",
    hint: "Sempre o agente deste computador. Se ele não estiver iniciado, avisamos você.",
    Icon: HardDrive,
  },
  {
    id: "remote",
    label: "Nuvem",
    hint: "Executa na nuvem (não usa este computador).",
    Icon: Cloud,
  },
];

export function AgentRuntimeSettings() {
  const [mode, setMode] = useState<AgentRuntimeMode>(() => getAgentRuntimeMode());
  const [localOk, setLocalOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const checkLocal = async () => {
    setChecking(true);
    try {
      setLocalOk(await localRuntimeHealth());
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void checkLocal();
  }, []);

  const pick = (next: AgentRuntimeMode) => {
    setMode(next);
    setAgentRuntimeMode(next);
    if (next !== "remote") void checkLocal();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Runtime do agente — onde executar</h3>
        <span className="text-[10px] text-muted-foreground">
          independente do provedor de IA escolhido acima
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {OPTIONS.map(({ id, label, hint, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => pick(id)}
            title={hint}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
              mode === id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        {OPTIONS.find((o) => o.id === mode)?.hint}
      </p>

      <div className="mt-2 flex items-center gap-2 text-xs">
        {mode !== "remote" && (
          <>
            {checking ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : (
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  localOk ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
            )}
            <span className={localOk ? "text-emerald-600" : "text-muted-foreground"} title={LOCAL_AGENT_RUNTIME_URL}>
              {localOk === null ? "Conectando ao agente local…" : localOk ? "Agente local conectado" : "Agente local não encontrado"}
            </span>
            <button
              type="button"
              onClick={() => void checkLocal()}
              disabled={checking}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" /> Conectar agente
            </button>
          </>
        )}
        {mode === "remote" && <span className="text-muted-foreground">Executando somente na nuvem.</span>}
      </div>
    </div>
  );
}
