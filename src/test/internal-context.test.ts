import { describe, it, expect } from "vitest";
import { looksInternalContext } from "@/lib/studio/internalContext";
import { thoughtsOf } from "@/lib/studio/reasoning";

// Defesa no frontend: mesmo que o runtime deixe passar, blocos internos não aparecem.
describe("chat · contexto interno nunca é exibido (frontend)", () => {
  it("identifica blocos internos e ignora texto normal", () => {
    expect(looksInternalContext("IDIOMA (obrigatório): responda em pt-BR.")).toBe(true);
    expect(looksInternalContext("MEMÓRIA DE DECISÕES (preserve):")).toBe(true);
    expect(looksInternalContext("CONVERSA RECENTE (continuidade):")).toBe(true);
    expect(looksInternalContext("Vou substituir a logo atual pela enviada.")).toBe(false);
  });

  it("thoughts internos são filtrados da exibição", () => {
    const items = [
      { kind: "thought", id: "1", content: "DIREÇÃO CRIATIVA DESTE NEGÓCIO: paleta carvão" },
      { kind: "thought", id: "2", content: "Vou trocar a logo atual pela enviada." },
    ] as never;
    const out = thoughtsOf(items);
    expect(out).toHaveLength(1);
    expect(out[0].content).toContain("Vou trocar a logo");
  });
});
