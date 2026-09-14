import type { ReactNode } from "react";
import {
  Code2, Columns2, Copy, Eye, ExternalLink, FileText, FolderDown, Globe, Hammer, History, Loader2, Paintbrush, Play,
  RefreshCw, Rocket, Send, Undo2, Video,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { StudioView } from "@/lib/studio/types";

export interface StudioCommercialActions {
  onProposalPdf: () => void;
  onDownloadZip: () => void;
  onGenerateVideo: () => void;
  onWhatsApp: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  publishing: boolean;
  unpublishing: boolean;
  busyAction: "pdf" | "zip" | null;
  generatingVideo: boolean;
  canPublish: boolean;
  canUnpublish: boolean;
  canWhatsApp: boolean;
  canVideo: boolean;
  /** C5: build de produção (React). */
  onBuild?: () => void;
  building?: boolean;
  canBuild?: boolean;
  /** URL pública do site publicado (quando houver) — reusa a rota /public/:slug. */
  publishedUrl?: string | null;
  /** Copia o link público (reusa a lógica existente do container). */
  onCopyLink?: () => void;
  /** Botão de GitHub já existente (integração). */
  githubSlot?: ReactNode;
}

export interface StudioToolbarProps {
  activeView: StudioView;
  onViewChange: (view: StudioView) => void;
  visualMode: boolean;
  onToggleVisual: () => void;
  onOpenHistory: () => void;
  onReloadPreview: () => void;
  commercial: StudioCommercialActions;
}

const VIEWS: Array<{ id: StudioView; label: string; icon: typeof Eye }> = [
  { id: "preview", label: "Preview", icon: Eye },
  { id: "code", label: "Código", icon: Code2 },
  { id: "split", label: "Split", icon: Columns2 },
];

function ToolButton({ label, onClick, disabled, active, children }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-primary/50 bg-primary/10 text-foreground" : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function StudioToolbar({ activeView, onViewChange, visualMode, onToggleVisual, onOpenHistory, onReloadPreview, commercial }: StudioToolbarProps) {
  const c = commercial;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-card/60 px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-lg border border-border/60 p-0.5">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onViewChange(id)}
              className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors ${activeView === id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title={label}
            >
              <Icon className="h-3 w-3" />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>
        <ToolButton label={visualMode ? "Sair da edição visual" : "Edição visual"} onClick={onToggleVisual} active={visualMode}>
          <Paintbrush className="h-3 w-3" />
          <span className="hidden lg:inline">Visual</span>
        </ToolButton>
        <ToolButton label="Recarregar preview" onClick={onReloadPreview}>
          <RefreshCw className="h-3 w-3" />
          <span className="hidden lg:inline">Run</span>
        </ToolButton>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ToolButton label="Histórico de versões" onClick={onOpenHistory}>
          <History className="h-3 w-3" />
          <span className="hidden lg:inline">Histórico</span>
        </ToolButton>
        {c.canBuild && (
          <ToolButton label="Build de produção (React)" onClick={c.onBuild ?? (() => {})} disabled={!!c.building}>
            {c.building ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hammer className="h-3 w-3" />}
            <span className="hidden xl:inline">Build</span>
          </ToolButton>
        )}
        <ToolButton label="Gerar proposta em PDF" onClick={c.onProposalPdf} disabled={!!c.busyAction || !c.canPublish}>
          {c.busyAction === "pdf" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
          <span className="hidden xl:inline">Proposta</span>
        </ToolButton>
        <ToolButton label="Baixar projeto (ZIP)" onClick={c.onDownloadZip} disabled={!!c.busyAction}>
          {c.busyAction === "zip" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderDown className="h-3 w-3" />}
          <span className="hidden xl:inline">Baixar</span>
        </ToolButton>
        <ToolButton label="Gerar vídeo de apresentação (MP4)" onClick={c.onGenerateVideo} disabled={c.generatingVideo || !c.canVideo}>
          {c.generatingVideo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Video className="h-3 w-3" />}
          <span className="hidden xl:inline">Vídeo</span>
        </ToolButton>
        <ToolButton
          label={c.canWhatsApp ? "Enviar proposta pelo WhatsApp" : "Indisponível: lead sem WhatsApp comprovado"}
          onClick={c.onWhatsApp}
          disabled={!c.canWhatsApp}
        >
          <Send className="h-3 w-3" />
          <span className="hidden xl:inline">WhatsApp</span>
        </ToolButton>

        {c.canUnpublish && c.canPublish ? (
          <>
            {c.publishing ? (
              <ToolButton label="Publicando nova versão" onClick={c.onPublish} disabled><Loader2 className="h-3 w-3 animate-spin" /><span className="hidden xl:inline">Publicar</span></ToolButton>
            ) : (
              <ToolButton label="Publicar nova versão" onClick={c.onPublish}><Rocket className="h-3 w-3" /><span className="hidden xl:inline">Publicar</span></ToolButton>
            )}
            <ToolButton label="Despublicar site" onClick={c.onUnpublish} disabled={c.unpublishing}>
              {c.unpublishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
              <span className="hidden xl:inline">Despublicar</span>
            </ToolButton>
          </>
        ) : (
          <ToolButton label="Publicar site" onClick={c.onPublish} disabled={c.publishing || !c.canPublish}>
            {c.publishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
            <span className="hidden xl:inline">Publicar</span>
          </ToolButton>
        )}

        {c.publishedUrl && (
          <span className="inline-flex min-w-0 items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-1.5 py-1 text-[10.5px] text-emerald-700">
            <Globe className="h-3 w-3 shrink-0" />
            <span className="hidden min-w-0 max-w-[150px] truncate font-mono text-[10px] sm:inline" title={c.publishedUrl}>{c.publishedUrl}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={c.onCopyLink}
                  className="inline-flex h-5 items-center gap-1 rounded px-1 hover:bg-emerald-500/10"
                  title="Copiar link"
                  aria-label="Copiar link"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Copiar link</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={c.publishedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-5 items-center gap-1 rounded px-1 hover:bg-emerald-500/10"
                  title="Abrir site"
                  aria-label="Abrir site"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom">Abrir site</TooltipContent>
            </Tooltip>
          </span>
        )}

        {c.githubSlot}
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Play className="h-3 w-3 text-primary/70" /> Studio
        </span>
      </div>
    </div>
  );
}
