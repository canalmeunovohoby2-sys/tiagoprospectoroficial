import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, Crosshair, FileCode2, Monitor, RefreshCw, Smartphone, Tablet, Terminal, Trash2 } from "lucide-react";
import { prepareProjectPreview, type PreparedPreview } from "@/lib/projectPreviewRuntime";
import {
  STUDIO_BRIDGE_CHANNEL, STUDIO_BRIDGE_VERSION, parseStudioBridgeChildMessage,
  type StudioElementDescriptor, type StudioViewportInfo,
} from "@/lib/studio/bridgeProtocol";
import { injectStudioBridge, makePreviewBridgeToken } from "@/lib/studio/previewHelper";
import { WebContainerPreview } from "./WebContainerPreview";
import type { StudioDevice, StudioFileMap } from "@/lib/studio/types";

export interface StudioConsoleEntry {
  level: "log" | "warn" | "error";
  args: string;
  at: number;
}

export interface StudioPreviewError {
  message: string;
  source?: string;
  line?: number;
  column?: number;
}

export interface StudioPreviewPanelProps {
  files: StudioFileMap | null | undefined;
  refreshKey?: string | number;
  fallback?: ReactNode;
  /** Projeto atual (identificação de sessão do bridge). */
  projectId?: string;
  /**
   * `static` (legado) → preview `srcDoc`; `react` (C0) → WebContainer + Vite.
   * Default `static` para não mudar o comportamento existente.
   */
  projectKind?: "static" | "react";
  /** Liga o bridge postMessage + helper de inspeção (Fase 4). */
  bridgeEnabled?: boolean;
  /** Modo inspeção: hover/seleção de elementos no preview. */
  inspectMode?: boolean;
  onConsole?: (entry: StudioConsoleEntry) => void;
  onElementSelected?: (element: StudioElementDescriptor, viewport: StudioViewportInfo) => void;
  onSelectionCleared?: () => void;
  onPreviewReady?: (capabilities: string[]) => void;
  onPreviewError?: (error: StudioPreviewError) => void;
  /** Informa o viewport atual (device) ao Studio (contexto de edição visual). */
  onViewportChange?: (device: StudioDevice) => void;
  /** Device CONTROLADO (barra do projeto). Sem isso, o painel controla sozinho. */
  device?: StudioDevice;
}

const DEVICE_WIDTH: Record<StudioDevice, string> = {
  desktop: "100%",
  tablet: "820px",
  mobile: "400px",
};
const DEVICE_HEIGHT: Record<StudioDevice, number> = {
  desktop: 760,
  tablet: 720,
  mobile: 640,
};
const DEVICE_WIDTH_PX: Record<StudioDevice, number> = {
  desktop: 1280,
  tablet: 820,
  mobile: 400,
};

const DEVICES: Array<{ id: StudioDevice; label: string; icon: typeof Monitor }> = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "mobile", label: "Mobile", icon: Smartphone },
];

/**
 * Seletor de viewport (Desktop/Tablet/Mobile) — ponto ÚNICO reutilizado pelo
 * preview (estático e React) e pela barra do projeto. Só troca o viewport: quem
 * re-renderiza é o preview REAL (WebContainer/iframe).
 */
export function StudioDeviceSwitcher({ value, onChange, className = "" }: { value: StudioDevice; onChange: (d: StudioDevice) => void; className?: string }) {
  return (
    <div className={`flex items-center gap-0.5 rounded-lg border border-border/60 p-0.5 ${className}`} role="group" aria-label="Tamanho do preview">
      {DEVICES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          title={`${label} — ${DEVICE_WIDTH_PX[id]}px`}
          aria-pressed={value === id}
          className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors ${value === id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Icon className="h-3 w-3" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

// SANDBOX SEM `allow-same-origin` (Fase 4): o preview permanece em origem opaca.
// O bridge é postMessage com canal+versão+token, validado no Studio.
const PREVIEW_SANDBOX = "allow-scripts allow-modals allow-forms allow-popups allow-popups-to-escape-sandbox";

export function StudioPreviewPanel({
  files,
  refreshKey,
  fallback,
  bridgeEnabled = true,
  inspectMode = false,
  projectId,
  projectKind = "static",
  onConsole,
  onElementSelected,
  onSelectionCleared,
  onPreviewReady,
  onPreviewError,
  onViewportChange,
  device: deviceProp,
}: StudioPreviewPanelProps) {
  const [deviceState, setDeviceState] = useState<StudioDevice>("desktop");
  // CONTROLADO quando a barra do projeto fornece o device; senão, interno.
  const device = deviceProp ?? deviceState;
  const setDevice = setDeviceState;
  const [nonce, setNonce] = useState(0);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [logs, setLogs] = useState<StudioConsoleEntry[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Callbacks em ref para não reassinar o listener a cada render.
  const callbacks = useRef({ onConsole, onElementSelected, onSelectionCleared, onPreviewReady, onPreviewError });
  callbacks.current = { onConsole, onElementSelected, onSelectionCleared, onPreviewReady, onPreviewError };

  // Assinatura leve: detecta mudanças de conteúdo sem hashear arquivos grandes.
  const fileVersion = useMemo(() => {
    const entries = Object.entries(files ?? {});
    let sig = `${entries.length}:${nonce}:${refreshKey ?? ""}`;
    for (const [p, c] of entries.slice(0, 30)) sig += `|${p}:${typeof c === "string" ? c.length : 0}`;
    return sig;
  }, [files, nonce, refreshKey]);

  const prepared: PreparedPreview = useMemo(
    () => prepareProjectPreview(files ?? {}, { annotateSource: bridgeEnabled }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fileVersion, bridgeEnabled],
  );

  // Token NOVO a cada documento → mensagens de previews antigos são invalidadas.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const token = useMemo(() => makePreviewBridgeToken(), [fileVersion]);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const deviceRef = useRef(device);
  deviceRef.current = device;

  const srcDoc = useMemo(() => {
    if (!prepared.ok || !prepared.document) return undefined;
    if (!bridgeEnabled) return prepared.document;
    // `deviceRef.current` é apenas o valor INICIAL; troca de device usa
    // `viewport_set` (não recarrega o documento nem perde a seleção).
    return injectStudioBridge(prepared.document, { token, device: deviceRef.current });
  }, [prepared, bridgeEnabled, token]);

  const postToPreview = useCallback((msg: Record<string, unknown>) => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    try {
      frame.contentWindow.postMessage({ ...msg, channel: STUDIO_BRIDGE_CHANNEL, version: STUDIO_BRIDGE_VERSION, token: tokenRef.current }, "*");
    } catch {
      /* preview indisponível */
    }
  }, []);

  // Listener do bridge: valida source/origem/canal/versão/token/payload.
  useEffect(() => {
    if (!bridgeEnabled) return;
    const handler = (ev: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || ev.source !== frame.contentWindow) return;
      // Origem opaca (sandbox) reporta "null"; mesma origem do app também é aceita.
      if (ev.origin !== "null" && ev.origin !== window.location.origin) return;
      const msg = parseStudioBridgeChildMessage(ev.data, tokenRef.current);
      if (!msg) return;
      switch (msg.type) {
        case "preview_ready":
          setBridgeReady(true);
          callbacks.current.onPreviewReady?.(msg.capabilities);
          break;
        case "element_selected":
          callbacks.current.onElementSelected?.(msg.element, msg.viewport);
          break;
        case "inspect_clear":
          callbacks.current.onSelectionCleared?.();
          break;
        case "preview_error": {
          const entry: StudioConsoleEntry = { level: "error", args: msg.message, at: Date.now() };
          setLogs((prev) => [...prev.slice(-199), entry]);
          callbacks.current.onPreviewError?.({ message: msg.message, source: msg.source, line: msg.line, column: msg.column });
          break;
        }
        case "console": {
          const entry: StudioConsoleEntry = { level: msg.level, args: msg.message, at: Date.now() };
          setLogs((prev) => [...prev.slice(-199), entry]);
          callbacks.current.onConsole?.(entry);
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [bridgeEnabled]);

  // Documento novo (edição/reload): invalida sessão, seleção e console anteriores.
  useEffect(() => {
    setBridgeReady(false);
    setLogs([]);
    callbacks.current.onSelectionCleared?.();
  }, [token]);

  // Propaga o modo inspeção quando o bridge estiver pronto.
  useEffect(() => {
    if (!bridgeEnabled || !bridgeReady) return;
    postToPreview({ type: "inspect_set", active: !!inspectMode });
  }, [bridgeEnabled, bridgeReady, inspectMode, postToPreview]);

  // Propaga o viewport (device) sem recarregar o preview.
  useEffect(() => {
    if (!bridgeEnabled || !bridgeReady) return;
    const frame = iframeRef.current;
    const width = frame?.clientWidth || DEVICE_WIDTH_PX[device];
    postToPreview({ type: "viewport_set", device, width, height: DEVICE_HEIGHT[device] });
  }, [bridgeEnabled, bridgeReady, device, postToPreview]);

  // Informa o device atual ao Studio (contexto de edição visual/responsividade).
  useEffect(() => {
    onViewportChange?.(device);
  }, [device, onViewportChange]);

  if (!files || Object.keys(files).length === 0) {
    // Projeto React: o preview representa o SITE GERADO. Nunca usar spec/conversa/
    // instrução do agente como conteúdo da página.
    if (projectKind === "react") {
      return (
        <div className="flex h-full min-h-[320px] items-center justify-center rounded-none border-0 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          <div className="space-y-2">
            <p className="text-base">⏳ Preparando o preview do site...</p>
            <p className="text-xs">Aguarde a geração dos arquivos do projeto.</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-none border-0 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        {fallback ?? (
          <div className="space-y-2">
            <FileCode2 className="mx-auto h-8 w-8 opacity-40" />
            <p>Este projeto ainda não possui arquivos de código.</p>
            <p className="text-xs">Gere o site para criar o workspace.</p>
          </div>
        )}
      </div>
    );
  }

  // C0: projeto React → preview REAL via WebContainer + Vite (nunca srcDoc).
  if (projectKind === "react") {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-card px-3 py-1.5">
          <p className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <FileCode2 className="h-3.5 w-3.5 text-primary" /> Preview do site
          </p>
          {/* O seletor Desktop/Tablet/Mobile fica no TOPO da página (só um). */}
        </div>
        <div className="min-h-0 flex-1">
          <WebContainerPreview
            files={files}
            projectId={projectId}
            device={device}
            refreshKey={refreshKey}
            visualMode={inspectMode}
            onElementSelected={onElementSelected}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-card px-3 py-1.5">
        <p className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
          <FileCode2 className="h-3.5 w-3.5 text-primary" />
          Preview · {prepared.fileCount} arquivo(s)
          {inspectMode && (
            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              <Crosshair className="h-2.5 w-2.5" /> inspeção
            </span>
          )}
          {bridgeEnabled && (
            <span
              className={`h-1.5 w-1.5 rounded-full ${bridgeReady ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
              title={bridgeReady ? "bridge conectado" : "aguardando o preview"}
            />
          )}
        </p>
        <div className="flex items-center gap-1">
          <StudioDeviceSwitcher value={device} onChange={setDevice} />
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            title="Recarregar preview"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowConsole((v) => !v)}
            title="Console do preview"
            className={`relative inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted/60 ${showConsole ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Terminal className="h-3.5 w-3.5" />
            {logs.length > 0 && (
              <span className="absolute -right-1 -top-1 min-w-[14px] rounded-full bg-primary px-1 text-[9px] font-semibold leading-[14px] text-primary-foreground">
                {logs.length > 99 ? "99+" : logs.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {prepared.errors.length > 0 && (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <p className="flex items-center gap-2 text-xs font-semibold text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" /> O código tem problemas que impedem o preview confiável:
          </p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-amber-700/80">
            {prepared.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
          {srcDoc && <p className="mt-1 text-[10px] text-amber-600/70">Exibindo mesmo assim — o agente pode corrigir informando estes erros.</p>}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto bg-[#ececec] p-3 sm:p-4">
        <div
          className="mx-auto overflow-hidden rounded-lg bg-white shadow-[0_8px_30px_-12px_rgba(16,24,40,.25)] transition-all duration-300"
          style={{ maxWidth: DEVICE_WIDTH[device] }}
        >
          {srcDoc ? (
            <iframe
              ref={iframeRef}
              title="Preview do site"
              srcDoc={srcDoc}
              sandbox={PREVIEW_SANDBOX}
              className="block w-full border-0"
              style={{ height: DEVICE_HEIGHT[device], backgroundColor: "#ffffff" } as CSSProperties}
            />
          ) : (
            <div className="flex min-h-[320px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Não foi possível montar o documento para preview.
            </div>
          )}
        </div>
      </div>

      {showConsole && (
        <div className="flex max-h-40 shrink-0 flex-col border-t border-border/60 bg-zinc-950">
          <div className="flex shrink-0 items-center justify-between px-2.5 py-1 text-[10px] uppercase tracking-wide text-zinc-400">
            <span>Console do preview ({logs.length})</span>
            <button type="button" onClick={() => setLogs([])} className="inline-flex items-center gap-1 hover:text-zinc-200" title="Limpar console">
              <Trash2 className="h-3 w-3" /> limpar
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2 font-mono text-[11px] [scrollbar-width:thin]">
            {logs.length === 0 ? (
              <p className="py-2 text-zinc-500">Sem mensagens.</p>
            ) : (
              logs.map((entry, i) => (
                <p
                  key={`${entry.at}-${i}`}
                  className={entry.level === "error" ? "text-red-300" : entry.level === "warn" ? "text-amber-300" : "text-emerald-200"}
                >
                  {entry.args}
                </p>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
