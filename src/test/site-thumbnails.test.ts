import { describe, it, expect, vi, beforeEach } from "vitest";

const captureMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/siteProjectsApi", () => ({ captureWorkspaceScreenshots: captureMock }));

import { hashProjectFiles, thumbnailState, thumbnailSettings, captureSiteThumbnail, downscaleDataUrl } from "@/lib/siteThumbnails";
import type { SiteProjectRow } from "@/data/siteProjects";

const react = { settings: { kind: "react" } } as unknown as SiteProjectRow;
const withFiles = (over: Record<string, unknown>, files: Record<string, string> = { "index.html": "<div id='root'></div>", "src/App.tsx": "export default function App(){return null}" }) =>
  ({ ...react, ...over, generated_code: files }) as unknown as SiteProjectRow;

beforeEach(() => captureMock.mockReset());

describe("siteThumbnails · assinatura e estado do preview", () => {
  it("hash é estável e muda quando o conteúdo muda", () => {
    const a = { "src/App.tsx": "abc", "index.html": "x" };
    expect(hashProjectFiles(a)).toBe(hashProjectFiles({ "index.html": "x", "src/App.tsx": "abc" })); // ordem não importa
    expect(hashProjectFiles(a)).not.toBe(hashProjectFiles({ "index.html": "x", "src/App.tsx": "abcd" }));
  });

  it("sem thumbnail → missing; assinatura batendo → ready; código mudou → stale", () => {
    expect(thumbnailState(withFiles({ settings: { kind: "react" } }))).toBe("missing");
    expect(thumbnailState(withFiles({ settings: { kind: "react", thumbnail: "data:image/jpeg;base64,x", thumbnailSig: "s1", codeSig: "s1" } }))).toBe("ready");
    expect(thumbnailState(withFiles({ settings: { kind: "react", thumbnail: "data:image/jpeg;base64,x", thumbnailSig: "s1", codeSig: "s2" } }))).toBe("stale");
    // legado (sem assinaturas) → precisa atualizar
    expect(thumbnailState(withFiles({ settings: { kind: "react", thumbnail: "data:image/jpeg;base64,x" } }))).toBe("stale");
  });

  it("projeto React ainda no bootstrap é 'unavailable' (não é o site real)", () => {
    const files = { "index.html": "<div id='root'></div>", "src/App.tsx": "// prospector-bootstrap: rascunho\nexport default function App(){return <main>Rascunho</main>}" };
    expect(thumbnailState(withFiles({ settings: { kind: "react" } }, files), files)).toBe("unavailable");
  });

  it("thumbnailSettings lê o que está no settings (ou vazio)", () => {
    expect(thumbnailSettings(withFiles({ settings: { thumbnail: "a", thumbnailSig: "b", codeSig: "c" } }))).toEqual({ thumbnail: "a", thumbnailSig: "b", codeSig: "c" });
    expect(thumbnailSettings(null)).toEqual({});
  });
});

describe("siteThumbnails · captura REUTILIZA a infra existente (/capture)", () => {
  it("captura a primeira dobra (desktop) e devolve thumbnail", async () => {
    captureMock.mockResolvedValue({ desktop: "data:image/png;base64,REAL", mobile: "data:image/png;base64,M" });
    const thumb = await captureSiteThumbnail({ "index.html": "<div id='root'></div>" });
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(thumb).toBeTruthy();
    // em jsdom a redução pode não rodar → devolve a própria captura (nunca vazio/fake)
    expect(thumb === "data:image/png;base64,REAL" || (thumb ?? "").startsWith("data:image/")).toBe(true);
  });

  it("sem captura real → null (nunca inventa imagem)", async () => {
    captureMock.mockResolvedValue({});
    expect(await captureSiteThumbnail({ "index.html": "<div/>" })).toBeNull();
  });

  it("downscaleDataUrl sem DOM devolve a entrada (não quebra)", async () => {
    expect(await downscaleDataUrl("data:image/png;base64,ABC")).toBe("data:image/png;base64,ABC");
    expect(await downscaleDataUrl("")).toBeNull();
  });
});
