import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// FASE UI/UX PREMIUM — diretrizes de produto SaaS (Vercel/Linear):
// agrupar sem remover funcionalidade, sidebar enxuta, preview protagonista,
// feed limpo e status discreto. Tudo verificado no código real dos componentes.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const bar = read("src/components/sites/studio/StudioCommercialBar.tsx");
const shell = read("src/components/sites/studio/StudioShell.tsx");
const chat = read("src/components/sites/studio/UnifiedChatPanel.tsx");
const preview = read("src/components/sites/studio/WebContainerPreview.tsx");
const panel = read("src/components/sites/studio/StudioPreviewPanel.tsx");

describe("UI/UX · header e toolbar reorganizados (sem perder ações)", () => {
  it("ações secundárias agrupadas no dropdown 'Ferramentas'", () => {
    expect(bar).toContain("DropdownMenuTrigger");
    expect(bar).toContain("Ferramentas");
    for (const label of ["Histórico", "Build", "Proposta (PDF)", "Vídeo (MP4)"]) {
      expect(bar, label).toContain(label);
    }
  });

  it("NENHUM handler foi removido (todos continuam ligados)", () => {
    for (const handler of [
      "onOpenHistory", "c.onBuild", "c.onProposalPdf", "c.onGenerateVideo",
      "c.onDownloadZip", "c.onWhatsApp", "c.onPublish", "c.onUnpublish",
      "c.onCopyLink", "c.githubSlot", "c.publishedUrl",
    ]) {
      expect(bar, handler).toContain(handler);
    }
  });

  it("hierarquia clara: Publicar em destaque (solid) + ghost para o resto", () => {
    expect(bar).toMatch(/bg-primary px-2\.5 text-\[11\.5px\] font-semibold text-primary-foreground/);
    expect(bar).toMatch(/function GhostButton/);
    expect(bar).not.toMatch(/border border-border\/70 px-2 text-\[11px\]/); // barra antiga pesada
  });

  it("barras mais baixas: UMA única linha no preview (arquivo · Preview · status)", () => {
    expect(bar).toContain("duration-150");
    expect(bar).toContain("h-7");
    // barra única do preview: sem wrap, padding mínimo e informações na mesma linha
    expect(preview).toMatch(/px-2\.5 py-1"/);
    expect(preview).toContain("flex-nowrap");
    expect(preview).toContain("Preview do site");
    expect(preview).toContain("Vite ativo · Preview");
    expect(preview).toContain("entryFile");
    expect(panel).toContain("transition-all duration-200");
    // a linha extra "Preview do site" do PAINEL foi removida (virou barra única)
    expect(panel).not.toMatch(/border-b border-border\/60 bg-card px-3 py-1\.5[\s\S]{0,120}Preview do site/);
  });
});

describe("UI/UX · sidebar do chat enxuta e colapsável", () => {
  it("chat entre 16% e 30% (≈320–380px em telas típicas) e preview até 100%", () => {
    expect(shell).toMatch(/id="studio-chat" order=\{1\} defaultSize=\{22\} minSize=\{16\} maxSize=\{30\}/);
    expect(shell).toMatch(/defaultSize=\{showChat \? 68 : 100\}/);
  });

  it("botão de recolher/expandir o chat existe (tela cheia para o preview)", () => {
    expect(shell).toContain("setShowChat(false)");
    expect(shell).toContain("setShowChat(true)");
  });
});

describe("UI/UX · cards premium do chat (Você × Agente)", () => {
  it("mensagem do usuário: card tingido com o acento, rótulo 'Você' e avatar à direita", () => {
    expect(chat).toMatch(/rounded-xl border border-primary\/25 bg-primary\/\[0\.06\]/);
    expect(chat).toMatch(/uppercase tracking-\[0\.08em\] text-primary\/80">Você</);
    expect(chat).toMatch(/from-primary to-primary\/70 text-primary-foreground/);
  });

  it("resposta do agente: card neutro com gradiente, rótulo 'Agente' e avatar de identidade", () => {
    expect(chat).toMatch(/rounded-xl border border-border\/60 bg-gradient-to-b from-background to-muted\/25/);
    expect(chat).toMatch(/uppercase tracking-\[0\.08em\] text-muted-foreground">Agente</);
    expect(chat).toMatch(/from-foreground\/85 to-foreground\/60 text-background/);
  });

  it("acabamento premium: sombra sutil, hover refinado e transição de 150ms", () => {
    expect(chat).toMatch(/shadow-\[0_1px_2px_rgba\(15,23,42,\.04\)\]/);
    expect(chat).toMatch(/hover:shadow-\[0_2px_10px_-4px_rgba\(15,23,42,\.14\)\]/);
    expect(chat).toMatch(/transition-all duration-150/);
  });

  it("continua sem balões volumosos (nada de rounded-2xl cheio)", () => {
    expect(chat).not.toMatch(/rounded-2xl rounded-b[rt]-sm/);
  });

  it("status de erro continua em callout discreto (ProgressBlock), não em balão", () => {
    expect(chat).toMatch(/role="status"/);
    expect(chat).toMatch(/AGENT_PROGRESS_MESSAGE|p\.message/);
  });
});

describe("UI/UX · preview protagonista com status discreto", () => {
  it("indicador 'Live Preview' com ponto pulsante em vez de spinner central", () => {
    expect(preview).toContain("animate-ping");
    expect(preview).toContain("Vite ativo");
    expect(preview).toContain("iniciando…");
    // boot: barra de progresso no topo + linha discreta (sem texto gigante no centro)
    expect(preview).toContain("preparando o preview…");
    expect(preview).not.toMatch(/montando o projeto e iniciando o Vite/);
    expect(preview).toMatch(/h-0\.5 w-full overflow-hidden bg-border\/50/);
  });

  it("moldura de janela premium (raio, borda fina e sombra suave) no painel", () => {
    expect(panel).toMatch(/rounded-xl border border-black\/5 bg-white shadow-\[0_10px_34px/);
    expect(panel).toContain("bg-[#f4f5f7]");
  });

  it("funcionalidades do preview preservadas (logs, reload, modo visual, device)", () => {
    for (const keep of ["Logs (", "reload", "modo visual", "onGenerateSite"]) {
      expect(preview, keep).toContain(keep);
    }
  });
});
