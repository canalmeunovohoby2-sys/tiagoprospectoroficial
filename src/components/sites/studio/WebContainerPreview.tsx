import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Crosshair, Loader2, RefreshCw, ShieldAlert, Terminal } from "lucide-react";
import { useWebContainerPreview } from "@/hooks/studio/useWebContainerPreview";
import { injectReactVisualHelper } from "@/lib/studio/reactVisualHelper";
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
      const cw = Math.max(160, el.clientWidth - 16);
      const ch = Math.max(160, el.clientHeight - 16);
      // Escala pela LARGURA (sem cap em 1) → preenche o painel; limita o zoom para
      // não distorcer demais e corta a altura no que couber (o iframe rola dentro).
      const scale = Math.min(2.5, Math.max(0.2, cw / size.width));
      setBox({ w: Math.round(size.width * scale), h: Math.min(Math.round(size.height * scale), ch), scale });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.width, size.height]);
  return (
    <div ref={wrapRef} className="flex h-full w-full items-start justify-center overflow-hidden p-2">
      <div
        data-preview-device={device}
        className="shrink-0 overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm"
        style={{ width: box.w, height: box.h }}
      >
        <div style={{ width: size.width, height: size.height, transform: `scale(${box.scale})`, transformOrigin: "top left" }}>
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
export function WebContainerPreview({ files, projectId, refreshKey, device = "desktop", visualMode = false, onElementSelected }: WebContainerPreviewProps) {
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
  const { phase, url, logs, error, reload } = useWebContainerPreview({ files: wcFiles, projectId, enabled: true });

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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-card px-3 py-1.5">
        <p className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
          <span className="text-primary">WebContainer</span>
          {phase === "ready" && <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Vite rodando</span>}
          {phase === "booting" && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> iniciando…</span>}
          {phase === "unsupported" && <span className="inline-flex items-center gap-1 text-amber-600"><ShieldAlert className="h-3 w-3" /> sem isolamento</span>}
          {phase === "error" && <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" /> erro</span>}
          {visualMode && phase === "ready" && (
            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
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
          <div className="flex h-full items-center justify-center bg-muted/20 px-6 text-center text-sm text-muted-foreground">
            {phase === "booting" ? (
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> montando o projeto e iniciando o Vite…</span>
            ) : phase === "unsupported" ? (
              "Ative o isolamento cross-origin (COOP/COEP) para usar o preview React."
            ) : (
              "Preview indisponível."
            )}
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
