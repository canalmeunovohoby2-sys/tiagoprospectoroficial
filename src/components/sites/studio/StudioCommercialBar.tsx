import type { ReactNode } from "react";
import {
  Copy, ExternalLink, FileText, FolderDown, Globe, Hammer, History, Loader2, MoreHorizontal, Rocket, Send, Undo2, Video,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StudioCommercialActions } from "./StudioToolbar";

export interface StudioCommercialBarProps {
  commercial: StudioCommercialActions;
  /** Histórico de versões (mesmo handler do container). */
  onOpenHistory?: () => void;
}

/**
 * Botão secundário "ghost" (sem borda pesada): só aparece o relevo no hover,
 * no padrão de produto SaaS (Vercel/Linear).
 */
function GhostButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Ações comerciais do projeto — AGRUPADAS por hierarquia (Fase UI/UX):
 *   · secundárias (Histórico/Build/Proposta/Vídeo/Despublicar) → menu "Ferramentas";
 *   · frequentes (Baixar, WhatsApp) → ghost visíveis;
 *   · principal (Publicar) → botão sólido de destaque.
 * NENHUM handler foi removido ou alterado — só a apresentação mudou.
 */
export function StudioCommercialBar({ commercial: c, onOpenHistory }: StudioCommercialBarProps) {
  const secondary: Array<{ id: string; label: string; hint: string; icon: ReactNode; onClick: () => void; disabled?: boolean; show: boolean }> = [
    { id: "history", label: "Histórico", hint: "Histórico de versões", icon: <History className="h-3.5 w-3.5" />, onClick: onOpenHistory ?? (() => {}), show: !!onOpenHistory },
    { id: "build", label: "Build", hint: "Build de produção (React)", icon: c.building ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hammer className="h-3.5 w-3.5" />, onClick: c.onBuild ?? (() => {}), disabled: !!c.building, show: c.canBuild },
    { id: "pdf", label: "Proposta (PDF)", hint: "Gerar proposta em PDF", icon: c.busyAction === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />, onClick: c.onProposalPdf, disabled: !!c.busyAction || !c.canPublish, show: true },
    { id: "video", label: "Vídeo (MP4)", hint: "Gerar vídeo de apresentação (MP4)", icon: c.generatingVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />, onClick: c.onGenerateVideo, disabled: c.generatingVideo || !c.canVideo, show: true },
  ].filter((i) => i.show);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {secondary.length > 0 && (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Ferramentas do projeto"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted/70 hover:text-foreground data-[state=open]:bg-muted/70 data-[state=open]:text-foreground"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Ferramentas</span>
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Ferramentas do projeto</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ferramentas</DropdownMenuLabel>
            {secondary.map((item) => (
              <DropdownMenuItem key={item.id} onClick={item.onClick} disabled={item.disabled} className="gap-2 text-[12px]">
                {item.icon}
                <span>{item.label}</span>
              </DropdownMenuItem>
            ))}
            {c.canUnpublish && c.canPublish && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={c.onUnpublish} disabled={c.unpublishing} className="gap-2 text-[12px] text-destructive focus:text-destructive">
                  {c.unpublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                  <span>Despublicar site</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {c.publishedUrl && (
        <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 text-[10.5px] text-emerald-700">
          <Globe className="h-3 w-3 shrink-0" />
          <span className="hidden min-w-0 max-w-[150px] truncate font-mono text-[10px] sm:inline" title={c.publishedUrl}>{c.publishedUrl}</span>
          <button type="button" onClick={c.onCopyLink} className="inline-flex h-5 items-center rounded px-1 transition-colors hover:bg-emerald-500/10" title="Copiar link" aria-label="Copiar link">
            <Copy className="h-3 w-3" />
          </button>
          <a href={c.publishedUrl} target="_blank" rel="noreferrer" className="inline-flex h-5 items-center rounded px-1 transition-colors hover:bg-emerald-500/10" title="Abrir site" aria-label="Abrir site">
            <ExternalLink className="h-3 w-3" />
          </a>
        </span>
      )}

      <div className="mx-0.5 hidden h-4 w-px bg-border/70 sm:block" />

      <GhostButton label="Baixar projeto (ZIP)" onClick={c.onDownloadZip} disabled={!!c.busyAction}>
        {c.busyAction === "zip" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderDown className="h-3 w-3" />}
        <span className="hidden xl:inline">Baixar</span>
      </GhostButton>
      <GhostButton
        label={c.canWhatsApp ? "Enviar proposta pelo WhatsApp" : "Indisponível: lead sem WhatsApp comprovado"}
        onClick={c.onWhatsApp}
        disabled={!c.canWhatsApp}
      >
        <Send className="h-3 w-3" />
        <span className="hidden xl:inline">WhatsApp</span>
      </GhostButton>

      <button
        type="button"
        onClick={c.onPublish}
        disabled={c.publishing || !c.canPublish}
        className="ml-0.5 inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11.5px] font-semibold text-primary-foreground shadow-sm transition-colors duration-150 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        title={c.canUnpublish && c.canPublish ? "Publicar nova versão" : "Publicar site"}
      >
        {c.publishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
        <span>{c.canUnpublish && c.canPublish ? "Publicar versão" : "Publicar"}</span>
      </button>

      {c.githubSlot}
    </div>
  );
}
