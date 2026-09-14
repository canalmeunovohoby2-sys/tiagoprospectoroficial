import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const buildSpy = vi.hoisted(() => vi.fn());
vi.mock("../src/studio/build", () => ({ buildReactProject: buildSpy }));

import { prepareSiteServeDir } from "../src/server";

const BUILT_HTML = "<!doctype html><html><body><h1>Site REAL compilado</h1></body></html>";

function mkRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "serve-dir-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return root;
}

beforeEach(() => { buildSpy.mockReset(); });

describe("Proposta/Vídeo · preparação do diretório servido (site REAL)", () => {
  it("SITE ESTÁTICO: serve o próprio workspace, sem compilar (comportamento preservado)", async () => {
    const root = mkRoot({ "index.html": "<!doctype html><html><body><h1>Estático</h1></body></html>" });
    try {
      const out = await prepareSiteServeDir(root);
      expect(out.dir).toBe(root);
      expect(out.temp).toBeUndefined();
      expect(buildSpy).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("PROJETO REACT: COMPILA e serve o HTML final (nunca o código-fonte → captura/vídeo em branco)", async () => {
    const root = mkRoot({ "package.json": "{}", "index.html": "<div id='root'></div>", "src/main.tsx": "x" });
    buildSpy.mockResolvedValue({ ok: true, html: BUILT_HTML });
    try {
      const out = await prepareSiteServeDir(root);
      expect(buildSpy).toHaveBeenCalledWith(root);
      expect(out.temp).toBeTruthy();
      expect(out.dir).not.toBe(root);
      expect(readFileSync(join(out.dir, "index.html"), "utf8")).toContain("Site REAL compilado");
      if (out.temp) rmSync(out.temp, { recursive: true, force: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("FALHA DE BUILD: erro explícito (nunca captura site em branco silenciosamente)", async () => {
    const root = mkRoot({ "package.json": "{}", "index.html": "<div id='root'></div>", "src/main.tsx": "x" });
    buildSpy.mockResolvedValue({ ok: false, error: "vite build falhou" });
    try {
      await expect(prepareSiteServeDir(root)).rejects.toThrow(/vite build falhou/);
      expect(existsSync(join(root, ".prospector-serve"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
