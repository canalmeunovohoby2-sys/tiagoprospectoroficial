import { useMemo, useState, useEffect, type CSSProperties } from "react";
import { Monitor, Smartphone, RefreshCw, AlertTriangle, FileCode2 } from "lucide-react";
import { prepareProjectPreview, type PreparedPreview } from "@/lib/projectPreviewRuntime";

export interface LiveProjectPreviewProps {
  files: Record<string, string> | null | undefined;
  /** Rótulo pequeno exibido no rodapé (ex.: projeto sem arquivos → fallback). */
  fallback?: React.ReactNode;
  /** Chave para forçar re-render quando os arquivos mudam. */
  refreshKey?: string | number;
}

// Renderiza o CÓDIGO REAL do workspace do projeto em um iframe sandbox.
// - allow-scripts: o site roda JS de verdade (animação, hover, scroll).
// - sem allow-same-origin: o preview fica isolado (não lê cookies/tokens/DB).
export function LiveProjectPreview({ files, fallback, refreshKey }: LiveProjectPreviewProps) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [nonce, setNonce] = useState(0);

  // Re-prepara o documento quando os arquivos ou o refresh mudam.
  const fileVersion = useMemo(() => {
    const entries = Object.entries(files ?? {});
    let sig = `${entries.length}:${nonce}:${refreshKey ?? ""}`;
    // assinatura leve do conteúdo dos arquivos-chave para detectar mudanças
    for (const [p, c] of entries.slice(0, 20)) {
      const len = typeof c === "string" ? c.length : 0;
      sig += `|${p}:${len}`;
    }
    return sig;
  }, [files, nonce, refreshKey]);
  const prepared: PreparedPreview = useMemo(() => prepareProjectPreview(files ?? {}), [fileVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const srcDoc = prepared.ok && prepared.document ? prepared.document : undefined;

  useEffect(() => {
    setViewport("desktop");
  }, [refreshKey]);

  if (!files || Object.keys(files).length === 0) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        {fallback ?? (
          <div className="space-y-2">
            <FileCode2 className="mx-auto h-8 w-8 opacity-40" />
            <p>Este projeto ainda não possui arquivos de código.</p>
            <p className="text-xs">Gere o site para criar o workspace, ou use o editor para pré-visualizar a spec.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-[#fafafa] shadow-[0_1px_0_hsl(0_0%_0%/0.02)]">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-card px-3 py-2">
        <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <FileCode2 className="h-3.5 w-3.5 text-primary" />
          Preview do projeto (código real) · {prepared.fileCount} arquivo(s)
        </p>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 rounded-lg border border-border/60 p-0.5">
            <button type="button" onClick={() => setViewport("desktop")} className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors ${viewport === "desktop" ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Monitor className="h-3 w-3" /> Desktop
            </button>
            <button type="button" onClick={() => setViewport("mobile")} className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors ${viewport === "mobile" ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Smartphone className="h-3 w-3" /> Mobile
            </button>
          </div>
          <button type="button" onClick={() => setNonce((n) => n + 1)} title="Recarregar preview" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {prepared.errors.length > 0 && (
        <div className="border-b border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <p className="flex items-center gap-2 text-xs font-semibold text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" /> O código tem problemas que impedem o preview confiável:
          </p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-amber-700/80">
            {prepared.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
          {srcDoc && <p className="mt-1 text-[10px] text-amber-600/70">Exibindo mesmo assim — o agente pode corrigir informando estes erros.</p>}
        </div>
      )}

      <div className="bg-[#ececec] p-3 sm:p-4">
        <div className={`mx-auto overflow-hidden rounded-lg bg-white shadow-[0_8px_30px_-12px_rgba(16,24,40,.25)] transition-all duration-300 ${viewport === "mobile" ? "max-w-[400px]" : "max-w-full"}`}>
          {srcDoc ? (
            <iframe
              title="Preview do site"
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-modals allow-forms allow-popups allow-popups-to-escape-sandbox"
              className="block w-full border-0"
              style={{ height: viewport === "mobile" ? 640 : 760, backgroundColor: "#ffffff" } as CSSProperties}
            />
          ) : (
            <div className="flex min-h-[320px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Não foi possível montar o documento para preview.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
