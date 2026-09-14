import { BrainCircuit } from "lucide-react";

/** Bolha de raciocínio/observação de um agente do Studio (Router/Planner/Coder). */
export function AgentInteraction({ agent, content }: { agent: string; content: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/70 px-2.5 py-1.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <BrainCircuit className="h-3 w-3 text-primary/80" />
        {agent}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground/90">{content}</p>
    </div>
  );
}
