import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mediaContextBlock } from "../src/studio/agent-core/site-media";

// BUG CORRIGIDO: business.photos (fotos do Google/Maps obtidas do lead) eram
// apresentadas como "IMAGENS REAIS DO CLIENTE — use EXATAMENTE estas URLs", e por
// isso viravam a imagem principal do site. Agora sao REFERENCIA; a apresentacao
// vem do pipeline de imagens (image_plan -> get-images/Pexels).
describe("hierarquia de imagens", () => {
  const bloco = mediaContextBlock({ photos: ["https://lh3.googleusercontent.com/gps-cs-s/lead.jpg"] } as never);

  it("foto do lead entra como REFERENCIA, nunca como imagem de apresentacao", () => {
    expect(bloco).toContain("REFER");
    expect(bloco).toMatch(/N[^ ]*O imagem de apresenta/i);
    expect(bloco).not.toContain("use EXATAMENTE estas URLs");
    expect(bloco).not.toContain("IMAGENS REAIS DO CLIENTE");
  });

  it("manda pesquisar a apresentacao no pipeline de imagens", () => {
    expect(bloco).toContain("image_plan");
    expect(bloco).toContain("get-images");
  });

  it("o briefing criativo tambem trata a foto do lead como referencia", () => {
    const src = readFileSync(join(process.cwd(), "src/studio/agent-core/creative-brief.ts"), "utf8");
    expect(src).toContain("REFER");
    expect(src).toContain("imagem de apresenta");
    expect(src).toContain("get-images/Pexels");
  });
});
