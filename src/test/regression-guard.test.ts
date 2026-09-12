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

describe("Edit Regression Guard — proteções de CSS/tema/estrutura (auditoria de edição)", () => {
  const SHELL = {
    "index.html": `<html><head><link rel="stylesheet" href="src/site.css"></head><body><h1>Clínica X</h1><script>window.x=1</script></body></html>`,
    "src/site.css": ":root{--cor-a:#111;--cor-b:#222;--cor-c:#333}.hero{color:var(--cor-a)}.btn{background:var(--cor-b)}",
  };

  it("edição de TEXTO preservando CSS/link/vars/script NÃO acusa regressão", () => {
    const after = { ...SHELL, "index.html": SHELL["index.html"].replace("Clínica X", "Clínica Y") };
    expect(editRegressionIssues(SHELL, after, "troque o texto do título para Clínica Y")).toEqual([]);
  });

  it("remoção do <link rel='stylesheet'> é detectada", () => {
    const after = { ...SHELL, "index.html": SHELL["index.html"].replace(/<link[^>]*>/, "") };
    const issues = editRegressionIssues(SHELL, after, "mude o texto do título");
    expect(issues.join("\n")).toMatch(/link/i);
  });

  it("CSS com chave desbalanceada é detectado", () => {
    const after = { ...SHELL, "src/site.css": ".hero{color:var(--cor-a)" };
    const issues = editRegressionIssues(SHELL, after, "mude a cor do hero");
    expect(issues.join("\n")).toMatch(/chaves/i);
  });

  it("remoção de variáveis CSS do tema é detectada", () => {
    const after = { ...SHELL, "src/site.css": ":root{}.hero{color:#111}.btn{background:#222}" };
    const issues = editRegressionIssues(SHELL, after, "alinhe o botão");
    expect(issues.join("\n")).toMatch(/vari[áa]veis/i);
  });

  it("remoção de scripts é detectada", () => {
    const after = { ...SHELL, "index.html": SHELL["index.html"].replace(/<script[\s\S]*?<\/script>/, "") };
    const issues = editRegressionIssues(SHELL, after, "mude o texto do título");
    expect(issues.join("\n")).toMatch(/script/i);
  });

  it("siteMetrics expõe styleLinks/cssVars/braceBalance/scripts", () => {
    const m = siteMetrics(SHELL);
    expect(m.styleLinks).toBe(1);
    expect(m.cssVars).toBe(3);
    expect(m.braceBalance).toBe(0);
    expect(m.scripts).toBe(1);
  });
});

describe("FASE 7 — bypass de reconstrução NÃO desliga checagens críticas de saúde", () => {
  const SHELL = {
    "index.html": `<html><head><link rel="stylesheet" href="src/site.css"></head><body><h1>X</h1><script>window.x=1</script></body></html>`,
    "src/site.css": ".a{color:#111}",
  };

  it("reconstrução explícita AINDA bloqueia <link> de stylesheet removido", () => {
    const after = { ...SHELL, "index.html": `<html><head></head><body><h1>Novo</h1><script>1</script></body></html>` };
    expect(editRegressionIssues(SHELL, after, "reescreva o site do zero").join("\n")).toMatch(/link/i);
  });

  it("reconstrução explícita AINDA bloqueia CSS com chave desbalanceada", () => {
    const after = { ...SHELL, "src/site.css": ".a{color:#111" };
    expect(editRegressionIssues(SHELL, after, "reconstrua do zero").join("\n")).toMatch(/chaves/i);
  });

  it("reconstrução explícita AINDA bloqueia scripts removidos", () => {
    const after = { ...SHELL, "index.html": `<html><head><link rel="stylesheet" href="src/site.css"></head><body><h1>Novo</h1></body></html>` };
    expect(editRegressionIssues(SHELL, after, "reconstrua o site").join("\n")).toMatch(/script/i);
  });

  it("reconstrução explícita PODE remover conteúdo estrutural (não é saúde)", () => {
    const rich = {
      "index.html": `<html><body><nav><a>1</a><a>2</a><a>3</a></nav><section><h1>T</h1></section><img src="a.jpg"/><img src="b.jpg"/><img src="c.jpg"/><footer>f</footer></body></html>`,
      "src/site.css": "@media(max-width:900px){.a{width:100%}}",
    };
    const after = { ...rich, "index.html": `<html><body><h1>Novo</h1></body></html>` };
    expect(editRegressionIssues(rich, after, "reescreva do zero com nova identidade").length).toBe(0);
  });
});
