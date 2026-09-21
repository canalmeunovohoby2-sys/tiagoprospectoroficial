import { describe, it, expect } from "vitest";
import { normalizeInitialMessages } from "../src/conversation-memory";

// Histórico misto (texto + blocos de anexo) NÃO pode derrubar a execução:
// o SDK quebrava com `content.map is not a function` e a run morria em segundos.
describe("initialMessages · normalização (fim do crash do histórico)", () => {
  it("content SEMPRE em BLOCOS (o SDK percorre com .map) — anexo vira texto", () => {
    const out = normalizeInitialMessages([
      { role: "user", content: "troque a logo" },
      { role: "user", content: [{ type: "text", text: "use esta logo" }, { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } }] },
      { role: "assistant", content: "vou aplicar" },
    ]);
    expect(out).toHaveLength(3);
    expect(out.every((m) => Array.isArray(m.content))).toBe(true);
    expect(out.every((m) => typeof m.content[0]?.text === "string")).toBe(true);
    expect(out[1].content[0].text).toContain("use esta logo");
    expect(JSON.stringify(out)).not.toContain("data:image");
  });

  it("ignora entradas inválidas/vazias e limita a janela", () => {
    const out = normalizeInitialMessages([
      null, "texto solto", { role: "system", content: "x" }, { role: "user", content: "" },
      { role: "user", content: { text: "objeto" } },
    ]);
    expect(out).toEqual([{ role: "user", content: [{ type: "text", text: "objeto" }] }]);
    const many = Array.from({ length: 40 }, (_, i) => ({ role: "user", content: `m${i}` }));
    expect(normalizeInitialMessages(many)).toHaveLength(20);
  });
});
