import { describe, it, expect } from "vitest";
import {
  SITE_BASE_IDS,
  loadSiteBase,
  selectSiteBase,
  prepareBaseWorkspace,
  formatBaseDirective,
  resolveBasesDir,
  buildGenerationSeed,
} from "../src/site-bases";
import { buildCreativeBrief } from "../src/creative-direction";

describe("Site Bases — scaffold estrutural (não é template)", () => {
  it("encontra a biblioteca de bases no disco", () => {
    expect(resolveBasesDir()).toMatch(/site-bases$/);
  });

  it("carrega as 3 bases com estrutura mínima funcional", () => {
    for (const id of SITE_BASE_IDS) {
      const files = loadSiteBase(id);
      expect(Object.keys(files)).toContain("index.html");
      expect(Object.keys(files)).toContain("src/site.css");
      expect(Object.keys(files)).toContain("src/main.js");
      expect(files["index.html"]).toMatch(/<!doctype html>/i);
      expect(files["src/site.css"]).toMatch(/@media/); // responsividade real
    }
  });

  it("as 3 bases são estrutural e visualmente diferentes entre si", () => {
    const files = SITE_BASE_IDS.map((id) => loadSiteBase(id));
    expect(files[0]["index.html"]).not.toEqual(files[1]["index.html"]);
    expect(files[0]["index.html"]).not.toEqual(files[2]["index.html"]);
    expect(files[1]["index.html"]).not.toEqual(files[2]["index.html"]);
    expect(files[0]["index.html"]).toMatch(/base-editorial/);
    expect(files[1]["index.html"]).toMatch(/base-conversion/);
    expect(files[2]["index.html"]).toMatch(/base-premium/);
  });

  it("nenhuma base traz URL de imagem herdável", () => {
    for (const id of SITE_BASE_IDS) {
      for (const [path, content] of Object.entries(loadSiteBase(id))) {
        if (/\.html?$/i.test(path)) {
          expect(content).not.toMatch(/<img[^>]+src=["'](https?:)?\/\//i);
          expect(content).not.toMatch(/url\(\s*["']?(https?:)?\/\//i);
        }
      }
    }
  });

  it("seleção é determinística (mesmo negócio → mesma base)", () => {
    const brief = buildCreativeBrief("Studio Aurora", "Estética");
    const input = { name: "Studio Aurora", segment: "Estética", brief, briefing: { user_prompt: "experiência premium exclusiva" } };
    expect(selectSiteBase(input)).toBe(selectSiteBase(input));
    expect(selectSiteBase(input)).toBe("premium");
  });

  it("seleciona a base pelo tom/intenção (não pelo segmento)", () => {
    expect(selectSiteBase({
      name: "Mercado Bom", segment: "Loja", brief: buildCreativeBrief("Mercado Bom", "Loja"),
      briefing: { user_prompt: "quero oferta e agendamento rápido pelo WhatsApp" },
    })).toBe("conversion");
    expect(selectSiteBase({
      name: "Escritório Alfa", segment: "Advocacia", brief: buildCreativeBrief("Escritório Alfa", "Advocacia"),
      briefing: { user_prompt: "site institucional, sóbrio e tradicional" },
    })).toBe("editorial");
    expect(selectSiteBase({
      name: "Atelier Nobre", segment: "Arquitetura", brief: buildCreativeBrief("Atelier Nobre", "Arquitetura"),
      briefing: { user_prompt: "quero uma experiência premium e imersiva" },
    })).toBe("premium");
  });

  it("duas cópias da mesma base são independentes (isolamento)", () => {
    const a = loadSiteBase("premium");
    const b = loadSiteBase("premium");
    a["index.html"] = "MUTADO";
    expect(b["index.html"]).not.toBe("MUTADO");
    expect(loadSiteBase("premium")["index.html"]).not.toBe("MUTADO");
  });

  it("prepareBaseWorkspace aplica os tokens da direção criativa em cada projeto", () => {
    const briefA = buildCreativeBrief("Clínica Vida", "Clínicas");
    const briefB = buildCreativeBrief("Studio Zen", "Clínicas");
    const a = prepareBaseWorkspace("editorial", { name: "Clínica Vida", segment: "Clínicas" }, briefA);
    const b = prepareBaseWorkspace("editorial", { name: "Studio Zen", segment: "Clínicas" }, briefB);
    expect(a["src/site.css"]).toContain(briefA.tokens.palette.primary);
    expect(b["src/site.css"]).toContain(briefB.tokens.palette.primary);
    // Nenhum marcador {{...}} residual e nenhuma imagem externa herdável.
    for (const content of Object.values(a)) expect(content).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
    expect(a["index.html"]).not.toMatch(/<img[^>]+src=["'](https?:)?\/\//i);
  });

  it("conteúdo e imagens são do cliente, não da base", () => {
    const files = prepareBaseWorkspace(
      "conversion",
      { name: "Pet Amigo", segment: "Pet Shop", city: "São Gonçalo", state: "RJ" },
      buildCreativeBrief("Pet Amigo", "Pet Shop"),
    );
    const html = files["index.html"];
    expect(html).toContain("Pet Amigo");
    expect(html).toContain("São Gonçalo");
    expect(html).not.toContain("{{");
    expect(html).not.toMatch(/<img[^>]+src=["'](https?:)?\/\//i);
  });

  it("cópias de clientes diferentes a partir da MESMA base não se misturam", () => {
    const a = prepareBaseWorkspace("conversion", { name: "Empresa A", segment: "Loja", city: "Barueri" }, buildCreativeBrief("Empresa A", "Loja"));
    const b = prepareBaseWorkspace("conversion", { name: "Empresa B", segment: "Loja", city: "Suzano" }, buildCreativeBrief("Empresa B", "Loja"));
    expect(a["index.html"]).toContain("Empresa A");
    expect(a["index.html"]).not.toContain("Empresa B");
    expect(b["index.html"]).toContain("Empresa B");
    expect(b["index.html"]).not.toContain("Empresa A");
  });

  it("a diretiva de missão exige adaptação completa (identidade/conteúdo/imagens)", () => {
    const d = formatBaseDirective("premium");
    expect(d).toMatch(/NÃO é o site final/);
    expect(d).toMatch(/IDENTIDADE VISUAL/);
    expect(d).toMatch(/CONTEÚDO PRÓPRIO/);
    expect(d).toMatch(/IMAGENS PRÓPRIAS/);
    expect(d).toMatch(/ESTRUTURA É LIVRE/);
    expect(d).toMatch(/MAPA/);
  });

  it("buildGenerationSeed injeta a base só quando o workspace está vazio", () => {
    const brief = buildCreativeBrief("Padaria Sol", "Padaria");
    const business = { name: "Padaria Sol", segment: "Padaria", city: "Barueri", state: "SP" };

    const fresh = buildGenerationSeed({ files: {}, business, brief, briefing: { user_prompt: "oferta e agendamento" } });
    expect(fresh.baseUsed).toBe("conversion");
    expect(Object.keys(fresh.seed)).toContain("index.html");
    expect(fresh.seed["index.html"]).toContain("Padaria Sol");
    expect(fresh.seed["index.html"]).not.toContain("{{");

    // Arquivos existentes SEMPRE têm precedência (nunca sobrescreve).
    const existing = { "index.html": "<html>meu site</html>" };
    const kept = buildGenerationSeed({ files: existing, business, brief });
    expect(kept.baseUsed).toBeNull();
    expect(kept.seed["index.html"]).toContain("meu site");

    // Desabilitável por flag.
    const off = buildGenerationSeed({ files: {}, business, brief, enabled: false });
    expect(off.baseUsed).toBeNull();
    expect(Object.keys(off.seed)).toHaveLength(0);
  });
});
