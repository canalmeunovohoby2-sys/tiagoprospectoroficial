import { describe, it, expect } from "vitest";
import { StaticProjectRuntime, createExecutionRuntime, isSecretFree, hasNoGenericPlaceholders, balancedCss, isBalancedJs } from "../../supabase/functions/_shared/agent-execution";
import type { WorkspaceMap } from "../../supabase/functions/_shared/agent-workspace";

function makeWorkspace(company: string, overrides?: Partial<WorkspaceMap>): WorkspaceMap {
  return {
    "cliente/index.html": `<!doctype html><html><head><title>${company}</title></head><body><h1>${company}</h1><section>serviços</section></body></html>`,
    "cliente/src/site.json": JSON.stringify({ business: { name: company } }),
    "cliente/src/site.css": ".a{color:red}.b{margin:0 auto}",
    "cliente/src/main.js": "document.addEventListener('DOMContentLoaded', () => { console.log('ok'); });",
    "cliente/package.json": JSON.stringify({ name: "cliente", scripts: { build: "vite build" } }),
    ...overrides,
  };
}

describe("Agent Execution Runtime (5.13)", () => {
  it("build estático OK para workspace válido", async () => {
    const rt = new StaticProjectRuntime("Clínica Aurora");
    const res = await rt.build(makeWorkspace("Clínica Aurora"));
    expect(res.verdict).toBe("ok");
    expect(res.errors).toEqual([]);
  });

  it("detecta nome real ausente (conteúdo genérico)", async () => {
    const rt = new StaticProjectRuntime("Clínica Aurora");
    const ws = makeWorkspace("Outra Empresa", { "cliente/index.html": "<!doctype html><html><title>x</title><body>conteudo generico</body></html>" });
    const res = await rt.build(ws);
    expect(res.verdict).toBe("error");
    expect(res.errors.some((e) => e.toLowerCase().includes("não aparece"))).toBe(true);
  });

  it("detecta JSON inválido em site.json", async () => {
    const rt = new StaticProjectRuntime("A");
    const ws = makeWorkspace("A", { "cliente/src/site.json": "{não é json" });
    const res = await rt.build(ws);
    expect(res.errors.some((e) => e.includes("site.json") && e.includes("JSON"))).toBe(true);
  });

  it("detecta CSS desbalanceado e segredo", async () => {
    const rt = new StaticProjectRuntime("A");
    const ws = makeWorkspace("A", {
      "cliente/src/site.css": ".a{color:red",
      "cliente/src/main.js": "const x='{';",
    });
    const res = await rt.build(ws);
    expect(res.errors.some((e) => e.includes("site.css"))).toBe(true);
    // main.js com chave dentro de string NÃO deve acusar erro
    expect(res.errors.some((e) => e.includes("main.js"))).toBe(false);
    expect(isSecretFree("const key = 'sk-abc12345678901234567890'")).toBe(false);
    expect(isSecretFree("color: red")).toBe(true);
  });

  it("factory retorna runtime honesto quando não há sandbox", async () => {
    const rt = createExecutionRuntime("none", {});
    const res = await rt.build({ "x.txt": "a" });
    expect(res.verdict).toBe("ok");
    expect(rt.kind).toBe("none");
  });

  it("placeholders genéricos são detectados", () => {
    expect(hasNoGenericPlaceholders("texto com lorem ipsum")).toBe(false);
    expect(hasNoGenericPlaceholders("insira seu texto aqui")).toBe(false);
    expect(hasNoGenericPlaceholders("texto real do negócio")).toBe(true);
  });

  it("balanceamento utilitário funciona", () => {
    expect(balancedCss(".a{color:red}")).toBe(true);
    expect(balancedCss(".a{color:red")).toBe(false);
    expect(isBalancedJs("function f(){ if(x){ return 1; } }")).toBe(true);
    expect(isBalancedJs("function f(){ return 1;")).toBe(false);
  });
});
