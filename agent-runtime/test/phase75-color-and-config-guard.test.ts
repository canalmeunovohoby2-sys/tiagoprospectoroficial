import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isColorSwapRequest, shouldBlockConfigEdit, isConfigFilePath } from "../src/completion-guard";

// FASE 7.5 — o caso real: "mude todo esse azul do site por um laranja" terminou
// editando vite.config.ts e respondendo "troquei a imagem". Aqui provamos as duas
// proteções: instrução específica de TROCA DE COR e guarda de arquivo de CONFIG.

const agent = readFileSync(join(process.cwd(), "src/prospector-site-agent.ts"), "utf8");

describe("FASE 7.5 · detector de troca de cor", () => {
  it("o pedido real é reconhecido (nome da cor + verbo de troca)", () => {
    for (const msg of [
      "eu quero que você mude todo esse azul do site por um laranja tá",
      "troque o azul por laranja",
      "mude todo o verde para roxo",
      "substitua o #0b5cff por #ff7a00",
      "deixe o fundo cinza e os botões pretos",
    ]) {
      expect(isColorSwapRequest(msg), msg).toBe(true);
    }
  });

  it("perguntas e pedidos não-visuais NÃO entram na regra", () => {
    for (const msg of ["O que é azul?", "quais são as cores do site?", "troque a imagem do hero", "adicione um botão de WhatsApp"]) {
      expect(isColorSwapRequest(msg), msg).toBe(false);
    }
  });

  it("a instrução de cor chega ao agente (hint no ciclo de edição, antes do cirúrgico)", () => {
    expect(agent).toContain("COLOR_SWAP_HINT");
    expect(agent).toContain("isColorSwapRequest(instruction)");
    const colorIdx = agent.indexOf("isColorSwapRequest(instruction)");
    const surgicalIdx = agent.indexOf("isSurgicalEditTask(instruction)");
    expect(colorIdx).toBeGreaterThan(-1);
    expect(colorIdx).toBeLessThan(surgicalIdx);
    // o hint proíbe explicitamente mexer em build e exige verificação
    expect(agent).toMatch(/NUNCA edite configuração\/build/);
    expect(agent).toMatch(/nunca fale de imagem\/foto se o pedido era cor/i);
  });
});

describe("FASE 7.5 · guarda de arquivo de configuração", () => {
  it("identifica arquivos de build/config", () => {
    for (const p of ["vite.config.ts", "tsconfig.json", "tsconfig.node.json", "package.json", "package-lock.json", "tailwind.config.js", "postcss.config.js"]) {
      expect(isConfigFilePath(p), p).toBe(true);
    }
    for (const p of ["src/App.tsx", "src/index.css", "index.html", "src/components/Hero.tsx"]) {
      expect(isConfigFilePath(p), p).toBe(false);
    }
  });

  it("pedido de COR bloqueia edição de config; pedido de build/dependência libera", () => {
    const cor = "mude todo esse azul do site por um laranja";
    expect(shouldBlockConfigEdit("vite.config.ts", cor)).toBe(true);
    expect(shouldBlockConfigEdit("package.json", cor)).toBe(true);
    expect(shouldBlockConfigEdit("src/App.tsx", cor)).toBe(false);
    // pedido legítimo de config continua passando
    expect(shouldBlockConfigEdit("vite.config.ts", "configure um proxy no vite e mude a porta")).toBe(false);
    expect(shouldBlockConfigEdit("package.json", "adicione a dependência clsx")).toBe(false);
  });

  it("a guarda está ligada no beforeTool (write/edit/create) com mensagem clara", () => {
    expect(agent).toContain("shouldBlockConfigEdit(input.path, this.currentInstruction)");
    expect(agent).toMatch(/name === "write_file" \|\| name === "edit_file" \|\| name === "create_file"/);
    expect(agent).toMatch(/ARQUIVO DE CONFIGURAÇÃO\/BUILD/);
  });
});
