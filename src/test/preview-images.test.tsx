import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

const hookArgs = vi.hoisted(() => ({ files: null as Record<string, string> | null }));
vi.mock("@/hooks/studio/useWebContainerPreview", () => ({
  useWebContainerPreview: (input: { files: Record<string, string> }) => {
    hookArgs.files = input.files;
    return { phase: "ready", url: "http://localhost:5173/", logs: [], error: null, reload: () => {} };
  },
  studioWebContainerService: {},
}));

import { inlineRemoteImagesInFiles } from "@/lib/studio/previewImages";
import { WebContainerPreview } from "@/components/sites/studio/WebContainerPreview";

const PHOTO = "https://lh3.googleusercontent.com/foto-real.jpg";

function pngResponse(): Response {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return new Response(bytes, { status: 200, headers: { "content-type": "image/png" } });
}
beforeEach(() => { hookArgs.files = null; });
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

describe("preview de imagens · inlining só na projeção do WebContainer", () => {
  it("troca a URL real por data: em TODAS as ocorrências (preview renderiza a mesma foto)", async () => {
    const fetchMock = vi.fn(async () => pngResponse());
    vi.stubGlobal("fetch", fetchMock);
    const files = {
      "src/App.tsx": `export default function App(){return <img src="${PHOTO}" alt="fachada" />}`,
      "src/components/Hero.tsx": `export const Hero = () => <div style={{ backgroundImage: "url(${PHOTO})" }} />`,
    };
    const r = await inlineRemoteImagesInFiles(files);
    expect(r.inlined).toBeGreaterThanOrEqual(2);
    expect(r.files["src/App.tsx"]).toContain("data:image/png;base64,");
    expect(r.files["src/App.tsx"]).not.toContain(PHOTO);
    expect(r.files["src/components/Hero.tsx"]).not.toContain(PHOTO);
    expect(fetchMock).toHaveBeenCalledTimes(1); // uma vez por URL (dedup)
  });

  it("resposta que não é imagem ou falha de rede → mantém a URL (nunca piora)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html/>", { status: 200, headers: { "content-type": "text/html" } })) as never);
    const files = { "src/App.tsx": `<img src="${PHOTO}" />` };
    const r = await inlineRemoteImagesInFiles(files);
    expect(r.inlined).toBe(0);
    expect(r.failed).toBe(1);
    expect(r.files["src/App.tsx"]).toContain(PHOTO);

    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }) as never);
    const r2 = await inlineRemoteImagesInFiles(files);
    expect(r2.files["src/App.tsx"]).toContain(PHOTO);
  });

  it("sem imagens remotas → arquivos idênticos (não mexe em nada)", async () => {
    const files = { "src/App.tsx": "export default function App(){return <main/>}" };
    const r = await inlineRemoteImagesInFiles(files);
    expect(r.files).toEqual(files);
    expect(r.inlined).toBe(0);
  });

  it("WebContainerPreview envia ao WebContainer a projeção COM a imagem embutida", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => pngResponse()) as never);
    render(
      <WebContainerPreview
        files={{ "package.json": "{}", "index.html": "<div id='root'></div>", "src/main.tsx": "x", "src/App.tsx": `<img src="${PHOTO}" />` }}
        projectId="p1"
      />,
    );
    // O dev server real recebe a URL trocada por data: (o publicado segue com a URL).
    await waitFor(() => expect(hookArgs.files?.["src/App.tsx"] ?? "").toContain("data:image/png;base64,"), { timeout: 3000 });
    expect(screen.getByTitle("Preview do app React")).toBeInTheDocument();
  });
});
