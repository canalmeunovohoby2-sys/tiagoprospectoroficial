import { describe, it, expect } from "vitest";
import { editIntentOf, editIntentViolation } from "../src/server";

// BUG REAL: pedido "menu com efeito" respondido como "feito" sem NENHUMA animação no diff.
describe("verificacao do pedido no diff", () => {
  it("classifica a intencao (motion/cor/texto/secao)", () => {
    expect(editIntentOf("O menu continua estatico e travado, corrija")).toBe("motion");
    expect(editIntentOf("coloque efeito de reveal ao rolar")).toBe("motion");
    expect(editIntentOf("troque a cor do botao para verde")).toBe("color");
    expect(editIntentOf('troque o titulo para "Energia Solar Inteligente"')).toBe("text");
    expect(editIntentOf("adicione uma secao de depoimentos")).toBe("section");
  });

  it("MOTION: reprova quando o diff nao ganhou animacao; aprova com keyframes/reveal", () => {
    const antes = { "src/components/Menu.tsx": "export const Menu=()=> <nav>menu</nav>;" };
    const sem = { "src/components/Menu.tsx": "export const Menu=()=> <nav className='bg-black'>menu</nav>;" };
    expect(editIntentViolation("motion", antes, sem, "menu com movimento")).toMatch(/efeito\/movimento/i);
    const com = { "src/components/Menu.tsx": "export const Menu=()=> <nav ref={r} style={{transform:'translate3d(0,'+y+'px,0)'}} onScroll={()=>requestAnimationFrame(tick)}>menu</nav>;" };
    expect(editIntentViolation("motion", antes, com, "menu com movimento")).toBeNull();
  });

  it("COR: exige cor NOVA no diff", () => {
    const antes = { "src/index.css": "body{color:#111}" };
    expect(editIntentViolation("color", antes, { "src/index.css": "body{color:#111; padding:2px}" }, "cor verde")).toMatch(/cor nova/i);
    expect(editIntentViolation("color", antes, { "src/index.css": "body{color:#00ff00}" }, "cor verde")).toBeNull();
  });

  it("TEXTO: exige o texto pedido nos arquivos alterados", () => {
    const antes = { "src/App.tsx": "<h1>Antigo</h1>" };
    expect(editIntentViolation("text", antes, { "src/App.tsx": "<h1>Outro</h1>" }, 'troque o titulo para "Energia Solar Inteligente"')).toMatch(/texto pedido/i);
    expect(editIntentViolation("text", antes, { "src/App.tsx": "<h1>Energia Solar Inteligente</h1>" }, 'troque o titulo para "Energia Solar Inteligente"')).toBeNull();
  });

  it("sem nenhum arquivo alterado = falta", () => {
    const f = { "src/App.tsx": "x" };
    expect(editIntentViolation("motion", f, { ...f }, "efeito")).toMatch(/nenhum arquivo/i);
  });
});
