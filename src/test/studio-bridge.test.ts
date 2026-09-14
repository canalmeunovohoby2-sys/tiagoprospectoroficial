import { describe, it, expect } from "vitest";
import { annotateHtmlSource, resolveElementSource, formatElementContextForAgent } from "@/lib/studio/sourceMap";
import {
  STUDIO_BRIDGE_CHANNEL, STUDIO_BRIDGE_VERSION,
  parseStudioBridgeChildMessage, type StudioElementDescriptor,
} from "@/lib/studio/bridgeProtocol";
import { buildPreviewBridgeScript, injectStudioBridge } from "@/lib/studio/previewHelper";
import { prepareProjectPreview } from "@/lib/projectPreviewRuntime";

const HTML = [
  "<!doctype html>",             // 1
  "<html>",                       // 2
  "<head>",                       // 3
  "<style>.hero{color:red}</style>", // 4
  "</head>",                      // 5
  '<body id="top">',              // 6
  '<section class="hero">',       // 7
  "<h1>Clínica Bella</h1>",       // 8
  '<a title="x > y" href="#">ir</a>', // 9
  "</section>",                   // 10
  "</body>",                      // 11
  "</html>",                      // 12
].join("\n");

function descriptor(over: Partial<StudioElementDescriptor> = {}): StudioElementDescriptor {
  return {
    tagName: "section",
    classes: [],
    attributes: {},
    selector: "section",
    path: "html:1>body:1>section:1",
    rect: { x: 0, y: 20, width: 320, height: 120 },
    ...over,
  };
}

describe("Fase 4 · annotateHtmlSource (data-pfsrc)", () => {
  it("anota tags de abertura com a linha ORIGINAL", () => {
    const out = annotateHtmlSource(HTML, "cliente/index.html");
    expect(out).toContain('<section class="hero" data-pfsrc="cliente/index.html:7">');
    expect(out).toContain('<h1 data-pfsrc="cliente/index.html:8">Clínica Bella</h1>');
  });

  it("não anota dentro de <style>/<script> nem duplica anotação", () => {
    const out = annotateHtmlSource(HTML, "cliente/index.html");
    expect(out).not.toContain('data-pfsrc="cliente/index.html:4"'); // linha do <style> (raw text)
    const twice = annotateHtmlSource(out, "cliente/index.html");
    expect((twice.match(/data-pfsrc=/g) ?? []).length).toBe((out.match(/data-pfsrc=/g) ?? []).length);
  });

  it("respeita `>` dentro de aspas em atributos", () => {
    const out = annotateHtmlSource(HTML, "cliente/index.html");
    expect(out).toContain('<a title="x > y" href="#" data-pfsrc="cliente/index.html:9">');
  });

  it("prepareProjectPreview com annotateSource inclui data-pfsrc na cópia de preview", () => {
    const prepared = prepareProjectPreview({ "cliente/index.html": HTML }, { annotateSource: true });
    expect(prepared.ok || prepared.document).toBeTruthy();
    expect(prepared.document).toContain("data-pfsrc=");
    // sem a opção, NÃO anota (generated_code/legado intactos)
    const plain = prepareProjectPreview({ "cliente/index.html": HTML });
    expect(plain.document).not.toContain("data-pfsrc=");
  });
});

describe("Fase 4 · resolveElementSource (nunca chuta)", () => {
  const files = { "cliente/index.html": HTML, "cliente/src/site.css": ".hero{color:red}" };

  it("usa data-pfsrc como origem exata", () => {
    const src = resolveElementSource(files, descriptor({ pfsrc: "cliente/index.html:7" }));
    expect(src).toEqual({ status: "resolved", file: "cliente/index.html", line: 7, column: undefined, confidence: "exact" });
  });

  it("pfsrc com arquivo inexistente não é aceito (preview antigo)", () => {
    const src = resolveElementSource(files, descriptor({ pfsrc: "cliente/nao-existe.html:3", id: "top" }));
    // cai no matcher por id (#top está no body, linha 6)
    expect(src.status).toBe("resolved");
    expect(src.line).toBe(6);
  });

  it("matcher por id e por classe resolve heuristicamente", () => {
    expect(resolveElementSource(files, descriptor({ id: "top" })).line).toBe(6);
    expect(resolveElementSource(files, descriptor({ classes: ["hero"] })).line).toBe(7);
  });

  it("matcher por texto quando não há id/classe", () => {
    const src = resolveElementSource(files, descriptor({ text: "Clínica Bella", classes: [] }));
    expect(src.status).toBe("resolved");
    expect(src.line).toBe(8);
  });

  it("desconhecido → unresolved (com motivo), sem apontar arquivo", () => {
    const src = resolveElementSource(files, descriptor({ classes: ["inexistente-classe"] }));
    expect(src.status).toBe("unresolved");
    expect(src.file).toBeUndefined();
    expect(src.reason).toBeTruthy();
  });

  it("React/TSX sem Fiber → unsupported (não finge resolved)", () => {
    const tsx = { "cliente/src/App.tsx": 'export default function App(){ return <section className="hero">x</section>; }' };
    const src = resolveElementSource(tsx, descriptor({ classes: ["hero"] }));
    expect(src.status).toBe("unsupported");
    expect(src.file).toBe("cliente/src/App.tsx");
  });
});

describe("Fase 4 · protocolo do bridge", () => {
  const base = { channel: STUDIO_BRIDGE_CHANNEL, version: STUDIO_BRIDGE_VERSION, token: "tok-1" };

  it("aceita element_selected válido com token correto", () => {
    const msg = { ...base, type: "element_selected", element: descriptor({ pfsrc: "cliente/index.html:7" }), viewport: { device: "desktop", width: 1280, height: 760 } };
    const parsed = parseStudioBridgeChildMessage(msg, "tok-1");
    expect(parsed?.type).toBe("element_selected");
  });

  it("rejeita canal/versão/token/type inválidos", () => {
    expect(parseStudioBridgeChildMessage({ ...base, channel: "outro", type: "preview_ready", capabilities: [] }, "tok-1")).toBeNull();
    expect(parseStudioBridgeChildMessage({ ...base, version: 999, type: "preview_ready", capabilities: [] }, "tok-1")).toBeNull();
    expect(parseStudioBridgeChildMessage({ ...base, token: "outro", type: "preview_ready", capabilities: [] }, "tok-1")).toBeNull();
    expect(parseStudioBridgeChildMessage({ ...base, type: "hack" }, "tok-1")).toBeNull();
    expect(parseStudioBridgeChildMessage(null, "tok-1")).toBeNull();
  });

  it("rejeita payload de elemento inválido", () => {
    const bad = { ...base, type: "element_selected", element: { tagName: "div" }, viewport: {} };
    expect(parseStudioBridgeChildMessage(bad, "tok-1")).toBeNull();
  });

  it("valida console e preview_error", () => {
    expect(parseStudioBridgeChildMessage({ ...base, type: "console", level: "error", message: "x" }, "tok-1")?.type).toBe("console");
    expect(parseStudioBridgeChildMessage({ ...base, type: "console", level: "nope", message: "x" }, "tok-1")).toBeNull();
    expect(parseStudioBridgeChildMessage({ ...base, type: "preview_error", message: "boom" }, "tok-1")?.type).toBe("preview_error");
  });
});

describe("Fase 4 · helper injetado", () => {
  it("script contém canal/versão/token e não quebra o documento", () => {
    const script = buildPreviewBridgeScript({ token: "abc123", device: "mobile" });
    expect(script).toContain(STUDIO_BRIDGE_CHANNEL);
    expect(script).toContain(String(STUDIO_BRIDGE_VERSION));
    expect(script).toContain("abc123");
    expect(script).not.toContain("</script>");
    expect(script).toContain("element_selected");
    expect(script).toContain("inspect_set");
  });

  it("injectStudioBridge insere antes de </body>", () => {
    const html = "<html><body><h1>x</h1></body></html>";
    const out = injectStudioBridge(html, { token: "t", device: "desktop" });
    expect(out.indexOf("<script>")).toBeLessThan(out.indexOf("</body>"));
    expect(out).toContain("t");
  });
});

describe("Fase 4 · contexto estruturado para o agente", () => {
  it("inclui tag/seletor/origem/texto/pedido", () => {
    const ctx = formatElementContextForAgent({
      tagName: "section",
      selector: "body > section.hero",
      classes: ["hero"],
      text: "Clínica Bella",
      sourceLocation: { status: "resolved", file: "cliente/index.html", line: 7 },
      rect: { x: 0, y: 20, width: 320, height: 120 },
    });
    expect(ctx).toContain("[ELEMENTO SELECIONADO NO PREVIEW]");
    expect(ctx).toContain("origem: cliente/index.html:7");
    expect(ctx).toContain("[PEDIDO]");
  });

  it("origem não resolvida é declarada, não inventada", () => {
    const ctx = formatElementContextForAgent({ tagName: "div", sourceLocation: { status: "unresolved", reason: "x" } });
    expect(ctx).toContain("origem não determinada");
  });
});
