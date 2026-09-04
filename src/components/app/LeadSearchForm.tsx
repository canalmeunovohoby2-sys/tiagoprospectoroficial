import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Search as SearchIcon, Loader2, Sparkles, RefreshCw, AlertCircle, ShieldCheck, Shield, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { BR_STATES, SEGMENTS, fetchCities } from "@/data/brazil";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { enrichLeadWithScores, sortLeadsByScore } from "@/lib/leadScoring";

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

type SearchPlacesLead = {
  external_id?: string | null;
  name?: string | null;
  category?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  google_url?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  has_website?: boolean | null;
  score?: number | null;
  score_reasons?: string[] | null;
  opening_hours?: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
  confidence?: string | null;
};

type SearchWarning = { source: string; code?: string; message: string; action?: string };

type SourceStatus = "success" | "rate_limited" | "error" | "skipped";
type SearchStatus =
  | "SUCCESS"
  | "SUCCESS_WITH_WARNINGS"
  | "PARTIAL_RESULTS"
  | "EMPTY"
  | "EMPTY_REAL"
  | "EMPTY_WITH_LIMITATIONS"
  | "EXTERNAL_FAILURE";

type SearchPlacesResponse = {
  leads?: SearchPlacesLead[];
  error?: string;
  action?: string;
  source?: string;
  sources_tried?: string[];
  warnings?: SearchWarning[];
  google_enabled?: boolean;
  diagnostics?: Record<string, unknown>;
  audit?: Record<string, unknown>;
  search_status?: SearchStatus;
  sources_status?: { google?: SourceStatus; nominatim?: SourceStatus; overpass?: SourceStatus };
};

type SearchNotice = {
  tone: "warning" | "error" | "success";
  title: string;
  description?: string;
};

const GOOGLE_WARNING_CODES = new Set([
  "GOOGLE_PLACES_NEW_DISABLED",
  "GOOGLE_LEGACY_DISABLED",
  "GOOGLE_BILLING_DISABLED",
  "GOOGLE_QUOTA_EXCEEDED",
  "GOOGLE_API_KEY_RESTRICTED",
  "GOOGLE_API_KEY_INVALID",
  "GOOGLE_PERMISSION_DENIED",
  "GOOGLE_INVALID_REQUEST",
  "GOOGLE_REQUEST_DENIED",
  "GOOGLE_OVER_QUERY_LIMIT",
  "GOOGLE_ZERO_RESULTS",
  "GOOGLE_NETWORK_ERROR",
  "GOOGLE_TIMEOUT",
  "GOOGLE_PLACES_ERROR",
  "GOOGLE_KEY_MISSING",
]);

function isGoogleWarning(warning: SearchWarning) {
  return warning.source.startsWith("google_") || (warning.code ? GOOGLE_WARNING_CODES.has(warning.code) : false);
}

const nativeSelectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const STAGES = [
  "Conectando às fontes de dados…",
  "Tentando Google Places…",
  "Caso falhe, tentando OpenStreetMap…",
  "Coletando telefones, sites e avaliações…",
  "Validando endereço e cidade…",
  "Finalizando resultados…",
];

const SOURCE_LABEL: Record<string, string> = {
  google_places_new: "Google Places (New)",
  google_places_legacy: "Google Places (Legacy)",
  openstreetmap: "OpenStreetMap",
  openstreetmap_nominatim: "OpenStreetMap/Nominatim",
  openstreetmap_overpass: "OpenStreetMap/Overpass",
  none: "Nenhuma fonte",
};

function getSearchErrorMessage(error: unknown, data?: unknown) {
  const payload = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const context = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
  const message = String(payload.error ?? context.message ?? "Erro ao pesquisar");
  const action = typeof payload.action === "string" ? payload.action : "";
  return [message, action].filter(Boolean).join("\n");
}

function uniqueWarnings(warnings: SearchWarning[]) {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code ?? warning.source}:${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface LeadSearchFormProps {
  /** Callback invocado após persistir searches + leads com sucesso. Recebe o id da search criada. */
  onComplete: (searchId: string) => void;
  /** Rótulo do CTA principal. */
  ctaLabel?: string;
  /** Rótulo exibido enquanto está pesquisando. */
  ctaLoadingLabel?: string;
  /** Mostra o card explicativo de fontes consultadas ao final. */
  showSourcesCard?: boolean;
  /** Lista de segmentos disponíveis no select. Default: SEGMENTS globais. */
  segments?: readonly string[];
  /**
   * Módulo consumidor. A edge function `search-places` usa esse valor para
   * ajustar a priorização de leads (ex.: em "orvix" não damos peso para
   * ausência de site). Default: "landing_pages" (comportamento original).
   */
  module?: "orvix" | "landing_pages";
}

/**
 * Formulário reutilizável de busca de leads (Estado / Cidade / Segmento).
 * Encapsula todo o fluxo: chamada da edge function `search-places`, scoring,
 * persistência em `searches` + `leads` e feedback de progresso/erros.
 * Nada aqui altera o comportamento pré-existente — o único ponto de saída
 * é o callback `onComplete(searchId)` fornecido pelo consumidor.
 */
export function LeadSearchForm({
  onComplete,
  ctaLabel = "Buscar leads reais",
  ctaLoadingLabel = "Pesquisando…",
  showSourcesCard = true,
  segments: segmentOptions = SEGMENTS,
  module = "landing_pages",
}: LeadSearchFormProps) {
  const { user, authError, ensureSession } = useAuth();
  const [state, setState] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [segment, setSegment] = useState<string>("");
  const [customSegment, setCustomSegment] = useState<string>("");
  const [cities, setCities] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<SearchNotice | null>(null);
  const stageTimer = useRef<number | null>(null);

  const loadCities = useCallback((uf: string, signal?: AbortSignal) => {
    const safeUf = typeof uf === "string" ? uf.trim().toUpperCase() : "";
    if (!safeUf) {
      setCities([]); setCitiesError(null); setLoadingCities(false);
      return Promise.resolve();
    }
    setLoadingCities(true); setCitiesError(null);
    return fetchCities(safeUf, signal)
      .then((c) => {
        if (signal?.aborted) return;
        setCities(Array.isArray(c) ? c.filter((n) => typeof n === "string" && n.trim().length > 0) : []);
      })
      .catch((err) => {
        if (signal?.aborted || err?.name === "AbortError") return;
        console.error("[LeadSearchForm] fetchCities failed", err);
        setCities([]); setCitiesError("Não foi possível carregar as cidades");
      })
      .finally(() => { if (!signal?.aborted) setLoadingCities(false); });
  }, []);

  useEffect(() => {
    setCity("");
    if (!state) { setCities([]); setCitiesError(null); setLoadingCities(false); return; }
    const ctrl = new AbortController();
    loadCities(state, ctrl.signal);
    return () => ctrl.abort();
  }, [state, loadCities]);

  const finalSegment = segment === "__custom__" ? customSegment.trim() : segment;

  function startStageRotation() {
    setStageIdx(0); setProgress(8);
    let i = 0;
    stageTimer.current = window.setInterval(() => {
      i = Math.min(i + 1, STAGES.length - 1);
      setStageIdx(i);
      setProgress((p) => Math.min(92, p + 14));
    }, 1200);
  }
  function stopStageRotation() {
    if (stageTimer.current) { clearInterval(stageTimer.current); stageTimer.current = null; }
  }

  async function handleSearch() {
    // Uso pessoal: a sessão é criada automaticamente (conta anônima do Supabase).
    // Se ainda não estiver pronta, aguarda a criação em vez de bloquear em silêncio.
    let uid = user?.id;
    if (!uid) {
      const ready = await ensureSession();
      if (!ready) {
        toast.error(
          authError ??
            "Não foi possível iniciar a sessão de uso pessoal. Tente novamente em instantes.",
          { duration: 12000 },
        );
        return;
      }
      const { data: sessionData } = await supabase.auth.getUser();
      uid = sessionData.user?.id ?? null;
      if (!uid) {
        toast.error("Não foi possível obter a sessão de uso pessoal. Tente novamente.");
        return;
      }
    }
    const safeState = state.trim().toUpperCase();
    const safeCity = city.trim();
    const safeSegment = finalSegment.trim();

    if (!safeState || !safeCity || !safeSegment) {
      toast.error("Preencha estado, cidade e segmento.");
      return;
    }
    if (!BR_STATES.some((s) => s.uf === safeState) || !cities.includes(safeCity) || safeSegment.length < 2) {
      toast.error("Selecione um estado, cidade e segmento válidos.");
      return;
    }
    setSearching(true);
    setNotice(null);
    startStageRotation();
    try {
      const startedAt = performance.now();
      const { data, error } = await supabase.functions.invoke<SearchPlacesResponse>("search-places", {
        body: { state: safeState, city: safeCity, segment: safeSegment, maxPages: 2, module },
      });
      console.info("[LeadSearchForm] resposta da busca", {
        durationMs: Math.round(performance.now() - startedAt),
        source: data?.source,
        count: data?.leads?.length ?? 0,
      });
      if (error) throw new Error(getSearchErrorMessage(error, data));

      const rawLeads = data?.leads ?? [];
      const enrichedLeads = rawLeads.map((l: SearchPlacesLead) => enrichLeadWithScores(l));
      const realLeads = sortLeadsByScore(enrichedLeads);
      const warnings = uniqueWarnings(data?.warnings ?? []);
      const usedSource = data?.source ?? "none";

      const searchStatus: SearchStatus = data?.search_status
        ?? (realLeads.length > 0 ? "SUCCESS" : "EMPTY");
      console.info("[LeadSearchForm] search_status", {
        search_status: searchStatus,
        sources_status: data?.sources_status,
        leads: realLeads.length,
      });
      const isEmptyWithLimitations =
        searchStatus === "EMPTY_WITH_LIMITATIONS" || searchStatus === "EXTERNAL_FAILURE";
      const isEmptyReal = searchStatus === "EMPTY_REAL" || searchStatus === "EMPTY";

      if (realLeads.length === 0) {
        const googleUnavailable = warnings.some(isGoogleWarning);
        const nonGoogleWarnings = warnings.filter((w) => !isGoogleWarning(w));
        for (const w of nonGoogleWarnings.slice(0, 2)) {
          toast.warning(`${SOURCE_LABEL[w.source] ?? w.source}: ${w.message}`, {
            description: w.action,
            duration: 7000,
          });
        }
        const msg = isEmptyWithLimitations
          ? "Nenhum lead encontrado pelas fontes públicas disponíveis."
          : data?.error
            ? getSearchErrorMessage(null, data)
            : "Nenhum lead encontrado para este segmento e localização nas fontes públicas disponíveis.";
        setNotice({
          tone: isEmptyWithLimitations ? "warning" : "error",
          title: msg,
          description: isEmptyWithLimitations
            ? "Uma das fontes de dados estava temporariamente indisponível, o que pode reduzir a cobertura. Refaça em alguns instantes ou tente outro termo/cidade."
            : googleUnavailable
              ? "A busca utiliza fontes públicas (OpenStreetMap) e pode ter cobertura menor em alguns segmentos. Tente outra cidade, outro segmento ou um termo mais amplo."
              : "Tente outro segmento, uma cidade maior ou um termo mais amplo.",
        });
        toast.warning(msg, { duration: 8000 });
        setSearching(false); stopStageRotation(); setProgress(0);
        return;
      }

      const actionableWarnings = warnings.filter((w) => !isGoogleWarning(w));
      for (const w of actionableWarnings) {
        toast.warning(`${SOURCE_LABEL[w.source] ?? w.source}: ${w.message}`, {
          description: w.action,
          duration: 7000,
        });
      }

      const { data: search, error: sErr } = await supabase
        .from("searches")
        .insert({ user_id: uid, state: safeState, city: safeCity, segment: safeSegment, results_count: realLeads.length })
        .select()
        .single();
      if (sErr) throw sErr;

      const payload: LeadInsert[] = realLeads.map((l) => ({
        user_id: uid,
        search_id: search.id,
        external_id: l.external_id ?? null,
        name: l.name ?? "Não disponível",
        category: l.category ?? null,
        segment: safeSegment,
        city: l.city ?? safeCity,
        state: l.state ?? safeState,
        address: l.address ?? null,
        phone: l.phone ?? null,
        whatsapp: l.whatsapp ?? null,
        website: l.website ?? null,
        google_url: l.google_url ?? null,
        instagram: l.instagram ?? null,
        facebook: l.facebook ?? null,
        rating: l.rating ?? null,
        reviews_count: l.reviews_count ?? 0,
        has_website: !!l.has_website,
        score: l.score ?? 1,
        score_reasons: l.score_reasons ?? [],
        opening_hours: l.opening_hours ?? null,
        latitude: l.latitude ?? null,
        longitude: l.longitude ?? null,
        confidence: l.confidence ?? null,
        money_score: l.money_score ?? null,
        pain_score: l.pain_score ?? null,
        intent_score: l.intent_score ?? null,
        final_score: l.final_score ?? null,
      }));
      const { error: lErr } = await supabase.from("leads").insert(payload);
      if (lErr) throw lErr;

      // Auditoria da busca — apenas em memória (sessionStorage), sem persistência em banco.
      try {
        const auditPayload = {
          audit: (data as unknown as { audit?: unknown })?.audit ?? null,
          diagnostics: data?.diagnostics ?? null,
          source: usedSource,
          search_status: searchStatus,
          sources_status: data?.sources_status ?? null,
          created_at: Date.now(),
          input: { state: safeState, city: safeCity, segment: safeSegment, module },
        };
        sessionStorage.setItem(`orvix:audit:${search.id}`, JSON.stringify(auditPayload));
      } catch { /* sessionStorage indisponível — ignorar */ }

      setProgress(100);
      toast.success(`${realLeads.length} leads reais encontrados em ${safeCity}/${safeState}`, {
        description: `Fonte: ${SOURCE_LABEL[usedSource] ?? usedSource}`,
      });
      onComplete(search.id);
    } catch (e: unknown) {
      console.error("[LeadSearchForm] erro", e);
      const message = e instanceof Error ? e.message : "Erro ao pesquisar";
      setNotice({
        tone: "error",
        title: "Não foi possível concluir a pesquisa.",
        description: message,
      });
      toast.error(message, { duration: 12000 });
    } finally {
      stopStageRotation();
      setSearching(false);
    }
  }

  const stateOptions = useMemo(
    () => BR_STATES.map((s) => ({ value: s.uf, label: `${s.name} (${s.uf})`, keywords: `${s.name} ${s.uf}` })),
    [],
  );
  const cityOptions = useMemo(
    () => cities.map((c) => ({ value: c, label: c })),
    [cities],
  );
  const segmentComboOptions = useMemo(
    () => [
      ...segmentOptions.map((s) => ({ value: s, label: s })),
      { value: "__custom__", label: "✎ Personalizado…" },
    ],
    [segmentOptions],
  );

  return (
    <>
      <Card className="p-6 border-border/50 bg-gradient-to-br from-card to-card/40">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Estado</Label>
            <SearchableCombobox
              options={stateOptions}
              value={state}
              onChange={(v) => setState(v.trim().toUpperCase())}
              placeholder="Selecione o estado"
              searchPlaceholder="Digite o estado ou UF…"
              emptyMessage="Nenhum estado encontrado."
              disabled={searching}
              ariaLabel="Estado"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between min-h-[20px]">
              <Label>Cidade</Label>
              {citiesError && state && (
                <button type="button" onClick={() => loadCities(state)} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" /> Tentar novamente
                </button>
              )}
            </div>
            <SearchableCombobox
              options={cityOptions}
              value={city}
              onChange={setCity}
              placeholder={
                !state ? "Escolha um estado primeiro" :
                loadingCities ? "Carregando cidades…" :
                citiesError ? "Erro ao carregar" :
                cities.length === 0 ? "Nenhuma cidade encontrada" :
                "Selecione a cidade"
              }
              searchPlaceholder="Digite o nome da cidade…"
              emptyMessage="Nenhuma cidade encontrada."
              disabled={!state || loadingCities || !!citiesError || searching}
              loading={loadingCities}
              ariaLabel="Cidade"
            />
            {citiesError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {citiesError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Segmento</Label>
            <SearchableCombobox
              options={segmentComboOptions}
              value={segment}
              onChange={setSegment}
              placeholder="Selecione ou personalize"
              searchPlaceholder="Digite o segmento…"
              emptyMessage="Nenhum segmento encontrado."
              disabled={searching}
              ariaLabel="Segmento"
            />
          </div>
        </div>

        {segment === "__custom__" && (
          <div className="mt-4 space-y-2">
            <Label>Segmento personalizado</Label>
            <Input
              placeholder="ex.: Fotógrafos de casamento"
              value={customSegment}
              onChange={(e) => setCustomSegment(e.target.value)}
              disabled={searching}
            />
          </div>
        )}

        <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Score de oportunidade calculado a partir de dados públicos reais.
          </div>
          <Button onClick={handleSearch} disabled={searching} className="bg-gradient-primary hover:opacity-90 shadow-elegant">
            {searching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <SearchIcon className="h-4 w-4 mr-2" />}
            {searching ? ctaLoadingLabel : ctaLabel}
          </Button>
        </div>

        {searching && (
          <div className="mt-5 space-y-2 overflow-hidden">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> {STAGES[stageIdx]}
            </p>
          </div>
        )}

        {notice && !searching && (
          <div className={`mt-5 rounded-md border p-4 text-sm ${notice.tone === "error" ? "border-destructive/30 bg-destructive/10" : "border-amber-500/30 bg-amber-500/10"}`}>
            <div className="flex items-start gap-2">
              <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${notice.tone === "error" ? "text-destructive" : "text-amber-500"}`} />
              <div className="space-y-1">
                <p className="font-medium text-foreground">{notice.title}</p>
                {notice.description && <p className="text-xs text-muted-foreground">{notice.description}</p>}
              </div>
            </div>
          </div>
        )}
      </Card>

      {showSourcesCard && (
        <Card className="p-5 border-border/50 bg-muted/30">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p><strong className="text-foreground">Fontes consultadas em cascata:</strong></p>
              <p>1. <strong className="text-foreground">Google Places API (New)</strong> — quando a chave estiver configurada e ativa.</p>
              <p>2. <strong className="text-foreground">Google Places (Legacy)</strong> — fallback automático.</p>
              <p>3. <strong className="text-foreground">OpenStreetMap / Nominatim</strong> — fonte pública gratuita para endereços e locais.</p>
              <p>4. <strong className="text-foreground">OpenStreetMap / Overpass</strong> — busca por categorias oficiais do mapa quando as outras fontes falham.</p>
              <p className="pt-1">Se uma fonte falhar, a próxima é tentada automaticamente. Campos sem informação pública aparecem como <em>"Não disponível"</em> — nunca inventamos dados.</p>
            </div>
          </div>
          <div className="flex gap-4 mt-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald-500" /> Alta</span>
            <span className="inline-flex items-center gap-1"><Shield className="h-3 w-3 text-amber-500" /> Média</span>
            <span className="inline-flex items-center gap-1"><ShieldAlert className="h-3 w-3 text-red-500" /> Baixa</span>
          </div>
        </Card>
      )}
    </>
  );
}
