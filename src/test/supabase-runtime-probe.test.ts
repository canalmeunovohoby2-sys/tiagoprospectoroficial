import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// FASE SUPABASE — a probe é uma PROVA ISOLADA: não pode virar caminho de produção,
// não pode expor secrets e não pode tentar rodar o que o Edge não suporta.
const probe = readFileSync(join(process.cwd(), "supabase/functions/runtime-migration-probe/index.ts"), "utf8");

describe("FASE SUPABASE · runtime-migration-probe (prova isolada)", () => {
  it("exige autenticação antes de qualquer trabalho (401 sem Bearer)", () => {
    expect(probe).toContain("autenticação necessária (Bearer JWT)");
    expect(probe).toMatch(/status[^\n]*401|json\([^\n]*401/);
    expect(probe).toContain("auth.getUser(token)");
  });

  it("NUNCA expõe valores de secrets (apenas presença booleana)", () => {
    expect(probe).toContain("env_present");
    expect(probe).not.toMatch(/env_present[^}]*Deno\.env\.get\([^)]+\)\s*[,}]/);
    // nenhum console.log/print de env
    expect(probe).not.toMatch(/console\.log\(/);
    // e os nomes são consultados só como booleanos
    expect(probe).toMatch(/RUNTIME_GATEWAY_SECRET: !!Deno\.env\.get\("RUNTIME_GATEWAY_SECRET"\)/);
  });

  it("escrita é OPT-IN e não quebra quando a tabela de prova não existe", () => {
    expect(probe).toContain('searchParams.get("write") === "1"');
    expect(probe).toContain('from("runtime_probe")');
    expect(probe).toContain("skipped: true");
  });

  it("streaming NDJSON é testável sem tocar em produção", () => {
    expect(probe).toContain('searchParams.get("stream") === "1"');
    expect(probe).toContain("application/x-ndjson");
    expect(probe).toContain("ReadableStream");
  });

  it("só chama o runtime externo no /health (leve, sem risco)", () => {
    expect(probe).toContain("runtimeUrl.replace");
    expect(probe).toContain("/health");
    // nenhuma CHAMADA a /run (o texto pode citá-lo apenas como "não suportado")
    expect(probe).not.toMatch(/fetch\([^)]*\/run/);
    expect(probe).not.toMatch(/\/run["'`]/);
  });

  it("declara explicitamente o que NÃO é suportado no Edge (Chromium/build/git)", () => {
    expect(probe).toContain("unsupported_here");
    for (const item of ["chromium/playwright", "subprocess", "build", "git", "/video"]) {
      expect(probe, item).toContain(item);
    }
  });

  it("não é chamada pelo frontend (prova isolada)", () => {
    const api = readFileSync(join(process.cwd(), "src/lib/siteProjectsApi.ts"), "utf8");
    expect(api).not.toContain("runtime-migration-probe");
  });
});
