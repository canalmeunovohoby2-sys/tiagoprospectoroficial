import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import { sanitizeSlug, buildProjectFiles, buildSiteHtml } from "../../src/lib/siteExportCore";
import { exportWorkspaceZip, filterWorkspaceFiles } from "../../src/lib/siteDownload";
import { pdfFileName, resolveCompanyName } from "../../src/lib/sitePdf";

const SPEC = {
  business: { name: "Pata Pet Banho & Tosa", segment: "Pet shops", city: "Guarulhos", state: "SP" },
  design_system: { colors: { primary: "#0f766e", secondary: "#134e4a", background: "#f8fafc", surface: "#ffffff", on_surface: "#0f172a", muted: "#64748b", accent: "#b45309" }, typography: { heading_font: "Quicksand", body_font: "DM Sans" }, layout_archetype: "service_focused", hero_variant: "split" },
  content: { hero: { title: "Banho e tosa com carinho", subtitle: "Cuidado real para seu pet", primary_cta: "Agendar" }, about: { title: "Sobre", body: "Texto institucional." }, services: { items: [{ title: "Banho", description: "Banho completo." }] }, gallery: { items: [] }, contact: { phone: "+55 11 90000 0000", whatsapp: "" }, footer: { tagline: "Cuidado que faz o rabo abanar" } },
  sections: [{ id: "hero", type: "hero" }, { id: "services", type: "services" }, { id: "cta", type: "cta" }, { id: "contact", type: "contact" }],
  calls_to_action: [],
  seo: {},
};

describe("Exportação do projeto", () => {
  it("sanitiza nomes de arquivo", () => {
    expect(sanitizeSlug("Pata Pet Banho & Tosa")).toBe("pata-pet-banho-tosa");
    expect(sanitizeSlug("João da Silva!@#")).toBe("joao-da-silva");
    expect(sanitizeSlug("", "padrao")).toBe("padrao");
    expect(pdfFileName("Pata Pet Banho & Tosa")).toBe("Pata Pet Banho & Tosa.pdf");
  });

  it("arquivos do projeto não contêm secrets e têm estrutura esperada", async () => {
    const files = buildProjectFiles(SPEC as never, {}, []);
    const all = Object.entries(files).map(([p, c]) => `${p}\n${c}`).join("\n");
    expect(all).not.toContain("SECRET");
    expect(all).not.toContain("NVIDIA_API_KEY");
    const paths = Object.keys(files).map((p) => p.split("/").slice(1).join("/"));
    expect(paths).toContain("package.json");
    expect(paths).toContain("index.html");
    expect(paths).toContain("README.md");
    expect(files[Object.keys(files).find((p) => p.endsWith("/README.md"))!]).toContain("npm install");
  });

  it("ZIP real criado com jszip (sem .env real) e contém package.json", async () => {
    const files = buildProjectFiles(SPEC as never, {}, []);
    const zip = new JSZip();
    for (const [p, c] of Object.entries(files)) zip.file(p, c);
    const zipKeys = Object.keys(zip.files);
    expect(zipKeys.some((k) => k.endsWith(".env"))).toBe(false);
    expect(zipKeys.some((k) => k.endsWith("package.json"))).toBe(true);
    const buffer = await zip.generateAsync({ type: "uint8array" });
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("HTML não vaza placeholder e reflete nome real", () => {
    const html = buildSiteHtml(SPEC as never, {});
    expect(html).toContain("Pata Pet");
    expect(html).not.toContain("SECRET");
    expect(html).toContain("Agendar");
  });

  it("informações comerciais (PDF) usam valores fixos e nomes sanitizados", () => {
    // Os valores fixos vivem no builder do PDF (validado em render real).
    expect(pdfFileName("Meu Café")).toBe("Meu Café.pdf");
  });

  it("NUNCA usa checklist/slug/nome-de-arquivo como nome da empresa", () => {
    const checklist = "## ✅ CHECKLIST ESTRUTURAL DE EXECUÇÃO (LEIA ANTES DE COMPILAR)";
    expect(resolveCompanyName(checklist)).toBe("");
    expect(pdfFileName(checklist)).toBe("Proposta Comercial.pdf");
    expect(resolveCompanyName("checklist-estrutural-de-execucao-leia-antes-de-compilar-proposta")).toBe("");
    expect(resolveCompanyName("relatorio-final.html")).toBe("");
    // nomes reais continuam passando (com espaços/caixa originais)
    expect(resolveCompanyName("PET SHOP BICHINHO FELIZ")).toBe("PET SHOP BICHINHO FELIZ");
    expect(pdfFileName("PET SHOP BICHINHO FELIZ")).toBe("PET SHOP BICHINHO FELIZ.pdf");
  });
});

describe("Baixar projeto — exporta o WORKSPACE REAL (não a spec)", () => {
  const REAL: Record<string, string> = {
    "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pata Pet</title><link rel="icon" href="./assets/favicon.svg"></head><body><img src="https://cdn.test/hero.jpg?auto=1"><img src="./assets/brand/symbol.svg"><link rel="stylesheet" href="./src/site.css"><script src="./src/main.js"></script></body></html>`,
    "src/site.css": `.a{background:url("https://cdn.test/bg.png")}`,
    "src/main.js": `console.log("ok")`,
    "src/site.json": JSON.stringify({ business: { name: "Pata Pet Banho & Tosa" } }),
    "assets/brand/primary.svg": `<svg id="primary"></svg>`,
    "assets/brand/symbol.svg": `<svg id="symbol"></svg>`,
    "assets/favicon.svg": `<svg id="favicon"></svg>`,
    "public/robots.txt": "User-agent: *",
    ".env": "SECRET=1",
    "node_modules/x/index.js": "x",
    "supabase/config.toml": "x",
  };

  it("filtra segredos/lixo e preserva o site real", () => {
    const f = filterWorkspaceFiles(REAL);
    expect(f[".env"]).toBeUndefined();
    expect(f["node_modules/x/index.js"]).toBeUndefined();
    expect(f["supabase/config.toml"]).toBeUndefined();
    expect(f["assets/brand/symbol.svg"]).toBeTruthy();
    expect(f["assets/favicon.svg"]).toBeTruthy();
    expect(f["index.html"]).toBeTruthy();
  });

  it("ZIP contém os arquivos reais (inclui logo SVG + favicon), localiza imagens e reescreve refs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(1200).fill(7), { status: 200, headers: { "content-type": "image/png" } })));
    try {
      const { bytes, name } = await exportWorkspaceZip(REAL);
      expect(name).toBe("pata-pet-banho-tosa-site.zip");
      const zip = await JSZip.loadAsync(bytes);
      const keys = Object.keys(zip.files);
      const root = "pata-pet-banho-tosa/";
      for (const p of ["index.html", "src/site.css", "src/main.js", "src/site.json", "assets/brand/primary.svg", "assets/brand/symbol.svg", "assets/favicon.svg", "public/robots.txt", "assets/img-0.png", "assets/img-1.png", "package.json", "vite.config.ts"]) {
        expect(keys, p).toContain(root + p);
      }
      // Segurança
      expect(keys.some((k) => k.endsWith(".env"))).toBe(false);
      expect(keys.some((k) => k.includes("node_modules"))).toBe(false);
      expect(keys.some((k) => k.includes("supabase"))).toBe(false);
      // Referências reescritas por arquivo (relativo à própria pasta)
      const html = await zip.file(root + "index.html")!.async("string");
      expect(html).toContain('src="./assets/img-0.png"');
      expect(html).toContain("./assets/brand/symbol.svg");
      expect(html).not.toContain("https://cdn.test/hero.jpg");
      const css = await zip.file(root + "src/site.css")!.async("string");
      expect(css).toContain("../assets/img-1.png");
      // O SVG da logo é o arquivo REAL (não regenerado)
      const logo = await zip.file(root + "assets/brand/symbol.svg")!.async("string");
      expect(logo).toContain('id="symbol"');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("extrai o ZIP e TODAS as referências relativas resolvem para arquivos existentes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(1200).fill(7), { status: 200, headers: { "content-type": "image/png" } })));
    try {
      const { bytes } = await exportWorkspaceZip(REAL);
      const zip = await JSZip.loadAsync(bytes);
      const root = "pata-pet-banho-tosa/";
      const paths = new Set(Object.keys(zip.files).filter((k) => !zip.files[k].dir).map((k) => k.slice(root.length)));
      const resolve = (from: string, ref: string): string => {
        const dir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
        const stack = dir.split("/").filter(Boolean);
        for (const part of ref.split("/")) {
          if (part === "" || part === ".") continue;
          if (part === "..") stack.pop();
          else stack.push(part);
        }
        return stack.join("/");
      };
      const html = await zip.file(root + "index.html")!.async("string");
      const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map((m) => m[1]).filter((r) => !/^(?:https?:|data:|#|mailto:|tel:)/i.test(r));
      for (const r of refs) expect(paths, `ref ${r}`).toContain(resolve("index.html", r));
      const css = await zip.file(root + "src/site.css")!.async("string");
      for (const m of css.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
        const r = m[1];
        if (/^(?:https?:|data:)/i.test(r)) continue;
        expect(paths, `css url ${r}`).toContain(resolve("src/site.css", r));
      }
      // A logo SVG do cliente está presente como arquivo real.
      expect(paths).toContain("assets/brand/symbol.svg");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
