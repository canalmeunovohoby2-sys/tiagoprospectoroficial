import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Bot, CheckCircle2, GitCommitHorizontal, Loader2, Mic, Paperclip,
  Paintbrush, RotateCcw, Send, Sparkles, Square, User, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "./MarkdownMessage";
import { VoiceRecordingBar } from "./VoiceRecordingBar";
import { useVoiceRecorder } from "@/hooks/studio/useVoiceRecorder";
import { PHASE_LABEL, type ChatAttachmentRef, type StudioPhase, type UnifiedChatItem } from "@/lib/studio/chatModel";
import { latestWorkLine } from "@/lib/agentWorkActivity";

export interface UnifiedChatPanelProps {
  items: UnifiedChatItem[];
  running: boolean;
  phase: StudioPhase;
  currentAgent?: string | null;
  currentTool?: string | null;
  error?: string | null;
  visualMode?: boolean;
  onToggleVisual?: () => void;
  onSend: (text: string, attachments?: ChatAttachmentRef[]) => void;
  onCancel?: () => void;
  /** C6: tenta novamente a última execução (sem duplicar mensagens). */
  onRetry?: () => void;
  canUndo?: boolean;
  onRevert?: () => void;
  onNewConversation?: () => void;
  disabled?: boolean;
  /** Atividade AO VIVO do agente (fases reais) — indicador no rodapé. */
  liveActivity?: Array<{ phase: string; detail: string }>;
}

/**
 * Progresso do agente no chat: UM único status humanizado (PT-BR), atualizado
 * durante a execução. As operações internas (read_file, list_files, design_skills,
 * write_file, terminal...) continuam acontecendo, mas NÃO são exibidas ao usuário.
 */
function ProgressBlock({ item }: { item: Extract<UnifiedChatItem, { kind: "activity" }> }) {
  const p = item.progress;
  const done = p.status === "COMPLETED";
  const errored = p.status === "ERROR" || p.status === "CANCELLED";
  const tone = errored
    ? "border-destructive/30 bg-destructive/5 text-destructive"
    : done
      ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-700"
      : "border-primary/25 bg-primary/[0.04] text-foreground";
  return (
    <div role="status" aria-live="polite" className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${tone}`}>
      {!done && !errored
        ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        : <span className="shrink-0 text-[13px] leading-none">{done ? "✅" : "⚠️"}</span>}
      <span className="text-[12.5px] font-medium">{p.message}</span>
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
  liveActivity,
}: UnifiedChatPanelProps) {
  const [text, setText] = useState("");
  const [micNotice, setMicNotice] = useState<string | null>(null);
  // ANEXOS PENDENTES: selecionar imagem NÃO envia nada — o envio só acontece no
  // botão Enviar (texto + anexos juntos). Removíveis e múltiplos.
  const [pending, setPending] = useState<ChatAttachmentRef[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Gravador de voz (estilo WhatsApp): transcreve para o CAMPO DE TEXTO — o
  // usuário revisa/edita e decide enviar. NUNCA envia sozinho.
  const rec = useVoiceRecorder({
    onTranscript: (t) => {
      setMicNotice(null);
      setText((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t));
      // foco no campo para revisar e apertar Enviar
      window.setTimeout(() => textRef.current?.focus(), 0);
    },
    onNotice: (m) => setMicNotice(m),
  });

  useEffect(() => {
    // jsdom não implementa scrollIntoView — guarda para testes/SSR.
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [items.length, running, currentAgent]);

  const canSend = (!!text.trim() || pending.length > 0) && !running && !disabled;
  const submit = () => {
    if (!canSend) return;
    const attachments = pending.length ? pending : undefined;
    // Imagem sem texto → instrução padrão (nunca dispara no momento da seleção).
    const outgoing = text.trim() || (attachments ? "Analise esta imagem e aguarde minha orientação." : "");
    if (!outgoing) return;
    // Mantém a assinatura antiga quando não há anexo (compatibilidade).
    if (attachments) onSend(outgoing, attachments); else onSend(outgoing);
    setText("");
    setPending([]);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  /** Seleciona/anexa arquivos: APENAS adiciona à lista pendente (sem enviar). */
  const attach = (files: FileList | File[] | null) => {
    if (running || disabled || !files) return;
    const list = Array.from(files).slice(0, 6);
    for (const file of list) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        if (!dataUrl) return;
        setPending((prev) => (prev.length >= 6 ? prev : [...prev, { dataUrl, label: file.name }]));
      };
      reader.readAsDataURL(file);
    }
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
        {running && currentAgent && (
          <span className="truncate text-[10px] text-muted-foreground">{currentAgent === "Planner" ? "Planejando" : "Trabalhando no projeto"}</span>
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
                  {(() => {
                    const atts = item.images?.length ? item.images : (item.image ? [{ dataUrl: item.image, label: item.fileLabel ?? "anexo" }] : []);
                    if (atts.length === 0) return null;
                    return (
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {atts.map((a, i) => (
                          a.dataUrl.startsWith("data:image")
                            ? <img key={i} src={a.dataUrl} alt={a.label} className="max-h-40 rounded-lg" />
                            : <span key={i} className="rounded bg-primary-foreground/15 px-1.5 py-0.5 text-[11px]">📎 {a.label}</span>
                        ))}
                      </div>
                    );
                  })()}
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
          if (item.kind === "activity") return <ProgressBlock key={item.id} item={item} />;
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

      {running && (
        // Indicador AO VIVO no rodapé: o que o agente está fazendo AGORA (emoji + ação).
        <div className="flex shrink-0 items-center gap-1.5 border-t border-border/40 bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
          <span className="truncate">
            {(() => {
              const live = latestWorkLine(liveActivity);
              const TOOL_WORDS = /\b(read_file|list_files|write_file|edit_file|create_file|delete_file|rename_file|move_file|run_command|design_skills|glob|grep|terminal)\b/gi;
              const label = (live?.label ?? PHASE_LABEL[phase]).replace(TOOL_WORDS, "").replace(/\s+/g, " ").trim();
              return `${live ? `${live.icon} ` : ""}${label || PHASE_LABEL[phase]}…`;
            })()}
          </span>
        </div>
      )}

      <div className="shrink-0 border-t border-border/60 p-2.5">
        {rec.recording ? (
          <VoiceRecordingBar
            seconds={rec.seconds}
            levels={rec.levels}
            onCancel={() => { rec.cancel(); setMicNotice(null); }}
            onSend={() => { rec.finish(); }}
          />
        ) : (
          <div className="space-y-2">
            {pending.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label="anexos pendentes">
                {pending.map((a, i) => (
                  <span key={`${a.label}-${i}`} className="inline-flex max-w-[180px] items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-1.5 py-1 text-[11px]">
                    {a.dataUrl.startsWith("data:image")
                      ? <img src={a.dataUrl} alt={a.label} className="h-7 w-7 rounded object-cover" />
                      : <span aria-hidden>📎</span>}
                    <span className="truncate">{a.label}</span>
                    <button
                      type="button"
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                      title={`Remover ${a.label}`}
                      aria-label={`Remover ${a.label}`}
                      onClick={() => setPending((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
            <textarea
              ref={textRef}
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
              multiple
              className="hidden"
              onChange={(e) => { attach(e.target.files); e.target.value = ""; }}
            />
            <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" disabled={running || disabled} onClick={() => fileRef.current?.click()} title="Anexar">
              <Paperclip className="h-4 w-4" />
            </Button>
            {running ? (
              <Button type="button" size="icon" variant="destructive" className="h-9 w-9 shrink-0" onClick={onCancel} title="Cancelar execução">
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <>
                {/* Mic SEMPRE disponível (ditar de novo/acrescentar); o Enviar
                    aparece quando há texto ou anexos — a transcrição NÃO envia. */}
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
                {(text.trim() || pending.length > 0) && (
                  <Button type="button" size="icon" className="h-9 w-9 shrink-0" disabled={!canSend} onClick={submit} title="Enviar">
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
            </div>
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
