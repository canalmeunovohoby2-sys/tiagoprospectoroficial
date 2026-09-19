import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REACT_BOOTSTRAP_MARKER, buildReactTemplateFiles, isBootstrapFiles } from "@/lib/studio/reactTemplate";
import { recordRuntimeChange, detectStaleSnapshot } from "@/lib/studio/autosaveGuard";

// jsdom não é cross-origin isolated: liberamos o caminho do WebContainer.
vi.mock("@/lib/studio/isolation", () => ({
  isCrossOriginIsolated: () => true,
  isolationDiagnostic: () => ({ ok: true, reason: null }),
}));

// Preview "pronto" e sem WebContainer real para o teste de UI.
vi.mock("@/hooks/studio/useWebContainerPreview", () => ({
  useWebContainerPreview: () => ({
    phase: "ready",
    url: "http://localhost:5173/",
    logs: [],
    error: null,
    reload: vi.fn(),
  }),
}));

import { WebContainerPreview } from "@/components/sites/studio/WebContainerPreview";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const REAL_FILES = {
  "src/App.tsx": "export default function App(){ return <h1>Site real da empresa</h1>; }",
  "index.html": "<html><body><div id=\"root\"></div></body></html>",
};
const DRAFT_FILES = buildReactTemplateFiles({ name: "Usinagem Precisão Ferro" });

describe("FASE 7.2 · saída explícita do bootstrap", () => {
  beforeEach(() => { /* nada entre testes */ });

  it("1) projeto bootstrap mostra 'Rascunho'", () => {
    expect(isBootstrapFiles(DRAFT_FILES)).toBe(true);
    expect(String(DRAFT_FILES["src/App.tsx"] ?? "")).toContain(REACT_BOOTSTRAP_MARKER);
  });

  it("2/3) botão 'Gerar site' aparece no rascunho e dispara a ação explícita", () => {
    const onGenerateSite = vi.fn();
    render(<WebContainerPreview files={DRAFT_FILES} projectId="p1" onGenerateSite={onGenerateSite} />);
    expect(screen.getByText(/Rascunho — peça no chat para gerar o site\./)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /Gerar site/ });
    fireEvent.click(button);
    expect(onGenerateSite).toHaveBeenCalledTimes(1);
  });

  it("4/5) com arquivos REAIS o aviso e o botão desaparecem (e o projeto segue gerado)", () => {
    const onGenerateSite = vi.fn();
    render(<WebContainerPreview files={REAL_FILES} projectId="p1" onGenerateSite={onGenerateSite} />);
    expect(screen.queryByText(/Rascunho — peça no chat/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Gerar site/ })).toBeNull();
    // projeto já gerado permanece gerado ao reabrir (estado = generated_code real)
    expect(isBootstrapFiles(REAL_FILES)).toBe(false);
    expect(isBootstrapFiles(buildReactTemplateFiles())).toBe(true); // só o template é rascunho
  });

  it("3) a ação usa o fluxo EXISTENTE de geração (sem lógica nova e sem automação)", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    const handler = page.slice(page.indexOf("async function handleGenerateSite"), page.indexOf("function handleStudioEvent"));
    expect(handler).toContain("runAiInstruction(");
    expect(handler).toMatch(/Crie o site real de/);
    expect(handler).toContain("media: true");
    // nada de efeito automático disparando geração ao abrir
    expect(page).not.toContain("needsKickoff");
    expect(page).not.toMatch(/useEffect\([^)]*handleGenerateSite/);
    // a flag órfã não é mais gravada na criação
    expect(read("src/lib/siteProjectsApi.ts")).not.toContain('kickoff: "pending"');
  });
});

describe("FASE 7.2 · guarda do autosave (snapshot antigo nunca devolve o rascunho)", () => {
  it("6) autosave com snapshot ANTERIOR à geração é rejeitado", () => {
    const change = recordRuntimeChange(DRAFT_FILES, REAL_FILES, new Map());
    // snapshot capturado antes da geração (ainda com o rascunho)
    const stale = detectStaleSnapshot(DRAFT_FILES, change);
    expect(stale.stale).toBe(true);
    expect(stale.revertedFiles).toContain("src/App.tsx");
    // e os arquivos reais continuam sendo o estado final do projeto
    expect(isBootstrapFiles(REAL_FILES)).toBe(false);
  });

  it("7) edição REAL do usuário (valor novo) continua sendo salva", () => {
    const change = recordRuntimeChange(DRAFT_FILES, REAL_FILES, new Map());
    const edited = { ...REAL_FILES, "src/App.tsx": "export default function App(){ return <h1>Editado pelo usuário</h1>; }" };
    expect(detectStaleSnapshot(edited, change).stale).toBe(false);
    // e o próprio resultado do runtime também passa
    expect(detectStaleSnapshot(REAL_FILES, change).stale).toBe(false);
  });

  it("sem mudança do runtime, nada é bloqueado", () => {
    const change = recordRuntimeChange(REAL_FILES, REAL_FILES, new Map());
    expect(change.size).toBe(0);
    expect(detectStaleSnapshot(DRAFT_FILES, change).stale).toBe(false);
  });

  it("arquivo NOVO criado pelo runtime: snapshot antigo que o apagaria é bloqueado", () => {
    const before = { "index.html": "<div id=\"root\"></div>" };
    const after = { ...before, "src/components/Hero.tsx": "export const Hero = () => null;" };
    const change = recordRuntimeChange(before, after, new Map());
    expect(detectStaleSnapshot(before, change).revertedFiles).toContain("src/components/Hero.tsx");
  });

  it("a guarda está realmente ligada ao autosave do React", () => {
    const page = read("src/pages/SiteProjectPage.tsx");
    expect(page).toContain("detectStaleSnapshot(filesToSave, runtimeChangeRef.current)");
    expect(page).toContain("recordRuntimeChange(draftFilesRef.current");
  });
});

describe("FASE 7.2 · conversa continua conversa", () => {
  it("9) botão/geração não afetam o caminho de conversa", () => {
    // o handler de geração só existe para React e só via clique; conversa segue tools:[]
    const server = read("agent-runtime/src/server.ts");
    expect(server).toContain("tools: []");
    expect(server).toMatch(/CAMINHO RÁPIDO DE CONVERSA/);
  });
});
