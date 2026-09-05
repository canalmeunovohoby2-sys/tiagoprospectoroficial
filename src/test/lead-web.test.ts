import { describe, it, expect, vi } from "vitest";
import {
  normalizeItemList, matchLeadWebsite, textMentionsGeo, extractContactsFromMarkdown,
  runWebSources, enrichLeadsWithWeb,
} from "../../supabase/functions/_shared/lead-web";

const TAVILY_ITEMS = [
  { title: "Pet Care Banho e Tosa Guarulhos", url: "https://petcareguarulhos.com.br", description: "Banho e tosa em Guarulhos" },
  { title: "Guia de pet shops", url: "https://apontador.com.br/pets", description: "guia" },
  { title: "Cobasi Loja Guarulhos", url: "https://www.cobasi.com.br/lojas/cobasi-guarulhos", description: "loja" },
];
const FIRECRAWL_ITEMS = [
  { title: "Pet Care Banho e Tosa | Contato", url: "https://petcareguarulhos.com.br/contato", description: "telefone e endereço em Guarulhos" },
];

describe("lead-web (Tavily + Firecrawl)", () => {
  it("normalização Tavily/Firecrawl: bloqueia agregadores e valida URL", () => {
    const items = normalizeItemList([...TAVILY_ITEMS], "tavily");
    const urls = items.map((i) => i.url);
    expect(urls).toContain("https://petcareguarulhos.com.br");
    expect(urls).not.toContain("https://apontador.com.br/pets");
    expect(items[0].url).toBe(TAVILY_ITEMS[0].url);
  });

  it("matchLeadWebsite encontra o site pelo nome", () => {
    const items = normalizeItemList([...TAVILY_ITEMS, ...FIRECRAWL_ITEMS], "tavily");
    const match = matchLeadWebsite("Pet Care Banho e Tosa", items);
    expect(match).not.toBeNull();
    expect(match?.website).toBe("https://petcareguarulhos.com.br");
    expect(match?.evidence).toBeTruthy();
  });

  it("matchLeadWebsite não retorna site quando não há sinal (sem invenção)", () => {
    const items = normalizeItemList([{ title: "Notícias da cidade", url: "https://jornal.com.br/guarulhos", description: "notícias" }], "tavily");
    const match = matchLeadWebsite("Pet Care Banho e Tosa", items);
    expect(match).toBeNull();
  });

  it("validação geográfica textual", () => {
    expect(textMentionsGeo("Atendemos em Guarulhos, SP. Telefone...", "Guarulhos", "SP")).toBe(true);
    expect(textMentionsGeo("Atendemos em todo o Brasil", "Suzano", "SP")).toBe(false);
  });

  it("extração de contatos só aceita quando a página confirma cidade/estado", () => {
    const pageOk = "Localizada em Guarulhos/SP. Telefone (11) 912345678, WhatsApp (11) 912345678, instagram.com/petcareguarulhos";
    const cOk = extractContactsFromMarkdown(pageOk, "Guarulhos", "SP");
    expect(cOk.geoConfirmed).toBe(true);
    expect(cOk.whatsapp).toBe("5511912345678");
    expect(cOk.instagram).toBe("petcareguarulhos");

    const pageNoGeo = "Telefone (11) 912345678 para contato em outra cidade";
    const cNo = extractContactsFromMarkdown(pageNoGeo, "Guarulhos", "SP");
    expect(cNo.geoConfirmed).toBe(false);
    expect(cNo.phone).toBeNull();
    expect(cNo.whatsapp).toBeNull();
  });

  it("fallback: Tavily falha e Firecrawl responde", async () => {
    const call = vi.fn(async (provider: "tavily" | "firecrawl") => {
      if (provider === "tavily") return { ok: false };
      return { ok: true, results: FIRECRAWL_ITEMS };
    });
    const web = await runWebSources({ query: "x", call });
    expect(web.tavily.length).toBe(0);
    expect(web.firecrawl.length).toBeGreaterThan(0);
  });

  it("fallback: ambas falham sem lançar", async () => {
    const call = vi.fn(async () => ({ ok: false }));
    const web = await runWebSources({ query: "x", call });
    expect(web.tavily.length).toBe(0);
    expect(web.firecrawl.length).toBe(0);
  });

  it("enriquecimento OSM + web: atribui site e mantém lead (sem criar duplicado)", async () => {
    const leads = [{ name: "Pet Care Banho e Tosa", city: "Guarulhos", state: "SP", phone: null, website: null, has_website: false, score_reasons: ["Fonte: OSM"] }];
    const web = { tavily: normalizeItemList(TAVILY_ITEMS, "tavily"), firecrawl: normalizeItemList(FIRECRAWL_ITEMS, "firecrawl") };
    const scrape = vi.fn(async () => "Pet Care Banho e Tosa, Guarulhos/SP, tel (11) 912345678");
    const { leads: out, summary } = await enrichLeadsWithWeb({ leads: [...leads], web, city: "Guarulhos", state: "SP", scrape, maxScrape: 1 });
    expect(out.length).toBe(1);
    expect(summary.websitesEnriched).toBe(1);
    expect(out[0].website).toBe("https://petcareguarulhos.com.br");
    expect(out[0].has_website).toBe(true);
    expect(out[0].whatsapp).toBe("5511912345678");
    expect(scrape).toHaveBeenCalledTimes(1);
  });

  it("sem itens web â†’ leads inalterados (nenhuma invenção)", async () => {
    const leads = [{ name: "X", city: "Suzano", state: "SP", website: null, has_website: false }];
    const { leads: out, summary } = await enrichLeadsWithWeb({ leads: [...leads], web: { tavily: [], firecrawl: [] }, city: "Suzano", state: "SP" });
    expect(out[0].website).toBeNull();
    expect(summary.websitesEnriched).toBe(0);
  });

  it("ordem/quantidade preservada (ranking não destruído)", async () => {
    const leads = [
      { name: "Um", city: "Suzano", state: "SP", website: null },
      { name: "Dois", city: "Suzano", state: "SP", website: null },
      { name: "Três", city: "Suzano", state: "SP", website: null },
    ];
    const web = { tavily: normalizeItemList(TAVILY_ITEMS, "tavily"), firecrawl: [] };
    const { leads: out } = await enrichLeadsWithWeb({ leads: [...leads], web, city: "Suzano", state: "SP" });
    expect(out.map((l) => l.name)).toEqual(["Um", "Dois", "Três"]);
  });
});
