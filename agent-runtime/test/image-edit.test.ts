import { describe, it, expect } from "vitest";
import { isSurgicalEditTask } from "../src/prospector-site-agent";
import { requestsImageSwap, requestsFramingFix, requestsNarrowScope, scopeViolations } from "../src/regression-guard";
import { classifyEditKind, buildChangeReport } from "../src/completion-guard";

describe("Edição de imagem usa o fluxo NORMAL (o modo cirúrgico proíbe browser/verificação)", () => {
  it("enquadramento/foto/zoom/hero NÃO caem no cirúrgico", () => {
    for (const q of [
      "a foto da mulher no hero está com a cabeça cortada, mostre a cabeça toda",
      "corrija o enquadramento da imagem do topo",
      "dê um zoom na foto do hero",
      "troque a foto do hero",
      "remova a imagem do banner",
      "ajuste o object-position da imagem para mostrar o rosto",
    ]) {
      expect(isSurgicalEditTask(q), q).toBe(false);
    }
  });

  it("alterações pontuais de cor/texto continuam cirúrgicas", () => {
    for (const q of ["troque a cor do botão para azul", "mude o texto do título", "deixe o CTA verde"]) {
      expect(isSurgicalEditTask(q), q).toBe(true);
    }
  });
});

describe("Guard de troca de imagem — enquadramento/zoom NÃO é troca de arquivo", () => {
  it("pedidos de enquadramento/corte/zoom/posição NÃO exigem trocar a URL", () => {
    for (const q of [
      "a cabeça está cortada, mostre o rosto todo",
      "ajuste o enquadramento da foto",
      "dê zoom na imagem do hero",
      "reposicione a foto para mostrar a cabeça",
    ]) {
      expect(requestsImageSwap(q), q).toBe(false);
    }
  });

  it("pedido explícito de trocar/substituir imagem exige troca real", () => {
    for (const q of ["troque a imagem do hero por outra", "substitua a foto do topo", "troca essa foto"]) {
      expect(requestsImageSwap(q), q).toBe(true);
    }
  });
});

describe("FRAMING/CROP/ZOOM NÃO é troca de imagem", () => {
  it("reconhece pedidos de enquadramento/zoom/posição/corte", () => {
    for (const q of ["mostre a cabeça completa", "a cabeça está cortada", "mostre mais da pessoa", "desça a imagem", "suba a imagem", "diminua o zoom", "afaste o enquadramento", "não corte o rosto", "mostre a pessoa inteira"]) {
      expect(requestsFramingFix(q), q).toBe(true);
      expect(requestsImageSwap(q), q).toBe(false); // framing NUNCA é swap
    }
  });
  it("'troque a foto' NÃO é framing", () => {
    expect(requestsFramingFix("troque a foto por outra")).toBe(false);
  });
});

describe("Scope Guard — pedido pontual preserva o restante do site", () => {
  const BASE: Record<string, string> = {
    "index.html": `<html><body><img class="logo" src="./assets/logo.svg"><section class="hero"><img class="foto" src="https://cdn/x.jpg"><h1>Oi</h1></section><section><h2>Serviços</h2></section><footer>rodape</footer></body></html>`,
    "src/site.css": `:root{--brand:#ff7a00}.cta{background:#ff7a00}`,
  };

  it("cor: alterar só o CSS é permitido", () => {
    const after = { ...BASE, "src/site.css": `:root{--brand:#e11d48}.cta{background:#e11d48}` };
    expect(scopeViolations(BASE, after, "Troque a cor do site de laranja para vermelho")).toEqual([]);
  });

  it("cor: trocar imagem/estrutura fora do pedido é BLOQUEADO", () => {
    const after = { ...BASE, "index.html": BASE["index.html"].replace("https://cdn/x.jpg", "https://cdn/nova.jpg"), "src/site.css": BASE["src/site.css"].replace("#ff7a00", "#e11d48") };
    const v = scopeViolations(BASE, after, "Troque o laranja por vermelho");
    expect(v.length).toBeGreaterThan(0);
    expect(v.join(" ")).toMatch(/IMAGEM|LOGOTIPO|TEXTO|ESTRUTURA/i);
  });

  it("framing: ajustar CSS é permitido; mexer no src da foto é bloqueado", () => {
    const ok = { ...BASE, "src/site.css": BASE["src/site.css"] + "\n.hero img{object-position:center top}" };
    expect(scopeViolations(BASE, ok, "mostre a cabeça completa")).toEqual([]);
    const bad = { ...BASE, "index.html": BASE["index.html"].replace("https://cdn/x.jpg", "https://cdn/outra.jpg") };
    expect(scopeViolations(BASE, bad, "mostre a cabeça completa").join(" ")).toMatch(/IMAGEM/i);
  });

  it("troca de imagem solicitada é permitida", () => {
    const after = { ...BASE, "index.html": BASE["index.html"].replace("https://cdn/x.jpg", "https://cdn/outra.jpg") };
    expect(scopeViolations(BASE, after, "troque a foto do hero por outra")).toEqual([]);
  });

  it("redesign explícito não é limitado", () => {
    expect(requestsNarrowScope("faça um redesign completo do site")).toBe(false);
  });
});

describe("Relatório reflete o tipo REAL da alteração (não genérico)", () => {
  it("classifyEditKind", () => {
    expect(classifyEditKind("mostre a cabeça completa")).toBe("framing");
    expect(classifyEditKind("troque o laranja por vermelho")).toBe("color");
    expect(classifyEditKind("troque a foto")).toBe("swap");
    expect(classifyEditKind("mude o texto do título")).toBe("text");
  });
  it("framing NÃO diz 'troquei a imagem'", () => {
    const r = buildChangeReport({ editedPaths: ["src/site.css"], verificationTools: ["browser_eval"], renderVerified: true, visualEdit: true, verified: true, kind: "framing" });
    expect(r).toMatch(/enquadramento/i);
    expect(r).not.toMatch(/troquei a imagem/i);
  });
  it("cor preserva logo/imagens/layout/conteúdo", () => {
    const r = buildChangeReport({ editedPaths: ["src/site.css"], verificationTools: ["browser_eval"], renderVerified: true, visualEdit: true, verified: true, kind: "color" });
    expect(r).toMatch(/preservando logotipo, imagens, layout e conteúdo/i);
  });
});
