// Branding State (6.0) — estado PERSISTENTE e COMANDÁVEL do projeto de branding.
// Fonte de verdade = arquivos do workspace: brand-state.json + assets/brand/*.svg.
// Permite CRIAR, SELECIONAR, REJEITAR, EDITAR (não-destrutivo), VERSIONAR, REVERTER
// e RECUPERAR após reabrir — tudo com o mesmo cérebro (sem novo agente/provider).
// Puro e testável.
import {
  createBrandProjectState, selectBrandConcept, rejectBrandConcept, revertToPrevious,
  editBrandTypography, editBrandPalette, editBrandThickness, buildBrandSvg, brandVariations,
  buildBrandBriefing, brandDirection, generateBrandConcepts, buildBrandConstruction,
  buildBrandIdentitySystem, validateBrandSvg, type BrandBriefing, type BrandProjectState,
  type BrandPalette, type BrandTypography, type BrandConcept, type BrandDirection, type BrandIdentitySystem,
} from "./branding.js";

export interface BrandStudioSnapshot {
  name: string;
  briefing: BrandBriefing;
  direction: BrandDirection;
  concepts: BrandConcept[];
  selectedConceptId: string | null;
  rejected: string[];
  currentVersionId: number | null;
  previousVersionId: number | null;
  variants: Record<string, string>;
  palette: BrandPalette;
  typography: BrandTypography;
  identity: BrandIdentitySystem;
  construction: ReturnType<typeof buildBrandConstruction>;
}

export interface BrandStudioFile {
  path: string;
  content: string;
}

const STATE_PATH = "brand-state.json";
const ASSET_DIR = "assets/brand";

function esc(s: string): string { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// ---- Criação ----
export function createBrandStudio(briefingText: string, name?: string): BrandProjectState {
  const briefing = buildBrandBriefing(inputFromText(briefingText, name));
  return createBrandProjectState(briefing);
}

function inputFromText(text: string, name?: string): Partial<BrandBriefing> {
  const t = String(text ?? "").trim();
  const line = (t.split(/\r?\n/)[0] ?? "").replace(/[<>]/g, "").trim();
  const m = /^(?:crie|desenvolva|monte|faça|faça uma|criar)\s+uma?\s+identidade\s+para\s+(.+)$/i.exec(line);
  return {
    name: name || (m ? m[1].slice(0, 60) : line.slice(0, 40) || "Marca"),
    segment: (/(academia|restaurante|cl[íi]nica|advocacia|barbearia|pet|oficina|sal[aã]o|est[eé]tica|studio)/i.exec(t)?.[1] ?? "") || "",
    personality: t,
    positioning: t,
  };
}

// ---- Snapshot (para o studio/preview) ----
export function brandSnapshot(state: BrandProjectState, name: string): BrandStudioSnapshot {
  const palette = state.palette;
  const typography = state.typography;
  const concept = state.chosen;
  const variants = concept ? brandVariations(concept, palette, typography) : {};
  const identity = buildBrandIdentitySystem(state.briefing, state.direction, palette, typography);
  const construction = concept ? buildBrandConstruction(concept, state.briefing, state.direction) : buildBrandConstruction(state.concepts[0] ?? { id: "0", name: name, type: "monogram", rationale: "", symbolIdea: "", typography: "", palette: "", silhouette: "" }, state.briefing, state.direction);
  const prev = state.versions.length > 1 ? state.versions[state.versions.length - 2] : null;
  return {
    name,
    briefing: state.briefing,
    direction: state.direction,
    concepts: state.concepts,
    selectedConceptId: state.chosen?.id ?? null,
    rejected: state.rejected,
    currentVersionId: state.current?.id ?? null,
    previousVersionId: prev?.id ?? null,
    variants,
    palette,
    typography,
    identity,
    construction,
  };
}

// ---- Persistência em arquivos (estado + SVGs reais) ----
export function serializeBrandState(snapshot: BrandStudioSnapshot): string {
  return JSON.stringify({ name: snapshot.name, briefing: snapshot.briefing, direction: snapshot.direction, concepts: snapshot.concepts, rejected: snapshot.rejected, palette: snapshot.palette, typography: snapshot.typography, selectedConceptId: snapshot.selectedConceptId, currentVersionId: snapshot.currentVersionId, previousVersionId: snapshot.previousVersionId }, null, 2);
}

export function brandStateFiles(state: BrandProjectState, name: string): BrandStudioFile[] {
  const snapshot = brandSnapshot(state, name);
  const files: BrandStudioFile[] = [{ path: STATE_PATH, content: serializeBrandState(snapshot) }];
  for (const [key, svg] of Object.entries(snapshot.variants)) {
    files.push({ path: `${ASSET_DIR}/${key}.svg`, content: svg });
  }
  return files;
}

export function parseBrandState(json: string): { name: string; briefing?: Partial<BrandBriefing>; selectedConceptId?: string | null; palette?: BrandPalette; typography?: BrandTypography } | null {
  try {
    const j = JSON.parse(json || "{}") as Record<string, unknown>;
    return { name: String(j.name ?? ""), briefing: (j.briefing as Partial<BrandBriefing>) ?? undefined, selectedConceptId: (j.selectedConceptId as string | null) ?? null, palette: (j.palette as BrandPalette) ?? undefined, typography: (j.typography as BrandTypography) ?? undefined };
  } catch {
    return null;
  }
}

// Reconstrói o estado a partir dos arquivos (recuperação após reabrir).
export function loadBrandStateFromFiles(files: Record<string, string>): BrandProjectState | null {
  const raw = files[STATE_PATH];
  if (!raw) return null;
  const parsed = parseBrandState(raw);
  if (!parsed) return null;
  const briefing = buildBrandBriefing(parsed.briefing ?? { name: parsed.name });
  const state = createBrandProjectState(briefing);
  if (parsed.palette) state.palette = parsed.palette;
  if (parsed.typography) state.typography = parsed.typography;
  // IMPORTANTE: selectBrandConcept retorna um NOVO estado — aplica o retorno.
  if (parsed.selectedConceptId) return selectBrandConcept(state, parsed.selectedConceptId);
  return state;
}

// ---- Comandos (determinísticos, com o mesmo motor de branding) ----
export type BrandCmd =
  | { op: "create"; briefing: string; name?: string }
  | { op: "select"; conceptId: string }
  | { op: "reject"; conceptId: string }
  | { op: "revert" }
  | { op: "editTypography"; heading?: string; body?: string; weights?: string }
  | { op: "editPalette"; palette: BrandPalette }
  | { op: "editThickness"; factor: number };

export interface BrandApplyResult {
  state: BrandProjectState;
  snapshot: BrandStudioSnapshot;
  files: BrandStudioFile[];
}

export function applyBrandCmd(state: BrandProjectState, cmd: BrandCmd, name: string): BrandApplyResult {
  let next = { ...state };
  switch (cmd.op) {
    case "create": next = createBrandStudio(cmd.briefing, cmd.name); break;
    case "select": next = selectBrandConcept(next, cmd.conceptId); break;
    case "reject": next = rejectBrandConcept(next, cmd.conceptId); break;
    case "revert": next = revertToPrevious(next); break;
    case "editTypography": next = editBrandTypography(next, { heading: cmd.heading ?? next.typography.heading, body: cmd.body ?? next.typography.body, weights: cmd.weights ?? next.typography.weights }); break;
    case "editPalette": next = editBrandPalette(next, cmd.palette); break;
    case "editThickness": next = editBrandThickness(next, cmd.factor); break;
  }
  const snapshot = brandSnapshot(next, name);
  return { state: next, snapshot, files: brandStateFiles(next, name) };
}

export { esc, STATE_PATH, ASSET_DIR, validateBrandSvg, buildBrandConstruction };
