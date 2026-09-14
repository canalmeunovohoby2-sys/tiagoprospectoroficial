import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { buildSiteMediaContext, parsePlaceId, fetchIllustrativeImages } from "@/lib/studio/siteMediaContext";

describe("siteMediaContext · dados reais do lead → contexto do gerador", () => {
  beforeEach(() => { invokeMock.mockReset(); });

  it("usa a foto REAL do lead (photo_name) e normaliza para https", () => {
    const ctx = buildSiteMediaContext({
      name: "Pet Amigo", segment: "Pet Shop", address: "Av. Anchieta, 11305",
      photoName: "http://cdn.exemplo.com/fachada.jpg",
      googleUrl: "https://www.google.com/maps/place/?q=place_id:ChIJabc1234567890",
      latitude: -22.31, longitude: -49.06,
    });
    expect(ctx.photos).toEqual(["https://cdn.exemplo.com/fachada.jpg"]);
    expect(ctx.address).toBe("Av. Anchieta, 11305");
    expect(ctx.placeId).toBe("ChIJabc1234567890");
    expect(ctx.latitude).toBe(-22.31);
    expect(ctx.longitude).toBe(-49.06);
  });

  it("sem foto real → photos vazio (nunca inventa imagem)", () => {
    expect(buildSiteMediaContext({ name: "X", photoName: null }).photos).toEqual([]);
    expect(buildSiteMediaContext({ name: "X", photoName: "nao-e-url" }).photos).toEqual([]);
  });

  it("parsePlaceId só aceita place_id real; ignora o resto", () => {
    expect(parsePlaceId("https://www.google.com/maps/place/?q=place_id:ChIJabc1234567890")).toBe("ChIJabc1234567890");
    expect(parsePlaceId("https://maps.google.com/?cid=123")).toBeNull();
    expect(parsePlaceId(null)).toBeNull();
  });

  it("category cai para o segmento quando ausente", () => {
    expect(buildSiteMediaContext({ segment: "Restaurante" }).category).toBe("Restaurante");
    expect(buildSiteMediaContext({ segment: "Restaurante", category: "Alimentação" }).category).toBe("Alimentação");
  });

  it("isola: dados de um lead não vazam para outro", () => {
    const a = buildSiteMediaContext({ name: "A", address: "Rua A, 1", photoName: "https://x/a.jpg", googleUrl: "place_id:ChIJaaaaaaaaaaaaaa" });
    const b = buildSiteMediaContext({ name: "B", address: "Rua B, 2", photoName: "https://x/b.jpg" });
    expect(a.address).toBe("Rua A, 1");
    expect(a.photos[0]).toContain("/a.jpg");
    expect(b.photos[0]).toContain("/b.jpg");
    expect(b.placeId).toBeNull();
  });

  it("imagens ilustrativas usam o sistema existente (get-images) e são best-effort", async () => {
    invokeMock.mockResolvedValueOnce({ data: { assets: [{ url: "https://images.pexels.com/photos/1/a.jpeg" }, { url: "x" }] }, error: null });
    const urls = await fetchIllustrativeImages("Pet Shop", 4);
    expect(invokeMock).toHaveBeenCalledWith("get-images", expect.objectContaining({ body: expect.objectContaining({ count: 4 }) }));
    expect(urls).toEqual(["https://images.pexels.com/photos/1/a.jpeg"]);

    invokeMock.mockResolvedValueOnce({ data: null, error: { message: "sem PEXELS_API_KEY" } });
    expect(await fetchIllustrativeImages("Pet Shop")).toEqual([]);
  });
});
