import { describe, it, expect } from "vitest";
import { settleWithin } from "../../supabase/functions/_shared/source-deadline";

describe("settleWithin — deadline de fontes (edge wall-clock)", () => {
  it("devolve todas quando resolvem antes do deadline", async () => {
    const out = await settleWithin([Promise.resolve(1), Promise.resolve(2)], 1000);
    expect([...out.settled].sort()).toEqual([1, 2]);
    expect(out.pending).toBe(0);
  });

  it("devolve as resolvidas e conta a pendente quando estoura o deadline", async () => {
    const hanging = new Promise<number>(() => { /* nunca resolve */ });
    const out = await settleWithin([Promise.resolve(10), hanging], 30);
    expect(out.settled).toEqual([10]);
    expect(out.pending).toBe(1);
  });

  it("rejeição não derruba o resultado (não conta como resolvida)", async () => {
    const out = await settleWithin([Promise.resolve("a"), Promise.reject(new Error("x"))], 50);
    expect(out.settled).toEqual(["a"]);
    expect(out.pending).toBe(1);
  });

  it("é rápido: retorna logo após o deadline, não espera a pendente", async () => {
    const t0 = Date.now();
    await settleWithin([new Promise(() => {})], 40);
    expect(Date.now() - t0).toBeLessThan(200);
  });
});
