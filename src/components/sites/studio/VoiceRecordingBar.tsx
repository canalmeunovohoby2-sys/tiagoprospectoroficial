import { Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface VoiceRecordingBarProps {
  seconds: number;
  /** Níveis de áudio (0..1). Vazio → barras animadas por CSS. */
  levels: number[];
  onCancel: () => void;
  onSend: () => void;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Barra de gravação no estilo WhatsApp: ponto vermelho pulsando, timer, ondas de
 * áudio, lixeira (cancelar) e ✓ (enviar). Substitui o campo de texto enquanto grava.
 */
export function VoiceRecordingBar({ seconds, levels, onCancel, onSend }: VoiceRecordingBarProps) {
  const bars = levels.length > 0 ? levels.slice(-28) : null;
  return (
    <div className="flex w-full items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-2.5 py-1.5">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
      </span>
      <span className="shrink-0 text-[12px] font-semibold tabular-nums text-red-600" aria-label="tempo de gravação">
        {fmt(seconds)}
      </span>

      <div className="flex h-6 min-w-0 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden="true">
        {bars
          ? bars.map((v, i) => (
              <span
                key={i}
                className="w-[3px] shrink-0 rounded-full bg-red-400/80"
                style={{ height: `${Math.max(12, Math.round(v * 100))}%` }}
              />
            ))
          : Array.from({ length: 16 }).map((_, i) => (
              <span
                key={i}
                className="w-[3px] shrink-0 animate-pulse rounded-full bg-red-400/60"
                style={{ height: `${25 + ((i * 37) % 60)}%`, animationDelay: `${(i % 8) * 90}ms` }}
              />
            ))}
      </div>

      <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">Fale agora…</span>

      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={onCancel} title="Cancelar gravação">
        <Trash2 className="h-4 w-4" />
      </Button>
      <Button type="button" size="icon" className="h-8 w-8 shrink-0 bg-red-500 text-white hover:bg-red-600" onClick={onSend} title="Enviar gravação">
        <Check className="h-4 w-4" />
      </Button>
    </div>
  );
}
