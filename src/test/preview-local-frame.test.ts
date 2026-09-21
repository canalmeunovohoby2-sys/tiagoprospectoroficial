import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// BUG CORRIGIDO: o preview embutido apontava SEMPRE para http://127.0.0.1:8787/preview/…
// No app publicado (HTTPS público) o Chrome bloqueia Local Network Access em SUBFRAME —
// o usuário via "A conexão com 127.0.0.1 foi recusada" com o agente no ar.
// Regra: iframe só na MESMA origem do agente; fora dela, abrir em aba.
describe("preview · iframe para o runtime local", () => {
  const src = readFileSync(join(process.cwd(), "src/components/sites/studio/WebContainerPreview.tsx"), "utf8");

  it("detecta se o app é servido pelo próprio agente (mesma origem)", () => {
    expect(src).toContain("const appServedByAgent =");
    expect(src).toContain("window.location.origin === LOCAL_AGENT_RUNTIME_URL");
  });

  it("os dois iframes do runtime exigem appServedByAgent", () => {
    const usos = src.match(/src=\{fullTabUrl\}/g) ?? [];
    expect(usos.length).toBeGreaterThan(0);
    // nenhum iframe com src={fullTabUrl} sem a guarda de mesma origem no mesmo branch
    expect(src).toContain("previewSource === \"runtime\" && fullTabUrl && appServedByAgent");
    expect(src).toContain(") : fullTabUrl && appServedByAgent ? (");
  });

  it("explica o bloqueio e oferece o caminho que funciona (aba / app do agente)", () => {
    expect(src).toContain("Abrir completo");
    expect(src).toContain("127.0.0.1:8787");
    expect(src).toMatch(/não permite|nao permite/);
  });
});
