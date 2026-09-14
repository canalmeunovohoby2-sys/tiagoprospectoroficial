import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeAttachments } from "../src/attachments";
import { materializeWorkspace, readWorkspace } from "../src/workspace";
import { runStudioTeam } from "../src/studio/team";
import type { ModelCaller, ModelCallInput } from "../src/studio/agent-core/model";

const TEMPLATE = { "package.json": "{}", "index.html": "<div id='root'></div>", "src/main.tsx": "x", "src/App.tsx": "y" };

function captureModel(captured: ModelCallInput[], fail = false): ModelCaller {
  return async (input) => {
    captured.push(input);
    if (fail) return { ok: false, error: "provider não suporta visão" };
    return { ok: true, turn: { text: 'ok\n{"signal":"TERMINATE"}', toolCalls: [] } };
  };
}

let root = "";
beforeAll(() => { root = mkdtempSync(join(tmpdir(), "c6-mm-")); materializeWorkspace(root, TEMPLATE); });
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

describe("C6 · materialização de anexos (multimodal)", () => {
  it("aceita imagem válida e PDF; rejeita tipo/nome/dados inválidos", () => {
    const res = materializeAttachments(root, [
      { name: "ref.png", mediaType: "image/png", dataUrl: "data:image/png;base64,AAAA" },
      { name: "doc.pdf", mediaType: "application/pdf", dataUrl: "data:application/pdf;base64,AAAA" },
      { name: "script.js", mediaType: "text/javascript", dataUrl: "data:text/javascript;base64,AAAA" },
      { name: "nada.png", mediaType: "image/png", dataUrl: "não é dataurl" },
    ]);
    const paths = res.attachments.map((a) => a.path);
    expect(paths.some((p) => p.endsWith(".png"))).toBe(true);
    expect(paths.some((p) => p.endsWith(".pdf"))).toBe(true);
    expect(res.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("C6 · Coder recebe contexto multimodal", () => {
  it("imagem vai no contexto visual (images) e o bloco textual é anexado", async () => {
    const captured: ModelCallInput[] = [];
    await runStudioTeam({
      instruction: "Faça parecido com esta imagem",
      projectId: "mm1",
      workspaceRoot: root,
      business: {},
      ai: {},
      emit: vi.fn(),
      readWorkspace: () => readWorkspace(root),
      model: captureModel(captured),
      attachments: [{ name: "ref.png", path: "assets/ref-1.png", mediaType: "image/png", dataUrl: "data:image/png;base64,AAAA" }],
      attachBlock: "\nANEXOS DO USUÁRIO:\n- assets/ref-1.png (image/png, 3 bytes)",
    });
    const user = captured[0].messages.find((m) => m.role === "user");
    expect(user?.images?.[0]?.dataUrl).toBe("data:image/png;base64,AAAA");
    expect(user?.content).toContain("assets/ref-1.png");
    expect(user?.content).toContain("Faça parecido com esta imagem");
  });

  it("anexo só de PDF não vira imagem (referência de arquivo, texto-only)", async () => {
    const captured: ModelCallInput[] = [];
    await runStudioTeam({
      instruction: "resuma o pdf",
      projectId: "mm2",
      workspaceRoot: root,
      business: {},
      ai: {},
      emit: vi.fn(),
      readWorkspace: () => readWorkspace(root),
      model: captureModel(captured),
      attachments: [{ name: "doc.pdf", path: "assets/doc-1.pdf", mediaType: "application/pdf", dataUrl: "data:application/pdf;base64,AAAA" }],
      attachBlock: "\nANEXOS: assets/doc-1.pdf",
    });
    const user = captured[0].messages.find((m) => m.role === "user");
    expect(user?.images).toBeUndefined();
    expect(user?.content).toContain("assets/doc-1.pdf");
  });

  it("provider sem suporte a visão → erro honesto (não finge conclusão)", async () => {
    const result = await runStudioTeam({
      instruction: "veja a imagem",
      projectId: "mm3",
      workspaceRoot: root,
      business: {},
      ai: {},
      emit: vi.fn(),
      readWorkspace: () => readWorkspace(root),
      model: captureModel([], true),
      attachments: [{ name: "ref.png", path: "assets/ref-1.png", mediaType: "image/png", dataUrl: "data:image/png;base64,AAAA" }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/vis[ãa]o|ningu[ée]m|provider/i);
  });
});
