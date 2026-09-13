import { describe, it, expect } from "vitest";
import {
  ensureClientFavicon,
  clientInitials,
  hasProspectorFaviconLeak,
} from "../src/site-favicon";
import { prepareBaseWorkspace } from "../src/site-bases";

const HTML = (head: string) =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">${head}</head><body><h1>Oi</h1></body></html>`;
const SITE = { "index.html": HTML("<title>Cliente</title>"), "src/site.css": "body{}" };

describe("favicon do cliente — identidade do site (nunca o do Prospector)", () => {
  it("clientInitials extrai 1–2 letras úteis", () => {
    expect(clientInitials("Studio Aurora")).toBe("SA");
    expect(clientInitials("Pizzaria do Zé")).toBe("PZ");
    expect(clientInitials("Academia")).toBe("AC");
    expect(clientInitials("")).toBe("•");
  });

  it("sem logo → monograma do cliente (cor da paleta) + link relativo; asset existe", () => {
    const r = ensureClientFavicon({ ...SITE }, { name: "Studio Aurora", segment: "Design" }, { primary: "#0f766e" });
    expect(r.source).toBe("monogram");
    expect(r.href).toBe("./assets/favicon.svg");
    expect(r.files["assets/favicon.svg"]).toContain("SA");
    expect(r.files["assets/favicon.svg"]).toContain("#0f766e");
    expect(r.files["index.html"]).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\.\/assets\/favicon\.svg"/);
    // o asset referenciado realmente existe no projeto (sem 404)
    expect(r.files["assets/favicon.svg"]).toBeTruthy();
    expect(hasProspectorFaviconLeak(r.files)).toBe(false);
  });

  it("com logo do cliente → usa o SÍMBOLO existente (não gera outra imagem)", () => {
    const files = { ...SITE, "assets/brand/symbol.svg": "<svg/>", "assets/brand/primary.svg": "<svg/>" };
    const r = ensureClientFavicon(files, { name: "Studio Aurora" });
    expect(r.source).toBe("logo");
    expect(r.href).toBe("./assets/brand/symbol.svg");
    expect(r.files["assets/favicon.svg"]).toBeUndefined();
  });

  it("remove link herdado (Prospector/absoluto/ico) e injeta o do cliente; corrige título vazado", () => {
    const leaked = {
      "index.html": HTML(
        '<title>LeadHunter Brasil</title><link rel="icon" href="/favicon.svg"><link rel="shortcut icon" href="https://prospector.app/favicon.ico">',
      ),
    };
    const r = ensureClientFavicon(leaked, { name: "Pet Amigo", segment: "Pet shop" });
    const html = r.files["index.html"];
    expect(html).not.toMatch(/prospector|leadhunter/i);
    expect(html).not.toMatch(/href="\/favicon/);
    expect(html).toMatch(/href="\.\/assets\/favicon\.svg"/);
    expect(html).toContain("<title>Pet Amigo — Pet shop</title>");
    expect(hasProspectorFaviconLeak(r.files)).toBe(false);
  });

  it("dois projetos têm favicon ISOLADO (A ≠ B, sem referência cruzada)", () => {
    const a = ensureClientFavicon({ ...SITE }, { name: "Clínica Sorriso", segment: "Odontologia" }, { primary: "#0ea5e9" });
    const b = ensureClientFavicon({ ...SITE }, { name: "Pizzaria Bella", segment: "Pizzaria" }, { primary: "#dc2626" });
    expect(a.files["assets/favicon.svg"]).toContain("CS");
    expect(b.files["assets/favicon.svg"]).toContain("PB");
    expect(a.files["assets/favicon.svg"]).not.toBe(b.files["assets/favicon.svg"]);
    expect(JSON.stringify(a.files)).not.toContain("#dc2626");
    expect(JSON.stringify(b.files)).not.toContain("#0ea5e9");
  });

  it("ORIGEM: prepareBaseWorkspace já entrega favicon do cliente para as 3 bases", () => {
    for (const id of ["editorial", "conversion", "premium"] as const) {
      const seed = prepareBaseWorkspace(id, { name: "Studio Aurora", segment: "Design" });
      expect(seed["index.html"], id).toMatch(/rel="icon"[^>]*href="\.\/assets\/favicon\.svg"/);
      expect(seed["assets/favicon.svg"], id).toBeTruthy();
      expect(hasProspectorFaviconLeak(seed), id).toBe(false);
    }
  });
});
