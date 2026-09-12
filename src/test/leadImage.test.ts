import { describe, it, expect } from "vitest";
import { resolveLeadImage } from "@/lib/leadImage";

describe("resolveLeadImage", () => {
  it("aceita URL https", () => {
    const r = resolveLeadImage("https://lh3.googleusercontent.com/abc=w400");
    expect(r.hasImage).toBe(true);
    expect(r.url).toContain("lh3.googleusercontent.com");
  });

  it("converte http em https", () => {
    const r = resolveLeadImage("http://exemplo.com/foto.jpg");
    expect(r.hasImage).toBe(true);
    expect(r.url).toBe("https://exemplo.com/foto.jpg");
  });

  it("retorna sem imagem para vazio, nulo e não-string", () => {
    expect(resolveLeadImage("").hasImage).toBe(false);
    expect(resolveLeadImage("   ").hasImage).toBe(false);
    expect(resolveLeadImage(null).hasImage).toBe(false);
    expect(resolveLeadImage(undefined).hasImage).toBe(false);
    expect(resolveLeadImage(123).hasImage).toBe(false);
  });

  it("trata URL inválida como sem imagem", () => {
    expect(resolveLeadImage("not-a-url").hasImage).toBe(false);
    expect(resolveLeadImage("/relative/path.jpg").hasImage).toBe(false);
  });

  it("rejeita protocolos não http(s)", () => {
    expect(resolveLeadImage("javascript:alert(1)").hasImage).toBe(false);
    expect(resolveLeadImage("data:image/png;base64,AAAA").hasImage).toBe(false);
  });
});
