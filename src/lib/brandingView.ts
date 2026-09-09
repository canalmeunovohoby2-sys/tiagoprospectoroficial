// Branding view model (6.1) — transforma o snapshot do Branding Studio (backend)
// em um modelo prontinho para a UI, e seletores puros para testes (sem RTL).
// Não duplica o motor de branding — apenas projeta o estado real para a tela.

// Shape espelhado do snapshot do backend (brand-state.json) — definido localmente
// para não acoplar o frontend a agent-runtime.
export interface BrandSnapshotLike {
  name?: string;
  concepts?: Array<{ id: string; name: string; type: string; rationale: string }>;
  selectedConceptId?: string | null;
  rejected?: string[];
  currentVersionId?: number | null;
  variants?: Record<string, string>;
  palette?: { primary: string; secondary: string; accent: string; background: string; foreground: string };
  typography?: { heading: string; body: string; weights: string };
  identity?: { hierarchy?: string; photoDirection?: string; applicationRules?: string };
  versions?: Array<{ id: number; label: string; note?: string }>;
}

export interface BrandViewConcept {
  id: string;
  name: string;
  type: string;
  rationale: string;
  status: "selecionado" | "rejeitado" | "disponível";
}

export interface BrandViewVersion { id: number; label: string; note?: string; current: boolean; }

export interface BrandView {
  projectName: string;
  concepts: BrandViewConcept[];
  selectedConceptId: string | null;
  variants: Record<string, string>;
  palette: { primary: string; secondary: string; accent: string; background: string; foreground: string };
  typography: { heading: string; body: string; weights: string };
  identity: { hierarchy: string; photoDirection: string; applicationRules: string };
  versions: BrandViewVersion[];
  currentVersionId: number | null;
  hasBrand: boolean;
}

export function toBrandView(snapshot: BrandSnapshotLike): BrandView {
  const concepts: BrandViewConcept[] = (snapshot.concepts ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    rationale: c.rationale,
    status: snapshot.selectedConceptId === c.id ? "selecionado" : (snapshot.rejected ?? []).includes(c.id) ? "rejeitado" : "disponível",
  }));
  const versions: BrandViewVersion[] = snapshot.versions?.length
    ? snapshot.versions.map((v) => ({ id: v.id, label: v.label, note: v.note, current: snapshot.currentVersionId === v.id }))
    : [];
  return {
    projectName: snapshot.name ?? "Marca",
    concepts,
    selectedConceptId: snapshot.selectedConceptId ?? null,
    variants: snapshot.variants ?? {},
    palette: snapshot.palette ?? { primary: "#111", secondary: "#666", accent: "#f90", background: "#fff", foreground: "#111" },
    typography: snapshot.typography ?? { heading: "Inter", body: "Inter", weights: "700" },
    identity: {
      hierarchy: snapshot.identity?.hierarchy ?? "",
      photoDirection: snapshot.identity?.photoDirection ?? "",
      applicationRules: snapshot.identity?.applicationRules ?? "",
    },
    versions,
    currentVersionId: snapshot.currentVersionId ?? null,
    hasBrand: !!snapshot.selectedConceptId && Object.keys(snapshot.variants ?? {}).length > 0,
  };
}

// Seleção do SVG real para preview (fonte: artefato real, nunca mock).
export function realPreviewSvg(view: BrandView, variant = "primary"): string {
  return view.variants[variant] ?? "";
}

// Resolução de instruções do chat → comando de branding (determinístico, usa o
// estado real). Não duplica a lógica de edição; só mapeia pedidos comuns a comandos.
export type BrandIntentCmd =
  | { op: "select"; conceptId: string }
  | { op: "revert" }
  | { op: "editTypography"; heading?: string }
  | { op: "editThickness"; factor?: number }
  | { op: "unknown"; raw: string };

const CONCEPT_RE = /conceito\s*(\d+)/i;

export function resolveBrandIntent(message: string): BrandIntentCmd {
  const t = String(message ?? "").trim();
  const concept = CONCEPT_RE.exec(t);
  if (/^gostei\s+do\s+/i.test(t) || /^aprov|seleciona|escolhe/i.test(t)) {
    if (concept) return { op: "select", conceptId: concept[1] };
    return { op: "unknown", raw: t };
  }
  if (/volta\s+para\s+a\s+(vers[aã]o\s+)?anterior|volta\s+o|reverter/i.test(t)) return { op: "revert" };
  if (/lettering|tipografia|fonte\s+mais|fonte\s+/i.test(t)) {
    if (/mais sofisticad/i.test(t)) return { op: "editTypography", heading: "Playfair Display" };
    return { op: "editTypography" };
  }
  if (/mais\s+fino|mais\s+geom[eé]trico|espessur/i.test(t)) return { op: "editThickness", factor: 0.85 };
  return { op: "unknown", raw: t };
}
