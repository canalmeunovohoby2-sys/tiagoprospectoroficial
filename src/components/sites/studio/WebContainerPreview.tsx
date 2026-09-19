import { useEffect, useMemo, useRef, useState } from "react";
import { PERF, markPerf } from "@/lib/studio/perf";
import { isBootstrapFiles } from "@/lib/studio/reactTemplate";
import { AlertTriangle, Crosshair, FileCode2, Loader2, RefreshCw, ShieldAlert, Terminal } from "lucide-react";
import { useWebContainerPreview } from "@/hooks/studio/useWebContainerPreview";
import { injectReactVisualHelper } from "@/lib/studio/reactVisualHelper";
import { inlineRemoteImagesInFiles } from "@/lib/studio/previewImages";
import { fitDeviceScale } from "@/lib/studio/deviceFrame";
import { descriptorFromReactSelection } from "@/lib/studio/reactSource";
import {
  STUDIO_BRIDGE_CHANNEL, STUDIO_BRIDGE_VERSION, parseStudioBridgeChildMessage, type StudioElementDescriptor,
} from "@/lib/studio/bridgeProtocol";
import { makePreviewBridgeToken } from "@/lib/studio/previewHelper";
import type { StudioDevice, StudioFileMap } from "@/lib/studio/types";

export interface WebContainerPreviewProps {
  files: StudioFileMap;
  projectId?: string;
  /** Muda quando o projeto é alterado (força reload do iframe após o sync). */
  refreshKey?: string | number;
  /** Viewport do preview: o MESMO site real renderizado em Desktop/Tablet/Mobile. */
  device?: StudioDevice;
  /** Modo inspeção/edição visual (C3). */
  visualMode?: boolean;
  /** Seleção de elemento (origem React via `_debugSource`). */
  onElementSelected?: (element: StudioElementDescriptor) => void;
  /** FASE 7.2 — ação explícita "Gerar site" quando o projeto está no rascunho. */
  onGenerateSite?: () => void;
}

const IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads";

// Viewports de referência do preview React. O iframe recebe ESSAS dimensões reais
// (o site reage por media queries); a moldura é reduzida por `scale` para caber.
const WC_DEVICE_SIZE: Record<StudioDevice, { width: number; height: number }> = {
  desktop: { width: 1366, height: 768 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

/**
 * Moldura do dispositivo: ocupa a LARGURA disponível (sem sobras laterais) e a
 * altura visível vai até o fim do painel — o iframe continua com a largura REAL
 * do viewport (o site reage de verdade) e rola por dentro. Escala pela largura
 * (permite ampliar tablet/mobile) em vez de encolher pela altura.
 */
function DeviceFrame({ device, children }: { device: StudioDevice; children: React.ReactNode }) {
  const size = WC_DEVICE_SIZE[device];
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number; scale: number }>({ w: size.width, h: size.height, scale: 1 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const cw = Math.max(160, el.clientWidth - (device === "desktop" ? 0 : 16));
      const ch = Math.max(160, el.clientHeight - (device === "desktop" ? 0 : 16));
      // DESKTOP: o site ocupa TODO o painel (largura/altura reais do container,
      // escala 1) — sem sobra lateral e sem borrão de upscale; o site reage de
      // verdade às media queries na largura disponível.
      if (device === "desktop") {
        setBox({ w: cw, h: ch, scale: 1 });
        return;
      }
      // TABLET/MOBILE: mantém o tamanho REAL do dispositivo (simula o aparelho) e
      // só reduz se não couber.
      const scale = fitDeviceScale(cw + 16, ch + 16, size);
      setBox({ w: Math.round(size.width * scale), h: Math.min(Math.round(size.height * scale), ch), scale });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.width, size.height, device]);
  return (
    <div ref={wrapRef} className={`flex h-full w-full items-start justify-center overflow-hidden ${device === "desktop" ? "" : "p-2"}`}>
      <div
        data-preview-device={device}
        className={`shrink-0 overflow-hidden bg-white ${device === "desktop" ? "" : "rounded-xl border border-border/60 shadow-sm"}`}
        style={{ width: box.w, height: box.h }}
      >
        <div
          style={
            device === "desktop"
              ? { width: box.w, height: box.h }
              : { width: size.width, height: size.height, transform: `scale(${box.scale})`, transformOrigin: "top left" }
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Preview REAL do projeto React (C0/C3): WebContainer + Vite dev server + iframe.
 * NÃO usa `srcDoc`. Em modo visual, injeta o helper que lê `_debugSource` do
 * fiber React e reporta a seleção — apenas nesta projeção, nunca no código-fonte.
 */
export function WebContainerPreview({ files, projectId, refreshKey, device = "desktop", visualMode = false, onElementSelected, onGenerateSite }: WebContainerPreviewProps) {
  const frameSize = WC_DEVICE_SIZE[device];
  const [showLogs, setShowLogs] = useState(false);
  // Reload GARANTIDO do iframe depois de mudanças do agente. O HMR do Vite costuma
  // aplicar sozinho; quando não aplica (ex.: ordem/timing), remontar o iframe
  // recarrega o dev server e mostra o site REAL gerado — nunca fica no template.
  const [frameKey, setFrameKey] = useState(0);
  const firstRefresh = useRef(true);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // Token novo por projeto → invalida mensagens de previews antigos.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const token = useMemo(() => makePreviewBridgeToken(), [projectId]);
  // Projeção enviada ao WebContainer inclui o helper visual (não persiste).
  const wcFiles = useMemo(() => injectReactVisualHelper(files, { token }), [files, token]);
  // IMAGENS: o preview do WebContainer pode não carregar imagens externas que
  // funcionam no publicado (isolamento/CORS/hotlink). Baixamos UMA vez e trocamos
  // por `data:` SOMENTE nesta projeção — o site publicado mantém as URLs originais.
  const [projected, setProjected] = useState<StudioFileMap>(wcFiles);
  const sourceRef = useRef<StudioFileMap>(wcFiles);
  useEffect(() => {
    sourceRef.current = wcFiles;
    setProjected(wcFiles);
    let alive = true;
    void inlineRemoteImagesInFiles(wcFiles).then((r) => {
      if (!alive || sourceRef.current !== wcFiles) return;
      if (r.inlined > 0) setProjected(r.files);
    }).catch(() => { /* best-effort */ });
    return () => { alive = false; };
  }, [wcFiles]);
  const { phase, url, logs, error, reload } = useWebContainerPreview({ files: projected, projectId, enabled: true });

  const onElementRef = useRef(onElementSelected);
  onElementRef.current = onElementSelected;

  // Seleção vinda de DENTRO do app (valida source do iframe + canal/versão/token).
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || ev.source !== frame.contentWindow) return;
      const msg = parseStudioBridgeChildMessage(ev.data, token);
      if (!msg) return;
      if (msg.type === "element_selected") {
        const raw = msg.element;
        const normalized: StudioElementDescriptor = raw.reactSource
          ? descriptorFromReactSelection({
              tagName: raw.tagName,
              id: raw.id,
              className: raw.classes.join(" "),
              selector: raw.selector,
              path: raw.path,
              innerText: raw.text,
              attributes: raw.attributes,
              rect: raw.rect,
              source: { fileName: raw.reactSource.file, lineNumber: raw.reactSource.line, columnNumber: raw.reactSource.column },
              componentName: raw.reactSource.componentName,
            })
          : raw;
        onElementRef.current?.(normalized);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [token]);

  // Propaga o modo inspeção quando o app estiver pronto (e ao trocar de modo/URL).
  useEffect(() => {
    if (phase !== "ready") return;
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    const send = () => {
      try {
        frame.contentWindow?.postMessage(
          { channel: STUDIO_BRIDGE_CHANNEL, version: STUDIO_BRIDGE_VERSION, token, type: "inspect_set", active: !!visualMode },
          "*",
        );
      } catch { /* iframe indisponível */ }
    };
    send();
    const t = setTimeout(send, 700); // reenvia após o app montar o listener
    return () => clearTimeout(t);
  }, [visualMode, url, phase, token]);

  // Reload do iframe após mudanças (debounce para não remontar várias vezes numa
  // mesma execução). Garante que o site REAL apareça mesmo se o HMR não aplicar.
  useEffect(() => {
    if (firstRefresh.current) { firstRefresh.current = false; return; }
    if (phase !== "ready") return;
    const t = setTimeout(() => setFrameKey((k) => k + 1), 700);
    return () => clearTimeout(t);
  }, [refreshKey, phase]);

  // FASE 5.1 — T8: Preview REAL visível (Vite rodando + iframe carregado).
  useEffect(() => {
    if (phase === "ready" && url) markPerf(PERF.T8, { url });
  }, [phase, url]);

  // FASE 7.1 — projeto ainda no bootstrap? Então o Preview mostra o RASCUNHO.
  const isDraft = useMemo(() => isBootstrapFiles(files), [files]);
  // FASE UI — arquivo de entrada exibido na barra ÚNICA (informação real do projeto).
  const entryFile = useMemo(() => {
    const keys = Object.keys(files ?? {});
    if (!keys.length) return "";
    if (keys.includes("index.html")) return "index.html";
    return keys.find((k) => /\.(html|tsx|jsx)$/.test(k)) ?? "";
  }, [files]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {isDraft && (
        // FASE 7.1/7.2 — estado HONESTO: o projeto ainda é o rascunho inicial (nada foi
        // gerado). Não é tela quebrada nem geração automática: o usuário pede aqui.
        <div role="status" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-[11px] font-medium text-amber-700">
          <span>📝 Rascunho — peça no chat para gerar o site.</span>
          {onGenerateSite && (
            <button
              type="button"
              onClick={onGenerateSite}
              className="inline-flex h-6 items-center gap-1 rounded-md bg-amber-600 px-2 text-[11px] font-semibold text-white hover:bg-amber-700"
            >
              ✨ Gerar site
            </button>
          )}
        </div>
      )}
      <div className="flex shrink-0 flex-nowrap items-center justify-between gap-2 overflow-hidden border-b border-border/60 bg-card px-2.5 py-1">
        <p className="flex min-w-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
          {/* UMA barra só: arquivo · Preview do site · status real do Vite. */}
          {entryFile && (
            <>
              <span className="inline-flex min-w-0 items-center gap-1 truncate text-foreground/70" title={entryFile}>
                <FileCode2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="hidden truncate sm:inline">{entryFile}</span>
              </span>
              <span className="hidden text-border sm:inline">•</span>
            </>
          )}
          <span className="hidden shrink-0 text-foreground/70 md:inline">Preview do site</span>
          <span className="hidden text-border md:inline">•</span>
          {phase === "ready" && (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-emerald-600">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Vite ativo · Preview
            </span>
          )}
          {phase === "booting" && (
            <span className="inline-flex shrink-0 items-center gap-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />iniciando…</span>
          )}
          {phase === "unsupported" && <span className="inline-flex shrink-0 items-center gap-1.5 text-amber-600"><ShieldAlert className="h-3 w-3" />sem isolamento</span>}
          {phase === "error" && <span className="inline-flex shrink-0 items-center gap-1.5 text-destructive"><AlertTriangle className="h-3 w-3" />erro</span>}
          {visualMode && phase === "ready" && (
            <span className="hidden shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary sm:inline-flex">
              <Crosshair className="h-2.5 w-2.5" /> modo visual
            </span>
          )}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowLogs((v) => !v)}
            title="Logs do WebContainer"
            className={`inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] hover:bg-muted/60 ${showLogs ? "text-foreground" : "text-muted-foreground"}`}
          >
            <Terminal className="h-3.5 w-3.5" /> Logs ({logs.length})
          </button>
          <button
            type="button"
            onClick={reload}
            title="Reiniciar WebContainer"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {phase === "unsupported" && (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11.5px] text-amber-700">
          <p className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-3.5 w-3.5" /> WebContainer indisponível</p>
          <p className="mt-0.5">{error ?? "O documento precisa de cross-origin isolation (COOP/COEP)."}</p>
        </div>
      )}
      {phase === "error" && (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-[11.5px] text-destructive">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Falha ao iniciar o preview</p>
          <p className="mt-0.5">{error}</p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden bg-muted/20">
        {phase === "ready" && url ? (
          <DeviceFrame device={device}>
            <iframe
              key={`${frameKey}-${device}`}
              ref={iframeRef}
              title="Preview do app React"
              src={url}
              sandbox={IFRAME_SANDBOX}
              className="border-0"
              style={{ width: frameSize.width, height: frameSize.height }}
            />
          </DeviceFrame>
        ) : (
          // Boot: barra de progresso indeterminada no TOPO + linha discreta (sem
          // spinner gigante no centro). O status real fica no cabeçalho.
          <div className="flex h-full flex-col bg-muted/10">
            {phase === "booting" && (
              <div className="h-0.5 w-full overflow-hidden bg-border/50">
                <div className="h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-primary/70" style={{ animation: "pulse 1.4s ease-in-out infinite" }} />
              </div>
            )}
            <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-muted-foreground">
              {phase === "booting" ? (
                <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> preparando o preview…</span>
              ) : phase === "unsupported" ? (
                "Ative o isolamento cross-origin (COOP/COEP) para usar o preview React."
              ) : (
                "Preview indisponível."
              )}
            </div>
          </div>
        )}
      </div>

      {showLogs && (
        <div className="flex max-h-40 shrink-0 flex-col border-t border-border/60 bg-zinc-950">
          <div className="flex shrink-0 items-center justify-between px-2.5 py-1 text-[10px] uppercase tracking-wide text-zinc-400">
            <span>WebContainer / Vite</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2 font-mono text-[11px] text-emerald-200 [scrollbar-width:thin]">
            {logs.length === 0 ? <p className="py-2 text-zinc-500">Sem logs.</p> : logs.map((l, i) => <p key={`${i}-${l.slice(0, 12)}`}>{l}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}
