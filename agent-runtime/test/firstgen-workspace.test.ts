import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backupAndPruneFirstGen,
  isVisualTemplatePath,
  shouldPruneFirstGen,
  visualTemplatePaths,
} from "../src/firstgen-workspace";

// Auditoria física provou: workspace tratado como "firstGen" continha o site INTEIRO de
// outro cliente (components/Header,Hero,Servicos…, lib/content.ts, lib/motion.ts, CSS com
// paleta do cliente anterior). Isso não pode ser o ponto de partida do agente.
const CONTAMINADO: Record<string, string> = {
  "package.json": '{"name":"x"}',
  "vite.config.ts": "export default {}",
  "tsconfig.json": "{}",
  "postcss.config.js": "export default {}",
  "tailwind.config.js": "export default {}",
  "index.html": "<title>ABRsolares | Energia solar em Bariri/SP</title>",
  "src/main.tsx": "createRoot(document.getElementById('root')!).render(<App/>)",
  "src/App.tsx": "// prospector-bootstrap: rascunho\nexport default function App(){return <main className='bg-white'/>}",
  "src/index.css": "/* ABRsolares — Noite #0E1A17 · Osso #F4F1EA · Ambar #F2A100 */",
  "src/components/Header.tsx": "export const Header = () => <header>ABRsolares</header>;",
  "src/components/Hero.tsx": "export const Hero = () => <section>Sol de Bariri</section>;",
  "src/components/Servicos.tsx": "export const Servicos = () => <section/>;",
  "src/lib/content.ts": "export const IMAGENS = ['https://lh3.googleusercontent.com/abc.jpg'];",
  "src/lib/motion.ts": "export const reveal = () => {};",
  "src/hooks/useReveal.ts": "export const useReveal = () => {};",
  "public/assets/abrsolares-logo.png": "binario",
};

describe("first-gen workspace · contaminação", () => {
  it("identifica o conteúdo visual/de cliente a remover", () => {
    const visuais = visualTemplatePaths(CONTAMINADO);
    expect(visuais).toContain("src/components/Header.tsx");
    expect(visuais).toContain("src/lib/content.ts");
    expect(visuais).toContain("src/lib/motion.ts");
    expect(visuais).toContain("src/hooks/useReveal.ts");
    expect(visuais).toContain("public/assets/abrsolares-logo.png");
    // infra NÃO entra na lista de remoção
    for (const infra of ["package.json", "vite.config.ts", "tsconfig.json", "postcss.config.js", "tailwind.config.js", "src/main.tsx"]) {
      expect(visuais).not.toContain(infra);
      expect(isVisualTemplatePath(infra)).toBe(false);
    }
  });

  it("só poda em primeira geração (nunca em edição/conversa de projeto existente)", () => {
    expect(shouldPruneFirstGen(true, "generate")).toBe(true);
    expect(shouldPruneFirstGen(false, "edit")).toBe(false);
    expect(shouldPruneFirstGen(false, "generate")).toBe(false);
    expect(shouldPruneFirstGen(true, "conversation")).toBe(false);
  });

  it("poda de verdade: backup criado, visual removido, infra preservada, shell resetado", () => {
    const root = mkdtempSync(join(tmpdir(), "pf-firstgen-"));
    const escrever = (rel: string, conteudo: string) => {
      mkdirSync(join(root, rel, ".."), { recursive: true });
      writeFileSync(join(root, rel), conteudo, "utf8");
    };
    for (const [rel, conteudo] of Object.entries(CONTAMINADO)) escrever(rel, conteudo);
    mkdirSync(join(root, "node_modules", "x"), { recursive: true }); // não pode ser tocado

    const rep = backupAndPruneFirstGen(root, "proj-teste");

    expect(rep.removed).toContain("src/components/Header.tsx");
    expect(existsSync(join(root, "src/components/Header.tsx"))).toBe(false);
    expect(existsSync(join(root, "src/lib/content.ts"))).toBe(false);
    expect(existsSync(join(root, "package.json"))).toBe(true);
    expect(existsSync(join(root, "src/main.tsx"))).toBe(true);
    expect(existsSync(join(root, "node_modules"))).toBe(true);
    expect(rep.reset).toEqual(expect.arrayContaining(["index.html", "src/App.tsx", "src/index.css"]));
    expect(readFileSync(join(root, "src/App.tsx"), "utf8")).toContain("prospector-bootstrap");
    expect(readFileSync(join(root, "index.html"), "utf8")).not.toContain("ABRsolares");
    expect(rep.backupDir).toContain("tiagoprospector-firstgen-backup");
    expect(existsSync(join(rep.backupDir, "src/components/Header.tsx"))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
});
