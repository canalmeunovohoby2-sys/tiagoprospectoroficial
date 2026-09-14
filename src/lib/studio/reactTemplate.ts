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
  const tagline = (input.tagline ?? "Criado com TiagoProspector").trim();
  const safeName = escapeHtml(name);
  const safeTagline = escapeHtml(tagline);

  return {
    "package.json": `${JSON.stringify(PKG, null, 2)}\n`,
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

export default defineConfig({
  plugins: [react()],
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
    "src/App.tsx": `export default function App() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-400">
          TiagoProspector
        </span>
        <h1 className="text-4xl font-bold sm:text-5xl">${safeName}</h1>
        <p className="max-w-xl text-slate-400">${safeTagline}</p>
      </section>
    </main>
  );
}
`,
    "src/index.css": `@tailwind base;
@tailwind components;
@tailwind utilities;

:root { color-scheme: dark; }
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
