import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// jsdom não tem cross-origin isolation: liberamos o caminho do WebContainer.
vi.mock("@/lib/studio/isolation", () => ({
  isCrossOriginIsolated: () => true,
  isolationDiagnostic: () => ({ ok: true, reason: null }),
}));

import { useWebContainerPreview } from "@/hooks/studio/useWebContainerPreview";
import type { WebContainerService } from "@/lib/studio/webcontainer";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function makeService() {
  const loadCtl = deferred<string>();
  const syncCalls: Array<Record<string, string>> = [];
  const service: WebContainerService = {
    ensureBooted: vi.fn(async () => ({}) as never),
    load: vi.fn(() => loadCtl.promise),
    syncFiles: vi.fn(async (files: Record<string, string>) => {
      syncCalls.push(files);
      return { updated: Object.keys(files).length, removed: 0, depsChanged: false };
    }),
    isReady: () => true,
    getUrl: () => "http://localhost:5173",
    getProjectId: () => null,
    getInstance: () => null,
    teardown: vi.fn(async () => {}),
  };
  return { service, loadCtl, syncCalls };
}

describe("useWebContainerPreview — o site GERADO aparece (sem corrida de sync)", () => {
  it("arquivos que chegam durante o boot são sincronizados depois do ready", async () => {
    const { service, loadCtl, syncCalls } = makeService();
    const template = { "package.json": "{}", "src/App.tsx": "TEMPLATE" };
    const generated = { "package.json": "{}", "src/App.tsx": "GERADO", "src/components/Header.tsx": "H" };

    const { rerender } = renderHook(
      ({ files }: { files: Record<string, string> }) => useWebContainerPreview({ files, projectId: "p1", enabled: true, service }),
      { initialProps: { files: template } },
    );

    // O agente termina DURANTE o boot (npm install): `load` ainda está pendente.
    rerender({ files: generated });
    await act(async () => { loadCtl.resolve("http://localhost:5173"); });

    // Sem a correção, os arquivos gerados eram marcados como "já sincronizados"
    // ao final do boot e o preview ficava preso no template para sempre.
    await waitFor(() => expect(service.syncFiles).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(syncCalls[0]["src/App.tsx"]).toBe("GERADO");
    expect(syncCalls[0]["src/components/Header.tsx"]).toBe("H");
  });
});
