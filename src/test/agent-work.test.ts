import { describe, it, expect } from "vitest";
import { buildWorkTimeline } from "@/lib/agentWorkActivity";

describe("Agent Work Activity (5.29) — timeline só com eventos reais", () => {
  it("sem eventos nem arquivos → sem timeline (nada inventado)", () => {
    expect(buildWorkTimeline(undefined)).toBe("");
    expect(buildWorkTimeline([], [])).toBe("");
  });

  it("mapeia eventos reais para etapas legíveis com ícones e arquivos", () => {
    const out = buildWorkTimeline([
      { phase: "analyzing", detail: "Lendo a estrutura do projeto…" },
      { phase: "reading", detail: "Lendo `index.html`" },
      { phase: "editing", detail: "Editando `src/site.css`" },
      { phase: "done", detail: "Concluído" },
    ], ["src/site.css"]);
    expect(out).toContain("🔎 Analisando projeto");
    expect(out).toContain("📄 Lendo arquivo `index.html`");
    expect(out).toContain("🛠️ Editando `src/site.css`");
    expect(out).toContain("✅ Concluído");
    expect(out).toContain("📁 Arquivos alterados: `src/site.css`");
  });

  it("etapas repetidas consecutivas são colapsadas", () => {
    const out = buildWorkTimeline([
      { phase: "reading", detail: "Lendo `index.html`" },
      { phase: "reading", detail: "Lendo `index.html`" },
      { phase: "done", detail: "Concluído" },
    ]);
    expect(out.match(/Lendo arquivo `index\.html`/g)?.length ?? 0).toBe(1);
  });

  it("fase desconhecida/ruído NÃO vira etapa inventada", () => {
    const out = buildWorkTimeline([{ phase: "thinking", detail: "raciocínio interno" } as never, { phase: "done", detail: "Concluído" }]);
    expect(out).not.toContain("raciocínio");
    expect(out).toContain("✅ Concluído");
  });

  it("research/browser/visual são apresentados com ícones corretos", () => {
    const out = buildWorkTimeline([
      { phase: "researching", detail: "Pesquisando tendências de pet shop" },
      { phase: "verifying", detail: "browser_open no site" },
      { phase: "verifying", detail: "visual_review do hero" },
      { phase: "testing", detail: "Executando validações" },
    ]);
    expect(out).toContain("🌐 Pesquisando tendências de pet shop");
    expect(out).toContain("🌐 browser_open no site");
    expect(out).toContain("👁️ Análise visual (Gemini)");
    expect(out).toContain("🧪 Executando validações");
  });

  it("limita o número de linhas exibidas", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ phase: "editing", detail: `Editando \`src/f${i}.css\`` }));
    const out = buildWorkTimeline(many, [], 3);
    expect((out.match(/🛠️/g) ?? []).length).toBeLessThanOrEqual(3);
  });
});
