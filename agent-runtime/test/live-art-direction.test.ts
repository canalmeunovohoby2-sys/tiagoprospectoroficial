import { describe, it, expect } from "vitest";
import { generateArtDirection, clearArtDirectionCache } from "../src/studio/agent-core/art-direction";

// Teste AO VIVO (opcional): só roda com LIVE_AI=1 e DEEPSEEK_API_KEY no ambiente.
// Prova que a etapa de direção de arte produz direções DISTINTAS para duas empresas
// do MESMO segmento com posicionamentos diferentes (Fase 1/6).
const KEY = process.env.DEEPSEEK_API_KEY ?? "";
const live = process.env.LIVE_AI === "1" && KEY.length > 10;

const A = {
  name: "Esquerdo Advogados",
  segment: "advocacia",
  category: "escritório de advocacia",
  city: "Bauru",
  state: "SP",
  about: "Atuação contemporânea com atendimento próximo e comunicação direta.",
  services: ["Criminal", "Cível", "Família"],
};

const B = {
  name: "Moraes & Prado Advocacia",
  segment: "advocacia",
  category: "escritório de advocacia",
  city: "Bauru",
  state: "SP",
  about: "Banca tradicional e institucional fundada em 1985, foco em empresas.",
  services: ["Empresarial", "Trabalhista", "Tributário"],
};

async function complete(input: { system: string; user: string; maxTokens: number; temperature: number }): Promise<string> {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      max_tokens: input.maxTokens,
      temperature: input.temperature,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) return "";
  const json = await res.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }> } | null;
  return json?.choices?.[0]?.message?.content ?? "";
}

(live ? describe : describe.skip)("direção de arte AO VIVO (LIVE_AI=1)", () => {
  it("dois escritórios de advocacia recebem direções distintas", async () => {
    clearArtDirectionCache();
    const a = await generateArtDirection({ business: A as never, complete, timeoutMs: 60_000, fresh: true });
    const b = await generateArtDirection({ business: B as never, complete, timeoutMs: 60_000, fresh: true });
    expect(a.meta.source).toBe("ai");
    expect(b.meta.source).toBe("ai");
    expect(a.typography.pair).toBeTruthy();
    expect(b.typography.pair).toBeTruthy();
    const sig = (s: typeof a) => `${s.typography.pair}|${s.hero.composition}|${s.palette.tokens.map((t) => t.hex).join(",")}`;
    expect(sig(a)).not.toBe(sig(b));
  }, 180_000);
});
