import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Crosshair, ExternalLink, Image as ImageIcon, Link2, Loader2, Palette, Send, Sparkles, Type, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { StudioSelection, StudioDevice } from "@/lib/studio/types";
import type { VisualEditPlan, VisualEditTarget } from "@/lib/studio/visualEdit";

export interface VisualEditOutcome {
  ok: boolean;
  message: string;
}

export interface StudioVisualEditorPanelProps {
  open: boolean;
  selection: StudioSelection | null;
  onClose: () => void;
  /** Aplica uma edição determinística (o shell encaminha ao Coder se não aplicável). */
  onApplyVisual: (plan: VisualEditPlan, target: VisualEditTarget) => void;
  /** Pede uma alteração em linguagem natural ao agente. */
  onAskAgent: (instruction: string) => void;
  onOpenSource?: (file: string, line?: number) => void;
  /** Último resultado de edição (evidência/erro) para mostrar no painel. */
  editOutcome?: VisualEditOutcome | null;
  applying?: boolean;
  device?: StudioDevice;
  disabled?: boolean;
}

const FIELD_CLASS = "h-7 w-full rounded-md border border-border/70 bg-background px-2 text-[11px] outline-none focus:border-primary/50 disabled:opacity-50";

interface StyleFields {
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontWeight: string;
  textAlign: string;
  padding: string;
  margin: string;
  border: string;
  borderRadius: string;
  opacity: string;
  width: string;
  height: string;
  display: string;
  objectFit: string;
  objectPosition: string;
  boxShadow: string;
}

const EMPTY_STYLES: StyleFields = {
  color: "", backgroundColor: "", fontSize: "", fontWeight: "", textAlign: "", padding: "", margin: "",
  border: "", borderRadius: "", opacity: "", width: "", height: "", display: "", objectFit: "", objectPosition: "", boxShadow: "",
};

const STYLE_FIELD_MAP: Array<{ key: keyof StyleFields; property: string; label: string; placeholder?: string; type?: "color" | "text" }> = [
  { key: "color", property: "color", label: "Cor do texto", type: "color" },
  { key: "backgroundColor", property: "background-color", label: "Fundo", type: "color" },
  { key: "fontSize", property: "font-size", label: "Fonte", placeholder: "18px" },
  { key: "fontWeight", property: "font-weight", label: "Peso", placeholder: "600" },
  { key: "textAlign", property: "text-align", label: "Alinhamento", placeholder: "center" },
  { key: "padding", property: "padding", label: "Padding", placeholder: "16px 24px" },
  { key: "margin", property: "margin", label: "Margem", placeholder: "0 auto" },
  { key: "borderRadius", property: "border-radius", label: "Raio", placeholder: "12px" },
  { key: "border", property: "border", label: "Borda", placeholder: "1px solid #ddd" },
  { key: "opacity", property: "opacity", label: "Opacidade", placeholder: "0.9" },
  { key: "width", property: "width", label: "Largura", placeholder: "320px / 100%" },
  { key: "height", property: "height", label: "Altura", placeholder: "auto" },
  { key: "display", property: "display", label: "Display", placeholder: "flex / grid / block" },
  { key: "boxShadow", property: "box-shadow", label: "Sombra", placeholder: "0 8px 24px rgba(0,0,0,.2)" },
];

const IMAGE_FIELDS: Array<{ key: keyof StyleFields; property: string; label: string; placeholder?: string }> = [
  { key: "objectFit", property: "object-fit", label: "object-fit", placeholder: "cover / contain" },
  { key: "objectPosition", property: "object-position", label: "object-position", placeholder: "center top" },
];

export function StudioVisualEditorPanel({
  open,
  selection,
  onClose,
  onApplyVisual,
  onAskAgent,
  onOpenSource,
  editOutcome,
  applying = false,
  device,
  disabled = false,
}: StudioVisualEditorPanelProps) {
  const [ask, setAsk] = useState("");
  const [textValue, setTextValue] = useState("");
  const [href, setHref] = useState("");
  const [scope, setScope] = useState<"global" | "mobile" | "tablet">("global");
  const [styles, setStyles] = useState<StyleFields>(EMPTY_STYLES);

  const tag = (selection?.tagName ?? "").toLowerCase();
  const isImage = tag === "img";
  const isLink = tag === "a";

  // Reinicia os campos ao trocar de elemento.
  useEffect(() => {
    setTextValue(selection?.text ?? "");
    setHref(String(selection?.attributes?.href ?? ""));
    setStyles(EMPTY_STYLES);
    setScope("global");
  }, [selection?.selector, selection?.source, selection?.text, selection?.attributes]);

  const source = selection?.sourceLocation;
  const resolved = source?.status === "resolved" && !!source.file;
  const canDirectEdit = resolved && !disabled;

  const target: VisualEditTarget | null = useMemo(() => {
    if (!selection) return null;
    return {
      selector: selection.selector,
      tagName: selection.tagName,
      id: selection.id,
      classes: selection.classes,
      text: selection.text,
      pfsrc: selection.source,
      sourceLocation: selection.sourceLocation,
      scope,
    };
  }, [selection, scope]);

  if (!open) return null;

  const hasSelection = !!selection;

  const applyText = () => {
    if (!target) return;
    onApplyVisual({ kind: "text", text: textValue }, target);
  };

  const applyStyles = () => {
    if (!target) return;
    const changes = [...STYLE_FIELD_MAP, ...(isImage ? IMAGE_FIELDS : [])]
      .map((f) => ({ property: f.property, value: styles[f.key].trim() }))
      .filter((c) => c.value.length > 0);
    if (changes.length === 0) return;
    onApplyVisual({ kind: "style", changes }, target);
  };

  const applyHref = () => {
    if (!target) return;
    onApplyVisual({ kind: "attribute", attribute: { name: "href", value: href.trim() } }, target);
  };

  return (
    <aside className="absolute right-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-[320px] flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-xl">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <p className="flex items-center gap-2 text-[12px] font-semibold">
          <Palette className="h-3.5 w-3.5 text-primary" /> Edição visual
        </p>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fechar edição visual">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 [scrollbar-width:thin]">
        {!hasSelection ? (
          <p className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-center text-[11px] text-muted-foreground">
            <Crosshair className="h-4 w-4 opacity-50" />
            Clique em um elemento do preview para selecioná-lo.
          </p>
        ) : (
          <>
            <div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5">
              <p className="truncate text-[11px] font-medium">
                {selection.tagName || "elemento"}
                {selection.id ? `#${selection.id}` : ""}
                {selection.classes?.length ? ` .${selection.classes.slice(0, 3).join(".")}` : ""}
              </p>
              <p className="truncate text-[10px] text-muted-foreground" title={selection.selector}>{selection.selector}</p>
              {device && <p className="text-[10px] text-muted-foreground">viewport: {device}</p>}
            </div>

            <div className="rounded-lg border border-border/60 px-2.5 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Origem no código</p>
              {resolved ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[11px]" title={`${source?.file}:${source?.line}`}>
                    {source?.file}
                    {source?.line ? `:${source.line}` : ""}
                    {source?.confidence === "heuristic" ? " (aprox.)" : ""}
                  </span>
                  <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]" onClick={() => onOpenSource?.(source!.file!, source?.line)}>
                    <ExternalLink className="mr-1 h-3 w-3" /> Abrir
                  </Button>
                </div>
              ) : source?.status === "unsupported" ? (
                <p className="flex items-start gap-1.5 text-[10.5px] text-amber-600">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {source.reason ?? "Tipo de arquivo sem mapeamento de origem."}
                </p>
              ) : (
                <p className="flex items-start gap-1.5 text-[10.5px] text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {source?.reason ?? "Origem não determinada com segurança."}
                </p>
              )}
            </div>

            {!canDirectEdit && (
              <p className="rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2 text-[10.5px] text-muted-foreground">
                Edição direta indisponível para esta seleção. Use <strong>Pedir ao agente</strong> — o Coder localiza e altera o arquivo correto.
              </p>
            )}

            {selection.text !== undefined && canDirectEdit && (
              <div className="space-y-1.5 border-t border-border/60 pt-2">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><Type className="h-3 w-3" /> Texto</p>
                <Textarea value={textValue} onChange={(e) => setTextValue(e.target.value)} rows={2} className="text-[12px]" />
                <Button size="sm" className="h-7 w-full" disabled={applying || !textValue.trim() || textValue.trim() === (selection.text ?? "").trim()} onClick={applyText}>
                  {applying ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Aplicar texto
                </Button>
              </div>
            )}

            {canDirectEdit && (
              <div className="space-y-1.5 border-t border-border/60 pt-2">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {isImage ? <ImageIcon className="h-3 w-3" /> : <Palette className="h-3 w-3" />} Estilo
                  </p>
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value as typeof scope)}
                    className="h-6 rounded-md border border-border/70 bg-background px-1 text-[10px]"
                    title="Escopo da alteração"
                  >
                    <option value="global">Global</option>
                    <option value="mobile">Mobile (⟶ Coder)</option>
                    <option value="tablet">Tablet (⟶ Coder)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {STYLE_FIELD_MAP.map((f) => (
                    <label key={f.key} className="space-y-0.5">
                      <span className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">{f.label}</span>
                      {f.type === "color" ? (
                        <input type="color" value={styles[f.key] || "#000000"} onChange={(e) => setStyles((s) => ({ ...s, [f.key]: e.target.value }))} className="h-7 w-full rounded-md border border-border/70 bg-background" />
                      ) : (
                        <input type="text" value={styles[f.key]} placeholder={f.placeholder} onChange={(e) => setStyles((s) => ({ ...s, [f.key]: e.target.value }))} className={FIELD_CLASS} />
                      )}
                    </label>
                  ))}
                  {isImage && IMAGE_FIELDS.map((f) => (
                    <label key={f.key} className="space-y-0.5">
                      <span className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">{f.label}</span>
                      <input type="text" value={styles[f.key]} placeholder={f.placeholder} onChange={(e) => setStyles((s) => ({ ...s, [f.key]: e.target.value }))} className={FIELD_CLASS} />
                    </label>
                  ))}
                </div>
                <Button size="sm" className="h-7 w-full" disabled={applying} onClick={applyStyles}>
                  {applying ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Aplicar estilos
                </Button>
              </div>
            )}

            {isLink && canDirectEdit && (
              <div className="space-y-1.5 border-t border-border/60 pt-2">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><Link2 className="h-3 w-3" /> Link</p>
                <input type="text" value={href} placeholder="https://… ou #secao" onChange={(e) => setHref(e.target.value)} className={FIELD_CLASS} />
                <Button size="sm" className="h-7 w-full" disabled={applying || href.trim() === String(selection.attributes?.href ?? "").trim()} onClick={applyHref}>
                  Aplicar link
                </Button>
              </div>
            )}

            {isImage && canDirectEdit && (
              <Button size="sm" variant="outline" className="h-7 w-full" onClick={() => onAskAgent("Substitua esta imagem por outra adequada ao conteúdo, mantendo estilo e proporção.")}>
                Substituir imagem (via agente)
              </Button>
            )}

            {editOutcome && (
              <p className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10.5px] ${editOutcome.ok ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600" : "border-amber-500/40 bg-amber-500/5 text-amber-600"}`}>
                {editOutcome.ok ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
                {editOutcome.message}
              </p>
            )}
          </>
        )}

        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" /> Pedir ao agente
          </p>
          <Textarea
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            rows={2}
            placeholder="Deixe este bloco mais sofisticado…"
            className="min-h-[2.25rem] text-[12px]"
          />
          <Button
            size="sm"
            className="h-7 w-full"
            disabled={disabled || !ask.trim()}
            onClick={() => { onAskAgent(ask.trim()); setAsk(""); }}
          >
            <Send className="mr-1 h-3.5 w-3.5" /> Enviar ao agente
          </Button>
        </div>
      </div>
    </aside>
  );
}
