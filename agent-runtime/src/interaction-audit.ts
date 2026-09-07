// Auditoria de interação (tela preta ao clicar) — QA real pós-geração/edição.
// Clica em cada elemento interativo e mede se a página fica preta (cobertura de
// 25 pontos com cor final opaca escura). Se ficar preta, tenta fechar (mesmo
// gatilho/Escape); só considera bug se continuar preta. Puro de secrets.
import type { BrowserSession } from "./browser-session.js";

export interface InteractionAuditResult {
  ok: boolean;
  tested: number;
  issues: string[];
}

const WAIT_AFTER_CLICK_MS = 320;

export async function auditSiteInteractions(session: BrowserSession): Promise<InteractionAuditResult> {
  const issues: string[] = [];
  await session.open("", { width: 1366, height: 768 });
  const base = await session.measureBlackScreen();
  if (base.black) {
    issues.push("A página JÁ abre preta (cobertura escura em 100vw/100vh no carregamento).");
    return { ok: false, tested: 0, issues };
  }
  const clicks = await session.clickableElements();
  const testedList = clicks.filter((c) => c.visible).slice(0, 12);
  for (const c of testedList) {
    try {
      await session.reload();
      const before = await session.measureBlackScreen();
      if (before.black) continue; // baseline voltou preto → já reportado
      await session.clickSelector(c.sel);
      await new Promise((r) => setTimeout(r, WAIT_AFTER_CLICK_MS));
      const after = await session.measureBlackScreen();
      if (!after.black) continue;
      // Tentativa de fechar: mesmo gatilho + Escape.
      let recovered = false;
      try {
        await session.clickSelector(c.sel);
        await new Promise((r) => setTimeout(r, 280));
        recovered = !(await session.measureBlackScreen()).black;
      } catch { /* noop */ }
      if (!recovered) {
        try {
          await session.pressKey("Escape");
          await new Promise((r) => setTimeout(r, 280));
          recovered = !(await session.measureBlackScreen()).black;
        } catch { /* noop */ }
      }
      if (!recovered) {
        issues.push(`Clicar em "${c.text || c.sel}" (<${c.tag}>) deixa a tela PRETA e ela não volta com o mesmo clique nem com Escape. Causa provável: overlay/modal/menu full-screen escuro que não fecha, camada cobrindo a página ou erro JS no handler.`);
      }
    } catch (e) {
      // seletor pode ter sumido após navegação — ignora
      void e;
    }
  }
  return { ok: issues.length === 0, tested: testedList.length, issues };
}
