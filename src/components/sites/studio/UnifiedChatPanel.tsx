import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Bot, CheckCircle2, ChevronDown, ChevronRight, GitCommitHorizontal, Loader2, Mic, Paperclip,
  Paintbrush, RotateCcw, Send, Sparkles, Square, User, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentInteraction } from "./AgentInteraction";
import { ToolExecutionBlock } from "./ToolExecutionBlock";
import { MarkdownMessage } from "./MarkdownMessage";
import { VoiceRecordingBar } from "./VoiceRecordingBar";
import { useVoiceRecorder } from "@/hooks/studio/useVoiceRecorder";
import { PHASE_LABEL, type StudioPhase, type UnifiedChatItem } from "@/lib/studio/chatModel";

export interface UnifiedChatPanelProps {
  items: UnifiedChatItem[];
  running: boolean;
  phase: StudioPhase;
  currentAgent?: string | null;
  currentTool?: string | null;
  error?: string | null;
  visualMode?: boolean;
  onToggleVisual?: () => void;
  onSend: (text: string, attachment?: { dataUrl: string; label: string }) => void;
  onCancel?: () => void;
  /** C6: tenta novamente a última execução (sem duplicar mensagens). */
  onRetry?: () => void;
  canUndo?: boolean;
  onRevert?: () => void;
  onNewConversation?: () => void;
  disabled?: boolean;
}

function ActivityBlock({ item }: { item: Extract<UnifiedChatItem, { kind: "activity" }> }) {
  const [open, setOpen] = useState(item.status === "running");
  const running = item.status === "running";
  return (
    <div className={`rounded-xl border bg-card/50 ${running ? "border-primary/30" : "border-border/60"}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <span className="relative flex h-2 w-2">
          {running && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${running ? "bg-primary" : item.status === "error" ? "bg-destructive" : "bg-emerald-500"}`} />
        </span>
        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Agent Activity</span>
        {item.filesUpdated && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600">arquivos atualizados</span>}
        <span className="ml-auto text-muted-foreground">{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</span>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border/50 p-2.5">
          {item.plan && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 px-2.5 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Plano do Planner</p>
              <pre className="mt-0.5 whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-foreground/90">{item.plan}</pre>
            </div>
          )}
          {item.items.length === 0 && !item.plan && (
            <p className="px-1 text-[11px] text-muted-foreground">{running ? "preparando a execução…" : "sem detalhes"}</p>
          )}
          {item.items.map((it) =>
            it.kind === "thought"
              ? <AgentInteraction key={it.id} agent={it.agent} content={it.content} />
              : <ToolExecutionBlock key={it.id} item={it} />,
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ChatPanel unificado (C2): conversa + Agent Activity + tools + commits no MESMO
 * fluxo. Substitui a timeline separada para projetos React.
 */
export function UnifiedChatPanel({
  items,
  running,
  phase,
  currentAgent,
  currentTool,
  error,
  visualMode,
  onToggleVisual,
  onSend,
  onCancel,
  onRetry,
  canUndo,
  onRevert,
  onNewConversation,
  disabled,
}: UnifiedChatPanelProps) {
  const [text, setText] = useState("");
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Gravador de voz (estilo WhatsApp): transcreve e envia como instrução.
  const rec = useVoiceRecorder({
    onTranscript: (t) => { setMicNotice(null); onSend(t); },
    onNotice: (m) => setMicNotice(m),
  });

  useEffect(() => {
    // jsdom não implementa scrollIntoView — guarda para testes/SSR.
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [items.length, running, currentTool]);

  const canSend = !!text.trim() && !running && !disabled;
  const submit = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const attach = (file: File | null) => {
    if (!file || running) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      onSend(text.trim() || `Analise o anexo: ${file.name}`, { dataUrl, label: file.name });
      setText("");
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
        <p className="flex items-center gap-2 text-[12px] font-semibold"><Sparkles className="h-3.5 w-3.5 text-primary" /> Construtor IA</p>
        <span className={`inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] ${
          phase === "error" ? "text-destructive" : phase === "cancelled" ? "text-amber-600" : running ? "text-primary" : "text-muted-foreground"
        }`}>
          {running && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          {PHASE_LABEL[phase]}
        </span>
        {running && (currentAgent || currentTool) && (
          <span className="truncate text-[10px] text-muted-foreground">
            {currentTool ? `${currentAgent ?? "Coder"} → ${currentTool}` : currentAgent}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {onToggleVisual && (
            <button
              type="button"
              onClick={onToggleVisual}
              title="Edição visual"
              className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] ${visualMode ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
            >
              <Paintbrush className="h-3 w-3" /> <span className="hidden sm:inline">Visual Edits</span>
            </button>
          )}
          {canUndo && onRevert && (
            <button type="button" onClick={onRevert} title="Desfazer" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          {onNewConversation && (
            <button type="button" onClick={onNewConversation} title="Nova conversa" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {items.length === 0 && (
          <p className="px-1 py-6 text-center text-[12px] text-muted-foreground">
            Descreva o que você quer criar ou alterar. O agente trabalha no projeto real e você acompanha aqui.
          </p>
        )}
        {items.map((item) => {
          if (item.kind === "user") {
            return (
              <div key={item.id} className="flex justify-end gap-2">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-[13px] text-primary-foreground">
                  {item.image && <img src={item.image} alt={item.fileLabel ?? "anexo"} className="mb-1.5 max-h-40 rounded-lg" />}
                  <p className="whitespace-pre-wrap break-words">{item.text}</p>
                </div>
                <span className="mt-1 hidden h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted sm:flex"><User className="h-3.5 w-3.5" /></span>
              </div>
            );
          }
          if (item.kind === "assistant") {
            return (
              <div key={item.id} className="flex gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="h-3.5 w-3.5" /></span>
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border/60 bg-background px-3 py-2">
                  <MarkdownMessage text={item.text} />
                </div>
              </div>
            );
          }
          if (item.kind === "activity") return <ActivityBlock key={item.id} item={item} />;
          if (item.kind === "commit") {
            return (
              <p key={item.id} className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                <GitCommitHorizontal className="h-3.5 w-3.5 text-emerald-500" />
                Checkpoint: {item.message}{item.hash ? ` · ${item.hash.slice(0, 7)}` : ""}
              </p>
            );
          }
          return (
            <p key={item.id} className={`px-1 text-[11px] ${item.tone === "error" ? "text-destructive" : item.tone === "success" ? "text-emerald-600" : "text-muted-foreground"}`}>
              {item.text}
            </p>
          );
        })}
        {error && !running && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11.5px] text-destructive">
            <span className="flex-1">{error}</span>
            {onRetry && (
              <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={onRetry}>
                <RotateCcw className="mr-1 h-3 w-3" /> Tentar novamente
              </Button>
            )}
          </div>
        )}
        {!error && phase === "cancelled" && onRetry && !running && (
          <Button type="button" size="sm" variant="outline" className="h-7 w-full text-[11px]" onClick={onRetry}>
            <RotateCcw className="mr-1 h-3 w-3" /> Tentar novamente
          </Button>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-border/60 p-2.5">
        {rec.recording ? (
          <VoiceRecordingBar
            seconds={rec.seconds}
            levels={rec.levels}
            onCancel={() => { rec.cancel(); setMicNotice(null); }}
            onSend={() => { rec.finish(); }}
          />
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              disabled={disabled || running}
              placeholder={running ? "Executando…" : "Peça uma criação ou alteração (Enter envia, Shift+Enter quebra linha)"}
              className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-border/70 bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/50 disabled:opacity-60"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => { attach(e.target.files?.[0] ?? null); e.target.value = ""; }}
            />
            <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" disabled={running || disabled} onClick={() => fileRef.current?.click()} title="Anexar">
              <Paperclip className="h-4 w-4" />
            </Button>
            {running ? (
              <Button type="button" size="icon" variant="destructive" className="h-9 w-9 shrink-0" onClick={onCancel} title="Cancelar execução">
                <Square className="h-4 w-4" />
              </Button>
            ) : text.trim() ? (
              <Button type="button" size="icon" className="h-9 w-9 shrink-0" disabled={!canSend} onClick={submit} title="Enviar">
                <Send className="h-4 w-4" />
              </Button>
            ) : (
              // Campo vazio → mic (igual ao WhatsApp). A voz vira texto e é enviada.
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                disabled={disabled}
                onClick={() => { setMicNotice(null); rec.start(); }}
                title="Gravar com voz"
              >
                <Mic className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        {micNotice && !rec.recording && (
          <p className="mt-1 px-1 text-[10.5px] text-amber-600">{micNotice}</p>
        )}
        {!running && items.some((i) => i.kind === "assistant") && (
          <p className="mt-1 flex items-center gap-1 px-1 text-[10px] text-muted-foreground"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> concluído</p>
        )}
      </div>
    </div>
  );
}
