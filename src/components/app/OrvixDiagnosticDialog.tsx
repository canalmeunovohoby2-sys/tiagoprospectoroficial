import { Stethoscope, Sparkles, Layers, AlertTriangle, Target, Building2, Compass } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Lead } from "@/data/types";
import { computeOrvixDiagnostic, opportunityBadgeClass, opportunityHeadline } from "@/lib/orvixDiagnostics";

interface OrvixDiagnosticDialogProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Orvix ERP — Diagnóstico Comercial (visual, in-memory).
 * Nada é salvo. Todos os campos vêm de computeOrvixDiagnostic().
 */
export function OrvixDiagnosticDialog({ lead, open, onOpenChange }: OrvixDiagnosticDialogProps) {
  const diag = lead ? computeOrvixDiagnostic(lead) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-primary/10 via-card to-card/40 border-b border-border/50 p-6">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary/80 font-semibold">
              <Stethoscope className="h-3.5 w-3.5" /> Orvix ERP · Diagnóstico Comercial
            </div>
            <DialogTitle className="font-display text-2xl">
              {lead?.name ?? "Diagnóstico"}
            </DialogTitle>
            {lead && (
              <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
                {lead.category && <span>{lead.category}</span>}
                {(lead.city || lead.state) && (
                  <span>· {[lead.city, lead.state].filter(Boolean).join("/")}</span>
                )}
              </DialogDescription>
            )}
          </DialogHeader>
        </div>

        {diag && (
          <ScrollArea className="max-h-[70vh]">
            <div className="p-6 space-y-6">
              {/* ERP Score + Oportunidade */}
              <section className="rounded-lg border border-border/50 bg-card/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">ERP Score Orvix</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-3xl font-bold tabular-nums">
                      {diag.erpScore}
                      <span className="text-sm text-muted-foreground font-sans font-normal">/100</span>
                    </span>
                    <Badge variant="outline" className={opportunityBadgeClass(diag.opportunity)}>
                      {opportunityHeadline(diag.opportunity)}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-foreground/80 italic">
                  {diag.probabilityText}
                </p>
                <Progress value={diag.erpScore} className="h-2" />
                <details className="text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">
                    Como este score foi calculado
                  </summary>
                  <ul className="mt-2 space-y-0.5 pl-4 list-disc">
                    {diag.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </details>
              </section>

              {/* Argumento recomendado — 1 linha */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Compass className="h-4 w-4 text-primary" /> Argumento recomendado
                </div>
                <p className="text-sm text-foreground/90 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                  {diag.recommendedFocus}
                </p>
              </section>

              {/* Segmento */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="h-4 w-4 text-primary" /> Segmento identificado
                </div>
                <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5">
                  {diag.segmentLabel}
                </Badge>
              </section>

              {/* Módulos recomendados */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Layers className="h-4 w-4 text-primary" /> Módulos Orvix recomendados
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {diag.modules.map((m) => (
                    <Badge key={m} variant="outline" className="border-border/60">
                      {m}
                    </Badge>
                  ))}
                </div>
              </section>

              {/* Dores prováveis */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Dores prováveis
                </div>
                <ul className="space-y-1.5">
                  {diag.pains.map((p) => (
                    <li key={p} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 rounded-full bg-amber-500 shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </section>

              {/* Argumento de venda */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Target className="h-4 w-4 text-primary" /> Argumento de venda
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed rounded-lg border border-primary/20 bg-primary/5 p-4">
                  {diag.pitch}
                </p>
              </section>

              <p className="text-[10px] text-muted-foreground text-center pt-2">
                Diagnóstico calculado em tempo real · nenhuma informação salva
              </p>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
