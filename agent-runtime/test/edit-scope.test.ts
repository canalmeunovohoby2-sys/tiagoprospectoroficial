import { describe, it, expect } from "vitest";
import { isGlobalVisualEdit, wasProjectSwept, EDIT_SWEEP_NUDGE } from "../src/studio/agent-core/edit-scope";

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
