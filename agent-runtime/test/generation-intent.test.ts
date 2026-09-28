import { describe, it, expect } from "vitest";
import { pareceCriacao, semSiteReal } from "../src/server";

// BUG REAL (relatado no chat): "Crie o site real ... (4 min, 4 arquivos)" — a geracao foi
// tratada como edicao e cortada no timeout de edicao. Duas causas: (1) timeout de geracao
// curto (4 min) e (2) apos uma geracao PARCIAL o marcador de rascunho some e o retry
// "crie o site" virava EDICAO. Aqui cobrimos (2) de forma NAO destrutiva.
const INFRA: Record<string, string> = {
  "package.json": "{}", "vite.config.ts": "export default {}", "tsconfig.json": "{}",
  "index.html": "<div id=root></div>", "src/main.tsx": "render(<App/>)",
  "src/App.tsx": "// prospector-bootstrap: shell\nexport default function App(){return <main/>}",
};

describe("intencao de geracao vs edicao", () => {
  it("projeto sem site real = pode gerar (mesmo sem o marcador)", () => {
    expect(semSiteReal(INFRA)).toBe(true);
    expect(semSiteReal({})).toBe(true);
    // projeto parcial (4 arquivos escritos, nenhum componente/secao) continua sem site real
    expect(semSiteReal({ ...INFRA, "src/index.css": "@tailwind base;", "src/lib/theme.ts": "export const c='#111';" })).toBe(false);
  });

  it("projeto com site REAL nao e tratado como geracao", () => {
    expect(semSiteReal({ ...INFRA, "src/components/Hero.tsx": "export const Hero=()=>null;" })).toBe(false);
    expect(semSiteReal({ ...INFRA, "src/App.tsx": "export default function App(){return <main>" + "x".repeat(2000) + "</main>}" })).toBe(false);
  });

  it("reconhece pedido de criacao de site (e nao confunde com edicao)", () => {
    expect(pareceCriacao("Crie o site real de OdontoVitta agora")).toBe(true);
    expect(pareceCriacao("Crie o site profissional desta clinica odontologica.")).toBe(true);
    expect(pareceCriacao("gere o site do zero")).toBe(true);
    expect(pareceCriacao("troque o titulo principal")).toBe(false);
    expect(pareceCriacao("mude a cor do botao para verde")).toBe(false);
  });
});
