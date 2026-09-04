import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Stethoscope, Sparkles, CalendarClock, MessagesSquare, Building2, Check, Star,
} from "lucide-react";
import type { Lead, CrmStatus } from "@/data/types";
import { CRM_COLUMNS } from "@/data/brazil";
import { supabase } from "@/integrations/supabase/client";
import { computeOrvixDiagnostic, opportunityBadgeClass } from "@/lib/orvixDiagnostics";

interface OrvixCrmPanelProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadChange?: (patch: Partial<Lead>) => void;
}

/**
 * Orvix CRM Panel — reutiliza o CRM existente (mesmo crm_status, mesma tabela leads)
 * exibindo informações específicas da venda Orvix (ERP Score, diagnóstico, próximo
 * retorno, última abordagem). Campos "extras" ficam em memória (localStorage) nesta
 * primeira etapa — nenhuma nova tabela/coluna criada.
 */
export function OrvixCrmPanel({ lead, open, onOpenChange, onLeadChange }: OrvixCrmPanelProps) {
  const diag = useMemo(() => (lead ? computeOrvixDiagnostic(lead) : null), [lead]);
  const storageKey = lead ? `orvix:crm:${lead.id}` : null;

  const [nextFollowUp, setNextFollowUp] = useState("");
  const [lastApproach, setLastApproach] = useState<"whatsapp" | "email" | "ligacao" | "resumo" | "">("");
  const [contactNote, setContactNote] = useState("");

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      const data = raw ? JSON.parse(raw) : {};
      setNextFollowUp(data.nextFollowUp ?? "");
      setLastApproach(data.lastApproach ?? "");
      setContactNote(data.contactNote ?? "");
    } catch {
      setNextFollowUp(""); setLastApproach(""); setContactNote("");
    }
  }, [storageKey]);

  const persistLocal = (patch: Record<string, unknown>) => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      const data = raw ? JSON.parse(raw) : {};
      localStorage.setItem(storageKey, JSON.stringify({ ...data, ...patch }));
    } catch {/* ignore */}
  };

  const updateLead = async (patch: Partial<Lead>) => {
    if (!lead) return;
    const { error } = await supabase.from("leads").update(patch).eq("id", lead.id);
    if (error) { toast.error(error.message); return; }
    onLeadChange?.(patch);
  };

  const markContactedNow = async () => {
    if (!lead) return;
    const now = new Date().toISOString();
    persistLocal({ contactNote, lastContactAt: now });
    await updateLead({ is_contacted: true });
    toast.success("Contato registrado");
  };

  const lastContactAt = (() => {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      const data = raw ? JSON.parse(raw) : {};
      return data.lastContactAt as string | undefined;
    } catch { return null; }
  })();

  const fmtDate = (iso?: string | null) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); }
    catch { return "—"; }
  };

  const approachLabel: Record<string, string> = {
    whatsapp: "WhatsApp", email: "E-mail", ligacao: "Ligação", resumo: "Resumo 30s",
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {lead && diag && (
          <>
            <SheetHeader className="space-y-2 text-left">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary/80 font-semibold">
                <Sparkles className="h-3.5 w-3.5" /> Orvix · CRM
              </div>
              <SheetTitle className="font-display text-xl">{lead.name}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-1.5 text-xs">
                {lead.category && <span>{lead.category}</span>}
                {(lead.city || lead.state) && (
                  <span>· {[lead.city, lead.state].filter(Boolean).join("/")}</span>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-5">
              {/* Status visual da oportunidade */}
              <section className="rounded-lg border border-border/50 bg-card/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Stethoscope className="h-4 w-4 text-primary" /> ERP Score
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-2xl font-bold tabular-nums">
                      {diag.erpScore}<span className="text-xs text-muted-foreground font-sans font-normal">/100</span>
                    </span>
                    <Badge variant="outline" className={opportunityBadgeClass(diag.opportunity)}>
                      {diag.opportunity}
                    </Badge>
                  </div>
                </div>
                <Progress value={diag.erpScore} className="h-2" />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" /> {diag.segmentLabel}
                </div>
              </section>

              {/* Diagnóstico resumido */}
              <section className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Diagnóstico resumido</p>
                <p className="text-sm rounded-lg border border-primary/20 bg-primary/5 p-3 leading-relaxed">
                  {diag.pitch}
                </p>
                <div className="flex flex-wrap gap-1">
                  {diag.modules.slice(0, 6).map((m) => (
                    <Badge key={m} variant="outline" className="text-[10px] border-border/60">{m}</Badge>
                  ))}
                </div>
              </section>

              <Separator />

              {/* CRM — reutiliza crm_status existente */}
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Pipeline (CRM)</p>
                <Select
                  value={lead.crm_status}
                  onValueChange={(v) => updateLead({ crm_status: v as CrmStatus, in_crm: true })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CRM_COLUMNS.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateLead({ is_favorite: !lead.is_favorite })}
                  >
                    <Star className={`h-3.5 w-3.5 mr-1 ${lead.is_favorite ? "fill-amber-400 text-amber-400" : ""}`} />
                    {lead.is_favorite ? "Desfavoritar" : "Favoritar"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={markContactedNow}>
                    <Check className="h-3.5 w-3.5 mr-1" /> Marcar contato agora
                  </Button>
                </div>
              </section>

              {/* Informações extras (in-memory) */}
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Acompanhamento Orvix</p>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-muted/40">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Último contato</div>
                    <div className="text-sm">{fmtDate(lastContactAt) === "—" && lead.is_contacted ? fmtDate(lead.updated_at) : fmtDate(lastContactAt)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Última abordagem</div>
                    <div className="text-sm">{lastApproach ? approachLabel[lastApproach] : "—"}</div>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
                    <CalendarClock className="h-3.5 w-3.5" /> Próximo retorno
                  </label>
                  <Input
                    type="datetime-local"
                    value={nextFollowUp}
                    onChange={(e) => { setNextFollowUp(e.target.value); persistLocal({ nextFollowUp: e.target.value }); }}
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
                    <MessagesSquare className="h-3.5 w-3.5" /> Registrar última abordagem
                  </label>
                  <Select
                    value={lastApproach || undefined}
                    onValueChange={(v) => {
                      setLastApproach(v as typeof lastApproach);
                      persistLocal({ lastApproach: v });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecionar canal…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="ligacao">Ligação</SelectItem>
                      <SelectItem value="resumo">Resumo 30s</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nota do último contato</label>
                  <Textarea
                    rows={3}
                    value={contactNote}
                    onChange={(e) => setContactNote(e.target.value)}
                    onBlur={() => persistLocal({ contactNote })}
                    placeholder="Ex.: falamos com o gerente, retornar terça 14h…"
                  />
                </div>
              </section>

              <p className="text-[10px] text-muted-foreground text-center pt-2">
                Pipeline sincronizado com o CRM · campos de acompanhamento salvos localmente
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
