import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clientSafeFiles } from "../src/workspace";

// Causa real do erro no chat: "⚠ Não foi possível salvar automaticamente:
// unsupported Unicode escape sequence" — o PNG da logo (binário com NUL) estava
// sendo enviado como TEXTO e o Postgres rejeitava o salvamento.
describe("assets binários nunca vão como texto (fim do erro de autosave)", () => {
  it("binários viram DATA URL (ficam na árvore) e texto passa intacto", () => {
    const files = {
      "src/App.tsx": "export default function App(){}",
      "src/components/Header.tsx": "<header/>",
      "src/index.css": ".a{}",
      "assets/logo-1.png": "\u0089PNG\r\n\u001a\n\u0000\u0000",
      "assets/foto-2.jpg": "\u00ff\u00d8\u00ff\u00e0",
      "assets/marca-3.svg": "<svg/>",
      "public/favicon.ico": "\u0000\u0001",
      "index.html": "<div id='root'></div>",
    } as Record<string, string>;
    const out = clientSafeFiles(files);
    // binários presentes, porém como data URL ASCII (sem NUL → o banco aceita)
    expect(out["assets/logo-1.png"]).toMatch(/^data:image\/png;base64,/);
    expect(out["assets/foto-2.jpg"]).toMatch(/^data:image\/jpeg;base64,/);
    expect(out["public/favicon.ico"]).toMatch(/^data:image\/x-icon;base64,/);
    expect(out["assets/logo-1.png"]).not.toContain("\u0000");
    // texto preservado
    expect(out["src/App.tsx"]).toContain("export default");
    expect(out["assets/marca-3.svg"]).toBe("<svg/>");
  });

  it("remove qualquer string com NUL, mesmo em arquivo de texto", () => {
    expect(clientSafeFiles({ "src/app.ts": "ok", "src/bad.ts": "a\u0000b" })).toEqual({ "src/app.ts": "ok" });
  });

  it("o servidor usa clientSafeFiles nos files enviados ao cliente", () => {
    const server = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
    expect(server).toContain("readFiles: () => clientSafeFiles(readWorkspace(root))");
    expect(server).toContain("files: clientSafeFiles(finalFiles)");
    expect((server.match(/clientSafeFiles\(finalFiles\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
