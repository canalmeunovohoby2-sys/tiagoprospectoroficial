import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, Wrench } from "lucide-react";
import type { StudioToolItem } from "@/lib/studio/interactions";

function pretty(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Bloco de execução de uma ferramenta: tool_call + tool_response agrupados. */
export function ToolExecutionBlock({ item }: { item: StudioToolItem }) {
  const [open, setOpen] = useState(false);
  const args = pretty(item.args);
  const response = pretty(item.response);
  const hasDetails = !!(args || response);

  return (
    <div className="rounded-lg border border-border/60 bg-card/70">
      <button
        type="button"
        onClick={() => hasDetails && setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        aria-expanded={open}
      >
        {item.status === "running" ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        ) : item.status === "error" ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        )}
        <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-foreground/90">
          {item.name}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{item.agent}</span>
        {hasDetails && (open ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />)}
      </button>
      {open && hasDetails && (
        <div className="space-y-1.5 border-t border-border/60 px-2.5 py-1.5">
          {args && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Argumentos</p>
              <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-1.5 text-[11px]">{args}</pre>
            </div>
          )}
          {response && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Resultado</p>
              <pre className="mt-0.5 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-1.5 text-[11px]">{response}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
