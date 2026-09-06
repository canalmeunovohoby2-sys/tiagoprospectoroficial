import { describe, it, expect, vi } from "vitest";
import {
  normalizeItemList, matchLeadWebsite, textMentionsGeo, extractContactsFromMarkdown, matchInstagramHandle,
  runWebSources, enrichLeadsWithWeb, extractWhatsAppExplicit,
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

  it("(5.31) lead JÁ com site (Google) também tem o site oficial enriquecido (instagram + contato)", async () => {
    const leads = [{ name: "Pet Care Banho e Tosa", city: "Guarulhos", state: "SP", website: "https://petcareguarulhos.com.br", has_website: true, instagram: null, phone: null, whatsapp: null }];
    const web = { tavily: [], firecrawl: [] };
    const scrape = vi.fn(async () => "Somos a Pet Care. Atendimento (11) 912345678 · instagram.com/petcareguarulhos");
    const { leads: out, summary } = await enrichLeadsWithWeb({ leads: [...leads], web, city: "Guarulhos", state: "SP", scrape, maxScrape: 2 });
    expect(summary.scrapeAttempted).toBe(1);
    expect(out[0].whatsapp).toBe("5511912345678");
    expect(out[0].instagram).toBe("petcareguarulhos");
    // lead não foi duplicado nem removido
    expect(out.length).toBe(1);
  });

  it("(5.31) instagram é encontrado direto nos resultados web (sem scrape)", () => {
    const items = [
      { title: "Pet Care Banho e Tosa (@petcareguarulhos) • Fotos", url: "https://instagram.com/petcareguarulhos", description: "Pet Care Guarulhos" },
    ];
    expect(matchInstagramHandle("Pet Care Banho e Tosa", items)).toBe("petcareguarulhos");
  });

  it("(5.31) NÃO atribui instagram de outro negócio ao lead", () => {
    const items = [
      { title: "Cobasi Guarulhos", url: "https://instagram.com/cobasiloja", description: "Rede de pets" },
    ];
    expect(matchInstagramHandle("Pet Care Banho e Tosa", items)).toBeNull();
  });

  it("(5.31) telefone da página oficial é aceito mesmo sem texto de cidade (geografia veio do Google)", () => {
    const page = "Fale conosco: (11) 912345678";
    const c = extractContactsFromMarkdown(page, "Guarulhos", "SP", { requireGeo: false });
    expect(c.phone).toBe("+55 11 91234 5678");
    expect(c.whatsapp).toBe("5511912345678");
    // comportamento antigo (sem o flag) continua exigindo cidade
    const strict = extractContactsFromMarkdown(page, "Guarulhos", "SP");
    expect(strict.phone).toBeNull();
  });

  it("(5.33) WhatsApp explícito (wa.me / api.whatsapp.com / rótulo) é encontrado", () => {
    expect(extractWhatsAppExplicit("https://wa.me/5511912345678?text=Oi")).toBe("5511912345678");
    expect(extractWhatsAppExplicit("https://api.whatsapp.com/send?phone=5511987654321&text=ola")).toBe("5511987654321");
    expect(extractWhatsAppExplicit("WhatsApp: (11) 91234-5678")).toBe("5511912345678");
    const page = "Fale pelo WhatsApp no wa.me/5511912345678 — atendemos em Guarulhos/SP.";
    const c = extractContactsFromMarkdown(page, "Guarulhos", "SP");
    expect(c.whatsapp).toBe("5511912345678");
    expect(c.whatsappEvidence).toBe("link");
  });

  it("(5.33) telefone FIXO não vira WhatsApp sem evidência explícita", () => {
    const page = "Telefone: (11) 3456-7890 — em Guarulhos/SP";
    const c = extractContactsFromMarkdown(page, "Guarulhos", "SP");
    expect(c.phone).toBe("+55 11 3456 7890");
    expect(c.whatsapp).toBeNull();
  });

  it("(5.33) lead sem WhatsApp/site/Instagram continua válido e não é eliminado", async () => {
    const leads = [{ name: "Mercadinho Bom Preço", city: "Guarulhos", state: "SP", address: "Rua X", phone: null, whatsapp: null, instagram: null, website: null, has_website: false }];
    const { leads: out } = await enrichLeadsWithWeb({ leads: [...leads], web: { tavily: [], firecrawl: [] }, city: "Guarulhos", state: "SP" });
    expect(out.length).toBe(1);
    expect(out[0].whatsapp).toBeNull();
    expect(out[0].instagram).toBeNull();
    expect(out[0].website).toBeNull();
  });

  it("(5.33) proveniência fica registrada em sources/score_reasons", async () => {
    const leads = [{ name: "Pet Care Banho e Tosa", city: "Guarulhos", state: "SP", website: "https://petcareguarulhos.com.br", has_website: true, phone: null, whatsapp: null, instagram: null }];
    const scrape = vi.fn(async () => "Instagram: instagram.com/petcareguarulhos · WhatsApp (11) 912345678");
    const { leads: out } = await enrichLeadsWithWeb({ leads, web: { tavily: [], firecrawl: [] }, city: "Guarulhos", state: "SP", scrape, maxScrape: 2 });
    const src = (out[0] as unknown as { sources?: Record<string, string> }).sources ?? {};
    expect(out[0].whatsapp).toBe("5511912345678");
    expect(src.whatsapp).toMatch(/website oficial/);
    expect(src.instagram).toMatch(/website oficial/);
  });

  it("(5.33) instagram usa evidência combinada nome+cidade (sem atribuir filial de outra cidade)", () => {
    const rj = [
      { title: "Rede de padarias no Rio de Janeiro", url: "https://instagram.com/confrariadopao", description: "nossa filial carioca" },
    ];
    expect(matchInstagramHandle("Padaria Real", rj, { city: "Guarulhos", state: "SP" })).toBeNull();
    const sp = [
      { title: "Padaria Real Guarulhos", url: "https://instagram.com/padariarealguarulhos", description: "nossa unidade em Guarulhos" },
    ];
    expect(matchInstagramHandle("Padaria Real", sp, { city: "Guarulhos", state: "SP" })).toBe("padariarealguarulhos");
  });
});
