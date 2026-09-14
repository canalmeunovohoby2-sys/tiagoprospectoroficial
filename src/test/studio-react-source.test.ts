import { describe, it, expect } from "vitest";
import { normalizeReactSourcePath, descriptorFromReactSelection } from "@/lib/studio/reactSource";
import { resolveElementSource } from "@/lib/studio/sourceMap";
import { parseStudioBridgeChildMessage, STUDIO_BRIDGE_CHANNEL, STUDIO_BRIDGE_VERSION } from "@/lib/studio/bridgeProtocol";
import { buildReactVisualHelperScript, injectReactVisualHelper } from "@/lib/studio/reactVisualHelper";

describe("C3 · normalização de _debugSource", () => {
  it("normaliza caminhos do Vite/absolutos para o workspace", () => {
    expect(normalizeReactSourcePath("/src/App.tsx")).toBe("src/App.tsx");
    expect(normalizeReactSourcePath("src/App.tsx")).toBe("src/App.tsx");
    expect(normalizeReactSourcePath("file:///home/u/proj/src/components/Hero.tsx")).toBe("src/components/Hero.tsx");
    expect(normalizeReactSourcePath("/home/u/proj/src/Hero.tsx?t=123")).toBe("src/Hero.tsx");
  });
  it("recusa caminho sensível/inseguro", () => {
    expect(normalizeReactSourcePath("../segredo.tsx")).toBeNull();
    expect(normalizeReactSourcePath(".env")).toBeNull();
    expect(normalizeReactSourcePath("")).toBeNull();
  });
});

describe("C3 · descritor de seleção React", () => {
  it("constrói reactSource com componente/linha", () => {
    const d = descriptorFromReactSelection({
      tagName: "BUTTON", className: "btn primary", innerText: "  Enviar  ",
      source: { fileName: "/src/components/Hero.tsx", lineNumber: 42, columnNumber: 7 },
      componentName: "Hero", rect: { x: 1, y: 2, width: 3, height: 4 },
    });
    expect(d.tagName).toBe("button");
    expect(d.classes).toEqual(["btn", "primary"]);
    expect(d.text).toBe("Enviar");
    expect(d.reactSource).toEqual({ file: "src/components/Hero.tsx", line: 42, column: 7, componentName: "Hero" });
  });
  it("sem source → sem reactSource (fallback heurístico)", () => {
    const d = descriptorFromReactSelection({ tagName: "div", className: "x" });
    expect(d.reactSource).toBeUndefined();
  });
});

describe("C3 · resolveElementSource com reactSource", () => {
  const files = { "src/components/Hero.tsx": "export function Hero(){return <button>Enviar</button>}" };
  it("resolve exato quando o arquivo existe", () => {
    const src = resolveElementSource(files, {
      tagName: "button", classes: [], attributes: {}, selector: "button", path: "",
      rect: { x: 0, y: 0, width: 1, height: 1 },
      reactSource: { file: "src/components/Hero.tsx", line: 1, componentName: "Hero" },
    });
    expect(src.status).toBe("resolved");
    expect(src.file).toBe("src/components/Hero.tsx");
    expect(src.line).toBe(1);
    expect(src.confidence).toBe("exact");
  });
  it("unsupported quando o componente está fora do workspace", () => {
    const src = resolveElementSource(files, {
      tagName: "div", classes: [], attributes: {}, selector: "div", path: "",
      rect: { x: 0, y: 0, width: 1, height: 1 },
      reactSource: { file: "src/Outro.tsx", line: 3 },
    });
    expect(src.status).toBe("unsupported");
  });
});

describe("C3 · protocolo aceita reactSource", () => {
  it("valida element_selected com reactSource", () => {
    const msg = parseStudioBridgeChildMessage({
      channel: STUDIO_BRIDGE_CHANNEL, version: STUDIO_BRIDGE_VERSION, token: "t", type: "element_selected",
      element: {
        tagName: "button", classes: ["btn"], attributes: {}, selector: "button", path: "",
        rect: { x: 0, y: 0, width: 1, height: 1 },
        reactSource: { file: "src/App.tsx", line: 10, componentName: "App" },
      },
      viewport: { device: "desktop", width: 1280, height: 720 },
    }, "t");
    expect(msg?.type).toBe("element_selected");
  });
  it("rejeita reactSource malformado", () => {
    const msg = parseStudioBridgeChildMessage({
      channel: STUDIO_BRIDGE_CHANNEL, version: STUDIO_BRIDGE_VERSION, token: "t", type: "element_selected",
      element: { tagName: "button", classes: [], attributes: {}, selector: "button", path: "", rect: { x: 0, y: 0, width: 1, height: 1 }, reactSource: { line: 1 } },
      viewport: { device: "desktop", width: 1280, height: 720 },
    }, "t");
    expect(msg).toBeNull();
  });
});

describe("C3 · helper injetado (projeção)", () => {
  const base = { "index.html": '<html><body><div id="root"></div></body></html>', "src/App.tsx": "export default function App(){return null}" };

  it("injeta o script antes de </body> e não contém </script> literal", () => {
    const out = injectReactVisualHelper(base, { token: "tok" });
    expect(out["index.html"]).toContain("prospector-react-visual-helper");
    expect(out["index.html"].indexOf("prospector-react-visual-helper")).toBeLessThan(out["index.html"].indexOf("</body>"));
    const script = buildReactVisualHelperScript({ token: "tok" });
    expect(script).toContain("_debugSource");
    expect(script).not.toContain("</script>");
  });

  it("é idempotente e não altera os demais arquivos", () => {
    const once = injectReactVisualHelper(base, { token: "tok" });
    const twice = injectReactVisualHelper(once, { token: "tok" });
    expect(twice).toBe(once);
    expect(once["src/App.tsx"]).toBe(base["src/App.tsx"]);
    // NÃO muta o mapa original (generated_code permanece limpo)
    expect(base["index.html"]).not.toContain("prospector-react-visual-helper");
  });

  it("sem index.html devolve o mapa inalterado", () => {
    const noHtml = { "src/App.tsx": "x" };
    expect(injectReactVisualHelper(noHtml, { token: "t" })).toBe(noHtml);
  });
});
