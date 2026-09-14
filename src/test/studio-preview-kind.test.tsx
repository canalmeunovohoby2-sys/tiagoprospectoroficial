import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  hookState: {
    phase: "ready" as "ready" | "unsupported" | "booting" | "error",
    url: "http://localhost:5173/" as string | null,
    logs: [] as string[],
    error: null as string | null,
    reload: () => {},
  },
}));

vi.mock("@/hooks/studio/useWebContainerPreview", () => ({
  useWebContainerPreview: () => mocks.hookState,
  studioWebContainerService: {},
}));

import { StudioPreviewPanel } from "@/components/sites/studio/StudioPreviewPanel";

beforeEach(() => {
  mocks.hookState.phase = "ready";
  mocks.hookState.url = "http://localhost:5173/";
  mocks.hookState.error = null;
});

describe("C0 · StudioPreviewPanel por project_kind", () => {
  it("static continua usando o preview srcDoc (iframe do site)", () => {
    render(<StudioPreviewPanel files={{ "cliente/index.html": "<!doctype html><html><body><h1>Oi</h1></body></html>" }} projectKind="static" />);
    expect(screen.getByTitle("Preview do site")).toBeInTheDocument();
    expect(screen.queryByTitle("Preview do app React")).toBeNull();
  });

  it("react usa WebContainer (iframe do dev server real), nunca srcDoc", () => {
    render(<StudioPreviewPanel files={{ "package.json": "{}", "index.html": "<div id='root'></div>", "src/main.tsx": "x" }} projectKind="react" projectId="p1" />);
    const iframe = screen.getByTitle("Preview do app React") as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute("src")).toBe("http://localhost:5173/");
    expect(iframe.getAttribute("srcdoc")).toBeNull();
    expect(screen.queryByTitle("Preview do site")).toBeNull();
  });

  it("react sem isolamento mostra o aviso (não finge preview)", () => {
    mocks.hookState.phase = "unsupported";
    mocks.hookState.url = null;
    mocks.hookState.error = "documento não está crossOriginIsolated (faltam COOP/COEP)";
    render(<StudioPreviewPanel files={{ "index.html": "<div id='root'></div>" }} projectKind="react" />);
    expect(screen.getByText(/WebContainer indisponível/i)).toBeInTheDocument();
    expect(screen.queryByTitle("Preview do app React")).toBeNull();
  });

  it("recarrega o iframe do dev server quando refreshKey muda (site gerado aparece)", async () => {
    const files = { "package.json": "{}", "index.html": "<div id='root'></div>", "src/main.tsx": "x" };
    const { rerender } = render(<StudioPreviewPanel files={files} projectKind="react" projectId="p1" refreshKey="0" />);
    const before = screen.getByTitle("Preview do app React");
    rerender(<StudioPreviewPanel files={files} projectKind="react" projectId="p1" refreshKey="1" />);
    await waitFor(() => expect(screen.getByTitle("Preview do app React")).not.toBe(before), { timeout: 3000 });
  });

  it("react SEM arquivos nunca usa o spec/instrução como página — mostra preparação", () => {
    render(
      <StudioPreviewPanel
        files={{}}
        projectKind="react"
        projectId="p1"
        fallback={<div>INSTRUÇÃO INTERNA DO AGENTE / PROMPT DO KICKOFF</div>}
      />,
    );
    expect(screen.getByText(/Preparando o preview do site/i)).toBeInTheDocument();
    expect(screen.queryByText(/INSTRUÇÃO INTERNA DO AGENTE/)).toBeNull();
    expect(screen.queryByText(/PROMPT DO KICKOFF/)).toBeNull();
  });
});
