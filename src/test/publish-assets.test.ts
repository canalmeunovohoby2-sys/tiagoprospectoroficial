import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "jwt-teste" } } }) } },
}));

import { inlinePublishedAssets } from "@/lib/siteProjectsApi";

// A logo enviada pelo usuário vive como binário no workspace (`public/assets/...`) e o
// código usa "/assets/...". O snapshot publicado é TEXTO — sem embutir o binário, a
// imagem quebrava na URL pública. Aqui o runtime local serve o arquivo real e o
// snapshot recebe o data URL; o CÓDIGO do projeto não é alterado.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function resposta(bytes: Uint8Array, tipo = "image/png") {
  return {
    ok: true,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? tipo : null) },
    arrayBuffer: async () => bytes.buffer.slice(0),
  } as unknown as Response;
}

beforeEach(() => vi.unstubAllGlobals());

describe("publicação · imagens enviadas pelo usuário entram no snapshot", () => {
  it("troca /assets/logo.png pelo data URL do arquivo REAL do projeto", async () => {
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      chamadas.push(String(url));
      return resposta(PNG);
    }));
    const original = {
      "src/components/SiteHeader.tsx": `export const Logo = () => <img src="/assets/l-3732-1.png" alt="logo" />;`,
    };
    const publicado = await inlinePublishedAssets("proj-1", original);
    expect(chamadas[0]).toContain("/preview/proj-1/assets/l-3732-1.png?t=jwt-teste");
    expect(publicado!["src/components/SiteHeader.tsx"]).toContain("data:image/png;base64,");
    expect(publicado!["src/components/SiteHeader.tsx"]).not.toContain('src="/assets/l-3732-1.png"');
    // o código do projeto NÃO é mutado (o workspace continua reutilizável)
    expect(original["src/components/SiteHeader.tsx"]).toContain("/assets/l-3732-1.png");
  });

  it("não inventa nada quando não há /assets/ no projeto", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const files = { "src/App.tsx": "export default () => <h1>Oi</h1>;" };
    const out = await inlinePublishedAssets("proj-1", files);
    expect(spy).not.toHaveBeenCalled();
    expect(out).toBe(files);
  });

  it("runtime fora do ar não derruba a publicação (segue com o snapshot original)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const files = { "index.html": '<img src="/assets/logo.png">' };
    const out = await inlinePublishedAssets("proj-1", files);
    expect(out!["index.html"]).toContain('/assets/logo.png');
  });

  it("asset grande (>400KB) é ignorado em vez de inflar o snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta(new Uint8Array(500_000))));
    const files = { "index.html": '<img src="/assets/gigante.png">' };
    const out = await inlinePublishedAssets("proj-1", files);
    expect(out!["index.html"]).toContain('/assets/gigante.png');
  });
});
