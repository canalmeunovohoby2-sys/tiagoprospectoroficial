import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveVisionCapability, imageToDataUrl, VISION_MODEL_HINTS } from "../src/vision";

describe("Vision capability (5.22)", () => {
  it("deepseek NÃO suporta imagem (honestidade — não fingir visão)", () => {
    const v = resolveVisionCapability({ provider: "deepseek", model: "deepseek-chat" });
    expect(v.supported).toBe(false);
    expect(v.reason).toMatch(/deepseek/);
  });

  it("modelos vision conhecidos são detectados", () => {
    expect(resolveVisionCapability({ provider: "openai", model: "gpt-4o" }).supported).toBe(true);
    expect(resolveVisionCapability({ provider: "google", model: "gemini-2.5-flash" }).supported).toBe(true);
    expect(resolveVisionCapability({ provider: "anthropic", model: "claude-sonnet-4" }).supported).toBe(true);
  });

  it("deepseek com sufixo que parece vision NÃO é enganado", () => {
    const v = resolveVisionCapability({ provider: "deepseek", model: "deepseek-vl2" });
    expect(v.supported).toBe(false);
  });

  it("override explícito habilita visão", () => {
    const prev = process.env.PROSPECTOR_VISION;
    const prevM = process.env.PROSPECTOR_VISION_MODEL;
    process.env.PROSPECTOR_VISION = "1";
    process.env.PROSPECTOR_VISION_MODEL = "gpt-4o";
    const v = resolveVisionCapability({ provider: "openai", model: "gpt-4o" });
    expect(v.supported).toBe(true);
    if (prev === undefined) delete process.env.PROSPECTOR_VISION; else process.env.PROSPECTOR_VISION = prev;
    if (prevM === undefined) delete process.env.PROSPECTOR_VISION_MODEL; else process.env.PROSPECTOR_VISION_MODEL = prevM;
  });

  it("allowlist inclui modelos vision", () => {
    expect(VISION_MODEL_HINTS).toContain("gpt-4o");
    expect(VISION_MODEL_HINTS).toContain("gemini-2.5");
  });
});

describe("imageToDataUrl (screenshot → base64)", () => {
  let dir = "";
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "prospector-vision-")); });
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  it("converte PNG pequeno em data URL base64", async () => {
    // PNG 1x1 válido.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const file = join(dir, "shot.png");
    writeFileSync(file, png);
    const out = await imageToDataUrl(file);
    expect(out).not.toBeNull();
    expect(out?.mediaType).toBe("image/png");
    expect(out?.data).toBe(png.toString("base64"));
  });

  it("retorna null para arquivo inexistente", async () => {
    expect(await imageToDataUrl(join(dir, "nao-existe.png"))).toBeNull();
  });
});
