import { describe, it, expect, vi, beforeEach } from "vitest";
import { assetToResult, defaultImageSearch, searchImagesViaEdge, validateImageUrl } from "../src/image-pipeline";

// ITEM 2 da rodada cirúrgica: o caminho PRINCIPAL de imagens passa a ser o mecanismo
// real do projeto (Supabase Edge `get-images` → Pexels), com URL direta do CDN e alt
// real. Web search fica só como fallback — e nunca se inventa URL.
beforeEach(() => {
  vi.unstubAllGlobals();
  process.env.SUPABASE_URL = "https://xxxx.supabase.co";
  process.env.SUPABASE_ANON_KEY = "chave-teste";
});

describe("pesquisa de imagens real (Pexels via get-images)", () => {
  it("mapeia o asset do Pexels para URL direta + alt (usado na relevância)", () => {
    const r = assetToResult({ url: "https://images.pexels.com/photos/1/solar.jpeg", alt: "painéis solares em telhado residencial", photographer: "Ana" });
    expect(r?.url).toContain("images.pexels.com");
    expect(r?.title).toContain("painéis solares");
    expect(r?.description).toContain("Ana");
  });

  it("descarta asset sem URL http (nunca fabrica)", () => {
    expect(assetToResult({ alt: "sem url" })).toBeNull();
    expect(assetToResult({ url: "data:image/png;base64,xx" })).toBeNull();
  });

  it("chama o get-images com a query contextual e devolve candidatos reais", async () => {
    const chamadas: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      chamadas.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return {
        ok: true,
        json: async () => ({ provider: "pexels", assets: [{ url: "https://images.pexels.com/photos/9/painel-solar.jpeg", alt: "instalação de painel solar em casa moderna" }] }),
      } as unknown as Response;
    }));
    const out = await searchImagesViaEdge("energia solar instalação painel solar casa moderna", 6, "landscape");
    expect(chamadas[0].url).toBe("https://xxxx.supabase.co/functions/v1/get-images");
    expect(chamadas[0].body.query).toContain("energia solar");
    expect(chamadas[0].body.orientation).toBe("landscape");
    expect(out).toHaveLength(1);
    expect(out[0].url).toContain("images.pexels.com");
  });

  it("defaultImageSearch usa o mecanismo real primeiro", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(String(url));
      return { ok: true, json: async () => ({ assets: [{ url: "https://images.pexels.com/photos/2/usinagem.jpeg", alt: "torno CNC usinando metal em fábrica" }] }) } as unknown as Response;
    }));
    const out = await defaultImageSearch("usinagem CNC fábrica");
    expect(urls[0]).toContain("/functions/v1/get-images");
    expect(out[0].url).toContain("images.pexels.com");
  });

  it("valida que a URL responde como imagem de verdade (content-type)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: { get: () => "image/jpeg" } }) as unknown as Response));
    expect(await validateImageUrl("https://images.pexels.com/photos/3/a.jpeg")).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, headers: { get: () => "text/html" } }) as unknown as Response));
    expect(await validateImageUrl("https://site.com/pagina")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await validateImageUrl("https://images.pexels.com/x.jpeg")).toBe(false);
  });

  it("sem SUPABASE_URL devolve vazio (cai no fallback do chamador)", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await searchImagesViaEdge("energia solar")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
