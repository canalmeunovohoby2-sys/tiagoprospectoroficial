import { describe, it, expect } from "vitest";
import { parseGenerateResponse } from "../lib/generateStream";

function resFrom(text: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close(); },
  });
  return new Response(stream, { status: 200 });
}
const JSONBODY = JSON.stringify({ status: "error", blocked_code: "model_divergence", blocked_reason: "Divergência de modelo: pedido indicou X, IA validada usa Y." });

describe("parseGenerateResponse — fluxo /generate (HTTP 200)", () => {
  it("NDJSON com evento result → devolve o payload", async () => {
    const res = resFrom('{"type":"start"}\n{"type":"ping"}\n{"type":"result","status":"ok","files":{"index.html":"<h1>oi</h1>"},"reply":"done"}\n');
    const p = await parseGenerateResponse(res);
    expect(p).toMatchObject({ type: "result", status: "ok", reply: "done" });
    expect((p as any).files).toMatchObject({ "index.html": "<h1>oi</h1>" });
  });

  it("JSON simples 200 SEM quebra de linha (resposta bloqueada) → devolve o objeto (não mascarar como indisponível)", async () => {
    const res = resFrom(JSONBODY); // sem "\n"
    const p = await parseGenerateResponse(res);
    expect(p).not.toBeNull();
    expect((p as any).blocked_code).toBe("model_divergence");
    expect((p as any).blocked_reason).toContain("Divergência de modelo");
  });

  it("NDJSON sem evento result → null (nenhum resultado para interpretar)", async () => {
    const res = resFrom('{"type":"start"}\n{"type":"ping"}\n');
    expect(await parseGenerateResponse(res)).toBeNull();
  });

  it("vazio / HTTP não-ok → null", async () => {
    expect(await parseGenerateResponse(new Response("", { status: 200 }))).toBeNull();
    expect(await parseGenerateResponse(new Response("x", { status: 500 }))).toBeNull();
  });
});
