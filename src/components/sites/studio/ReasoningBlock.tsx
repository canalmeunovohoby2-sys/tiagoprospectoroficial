import { useEffect, useRef, useState } from "react";
import { BrainCircuit, ChevronRight, Loader2 } from "lucide-react";
import type { StudioThoughtItem } from "@/lib/studio/interactions";
import { normalizeThought, reasoningAriaLabel, reasoningLabel } from "@/lib/studio/reasoning";

export interface ReasoningBlockProps {
  thoughts: StudioThoughtItem[];
  /** `true` enquanto o agente ainda está pensando/trabalhando nesta execução. */
  streaming: boolean;
}

/**
 * "Pensando…": mostra o raciocínio do agente AO VIVO no chat e o RECOLHE quando a
 * resposta final chega — o pensamento é temporário, a resposta permanece.
 *
 * - Durante a execução: aberto, com indicador pulsante e o texto crescendo.
 * - Ao concluir: fecha sozinho e vira uma linha ("Raciocínio · N etapas") que o
 *   usuário pode reabrir quando quiser. O conteúdo só existe no DOM quando aberto.
 */
export function ReasoningBlock({ thoughts, streaming }: ReasoningBlockProps) {
  const [open, setOpen] = useState(streaming);
  const wasStreaming = useRef(streaming);
  const tailRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (streaming) {
      wasStreaming.current = true;
      setOpen(true);
      return;
    }
    // Transição pensando → concluído: o raciocínio se recolhe (a resposta fica).
    if (wasStreaming.current) {
      wasStreaming.current = false;
      setOpen(false);
    }
  }, [streaming]);

  const lastLength = thoughts.length ? thoughts[thoughts.length - 1].content.length : 0;
  useEffect(() => {
    if (!streaming || !open) return;
    tailRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [streaming, open, thoughts.length, lastLength]);

  if (thoughts.length === 0) return null;

  const label = reasoningLabel(streaming, thoughts.length);

  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        streaming ? "border-primary/20 bg-primary/[0.03]" : "border-border/50 bg-muted/20"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={reasoningAriaLabel(streaming, thoughts.length)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
      >
        {streaming
          ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          : <BrainCircuit className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className={`text-[11.5px] font-medium ${streaming ? "text-primary" : "text-muted-foreground"}`}>
          {label}
        </span>
        <ChevronRight
          className={`ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-1.5 border-t border-border/40 px-3 py-2">
          {thoughts.map((t) => (
            <p key={t.id} className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground/80">
              {normalizeThought(t.content)}
            </p>
          ))}
          {streaming && (
            <span ref={tailRef} className="inline-block h-3 w-1.5 animate-pulse rounded-sm bg-primary/70" aria-hidden />
          )}
        </div>
      )}
    </div>
  );
}
