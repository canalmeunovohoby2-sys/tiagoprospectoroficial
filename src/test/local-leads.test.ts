import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "jwt-teste" } } }) } },
}));

import { localQuery, localScrapersEnabled, mergeLocalPlaces, searchLocalPlaces } from "@/lib/localLeadScrapers";
import { setAgentRuntimeMode } from "@/lib/siteProjectsApi";

const BIG = "https://lh3.googleusercontent.com/gps-cs-s/BIG=w408-h544-k-no";

beforeEach(() => {
  vi.unstubAllGlobals();
  setAgentRuntimeMode("auto");
});

describe("leads locais · modo do runtime", () => {
  it("no modo Nuvem o scraper local fica desligado", () => {
    setAgentRuntimeMode("remote");
    expect(localScrapersEnabled()).toBe(false);
  });

  it("no modo automático/Este computador fica ligado", () => {
    setAgentRuntimeMode("auto");
    expect(localScrapersEnabled()).toBe(true);
    setAgentRuntimeMode("local");
    expect(localScrapersEnabled()).toBe(true);
  });
});

describe("leads locais · chamada pelo Agent Runtime (nunca 8788/8789 direto)", () => {
  it("faz POST em 127.0.0.1:8787/maps com o JWT do usuário", async () => {
    const chamadas: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      chamadas.push({ url: String(url), init });
      return { ok: true, json: async () => ({ places: [{ title: "Ultra Academia" }] }) } as unknown as Response;
    }));
    const out = await searchLocalPlaces("maps", "academia em Bertioga, SP", 10);
    expect(out).toHaveLength(1);
    expect(chamadas[0].url).toBe("http://127.0.0.1:8787/maps");
    expect((chamadas[0].init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-teste");
    expect(JSON.parse(String(chamadas[0].init.body))).toMatchObject({ query: "academia em Bertioga, SP", maxPlaces: 10 });
  });

  it("usa /photos quando pedido (mesma ponte)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ places: [] }) }) as unknown as Response));
    await searchLocalPlaces("photos", "Ultra Academia Bertioga");
    expect(String((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).toBe("http://127.0.0.1:8787/photos");
  });

  it("falha do runtime/motor não quebra a busca (devolve vazio)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("runtime fora do ar"); }));
    await expect(searchLocalPlaces("maps", "academia em Bertioga, SP")).resolves.toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "502" }) }) as unknown as Response));
    await expect(searchLocalPlaces("maps", "academia em Bertioga, SP")).resolves.toEqual([]);
  });

  it("query vazia não chama a rede", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await searchLocalPlaces("maps", "   ")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("leads locais · merge com os providers atuais", () => {
  it("adiciona lead novo vindo do scraper local", () => {
    const out = mergeLocalPlaces([], [{ id: "ChIJ1", title: "Ultra Academia", address: "Av. 19 de Maio, 186", phoneNumber: "(13) 99700-6857", completePhoneNumber: "+55 13 99700-6857", coor: "-23.835,-46.131", stars: 4.9, reviews: 23, thumbnail: BIG, images: [BIG], url_place: "https://www.google.com/maps/place/?q=place_id:ChIJ1" }], { city: "Bertioga", state: "SP" });
    expect(out).toHaveLength(1);
    const lead = out[0] as Record<string, unknown>;
    expect(lead.name).toBe("Ultra Academia");
    expect(lead.phone).toBe("+55 13 99700-6857");
    expect(lead.whatsapp).toBe("5513997006857");
    expect(lead.latitude).toBeCloseTo(-23.835);
    expect(lead.photoUrl).toBe(BIG);
    expect(lead.has_website).toBe(false);
  });

  it("lead que já veio de outra fonte só é COMPLETADO, nunca sobrescrito", () => {
    const existente = { external_id: "ChIJ1", name: "Ultra Academia", phone: "+55 13 1111-2222", website: "https://ja-tinha.com", rating: 3 };
    const out = mergeLocalPlaces([existente], [{ id: "ChIJ1", title: "Ultra Academia", phoneNumber: "(13) 99700-6857", stars: 4.9, thumbnail: BIG }], { city: "Bertioga", state: "SP" });
    expect(out).toHaveLength(1);
    const lead = out[0] as Record<string, unknown>;
    expect(lead.phone).toBe("+55 13 1111-2222");   // preservado
    expect(lead.website).toBe("https://ja-tinha.com"); // preservado
    expect(lead.rating).toBe(3);                    // preservado
    expect(lead.photoUrl).toBe(BIG);                // completado (estava vazio)
  });

  it("sem resultados locais, a lista original volta intacta", () => {
    const leads = [{ external_id: "a" }, { external_id: "b" }];
    expect(mergeLocalPlaces(leads, [], { city: "Bertioga", state: "SP" })).toBe(leads);
  });

  it("monta o termo no padrão dos providers", () => {
    expect(localQuery("academia", "Bertioga", "SP")).toBe("academia em Bertioga, SP");
  });
});

describe("leads locais · fiação na UI", () => {
  it("o LeadSearchForm usa o scraper local sem remover a edge search-places", () => {
    const src = readFileSync(join(process.cwd(), "src/components/app/LeadSearchForm.tsx"), "utf8");
    expect(src).toContain('invoke<StartResponse>("search-places"');
    expect(src).toContain("localScrapersEnabled()");
    expect(src).toContain('searchLocalPlaces("maps"');
    expect(src).toContain("mergeLocalPlaces(edgeLeads");
  });

  it("nenhuma porta 8788/8789 aparece no frontend (só o runtime 8787)", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/localLeadScrapers.ts"), "utf8");
    expect(src).not.toContain(":8788");
    expect(src).not.toContain(":8789");
    expect(src).toContain("LOCAL_AGENT_RUNTIME_URL");
    expect(src).not.toContain("railway.app");
  });
});
