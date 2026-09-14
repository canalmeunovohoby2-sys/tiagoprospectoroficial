import { useEffect, useMemo, useRef, type ComponentProps } from "react";
import { ListChecks, Route as RouteIcon, Sparkles } from "lucide-react";
import { SiteChat } from "@/components/sites/editor/SiteChat";
import { AgentInteraction } from "./AgentInteraction";
import { ToolExecutionBlock } from "./ToolExecutionBlock";
import { UnifiedChatPanel } from "./UnifiedChatPanel";
import { buildUnifiedChat } from "@/lib/studio/chatModel";
import type { UseStudioChatResult } from "@/hooks/studio/useStudioChat";

export type StudioChatPanelProps = ComponentProps<typeof SiteChat> & {
  /** Estado de streaming do Studio (C1/C2). */
  stream?: UseStudioChatResult;
  /** `react` → ChatPanel unificado (C2); `static` → SiteChat + timeline (legado). */
  projectKind?: "static" | "react";
  visualMode?: boolean;
  onToggleVisual?: () => void;
  /** Cancela a execução atual (React). */
  onCancel?: () => void;
  /** C6: reexecuta a última instrução (sem duplicar mensagens). */
  onRetry?: () => void;
};

function StudioStreamTimeline({ stream }: { stream: UseStudioChatResult }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const visible = stream.running || stream.items.length > 0 || !!stream.plan || !!stream.route;
  const routeLabel = stream.route?.route === "planner" ? "Planner → Coder" : stream.route ? "Coder direto" : null;

  useEffect(() => {
    if (stream.running) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [stream.items.length, stream.running]);

  if (!visible) return null;

  return (
    <div className="flex max-h-[40%] shrink-0 flex-col overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.03]">
      <div className="flex shrink-0 items-center gap-2 border-b border-primary/15 px-2.5 py-1.5">
        <span className="relative flex h-1.5 w-1.5">
          {stream.running && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />}
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${stream.running ? "bg-primary" : "bg-muted-foreground/50"}`} />
        </span>
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-primary/90">
          {stream.running ? "Executando" : "Execução"}
        </p>
        {routeLabel && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <RouteIcon className="h-2.5 w-2.5" /> {routeLabel}
          </span>
        )}
        {stream.cancelled && <span className="text-[10px] text-amber-600">cancelada</span>}
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2 [scrollbar-width:thin]">
        {stream.plan && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 px-2.5 py-1.5">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
              <ListChecks className="h-3 w-3" /> Plano do Planner
            </p>
            <pre className="mt-0.5 whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-foreground/90">{stream.plan}</pre>
          </div>
        )}
        {stream.items.map((item) =>
          item.kind === "thought" ? (
            <AgentInteraction key={item.id} agent={item.agent} content={item.content} />
          ) : (
            <ToolExecutionBlock key={item.id} item={item} />
          ),
        )}
        {stream.running && stream.items.length === 0 && !stream.plan && (
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" /> preparando a execução…
          </p>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/**
 * Painel de chat do Studio. Para `react` (C2) usa o **ChatPanel unificado**
 * (conversa + Agent Activity + tools + commits no mesmo fluxo). Para `static`
 * mantém o SiteChat + timeline do fluxo legado.
 */
export function StudioChatPanel({ stream, projectKind = "static", visualMode, onToggleVisual, onCancel, onRetry, ...siteChatProps }: StudioChatPanelProps) {
  const unifiedItems = useMemo(() => {
    if (projectKind !== "react") return [];
    return buildUnifiedChat({
      messages: (siteChatProps.messages ?? []).map((m) => ({ role: m.role, text: m.text, image: m.image, fileLabel: m.fileLabel })),
      runs: stream?.runs ?? [],
      commits: stream?.commits ?? [],
    });
  }, [projectKind, siteChatProps.messages, stream?.runs, stream?.commits]);

  if (projectKind === "react") {
    return (
      <UnifiedChatPanel
        items={unifiedItems}
        running={!!stream?.running}
        phase={stream?.phase ?? (stream?.running ? "preparing" : "idle")}
        currentAgent={stream?.currentAgent ?? null}
        currentTool={stream?.currentTool ?? null}
        error={stream?.error ?? null}
        visualMode={visualMode}
        onToggleVisual={onToggleVisual}
        onSend={(text, attachment) => siteChatProps.onApply(text, attachment)}
        onCancel={onCancel}
        onRetry={onRetry}
        canUndo={siteChatProps.canUndo}
        onRevert={siteChatProps.onRevert}
        onNewConversation={siteChatProps.onNewConversation}
        disabled={siteChatProps.running && !stream?.running ? true : false}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {stream && <StudioStreamTimeline stream={stream} />}
      <div className="min-h-0 flex-1"><SiteChat {...siteChatProps} /></div>
    </div>
  );
}
