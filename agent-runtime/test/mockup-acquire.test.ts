import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sniffImageKind, readImageDimensions, validateAssetFile, downloadAssetSafe, scanLocalMockups, associateLocalAsset } from "../src/mockup-acquire";

const PNG1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const JPG1x1 = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==", "base64");

const tmp = join(process.cwd(), ".tmp-acq");

describe("mockup-acquire — snif/imagens/dimensões (6.10)", () => {
  it("reconhece PNG e lê dimensões", () => {
    expect(sniffImageKind(PNG1x1)).toBe("png");
    expect(readImageDimensions(PNG1x1, "png")).toEqual({ width: 1, height: 1 });
  });
  it("reconhece JPEG e lê dimensões", () => {
    expect(sniffImageKind(JPG1x1)).toBe("jpeg");
    expect(readImageDimensions(JPG1x1, "jpeg")).toEqual({ width: 1, height: 1 });
  });
  it("rejeita HTML salvo como imagem (sem assinatura)", () => {
    expect(sniffImageKind(Buffer.from("<html>não é imagem</html>"))).toBeNull();
  });
});

describe("mockup-acquire — validação física + download seguro (6.10)", () => {
  beforeEach(() => { rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true }); });

  it("valida arquivo real presente (dimensões/hash) e rejeita vazio/HTML", () => {
    const real = join(tmp, "real.png");
    writeFileSync(real, PNG1x1);
    const v = validateAssetFile(real, { hash: true });
    expect(v.ok).toBe(true);
    expect(v.width).toBe(1);
    expect(v.hash).toMatch(/^[0-9a-f]{64}$/);

    const fake = join(tmp, "fake.png");
    writeFileSync(fake, "<html>nope</html>");
    expect(validateAssetFile(fake).ok).toBe(false);

    const empty = join(tmp, "empty.png");
    writeFileSync(empty, "");
    expect(validateAssetFile(empty).error).toMatch(/vazio/);
  });

  it("downloadAssetSafe baixa imagem real e rejeita HTML/status de erro (fetch injetável)", async () => {
    const dest = join(tmp, "dl.png");
    const okFetch = (async () => ({ ok: true, headers: new Headers({ "content-type": "image/png" }), arrayBuffer: async () => Uint8Array.from(PNG1x1).buffer })) as unknown as typeof fetch;
    const okRes = await downloadAssetSafe("https://x/mock.png", dest, { fetcher: okFetch });
    expect(okRes.ok).toBe(true);
    expect(validateAssetFile(dest).width).toBe(1);

    const htmlFetch = (async () => ({ ok: true, headers: new Headers({ "content-type": "text/html" }), arrayBuffer: async () => Buffer.from("<html>") })) as unknown as typeof fetch;
    expect((await downloadAssetSafe("https://x/a.png", join(tmp, "a.png"), { fetcher: htmlFetch })).ok).toBe(false);

    const errFetch = (async () => ({ ok: false, status: 404, headers: new Headers({ "content-type": "image/png" }) })) as unknown as typeof fetch;
    expect((await downloadAssetSafe("https://x/b.png", join(tmp, "b.png"), { fetcher: errFetch })).error).toMatch(/404/);
  });

  it("scanLocalMockups detecta apenas arquivos de imagem válidos", () => {
    writeFileSync(join(tmp, "ok.png"), PNG1x1);
    writeFileSync(join(tmp, "fake.jpg"), "<html>");
    const scan = scanLocalMockups(tmp);
    expect(scan.length).toBe(1);
    expect(scan[0].type).toBe("png");
  });

  it("associateLocalAsset NUNCA infere licença (unknown → blocked)", () => {
    const rec = associateLocalAsset("/a.png", "https://mockupworld.co/x", "Mockup World", "unknown", false);
    expect(rec.licenseStatus).toBe("unknown");
    expect(rec.commercialAllowed).toBe(false);
    expect(rec.status).toBe("blocked");
    expect(rec.verified).toBe(false);
  });
});
