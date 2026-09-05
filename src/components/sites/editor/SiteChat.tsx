import { useState, useRef, type ChangeEvent, type ReactNode } from "react";
import { Sparkles, RotateCcw, Loader2, Mic, Paperclip, Send, X, CircleDot } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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

export function SiteChat({ messages, running, error, canUndo, dirty, onApply, onRevert }: SiteChatProps) {
  const [instruction, setInstruction] = useState("");
  const [attachment, setAttachment] = useState<{ dataUrl: string; label: string } | null>(null);
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);

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

  function toggleMic() {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR || recRef.current) {
      if (recRef.current) {
        recRef.current.stop();
        recRef.current = null;
        setListening(false);
      }
      return;
    }
    try {
      const Rec = SR as new () => {
        lang: string; interimResults: boolean; onresult: (ev: unknown) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void;
      };
      const rec = new Rec();
      rec.lang = "pt-BR";
      rec.interimResults = false;
      rec.onresult = (ev: unknown) => {
        const results = (ev as { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }).results;
        if (results) {
          const text = Array.from(results).map((r) => r[0]?.transcript ?? "").join(" ");
          setInstruction((prev) => (prev ? `${prev} ${text}` : text).trim());
        }
      };
      rec.onend = () => { recRef.current = null; setListening(false); };
      rec.onerror = () => { recRef.current = null; setListening(false); };
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      setListening(false);
    }
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
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/[0.06] to-transparent p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
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

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground px-1 pt-1">
            Fale como você quer o site — ex.: <em>“deixa o hero mais sofisticado”</em>, <em>“agora mais escuro”</em>, <em>“troca essa imagem”</em>, <em>“volta”</em>. Anexos e voz também funcionam.
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
            <Loader2 className="h-3 w-3 animate-spin text-primary" /> editando o site…
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive">{error}</p>
      )}

      {attachment && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-border/70 bg-card px-2 py-1.5 text-xs text-muted-foreground">
          {attachment.dataUrl.startsWith("data:image") ? <img src={attachment.dataUrl} alt="anexo" className="h-10 w-10 rounded object-cover" /> : <span>📎</span>}
          <span className="flex-1 truncate">{attachment.label || "Anexo"}</span>
          <button type="button" onClick={() => setAttachment(null)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="mt-2 space-y-2">
        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Deixa o hero mais sofisticado…"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="text-sm"
        />
        <div className="flex items-center gap-1.5">
          <input ref={fileRef} type="file" accept="image/*,.pdf,.txt,.doc,.docx" className="hidden" onChange={handleFile} />
          <button type="button" onClick={() => fileRef.current?.click()} title="Anexar foto ou arquivo" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors">
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleMic}
            title={listening ? "Parar gravação" : "Gravar com voz"}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${listening ? "animate-pulse border-red-400/70 bg-red-500/10 text-red-500" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}
          >
            <Mic className="h-4 w-4" />
          </button>
          <Button size="sm" className="h-8 flex-1" disabled={running || (!instruction.trim() && !attachment)} onClick={send}>
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
            Aplicar
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">Anexos ficam nesta conversa (sessão) como referência. Voz usa o reconhecimento do navegador.</p>
      </div>
    </div>
  );
}
