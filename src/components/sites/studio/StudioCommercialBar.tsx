import type { ReactNode } from "react";
import {
  Copy, ExternalLink, FileText, FolderDown, Globe, Hammer, History, Loader2, Rocket, Send, Undo2, Video,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { StudioCommercialActions } from "./StudioToolbar";

export interface StudioCommercialBarProps {
  commercial: StudioCommercialActions;
  /** Histórico de versões (mesmo handler do container). */
  onOpenHistory?: () => void;
}

/** Botão compacto (mesmo padrão da barra do Studio). */
function BarButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Ações comerciais do projeto (Histórico/Build/Proposta/Baixar/Vídeo/WhatsApp/
 * Publicar/Despublicar) — vivem no TOPO da página para o preview ficar maior.
 */
export function StudioCommercialBar({ commercial: c, onOpenHistory }: StudioCommercialBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {onOpenHistory && (
        <BarButton label="Histórico de versões" onClick={onOpenHistory}>
          <History className="h-3 w-3" />
          <span className="hidden xl:inline">Histórico</span>
        </BarButton>
      )}
      {c.canBuild && (
        <BarButton label="Build de produção (React)" onClick={c.onBuild ?? (() => {})} disabled={!!c.building}>
          {c.building ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hammer className="h-3 w-3" />}
          <span className="hidden xl:inline">Build</span>
        </BarButton>
      )}
      <BarButton label="Gerar proposta em PDF" onClick={c.onProposalPdf} disabled={!!c.busyAction || !c.canPublish}>
        {c.busyAction === "pdf" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
        <span className="hidden xl:inline">Proposta</span>
      </BarButton>
      <BarButton label="Baixar projeto (ZIP)" onClick={c.onDownloadZip} disabled={!!c.busyAction}>
        {c.busyAction === "zip" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderDown className="h-3 w-3" />}
        <span className="hidden xl:inline">Baixar</span>
      </BarButton>
      <BarButton label="Gerar vídeo de apresentação (MP4)" onClick={c.onGenerateVideo} disabled={c.generatingVideo || !c.canVideo}>
        {c.generatingVideo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Video className="h-3 w-3" />}
        <span className="hidden xl:inline">Vídeo</span>
      </BarButton>
      <BarButton
        label={c.canWhatsApp ? "Enviar proposta pelo WhatsApp" : "Indisponível: lead sem WhatsApp comprovado"}
        onClick={c.onWhatsApp}
        disabled={!c.canWhatsApp}
      >
        <Send className="h-3 w-3" />
        <span className="hidden xl:inline">WhatsApp</span>
      </BarButton>

      {c.canUnpublish && c.canPublish ? (
        <>
          <BarButton label="Publicar nova versão" onClick={c.onPublish} disabled={c.publishing}>
            {c.publishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
            <span className="hidden xl:inline">Publicar</span>
          </BarButton>
          <BarButton label="Despublicar site" onClick={c.onUnpublish} disabled={c.unpublishing}>
            {c.unpublishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
            <span className="hidden xl:inline">Despublicar</span>
          </BarButton>
        </>
      ) : (
        <BarButton label="Publicar site" onClick={c.onPublish} disabled={c.publishing || !c.canPublish}>
          {c.publishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
          <span className="hidden xl:inline">Publicar</span>
        </BarButton>
      )}

      {c.publishedUrl && (
        <span className="inline-flex min-w-0 items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-1.5 py-1 text-[10.5px] text-emerald-700">
          <Globe className="h-3 w-3 shrink-0" />
          <span className="hidden min-w-0 max-w-[150px] truncate font-mono text-[10px] sm:inline" title={c.publishedUrl}>{c.publishedUrl}</span>
          <button type="button" onClick={c.onCopyLink} className="inline-flex h-5 items-center rounded px-1 hover:bg-emerald-500/10" title="Copiar link" aria-label="Copiar link">
            <Copy className="h-3 w-3" />
          </button>
          <a href={c.publishedUrl} target="_blank" rel="noreferrer" className="inline-flex h-5 items-center rounded px-1 hover:bg-emerald-500/10" title="Abrir site" aria-label="Abrir site">
            <ExternalLink className="h-3 w-3" />
          </a>
        </span>
      )}

      {c.githubSlot}
    </div>
  );
}
