import { describe, it, expect } from "vitest";
import { applyVisualEdit, verifyVisualEdit, type VisualEditTarget } from "@/lib/studio/visualEdit";
import { resolveElementSource, buildVisualAgentInstruction } from "@/lib/studio/sourceMap";
import { prepareProjectPreview } from "@/lib/projectPreviewRuntime";
import type { StudioFileMap } from "@/lib/studio/types";
import type { StudioElementDescriptor } from "@/lib/studio/bridgeProtocol";

const HTML = [
  "<!doctype html>",                                                                     // 1
  "<html>",                                                                              // 2
  "<head>",                                                                              // 3
  '<link rel="stylesheet" href="./src/site.css">',                                       // 4
  "</head>",                                                                             // 5
  "<body>",                                                                              // 6
  '<section class="hero">',                                                              // 7
  '<h1 data-pfsrc="cliente/index.html:8">Clínica Bella</h1>',                            // 8
  '<a data-pfsrc="cliente/index.html:9" href="#contato" class="btn">Fale conosco</a>',   // 9
  '<img data-pfsrc="cliente/index.html:10" src="./assets/logo.png" alt="logo">',          // 10
  '<span data-pfsrc="cliente/index.html:11" style="color:#333;font-weight:400">texto</span>', // 11
  "</section>",                                                                          // 12
  "</body>",                                                                             // 13
  "</html>",                                                                             // 14
].join("\n");

function baseFiles(): StudioFileMap {
  return {
    "cliente/index.html": HTML,
    "cliente/src/site.css": ".hero{background:#fff}\n.btn{background:#111;color:#fff;padding:8px 16px}\n",
  };
}

function target(line: number, tag: string, over: Partial<VisualEditTarget> = {}): VisualEditTarget {
  return {
    selector: tag,
    tagName: tag,
    sourceLocation: { status: "resolved", file: "cliente/index.html", line, confidence: "exact" },
    ...over,
  };
}

describe("Fase 5 · edição de TEXTO no código real", () => {
  it("altera o texto do elemento correto e preserva o resto do arquivo", () => {
    const files = baseFiles();
    const t = target(8, "h1", { text: "Clínica Bella" });
    const res = applyVisualEdit(files, t, { kind: "text", text: "Bella Odonto" });
    expect(res.ok).toBe(true);
    expect(res.file).toBe("cliente/index.html");
    expect(res.mode).toBe("html-text");
    const updated = res.files!["cliente/index.html"];
    expect(updated).toContain("<h1 data-pfsrc=\"cliente/index.html:8\">Bella Odonto</h1>");
    // preserva os demais elementos/linhas
    expect(updated).toContain('<a data-pfsrc="cliente/index.html:9" href="#contato" class="btn">Fale conosco</a>');
    expect(updated).toContain('<img data-pfsrc="cliente/index.html:10"');
    // não muta o mapa original
    expect(files["cliente/index.html"]).toContain("Clínica Bella");
    // evidência
    expect(verifyVisualEdit(res.files!, t, { kind: "text", text: "Bella Odonto" }, res).ok).toBe(true);
  });

  it("recusa quando o conteúdo atual não corresponde (preview desatualizado)", () => {
    const files = baseFiles();
    const res = applyVisualEdit(files, target(8, "h1", { text: "Outro texto" }), { kind: "text", text: "X" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBeTruthy();
  });

  it("recusa texto em elemento com tags filhas (estrutura)", () => {
    const files = baseFiles();
    files["cliente/index.html"] = files["cliente/index.html"].replace(
      '<h1 data-pfsrc="cliente/index.html:8">Clínica Bella</h1>',
      '<h1 data-pfsrc="cliente/index.html:8"><b>Clínica</b> Bella</h1>',
    );
    const res = applyVisualEdit(files, target(8, "h1", { text: "Clínica Bella" }), { kind: "text", text: "X" });
    expect(res.ok).toBe(false);
  });
});

describe("Fase 5 · edição de ESTILO no código real", () => {
  it("aplica na REGRA CSS da classe (sem duplicar CSS) e preserva as demais propriedades", () => {
    const files = baseFiles();
    const t = target(9, "a", { classes: ["btn"] });
    const res = applyVisualEdit(files, t, { kind: "style", changes: [{ property: "background-color", value: "#e11d48" }] });
    expect(res.ok).toBe(true);
    expect(res.mode).toBe("css-rule");
    expect(res.file).toBe("cliente/src/site.css");
    const css = res.files!["cliente/src/site.css"];
    expect(css).toContain("background-color: #e11d48");
    expect(css).toContain("color:#fff"); // outras propriedades preservadas
    expect(css).toContain("padding:8px 16px");
    // HTML intocado
    expect(res.files!["cliente/index.html"]).toBe(files["cliente/index.html"]);
    expect(verifyVisualEdit(res.files!, t, { kind: "style", changes: [{ property: "background-color", value: "#e11d48" }] }, res).ok).toBe(true);
  });

  it("faz merge no `style` inline existente preservando as demais declarações", () => {
    const files = baseFiles();
    const t = target(11, "span");
    const res = applyVisualEdit(files, t, { kind: "style", changes: [{ property: "color", value: "#ff0000" }] });
    expect(res.ok).toBe(true);
    expect(res.mode).toBe("html-inline");
    const html = res.files!["cliente/index.html"];
    expect(html).toContain("color: #ff0000");
    expect(html).toContain("font-weight:400");
    expect(verifyVisualEdit(res.files!, t, { kind: "style", changes: [{ property: "color", value: "#ff0000" }] }, res).ok).toBe(true);
  });

  it("sem regra de classe cria `style` inline no elemento (uma vez só — idempotente)", () => {
    const files = baseFiles();
    const t = target(8, "h1");
    const plan = { kind: "style" as const, changes: [{ property: "font-size", value: "40px" }] };
    const first = applyVisualEdit(files, t, plan);
    expect(first.ok).toBe(true);
    expect(first.mode).toBe("html-inline");
    const second = applyVisualEdit(first.files!, t, plan);
    const html = second.files!["cliente/index.html"];
    expect((html.match(/font-size\s*:/gi) ?? []).length).toBe(1);
  });

  it("objeto-fit/position em <img> também aplicam no código", () => {
    const files = baseFiles();
    const t = target(10, "img");
    const res = applyVisualEdit(files, t, { kind: "style", changes: [{ property: "object-fit", value: "cover" }, { property: "object-position", value: "center top" }] });
    expect(res.ok).toBe(true);
    const html = res.files!["cliente/index.html"];
    expect(html).toContain("object-fit: cover");
    expect(html).toContain("object-position: center top");
  });

  it("escopo por breakpoint NÃO é aplicado direto (vai para o Coder)", () => {
    const res = applyVisualEdit(baseFiles(), target(8, "h1", { scope: "mobile" }), { kind: "style", changes: [{ property: "font-size", value: "28px" }] });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/breakpoint/i);
  });
});

describe("Fase 5 · atributos (links/imagens)", () => {
  it("altera href do link correto", () => {
    const files = baseFiles();
    const t = target(9, "a", { classes: ["btn"] });
    const res = applyVisualEdit(files, t, { kind: "attribute", attribute: { name: "href", value: "https://wa.me/551199999999" } });
    expect(res.ok).toBe(true);
    expect(res.files!["cliente/index.html"]).toContain('href="https://wa.me/551199999999"');
    expect(res.files!["cliente/index.html"]).toContain("class=\"btn\"");
  });
});

describe("Fase 5 · origem ambígua/não resolvida nunca é chutada", () => {
  it("duas correspondências para a mesma classe → bloqueia edição direta", () => {
    const files = baseFiles();
    files["cliente/index.html"] = files["cliente/index.html"].replace(
      "</section>",
      '<a class="btn">Outro</a>\n</section>',
    );
    // sem sourceLocation e sem pfsrc → cai no matcher por classe (agora ambíguo)
    const res = applyVisualEdit(files, { selector: "a.btn", tagName: "a", classes: ["btn"] }, { kind: "style", changes: [{ property: "color", value: "#000" }] });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/ambíguo/i);
  });

  it("origem unresolved → bloqueia edição direta", () => {
    const res = applyVisualEdit(baseFiles(), { selector: "div", tagName: "div", classes: ["nao-existe"], sourceLocation: { status: "unresolved", reason: "x" } }, { kind: "style", changes: [{ property: "color", value: "#000" }] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBeTruthy();
  });

  it("arquivo de origem ausente → bloqueia", () => {
    const res = applyVisualEdit(baseFiles(), target(8, "h1", { sourceLocation: { status: "resolved", file: "cliente/outro.html", line: 8 } }), { kind: "text", text: "x" });
    expect(res.ok).toBe(false);
  });
});

describe("Fase 5 · ciclo código → Preview (persistência)", () => {
  it("a alteração aplicada aparece no documento de preview e sobrevive à releitura", () => {
    const files = baseFiles();
    const res = applyVisualEdit(files, target(8, "h1", { text: "Clínica Bella" }), { kind: "text", text: "Bella Odonto" });
    expect(res.ok).toBe(true);
    const updated = res.files!;
    const preview = prepareProjectPreview(updated, { annotateSource: true });
    expect(preview.document).toContain("Bella Odonto");
    expect(preview.document).not.toContain("Clínica Bella</h1>");
    // persistência: ao reaplicar a partir do mapa atualizado, o texto permanece
    const styleRes = applyVisualEdit(updated, target(8, "h1"), { kind: "style", changes: [{ property: "color", value: "#0ea5e9" }] });
    expect(styleRes.files!["cliente/index.html"]).toContain("Bella Odonto");
    expect(styleRes.files!["cliente/index.html"]).toContain("color: #0ea5e9");
  });

  it("integra Fase 4 → 5: pfsrc anotado resolve e edita a linha correta", () => {
    const files = baseFiles();
    const preview = prepareProjectPreview(files, { annotateSource: true });
    const match = /<h1 data-pfsrc="([^"]+)"/.exec(preview.document ?? "");
    expect(match).toBeTruthy();
    const descriptor: StudioElementDescriptor = {
      tagName: "h1", classes: [], attributes: {}, selector: "h1", path: "html>body>section>h1",
      rect: { x: 0, y: 0, width: 100, height: 40 }, text: "Clínica Bella", pfsrc: match![1],
    };
    const src = resolveElementSource(files, descriptor);
    expect(src).toEqual({ status: "resolved", file: "cliente/index.html", line: 8, column: undefined, confidence: "exact" });
    const res = applyVisualEdit(files, { selector: descriptor.selector, tagName: "h1", text: descriptor.text, sourceLocation: src }, { kind: "text", text: "Bella Odonto" });
    expect(res.ok).toBe(true);
    expect(res.files!["cliente/index.html"]).toContain("Bella Odonto");
  });
});

describe("Fase 5 · contexto estruturado para o Coder", () => {
  it("inclui arquivo/linha/viewport/propriedades antes-depois e instruções de preservação", () => {
    const instruction = buildVisualAgentInstruction({
      selection: {
        selector: "a.btn",
        tagName: "a",
        text: "Fale conosco",
        classes: ["btn"],
        attributes: { href: "#contato" },
        rect: { x: 10, y: 20, width: 120, height: 40 },
        sourceLocation: { status: "resolved", file: "cliente/index.html", line: 9 },
      },
      request: "Deixe este botão azul.",
      device: "mobile",
      scope: "mobile",
      changes: [{ property: "background-color", value: "#2563eb", before: "#111" }],
    });
    expect(instruction).toContain("origem: cliente/index.html:9");
    expect(instruction).toContain("viewport: mobile");
    expect(instruction).toContain("escopo: mobile");
    expect(instruction).toContain("background-color: #2563eb (antes: #111)");
    expect(instruction).toContain("edit_file");
    expect(instruction).toContain("Deixe este botão azul.");
  });
});
