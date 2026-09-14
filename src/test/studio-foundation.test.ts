import { describe, it, expect } from "vitest";
import { buildReactTemplateFiles, isReactProjectFiles, REACT_TEMPLATE_PATHS } from "@/lib/studio/reactTemplate";
import { projectKindOf } from "@/data/siteProjects";
import { WEB_CONTAINER_HEADERS, isCrossOriginIsolated, isolationDiagnostic } from "@/lib/studio/isolation";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("C0 · template React/Vite", () => {
  it("contém a estrutura mínima exigida pelo Vite", () => {
    const files = buildReactTemplateFiles({ name: "Clínica Bella", tagline: "Saúde" });
    for (const path of REACT_TEMPLATE_PATHS) expect(files[path], `faltando ${path}`).toBeTruthy();
    expect(isReactProjectFiles(files)).toBe(true);
  });

  it("package.json é JSON válido com scripts dev/build e react/vite", () => {
    const files = buildReactTemplateFiles();
    const pkg = JSON.parse(files["package.json"]) as { scripts: Record<string, string>; dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(pkg.scripts.dev).toBeTruthy();
    expect(pkg.scripts.build).toBeTruthy();
    expect(pkg.dependencies.react).toBeTruthy();
    expect(pkg.dependencies["react-dom"]).toBeTruthy();
    expect(pkg.devDependencies.vite).toBeTruthy();
    expect(pkg.devDependencies.typescript).toBeTruthy();
    expect(pkg.devDependencies.tailwindcss).toBeTruthy();
  });

  it("index.html aponta para o entry React e App.tsx exporta um componente", () => {
    const files = buildReactTemplateFiles({ name: "Loja X" });
    expect(files["index.html"]).toContain('<div id="root">');
    expect(files["index.html"]).toContain('src="/src/main.tsx"');
    expect(files["index.html"]).toContain("Loja X");
    expect(files["src/App.tsx"]).toContain("export default function App()");
    expect(files["src/main.tsx"]).toContain("createRoot");
  });

  it("isReactProjectFiles rejeita mapas sem estrutura", () => {
    expect(isReactProjectFiles({ "index.html": "<div/>" })).toBe(false);
    expect(isReactProjectFiles({})).toBe(false);
  });
});

describe("C0 · project_kind (compatibilidade)", () => {
  it("legado sem settings é static (nunca converte)", () => {
    expect(projectKindOf({ settings: {} })).toBe("static");
    expect(projectKindOf({ settings: { other: 1 } })).toBe("static");
    expect(projectKindOf(null)).toBe("static");
  });

  it("settings.kind react vira react", () => {
    expect(projectKindOf({ settings: { kind: "react" } })).toBe("react");
  });
});

describe("C0 · isolation (COOP/COEP)", () => {
  it("headers de isolamento são os esperados", () => {
    expect(WEB_CONTAINER_HEADERS["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(WEB_CONTAINER_HEADERS["Cross-Origin-Embedder-Policy"]).toBe("credentialless");
  });

  it("em jsdom (sem crossOriginIsolated) reporta não isolado com motivo", () => {
    expect(isCrossOriginIsolated()).toBe(false);
    const diag = isolationDiagnostic();
    expect(diag.isolated).toBe(false);
    expect(diag.reason).toBeTruthy();
  });

  it("vite.config.ts e vercel.json declaram os headers (dev + produção)", () => {
    const root = process.cwd();
    const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
    expect(vite).toContain("WEB_CONTAINER_HEADERS");
    const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as { headers: Array<{ headers: Array<{ key: string; value: string }> }> };
    const keys = vercel.headers.flatMap((h) => h.headers.map((x) => x.key));
    expect(keys).toContain("Cross-Origin-Opener-Policy");
    expect(keys).toContain("Cross-Origin-Embedder-Policy");
  });
});
