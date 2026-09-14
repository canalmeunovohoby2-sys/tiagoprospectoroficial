import { describe, it, expect } from "vitest";
import {
  isGlobalVisualEdit, wasProjectSwept, EDIT_SWEEP_NUDGE,
  namedColorTarget, colorTokens, targetApplied, paletteStillOld, colorNotAppliedNudge,
  mentionsColorChange, paletteUnchanged, uninspectedEdits, UNINSPECTED_NUDGE,
} from "../src/studio/agent-core/edit-scope";

describe("edit-scope · pedido de mudança visual GLOBAL", () => {
  it("reconhece pedidos de identidade/tema/cor", () => {
    for (const t of [
      "Mude a cor do site.",
      "quero trocar a cor principal para vermelho",
      "deixe o site mais escuro e sofisticado",
      "quero algo mais minimalista",
      "troque o tema para azul escuro e dourado",
      "mude a tipografia do site",
      "faça um redesign do site inteiro",
    ]) expect(isGlobalVisualEdit(t), t).toBe(true);
  });

  it("NÃO trata ajustes locais/pontuais como globais", () => {
    for (const t of [
      "troque o texto do botão",
      "mude apenas o título do hero",
      "arrume o link do WhatsApp",
      "aumente o espaço nessa seção específica",
      "",
    ]) expect(isGlobalVisualEdit(t), t).toBe(false);
  });
});

describe("edit-scope · o Coder VARREU o projeto?", () => {
  it("considera varredura quando busca ou toca vários arquivos ou tokens/CSS", () => {
    expect(wasProjectSwept({ touched: ["src/App.tsx"], toolNames: ["grep_search"] })).toBe(true);
    expect(wasProjectSwept({ touched: ["src/App.tsx", "src/index.css"], toolNames: ["write_file"] })).toBe(true);
    expect(wasProjectSwept({ touched: ["src/index.css"], toolNames: ["edit_file"] })).toBe(true);
    expect(wasProjectSwept({ touched: ["tailwind.config.ts"], toolNames: ["edit_file"] })).toBe(true);
  });

  it("NÃO considera varredura quando alterou um arquivo só sem buscar", () => {
    expect(wasProjectSwept({ touched: ["src/App.tsx"], toolNames: ["edit_file"] })).toBe(false);
    expect(wasProjectSwept({ touched: [], toolNames: [] })).toBe(false);
  });

  it("o nudge exige grep_search, tokens e revisão de todas as seções", () => {
    expect(EDIT_SWEEP_NUDGE).toMatch(/grep_search/);
    expect(EDIT_SWEEP_NUDGE).toMatch(/tokens|variáveis|design system/i);
    expect(EDIT_SWEEP_NUDGE).toMatch(/site inteiro/i);
    expect(EDIT_SWEEP_NUDGE).toMatch(/não conclu|só conclua/i);
  });
});

describe("edit-scope · COR pedida não aplicada (evidência da paleta antiga)", () => {
  it("reconhece a cor nomeada no pedido (e ignora pedidos sem cor)", () => {
    expect(namedColorTarget("troque a cor do site para vermelho")?.classes).toContain("red");
    expect(namedColorTarget("quero tudo azul escuro")?.classes).toContain("blue");
    expect(namedColorTarget("deixe mais sofisticado")).toBeNull();
  });

  it("extrai tokens de cor do código (hex + famílias Tailwind)", () => {
    const t = colorTokens({ "src/App.tsx": '<div className="bg-blue-600 text-slate-900" style={{color:"#ef4444"}} />' });
    expect(t.has("blue")).toBe(true);
    expect(t.has("slate-9")).toBe(true);
    expect(t.has("#ef4444")).toBe(true);
  });

  it("detecta quando o alvo NÃO foi aplicado e a paleta antiga permaneceu", () => {
    const before = colorTokens({ "src/App.tsx": 'className="bg-blue-600 text-blue-100 border-blue-500 hover:bg-blue-700"' });
    const after = colorTokens({ "src/App.tsx": 'className="bg-blue-600 text-blue-100 border-blue-500 hover:bg-blue-700" style={{color:"#0f172a"}}' });
    const red = namedColorTarget("troque para vermelho");
    expect(red).toBeTruthy();
    expect(targetApplied(after, red!)).toBe(false);
    expect(paletteStillOld(before, after)).toBe(true);
  });

  it("quando o alvo FOI aplicado, não cobra", () => {
    const after = colorTokens({ "src/App.tsx": 'className="bg-red-600 text-red-100"' });
    expect(targetApplied(after, namedColorTarget("troque para vermelho")!)).toBe(true);
  });

  it("o nudge cita as cores antigas e exige varredura", () => {
    const n = colorNotAppliedNudge(["blue", "#2563eb"]);
    expect(n).toMatch(/NÃO aplicou/i);
    expect(n).toContain("blue");
    expect(n).toMatch(/grep_search/);
  });

  it("detecta mudança de cor/identidade mesmo sem nomear cor", () => {
    expect(mentionsColorChange("deixe o site mais escuro")).toBe(true);
    expect(mentionsColorChange("quero um tema mais claro")).toBe(true);
    expect(mentionsColorChange("troque a paleta")).toBe(true);
    expect(mentionsColorChange("mude a ordem das seções")).toBe(false);
  });

  it("paleta idêntica (nada saiu, nada novo entrou) → identidade não mudou", () => {
    const before = colorTokens({ "src/App.tsx": 'className="bg-blue-600 text-blue-100"' });
    const after = colorTokens({ "src/App.tsx": 'className="bg-blue-600 text-blue-100"' });
    expect(paletteUnchanged(before, after)).toBe(true);
    const changed = colorTokens({ "src/App.tsx": 'className="bg-blue-600 text-blue-100 bg-red-700"' });
    expect(paletteUnchanged(before, changed)).toBe(false); // entrou cor nova
  });
});

describe("edit-scope · inspeção obrigatória em edição", () => {
  it("aponta arquivos EXISTENTES alterados sem leitura (e ignora arquivos novos)", () => {
    const existing = new Set(["src/App.tsx", "src/index.css"]);
    expect(uninspectedEdits(existing, ["src/App.tsx", "src/Header.tsx"], ["src/index.css"])).toEqual(["src/App.tsx"]);
    expect(uninspectedEdits(existing, ["src/App.tsx"], ["src/App.tsx"])).toEqual([]);
  });

  it("o nudge exige read_file + grep_search e não concluir com sobras", () => {
    const n = UNINSPECTED_NUDGE(["src/App.tsx"]);
    expect(n).toContain("src/App.tsx");
    expect(n).toMatch(/read_file/);
    expect(n).toMatch(/grep_search/);
    expect(n).toMatch(/Só finalize/i);
  });
});
