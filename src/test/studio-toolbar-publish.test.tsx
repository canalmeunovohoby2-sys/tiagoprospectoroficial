import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { StudioCommercialActions } from "@/components/sites/studio/StudioToolbar";
import { StudioCommercialBar } from "@/components/sites/studio/StudioCommercialBar";

function commercial(over: Partial<StudioCommercialActions> = {}): StudioCommercialActions {
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
    ...over,
  };
}

function renderToolbar(c: StudioCommercialActions) {
  return render(
    <TooltipProvider>
      <StudioCommercialBar commercial={c} />
    </TooltipProvider>,
  );
}

describe("Publicação no Studio — URL / Copiar link / Abrir site", () => {
  const url = "https://app.test/public/minha-clinica";

  it("mostra a URL pública, copiar e abrir quando publicado", () => {
    const onCopyLink = vi.fn();
    renderToolbar(commercial({ publishedUrl: url, canUnpublish: true, onCopyLink }));

    expect(screen.getByText(url)).toBeInTheDocument();
    const open = screen.getByTitle("Abrir site") as HTMLAnchorElement;
    expect(open.getAttribute("href")).toBe(url);
    expect(open.getAttribute("target")).toBe("_blank");

    fireEvent.click(screen.getByTitle("Copiar link"));
    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });

  it("não mostra URL quando o projeto não está publicado", () => {
    renderToolbar(commercial({ publishedUrl: null }));
    expect(screen.queryByText(url)).toBeNull();
    expect(screen.queryByTitle("Copiar link")).toBeNull();
    expect(screen.queryByTitle("Abrir site")).toBeNull();
  });
});
