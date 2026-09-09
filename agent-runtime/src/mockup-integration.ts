// Mockup Integration (10.10) — liga a identidade real do Branding Studio ao PSD
// Master. NÚCLEO: resolve a identidade dos arquivos persistidos, roda
// `applyBrandToApplications` no Master real (SEM copiá-lo para o projeto),
// exporta os rasters reais das camadas modificadas, persiste resultado + histórico
// no workspace e devolve os artefatos (caminhos + previews base64) para a UI.
// NUNCA sobrescreve o Master. Mesmo cérebro (mesmo runtime, nenhum agente novo).
import { mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBrandState, ASSET_DIR, STATE_PATH } from "./branding-state.js";
import { applyBrandToApplications, exportLayerRasterPng, selectBrandApplications, type BrandResult } from "./mockup-psd-adapter.js";
import { ArtifactStore, MockupArtifactFile, MockupVersionMetadata, PersistedPreview } from "./artifact-store.js";

export const MOCKUP_OUTPUT_REL = "assets/mockups";
const RESULT_JSON = "mockup-result.json";
const HISTORY_JSON = "mockup-history.json";

export interface MockupIdentity {
  name: string;
  logoSvg?: string;
  primary: string;
  secondary: string;
  accent?: string;
  background?: string;
  foreground?: string;
  versionId?: number | string | null;
}

export interface MockupPreview {
  applicationId: string;
  path: string;        // caminho absoluto no workspace
  relative: string;    // relativo ao workspace
  dataUrl: string;     // base64 (para a UI exibir o PNG real)
  bytes: number;
  width: number;
  height: number;
  kind: "layer_raster_applied"; // raster real da camada modificada
}

export interface MockupRunResult {
  status: "applied" | "partial" | "failed";
  versionId: string;
  identityUsed: { name: string; primary: string; secondary: string; accent?: string; logoSvgVariant: string; versionId?: number | string | null };
  applicationsRequested: string[];
  applicationsApplied: string[];
  applicationsUnsupported: { applicationId: string; reason: string }[];
  outputPsd: string;         // caminho absoluto do PSD derivado atual
  outputPsdExists: boolean;
  outputPsdBytes: number;
  previews: MockupPreview[];
  modifiedLayers: string[];
  modifiedColors: string[];
  persisted: boolean;
  createdAt: string;
  /** Mapa de arquivos TEXTO a persistir no projeto (resultado + histórico). */
  files: Record<string, string>;
  reason?: string;
}

export interface MockupHistoryEntry {
  versionId: string;
  createdAt: string;
  identityName: string;
  primary: string;
  secondary: string;
  accent?: string;
  applicationsApplied: string[];
  applicationsUnsupported: { applicationId: string; reason: string }[];
  outputPsdRelative: string;
  previews: { applicationId: string; bytes: number; width: number; height: number; dataUrl: string }[];
  modifiedLayers: string[];
  modifiedColors: string[];
  status: "applied" | "partial" | "failed";
}

const DEFAULT_MASTER: string = fileURLToPath(new URL("../assets/mockups/master/mockup-master.psd.psd", import.meta.url));

/** Caminho absoluto do Master PSD (fonte imutável). Override via env/arg. */
export function resolveMasterPsdPath(explicit?: string): string {
  return explicit || process.env.PROSPECTOR_MOCKUP_MASTER || DEFAULT_MASTER;
}

/** Resolve a identidade real a partir dos arquivos persistidos do projeto. */
export function resolveBrandIdentity(files: Record<string, string>): MockupIdentity | null {
  const raw = files[STATE_PATH];
  if (!raw) return null;
  const parsed = parseBrandState(raw);
  if (!parsed) return null;
  const logoSvg = files[`${ASSET_DIR}/primary.svg`] ?? files["assets/brand/primary.svg"];
  const pal = parsed.palette;
  if (!pal) return null;
  return {
    name: parsed.name || "Marca",
    logoSvg: logoSvg || undefined,
    primary: pal.primary,
    secondary: pal.secondary,
    accent: pal.accent,
    background: pal.background,
    foreground: pal.foreground,
    versionId: (parsed as { currentVersionId?: number | null }).currentVersionId ?? null,
  };
}

/** Deriva o "contexto" (seleção contextual) a partir do segmento/projeto. */
export function mockupContext(segment?: string | null, extra?: string): string {
  const text = `${segment ?? ""} ${extra ?? ""}`.toLowerCase();
  if (/restaur|bar|café|cafe|gastronom|comida|pizzaria/i.test(text)) return "restaurante";
  if (/tech|info|software|aplicativ|app|ti|saas/i.test(text)) return "tecnologia";
  if (/escrit|advocad|consult|contab/i.test(text)) return "escritorio";
  return "papelaria";
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}

const CORE_APPS = ["A4", "A4 2", "A5", "DL", "DL 2", "DL 3", "BC", "BC 2", "Keychain", "Brochure", "Badge", "Notepad", "Box", "Mug", "iPhone", "Tablet"];

/** Roda a geração de mockup e PERSISTE resultado + histórico no workspace. */
export async function runBrandMockup(input: {
  workspaceRoot: string;
  masterPsd?: string;
  identity: MockupIdentity | null;
  applications?: string[];
  context?: string;
  logoSvgOverride?: string;
  colorsOverride?: { primary?: string; secondary?: string; accent?: string };
  projectId?: string;
  store?: ArtifactStore;
  options?: { applyColors?: boolean; fit?: "contain" | "cover"; mapPath?: string; availableApplications?: string[] };
}): Promise<MockupRunResult> {
  const masterPsd = resolveMasterPsdPath(input.masterPsd);
  const identity = input.identity ?? null;
  const primary = input.colorsOverride?.primary ?? identity?.primary ?? "#111111";
  const secondary = input.colorsOverride?.secondary ?? identity?.secondary ?? "#F97316";
  const accent = input.colorsOverride?.accent ?? identity?.accent ?? "#4F46E5";
  const logoSvg = input.logoSvgOverride ?? identity?.logoSvg;

  const available = input.options?.availableApplications ?? CORE_APPS;
  const applications = input.applications && input.applications.length
    ? input.applications
    : selectBrandApplications({ context: input.context ?? "papelaria", availableApplications: available });

  const outputRel = MOCKUP_OUTPUT_REL;
  const outputDir = join(input.workspaceRoot, outputRel);
  const previewDir = join(outputDir, "previews");
  const versionsDir = join(outputDir, "versions");
  mkdirSync(versionsDir, { recursive: true });

  const versionId = stamp();
  const resultPath = join(outputDir, RESULT_JSON);
  const historyPath = join(outputDir, HISTORY_JSON);

  // NÃO apagar silenciosamente a anterior: preserva o PSD/PNG atuais em versions/<id>.
  const currentPsd = join(outputDir, "master-output.psd");
  if (existsSync(currentPsd)) {
    cpSync(currentPsd, join(versionsDir, `${versionId}-master-output.psd`), { force: true });
  }

  const mapPath = input.options?.mapPath ?? join(input.workspaceRoot, "assets", "mockups", "master", "mockup-master.geometry.json");
  const geometryExists = existsSync(mapPath);

  let brandResult: BrandResult;
  if (!logoSvg) {
    brandResult = {
      status: "failed",
      applicationsRequested: applications,
      applicationsApplied: [],
      applicationsUnsupported: applications.map((a) => ({ applicationId: a, status: "unsupported" as const, reason: "no_logo_identity" })),
      modifiedLayers: [],
      modifiedColors: [],
      preservedLayers: [],
      sourceSha: "",
      outputSha: "",
      persisted: false,
      outputPath: currentPsd,
      reason: "identidade sem logoSvg (nenhuma variação primary.svg presente)",
    };
  } else {
    brandResult = await applyBrandToApplications({
      sourcePsd: masterPsd,
      outputPsd: currentPsd,
      applications,
      identity: { logoSvg, primary, secondary, accent },
      options: { applyColors: input.options?.applyColors !== false, fit: input.options?.fit ?? "contain", mapPath: geometryExists ? mapPath : undefined },
    });
  }

  // Exporta os rasters REAIS das camadas modificadas (previews oficiais).
  const previews: MockupPreview[] = [];
  for (const applicationId of brandResult.applicationsApplied) {
    const pngPath = join(previewDir, `${applicationId}.png`);
    mkdirSync(previewDir, { recursive: true });
    const p = exportLayerRasterPng(brandResult.outputPath, applicationId, pngPath);
    if (p.ok && p.bytes) {
      const png = readFileSync(pngPath);
      previews.push({
        applicationId, path: pngPath, relative: `${outputRel}/previews/${applicationId}.png`,
        dataUrl: toDataUrl(png), bytes: p.bytes, width: p.width, height: p.height, kind: "layer_raster_applied",
      });
    }
  }
  // Se já existiam previews de uma execução anterior, preserva em versions/<id>.
  if (existsSync(previewDir)) cpSync(previewDir, join(versionsDir, `${versionId}-previews`), { recursive: true, force: true });

  const outputPsdExists = existsSync(currentPsd);
  const outputPsdBytes = outputPsdExists ? readFileSync(currentPsd).length : 0;
  const persisted = brandResult.status !== "failed" && outputPsdExists && outputPsdBytes > 0 && previews.length === brandResult.applicationsApplied.length;

  // Resultado (texto, persiste no projeto) — inclui previews base64 para a UI.
  const result: MockupRunResult = {
    status: brandResult.status,
    versionId,
    identityUsed: {
      name: identity?.name ?? "Marca", primary, secondary, accent,
      logoSvgVariant: "primary", versionId: identity?.versionId ?? null,
    },
    applicationsRequested: brandResult.applicationsRequested,
    applicationsApplied: brandResult.applicationsApplied,
    applicationsUnsupported: brandResult.applicationsUnsupported.map((u) => ({ applicationId: u.applicationId, reason: u.reason ?? "unsupported" })),
    outputPsd: currentPsd,
    outputPsdExists,
    outputPsdBytes,
    previews,
    modifiedLayers: brandResult.modifiedLayers,
    modifiedColors: brandResult.modifiedColors,
    persisted,
    createdAt: new Date().toISOString(),
    files: {},
    reason: brandResult.reason,
  };

  // Histórico append-only (não apaga execuções anteriores).
  let history: MockupHistoryEntry[] = [];
  if (existsSync(historyPath)) {
    try { history = JSON.parse(readFileSync(historyPath, "utf8")) as MockupHistoryEntry[]; } catch { history = []; }
  }
  const entry: MockupHistoryEntry = {
    versionId, createdAt: result.createdAt, identityName: identity?.name ?? "Marca",
    primary, secondary, accent,
    applicationsApplied: result.applicationsApplied,
    applicationsUnsupported: result.applicationsUnsupported,
    outputPsdRelative: `${outputRel}/master-output.psd`,    previews: previews.map((p) => ({ applicationId: p.applicationId, bytes: p.bytes, width: p.width, height: p.height, dataUrl: p.dataUrl })),
    modifiedLayers: result.modifiedLayers, modifiedColors: result.modifiedColors, status: result.status,
  };
  history.push(entry);

  const files: Record<string, string> = {};
  files[`${outputRel}/${RESULT_JSON}`] = JSON.stringify(result, null, 2);
  files[`${outputRel}/${HISTORY_JSON}`] = JSON.stringify(history, null, 2);
  writeFileSync(resultPath, files[`${outputRel}/${RESULT_JSON}`]);
  writeFileSync(historyPath, files[`${outputRel}/${HISTORY_JSON}`]);
  result.files = files;

  // PERSISTÊNCIA DEFINITIVA (10.11): grava PSD + previews + metadata no ArtifactStore,
  // independente do workspace temporário (que é recriado a cada /run).
  if (input.store && input.projectId) {
    const psdBuf = existsSync(currentPsd) ? readFileSync(currentPsd) : Buffer.alloc(0);
    const storeFiles: MockupArtifactFile[] = [];
    if (psdBuf.length) storeFiles.push({ path: "master-output.psd", bytes: psdBuf, kind: "psd" });
    for (const p of previews) {
      const bytes = readFileSync(p.path);
      storeFiles.push({ path: `${p.applicationId}.png`, bytes, kind: "preview", applicationId: p.applicationId });
    }
    const meta: MockupVersionMetadata = {
      versionId,
      projectId: input.projectId,
      identityVersion: identity?.versionId ?? null,
      identityName: identity?.name ?? "Marca",
      primary, secondary, accent,
      applicationsApplied: result.applicationsApplied,
      applicationsUnsupported: result.applicationsUnsupported,
      modifiedLayers: result.modifiedLayers,
      modifiedColors: result.modifiedColors,
      outputPsd: "", // preenchido pelo store
      previews: previews.map((p) => ({ applicationId: p.applicationId, path: `${p.applicationId}.png`, bytes: p.bytes, width: p.width, height: p.height })),
      createdAt: result.createdAt,
      status: result.status,
    };
    try {
      await input.store.putMockupVersion(input.projectId, meta, storeFiles);
    } catch (e) {
      // não falha a geração por causa da persistência no store; apenas sinaliza
      result.reason = `${result.reason ?? ""} [store-persist-warning: ${e instanceof Error ? e.message : String(e)}]`.trim();
    }
  }

  return result;
}

export function readMockupHistory(workspaceRoot: string): MockupHistoryEntry[] {
  const p = join(workspaceRoot, MOCKUP_OUTPUT_REL, HISTORY_JSON);
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, "utf8")) as MockupHistoryEntry[]; } catch { return []; }
}

export function readMockupResult(workspaceRoot: string): MockupRunResult | null {
  const p = join(workspaceRoot, MOCKUP_OUTPUT_REL, RESULT_JSON);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")) as MockupRunResult; } catch { return null; }
}

export interface LoadedMockupArtifacts {
  projectId: string;
  currentVersionId: string | null;
  versionIds: string[];
  currentMetadata: MockupVersionMetadata | null;
  /** previews da versão atual, com dataUrl para a UI (recuperado do armazenamento persistente). */
  previews: Array<PersistedPreview & { dataUrl?: string }>;
  previewDataUrls: Record<string, string>;
  outputPsdAvailable: boolean;
  outputPsdBytes: number;
  historyCount: number;
}

/** Recupera os artefatos do armazenamento PERSISTENTE, independente do workspace. */
export async function loadMockupArtifacts(store: ArtifactStore, projectId: string): Promise<LoadedMockupArtifacts> {
  const manifest = await store.currentManifest(projectId);
  const versionIds = manifest?.versions ?? (await store.listMockupVersions(projectId));
  const currentVersionId = manifest?.currentVersionId ?? versionIds[versionIds.length - 1] ?? null;
  const currentMetadata = currentVersionId ? await store.loadMockupVersion(projectId, currentVersionId) : null;
  const previewDataUrls: Record<string, string> = {};
  const previews: Array<PersistedPreview & { dataUrl?: string }> = [];
  if (currentMetadata) {
    for (const pv of currentMetadata.previews) {
      const buf = await store.loadCurrentPreview(projectId, pv.applicationId);
      let dataUrl: string | undefined;
      if (buf) {
        dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
        previewDataUrls[pv.applicationId] = dataUrl;
      }
      previews.push({ ...pv, dataUrl });
    }
  }
  const psdBuf = await store.getMockupFile(projectId, "current/master-output.psd");
  return {
    projectId,
    currentVersionId,
    versionIds,
    currentMetadata,
    previews,
    previewDataUrls,
    outputPsdAvailable: !!psdBuf && psdBuf.length > 0,
    outputPsdBytes: psdBuf?.length ?? 0,
    historyCount: versionIds.length,
  };
}

/** Persiste os arquivos de IDENTIDADE (brand-state.json + assets/brand/*.svg) no store. */
export async function persistIdentityToStore(store: ArtifactStore, projectId: string, files: Record<string, string>): Promise<string[]> {
  const paths: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (path === STATE_PATH || path.startsWith(`${ASSET_DIR}/`)) {
      const rel = path === STATE_PATH ? "brand-state.json" : path.slice(ASSET_DIR.length + 1);
      const p = await store.putIdentityFile(projectId, rel, Buffer.from(content, "utf8"));
      paths.push(p);
    }
  }
  return paths;
}

export { CORE_APPS };
