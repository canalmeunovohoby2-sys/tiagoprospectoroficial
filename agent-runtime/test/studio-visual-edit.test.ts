import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeWorkspace } from "../src/workspace";
import { applyDeterministicVisualEdit } from "../src/studio/visual-edit";

const APP = [
  "export default function App() {",                       // 1
  "  return (",                                             // 2
  '    <main className="hero">',                            // 3
  '      <h1 style={{ color: "red" }}>Oi</h1>',             // 4
  "      <p>Texto</p>",                                     // 5
  "    </main>",                                            // 6
  "  );",                                                   // 7
  "}",                                                      // 8
].join("\n");

let root = "";
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "prospector-visual-edit-"));
  materializeWorkspace(root, {
    "index.html": '<div id="root"></div>',
    "package.json": "{}",
    "src/App.tsx": APP,
    "src/index.css": ".hero{color:#fff;display:block}\n",
  });
});
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

describe("C3 · visual edit determinístico (React/TSX/CSS)", () => {
  it("aplica mudança em `style` inline do JSX (alvo inequívoco)", () => {
    const res = applyDeterministicVisualEdit(root, { file: "src/App.tsx", line: 4, tagName: "h1", changes: [{ property: "color", value: "#2563eb" }] });
    expect(res.ok).toBe(true);
    expect(res.applied).toBe(true);
    expect(res.mode).toBe("tsx-inline-style");
    const app = readFileSync(join(root, "src/App.tsx"), "utf8");
    expect(app).toContain('color: "#2563eb"');
    expect(app).toContain("<p>Texto</p>"); // resto preservado
    expect(res.files!["src/App.tsx"]).toContain("#2563eb");
  });

  it("propriedade ausente no style inline → handoff ao Coder (não inventa)", () => {
    const before = readFileSync(join(root, "src/App.tsx"), "utf8");
    const res = applyDeterministicVisualEdit(root, { file: "src/App.tsx", line: 4, tagName: "h1", changes: [{ property: "font-size", value: "40px" }] });
    expect(res.applied).toBe(false);
    expect(res.handoff).toBe("coder");
    expect(readFileSync(join(root, "src/App.tsx"), "utf8")).toBe(before);
  });

  it("edita texto simples do JSX", () => {
    const res = applyDeterministicVisualEdit(root, { file: "src/App.tsx", line: 5, tagName: "p", text: "Texto", newText: "Novo texto" });
    expect(res.applied).toBe(true);
    expect(res.mode).toBe("tsx-text");
    expect(readFileSync(join(root, "src/App.tsx"), "utf8")).toContain("<p>Novo texto</p>");
  });

  it("texto divergente → handoff (stale)", () => {
    const res = applyDeterministicVisualEdit(root, { file: "src/App.tsx", line: 5, tagName: "p", text: "Outro", newText: "X" });
    expect(res.applied).toBe(false);
    expect(res.handoff).toBe("coder");
  });

  it("JSX com filhos → handoff", () => {
    const res = applyDeterministicVisualEdit(root, { file: "src/App.tsx", line: 4, tagName: "h1", text: "Oi", newText: "X" });
    // h1 tem texto simples, então aplica; usamos o <main> (filhos) para o caso complexo
    expect(res.applied).toBe(true);
    const complex = applyDeterministicVisualEdit(root, { file: "src/App.tsx", line: 3, tagName: "main", text: "Oi", newText: "X" });
    expect(complex.applied).toBe(false);
    expect(complex.handoff).toBe("coder");
  });

  it("sem `style` inline no JSX → handoff (Coder edita a classe/componente)", () => {
    const res = applyDeterministicVisualEdit(root, { file: "src/App.tsx", line: 3, tagName: "main", classes: ["hero"], changes: [{ property: "background-color", value: "#000" }] });
    expect(res.applied).toBe(false);
    expect(res.handoff).toBe("coder");
  });

  it("aplica na regra CSS da classe (sem duplicar CSS)", () => {
    const res = applyDeterministicVisualEdit(root, { file: "src/index.css", classes: ["hero"], changes: [{ property: "background-color", value: "#111" }] });
    expect(res.applied).toBe(true);
    expect(res.mode).toBe("css-rule");
    const css = readFileSync(join(root, "src/index.css"), "utf8");
    expect(css).toContain("background-color: #111");
    expect(css).toContain("color:#fff"); // preservado
    expect(css).toContain("display:block");
  });

  it("breakpoint → handoff (responsividade vai ao Coder)", () => {
    const res = applyDeterministicVisualEdit(root, { file: "src/index.css", classes: ["hero"], changes: [{ property: "padding", value: "8px" }], scope: "mobile" });
    expect(res.applied).toBe(false);
    expect(res.handoff).toBe("coder");
  });

  it("propriedade não suportada → handoff", () => {
    const res = applyDeterministicVisualEdit(root, { file: "src/index.css", classes: ["hero"], changes: [{ property: "position", value: "fixed" }] });
    expect(res.applied).toBe(false);
    expect(res.handoff).toBe("coder");
  });
});

describe("C3 · segurança do visual edit", () => {
  it("bloqueia path traversal / arquivo sensível / inexistente", () => {
    for (const file of ["../evil.tsx", ".env", "src/nao-existe.tsx", "keys/id_rsa"]) {
      const res = applyDeterministicVisualEdit(root, { file, line: 1, changes: [{ property: "color", value: "#000" }] });
      expect(res.applied, `esperava handoff para ${file}`).toBe(false);
      expect(res.handoff).toBe("coder");
    }
  });

  it("sem mudanças informadas → handoff", () => {
    const res = applyDeterministicVisualEdit(root, { file: "src/App.tsx", line: 4, tagName: "h1", changes: [] });
    expect(res.applied).toBe(false);
    expect(res.handoff).toBe("coder");
  });
});
