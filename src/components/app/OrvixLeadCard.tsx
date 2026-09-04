import { memo, useMemo, useState } from "react";
import {
  Star, Globe, MapPin, Phone, MessageSquare, Instagram, Facebook,
  Map as MapIcon, Stethoscope, MessagesSquare, Kanban, MoreHorizontal,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Lead } from "@/data/types";
import { computeOrvixDiagnostic } from "@/lib/orvixDiagnostics";
import { computeOrvixPriority } from "@/lib/orvixPriority";
import { resolveLeadMap, mapConfidenceShort } from "@/lib/leadMapLocation";
import type { LeadConfidence } from "@/lib/orvixLeadConfidence";
import { confidenceBadgeClass } from "@/lib/orvixLeadConfidence";
import type { OpportunityScore } from "@/lib/orvixOpportunityScore";
import { opportunityBadgeClass } from "@/lib/orvixOpportunityScore";
import { computeBusinessFit, businessFitBadgeClass } from "@/lib/orvixBusinessFit";
import type { SegmentConfidence } from "@/lib/orvixSegmentConfidence";
import { segmentConfidenceBadgeClass } from "@/lib/orvixSegmentConfidence";

interface Props {
  lead: Lead;
  isRejected: boolean;
  confidence?: LeadConfidence;
  opportunity?: OpportunityScore;
  segmentConfidence?: SegmentConfidence;
  onDiagnostic: (l: Lead) => void;
  onApproach: (l: Lead) => void;
  onCrm: (l: Lead) => void;
}

function OrvixLeadCardBase({ lead: l, isRejected, confidence, opportunity, segmentConfidence, onDiagnostic, onApproach, onCrm }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  const diag = useMemo(() => computeOrvixDiagnostic(l), [l]);
  const prio = useMemo(() => computeOrvixPriority(l, diag), [l, diag]);
  const fit  = useMemo(() => computeBusinessFit(l), [l]);
  const map  = useMemo(() => resolveLeadMap(l), [l]);

  const location = [l.city, l.state].filter(Boolean).join("/");
  const waHref = l.whatsapp ? `https://wa.me/${l.whatsapp.replace(/\D/g, "")}` : null;

  return (
    <Card
      className={`px-4 py-2.5 border-border/50 bg-card ${isRejected ? "opacity-60 border-dashed" : ""}`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1 space-y-0.5">
          {/* Linha 1: Empresa + prioridade + confiança */}
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-display text-base font-semibold truncate">{l.name}</h3>
            {confidence && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] shrink-0 cursor-help ${confidenceBadgeClass(confidence.tier)}`}
                    aria-label={confidence.label}
                  >
                    <span aria-hidden>{confidence.emoji}</span>
                    <span className="tabular-nums">{confidence.score}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <div className="font-medium">{confidence.label} · {confidence.score}/100</div>
                  {confidence.reasons.length > 0 && (
                    <ul className="mt-1 text-xs opacity-90 list-disc list-inside">
                      {confidence.reasons.slice(0, 6).map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                  {confidence.warnings.length > 0 && (
                    <ul className="mt-1 text-xs opacity-70 list-disc list-inside">
                      {confidence.warnings.slice(0, 4).map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={`text-[10px] gap-1 shrink-0 ${prio.badgeClass}`}
                >
                  <span aria-hidden>{prio.emoji}</span> {prio.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="font-medium">{prio.label} · {prio.score}/100</div>
                <div className="text-xs whitespace-pre-line opacity-80">{prio.reasons.join("\n")}</div>
              </TooltipContent>
            </Tooltip>
            {isRejected && (
              <Badge variant="outline" className="text-[10px] shrink-0 border-amber-500/40 text-amber-500 bg-amber-500/5">
                Fora do segmento
              </Badge>
            )}
            {opportunity && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={`text-[10px] gap-1 shrink-0 cursor-help ${opportunityBadgeClass(opportunity.tier)}`}
                    aria-label={`Oportunidade comercial: ${opportunity.label}`}
                  >
                    <span aria-hidden>{opportunity.emoji}</span>
                    <span className="tabular-nums">{opportunity.score}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <div className="font-medium">Oportunidade comercial · {opportunity.score}/100</div>
                  <div className="text-[11px] opacity-80">{opportunity.label}</div>
                  {opportunity.growth && (
                    <div className="mt-1 text-[11px] text-emerald-500">Sinais de crescimento</div>
                  )}
                  {opportunity.organizedSmall && (
                    <div className="mt-1 text-[11px] text-sky-500">Pequeno negócio organizado</div>
                  )}
                  {opportunity.reasons.length > 0 && (
                    <ul className="mt-1 text-xs opacity-90 list-disc list-inside">
                      {opportunity.reasons.slice(0, 6).map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                  {opportunity.warnings.length > 0 && (
                    <ul className="mt-1 text-xs opacity-70 list-disc list-inside">
                      {opportunity.warnings.slice(0, 4).map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={`text-[10px] gap-1 shrink-0 cursor-help ${businessFitBadgeClass(fit.tier)}`}
                  aria-label={`Fit Orvix: ${fit.label}`}
                >
                  <span aria-hidden>{fit.emoji}</span>
                  <span className="tabular-nums">Fit {fit.score}</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="font-medium">Fit Orvix · {fit.score}/100</div>
                <div className="text-[11px] opacity-80">{fit.label}</div>
                <div className="text-[10px] opacity-60 mt-1">
                  Aderência ao cliente ideal para ERP/PDV
                </div>
                {fit.reasons.length > 0 && (
                  <ul className="mt-1 text-xs opacity-90 list-disc list-inside">
                    {fit.reasons.slice(0, 6).map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}
                {fit.warnings.length > 0 && (
                  <ul className="mt-1 text-xs text-amber-500 list-disc list-inside">
                    {fit.warnings.slice(0, 4).map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
              </TooltipContent>
            </Tooltip>
            {segmentConfidence && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={`text-[10px] gap-1 shrink-0 cursor-help ${segmentConfidenceBadgeClass(segmentConfidence.match)}`}
                    aria-label={`Compatibilidade de segmento: ${segmentConfidence.label}`}
                  >
                    <span aria-hidden>{segmentConfidence.emoji}</span>
                    <span className="tabular-nums">Segmento {segmentConfidence.percent}%</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <div className="font-medium">Compatibilidade de segmento · {segmentConfidence.percent}%</div>
                  <div className="text-[11px] opacity-80">{segmentConfidence.label}</div>
                  <div className="text-[10px] opacity-60 mt-1">{segmentConfidence.reason}</div>
                  {segmentConfidence.positives.length > 0 && (
                    <ul className="mt-1 text-xs opacity-90 list-disc list-inside">
                      {segmentConfidence.positives.slice(0, 6).map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                  {segmentConfidence.negatives.length > 0 && (
                    <ul className="mt-1 text-xs text-amber-500 list-disc list-inside">
                      {segmentConfidence.negatives.slice(0, 4).map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  )}
                </TooltipContent>
              </Tooltip>
            )}
          </div>





          {/* Linha 2: Segmento • Cidade • Rating */}
          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            {l.category && <span className="truncate max-w-[220px]">{l.category}</span>}
            {location && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 cursor-help">
                    <MapPin className="h-3 w-3" /> {location}
                  </span>
                </TooltipTrigger>
                {l.address && <TooltipContent>{l.address}</TooltipContent>}
              </Tooltip>
            )}
            {typeof l.rating === "number" && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3 w-3 text-amber-500" />
                {l.rating.toFixed(1)} · {l.reviews_count ?? 0}
              </span>
            )}
          </div>

          {/* Linha 3: Telefone • WhatsApp */}
          {(l.phone || l.whatsapp) && (
            <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
              {l.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {l.phone}
                </span>
              )}
              {l.whatsapp && l.whatsapp !== l.phone && (
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> {l.whatsapp}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Linha 4: Ações principais */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {waHref && (
            <Button asChild size="sm" className="h-8">
              <a href={waHref} target="_blank" rel="noreferrer">
                <MessageSquare className="h-3.5 w-3.5 mr-1" /> WhatsApp
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => onCrm(l)}
            title="Abrir no CRM"
          >
            <Kanban className="h-3.5 w-3.5 mr-1" />
            CRM {l.in_crm && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />}
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => onDiagnostic(l)}>
            <Stethoscope className="h-3.5 w-3.5 mr-1" /> Diagnóstico
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => onApproach(l)}>
            <MessagesSquare className="h-3.5 w-3.5 mr-1" /> IA
          </Button>

          <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 px-2" aria-label="Mais ações">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {l.phone && (
                <DropdownMenuItem asChild>
                  <a href={`tel:${l.phone}`}><Phone className="h-3.5 w-3.5 mr-2" /> Ligar</a>
                </DropdownMenuItem>
              )}
              {l.website && (
                <DropdownMenuItem asChild>
                  <a href={l.website} target="_blank" rel="noreferrer">
                    <Globe className="h-3.5 w-3.5 mr-2" /> Site
                  </a>
                </DropdownMenuItem>
              )}
              {l.instagram && (
                <DropdownMenuItem asChild>
                  <a href={l.instagram} target="_blank" rel="noreferrer">
                    <Instagram className="h-3.5 w-3.5 mr-2" /> Instagram
                  </a>
                </DropdownMenuItem>
              )}
              {l.facebook && (
                <DropdownMenuItem asChild>
                  <a href={l.facebook} target="_blank" rel="noreferrer">
                    <Facebook className="h-3.5 w-3.5 mr-2" /> Facebook
                  </a>
                </DropdownMenuItem>
              )}
              {map.url ? (
                <DropdownMenuItem asChild>
                  <a href={map.url} target="_blank" rel="noreferrer" title={map.tooltip}>
                    <MapIcon className="h-3.5 w-3.5 mr-2" />
                    {map.label}
                    <span className="ml-auto text-[9px] opacity-60">{mapConfidenceShort(map.confidence)}</span>
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled title={map.tooltip}>
                  <MapIcon className="h-3.5 w-3.5 mr-2" /> {map.label}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}

export const OrvixLeadCard = memo(OrvixLeadCardBase);
