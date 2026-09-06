import { useState, useRef, useEffect, useCallback, type ChangeEvent, type ReactNode } from "react";
import { Sparkles, RotateCcw, Loader2, Mic, Paperclip, Send, X, CircleDot, ArrowDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { QUICK_STRATEGIES } from "@/lib/siteStrategies";

export interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  image?: string;
  fileLabel?: string;
}

interface SiteChatProps {
  messages: ChatMsg[];
  running: boolean;
  error: string | null;
  canUndo: boolean;
  dirty: boolean;
  onApply: (instruction: string, attachment?: { dataUrl: string; label: string }) => void;
  onRevert: () => void;
  runningLabel?: string;
  onQuickStrategy?: (id: string) => void;
  quickStrategyDisabled?: boolean;
  /** Atividades REAIS transmitidas ao vivo pelo runtime (5.34). */
  liveActivity?: Array<{ phase: string; detail: string }>;
}

function fileToDataUrl(file: File): Promise<{ dataUrl: string; label: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: String(reader.result), label: file.name });
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const MAX = 1024;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Canvas indisponível")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.82), label: file.name });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagem inválida")); };
    img.src = url;
  });
}

const LIVE_ICONS: Record<string, string> = {
  analyzing: "🔎",
  editing: "🛠️",
  researching: "🌐",
  testing: "🧪",
  fixing: "🔧",
  done: "✅",
  reviewing: "🔎",
};

function liveIcon(phase: string, detail: string): string {
  if (phase === "verifying") return /visual_review|gemini|análise visual|analise visual/i.test(detail) ? "👁️" : "🌐";
  return LIVE_ICONS[phase] ?? "⚙️";
}

export function SiteChat({ messages, running, error, canUndo, dirty, runningLabel, onQuickStrategy, quickStrategyDisabled, liveActivity, onApply, onRevert }: SiteChatProps) {
  const [instruction, setInstruction] = useState("");
  const [attachment, setAttachment] = useState<{ dataUrl: string; label: string } | null>(null);
  const [listening, setListening] = useState(false);
  const [nearBottom, setNearBottom] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const keepMicRef = useRef(false);
  const lastFinalRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // Rolagem automática: acompanha o fim quando o usuário já está no fim;
  // NÃO rouba o scroll quando o usuário está lendo histórico.
  useEffect(() => {
    if (nearBottom && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages.length, running, nearBottom]);

  useEffect(() => {
    setNearBottom(isNearBottom());
  }, [messages.length, running, isNearBottom]);

  function handleScroll() {
    const near = isNearBottom();
    atBottomRef.current = near;
    setNearBottom(near);
    setShowJump(!near);
  }

  function jumpToEnd() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setNearBottom(true);
    setShowJump(false);
  }

  function handleKeyScroll(e: React.KeyboardEvent) {
    if (e.key === "PageDown") {
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = Math.min(el.scrollHeight, el.scrollTop + el.clientHeight * 0.8);
        setNearBottom(isNearBottom());
      }
    }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setAttachment(await fileToDataUrl(file));
    } catch {
      setAttachment({ dataUrl: "", label: file.name });
    }
  }

  function stopMic() {
    keepMicRef.current = false;
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      try { rec.stop(); } catch { /* já parado */ }
    }
    setListening(false);
  }

  // Gravação contínua: ao clicar, grava e SÓ PARA quando clicar de novo. O
  // reconhecimento do navegador pode encerrar sozinho após uma fala — nesse caso
  // a sessão reinicia automaticamente até o usuário pedir para parar.
  function toggleMic() {
    if (keepMicRef.current) { stopMic(); return; }
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const Rec = SR as new () => {
      lang: string; continuous: boolean; interimResults: boolean;
      onresult: (ev: unknown) => void; onend: () => void; onerror: (e: { error?: string }) => void;
      start: () => void; stop: () => void;
    };
    lastFinalRef.current = "";
    keepMicRef.current = true;

    const startSession = () => {
      if (!keepMicRef.current) return;
      try {
        const rec = new Rec();
        rec.lang = "pt-BR";
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (ev: unknown) => {
          const results = (ev as { results?: ArrayLike<ArrayLike<{ transcript?: string }> & { isFinal?: boolean }> }).results;
          if (!results) return;
          const finals = Array.from(results).filter((r) => r?.isFinal).map((r) => r[0]?.transcript ?? "").join(" ").trim();
          if (finals && finals !== lastFinalRef.current) {
            lastFinalRef.current = finals;
            setInstruction((prev) => (prev ? `${prev} ${finals}` : finals).trim());
          }
        };
        rec.onend = () => {
          // Encerrou por si só (fim de frase/silêncio) → continua gravando.
          if (keepMicRef.current) startSession();
          else { recRef.current = null; setListening(false); }
        };
        rec.onerror = (e) => {
          const err = e?.error ?? "";
          if (err === "not-allowed" || err === "service-not-allowed" || err === "not-supported") {
            stopMic();
          } else if (keepMicRef.current) {
            // erro temporário (ex.: no-speech/audio-capture) → tenta seguir gravando
            startSession();
          }
        };
        recRef.current = rec;
        rec.start();
        setListening(true);
      } catch {
        stopMic();
      }
    };
    startSession();
  }

  function send() {
    if (running) return;
    const value = instruction.trim();
    if (!value && !attachment) return;
    onApply(value || "Aplique a alteração considerando o anexo.", attachment ?? undefined);
    setInstruction("");
    setAttachment(null);
  }

  const renderText = (text: string): ReactNode => {
    const parts = text.split(/\[([^\]]+)\]/g);
    return parts.map((p, i) =>
      i % 2 === 1
        ? <span key={i} className="rounded bg-amber-300/20 px-1 text-amber-600">{p}</span>
        : p,
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/[0.06] to-transparent p-3">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> Construtor com IA
        </p>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10.5px] ${dirty ? "border-amber-400/50 text-amber-500 bg-amber-500/10" : "border-border/60 text-muted-foreground"}`}>
            <CircleDot className={`h-2.5 w-2.5 ${dirty ? "animate-pulse" : ""}`} />
            {dirty ? "Alterações não salvas" : "Tudo salvo"}
          </span>
          {canUndo && !running && (
            <button type="button" onClick={onRevert} title="Volta para antes da última alteração" className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
              <RotateCcw className="h-3 w-3" /> Desfazer
            </button>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={handleScroll} onKeyDown={handleKeyScroll} tabIndex={0} role="log" aria-live="polite" className="h-full space-y-2 overflow-y-auto overflow-x-hidden pr-1 outline-none [scrollbar-width:thin] [scrollbar-color:rgb(148_163_184/0.4)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/70">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground px-1 pt-1">
              Converse com o seu diretor de criação: peça mudanças (<em>“deixa o hero mais sofisticado”</em>, <em>“agora mais escuro”</em>, <em>“troca essa imagem”</em>) ou tire dúvidas (<em>“o que dá pra melhorar?”</em>, <em>“como está o site?”</em>). Anexos e voz também funcionam.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[94%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed shadow-sm ${m.role === "user" ? "ml-auto bg-primary/15 border border-primary/25" : "bg-card border border-border/60"}`}>
              {m.image && m.image.startsWith("data:image") && <img src={m.image} alt="anexo" className="mb-1.5 max-h-28 rounded-lg border border-border/60 object-cover" />}
              {m.fileLabel && !(m.image && m.image.startsWith("data:image")) && <p className="mb-1 text-[11px] text-muted-foreground">📎 {m.fileLabel}</p>}
              <p className="whitespace-pre-wrap">{renderText(m.text)}</p>
            </div>
          ))}
          {running && (
            <div className="inline-flex items-center gap-1.5 rounded-2xl border border-border/60 bg-card px-3 py-2 text-[12.5px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-primary" /> {runningLabel ?? "analisando, editando e refinando…"}
            </div>
          )}
        </div>

        {showJump && (
          <button type="button" onClick={jumpToEnd} className="absolute bottom-3 right-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-lg transition-colors hover:text-foreground hover:border-primary/50" title="Ir para as mensagens recentes">
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="relative flex flex-col">
        {running && liveActivity && liveActivity.length > 0 && (
          <div className="mb-2 shrink-0 rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary/90">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              Executando agora
            </div>
            <ul className="mt-1.5 space-y-1">
              {liveActivity.slice(-6).map((a, i) => (
                <li
                  key={`${i}-${a.detail}`}
                  className={`flex items-start gap-1.5 text-xs leading-snug ${i === liveActivity.slice(-6).length - 1 ? "font-medium text-foreground" : "text-muted-foreground/90"}`}
                >
                  <span className="shrink-0" aria-hidden>{liveIcon(a.phase, a.detail)}</span>
                  <span className="min-w-0 break-words">{a.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mb-2 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10.5px] font-medium text-muted-foreground">Comandos rápidos</p>
            {quickStrategyDisabled && running && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> em execução…
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-1.5 [grid-auto-rows:1fr] min-[420px]:grid-cols-2 lg:grid-cols-4">
            {QUICK_STRATEGIES.map((s) => {
              const disabled = running || quickStrategyDisabled;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onQuickStrategy?.(s.id)}
                  title={`${s.label}${s.analyzeOnly ? " (só análise)" : ""} — ${s.hint}`}
                  className="flex h-full w-full min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-border/70 bg-card/60 px-1.5 py-2 text-center transition-colors hover:border-primary/45 hover:bg-primary/[0.07] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border/70 disabled:hover:bg-card/60"
                >
                  <span className="text-base leading-none shrink-0" aria-hidden>{s.emoji}</span>
                  <span className="w-full min-h-0 text-[10px] font-medium leading-snug text-foreground/90">
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {error && (
          <p className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive">{error}</p>
        )}

        {attachment && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-border/70 bg-card px-2 py-1.5 text-xs text-muted-foreground">
            {attachment.dataUrl.startsWith("data:image") ? <img src={attachment.dataUrl} alt="anexo" className="h-10 w-10 rounded object-cover" /> : <span>📎</span>}
            <span className="flex-1 truncate">{attachment.label || "Anexo"}</span>
            <button type="button" onClick={() => setAttachment(null)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        <div className="space-y-2">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Deixa o hero mais sofisticado…"
            rows={2}
            className="max-h-36 min-h-[2.5rem] text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="flex items-center gap-1.5">
            <input ref={fileRef} type="file" accept="image/*,.pdf,.txt,.doc,.docx" className="hidden" onChange={handleFile} />
            <button type="button" onClick={() => fileRef.current?.click()} title="Anexar foto ou arquivo" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors">
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggleMic}
              title={listening ? "Parar gravação" : "Gravar com voz"}
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${listening ? "border-red-400/70 bg-red-500/10 text-red-500" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}
            >
              {listening ? (
                <span className="voice-bars" aria-hidden>
                  <span style={{ animationDelay: "0ms" }} />
                  <span style={{ animationDelay: "160ms" }} />
                  <span style={{ animationDelay: "320ms" }} />
                  <span style={{ animationDelay: "80ms" }} />
                </span>
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
            <Button size="sm" className="h-8 flex-1" disabled={running || (!instruction.trim() && !attachment)} onClick={send}>
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
              Enviar
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Anexos ficam nesta conversa (sessão) como referência. Voz usa o reconhecimento do navegador.</p>
        </div>
      </div>
    </div>
  );
}
