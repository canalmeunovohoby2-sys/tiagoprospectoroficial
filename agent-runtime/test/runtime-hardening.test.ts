import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Causa real: um write após res.end() (watchdog) emitia ERR_STREAM_WRITE_AFTER_END
// como evento assíncrono → uncaughtException → o runtime MORRIA (preview caía para
// o Railway). Estas guardas garantem que o processo sobrevive a cliente desconectado.
describe("runtime blindado contra queda por stream encerrado", () => {
  const src = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");

  it("writeLine não escreve depois do fim e ignora stream destruído", () => {
    expect(src).toContain("res.writableEnded || res.destroyed");
  });

  it("erros do stream são capturados (não derrubam o processo)", () => {
    expect(src).toContain('res.on("error"');
    expect(src).toContain('process.on("uncaughtException"');
    expect(src).toContain('process.on("unhandledRejection"');
  });

  it("o watchdog nunca escreve em resposta encerrada (e nunca rejeita)", () => {
    expect(src).toContain("if (!res.writableEnded && !res.destroyed) writeLine(");
    expect(src).toContain("resolve(partialAfterTimeout())");
  });
});
