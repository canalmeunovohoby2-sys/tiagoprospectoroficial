import { describe, it, expect, afterEach, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clientSafeFiles, materializeWorkspace, readWorkspace } from "../src/workspace";

// O asset anexado precisa: (1) existir em disco como BYTES, (2) aparecer na árvore
// do Studio (files do cliente) e (3) sobreviver ao ciclo árvore → disco.
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "asset-test-"));
}

afterEach(() => vi.unstubAllGlobals());

describe("asset do usuário · disco + árvore + ciclo", () => {
  it("binário vira DATA URL na saída (aparece na árvore, sem NUL para o banco)", () => {
    const raw = PNG.toString("utf8");
    const out = clientSafeFiles({ "public/assets/logo.png": raw, "src/App.tsx": "x" });
    expect(out["public/assets/logo.png"]).toMatch(/^data:image\/png;base64,/);
    expect(out["public/assets/logo.png"]).not.toContain("\u0000");
    expect(out["src/App.tsx"]).toBe("x");
  });

  it("data URL que volta do cliente é gravada como BYTES REAIS no disco", () => {
    const root = tmpRoot();
    try {
      const dataUrl = `data:image/png;base64,${PNG.toString("base64")}`;
      materializeWorkspace(root, { "public/assets/logo.png": dataUrl, "src/App.tsx": "export default 1" });
      const file = join(root, "public", "assets", "logo.png");
      expect(existsSync(file)).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); // PNG real
      // e o arquivo aparece na árvore lida de volta
      const tree = readWorkspace(root);
      expect(Object.keys(tree)).toContain("public/assets/logo.png");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("ciclo COMPLETO sem corrupção: bytes → readWorkspace → materializeWorkspace → bytes iguais", () => {
    const dir = tmpRoot();
    try {
      mkdirSync(join(dir, "public", "assets"), { recursive: true });
      const original = PNG; // 16 bytes
      writeFileSync(join(dir, "public", "assets", "hero.png"), original);
      const tree = readWorkspace(dir);
      expect(tree["public/assets/hero.png"]).toMatch(/^data:image\/png;base64,/);
      // volta para o disco (como o sync do cliente faz)
      const dir2 = tmpRoot();
      materializeWorkspace(dir2, { "public/assets/hero.png": tree["public/assets/hero.png"] });
      const back = readFileSync(join(dir2, "public", "assets", "hero.png"));
      expect(back.equals(original)).toBe(true);                       // bytes idênticos
      expect(back.subarray(0, 4).toString("hex")).toBe("89504e47");    // PNG real
      rmSync(dir2, { recursive: true, force: true });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("PNG com NUL nunca é enviado como texto cru (evita o erro do Postgres)", () => {
    const dir = tmpRoot();
    try {
      mkdirSync(join(dir, "assets"), { recursive: true });
      writeFileSync(join(dir, "assets", "x.png"), PNG); // binário de verdade no disco
      const tree = readWorkspace(dir);
      const out = clientSafeFiles(tree);
      expect(out["assets/x.png"]).toMatch(/^data:image\/png;base64,/);
      expect(out["assets/x.png"]).not.toContain("\u0000");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
