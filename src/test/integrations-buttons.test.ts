import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Botões de conexão (Vercel/Supabase) na MESMA linha do GitHub, sem mexer no
// tamanho do preview (a barra comercial já tinha espaço; nada de layout novo).
describe("Integrações · Vercel e Supabase na linha do GitHub", () => {
  const bar = readFileSync(join(process.cwd(), "src/components/sites/studio/StudioCommercialBar.tsx"), "utf8");
  const toolbar = readFileSync(join(process.cwd(), "src/components/sites/studio/StudioToolbar.tsx"), "utf8");
  const buttons = readFileSync(join(process.cwd(), "src/components/sites/studio/StudioIntegrationsButtons.tsx"), "utf8");
  const page = readFileSync(join(process.cwd(), "src/pages/SiteProjectPage.tsx"), "utf8");

  it("a barra renderiza os botões de integração junto do GitHub", () => {
    expect(toolbar).toContain("integrationsSlot?: ReactNode;");
    expect(bar).toContain("{c.integrationsSlot}");
    expect(bar.indexOf("{c.integrationsSlot}")).toBeLessThan(bar.indexOf("{c.githubSlot}") + 40);
  });

  it("o slot é preenchido na página do projeto (barra e card de exportação)", () => {
    expect(page).toContain("integrationsSlot: <StudioIntegrationsButtons />");
    expect((page.match(/<StudioIntegrationsButtons \/>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("conecta e valida de verdade (Vercel e Supabase), guardando no navegador", () => {
    expect(buttons).toContain("https://api.vercel.com/v2/user");
    expect(buttons).toContain("/auth/v1/settings");
    expect(buttons).toContain('localStorage.getItem(STORE_KEY)');
    expect(buttons).toContain("Conectar Vercel");
    expect(buttons).toContain("Conectar Supabase");
  });
});
