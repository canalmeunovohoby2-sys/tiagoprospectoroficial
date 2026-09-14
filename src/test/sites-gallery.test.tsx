import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

const navigateMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());
const captureMock = vi.hoisted(() => vi.fn());
const saveThumbMock = vi.hoisted(() => vi.fn());

const authState = vi.hoisted(() => ({ user: { id: "u1" } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/lib/brandingApi", () => ({ createBrandingProject: vi.fn() }));
vi.mock("@/lib/siteProjectsApi", () => ({
  listSiteProjects: listMock,
  deleteSiteProject: vi.fn(),
  createSiteProjectFromPrompt: vi.fn(),
  saveProjectThumbnail: saveThumbMock,
  captureWorkspaceScreenshots: captureMock,
}));

import Sites from "@/pages/Sites";

const THUMB = "data:image/jpeg;base64,PRONTA";
const appFiles = { "index.html": "<div id='root'></div>", "src/App.tsx": "export default function App(){return <main>Site real</main>}" };

function project(over: Record<string, unknown>) {
  return {
    id: "p1", name: "Projeto", company_name: "Empresa", status: "generated",
    segment: "Pet Shop", city: "Bauru", state: "SP", lead_id: null,
    settings: { kind: "react" }, generated_code: appFiles,
    ...over,
  };
}
const ready = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  project({ id, name, settings: { kind: "react", thumbnail: THUMB, thumbnailSig: "s", codeSig: "s" }, ...extra });

async function renderWith(list: unknown[]) {
  listMock.mockResolvedValue(list);
  render(<Sites />);
  await waitFor(() => expect(listMock).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText(/Carregando projetos/)).toBeNull());
}

beforeEach(() => {
  navigateMock.mockReset();
  listMock.mockReset();
  captureMock.mockReset();
  saveThumbMock.mockReset();
  captureMock.mockResolvedValue({}); // sem captura → fallback estável
});
afterEach(() => cleanup());

describe("Galeria do Studio · preview REAL do site em cada card", () => {
  it("mostra o thumbnail persistido quando existe (site — não prompt)", async () => {
    await renderWith([ready("a", "Com preview")]);
    const img = screen.getByAltText("Prévia do site Com preview");
    expect(img.getAttribute("src")).toBe(THUMB);
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("projeto antigo SEM preview aparece com fallback (lista não quebra)", async () => {
    await renderWith([project({ id: "b", name: "Antigo sem preview" })]);
    await waitFor(() => expect(screen.getByText(/Sem prévia ainda/i)).toBeTruthy());
    expect(screen.getByTitle(/Abrir Antigo sem preview/)).toBeTruthy();
    expect(screen.queryByAltText(/Prévia do site Antigo sem preview/)).toBeNull();
  });

  it("projeto React ainda no rascunho mostra 'aguardando geração' (não captura rascunho)", async () => {
    const bootstrap = { "index.html": "<div id='root'></div>", "src/App.tsx": "// prospector-bootstrap: rascunho\nexport default function App(){return <main>Rascunho</main>}" };
    await renderWith([project({ id: "c", name: "Rascunho", generated_code: bootstrap })]);
    expect(screen.getByText(/Aguardando a geração do site/i)).toBeTruthy();
  });

  it("clicar no card abre o projeto normalmente", async () => {
    await renderWith([ready("d", "Clique")]);
    fireEvent.click(screen.getByTitle("Abrir Clique"));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/sites/d"));
  });

  it("mantém a informação atual do projeto no card", async () => {
    await renderWith([ready("e", "Pet Amigo", { company_name: "Pet Amigo LTDA" })]);
    expect(screen.getByText("Pet Amigo LTDA")).toBeTruthy();
    expect(screen.getByText(/Pet Shop · Bauru\/SP/)).toBeTruthy();
  });
});
