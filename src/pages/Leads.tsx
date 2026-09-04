import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Star, Globe, MapPin, Phone, MessageSquare, Sparkles, Eye, Check,
  Search as SearchIcon, Trash2, Loader2, Instagram, Facebook, ExternalLink, Map as MapIcon, Copy, Plus,
  FileCode2,
  ShieldCheck, Shield, ShieldAlert, Clock, Download, ClipboardCopy,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Lead, CrmStatus } from "@/data/types";
import { CRM_COLUMNS } from "@/data/brazil";
import { LandingPromptButton } from "@/components/app/LandingPromptButton";
import { RoiBadge } from "@/components/app/RoiBadge";
import { getLeadTemperature, buildScoreReasons, enrichLeadWithScores } from "@/lib/leadScoring";

import { WhatsAppTemplatePicker, TEMPLATE_TEXTS, type WaTemplate } from "@/components/app/WhatsAppTemplatePicker";
import { OfferCard } from "@/components/app/OfferCard";

import { useWaitingQueue } from "@/hooks/useWaitingQueue";
import { calculateLeadROI } from "@/lib/leadROI";
import { openOrCreateSiteProject } from "@/lib/siteProjectsApi";
import { ListChecks } from "lucide-react";

type Filter =
  | "all"
  | "favorites"
  | "contacted"
  | "no-website"
  | "high-score"
  | "royal"
  | "high-roi"
  | "with-whatsapp"
  | "with-instagram"
  | "no-instagram"
  | "top-rated";

function normalizeLeadRows(rows: unknown): Lead[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const lead = row as Lead & { score_reasons?: unknown; opening_hours?: unknown };
    const base: Lead = {
      ...lead,
      score_reasons: Array.isArray(lead.score_reasons) ? lead.score_reasons.filter((item): item is string => typeof item === "string") : [],
      opening_hours: Array.isArray(lead.opening_hours) ? lead.opening_hours.filter((item): item is string => typeof item === "string") : null,
      reviews_count: Number.isFinite(Number(lead.reviews_count)) ? Number(lead.reviews_count) : 0,
      score: Number.isFinite(Number(lead.score)) ? Number(lead.score) : 1,
    };
    // Backward-compat: hydrate scores in memory if missing in DB row.
    if (
      typeof base.money_score !== "number" ||
      typeof base.pain_score !== "number" ||
      typeof base.intent_score !== "number" ||
      typeof base.final_score !== "number"
    ) {
      return enrichLeadWithScores(base);
    }
    return base;
  });
}

export default function Leads() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const searchId = params.get("search");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [temperatureFilter, setTemperatureFilter] = useState<"all" | "hot" | "hot_warm">("all");
  const [whatsappFilter, setWhatsappFilter] = useState<"all" | "yes">("all");
  const [websiteFilter, setWebsiteFilter] = useState<"all" | "yes" | "no">("all");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [generating, setGenerating] = useState(false);
  const [openingSiteId, setOpeningSiteId] = useState<string | null>(null);

  async function openSite(lead: Lead) {
    if (!user) { toast.error("Sessão indisponível. Recarregue a página."); return; }
    setOpeningSiteId(lead.id);
    try {
      const projectId = await openOrCreateSiteProject(user.id, lead);
      navigate(`/sites/${projectId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar projeto de site");
    } finally {
      setOpeningSiteId(null);
    }
  }

  async function load() {
    if (!user) return;
    setLoading(true);
    let q = supabase.from("leads").select("*").order("score", { ascending: false }).order("created_at", { ascending: false });
    if (searchId) q = q.eq("search_id", searchId);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setLeads(normalizeLeadRows(data));
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, searchId]);

  // Background: Website & Instagram Discovery. Não bloqueia a lista.
  // Atualiza website/has_website/instagram dos cards já exibidos.
  useEffect(() => {
    if (!user || !searchId) return;
    let cancelled = false;
    supabase.functions
      .invoke("search-places", { body: { mode: "enrich", search_id: searchId } })
      .then(async ({ error }) => {
        if (error || cancelled) return;
        let q = supabase.from("leads").select("id,website,has_website,instagram");
        q = q.eq("search_id", searchId);
        const { data } = await q;
        if (cancelled || !Array.isArray(data)) return;
        const byId = new Map(data.map((r: any) => [r.id, r]));
        setLeads((prev) => prev.map((l) => {
          const r = byId.get(l.id);
          if (!r) return l;
          return { ...l, website: r.website, has_website: !!r.has_website, instagram: r.instagram };
        }));
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [user, searchId]);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (filter === "favorites" && !l.is_favorite) return false;
      if (filter === "contacted" && !l.is_contacted) return false;
      if (filter === "no-website" && l.has_website) return false;
      if (filter === "high-score" && l.score < 4) return false;
      if (filter === "with-whatsapp" && !l.whatsapp) return false;
      if (filter === "with-instagram" && !l.instagram) return false;
      if (filter === "no-instagram" && !!l.instagram) return false;
      if (filter === "top-rated" && !(typeof l.rating === "number" && l.rating >= 4.5 && (l.reviews_count ?? 0) >= 50)) return false;
      if (filter === "high-roi" && calculateLeadROI(l).tier !== "high") return false;
      if (filter === "royal") {
        const roi = calculateLeadROI(l);
        if (!(roi.score >= 85 && !l.has_website)) return false;
      }

      // Smart qualification filters
      const fs = l.final_score ?? 0;
      if (temperatureFilter === "hot" && !(fs >= 80)) return false;
      if (temperatureFilter === "hot_warm" && !(fs >= 50)) return false;

      if (whatsappFilter === "yes") {
        const hasWa = (l as any).has_whatsapp === true || !!l.whatsapp || (typeof l.phone === "string" && l.phone.replace(/\D/g, "").length >= 10);
        if (!hasWa) return false;
      }

      const hasSite = !!l.has_website || (typeof l.website === "string" && l.website.trim().length > 0);
      if (websiteFilter === "yes" && !hasSite) return false;
      if (websiteFilter === "no" && hasSite) return false;

      if (query) {
        const q = query.toLowerCase();
        return (
          l.name.toLowerCase().includes(q) ||
          (l.city ?? "").toLowerCase().includes(q) ||
          (l.segment ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    }).sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0));
  }, [leads, filter, query, temperatureFilter, whatsappFilter, websiteFilter]);

  async function updateLead(id: string, patch: Partial<Lead>) {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    if (selected?.id === id) setSelected({ ...selected, ...patch });
    const { error } = await supabase.from("leads").update(patch as any).eq("id", id);
    if (error) { setLeads(prev); toast.error(error.message); }
  }

  async function deleteLead(id: string) {
    const prev = leads;
    setLeads((ls) => ls.filter((l) => l.id !== id));
    if (selected?.id === id) setSelected(null);
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) { setLeads(prev); toast.error(error.message); }
  }

  async function generateMessage(lead: Lead, channel: "whatsapp" | "email") {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-message", {
        body: {
          lead,
          channel,
          money_score: lead.money_score ?? 0,
          pain_score: lead.pain_score ?? 0,
          final_score: lead.final_score ?? 0,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const message = (data as any)?.message ?? "";
      await updateLead(lead.id, { ai_message: message });
      toast.success("Mensagem gerada com IA");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao gerar mensagem");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Meus Leads</h1>
          <p className="text-muted-foreground mt-1">
            {leads.length} empresas {searchId ? "desta pesquisa" : "na sua base"} · ordenadas por score de oportunidade
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportLeadsCsv(filtered)} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Exportar CSV
        </Button>
      </motion.div>

      <Card className="p-3 border-border/50 space-y-3">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, cidade, segmento…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            const counts: Record<Filter, number> = {
              all: leads.length,
              "high-score": leads.filter((l) => l.score >= 4).length,
              royal: leads.filter((l) => { const r = calculateLeadROI(l); return r.score >= 85 && !l.has_website; }).length,
              "high-roi": leads.filter((l) => calculateLeadROI(l).tier === "high").length,
              "no-website": leads.filter((l) => !l.has_website).length,
              "with-whatsapp": leads.filter((l) => !!l.whatsapp).length,
              "with-instagram": leads.filter((l) => !!l.instagram).length,
              "no-instagram": leads.filter((l) => !l.instagram).length,
              "top-rated": leads.filter((l) => typeof l.rating === "number" && l.rating >= 4.5 && (l.reviews_count ?? 0) >= 50).length,
              favorites: leads.filter((l) => l.is_favorite).length,
              contacted: leads.filter((l) => l.is_contacted).length,
            };
            const chips: [Filter, string, string, string?][] = [
              ["all", "Todos", "Mostra todos os leads coletados na listagem sem nenhum filtro de temperatura."],
              ["royal", "👑 Royal", "Leads premium: ROI estimado ≥ 85 e sem website. Oportunidade Royal — máxima urgência de abordagem.", "from-amber-500/20 to-primary/20 border-amber-400/60 text-amber-200 hover:shadow-[0_0_18px_-4px_hsl(45_95%_55%/0.7)]"],
              ["high-roi", "🟢 Alto ROI", "Filtra leads com base no Retorno sobre o Investimento estimado para a criação de serviços digitais."],
              ["high-score", "★ Alto potencial", "Leads com score interno alto (≥ 4). Bom potencial geral baseado em sinais combinados."],
              ["no-website", "🌐 Sem site", "Empresas sem site — dor digital evidente, ideal para oferta de landing page."],
              ["with-whatsapp", "💬 Com WhatsApp", "Leads com WhatsApp identificado — contato direto e rápido pela API oficial."],
              ["with-instagram", "📸 Com Instagram", "Leads ativos no Instagram — fácil validação de marca e prova social."],
              ["no-instagram", "🚫 Sem Instagram", "Sem presença no Instagram — gap digital relevante para abordagem comercial."],
              ["top-rated", "⭐ Top avaliações", "Negócios com avaliação ≥ 4.5 e 50+ reviews no Google. Alta reputação local."],
              ["favorites", "❤ Favoritos", "Apenas os leads marcados como favoritos por você."],
              ["contacted", "✓ Contatados", "Apenas leads já contatados — para acompanhamento e follow-up."],
            ];
            return (
              <TooltipProvider delayDuration={150}>
                {chips.map(([k, label, tip, royalCls]) => {
                  const active = filter === k;
                  const isRoyal = k === "royal";
                  return (
                    <Tooltip key={k}>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant={active ? "default" : "outline"}
                          onClick={() => setFilter(k)}
                          className={
                            isRoyal && !active
                              ? `bg-gradient-to-r ${royalCls} transition-all`
                              : undefined
                          }
                        >
                          {label}
                          <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"}`}>
                            {counts[k]}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                        {tip}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            );
          })()}
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-border/40">
          <SmartFilterGroup
            label="Temperatura"
            value={temperatureFilter}
            options={[
              { v: "all", label: "Todos", tip: "Mostra todos os leads coletados sem filtro de temperatura." },
              { v: "hot", label: "🔥 HOT", tip: "Filtra apenas leads com Score Final ≥ 80. Empresas com alto orçamento, dor digital latente e urgência." },
              { v: "hot_warm", label: "HOT + WARM", tip: "Mostra leads altamente qualificados (HOT) e moderados (WARM) com Score Final acima de 50." },
            ]}
            onChange={(v) => setTemperatureFilter(v as any)}
          />
          <SmartFilterGroup
            label="WhatsApp"
            value={whatsappFilter}
            options={[
              { v: "all", label: "Todos", tip: "Mostra leads com ou sem WhatsApp identificado." },
              { v: "yes", label: "💬 Apenas com WhatsApp", tip: "Isola leads que já possuem WhatsApp — contato direto, atrito zero." },
            ]}
            onChange={(v) => setWhatsappFilter(v as any)}
          />
          <SmartFilterGroup
            label="Website"
            value={websiteFilter}
            options={[
              { v: "all", label: "Todos", tip: "Mostra leads com ou sem website cadastrado." },
              { v: "yes", label: "🌐 Com site", tip: "Empresas que já possuem site — útil para auditoria e oferta de upgrade/landing page." },
              { v: "no", label: "🚫 Sem site", tip: "Empresas sem site — dor digital evidente, alvo perfeito para venda de landing page." },
            ]}
            onChange={(v) => setWebsiteFilter(v as any)}
          />
        </div>
      </Card>


      {loading ? (
        <div className="text-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando leads…</div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <p className="text-muted-foreground">Nenhum lead aqui ainda. Faça uma pesquisa para começar.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((l) => (
            <LeadRow
              key={l.id} lead={l}
              onOpen={() => setSelected(l)}
              onFavorite={() => updateLead(l.id, { is_favorite: !l.is_favorite })}
              onContacted={() => updateLead(l.id, { is_contacted: !l.is_contacted })}
              onSendToCrm={() => updateLead(l.id, { in_crm: true, crm_status: l.crm_status || "new" })}
              onGenerateSite={() => openSite(l)}
              openingSite={openingSiteId === l.id}
            />
          ))}
        </div>
      )}

      <LeadDetail
        lead={selected}
        onClose={() => setSelected(null)}
        onUpdate={updateLead}
        onDelete={deleteLead}
        onGenerate={generateMessage}
        onGenerateSite={openSite}
        generating={generating}
      />
    </div>
  );
}

function leadToText(lead: Lead) {
  const na = "Não disponível";
  return [
    `Nome: ${lead.name || na}`,
    `Categoria: ${lead.category || lead.segment || na}`,
    `Cidade/UF: ${[lead.city, lead.state].filter(Boolean).join("/") || na}`,
    `Endereço: ${lead.address || na}`,
    `Telefone: ${lead.phone || na}`,
    `WhatsApp: ${lead.whatsapp ? `https://wa.me/${lead.whatsapp}` : na}`,
    `Site: ${lead.website || na}`,
    `Google Maps: ${lead.google_url || na}`,
    `Avaliação: ${lead.rating != null ? `★ ${lead.rating} (${lead.reviews_count} reviews)` : na}`,
  ].join("\n");
}

function csvEscape(value: unknown) {
  const s = value == null ? "" : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportLeadsCsv(rows: Lead[]) {
  if (rows.length === 0) { toast.error("Nada para exportar"); return; }
  const headers = ["Nome","Categoria","Cidade","UF","Endereço","Telefone","WhatsApp","Site","Google Maps","Avaliação","Reviews","Confiabilidade"];
  const lines = [headers.join(";")];
  for (const l of rows) {
    lines.push([
      l.name, l.category ?? l.segment ?? "", l.city ?? "", l.state ?? "", l.address ?? "",
      l.phone ?? "", l.whatsapp ? `https://wa.me/${l.whatsapp}` : "",
      l.website ?? "", l.google_url ?? "",
      l.rating ?? "", l.reviews_count ?? 0, l.confidence ?? "",
    ].map(csvEscape).join(";"));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `leads-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast.success(`${rows.length} leads exportados`);
}


function ScoreStars({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

function LeadRow({
  lead, onOpen, onFavorite, onContacted, onSendToCrm, onGenerateSite, openingSite,
}: {
  lead: Lead; onOpen: () => void; onFavorite: () => void; onContacted: () => void; onSendToCrm: () => void; onGenerateSite: () => void; openingSite: boolean;
}) {
  const isHot = (lead.final_score ?? 0) >= 80;
  return (
    <Card
      className={`group relative p-4 border-border/50 transition-all duration-300 ease-out hover:border-primary hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_hsl(0_84%_55%/0.6),0_0_28px_-2px_hsl(0_84%_55%/0.55),0_0_60px_-12px_hsl(0_84%_55%/0.7)] hover:bg-primary/[0.04] ${
        isHot
          ? "border-l-4 border-l-emerald-500 ring-1 ring-emerald-500/30 shadow-[0_0_18px_-6px_hsl(160_84%_45%/0.55)]"
          : ""
      }`}
    >
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 flex-wrap">
            {isHot && (
              <HoverInfo
                content="Lead com altíssimo potencial de fechamento (score final ≥ 80). Priorize o contato — combina capacidade financeira, dor digital e intenção de compra."
              >
                <Badge
                  variant="outline"
                  className="text-[10px] border-emerald-500/60 text-emerald-400 bg-emerald-500/10 shadow-[0_0_10px_-2px_hsl(160_84%_45%/0.6)]"
                >
                  🔥 Alta Conversão
                </Badge>
              </HoverInfo>
            )}
            <h3 className="font-semibold truncate">{lead.name}</h3>
            <ConfidenceBadge confidence={lead.confidence} />
            <RoiBadge lead={lead} />
            {(() => {
              const t = getLeadTemperature(lead.final_score);
              const desc =
                t.label === "HOT"
                  ? "HOT (≥ 80): pronto para abordagem imediata. Alta chance de conversão."
                  : t.label === "WARM"
                    ? "WARM (50–79): bom potencial, nutrir com mensagem personalizada antes de fechar."
                    : "COLD (< 50): baixo potencial agora. Avalie se vale o esforço ou deixe para depois.";
              return (
                <HoverInfo
                  content={(
                    <>
                      <span className="block font-semibold mb-1">Temperatura do lead · {lead.final_score ?? 0}/100</span>
                      {desc}
                    </>
                  )}
                >
                  <Badge variant="outline" className={t.badgeClass}>{t.label}</Badge>
                </HoverInfo>
              );
            })()}
            {!lead.has_website && <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-500">Sem site</Badge>}
            {lead.is_contacted && <Badge variant="outline" className="text-xs border-blue-500/40 text-blue-500">Contatado</Badge>}
            {lead.in_crm && <Badge variant="outline" className="text-xs border-violet-500/40 text-violet-500">No CRM</Badge>}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            {lead.segment && <span>{lead.segment}</span>}
            {lead.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.city}/{lead.state}</span>}
            {lead.rating != null ? <span>★ {lead.rating} ({lead.reviews_count})</span> : <span className="opacity-60">Sem avaliações</span>}
            <span className="opacity-80">Score: {lead.final_score ?? 0}/100</span>
          </div>
          {(() => {
            const reasons = (lead.score_reasons?.length ? lead.score_reasons : buildScoreReasons(lead)).slice(0, 3);
            if (!reasons.length) return null;
            return (
              <div className="mt-2 text-[11px] text-muted-foreground">
                {reasons.join(" • ")}
              </div>
            );
          })()}
        </div>

        <div className="flex flex-col items-end gap-2">
          <ScoreStars score={lead.score} />
          <div className="flex items-center gap-1 flex-wrap justify-end">
            <Button size="icon" variant="ghost" onClick={onFavorite} aria-label="Favoritar" title="Favoritar">
              <Star className={`h-4 w-4 ${lead.is_favorite ? "fill-amber-400 text-amber-400" : ""}`} />
            </Button>
            {lead.website && (
              <Button size="icon" variant="ghost" asChild title="Site"><a href={lead.website} target="_blank" rel="noreferrer"><Globe className="h-4 w-4" /></a></Button>
            )}
            <Button size="icon" variant="ghost" asChild title="Pesquisar no Google">
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`${lead.name}${lead.city ? " " + lead.city : ""}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                <SearchIcon className="h-4 w-4" />
              </a>
            </Button>
            {lead.google_url && (
              <Button size="icon" variant="ghost" asChild title="Google Maps"><a href={lead.google_url} target="_blank" rel="noreferrer"><MapIcon className="h-4 w-4" /></a></Button>
            )}

            {lead.phone && (
              <Button size="icon" variant="ghost" asChild title="Ligar"><a href={`tel:${lead.phone}`}><Phone className="h-4 w-4" /></a></Button>
            )}
            {lead.whatsapp && (
              <Button size="icon" variant="ghost" asChild title="WhatsApp"><a href={`https://wa.me/${lead.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageSquare className="h-4 w-4 text-emerald-500" /></a></Button>
            )}
            {lead.instagram && (
              <Button size="icon" variant="ghost" asChild title="Instagram"><a href={lead.instagram} target="_blank" rel="noreferrer"><Instagram className="h-4 w-4 text-pink-500" /></a></Button>
            )}
            <Button
              size="icon" variant="ghost" title="Copiar dados"
              onClick={() => { navigator.clipboard.writeText(leadToText(lead)); toast.success("Dados copiados"); }}
            >
              <ClipboardCopy className="h-4 w-4" />
            </Button>
            <Button
              size="icon" variant="ghost" title="Gerar Site" onClick={onGenerateSite} disabled={openingSite}
              className={openingSite ? "opacity-70" : ""}
            >
              {openingSite ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode2 className="h-4 w-4 text-violet-500" />}
            </Button>
            <LandingPromptButton lead={lead} variant="icon" />
            <Button size="icon" variant="ghost" onClick={onContacted} title="Marcar como contatado">
              <Check className={`h-4 w-4 ${lead.is_contacted ? "text-blue-500" : ""}`} />
            </Button>
            <Button size="sm" variant="outline" onClick={onOpen}><Eye className="h-3.5 w-3.5 mr-1" /> Ver</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function HoverInfo({ children, content }: { children: ReactNode; content: ReactNode }) {
  return (
    <span className="relative inline-flex cursor-help group/hoverinfo">
      {children}
      <span className="pointer-events-none absolute left-1/2 bottom-[calc(100%+10px)] z-[80] w-72 max-w-[min(18rem,80vw)] -translate-x-1/2 rounded-md border border-emerald-400/40 bg-background/95 px-3 py-2 text-xs leading-relaxed text-foreground opacity-0 shadow-[0_0_22px_-6px_hsl(0_84%_55%/0.85)] backdrop-blur transition-all duration-150 group-hover/hoverinfo:translate-y-[-2px] group-hover/hoverinfo:opacity-100 group-focus-within/hoverinfo:translate-y-[-2px] group-focus-within/hoverinfo:opacity-100">
        {content}
        <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-emerald-400/40 bg-background/95" />
      </span>
    </span>
  );
}

function LeadDetail({
  lead, onClose, onUpdate, onDelete, onGenerate, onGenerateSite, generating,
}: {
  lead: Lead | null; onClose: () => void;
  onUpdate: (id: string, patch: Partial<Lead>) => void;
  onDelete: (id: string) => void;
  onGenerate: (lead: Lead, channel: "whatsapp" | "email") => void;
  onGenerateSite: (lead: Lead) => void;
  generating: boolean;
}) {
  const [notes, setNotes] = useState("");
  const [landingUrl, setLandingUrl] = useState("");
  const [template, setTemplate] = useState<WaTemplate>("A");
  const originalAiRef = useRef<string>("");
  const { add: addToQueue } = useWaitingQueue();
  useEffect(() => {
    setNotes(lead?.notes ?? "");
    setLandingUrl("");
    setTemplate("A");
    originalAiRef.current = lead?.ai_message ?? "";
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyTemplate(t: WaTemplate) {
    if (!lead) return;
    if (template === "A" && t !== "A") {
      originalAiRef.current = lead.ai_message ?? "";
    }
    setTemplate(t);
    if (t === "A") {
      onUpdate(lead.id, { ai_message: originalAiRef.current });
    } else {
      onUpdate(lead.id, { ai_message: TEMPLATE_TEXTS[t] });
    }
  }
  if (!lead) return null;

  function buildMessageWithUrl(msg: string, url: string) {
    let out = msg;
    out = out.replace(/\[LINK_DA_LANDING_PAGE\]|\[LINK\]|\[TROCAR LINK\]|<URL>/gi, url);
    out = out.replace(
      /(Segue o link da demonstração:\s*\n+\s*)(https?:\/\/\S+|\[[^\]]+\]|<[^>]+>)?/i,
      (_m, p1) => `${p1}${url}`,
    );
    if (!out.includes(url)) {
      out = `${out.trimEnd()}\n\nSegue o link da demonstração:\n${url}`;
    }
    return out;
  }

  function currentMessage(): string {
    if (!lead) return "";
    if (template !== "A") return TEMPLATE_TEXTS[template];
    return lead.ai_message || originalAiRef.current || "";
  }

  // Single source of truth: any template (A/B/C/D) with non-empty text + not generating.
  const trimmedUrl = landingUrl.trim();
  const hasGeneratedMessage = currentMessage().trim().length > 0;
  const canProceed = !!lead && !generating && hasGeneratedMessage;

  function buildPayload(): { url: string; msg: string } | null {
    if (!lead || !canProceed) return null;
    return { url: trimmedUrl, msg: currentMessage() };
  }


  function sendWhatsApp() {
    const p = buildPayload();
    if (!p) { toast.error("Finalize a mensagem antes de enviar."); return; }
    const raw = (lead?.whatsapp ?? lead?.phone ?? "").replace(/\D/g, "");
    // Usar api.whatsapp.com/send direto (sem redirect do wa.me) preserva os emojis em todos os devices.
    const text = encodeURIComponent(p.msg);
    const wa = raw
      ? `https://api.whatsapp.com/send?phone=${raw}&text=${text}`
      : `https://api.whatsapp.com/send?text=${text}`;
    window.open(wa, "_blank", "noopener,noreferrer");
  }

  function sendToQueue() {
    if (!lead) { toast.error("Lead não carregado"); return; }
    const p = buildPayload();
    if (!p) { toast.error("Finalize a mensagem antes de enviar."); return; }
    const roi = calculateLeadROI(lead);
    const result = addToQueue({
      leadId: lead.id,
      name: lead.name,
      segment: lead.segment ?? lead.category ?? null,
      city: lead.city ?? null,
      state: lead.state ?? null,
      whatsapp: lead.whatsapp ?? null,
      roiScore: roi.score,
      roiTier: roi.tier,
      template,
      message: p.msg,
      landingUrl: p.url,
    });
    if (!result.ok && result.reason === "duplicate") {
      toast.info("Este lead já está na fila com este link.");
      return;
    }
    onUpdate(lead.id, { crm_status: "awaiting", in_crm: true });
    toast.success("Lead adicionado à fila de espera com sucesso");
  }

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2 flex-wrap">
            {lead.name}
            <ScoreStars score={lead.score} />
            <RoiBadge lead={lead} showScore />
          </DialogTitle>
          <DialogDescription>{lead.segment} · {lead.city}/{lead.state}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {lead.score_reasons?.length > 0 && (
            <Card className="p-3 bg-primary/5 border-primary/20">
              <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1"><Sparkles className="h-3 w-3" /> Por que é uma oportunidade</p>
              <ul className="text-xs space-y-1 list-disc list-inside text-muted-foreground">
                {lead.score_reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-2 text-sm">
            <Info label="Endereço" value={lead.address ?? "Não disponível"} />
            <Info label="Telefone" value={lead.phone ?? "Não disponível"} copyable={!!lead.phone} />
            <Info label="WhatsApp" value={lead.whatsapp ?? "Não disponível"} copyable={!!lead.whatsapp} />
            <Info label="Site" value={lead.website ?? "Não disponível"} link={!!lead.website} />
            <Info label="Avaliação Google" value={lead.rating != null ? `★ ${lead.rating} (${lead.reviews_count} reviews)` : "Não disponível"} />
            <Info label="Confiabilidade" value={lead.confidence ? confidenceLabel(lead.confidence) : "Não avaliada"} />
          </div>

          {lead.opening_hours && lead.opening_hours.length > 0 && (
            <Card className="p-3 bg-muted/30 border-border/50">
              <p className="text-xs font-semibold mb-2 flex items-center gap-1"><Clock className="h-3 w-3" /> Horário de funcionamento</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {lead.opening_hours.map((h) => <li key={h}>{h}</li>)}
              </ul>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            {lead.google_url && <Button size="sm" variant="outline" asChild><a href={lead.google_url} target="_blank" rel="noreferrer"><MapIcon className="h-3.5 w-3.5 mr-1" /> Google</a></Button>}
            {lead.instagram && <Button size="sm" variant="outline" asChild><a href={lead.instagram} target="_blank" rel="noreferrer"><Instagram className="h-3.5 w-3.5 mr-1" /> Instagram</a></Button>}
            {lead.facebook && <Button size="sm" variant="outline" asChild><a href={lead.facebook} target="_blank" rel="noreferrer"><Facebook className="h-3.5 w-3.5 mr-1" /> Facebook</a></Button>}
            <Button size="sm" variant="default" onClick={() => onGenerateSite(lead)}>
              <FileCode2 className="h-3.5 w-3.5 mr-1" /> Gerar Site
            </Button>
            <LandingPromptButton lead={lead} variant="full" />
          </div>

          

          <OfferCard />

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Mensagem com IA</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => onGenerate(lead, "whatsapp")} disabled={generating}>
                  {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />} WhatsApp
                </Button>
                <Button size="sm" variant="outline" onClick={() => onGenerate(lead, "email")} disabled={generating}>
                  {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />} E-mail
                </Button>
              </div>
            </div>
            <WhatsAppTemplatePicker value={template} onSelect={applyTemplate} />
            <div className="mb-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                🌐 URL da Landing Page
              </label>
              <Input
                type="url"
                placeholder="https://meusite.com.br/demo"
                value={landingUrl}
                onChange={(e) => setLandingUrl(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Inserida automaticamente após "Segue o link da demonstração:" ao enviar pelo WhatsApp.
              </p>
            </div>
            <Textarea
              rows={6}
              placeholder="Clique em ✨ para gerar uma mensagem personalizada com IA."
              value={lead.ai_message ?? ""}
              onChange={(e) => onUpdate(lead.id, { ai_message: e.target.value })}
            />
            <div className="flex flex-col gap-2 mt-2">
              {!canProceed && (
                <p className="text-[11px] text-amber-500/90 text-right">
                  {generating
                    ? "Gerando mensagem…"
                    : "Gere ou escolha uma mensagem (A, B, C ou D)."}
                </p>
              )}

              <div className="flex justify-end gap-2 flex-wrap">
                {lead.ai_message && (
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(currentMessage()); toast.success("Copiado"); }}>
                    <Copy className="h-3 w-3 mr-1" /> 📋 Copiar Mensagem
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={sendToQueue}
                  disabled={!canProceed}
                  className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                >
                  <ListChecks className="h-3 w-3 mr-1" /> Enviar para Fila de Espera
                </Button>
                <Button
                  size="sm"
                  onClick={sendWhatsApp}
                  disabled={!canProceed}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                  title={!lead.whatsapp && !lead.phone ? "Sem número — abrirá WhatsApp para escolher contato" : undefined}
                >
                  <MessageSquare className="h-3 w-3 mr-1" /> 📲 Enviar para WhatsApp
                </Button>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold mb-2">Observações</p>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (lead.notes ?? "")) onUpdate(lead.id, { notes }); }}
              placeholder="Anotações sobre este lead…"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Estágio no CRM</p>
              <Select value={lead.crm_status} onValueChange={(v) => onUpdate(lead.id, { crm_status: v as CrmStatus, in_crm: true })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CRM_COLUMNS.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onUpdate(lead.id, { is_favorite: !lead.is_favorite })}>
                <Star className={`h-4 w-4 mr-1 ${lead.is_favorite ? "fill-amber-400 text-amber-400" : ""}`} />
                {lead.is_favorite ? "Desfavoritar" : "Favoritar"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => onUpdate(lead.id, { is_contacted: !lead.is_contacted })}>
                <Check className="h-4 w-4 mr-1" /> {lead.is_contacted ? "Não contatado" : "Contatado"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="destructive" size="sm" onClick={() => onDelete(lead.id)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, link, copyable }: { label: string; value: string; link?: boolean; copyable?: boolean }) {
  return (
    <div className="p-2 rounded-lg bg-muted/40">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm truncate flex items-center gap-1.5">
        {link ? <a href={value} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate flex items-center gap-1">{value}<ExternalLink className="h-3 w-3" /></a> : value}
        {copyable && (
          <button onClick={() => { navigator.clipboard.writeText(value); toast.success("Copiado"); }} className="text-muted-foreground hover:text-foreground">
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function SmartFilterGroup({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { v: string; label: string; tip?: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <TooltipProvider delayDuration={150}>
        {options.map((o) => {
          const active = value === o.v;
          const btn = (
            <Button
              key={o.v}
              size="sm"
              variant={active ? "default" : "outline"}
              onClick={() => onChange(o.v)}
              className="h-7 px-2 text-xs"
            >
              {o.label}
            </Button>
          );
          if (!o.tip) return btn;
          return (
            <Tooltip key={o.v}>
              <TooltipTrigger asChild>{btn}</TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                {o.tip}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </div>
  );
}



function confidenceLabel(c: "high" | "medium" | "low") {
  return c === "high" ? "Dados Confirmados" : c === "medium" ? "Dados Parciais" : "Dados Insuficientes";
}

function ConfidenceBadge({ confidence }: { confidence: Lead["confidence"] }) {
  if (!confidence) return null;
  const map = {
    high:   { Icon: ShieldCheck, cls: "border-emerald-500/40 text-emerald-500 bg-emerald-500/5", dot: "🟢" },
    medium: { Icon: Shield,      cls: "border-amber-500/40 text-amber-500 bg-amber-500/5",       dot: "🟡" },
    low:    { Icon: ShieldAlert, cls: "border-red-500/40 text-red-500 bg-red-500/5",             dot: "🔴" },
  } as const;
  const { Icon, cls, dot } = map[confidence];
  const label = confidenceLabel(confidence);
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${cls}`} title={label}>
      <span aria-hidden>{dot}</span>
      <Icon className="h-3 w-3" /> {label}
    </Badge>
  );
}
