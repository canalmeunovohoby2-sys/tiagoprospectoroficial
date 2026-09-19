// Template React + Vite + TypeScript + Tailwind (C0).
//
// Projeto REAL e buildável: `npm install && npm run dev` sobe um Vite dev server
// de verdade dentro do WebContainer. NÃO é HTML estático nem `srcDoc`.
// Arquivos na RAIZ do projeto (sem prefixo de slug) para o Vite/WebContainer
// resolverem os caminhos padrão.

export interface ReactTemplateInput {
  name?: string;
  tagline?: string;
}

/**
 * Marca do BOOTSTRAP (rascunho neutro descartável). NÃO é identidade final:
 * a primeira geração do Coder deve SUBSTITUÍ-LA. O runtime usa esta marca para
 * detectar "template não substituído" e forçar a criação real do site.
 */
export const REACT_BOOTSTRAP_MARKER = "prospector-bootstrap";

import { REACT_TEMPLATE_LOCK } from "./reactTemplateLock";

const PKG = {
  name: "prospector-site",
  private: true,
  version: "0.0.0",
  type: "module",
  scripts: {
    dev: "vite",
    build: "vite build",
    preview: "vite preview",
  },
  dependencies: {
    react: "^18.3.1",
    "react-dom": "^18.3.1",
  },
  devDependencies: {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    autoprefixer: "^10.4.20",
    postcss: "^8.4.49",
    tailwindcss: "^3.4.17",
    typescript: "^5.6.3",
    vite: "^5.4.19",
  },
};

export const REACT_TEMPLATE_PATHS = [
  "package.json",
  "package-lock.json",
  "index.html",
  "vite.config.ts",
  "tsconfig.json",
  "tsconfig.node.json",
  "tailwind.config.js",
  "postcss.config.js",
  "src/main.tsx",
  "src/App.tsx",
  "src/index.css",
] as const;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Mapa `{ path: content }` do template React, pronto para `generated_code`. */
export function buildReactTemplateFiles(input: ReactTemplateInput = {}): Record<string, string> {
  const name = (input.name ?? "Meu Site").trim() || "Meu Site";
  const tagline = (input.tagline ?? "Rascunho inicial — gere o site real").trim();
  const safeName = escapeHtml(name);
  const safeTagline = escapeHtml(tagline);

  return {
    "package.json": `${JSON.stringify(PKG, null, 2)}\n`,
    // FASE 7.1 — lockfile montado no WebContainer: evita a resolução de árvore na
    // rede a cada boot (causa documentada de boot lento no WebContainers).
    "package-lock.json": `${REACT_TEMPLATE_LOCK}\n`,
    "index.html": `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { host: true, port: 5173 },
});
`,
    "tsconfig.json": `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          useDefineForClassFields: true,
          lib: ["ES2020", "DOM", "DOM.Iterable"],
          module: "ESNext",
          skipLibCheck: true,
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: "react-jsx",
          strict: true,
          baseUrl: ".",
          paths: { "@/*": ["src/*"] },
        },
        include: ["src"],
      },
      null,
      2,
    )}\n`,
    "tsconfig.node.json": `${JSON.stringify(
      {
        compilerOptions: { composite: true, skipLibCheck: true, module: "ESNext", moduleResolution: "bundler", allowSyntheticDefaultImports: true },
        include: ["vite.config.ts"],
      },
      null,
      2,
    )}\n`,
    "tailwind.config.js": `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
`,
    "postcss.config.js": `export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
`,
    "src/main.tsx": `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    "src/App.tsx": `// ${REACT_BOOTSTRAP_MARKER}: rascunho neutro descartável — o site real substitui este arquivo.
export default function App() {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <section className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Rascunho</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">${safeName}</h1>
        <p className="max-w-xl text-neutral-500">${safeTagline}</p>
      </section>
    </main>
  );
}
`,
    "src/index.css": `@tailwind base;
@tailwind components;
@tailwind utilities;

/* ${REACT_BOOTSTRAP_MARKER}: base neutra — a identidade visual real vem da geração. */
body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
`,
  };
}

/** Valida minimamente que o mapa parece um projeto Vite/React válido. */
export function isReactProjectFiles(files: Record<string, string>): boolean {
  if (!files || typeof files !== "object") return false;
  const hasPkg = typeof files["package.json"] === "string";
  const hasIndex = typeof files["index.html"] === "string";
  const hasEntry = typeof files["src/main.tsx"] === "string" || typeof files["src/main.jsx"] === "string";
  return hasPkg && hasIndex && hasEntry;
}

/**
 * true quando o projeto ainda está no BOOTSTRAP (site real ainda não aplicado).
 * Cobre o rascunho neutro atual (marcador) e o rascunho legado (branding do
 * Prospector) — assim um projeto preso no template se recupera ao reabrir.
 */
export function isBootstrapFiles(files: Record<string, string> | null | undefined): boolean {
  if (!files || typeof files !== "object") return false;
  const app = files["src/App.tsx"];
  if (typeof app !== "string") return false;
  return app.includes(REACT_BOOTSTRAP_MARKER) || app.includes("TiagoProspector");
}
