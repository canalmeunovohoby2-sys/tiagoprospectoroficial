import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// FASE 7 — o regression-guard existe em duas cópias (runtime e edge). Elas devem
// permanecer IDÊNTICAS para impedir divergência de comportamento. Este teste
// falha se alguém alterar uma sem a outra.
describe("FASE 7 — regression-guard runtime × edge não podem divergir", () => {
  it("as duas cópias têm conteúdo idêntico (ignorando CRLF)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const normalize = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    const runtime = normalize(join(here, "..", "src", "regression-guard.ts"));
    const edge = normalize(join(here, "..", "..", "supabase", "functions", "_shared", "regression-guard.ts"));
    expect(edge).toBe(runtime);
  });
});
