import { useEffect, useRef } from "react";
import { Loader2, ImageOff, Clock, ArrowRight, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { statusLabel, type SiteProjectRow } from "@/data/siteProjects";

export interface StudioProjectCardProps {
  project: SiteProjectRow;
  /** Thumbnail REAL do site (data URL) já disponível, ou null. */
  thumbnail: string | null;
  /** Captura em andamento para este projeto. */
  busy?: boolean;
  /** Site real ainda não existe (rascunho/sem geração) → não capturar. */
  unavailable?: boolean;
  onOpen: () => void;
  onDelete: () => void;
  /** Chamado quando o card entra na viewport (carregamento LAZY das prévias). */
  onVisible?: () => void;
  /** Geração manual da prévia. */
  onGenerate?: () => void;
}

/**
 * Card da galeria do Studio: mostra a PRIMEIRA DOBRA real do site (thumbnail
 * capturado do site renderizado) — nunca prompt/spec/conversa. Proporção de site
 * desktop com crop inteligente (object-cover topo). Clique abre o projeto.
 */
export function StudioProjectCard({
  project, thumbnail, busy, unavailable, onOpen, onDelete, onVisible, onGenerate,
}: StudioProjectCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reported = useRef(false);

  useEffect(() => {
    if (!onVisible || reported.current) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { onVisible(); reported.current = true; return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !reported.current) {
        reported.current = true;
        onVisible();
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [onVisible]);

  return (
    <Card ref={ref as never} className="group overflow-hidden p-0 transition-colors hover:border-primary/40">
      <button
        type="button"
        onClick={onOpen}
        title={`Abrir ${project.name}`}
        className="relative block w-full cursor-pointer border-b border-border/60 bg-muted/30 text-left"
      >
        <div className="aspect-[16/10] w-full overflow-hidden">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={`Prévia do site ${project.name}`}
              loading="lazy"
              className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : busy ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-[11px]">Gerando prévia do site…</span>
            </div>
          ) : unavailable ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
              <Clock className="h-5 w-5" />
              <span className="text-[11px]">Aguardando a geração do site</span>
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageOff className="h-5 w-5" />
              <span className="text-[11px]">Sem prévia ainda</span>
              {onGenerate && (
                <Button
                  type="button" size="sm" variant="outline" className="h-7 text-[11px]"
                  onClick={(e) => { e.stopPropagation(); onGenerate(); }}
                >
                  Gerar prévia
                </Button>
              )}
            </div>
          )}
        </div>
      </button>

      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-display font-semibold truncate">{project.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{project.company_name || "—"}</p>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px]">{statusLabel(project.status)}</Badge>
        </div>
        {(project.segment || project.city) && (
          <p className="text-xs text-muted-foreground">
            {[project.segment, project.city && project.state ? `${project.city}/${project.state}` : project.city].filter(Boolean).join(" · ")}
          </p>
        )}
        {project.lead_id && <p className="text-[10px] text-muted-foreground/70">Lead vinculado · {project.lead_id.slice(0, 8)}</p>}
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="outline" className="h-8 flex-1" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
            Abrir <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Excluir projeto" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
