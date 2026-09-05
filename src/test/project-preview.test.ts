import { describe, it, expect } from "vitest";
import { prepareProjectPreview } from "../../src/lib/projectPreviewRuntime";

const baseFiles = (extra?: Record<string, string>) => ({
  "cliente/index.html": `<!doctype html><html lang="pt-BR"><head><title>Clínica Bella</title><style>.a{color:red}</style></head><body><h1>Clínica Bella Forma</h1><script src="./src/main.js"></script></body></html>`,
  "cliente/src/main.js": "document.addEventListener('DOMContentLoaded',()=>{console.log('ok')});",
  "cliente/src/site.json": JSON.stringify({ business: { name: "Clínica Bella Forma" } }),
  "cliente/src/site.css": ".hero-badge{background:linear-gradient(90deg,#1d4ed8,#f59e0b);border-radius:999px}",
  "cliente/package.json": JSON.stringify({ name: "cliente", scripts: { build: "vite build" } }),
  ...(extra ?? {}),
});

describe("Project Preview Runtime (5.14)", () => {
  it("prepara documento a partir do index.html real, injetando main.js", () => {
    const files = baseFiles();
    const p = prepareProjectPreview(files);
    expect(p.ok).toBe(true);
    expect(p.errors).toEqual([]);
    expect(p.document).toContain("<!doctype html>");
    expect(p.document).toContain("Clínica Bella Forma");
    expect(p.document).not.toContain('src="./src/main.js"'); // foi inline
    expect(p.document).toContain("console.log('ok')");
    expect(p.htmlPath).toBeTruthy();
    expect(p.fileCount).toBe(5);
  });

  it("workspace vazio → erro claro", () => {
    const p = prepareProjectPreview({});
    expect(p.ok).toBe(false);
    expect(p.errors.length).toBeGreaterThan(0);
  });

  it("sem index.html → erro", () => {
    const p = prepareProjectPreview({ "src/site.css": "a{}" });
    expect(p.ok).toBe(false);
    expect(p.errors.some((e) => e.includes("index.html"))).toBe(true);
  });

  it("detecta CSS embutido desbalanceado e secreto no documento", () => {
    const files = baseFiles({
      "cliente/index.html": `<!doctype html><html><head><title>x</title><style>.a{color:red</style></head><body>ok</body></html>`,
    });
    const p = prepareProjectPreview(files);
    expect(p.ok).toBe(false);
    expect(p.errors.some((e) => e.toLowerCase().includes("css"))).toBe(true);

    const secret = baseFiles({
      "cliente/index.html": `<!doctype html><html><head><title>x</title><style>a{}</style></head><body>ok <script>const k='sk-abcdef1234567890qwerty'</script></body></html>`,
    });
    const ps = prepareProjectPreview(secret);
    expect(ps.ok).toBe(false);
    expect(ps.errors.some((e) => e.toLowerCase().includes("segredo"))).toBe(true);
  });

  it("main.js vazio gera warning e remove a tag", () => {
    const p = prepareProjectPreview(baseFiles({ "cliente/src/main.js": "   " }));
    expect(p.ok).toBe(true);
    expect(p.warnings.some((w) => w.toLowerCase().includes("vazio"))).toBe(true);
    expect(p.document).not.toContain("src=\"./src/main.js\"");
  });

  it("sanitiza caminhos aninhados e acha index.html em qualquer profundidade", () => {
    const files = {
      "meu-negocio/index.html": "<!doctype html><html><head><title>t</title></head><body>empresa real</body></html>",
      "meu-negocio/src/main.js": "1+1",
    };
    const p = prepareProjectPreview(files);
    expect(p.ok).toBe(true);
    expect(p.htmlPath?.endsWith("index.html")).toBe(true);
  });

  it("integração: badge adicionado pelo agente aparece no documento", () => {
    // Simula: agente editou index.html + site.css adicionando .hero-badge
    const files = baseFiles({
      "cliente/index.html": `<!doctype html><html lang="pt-BR"><head><title>Clínica Bella</title><style>.a{color:red}</style></head><body><h1>Clínica Bella Forma</h1><span class="hero-badge">Atendimento Premium</span><script src="./src/main.js"></script></body></html>`,
      "cliente/src/site.css": ".hero-badge{background:linear-gradient(90deg,#1d4ed8,#f59e0b);border-radius:999px}",
    });
    const p = prepareProjectPreview(files);
    expect(p.ok).toBe(true);
    expect(p.document).toContain('class="hero-badge"');
    expect(p.document).toContain("Atendimento Premium");
  });
});
