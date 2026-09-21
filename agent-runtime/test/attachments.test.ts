import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeAttachments } from "../src/attachments";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
let root = "";

beforeAll(() => { root = mkdtempSync(join(tmpdir(), "prospector-attach-")); });
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

describe("Attachments (5.26)", () => {
  it("copia o anexo para public/assets e expõe o caminho PÚBLICO (site realmente usa)", () => {
    const r = materializeAttachments(root, [{ name: "logo.png", mediaType: "image/png", dataUrl: `data:image/png;base64,${png.toString("base64")}` }]);
    expect(r.ok).toBe(true);
    const a = r.attachments[0] as { name: string; publicPath?: string };
    expect(a.publicPath).toBe(`/assets/${a.name}`);
    expect(existsSync(join(root, "public", "assets", a.name))).toBe(true);
    const buf = readFileSync(join(root, "public", "assets", a.name));
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("materializa imagem no workspace como ARQUIVO BINÁRIO real (não a data URL em texto)", () => {
    const r = materializeAttachments(root, [{ name: "meu-pet.png", mediaType: "image/png", dataUrl: `data:image/png;base64,${png.toString("base64")}` }]);
    expect(r.ok).toBe(true);
    expect(r.attachments.length).toBe(1);
    expect(r.attachments[0].path).toMatch(/^assets\/meu-pet-\d+\.png$/);
    const buf = readFileSync(join(root, r.attachments[0].path));
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); // PNG REAL no disco
    expect(buf.length).toBe(png.length); // bytes reais (não o tamanho da data URL)
    expect(r.attachments[0].bytes).toBe(png.length);
    expect(existsSync(join(root, "assets"))).toBe(true);
  });

  it("bloqueia arquivos perigosos (.env, exe, traversal)", () => {
    // .env: mesmo se aceito, o nome é sanitizado — NUNCA persiste um arquivo ".env".
    const r1 = materializeAttachments(root, [{ name: ".env", mediaType: "text/plain", dataUrl: "data:text/plain;base64," + Buffer.from("SECRET").toString("base64") }]);
    if (r1.ok && r1.attachments.length) {
      expect(r1.attachments[0].path).not.toMatch(/(^|\/)\.env($|\.)/);
      expect(existsSync(join(root, "assets", ".env"))).toBe(false);
    } else {
      expect(r1.errors.length).toBeGreaterThan(0);
    }
    const r2 = materializeAttachments(root, [{ name: "../../fora.exe", mediaType: "application/x-msdownload", dataUrl: "data:application/octet-stream;base64," + Buffer.from("x").toString("base64") }]);
    expect(r2.ok).toBe(false);
    const r3 = materializeAttachments(root, [{ name: "script.sh", mediaType: "application/x-sh", dataUrl: "data:text/x-sh;base64," + Buffer.from("rm -rf").toString("base64") }]);
    expect(r3.ok).toBe(false);
  });

  it("rejeita tipo não suportado (exe)", () => {
    const r = materializeAttachments(root, [{ name: "app.exe", mediaType: "application/x-msdownload", dataUrl: `data:application/octet-stream;base64,${Buffer.from("MZ").toString("base64")}` }]);
    expect(r.ok).toBe(false);
  });

  it("rejeita grande demais (>2MB)", () => {
    const big = Buffer.alloc(2_500_000, 1).toString("base64");
    const r = materializeAttachments(root, [{ name: "big.png", mediaType: "image/png", dataUrl: `data:image/png;base64,${big}` }]);
    expect(r.ok).toBe(false);
  });

  it("permite texto/PDF (documentos)", () => {
    const r = materializeAttachments(root, [{ name: "notas.txt", mediaType: "text/plain", dataUrl: "data:text/plain;base64," + Buffer.from("conteúdo real").toString("base64") }]);
    expect(r.ok).toBe(true);
    expect(r.attachments[0].path).toMatch(/\.txt$/);
  });

  it("anexo vazio/ausente → ok sem erros", () => {
    const r = materializeAttachments(root, []);
    expect(r.ok).toBe(true);
    expect(r.attachments.length).toBe(0);
  });
});
