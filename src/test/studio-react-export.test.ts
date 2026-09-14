import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { exportReactProjectZip, filterReactProjectFiles } from "@/lib/studio/reactExport";

const FILES: Record<string, string> = {
  "package.json": '{"name":"app"}',
  "index.html": "<div id='root'></div>",
  "vite.config.ts": "export default {}",
  "tsconfig.json": "{}",
  "src/main.tsx": "import App from './App'",
  "src/App.tsx": "export default function App(){return null}",
  "public/assets/logo.svg": "<svg/>",
  // proibidos:
  "node_modules/react/index.js": "x",
  ".git/config": "x",
  ".env": "SECRET=1",
  ".env.local": "SECRET=2",
  "keys/server.key": "PRIVATE",
  "dist/index.html": "x",
  "build/out.js": "x",
  ".prospector/visual-helper.js": "helper",
  "prospector-react-visual-helper.js": "helper",
  "data-pfsrc-note.txt": "data-pfsrc",
};

describe("C5 · filtro de arquivos do projeto React", () => {
  it("mantém o código-fonte e remove proibidos/artefatos internos", () => {
    const out = filterReactProjectFiles(FILES);
    expect(Object.keys(out).sort()).toEqual(
      ["index.html", "package.json", "public/assets/logo.svg", "src/App.tsx", "src/main.tsx", "tsconfig.json", "vite.config.ts"].sort(),
    );
    for (const blocked of ["node_modules/react/index.js", ".git/config", ".env", ".env.local", "keys/server.key", "dist/index.html", "build/out.js", ".prospector/visual-helper.js", "prospector-react-visual-helper.js"]) {
      expect(out[blocked], `não deveria incluir ${blocked}`).toBeUndefined();
    }
  });
});

describe("C5 · export ZIP React", () => {
  it("gera ZIP com código-fonte e sem segredos/artefatos", async () => {
    const { bytes, name } = await exportReactProjectZip(FILES, "Clínica Bella");
    expect(name).toBe("clinica-bella.zip");
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    // presente no código-fonte (dentro da pasta do projeto)
    expect(names).toContain("clinica-bella/package.json");
    expect(names).toContain("clinica-bella/src/App.tsx");
    expect(names).toContain("clinica-bella/index.html");
    // ausente: proibidos
    const joined = names.join("\n");
    expect(joined).not.toMatch(/node_modules/);
    expect(joined).not.toMatch(/\.git\//);
    expect(joined).not.toMatch(/\.env/);
    expect(joined).not.toMatch(/\.key$/m);
    expect(joined).not.toMatch(/\/dist\//);
    expect(joined).not.toMatch(/prospector-react-visual-helper/);
  });

  it("nome de fallback quando o projeto não tem nome", async () => {
    const { name } = await exportReactProjectZip({ "src/App.tsx": "x" }, "");
    expect(name).toBe("projeto-react.zip");
  });
});
