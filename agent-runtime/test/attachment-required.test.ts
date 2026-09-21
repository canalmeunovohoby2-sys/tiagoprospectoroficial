import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachmentApplied, materializeAttachments, type MaterializedAttachment } from "../src/attachments";

// O anexo PRECISA ser referenciado no site; se não for, o runtime força UMA rodada
// e, persistindo, responde com ressalva (nunca "feito" sem referência real).
const PNG = Buffer.from("89504e470d0a1a0a0000000d494844520000032000000190", "hex");

const att = (over: Partial<MaterializedAttachment> = {}): MaterializedAttachment => ({
  name: "l-1.jpg", path: "assets/l-1.jpg", publicPath: "/assets/l-1.jpg", mediaType: "image/jpeg", bytes: 1234, dataUrl: "data:image/jpeg;base64,AA", ...over,
});

describe("anexo aplicado?", () => {
  it("true quando o código referencia o caminho público, o path ou o nome", () => {
    expect(attachmentApplied({ "src/components/Hero.tsx": `<img src="/assets/l-1.jpg" />` }, [att()])).toBe(true);
    expect(attachmentApplied({ "src/components/Hero.tsx": `url(assets/l-1.jpg)` }, [att()])).toBe(true);
    expect(attachmentApplied({ "src/site.ts": `photo: "l-1.jpg"` }, [att()])).toBe(true);
  });

  it("false quando NADA referencia o anexo (o runtime força a correção)", () => {
    expect(attachmentApplied({ "src/components/Hero.tsx": `<img src="/assets/antiga.png" />` }, [att()])).toBe(false);
  });

  it("SVG/anexos não-imagem não entram na exigência", () => {
    const svg = att({ name: "marca.svg", mediaType: "image/svg+xml" });
    const pdf = att({ name: "doc.pdf", mediaType: "application/pdf" });
    expect(attachmentApplied({ "src/App.tsx": "x" }, [svg, pdf])).toBe(true);
  });

  it("dimensões reais do PNG são extraídas no materialize", () => {
    const root = mkdtempSync(join(tmpdir(), "att-dims-"));
    try {
      // header PNG + IHDR com 800x400 (offsets 16/20)
      const png = Buffer.from("89504e470d0a1a0a0000000d494844520000032000000190", "hex");
      const r = materializeAttachments(root, [{ name: "x.png", mediaType: "image/png", dataUrl: `data:image/png;base64,${png.toString("base64")}` }] as never);
      expect(r.ok).toBe(true);
      expect(r.attachments[0].width).toBe(800);
      expect(r.attachments[0].height).toBe(400);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
