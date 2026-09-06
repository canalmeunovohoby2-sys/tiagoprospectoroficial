import { describe, it, expect } from "vitest";
import { editRegressionIssues, siteMetrics } from "../../supabase/functions/_shared/regression-guard";

const RICH = {
  "index.html": `<!doctype html><html><head><title>Barbearia</title></head><body>
    <nav><a href="#inicio">Início</a><a href="#servicos">Serviços</a><a href="#contato">Contato</a></nav>
    <section class="hero" id="inicio"><h1>Barbearia Nobre</h1><p>Texto generoso sobre a barbearia e seus diferenciais, com bastante conteúdo real para preencher esta página e garantir uma boa medida de tamanho textual nesta auditoria.</p><a class="cta" href="https://wa.me/5511">Agendar</a></section>
    <img src="https://images.unsplash.com/photo-1" alt="a"/>
    <img src="https://images.unsplash.com/photo-2" alt="b"/>
    <img src="https://images.unsplash.com/photo-3" alt="c"/>
    <img src="https://images.unsplash.com/photo-4" alt="d"/>
    <footer>© Barbearia Nobre · contato</footer>
  </body></html>`,
  "src/site.css": ".hero{background:#111;color:#fff}@media(max-width:900px){.hero{width:100%}}@keyframes fade{from{opacity:0}to{opacity:1}}@keyframes slide{from{transform:translateY(20px)}to{transform:none}}",
};

describe("Edit Regression Guard (5.30) — EDITAR ≠ RECONSTRUIR", () => {
  it("edição que preserva estrutura não acusa regressão", () => {
    const after = {
      ...RICH,
      "index.html": RICH["index.html"].replace("#111", "#1d4ed8"),
    };
    expect(editRegressionIssues(RICH, after, "Troque a cor do hero para azul")).toEqual([]);
  });

  it("reescrever apagando imagens/seções é bloqueado (regressão)", () => {
    const gutted = {
      ...RICH,
      "index.html": `<!doctype html><html><head><title>X</title></head><body><h2>Só um título</h2></body></html>`,
      "src/site.css": "body{}",
    };
    const issues = editRegressionIssues(RICH, gutted, "Mude a cor do botão para azul");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join("\n")).toMatch(/imagens|rodap[ée]|navega|@media|h1|conteúdo/i);
  });

  it("remover navegação sem pedido acusa; com pedido explícito não acusa", () => {
    const semNav = { ...RICH, "index.html": RICH["index.html"].replace(/<nav>[\s\S]*?<\/nav>/, "") };
    expect(editRegressionIssues(RICH, semNav, "deixa o hero azul").length).toBeGreaterThan(0);
    expect(editRegressionIssues(RICH, semNav, "remova o menu de navegação (só o menu)").length).toBe(0);
  });

  it("pedido explícito de remover imagens não bloqueia a remoção delas", () => {
    const semImg = { ...RICH, "index.html": RICH["index.html"].replace(/<img[^>]*>/gi, "") };
    const issues = editRegressionIssues(RICH, semImg, "remova todas as imagens dos cards, mantenha o resto");
    expect(issues.some((i) => /imagen/i.test(i))).toBe(false);
  });

  it("reconstrução explícita (do zero) não passa pelo guard", () => {
    const gutted = { ...RICH, "index.html": "<h1>novo</h1>" };
    expect(editRegressionIssues(RICH, gutted, "reescreva o arquivo do zero mantendo o negócio")).toEqual([]);
    expect(editRegressionIssues(RICH, gutted, "refaça tudo do zero")).toEqual([]);
  });

  it("siteMetrics extrai métricas estruturais", () => {
    const m = siteMetrics(RICH);
    expect(m.imgTags).toBe(4);
    expect(m.navLinks).toBe(3);
    expect(m.hasFooter).toBe(true);
    expect(m.mediaQueries).toBe(1);
    expect(m.keyframes).toBe(2);
    expect(m.hasH1).toBe(true);
  });
});
