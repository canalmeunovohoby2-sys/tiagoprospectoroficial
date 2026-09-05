import { useCallback, useEffect, useState } from "react";
import { History, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listSiteVersions, type SiteVersion } from "@/lib/siteProjectsApi";
import { SitePreview } from "@/components/sites/SitePreview";
import type { SiteSpec } from "@/data/siteProjects";

interface Props {
  projectId: string;
  onClose: () => void;
  onRestore: (spec: SiteSpec, version: SiteVersion) => void;
}

export function SiteVersionsDialog({ projectId, onClose, onRestore }: Props) {
  const [versions, setVersions] = useState<SiteVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SiteVersion | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listSiteVersions(projectId);
      setVersions(rows);
      if (rows.length > 0 && !selected) setSelected(rows[0]);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, selected]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const restore = () => {
    if (!selected) return;
    onRestore(selected.spec, selected);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="flex h-[82vh] w-full max-w-6xl overflow-hidden rounded-2xl border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="w-72 shrink-0 border-r flex flex-col">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-primary" /> Histórico de versões</p>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {loading && <p className="px-2 py-6 text-xs text-muted-foreground flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></p>}
            {!loading && versions.length === 0 && <p className="px-3 py-6 text-xs text-muted-foreground">Nenhuma versão salva ainda. As versões são criadas ao salvar alterações.</p>}
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                className={`w-full text-left rounded-xl border p-2.5 transition-colors ${selected?.id === v.id ? "border-primary/50 bg-primary/8" : "border-border/70 hover:border-primary/30"}`}
              >
                <p className="text-xs font-semibold">v{v.version_number}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{v.change_summary || "Alterações no projeto"}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">{new Date(v.created_at).toLocaleString("pt-BR")}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                <p className="text-sm"><span className="font-semibold">v{selected.version_number}</span> · {selected.change_summary || "Versão"} · {new Date(selected.created_at).toLocaleString("pt-BR")}</p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={restore}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar esta versão
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 bg-muted/30">
                <SitePreview spec={selected.spec as SiteSpec | Record<string, unknown> | null} bare />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Selecione uma versão para visualizar.</div>
          )}
        </div>
      </div>
    </div>
  );
}
