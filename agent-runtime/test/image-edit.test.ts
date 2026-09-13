import { describe, it, expect } from "vitest";
import { isSurgicalEditTask } from "../src/prospector-site-agent";
import { requestsImageSwap } from "../src/regression-guard";

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
