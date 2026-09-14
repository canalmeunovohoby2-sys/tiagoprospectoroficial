import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isCrossOriginIsolated, isolationDiagnostic } from "@/lib/studio/isolation";
import { createWebContainerService, type WebContainerService } from "@/lib/studio/webcontainer";

export type WebContainerPhase = "unsupported" | "booting" | "ready" | "error";

/** Serviço singleton: mantém o WebContainer vivo entre trocas de view do Studio. */
export const studioWebContainerService: WebContainerService = createWebContainerService();

const MAX_LOGS = 200;

export interface UseWebContainerPreviewResult {
  phase: WebContainerPhase;
  url: string | null;
  logs: string[];
  error: string | null;
  reload: () => void;
}

export function useWebContainerPreview(input: {
  files: Record<string, string> | null | undefined;
  projectId?: string;
  enabled: boolean;
  service?: WebContainerService;
}): UseWebContainerPreviewResult {
  const { enabled, projectId } = input;
  const service = input.service ?? studioWebContainerService;

  const filesRef = useRef<Record<string, string>>(input.files ?? {});
  filesRef.current = input.files ?? {};
  const lastSyncedRef = useRef<Record<string, string> | null>(null);
  const prevProjectRef = useRef<string | undefined>(projectId);

  const supported = useMemo(() => (enabled ? isCrossOriginIsolated() : true), [enabled]);
  const [phase, setPhase] = useState<WebContainerPhase>(enabled && !supported ? "unsupported" : "booting");
  // Não herda a URL de um projeto anterior (isolamento entre projetos).
  const [url, setUrl] = useState<string | null>(() => (service.getProjectId() === (projectId ?? null) ? service.getUrl() : null));
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const pushLog = useCallback((message: string) => {
    setLogs((prev) => {
      const next = [...prev, message];
      return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
    });
  }, []);

  // Boot + mount + dev server (uma vez por projeto; rebota em reload).
  useEffect(() => {
    if (!enabled) return;
    if (!isCrossOriginIsolated()) {
      setPhase("unsupported");
      setError(isolationDiagnostic().reason ?? "WebContainer indisponível neste navegador.");
      return;
    }
    let cancelled = false;
    setPhase("booting");
    setError(null);
    (async () => {
      if (prevProjectRef.current !== projectId) {
        prevProjectRef.current = projectId;
        lastSyncedRef.current = null;
        await service.teardown();
      }
      // Snapshot EXATO do que foi montado no container. Se o agente gerar
      // arquivos durante o boot/npm install, eles NÃO podem ser marcados como
      // "já sincronizados" — senão o sync pós-ready não roda e o preview fica
      // preso no template para sempre.
      const mounted = filesRef.current;
      const devUrl = await service.load(mounted, pushLog, projectId);
      return { devUrl, mounted };
    })()
      .then(({ devUrl, mounted }) => {
        if (cancelled) return;
        lastSyncedRef.current = mounted;
        setUrl(devUrl);
        setPhase("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Falha ao iniciar o WebContainer.");
        setPhase("error");
      });
    return () => { cancelled = true; };
  }, [enabled, projectId, reloadNonce, service, pushLog]);

  // files_ready → file store → WebContainer (diff) → Vite/HMR.
  useEffect(() => {
    if (!enabled || phase !== "ready") return;
    const next = input.files ?? {};
    if (lastSyncedRef.current === next) return;
    const handle = setTimeout(() => {
      lastSyncedRef.current = next;
      void service.syncFiles(next, pushLog).catch((e) => {
        pushLog(`[WebContainer] falha ao sincronizar: ${e instanceof Error ? e.message : String(e)}`);
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [enabled, phase, input.files, service, pushLog]);

  const reload = useCallback(() => {
    lastSyncedRef.current = null;
    setUrl(null);
    setPhase("booting");
    void service.teardown().finally(() => setReloadNonce((n) => n + 1));
  }, [service]);

  return { phase, url, logs, error, reload };
}
