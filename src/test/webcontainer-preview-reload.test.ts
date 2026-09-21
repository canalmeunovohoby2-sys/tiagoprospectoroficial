import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// O "não aparece no preview": o reload do iframe precisa reagir aos ARQUIVOS
// (projeção `projected`), não só a um refreshKey externo — assim o site REAL
// aparece mesmo quando o HMR do Vite interno não aplica a mudança.
describe("Preview do Studio · mudanças do agente aparecem", () => {
  const src = readFileSync(join(process.cwd(), "src/components/sites/studio/WebContainerPreview.tsx"), "utf8");

  it("o reload do iframe depende dos arquivos projetados", () => {
    expect(src).toContain("}, [refreshKey, phase, projected]);");
  });

  it("uma rajada de arquivos gera UMA atualização (debounce 1,5s) — fim do preview piscando", () => {
    expect(src).toContain("setTimeout(() => setFrameKey((k) => k + 1), 1500)");
  });

  it("o iframe é remontado por frameKey (reload garantido, não só HMR)", () => {
    expect(src).toContain("setFrameKey((k) => k + 1)");
    expect(src).toMatch(/key=\{frameKey\}|frameKey/);
  });

  it("oferece abrir o site em ABA COMPLETA (sem COEP) — onde o Google Maps real carrega", () => {
    expect(src).toContain("Abrir completo");
    expect(src).toContain("resolveEditorRuntime");
    expect(src).toContain("/preview/");
  });

  it("PADRÃO é o preview do BUILD (runtime) — o Vite do navegador vira alternativa", () => {
    expect(src).toContain('useState<"runtime" | "vite">("runtime")');
    expect(src).toContain('previewSource === "runtime" && fullTabUrl');
    expect(src).toContain('setPreviewSource((s) => (s === "runtime" ? "vite" : "runtime"))');
  });

  it("o preview prioriza o runtime LOCAL (127.0.0.1:8787) — Railway só como reserva", () => {
    expect(src).toContain("if (await localRuntimeHealth())");
    expect(src).toContain("LOCAL_AGENT_RUNTIME_URL.replace(/\\/$/, \"\")");
    expect(src).toContain('sel.state !== "remote"');
  });

  it("o hook sincroniza arquivos quando o container está pronto", () => {
    const hook = readFileSync(join(process.cwd(), "src/hooks/studio/useWebContainerPreview.ts"), "utf8");
    expect(hook).toContain('if (!enabled || phase !== "ready") return;');
    expect(hook).toContain("service.syncFiles(next, pushLog)");
  });
});
