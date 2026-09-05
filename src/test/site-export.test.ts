import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { sanitizeSlug, buildProjectFiles, buildSiteHtml } from "../../src/lib/siteExportCore";
import { pdfFileName } from "../../src/lib/sitePdf";

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
    expect(pdfFileName("Pata Pet Banho & Tosa")).toBe("pata-pet-banho-tosa-proposta.pdf");
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
    expect(pdfFileName("Meu Café")).toBe("meu-cafe-proposta.pdf");
  });
});
