import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(process.cwd(), "src/components/sites/studio/WebContainerPreview.tsx"),
  "utf8",
);

// BUG 1 (corrigido): o preview embutido apontava SEMPRE para http://127.0.0.1:8787.
// No app publicado (HTTPS público) o Chrome bloqueia Local Network Access em SUBFRAME
// → "A conexão com 127.0.0.1 foi recusada" com o agente no ar.
describe("preview · iframe para o runtime local", () => {
  it("detecta se o app é servido pelo próprio agente (mesma origem)", () => {
    expect(src).toContain("const appServedByAgent =");
    expect(src).toContain("window.location.origin === LOCAL_AGENT_RUNTIME_URL");
  });

  it("os dois iframes do runtime exigem appServedByAgent", () => {
    expect(src).toContain('previewSource === "runtime" && fullTabUrl && appServedByAgent');
    expect(src).toContain(") : fullTabUrl && appServedByAgent ? (");
  });

  it("não mostra aviso extra na tela (só o botão Abrir completo)", () => {
    expect(src).toContain("Abrir completo");
    expect(src).not.toContain("não permite carregar");
  });
});

// BUG 2 (corrigido): a edição salva NÃO aparecia no preview do runtime — o `frameKey`
// só era aplicado no iframe do WebContainer e a recarga exigia `phase === "ready"`,
// que no preview do runtime (modo local) nunca acontece.
describe("preview · recarrega após cada edição", () => {
  it("a recarga não depende do WebContainer ficar ready", () => {
    const idx = src.indexOf("setTimeout(() => setFrameKey");
    expect(idx).toBeGreaterThan(0);
    // o bloco do refresh (o que o antecede) não pode ter o early-return por fase
    expect(src.slice(Math.max(0, idx - 700), idx)).not.toContain('phase !== "ready"');
    const depois = src.slice(idx, idx + 200);
    expect(depois).toContain("refreshKey, projected");
  });

  it("os DOIS iframes do runtime remontam com cache-buster", () => {
    expect((src.match(/key=\{`rt-/g) ?? []).length).toBe(2);
    expect((src.match(/k=\$\{frameKey\}/g) ?? []).length).toBe(2);
  });
});
