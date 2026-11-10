import { describe, it, expect } from "vitest";
import { siteStatusOf, prioritizeSiteLess } from "../lib/leadSitePriority";

describe("leadSitePriority — classificação honesta", () => {
  it("sem site só quando a fonte afirmou ausência", () => {
    expect(siteStatusOf({ website: null, has_website: false })).toBe("sem_site");
    expect(siteStatusOf({ website: "", has_website: false })).toBe("sem_site");
  });

  it("ausência de informação NÃO vira 'sem site'", () => {
    expect(siteStatusOf({ website: null })).toBe("desconhecido");
    expect(siteStatusOf({ website: null, has_website: null })).toBe("desconhecido");
  });

  it("distingue rede social de site próprio", () => {
    expect(siteStatusOf({ website: "https://instagram.com/loja" })).toBe("site_social");
    expect(siteStatusOf({ website: "https://linktr.ee/loja" })).toBe("site_social");
    expect(siteStatusOf({ website: "https://wa.me/5511999999999" })).toBe("site_social");
    expect(siteStatusOf({ website: "https://oticavisaoclara.com.br" })).toBe("site_proprio");
  });
});

describe("leadSitePriority — prioriza sem descartar", () => {
  it("ordena sem_site → desconhecido → social → próprio e mantém todos", () => {
    const leads = [
      { id: "proprio", website: "https://empresa.com.br" },
      { id: "social", website: "https://instagram.com/empresa" },
      { id: "desconhecido", website: null },
      { id: "sem_site", website: null, has_website: false },
    ];
    const out = prioritizeSiteLess(leads);
    expect(out).toHaveLength(leads.length);
    expect(out.map((l) => l.id)).toEqual(["sem_site", "desconhecido", "social", "proprio"]);
  });

  it("é estável dentro do mesmo status", () => {
    const out = prioritizeSiteLess([
      { id: "a", website: null, has_website: false },
      { id: "b", website: null, has_website: false },
      { id: "c", website: null, has_website: false },
    ]);
    expect(out.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });
});
