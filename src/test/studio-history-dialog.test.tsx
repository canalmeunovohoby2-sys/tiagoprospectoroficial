import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { buildUnifiedDiff, diffSummary } from "@/lib/studio/gitFiles";

vi.mock("@monaco-editor/react", () => ({
  DiffEditor: () => <div data-testid="diff-editor" />,
}));

vi.mock("@/lib/studio/gitApi", () => ({
  invokeStudioGit: vi.fn(async (req: { action: string; hash?: string }) => {
    switch (req.action) {
      case "status":
        return { ok: true, repo: true, branch: "main", clean: false, entries: [{ path: "index.html", index: " ", worktree: "M" }] };
      case "log":
        return {
          ok: true,
          repo: true,
          commits: [
            { hash: "a".repeat(40), short: "aaaaaaa", message: "Checkpoint inicial", author: "Studio", email: "s@x", date: "2026-09-13T10:00:00.000Z", files: ["index.html"] },
          ],
        };
      case "diff":
        return { ok: true, from: req.hash ?? "HEAD", to: "", diff: "@@ -1 +1 @@\n-<h1>A</h1>\n+<h1>B</h1>", files: [{ path: "index.html", additions: 1, deletions: 1 }] };
      case "show":
        return { ok: true, content: "<h1>A</h1>" };
      case "restore":
        return { ok: true, files: { "index.html": "<h1>A</h1>" }, hash: req.hash, committed: true };
      default:
        return { ok: false, error: `ação inesperada: ${req.action}` };
    }
  }),
}));

import { StudioHistoryDialog } from "@/components/sites/studio/StudioHistoryDialog";

beforeEach(() => vi.clearAllMocks());

describe("Fase 6 · gitFiles (diff)", () => {
  it("gera patch unificado com contagens", () => {
    const d = buildUnifiedDiff("<h1>A</h1>\n", "<h1>B</h1>\n", "index.html");
    expect(d.changed).toBe(true);
    expect(d.patch).toContain("-<h1>A</h1>");
    expect(d.patch).toContain("+<h1>B</h1>");
    expect(d.additions).toBeGreaterThanOrEqual(1);
    expect(d.deletions).toBeGreaterThanOrEqual(1);
    expect(diffSummary(d.additions, d.deletions)).toMatch(/^\+\d+ −\d+$/);
  });

  it("conteúdos iguais não geram patch", () => {
    const d = buildUnifiedDiff("x", "x", "a.txt");
    expect(d.changed).toBe(false);
    expect(d.patch).toBe("");
    expect(diffSummary(0, 0)).toBe("sem alterações");
  });
});

describe("Fase 6 · StudioHistoryDialog", () => {
  it("mostra o histórico Git real e o diff do arquivo selecionado", async () => {
    render(
      <StudioHistoryDialog
        open
        projectId="p1"
        files={{ "index.html": "<h1>B</h1>" }}
        dirty={false}
        onClose={vi.fn()}
        onRestore={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getAllByText("Checkpoint inicial").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getAllByText("index.html").length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByTestId("diff-editor")).toBeInTheDocument());
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("com alterações não commitadas avisa e permite restaurar (snapshot antes)", async () => {
    const onRestore = vi.fn();
    render(
      <StudioHistoryDialog
        open
        projectId="p1"
        files={{ "index.html": "<h1>B</h1>" }}
        dirty
        onClose={vi.fn()}
        onRestore={onRestore}
      />,
    );
    await waitFor(() => expect(screen.getAllByText("Checkpoint inicial").length).toBeGreaterThan(0));
    expect(screen.getByText(/serão salvas como/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Restaurar/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Confirmar restauração/i }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
  });

  it("bloqueia a restauração quando há motivo (buffer do editor não salvo)", async () => {
    const onRestore = vi.fn();
    render(
      <StudioHistoryDialog
        open
        projectId="p1"
        files={{ "index.html": "<h1>B</h1>" }}
        dirty={false}
        blockedReason="Salve as alterações do editor antes de restaurar."
        onClose={vi.fn()}
        onRestore={onRestore}
      />,
    );
    await waitFor(() => expect(screen.getAllByText("Checkpoint inicial").length).toBeGreaterThan(0));
    expect(screen.getByText(/Salve as alterações do editor/i)).toBeInTheDocument();
    const restoreBtn = screen.getByRole("button", { name: /Restaurar/i }) as HTMLButtonElement;
    expect(restoreBtn.disabled).toBe(true);
    fireEvent.click(restoreBtn);
    expect(screen.queryByRole("button", { name: /Confirmar restauração/i })).toBeNull();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("restaura após confirmação e devolve os arquivos ao container", async () => {
    const onRestore = vi.fn();
    render(
      <StudioHistoryDialog
        open
        projectId="p1"
        files={{ "index.html": "<h1>B</h1>" }}
        dirty={false}
        onClose={vi.fn()}
        onRestore={onRestore}
      />,
    );
    await waitFor(() => expect(screen.getAllByText("Checkpoint inicial").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /Restaurar/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Confirmar restauração/i }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
    const [files, meta] = onRestore.mock.calls[0];
    expect(files).toMatchObject({ "index.html": "<h1>A</h1>" });
    expect(meta.short).toBe("aaaaaaa");
  });

  it("abre o arquivo do diff no editor (Monaco)", async () => {
    const onOpenFile = vi.fn();
    render(
      <StudioHistoryDialog
        open
        projectId="p1"
        files={{ "index.html": "<h1>B</h1>" }}
        dirty={false}
        onClose={vi.fn()}
        onRestore={vi.fn()}
        onOpenFile={onOpenFile}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("diff-editor")).toBeInTheDocument());
    fireEvent.click(await screen.findByTitle("Abrir no editor"));
    expect(onOpenFile).toHaveBeenCalledWith("index.html");
  });
});
