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
  onReloadPreview: () => void;
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

export function StudioToolbar({ activeView, onViewChange, visualMode, onToggleVisual, onReloadPreview }: StudioToolbarProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-card/60 px-2.5 py-1">
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
      {/* As ações comerciais (Histórico/Build/Proposta/Baixar/Vídeo/WhatsApp/
          Publicar/Despublicar) ficam no TOPO da página, liberando espaço aqui. */}
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Play className="h-3 w-3 text-primary/70" /> Studio
      </span>
    </div>
  );
}
