import { useState } from "react";
import { toast } from "sonner";
import {
  MessageCircle, Mail, Phone, Zap, Copy, Check, Sparkles, HandshakeIcon,
  Coffee, AlertTriangle, Wrench, Rocket, Brain, Loader2, Clock,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Lead } from "@/data/types";
import { generateOrvixApproach } from "@/lib/orvixApproach";
import { opportunityBadgeClass, computeOrvixDiagnostic } from "@/lib/orvixDiagnostics";
import { supabase } from "@/integrations/supabase/client";

type OrvixAiResult = {
  whatsapp_curta: string;
  whatsapp_consultiva: string;
  ligacao: string;
  follow_up: string;
  model: string;
};

interface OrvixApproachDialogProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success(`${label} copiado`);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast.error("Não foi possível copiar");
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
      {copied ? "Copiado" : `Copiar ${label}`}
    </Button>
  );
}

/**
 * Orvix ERP — Abordagem Comercial personalizada (visual, in-memory, sem IA).
 */
export function OrvixApproachDialog({ lead, open, onOpenChange }: OrvixApproachDialogProps) {
  const approach = lead ? generateOrvixApproach(lead) : null;
  const [aiLoading, setAiLoading] = useState(false);
  const [ai, setAi] = useState<OrvixAiResult | null>(null);

  async function handleGenerateAi() {
    if (!lead) return;
    setAiLoading(true);
    try {
      const diag = computeOrvixDiagnostic(lead);
      const { data, error } = await supabase.functions.invoke<OrvixAiResult>("generate-orvix-message", {
        body: {
          lead: {
            name: lead.name,
            segment: lead.segment,
            city: lead.city,
            state: lead.state,
            rating: lead.rating,
            reviews_count: lead.reviews_count,
            has_website: lead.has_website,
            website: lead.website,
            instagram: lead.instagram,
          },
          diagnostic: {
            erpScore: diag.erpScore,
            opportunity: diag.opportunity,
            probabilityText: diag.probabilityText,
            recommendedFocus: diag.recommendedFocus,
            segmentLabel: diag.segmentLabel,
            modules: diag.modules,
            pains: diag.pains,
            pitch: diag.pitch,
          },
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.whatsapp_curta) throw new Error("Retorno vazio da IA");
      setAi(data);
      toast.success("Mensagens Orvix geradas com IA");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao gerar com IA";
      toast.error(msg);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-primary/10 via-card to-card/40 border-b border-border/50 p-6">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary/80 font-semibold">
              <Sparkles className="h-3.5 w-3.5" /> Orvix ERP · Abordagem Comercial
            </div>
            <DialogTitle className="font-display text-2xl">
              {lead?.name ?? "Abordagem"}
            </DialogTitle>
            {approach && (
              <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5">
                  {approach.diagnostic.segmentLabel}
                </Badge>
                <Badge variant="outline" className={opportunityBadgeClass(approach.diagnostic.opportunity)}>
                  ERP {approach.diagnostic.erpScore} · {approach.diagnostic.opportunity}
                </Badge>
              </DialogDescription>
            )}
          </DialogHeader>
        </div>

        {approach && (
          <ScrollArea className="max-h-[70vh]">
            <div className="p-6 space-y-6">
              {/* Estrutura em 5 blocos */}
              <section className="grid gap-3">
                <StructureBlock icon={<HandshakeIcon className="h-4 w-4" />} title="Saudação" text={approach.sections.saudacao} />
                <StructureBlock icon={<Coffee className="h-4 w-4" />} title="Quebra-gelo" text={approach.sections.quebraGelo} />
                <StructureBlock icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} title="Problema identificado" text={approach.sections.problema} />
                <StructureBlock icon={<Wrench className="h-4 w-4 text-primary" />} title="Como a Orvix resolve" text={approach.sections.solucao} />
                <StructureBlock icon={<Rocket className="h-4 w-4 text-primary" />} title="Chamada para ação" text={approach.sections.cta} />
              </section>

              {/* Variantes por canal */}
              <section>
                <Tabs defaultValue="whatsapp">
                  <TabsList className="grid grid-cols-4 w-full">
                    <TabsTrigger value="whatsapp"><MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp</TabsTrigger>
                    <TabsTrigger value="email"><Mail className="h-3.5 w-3.5 mr-1" /> E-mail</TabsTrigger>
                    <TabsTrigger value="ligacao"><Phone className="h-3.5 w-3.5 mr-1" /> Ligação</TabsTrigger>
                    <TabsTrigger value="resumo"><Zap className="h-3.5 w-3.5 mr-1" /> 30s</TabsTrigger>
                  </TabsList>

                  <TabsContent value="whatsapp" className="space-y-3 mt-4">
                    <ChannelPanel text={approach.whatsapp} />
                    <div className="flex justify-end">
                      <CopyButton text={approach.whatsapp} label="WhatsApp" />
                    </div>
                  </TabsContent>

                  <TabsContent value="email" className="space-y-3 mt-4">
                    <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-xs">
                      <span className="text-muted-foreground">Assunto:</span>{" "}
                      <span className="text-foreground font-medium">{approach.email.subject}</span>
                    </div>
                    <ChannelPanel text={approach.email.body} />
                    <div className="flex justify-end gap-2">
                      <CopyButton text={approach.email.subject} label="Assunto" />
                      <CopyButton text={`${approach.email.subject}\n\n${approach.email.body}`} label="E-mail" />
                    </div>
                  </TabsContent>

                  <TabsContent value="ligacao" className="space-y-3 mt-4">
                    <ChannelPanel text={approach.ligacao} />
                    <div className="flex justify-end">
                      <CopyButton text={approach.ligacao} label="Ligação" />
                    </div>
                  </TabsContent>

                  <TabsContent value="resumo" className="space-y-3 mt-4">
                    <ChannelPanel text={approach.resumo30s} />
                    <div className="flex justify-end">
                      <CopyButton text={approach.resumo30s} label="Resumo" />
                    </div>
                  </TabsContent>
                </Tabs>
              </section>

              {/* ---------------- Camada IA Orvix (opcional) ---------------- */}
              <section className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">IA Orvix — vendedor consultivo</p>
                      <p className="text-[11px] text-muted-foreground">
                        Gera mensagens personalizadas para este lead usando o contexto real da Orvix (ERP/PDV) e o diagnóstico.
                      </p>
                    </div>
                  </div>
                  <Button size="sm" onClick={handleGenerateAi} disabled={aiLoading} className="bg-primary hover:bg-primary/90">
                    {aiLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                    {aiLoading ? "Gerando…" : ai ? "Regerar com IA" : "Gerar com IA"}
                  </Button>
                </div>

                {ai && (
                  <Tabs defaultValue="curta" className="mt-2">
                    <TabsList className="grid grid-cols-4 w-full">
                      <TabsTrigger value="curta"><MessageCircle className="h-3.5 w-3.5 mr-1" /> Curta</TabsTrigger>
                      <TabsTrigger value="consultiva"><MessageCircle className="h-3.5 w-3.5 mr-1" /> Consultiva</TabsTrigger>
                      <TabsTrigger value="ligacao"><Phone className="h-3.5 w-3.5 mr-1" /> Ligação</TabsTrigger>
                      <TabsTrigger value="followup"><Clock className="h-3.5 w-3.5 mr-1" /> Follow-up</TabsTrigger>
                    </TabsList>
                    <TabsContent value="curta" className="space-y-3 mt-4">
                      <ChannelPanel text={ai.whatsapp_curta} />
                      <div className="flex justify-end"><CopyButton text={ai.whatsapp_curta} label="Curta" /></div>
                    </TabsContent>
                    <TabsContent value="consultiva" className="space-y-3 mt-4">
                      <ChannelPanel text={ai.whatsapp_consultiva} />
                      <div className="flex justify-end"><CopyButton text={ai.whatsapp_consultiva} label="Consultiva" /></div>
                    </TabsContent>
                    <TabsContent value="ligacao" className="space-y-3 mt-4">
                      <ChannelPanel text={ai.ligacao} />
                      <div className="flex justify-end"><CopyButton text={ai.ligacao} label="Ligação" /></div>
                    </TabsContent>
                    <TabsContent value="followup" className="space-y-3 mt-4">
                      <ChannelPanel text={ai.follow_up} />
                      <div className="flex justify-end"><CopyButton text={ai.follow_up} label="Follow-up" /></div>
                    </TabsContent>
                  </Tabs>
                )}

                {ai && (
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Modelo: <span className="font-mono">{ai.model}</span> · Gerado sob demanda, nada é salvo.
                  </p>
                )}
              </section>

              <p className="text-[10px] text-muted-foreground text-center pt-2">
                Abordagem base gerada em memória · camada IA opcional acima
              </p>

            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StructureBlock({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {icon} {title}
      </div>
      <p className="text-sm text-foreground/90 mt-1.5 leading-relaxed">{text}</p>
    </div>
  );
}

function ChannelPanel({ text }: { text: string }) {
  return (
    <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90 leading-relaxed rounded-lg border border-primary/20 bg-primary/5 p-4">
      {text}
    </pre>
  );
}
