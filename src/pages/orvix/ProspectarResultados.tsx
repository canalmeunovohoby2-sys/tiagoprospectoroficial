import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Sparkles, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Lead } from "@/data/types";
import { enrichLeadWithScores } from "@/lib/leadScoring";
import { OrvixDiagnosticDialog } from "@/components/app/OrvixDiagnosticDialog";
import { OrvixApproachDialog } from "@/components/app/OrvixApproachDialog";
import { OrvixCrmPanel } from "@/components/app/OrvixCrmPanel";
import { OrvixLeadCard } from "@/components/app/OrvixLeadCard";
import { filterLeadsByOrvixSegment } from "@/lib/orvixSegmentValidation";
import { buildRejectionAudit, type RejectionClass } from "@/lib/orvixRejectionAudit";
import { sortLeadsByOrvixPriority } from "@/lib/orvixPriority";
import { computeConfidenceMap } from "@/lib/orvixLeadConfidence";
import {
  computeOpportunityMap,
  sortLeadsBy,
  type OrvixSortMode,
} from "@/lib/orvixOpportunityScore";
import {
  computeSegmentConfidence,
  segmentConfidenceBadgeClass,
  type SegmentConfidence,
  type SegmentMatch,
} from "@/lib/orvixSegmentConfidence";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";



function normalizeLeadRows(rows: unknown): Lead[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const lead = row as Lead & { score_reasons?: unknown; opening_hours?: unknown };
    const base: Lead = {
      ...lead,
      score_reasons: Array.isArray(lead.score_reasons) ? lead.score_reasons.filter((i): i is string => typeof i === "string") : [],
      opening_hours: Array.isArray(lead.opening_hours) ? lead.opening_hours.filter((i): i is string => typeof i === "string") : null,
      reviews_count: Number.isFinite(Number(lead.reviews_count)) ? Number(lead.reviews_count) : 0,
      score: Number.isFinite(Number(lead.score)) ? Number(lead.score) : 1,
    };
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

/**
 * Orvix ERP — Resultados da Prospecção.
 * Lista os leads da busca recém-criada dentro do módulo Orvix, isolada da
 * página de Leads (Landing Pages). Cards enxutos nesta fase — ERP Score,
 * Diagnóstico, Argumentos, IA e Propostas serão adicionados nas próximas.
 */
export default function OrvixProspectarResultados() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const searchId = params.get("search");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [diagLead, setDiagLead] = useState<Lead | null>(null);
  const [approachLead, setApproachLead] = useState<Lead | null>(null);
  const [crmLead, setCrmLead] = useState<Lead | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [sortMode, setSortMode] = useState<OrvixSortMode>("priority");
  const [auditOpen, setAuditOpen] = useState(false);

  // Auditoria em memória, salva pelo LeadSearchForm no sessionStorage.
  type SearchAudit = {
    audit?: {
      segment_detected?: string;
      module?: string;
      synonyms_used?: string[];
      included_types_used?: string[];
      per_lead?: Record<string, { source?: string; synonym?: string | null; included_type?: string | null; rule?: string | null; confidence?: number | null; osm_tags?: Record<string, string> | null; category?: string | null; google_types?: string[] | null }>;
      dedupe_events?: Array<{ id: string; source: string; keys: string[] }>;
      summary?: {
        google_found: number; google_places_new: number; google_places_legacy: number;
        osm_found: number; osm_nominatim: number; osm_overpass: number;
        duplicates_removed: number; rejected: number; accepted: number;
        recall_estimated: number; precision_estimated: number;
        google_rate_limited?: boolean; google_429_hits?: number;
        nominatim_rate_limited?: boolean; nominatim_429_hits?: number;
        sources_failed?: string[];
        raw_google_count?: number;
        raw_nominatim_count?: number;
        raw_overpass_count?: number;
        recovery_raw_count?: number;
        recovery_accepted_count?: number;
        recovery_attempted?: boolean;
        after_dedupe_count?: number;
        after_segment_filter_count?: number | null;
        rejected_count?: number;
        final_count?: number;
      };

    } | null;
    diagnostics?: Record<string, unknown> | null;
    source?: string;
    search_status?: "SUCCESS" | "SUCCESS_WITH_WARNINGS" | "PARTIAL_RESULTS" | "EMPTY" | "EMPTY_REAL" | "EMPTY_WITH_LIMITATIONS" | "EXTERNAL_FAILURE";
    sources_status?: { google?: "success" | "rate_limited" | "error" | "skipped"; nominatim?: "success" | "rate_limited" | "error" | "skipped"; overpass?: "success" | "rate_limited" | "error" | "skipped" } | null;
    input?: { state: string; city: string; segment: string; module: string };
  };
  const searchAudit = useMemo<SearchAudit | null>(() => {
    if (!searchId) return null;
    try {
      const raw = sessionStorage.getItem(`orvix:audit:${searchId}`);
      return raw ? JSON.parse(raw) as SearchAudit : null;
    } catch { return null; }
  }, [searchId]);


  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetchLeads(): Promise<Lead[]> {
      let q = supabase
        .from("leads")
        .select("*")
        .order("final_score", { ascending: false, nullsFirst: false })
        .order("score", { ascending: false })
        .order("created_at", { ascending: false });
      if (searchId) q = q.eq("search_id", searchId);
      const { data, error } = await q;
      if (error) toast.error(error.message);
      return normalizeLeadRows(data);
    }

    (async () => {
      setLoading(true);
      const initial = await fetchLeads();
      if (cancelled) return;
      setLeads(initial);
      setLoading(false);

      // Background: enriquecimento em LOTES (retomável). Não bloqueia a exibição.
      if (!searchId) return;
      const needsEnrichment = initial.some((l) => !l.website || !l.instagram || !l.whatsapp);
      if (!needsEnrichment) return;

      try {
        let offset = 0;
        let completed = false;
        let guard = 0;
        while (!completed && guard < 100 && !cancelled) {
          const { data, error } = await supabase.functions.invoke("search-places", {
            body: { mode: "enrich", search_id: searchId, enrich_offset: offset },
          });
          if (error) { console.warn("[Orvix] background enrichment error", error); break; }
          const r = data as { completed?: boolean; next_cursor?: number | null; processed?: number };
          completed = r.completed === true || r.next_cursor == null;
          offset = typeof r.next_cursor === "number" ? r.next_cursor : offset + (r.processed ?? 0);
          guard++;
        }
        if (cancelled) return;
        const refreshed = await fetchLeads();
        if (cancelled) return;
        setLeads((prev) => {
          const byId = new Map(refreshed.map((r) => [r.id, r]));
          return prev.map((l) => {
            const r = byId.get(l.id);
            if (!r) return l;
            return { ...l, website: r.website, has_website: r.has_website, instagram: r.instagram, phone: r.phone, whatsapp: r.whatsapp };
          });
        });
      } catch (e) {
        console.warn("[Orvix] background enrichment threw", e);
      }
    })();

    return () => { cancelled = true; };
  }, [user, searchId]);



  const header = useMemo(() => {
    const first = leads[0];
    if (!first) return null;
    return { segment: first.segment, city: first.city, state: first.state };
  }, [leads]);

  const targetSegment = header?.segment ?? null;
  const { valid: validLeads, rejected: rejectedLeads, rejectionDetails } = useMemo(
    () => filterLeadsByOrvixSegment(leads, targetSegment),
    [leads, targetSegment],
  );
  const { confidenceMap, confidenceStats } = useMemo(() => {
    const { map, stats } = computeConfidenceMap(leads, targetSegment);
    return { confidenceMap: map, confidenceStats: stats };
  }, [leads, targetSegment]);
  const opportunityMap = useMemo(
    () => computeOpportunityMap(leads, targetSegment),
    [leads, targetSegment],
  );

  // Segment Category Confidence — camada analítica que roda por lead usando
  // per_lead audit (osm_tags, google_types, category) salvo em sessionStorage.
  const segmentConfidenceMap = useMemo(() => {
    const perLead = searchAudit?.audit?.per_lead ?? {};
    const map = new Map<string, SegmentConfidence>();
    for (const l of leads) {
      const extId = (l as unknown as { external_id?: string }).external_id ?? "";
      const audit = extId ? perLead[extId] : undefined;
      map.set(l.id, computeSegmentConfidence(l, targetSegment, audit ?? null));
    }
    return map;
  }, [leads, targetSegment, searchAudit]);

  const visibleLeads = useMemo(() => {
    const base = showRejected ? leads : validLeads;
    const filtered = onlyHigh
      ? base.filter((l) => {
          const c = confidenceMap.get(l.id);
          return c ? c.tier === "high" : false;
        })
      : base;
    if (sortMode === "priority") return sortLeadsByOrvixPriority(filtered);
    return sortLeadsBy(filtered, sortMode, {
      opportunity: opportunityMap,
      confidence: confidenceMap,
    });
  }, [leads, validLeads, showRejected, onlyHigh, confidenceMap, opportunityMap, sortMode]);
  const rejectedIds = useMemo(() => new Set(rejectedLeads.map((r) => r.id)), [rejectedLeads]);

  const handleDiagnostic = useCallback((l: Lead) => setDiagLead(l), []);
  const handleApproach = useCallback((l: Lead) => setApproachLead(l), []);
  const handleCrm = useCallback((l: Lead) => setCrmLead(l), []);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant shrink-0">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-primary/80 font-semibold">
              Orvix ERP · Resultados
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Prospecção Orvix</h1>
            <p className="text-muted-foreground mt-1">
              {header
                ? <>Leads encontrados para <strong className="text-foreground">{header.segment}</strong> em {header.city}/{header.state}.</>
                : "Leads da última prospecção do módulo Orvix."}
            </p>
            {rejectedLeads.length > 0 && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <Badge variant="outline" className="border-amber-500/40 text-amber-500 bg-amber-500/5">
                  {rejectedLeads.length} fora do segmento
                </Badge>
                <button
                  type="button"
                  onClick={() => setShowRejected((v) => !v)}
                  className="text-primary hover:underline"
                >
                  {showRejected ? "Ocultar rejeitados" : "Mostrar rejeitados"}
                </button>
              </div>
            )}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/orvix/prospectar"><ArrowLeft className="h-4 w-4 mr-1" /> Nova busca</Link>
        </Button>
      </div>

      {/* Estado das fontes externas — usa search_status/sources_status se disponíveis */}
      {!loading && searchAudit?.audit?.summary && (() => {
        const s = searchAudit.audit!.summary!;
        const ss = searchAudit.sources_status ?? null;
        const status = searchAudit.search_status;
        const hasLeads = leads.length > 0;

        // Se temos search_status explícito: usá-lo. Senão, deduzir dos flags legacy.
        const googleSt = ss?.google ?? (s.google_rate_limited ? "rate_limited" : (s.google_found ?? 0) > 0 ? "success" : "error");
        const nomSt = ss?.nominatim ?? (s.nominatim_rate_limited ? "rate_limited" : (s.osm_nominatim ?? 0) > 0 ? "success" : "error");
        const overSt = ss?.overpass ?? ((s.osm_overpass ?? 0) > 0 ? "success" : "error");
        const attempted = [googleSt, nomSt, overSt].filter((x) => x !== "skipped");
        const anyDegraded = attempted.some((x) => x === "rate_limited" || x === "error");
        const isSuccessOnly = status === "SUCCESS" || (!status && hasLeads && !anyDegraded);
        if (isSuccessOnly) return null;

        // Regra crítica: se existem leads, NUNCA bloquear com mensagem de erro.
        const isPartial = hasLeads;
        const tone = isPartial ? "amber" : "rose";
        const title = isPartial
          ? "Resultados encontrados com algumas fontes temporariamente indisponíveis."
          : "Nenhum lead encontrado pelas fontes consultadas. Algumas fontes estavam temporariamente indisponíveis e podem reduzir a cobertura da busca.";

        type Row = { label: string; status: "success" | "rate_limited" | "error" | "skipped"; note: string };
        const noteFor = (st: Row["status"], ok: string, hits?: number): string => {
          if (st === "success") return "respondeu";
          if (st === "rate_limited") return hits ? `limitado (${hits}× 429)` : "limitado";
          if (st === "error") return "sem resposta";
          return "não consultado";
        };
        const rows: Row[] = [
          { label: "Google Places", status: googleSt, note: noteFor(googleSt, "respondeu", s.google_429_hits) },
          { label: "Nominatim (OSM)", status: nomSt, note: noteFor(nomSt, "respondeu", s.nominatim_429_hits) },
          { label: "Overpass (OSM)", status: overSt, note: noteFor(overSt, "respondeu") },
        ];

        return (
          <Card className={`p-3 ${tone === "amber" ? "border-amber-500/40 bg-amber-500/10" : "border-rose-500/40 bg-rose-500/10"}`}>
            <div className="flex items-start gap-2 text-xs">
              <ShieldCheck className={`h-4 w-4 mt-0.5 shrink-0 ${tone === "amber" ? "text-amber-500" : "text-rose-500"}`} />
              <div className="space-y-2 flex-1">
                <p className="font-medium text-foreground">{title}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {rows.map((r) => {
                    const icon = r.status === "success" ? "✓" : r.status === "rate_limited" ? "⚠" : r.status === "error" ? "✕" : "·";
                    const cls = r.status === "success" ? "text-emerald-500"
                      : r.status === "rate_limited" ? "text-amber-500"
                      : r.status === "error" ? "text-rose-500"
                      : "text-muted-foreground/70";
                    return (
                      <span key={r.label} className="inline-flex items-center gap-1">
                        <span className={cls}>{icon}</span>
                        <span className="text-foreground/80">{r.label}</span>
                        <span className="text-muted-foreground">— {r.note}</span>
                      </span>
                    );
                  })}
                </div>
                {/* Funil de descoberta — contadores auditáveis */}
                {(() => {
                  const rg = s.raw_google_count ?? ((s.google_places_new ?? 0) + (s.google_places_legacy ?? 0));
                  const rn = s.raw_nominatim_count ?? (s.osm_nominatim ?? 0);
                  const ro = s.raw_overpass_count ?? (s.osm_overpass ?? 0);
                  const rr = s.recovery_raw_count ?? 0;
                  const ra = s.recovery_accepted_count ?? 0;
                  const rawTotal = rg + rn + ro + rr;
                  const ad = s.after_dedupe_count ?? s.accepted ?? leads.length;
                  const asf = s.after_segment_filter_count ?? leads.length;
                  const rc = s.rejected_count ?? Math.max(0, ad - leads.length);
                  const fc = s.final_count ?? leads.length;
                  return (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground pt-1 border-t border-border/30">
                      <span title="Leads brutos retornados pelo Google Places">Google bruto: <b className="text-foreground/80">{rg}</b></span>
                      <span title="Leads brutos retornados pelo Nominatim">Nominatim bruto: <b className="text-foreground/80">{rn}</b></span>
                      <span title="Leads brutos retornados pelo Overpass">Overpass bruto: <b className="text-foreground/80">{ro}</b></span>
                      <span title="Leads brutos coletados pelo Recovery Overpass (busca por nome/marca quando as fontes primárias retornam vazio)">Recovery bruto: <b className="text-foreground/80">{rr}</b>{ra !== rr ? <span className="text-muted-foreground/70"> ({ra} aceitos)</span> : null}</span>
                      <span title="Soma dos leads brutos de todas as fontes (Google + Nominatim + Overpass + Recovery)">Total bruto: <b className="text-foreground/80">{rawTotal}</b></span>
                      <span title="Após deduplicação entre fontes">Após dedupe: <b className="text-foreground/80">{ad}</b></span>
                      <span title="Após filtro de segmento Orvix">Após filtro Orvix: <b className="text-foreground/80">{asf}</b></span>
                      <span title="Descartados no filtro Orvix">Rejeitados: <b className="text-foreground/80">{rc}</b></span>
                      <span title="Total final exibido">Final: <b className="text-foreground">{fc}</b></span>
                    </div>
                  );
                })()}
                {isPartial && (
                  <p className="text-muted-foreground">
                    A prospecção continua funcionando com as fontes que responderam. Refaça a busca em alguns segundos para tentar recuperar as demais.
                  </p>
                )}
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Auditoria de confiança da busca */}
      {!loading && leads.length > 0 && (

        <Card className="p-3 border-border/50 bg-card/60">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="font-medium">Auditoria da busca:</span>
              <Badge variant="outline" className="text-[10px]">{confidenceStats.total} leads</Badge>
              <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-500 bg-emerald-500/5" title="Fonte: Google Places oficial">
                Google {confidenceStats.bySource.google}
              </Badge>
              <Badge variant="outline" className="text-[10px] border-sky-500/40 text-sky-500 bg-sky-500/5" title="Fonte: OpenStreetMap (Nominatim/Overpass)">
                OSM {confidenceStats.bySource.osm}
              </Badge>
              <Badge variant="outline" className="text-[10px]" title="Place ID confirmado">
                Place ID {confidenceStats.withPlaceId}
              </Badge>
              <Badge variant="outline" className="text-[10px]" title="Google Maps oficial válido">
                Maps oficial {confidenceStats.withOfficialMap}
              </Badge>
              <span className="mx-1 opacity-40">·</span>
              <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-500 bg-emerald-500/5">🟢 {confidenceStats.byTier.high}</Badge>
              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500 bg-amber-500/5">🟡 {confidenceStats.byTier.good}</Badge>
              <Badge variant="outline" className="text-[10px] border-orange-500/40 text-orange-500 bg-orange-500/5">🟠 {confidenceStats.byTier.check}</Badge>
              <Badge variant="outline" className="text-[10px] border-rose-500/40 text-rose-500 bg-rose-500/5">🔴 {confidenceStats.byTier.low}</Badge>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Ordenar por:</span>
                <Select value={sortMode} onValueChange={(v) => setSortMode(v as OrvixSortMode)}>
                  <SelectTrigger className="h-7 text-xs w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="priority">Ordem padrão</SelectItem>
                    <SelectItem value="opportunity">🔥 Melhor oportunidade comercial</SelectItem>
                    <SelectItem value="confidence">🛡️ Maior confiança</SelectItem>
                    <SelectItem value="reviews">💬 Mais avaliações</SelectItem>
                    <SelectItem value="rating">⭐ Melhor reputação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none">
                <Switch checked={onlyHigh} onCheckedChange={setOnlyHigh} />
                <span>Apenas altamente confiáveis</span>
              </label>
            </div>
          </div>
        </Card>
      )}

      {/* Auditoria completa — apenas leitura, em memória */}
      {!loading && leads.length > 0 && searchAudit?.audit && (() => {
        const s = searchAudit.audit!.summary;
        const accepted = leads.length;
        const rejected = rejectedLeads.length;
        const acceptedNet = Math.max(0, accepted - rejected);
        // Precisão local: aceitos válidos / (aceitos válidos + rejeitados por segmento + duplicados).
        const dup = s?.duplicates_removed ?? 0;
        const googleFound = s?.google_found ?? 0;
        const osmFound = s?.osm_found ?? 0;
        const denomPrec = acceptedNet + rejected + dup;
        const precision = denomPrec > 0 ? acceptedNet / denomPrec : 0;
        const rawTotal = googleFound + osmFound;
        const recall = rawTotal > 0 ? acceptedNet / rawTotal : 0;
        const perLead = searchAudit.audit!.per_lead ?? {};
        const sourceCounts = Object.values(perLead).reduce<Record<string, number>>((acc, v) => {
          const k = v?.source ?? "unknown";
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {});
        return (
          <Card className="p-3 border-border/50 bg-card/40">
            <button
              type="button"
              onClick={() => setAuditOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 text-xs font-medium"
            >
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Auditoria da busca (detalhada)
              </span>
              <span className="text-muted-foreground">{auditOpen ? "Ocultar ▲" : "Expandir ▼"}</span>
            </button>
            {auditOpen && (
              <div className="mt-3 grid gap-3 md:grid-cols-2 text-xs">
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Coleta</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 bg-emerald-500/5">Google encontrados: {googleFound}</Badge>
                    <Badge variant="outline" className="text-[10px]" title="Google Places API (New)">New {s?.google_places_new ?? 0}</Badge>
                    <Badge variant="outline" className="text-[10px]" title="Google Places Legacy">Legacy {s?.google_places_legacy ?? 0}</Badge>
                    <Badge variant="outline" className="border-sky-500/40 text-sky-500 bg-sky-500/5">OSM encontrados: {osmFound}</Badge>
                    <Badge variant="outline" className="text-[10px]">Nominatim {s?.osm_nominatim ?? 0}</Badge>
                    <Badge variant="outline" className="text-[10px]">Overpass {s?.osm_overpass ?? 0}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge variant="outline" className="border-amber-500/40 text-amber-500 bg-amber-500/5">Rejeitados: {rejected}</Badge>
                    <Badge variant="outline" className="border-orange-500/40 text-orange-500 bg-orange-500/5">Duplicados: {dup}</Badge>
                    <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5">Aceitos: {acceptedNet}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge variant="outline" title="Aceitos válidos ÷ Total bruto coletado">
                      Recall estimado: {(recall * 100).toFixed(1)}%
                    </Badge>
                    <Badge variant="outline" title="Aceitos válidos ÷ (aceitos + rejeitados + duplicados)">
                      Precisão estimada: {(precision * 100).toFixed(1)}%
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Regras aplicadas</div>
                  <div className="space-y-1">
                    <div><span className="text-muted-foreground">Segmento detectado:</span> <strong>{searchAudit.audit!.segment_detected ?? "—"}</strong></div>
                    <div><span className="text-muted-foreground">Módulo:</span> {searchAudit.audit!.module ?? "—"}</div>
                    <div className="flex flex-wrap gap-1 items-baseline">
                      <span className="text-muted-foreground">Sinônimos ({(searchAudit.audit!.synonyms_used ?? []).length}):</span>
                      {(searchAudit.audit!.synonyms_used ?? []).slice(0, 12).map((syn) => (
                        <Badge key={syn} variant="outline" className="text-[10px]">{syn}</Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1 items-baseline">
                      <span className="text-muted-foreground">includedTypes:</span>
                      {(searchAudit.audit!.included_types_used ?? []).length === 0
                        ? <span className="text-muted-foreground">nenhum</span>
                        : (searchAudit.audit!.included_types_used ?? []).map((t) => (
                            <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                          ))}
                    </div>
                    <div className="flex flex-wrap gap-1 items-baseline">
                      <span className="text-muted-foreground">Fontes dos leads:</span>
                      {Object.entries(sourceCounts).map(([k, v]) => (
                        <Badge key={k} variant="outline" className="text-[10px]">{k}: {v}</Badge>
                      ))}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Dedupe realizado:</span> {(searchAudit.audit!.dedupe_events ?? []).length} evento(s)
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        );
      })()}

      {/* Auditoria dos leads descartados pelo filtro Orvix — apenas leitura.
          Classifica cada rejeição em: rejeição correta, possível falso negativo
          ou lead duvidoso. Não altera nenhuma regra de filtragem. */}
      {!loading && rejectedLeads.length > 0 && (() => {
        const perLead = searchAudit?.audit?.per_lead ?? {};
        const rejectionAudit = buildRejectionAudit(
          rejectedLeads,
          rejectionDetails,
          perLead,
          targetSegment,
        );

        const CLASS_ORDER: RejectionClass[] = [
          "possivel_falso_negativo",
          "duvidoso",
          "rejeicao_correta",
        ];
        const CLASS_META: Record<RejectionClass, { label: string; tone: string; icon: string }> = {
          possivel_falso_negativo: {
            label: "Possível falso negativo",
            tone: "border-rose-500/50 bg-rose-500/10 text-rose-500",
            icon: "⚠️",
          },
          duvidoso: {
            label: "Lead duvidoso",
            tone: "border-amber-500/40 bg-amber-500/10 text-amber-500",
            icon: "❔",
          },
          rejeicao_correta: {
            label: "Rejeição correta",
            tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
            icon: "✓",
          },
        };

        const grouped: Record<RejectionClass, typeof rejectionAudit.entries> = {
          possivel_falso_negativo: [],
          duvidoso: [],
          rejeicao_correta: [],
        };
        for (const e of rejectionAudit.entries) grouped[e.classification].push(e);

        // Diagnóstico bruto de fonte para ajudar a distinguir "sem dados" de
        // "excesso de filtragem".
        const bySource: Record<string, number> = {};
        for (const e of rejectionAudit.entries) {
          const s = e.meta.source ?? "unknown";
          bySource[s] = (bySource[s] ?? 0) + 1;
        }

        return (
          <Card className="p-3 border-amber-500/30 bg-amber-500/5">
            <details>
              <summary className="cursor-pointer text-xs font-medium flex items-center justify-between gap-2 select-none">
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-500" />
                  Auditoria de rejeições Orvix ({rejectionAudit.total})
                </span>
                <span className="text-muted-foreground text-[10px]">Expandir para revisar</span>
              </summary>

              {/* Sumário de classificação + diagnóstico por fonte */}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-border/40 bg-background/50 p-2 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Classificação
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <Badge variant="outline" className="border-rose-500/40 text-rose-500 bg-rose-500/5">
                      ⚠️ Falso negativo: {rejectionAudit.falseNegatives}
                    </Badge>
                    <Badge variant="outline" className="border-amber-500/40 text-amber-500 bg-amber-500/5">
                      ❔ Duvidosos: {rejectionAudit.doubtful}
                    </Badge>
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 bg-emerald-500/5">
                      ✓ Corretos: {rejectionAudit.correct}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground pt-1">
                    {rejectionAudit.falseNegatives > 0
                      ? `⚠️ ${rejectionAudit.falseNegatives} lead(s) descartado(s) apesar de terem sinal forte (Google type / OSM tag / includedType) do segmento "${targetSegment ?? "—"}". Provável excesso de filtragem.`
                      : rejectionAudit.total > 0
                        ? "Nenhum falso negativo detectado — filtro consistente com os sinais das fontes."
                        : "Sem rejeições."}
                  </div>
                </div>
                <div className="rounded-md border border-border/40 bg-background/50 p-2 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Rejeições por fonte
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    {Object.entries(bySource).map(([s, n]) => (
                      <Badge key={s} variant="outline" className="text-[10px]">
                        {s}: {n}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-[10px] text-muted-foreground pt-1">
                    Se rejeições concentradas em <code>google_places_new</code> com
                    Google types conhecidos → filtro textual está apertado demais.
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground">
                Diagnóstico read-only. Nenhuma regra foi alterada. Use para decidir se
                é necessário afrouxar <code>orvixSegmentValidation</code> em uma próxima sprint.
              </p>

              <div className="mt-3 space-y-4">
                {CLASS_ORDER.map((cls) => {
                  const items = grouped[cls];
                  if (items.length === 0) return null;
                  const meta = CLASS_META[cls];
                  return (
                    <div key={cls} className="space-y-2">
                      <div className={`text-[10px] uppercase tracking-wider font-semibold inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${meta.tone}`}>
                        {meta.icon} {meta.label} · {items.length}
                      </div>
                      <div className="grid gap-1.5">
                        {items.slice(0, 30).map((e) => {
                          const osmPairs = e.meta.osmTags
                            ? Object.entries(e.meta.osmTags).filter(
                                ([k]) => !k.startsWith("addr:") && !k.startsWith("contact:") && k !== "name",
                              )
                            : [];
                          return (
                            <div
                              key={e.leadId}
                              className="rounded-md border border-border/40 bg-background/50 p-2 text-[11px] space-y-1"
                            >
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div className="font-medium text-foreground">{e.name}</div>
                                <div className="flex gap-1 flex-wrap">
                                  <Badge variant="outline" className="text-[9px]" title="Fonte">
                                    {e.meta.source ?? "unknown"}
                                  </Badge>
                                  {e.meta.category && (
                                    <Badge variant="outline" className="text-[9px]" title="Categoria recebida">
                                      {e.meta.category}
                                    </Badge>
                                  )}
                                  {e.meta.includedType && (
                                    <Badge variant="outline" className="text-[9px]" title="includedType usado na busca">
                                      it={e.meta.includedType}
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              <div className="text-muted-foreground">
                                <span className="text-foreground/80">Motivo:</span>{" "}
                                {e.meta.reason ?? "sem detalhe"}
                                {e.meta.matchedTerm && (
                                  <>
                                    {" "}
                                    · regra bloqueou por{" "}
                                    <code className="text-[10px] bg-muted px-1 rounded">"{e.meta.matchedTerm}"</code>
                                  </>
                                )}
                              </div>

                              {e.positiveSignals.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-[10px] text-rose-500 font-semibold">Sinais do segmento alvo:</span>
                                  {e.positiveSignals.map((s) => (
                                    <Badge key={s} variant="outline" className="text-[9px] border-rose-500/40 text-rose-500">
                                      {s}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {e.negativeSignals.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-[10px] text-emerald-500 font-semibold">Sinais de outro nicho:</span>
                                  {e.negativeSignals.map((s) => (
                                    <Badge key={s} variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-500">
                                      {s}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {e.meta.googleTypes && e.meta.googleTypes.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-[10px] text-muted-foreground">Google types:</span>
                                  {e.meta.googleTypes.slice(0, 8).map((t) => (
                                    <Badge key={t} variant="outline" className="text-[9px]">
                                      {t}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {osmPairs.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-[10px] text-muted-foreground">Tags OSM:</span>
                                  {osmPairs.slice(0, 6).map(([k, v]) => (
                                    <Badge key={k} variant="outline" className="text-[9px]">
                                      {k}={v}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {items.length > 30 && (
                          <div className="text-[10px] text-muted-foreground">
                            + {items.length - 30} outros nesta classificação
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          </Card>
        );
      })()}

      {/* Auditoria de compatibilidade de segmento — camada analítica.
          Mostra para cada lead: nome, categoria recebida, tags OSM,
          sinais positivos, sinais negativos e motivo da classificação.
          Não altera coleta, filtro Orvix, CRM ou IA. */}
      {!loading && visibleLeads.length > 0 && (() => {
        const perLead = searchAudit?.audit?.per_lead ?? {};
        const rows = visibleLeads.map((l) => {
          const extId = (l as unknown as { external_id?: string }).external_id ?? "";
          const audit = extId ? perLead[extId] : undefined;
          return {
            lead: l,
            conf: segmentConfidenceMap.get(l.id)!,
            osm_tags: audit?.osm_tags ?? null,
            google_types: audit?.google_types ?? null,
            category: audit?.category ?? l.category ?? null,
          };
        });
        const CLASS_ORDER: SegmentMatch[] = [
          "false_positive_candidate",
          "weak_match",
          "medium_match",
          "strong_match",
        ];
        const CLASS_META: Record<SegmentMatch, { label: string; tone: string; icon: string }> = {
          strong_match: { label: "MATCH_FORTE", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500", icon: "🟢" },
          medium_match: { label: "MATCH_PROVAVEL", tone: "border-sky-500/40 bg-sky-500/10 text-sky-500", icon: "🟡" },
          weak_match: { label: "MATCH_FRACO", tone: "border-amber-500/40 bg-amber-500/10 text-amber-500", icon: "🟠" },
          false_positive_candidate: { label: "FORA_SEGMENTO", tone: "border-rose-500/50 bg-rose-500/10 text-rose-500", icon: "🔴" },
        };
        const grouped: Record<SegmentMatch, typeof rows> = {
          strong_match: [], medium_match: [], weak_match: [], false_positive_candidate: [],
        };
        for (const r of rows) grouped[r.conf.match].push(r);

        return (
          <Card className="p-3 border-primary/30 bg-primary/5">
            <details>
              <summary className="cursor-pointer text-xs font-medium flex items-center justify-between gap-2 select-none">
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Auditoria de compatibilidade de segmento ({rows.length})
                </span>
                <span className="text-muted-foreground text-[10px]">Expandir para revisar</span>
              </summary>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                {CLASS_ORDER.map((c) => (
                  <span key={c} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${CLASS_META[c].tone}`}>
                    <span aria-hidden>{CLASS_META[c].icon}</span>
                    {CLASS_META[c].label}: <strong className="tabular-nums">{grouped[c].length}</strong>
                  </span>
                ))}
              </div>
              <div className="mt-3 space-y-4">
                {CLASS_ORDER.map((c) => {
                  const items = grouped[c];
                  if (items.length === 0) return null;
                  return (
                    <div key={c} className="space-y-1.5">
                      <div className={`text-[11px] font-medium inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${CLASS_META[c].tone}`}>
                        <span aria-hidden>{CLASS_META[c].icon}</span>
                        {CLASS_META[c].label} ({items.length})
                      </div>
                      <div className="space-y-2">
                        {items.slice(0, 30).map(({ lead, conf, osm_tags, google_types, category }) => (
                          <div key={lead.id} className="rounded-md border border-border/50 bg-card/40 p-2.5 text-[11px] space-y-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <strong className="font-medium">{lead.name}</strong>
                              <span className={`tabular-nums rounded-full border px-1.5 py-0 ${segmentConfidenceBadgeClass(conf.match)}`}>
                                {conf.percent}%
                              </span>
                            </div>
                            <div className="text-muted-foreground">
                              <span className="opacity-70">Categoria recebida:</span>{" "}
                              <code className="text-[10px]">{category ?? "—"}</code>
                            </div>
                            {osm_tags && Object.keys(osm_tags).length > 0 && (
                              <div className="text-muted-foreground">
                                <span className="opacity-70">Tags OSM:</span>{" "}
                                <code className="text-[10px] break-all">
                                  {Object.entries(osm_tags).slice(0, 6).map(([k, v]) => `${k}=${v}`).join(", ")}
                                </code>
                              </div>
                            )}
                            {google_types && google_types.length > 0 && (
                              <div className="text-muted-foreground">
                                <span className="opacity-70">Google types:</span>{" "}
                                <code className="text-[10px]">{google_types.slice(0, 6).join(", ")}</code>
                              </div>
                            )}
                            {conf.matchedTerm && (
                              <div>
                                <span className="opacity-70">Termo que casou:</span>{" "}
                                <span className="text-emerald-500 font-medium">&ldquo;{conf.matchedTerm}&rdquo;</span>
                              </div>
                            )}
                            {conf.acceptanceTag && (
                              <div>
                                <span className="opacity-70">Tag de aceitação:</span>{" "}
                                <code className="text-[10px] text-emerald-500">{conf.acceptanceTag}</code>
                              </div>
                            )}
                            {conf.positives.length > 0 && (
                              <div>
                                <span className="opacity-70">Sinais +:</span>{" "}
                                <span className="text-emerald-500">{conf.positives.join(" · ")}</span>
                              </div>
                            )}
                            {conf.reductionReasons.length > 0 && (
                              <div>
                                <span className="opacity-70">Motivos de redução:</span>{" "}
                                <span className="text-rose-500">{conf.reductionReasons.join(" · ")}</span>
                              </div>
                            )}
                            {conf.conflict && conf.conflictReason && (
                              <div className="rounded-sm border border-amber-500/40 bg-amber-500/5 px-1.5 py-1">
                                <span className="opacity-70">Conflito:</span>{" "}
                                <span className="text-amber-500">{conf.conflictReason}</span>
                              </div>
                            )}
                            <div className="text-muted-foreground italic">{conf.reason}</div>
                          </div>
                        ))}
                        {items.length > 30 && (
                          <div className="text-[10px] text-muted-foreground">
                            + {items.length - 30} outros nesta classificação
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          </Card>
        );
      })()}






      {loading ? (
        <div className="text-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Carregando leads…
        </div>
      ) : visibleLeads.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <p className="text-muted-foreground mb-3">
            {leads.length > 0
              ? onlyHigh
                ? "Nenhum lead altamente confiável nesta busca."
                : "Nenhum lead compatível com o segmento escolhido."
              : "Nenhum lead encontrado para esta busca."}
          </p>
          <Button asChild><Link to="/orvix/prospectar">Fazer nova prospecção</Link></Button>
        </Card>
      ) : (
        <TooltipProvider delayDuration={200}>
          <div className="grid gap-2">
            {visibleLeads.map((l) => (
              <OrvixLeadCard
                key={l.id}
                lead={l}
                isRejected={rejectedIds.has(l.id)}
                confidence={confidenceMap.get(l.id)}
                opportunity={opportunityMap.get(l.id)}
                segmentConfidence={segmentConfidenceMap.get(l.id)}
                onDiagnostic={handleDiagnostic}
                onApproach={handleApproach}
                onCrm={handleCrm}
              />
            ))}
          </div>
        </TooltipProvider>
      )}


      <OrvixDiagnosticDialog
        lead={diagLead}
        open={!!diagLead}
        onOpenChange={(o) => { if (!o) setDiagLead(null); }}
      />
      <OrvixApproachDialog
        lead={approachLead}
        open={!!approachLead}
        onOpenChange={(o) => { if (!o) setApproachLead(null); }}
      />
      <OrvixCrmPanel
        lead={crmLead}
        open={!!crmLead}
        onOpenChange={(o) => { if (!o) setCrmLead(null); }}
        onLeadChange={(patch) => {
          setLeads((prev) => prev.map((x) => (x.id === crmLead?.id ? { ...x, ...patch } as Lead : x)));
          setCrmLead((prev) => (prev ? { ...prev, ...patch } as Lead : prev));
        }}
      />
    </div>
  );
}
