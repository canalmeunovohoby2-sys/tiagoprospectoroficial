import { describe, it, expect, vi } from "vitest";
import { buildPlacePhotoProxyUrl, isGooglePlaceId, enrichLeadsWithGooglePhotos } from "../../supabase/functions/_shared/google-photo";

const PROXY = "https://proj.supabase.co";

describe("google-photo — foto oficial via Places (New) + proxy", () => {
  it("monta a URL do proxy sem expor a key", () => {
    const url = buildPlacePhotoProxyUrl(PROXY, "places/ChIJabc/photos/AeJf", 800);
    expect(url).toBe("https://proj.supabase.co/functions/v1/place-photo?name=places%2FChIJabc%2Fphotos%2FAeJf&w=800");
    expect(url).not.toContain("key=");
  });

  it("isGooglePlaceId aceita ChIJ e rejeita fallback nome|endereço", () => {
    expect(isGooglePlaceId("ChIJHYE--chRzpQR3uGP-vlriR4")).toBe(true);
    expect(isGooglePlaceId("Empresa X|Rua A, 10")).toBe(false);
    expect(isGooglePlaceId("curto")).toBe(false);
    expect(isGooglePlaceId(null)).toBe(false);
  });

  it("preenche a foto dos leads sem imagem e com place_id (respeita orçamento)", async () => {
    const leads = [
      { photoUrl: null as string | null, placeId: "ChIJplace0000000000000000000" },
      { photoUrl: "https://ja/tem.jpg" as string | null, placeId: "ChIJplace1111111111111111111" },
      { photoUrl: null as string | null, placeId: "Nome|Endereço" },
      { photoUrl: null as string | null, placeId: "ChIJplace2222222222222222222" },
    ];
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ photos: [{ name: "places/ChIJx/photos/Ref1" }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const r = await enrichLeadsWithGooglePhotos(leads, { apiKey: "k", proxyBase: PROXY, fetchImpl, budget: 5, concurrency: 2 });
    expect(r.attempted).toBe(2); // só os sem foto E com place_id válido
    expect(r.enriched).toBe(2);
    expect(leads[0].photoUrl).toBe("https://proj.supabase.co/functions/v1/place-photo?name=places%2FChIJx%2Fphotos%2FRef1&w=800");
    expect(leads[1].photoUrl).toBe("https://ja/tem.jpg"); // não sobrescreve
    expect(leads[2].photoUrl).toBeNull(); // place_id inválido
  });

  it("sem apiKey ou proxyBase não faz nada (não quebra)", async () => {
    const leads = [{ photoUrl: null as string | null, placeId: "ChIJplace0000000000000000000" }];
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect((await enrichLeadsWithGooglePhotos(leads, { fetchImpl })).attempted).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resposta sem photos ou erro HTTP → lead fica sem foto", async () => {
    const leads = [{ photoUrl: null as string | null, placeId: "ChIJplace0000000000000000000" }];
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    expect((await enrichLeadsWithGooglePhotos(leads, { apiKey: "k", proxyBase: PROXY, fetchImpl })).enriched).toBe(0);
    expect(leads[0].photoUrl).toBeNull();
  });
});
