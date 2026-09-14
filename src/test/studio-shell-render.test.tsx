import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StudioShell } from "@/components/sites/studio/StudioShell";
import type { StudioCommercialActions } from "@/components/sites/studio/StudioToolbar";

beforeAll(() => {
  // react-resizable-panels usa ResizeObserver, ausente no jsdom.
  if (!("ResizeObserver" in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  }
  // jsdom não implementa Element.scrollTo (usado pelo auto-scroll do chat).
  if (!Element.prototype.scrollTo) {
    (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};
  }
});

function commercial(overrides: Partial<StudioCommercialActions> = {}): StudioCommercialActions {
  return {
    onProposalPdf: vi.fn(),
    onDownloadZip: vi.fn(),
    onGenerateVideo: vi.fn(),
    onWhatsApp: vi.fn(),
    onPublish: vi.fn(),
    onUnpublish: vi.fn(),
    publishing: false,
    unpublishing: false,
    busyAction: null,
    generatingVideo: false,
    canPublish: true,
    canUnpublish: false,
    canWhatsApp: true,
    canVideo: true,
    ...overrides,
  };
}

describe("StudioShell (Fase 1)", () => {
  it("renderiza chat, toolbar comercial, abas e preview sem quebrar", () => {
    render(
      <TooltipProvider>
      <StudioShell
        projectName="Clínica Bella"
        files={{ "cliente/index.html": "<!doctype html><html><head><title>x</title></head><body><h1>Clínica Bella</h1></body></html>" }}
        onFilesChange={vi.fn()}
        onSaveFiles={vi.fn()}
        dirty={false}
        saving={false}
        chat={{
          messages: [],
          running: false,
          error: null,
          canUndo: false,
          dirty: false,
          onApply: vi.fn(),
          onRevert: vi.fn(),
          onQuickStrategy: vi.fn(),
          onNewConversation: vi.fn(),
        }}
        commercial={commercial()}
        onOpenHistory={vi.fn()}
      />
      </TooltipProvider>,
    );

    expect(screen.getByText("Construtor com IA")).toBeInTheDocument();
    expect(screen.getByText("Preview · 1 arquivo(s)")).toBeInTheDocument();
    expect(screen.getByText("Histórico")).toBeInTheDocument();
    expect(screen.getByText("Baixar")).toBeInTheDocument();
    expect(screen.getByText("Vídeo")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Publicar")).toBeInTheDocument();
    expect(screen.getAllByText("index.html").length).toBeGreaterThan(0);
  });

  it("Ctrl/Cmd+S dispara o mesmo Salvar do botão (Fase 3)", async () => {
    const onSaveFiles = vi.fn();
    render(
      <TooltipProvider>
        <StudioShell
          projectName="Clínica Bella"
          files={{ "cliente/index.html": "<!doctype html><html><body><h1>x</h1></body></html>" }}
          onFilesChange={vi.fn()}
          onSaveFiles={onSaveFiles}
          dirty
          saving={false}
          chat={{
            messages: [],
            running: false,
            error: null,
            canUndo: false,
            dirty: true,
            onApply: vi.fn(),
            onRevert: vi.fn(),
            onQuickStrategy: vi.fn(),
            onNewConversation: vi.fn(),
          }}
          commercial={commercial()}
          onOpenHistory={vi.fn()}
        />
      </TooltipProvider>,
    );

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(onSaveFiles).toHaveBeenCalledTimes(1));
    expect(onSaveFiles.mock.calls[0][0]).toMatchObject({ "cliente/index.html": expect.stringContaining("<h1>x</h1>") });
  });
});
