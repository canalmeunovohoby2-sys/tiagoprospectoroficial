import { describe, it, expect, vi, afterEach } from "vitest";
import { filterWorkingImages } from "../src/studio/agent-core/site-media";

const REAL_IMG = "https://tile.openstreetmap.org/13/3728/6090.png";

afterEach(() => { vi.unstubAllGlobals(); });

describe("imagens · validação HTTP antes de entrarem no site", () => {
  it("mantém só URLs que respondem IMAGEM (e preserva a ordem)", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method}:${url}`);
      if (url.endsWith("/ok.jpg")) return new Response("", { status: 200, headers: { "content-type": "image/jpeg" } });
      if (url.endsWith("/html.png")) return new Response("", { status: 200, headers: { "content-type": "text/html" } });
      if (url.endsWith("/dead.jpg")) return new Response("", { status: 404 });
      return new Response("", { status: 200, headers: { "content-type": "image/png" } });
    }) as never);

    const out = await filterWorkingImages([
      "https://cdn.test/ok.jpg",
      "https://cdn.test/html.png",
      "https://cdn.test/dead.jpg",
      "https://cdn.test/ok.jpg", // duplicada
      "nao-e-url",
    ]);
    expect(out).toEqual(["https://cdn.test/ok.jpg"]);
    expect(calls.some((c) => c.startsWith("HEAD:"))).toBe(true);
  });

  it("HEAD rejeitado cai para GET com Range", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.method === "HEAD") return new Response("", { status: 405 });
      return new Response("", { status: 206, headers: { "content-type": "image/webp" } });
    }) as never);
    expect(await filterWorkingImages(["https://cdn.test/x.webp"])).toEqual(["https://cdn.test/x.webp"]);
  });

  it("falha de rede não quebra: a imagem é descartada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }) as never);
    expect(await filterWorkingImages(["https://cdn.test/y.jpg"])).toEqual([]);
  });

  it("REAL: valida uma imagem pública de verdade (HTTP + content-type)", async () => {
    const out = await filterWorkingImages([REAL_IMG, "https://exemplo.invalid/nao-existe.jpg"], { timeoutMs: 8000 });
    expect(out).toContain(REAL_IMG);
    expect(out).not.toContain("https://exemplo.invalid/nao-existe.jpg");
  }, 30000);
});
