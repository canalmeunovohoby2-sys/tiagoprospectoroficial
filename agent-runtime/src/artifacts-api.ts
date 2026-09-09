// Artifacts API (10.11) — serve os artefatos persistidos (PSD/previews/identidade)
// por URL, com ISOLAMENTO por projeto (escopo fixado no prefixo `branding/<projectId>`)
// e autenticação realizada pelo runtime: o chamador só chega aqui se o projectId
// for autorizado. O handler NUNCA resolve `..` nem prefere prefixos de outro projeto.
import { ArtifactStore } from "./artifact-store.js";

export type ArtifactKind = "psd" | "preview" | "identity" | "metadata" | "unknown";

export interface ArtifactResponse { ok: boolean; status: number; content: string; bytes?: Buffer; kind?: ArtifactKind; contentType?: string; }

const CONTENT_TYPES: Record<string, string> = {
  ".psd": "application/octet-stream",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function kindFor(rel: string): ArtifactKind {
  if (/master-output\.psd$/i.test(rel)) return "psd";
  if (/\.png$/i.test(rel)) return "preview";
  if (/identity\//.test(rel)) return "identity";
  return "metadata";
}

/** Caminho do mockup relativo a `branding/<projectId>/mockups/` (ex.: current/BC.png). */
function normalizeMockupRel(rel: string): string | null {
  const clean = String(rel ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = clean.split("/").filter((s) => s && s !== ".");
  if (parts.some((s) => s === ".." || s === "branding")) return null;
  return parts.join("/");
}

/** Recupera e serve um artefato (PSD/preview/metadata/PDF) do armazenamento persistente. */
export async function serveProjectArtifact(store: ArtifactStore, projectId: string, rel: string): Promise<ArtifactResponse> {
  if (!projectId || !rel) return { ok: false, status: 400, content: "missing projectId or rel" };
  const relClean = normalizeMockupRel(rel);
  if (!relClean) return { ok: false, status: 400, content: "invalid path" };
  // PDFs ficam em branding/<projectId>/pdf/... (não em mockups/); roteia por prefixo
  if (relClean.startsWith("pdf/")) {
    const buf = await store.getProjectFile(projectId, relClean);
    if (!buf) return { ok: false, status: 404, content: "pdf not found", kind: /\//.test(relClean) ? "psd" : "metadata" };
    const isJson = relClean.endsWith(".json");
    return { ok: true, status: 200, bytes: buf, content: `${buf.length} bytes`, kind: isJson ? "metadata" : "psd", contentType: isJson ? "application/json" : "application/pdf" };
  }
  // ZIPs do pacote de identidade ficam em branding/<projectId>/package/...
  if (relClean.startsWith("package/")) {
    const buf = await store.getProjectFile(projectId, relClean);
    if (!buf) return { ok: false, status: 404, content: "package not found", kind: "metadata" };
    const isJson = relClean.endsWith(".json");
    return { ok: true, status: 200, bytes: buf, content: `${buf.length} bytes`, kind: isJson ? "metadata" : "preview", contentType: isJson ? "application/json" : "application/zip" };
  }
  // VÍDEO do site fica em branding/<projectId>/video/... (mp4/webm/poster/json)
  if (relClean.startsWith("video/")) {
    const buf = await store.getProjectFile(projectId, relClean);
    if (!buf) return { ok: false, status: 404, content: "video not found", kind: "metadata" };
    const isJson = relClean.endsWith(".json");
    const ct = isJson ? "application/json" : (relClean.endsWith(".mp4") ? "video/mp4" : relClean.endsWith(".webm") ? "video/webm" : "image/png");
    return { ok: true, status: 200, bytes: buf, content: `${buf.length} bytes`, kind: isJson ? "metadata" : "preview", contentType: ct };
  }
  const buf = await store.getMockupFile(projectId, relClean);
  if (!buf) return { ok: false, status: 404, content: "artifact not found", kind: kindFor(relClean) };
  const ext = relClean.slice(relClean.lastIndexOf("."));
  return { ok: true, status: 200, bytes: buf, content: `${buf.length} bytes`, kind: kindFor(relClean), contentType: CONTENT_TYPES[ext] ?? "application/octet-stream" };
}

/** Lista os artefatos de mockup disponíveis (versões + previews atuais + PSD). */
export async function listProjectMockupArtifacts(store: ArtifactStore, projectId: string): Promise<{ projectId: string; currentVersionId: string | null; versions: string[]; previews: string[]; psd?: string }> {
  const manifest = await store.currentManifest(projectId);
  const versions = manifest?.versions ?? (await store.listMockupVersions(projectId));
  const currentFiles = await store.listProjectFiles(projectId, "current/");
  const previews: string[] = [];
  let psd: string | undefined;
  for (const f of currentFiles) {
    if (/\.png$/i.test(f)) previews.push(f);
    if (/master-output\.psd$/i.test(f)) psd = f;
  }
  return { projectId, currentVersionId: manifest?.currentVersionId ?? null, versions, previews, psd };
}
