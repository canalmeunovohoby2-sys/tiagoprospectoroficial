import { describe, it, expect } from "vitest";
import { buildReactTemplateFiles, isReactProjectFiles, isBootstrapFiles, REACT_TEMPLATE_PATHS, REACT_BOOTSTRAP_MARKER } from "@/lib/studio/reactTemplate";
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

  it("o bootstrap é NEUTRO e marcado — não é identidade final", () => {
    const files = buildReactTemplateFiles({ name: "Loja X" });
    expect(files["src/App.tsx"]).toContain(REACT_BOOTSTRAP_MARKER);
    expect(files["src/index.css"]).toContain(REACT_BOOTSTRAP_MARKER);
    // Sem a antiga identidade escura/azul e sem branding do Prospector no site.
    expect(files["src/App.tsx"]).not.toContain("bg-slate-950");
    expect(files["src/App.tsx"]).not.toContain("TiagoProspector");
    expect(files["src/index.css"]).not.toContain("color-scheme: dark");
  });

  it("isBootstrapFiles detecta rascunho pendente e libera quando o site real é aplicado", () => {
    const template = buildReactTemplateFiles({ name: "Loja X" });
    expect(isBootstrapFiles(template)).toBe(true);
    expect(isBootstrapFiles({ ...template, "src/App.tsx": "export default function App(){return null}" })).toBe(false);
    // Rascunho legado (branding do Prospector) também conta como pendente.
    expect(isBootstrapFiles({ "src/App.tsx": "export default function App(){return <span>TiagoProspector</span>}" })).toBe(true);
    expect(isBootstrapFiles(null)).toBe(false);
  });

  it("o template resolve o alias @ → src (evita preview em branco)", () => {
    const files = buildReactTemplateFiles({ name: "Loja X" });
    expect(files["vite.config.ts"]).toMatch(/alias/);
    expect(files["vite.config.ts"]).toContain('"@"');
    expect(files["tsconfig.json"]).toContain('"@/*"');
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

  it("site publicado libera mídia cross-origin: iframe same-origin + COEP desligado em /public", () => {
    const root = process.cwd();
    const pub = readFileSync(join(root, "src/pages/PublicSitePage.tsx"), "utf8");
    expect(pub).toContain("allow-same-origin");
    const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
    const publicRule = vercel.headers.find((h) => h.source === "/public/(.*)");
    expect(publicRule, "regra de /public ausente").toBeTruthy();
    const coep = publicRule?.headers.find((x) => x.key === "Cross-Origin-Embedder-Policy");
    expect(coep?.value).toBe("unsafe-none");
  });
});
