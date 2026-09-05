import { describe, it, expect } from "vitest";
import {
  normalizeImageList, normalizeImageItem, selectAssets, resolveImageUrl, getImageNeeds,
} from "../../supabase/functions/_shared/image-assets";
import { qualityIssues, hasUsableImages } from "../../supabase/functions/_shared/site-quality";

const PEXELS_ITEM = {
  id: 12345,
  width: 4000,
  height: 3000,
  url: "https://www.pexels.com/photo/clinica-12345/",
  photographer: "Jane Doe",
  alt: "Clínica moderna com recepção acolhedora",
  src: {
    original: "https://images.pexels.com/photos/12345/pexels-photo-12345.jpeg",
    large2x: "https://images.pexels.com/photos/12345/pexels-photo-12345.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=940",
    large: "https://images.pexels.com/photos/12345/pexels-photo-12345.jpeg?auto=compress&cs=tinysrgb&w=940",
    medium: "https://images.pexels.com/photos/12345/pexels-photo-12345.jpeg?auto=compress&cs=tinysrgb&w=350",
  },
};

describe("Image assets", () => {
  it("normaliza item do Pexels com metadata e flag ilustrativa", () => {
    const a = normalizeImageItem(PEXELS_ITEM, "pexels");
    expect(a?.url).toContain("images.pexels.com");
    expect(a?.isIllustrative).toBe(true);
    expect(a?.alt).toContain("Clínica moderna");
    expect(a?.width).toBe(4000);
    expect(a?.aspectRatio).toBe("4000:3000");
    expect(a?.license).toContain("Pexels");
  });

  it("normalização ignora itens inválidos e deduplica por URL", () => {
    const list = normalizeImageList([PEXELS_ITEM, { ...PEXELS_ITEM, id: 999 }, null, { url: "not-http" }], "pexels");
    expect(list.length).toBe(1);
  });

  it("selectAssets evita repetição", () => {
    const skip = new Set<string>();
    const pool = [PEXELS_ITEM, { ...PEXELS_ITEM, id: 54321, src: { ...PEXELS_ITEM.src, large2x: "https://images.pexels.com/photos/54321/a.jpeg", large: "https://images.pexels.com/photos/54321/b.jpeg" } }];
    const assets = normalizeImageList(pool, "pexels");
    const first = selectAssets(assets, 1, skip);
    const second = selectAssets(assets, 1, skip);
    expect(first[0].id).not.toBe(second[0].id);
  });

  it("resolveImageUrl aceita URL legada e asset estruturado", () => {
    expect(resolveImageUrl("https://x.com/a.jpg")?.url).toBe("https://x.com/a.jpg");
    expect(resolveImageUrl({ url: "https://x.com/b.jpg", alt: "Algum" })?.alt).toBe("Algum");
    expect(resolveImageUrl({ url: "ftp://x" })).toBeNull();
    expect(resolveImageUrl(null)).toBeNull();
  });

  it("plano de imagens por nicho existe e é image-driven quando aplicável", () => {
    const food = getImageNeeds("Restaurantes");
    expect(food.imageDriven).toBe(true);
    expect(food.heroQuery.toLowerCase()).toContain("food");
    const law = getImageNeeds("Advogados");
    expect(law.heroQuery.toLowerCase()).toContain("office");
  });
});

describe("Quality gate com imagens", () => {
  const base = {
    sections: [
      { type: "hero" }, { type: "services" }, { type: "features" }, { type: "cta" }, { type: "contact" },
    ],
    content: {
      hero: { title: "Título longo para clínica em Suzano com atendimento humanizado e agendamento fácil" },
      services: { items: [{ title: "A", description: "descrição do serviço A" }] },
      features: { items: [{ title: "B", description: "descrição" }] },
      cta: { title: "Agende", body: "texto do CTA" },
      contact: { title: "Contato" },
    },
    calls_to_action: [{ label: "Agendar", type: "whatsapp", value: "55119" }],
    seo: { title: "Clínica | Suzano", description: "descrição" },
  };

  it("site sem imagem é reprovado quando a direção exige imagem", () => {
    expect(hasUsableImages(base)).toBe(false);
    expect(qualityIssues(base, { imageDriven: true })).toContain("sem_imagens_para_direcao_visual");
  });

  it("hero com asset objeto conta como imagem", () => {
    const withHero = {
      ...base,
      content: { ...base.content, hero: { ...base.content.hero, image: { url: "https://images.unsplash.com/photo-x", alt: "Ambiente", isIllustrative: true } } },
    };
    expect(hasUsableImages(withHero)).toBe(true);
    expect(qualityIssues(withHero, { imageDriven: true })).not.toContain("sem_imagens_para_direcao_visual");
  });

  it("hero com URL legada (site antigo) continua contando imagem", () => {
    const legacy = { ...base, content: { ...base.content, hero: { ...base.content.hero, image: "https://exemplo.com/foto.jpg" } } };
    expect(hasUsableImages(legacy)).toBe(true);
  });

  it("nicho institucional sem exigência de imagem não é reprovado por isso", () => {
    expect(qualityIssues(base, { imageDriven: false })).not.toContain("sem_imagens_para_direcao_visual");
  });
});
