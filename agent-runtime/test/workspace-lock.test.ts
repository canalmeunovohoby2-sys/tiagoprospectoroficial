import { describe, it, expect } from "vitest";
import { withWorkspaceLock } from "../src/workspace";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("C8 · lock por projeto (run vs git/build)", () => {
  it("Teste 7 — operações do MESMO projeto são serializadas (B espera A)", async () => {
    const order: string[] = [];
    const a = withWorkspaceLock("proj-x", async () => { order.push("a-start"); await sleep(30); order.push("a-end"); return "a"; });
    const b = withWorkspaceLock("proj-x", async () => { order.push("b-start"); await sleep(5); order.push("b-end"); return "b"; });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe("a");
    expect(rb).toBe("b");
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });

  it("projetos DIFERENTES não se bloqueiam (isolamento)", async () => {
    const order: string[] = [];
    const a = withWorkspaceLock("proj-A", async () => { order.push("A-start"); await sleep(25); order.push("A-end"); });
    const b = withWorkspaceLock("proj-B", async () => { order.push("B-start"); await sleep(5); order.push("B-end"); });
    await Promise.all([a, b]);
    // B termina antes de A porque roda em paralelo (chaves diferentes).
    expect(order).toEqual(["A-start", "B-start", "B-end", "A-end"]);
  });

  it("uma falha não trava a fila do projeto", async () => {
    const order: string[] = [];
    await expect(withWorkspaceLock("proj-z", async () => { order.push("fail"); throw new Error("boom"); })).rejects.toThrow("boom");
    const ok = await withWorkspaceLock("proj-z", async () => { order.push("next"); return 1; });
    expect(ok).toBe(1);
    expect(order).toEqual(["fail", "next"]);
  });
});
