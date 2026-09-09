// Artifact Store (10.11) — armazenamento PERSISTENTE dos artefatos de branding e
// mockup, isolado por projeto e independente do workspace temporário da execução.
// Backend pluggável:
//   - `disk` (default, testável): diretório dedicado e estável (PROSPECTOR_ARTIFACTS_DIR),
//     NUNCA /tmp nem o workspace efêmero recriado por /run.
//   - `supabase` (produção): Supabase Storage (bucket `branding-assets`), via REST
//     com anon + token do usuário; RLS por project_id/path. Migração pronta.
// Nenhum binário grande é embutido em generated_code; o PSD é tratado como
// arquivo binário sob demanda.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { createHash } from "node:crypto";

export type ArtifactBackendKind = "disk" | "supabase";

export interface StorageBackend {
  put(path: string, bytes: Buffer): Promise<void>;
  get(path: string): Promise<Buffer | null>;
  list(prefix: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
}

// ---- Backend DISCO (persistente e estável; testável) ----
export function diskBackend(root: string): StorageBackend {
  const safe = (p: string) => {
    const clean = String(p).replace(/\\/g, "/").replace(/^\/+/, "");
    const parts = clean.split("/").filter((s) => s && s !== ".");
    if (parts.some((s) => s === "..")) return null;
    const abs = join(root, ...parts);
    if (!abs.startsWith(root)) return null;
    return abs;
  };
  return {
    async put(path, bytes) {
      const abs = safe(path);
      if (!abs) throw new Error("caminho inválido");
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, bytes);
    },
    async get(path) {
      const abs = safe(path);
      if (!abs || !existsSync(abs)) return null;
      return readFileSync(abs);
    },
    async list(prefix) {
      const abs = safe(prefix);
      if (!abs || !existsSync(abs)) return [];
      const out: string[] = [];
      const walk = (dir: string, rel: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, e.name);
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walk(full, r);
          else out.push(r);
        }
      };
      walk(abs, "");
      return out;
    },
    async exists(path) {
      const abs = safe(path);
      return !!abs && existsSync(abs);
    },
    async delete(path) {
      const abs = safe(path);
      if (abs && existsSync(abs)) rmSync(abs, { recursive: true, force: true });
    },
  };
}

// ---- Backend SUPABASE STORAGE (produção; REST + anon + token) ----
export interface SupabaseStorageConfig { url: string; anon: string; bucket: string; token?: string; }
export function supabaseBackend(cfg: SupabaseStorageConfig): StorageBackend {
  const base = `${cfg.url.replace(/\/$/, "")}/storage/v1/object`;
  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/octet-stream", Authorization: `Bearer ${cfg.token || cfg.anon}` };
    if (cfg.token && cfg.token !== cfg.anon) h.apikey = cfg.anon;
    return h;
  };
  return {
    async put(path, bytes) {
      const res = await fetch(`${base}/${cfg.bucket}/${path}`, { method: "POST", headers: headers(), body: new Uint8Array(bytes) });
      if (!res.ok && res.status !== 200) throw new Error(`storage put ${res.status}`);
    },
    async get(path) {
      const res = await fetch(`${base}/${cfg.bucket}/${path}`, { headers: headers() });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    },
    async list(prefix) {
      const res = await fetch(`${base}/list/${cfg.bucket}`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token || cfg.anon}` },
        body: JSON.stringify({ prefix, limit: 200 }),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as Array<{ name: string }>;
      return (data ?? []).map((o) => o.name);
    },
    async exists(path) {
      return !!(await this.get(path));
    },
    async delete(path) {
      const res = await fetch(`${base}/${cfg.bucket}/${path}`, { method: "DELETE", headers: headers() });
      if (!res.ok && res.status !== 404) throw new Error(`storage delete ${res.status}`);
    },
  };
}

// ---- Facade isolada por projeto ----
export interface MockupArtifactFile { path: string; bytes: Buffer; kind: "psd" | "preview"; applicationId?: string; }
export interface PersistedPreview { applicationId: string; path: string; bytes: number; width: number; height: number; }
export interface MockupVersionMetadata {
  versionId: string;
  projectId: string;
  identityVersion?: number | string | null;
  identityName?: string;
  primary?: string;
  secondary?: string;
  accent?: string;
  applicationsApplied: string[];
  applicationsUnsupported: { applicationId: string; reason: string }[];
  modifiedLayers: string[];
  modifiedColors: string[];
  outputPsd: string;   // path relativo ao bucket/projeto
  previews: PersistedPreview[];
  createdAt: string;
  status: "applied" | "partial" | "failed";
}

export interface CurrentManifest {
  currentVersionId: string;
  updatedAt: string;
  versions: string[]; // ordered versionIds
}

const PROJ_PREFIX = (projectId: string) => `branding/${projectId}`;

export class ArtifactStore {
  constructor(private backend: StorageBackend) {}

  // ---- Identity (SVGs + estado) ----
  async putIdentityFile(projectId: string, path: string, bytes: Buffer): Promise<string> {
    const p = `${PROJ_PREFIX(projectId)}/identity/${path}`;
    await this.backend.put(p, bytes);
    return p;
  }
  async getIdentityFile(projectId: string, relative: string): Promise<Buffer | null> {
    return this.backend.get(`${PROJ_PREFIX(projectId)}/identity/${relative}`);
  }
  async listIdentity(projectId: string): Promise<string[]> {
    return this.backend.list(`${PROJ_PREFIX(projectId)}/identity/`);
  }

  // ---- Mockups: versões + corrente ----
  async putMockupVersion(projectId: string, meta: MockupVersionMetadata, files: MockupArtifactFile[]): Promise<{ manifest: string; currentManifest: CurrentManifest }> {
    const base = `${PROJ_PREFIX(projectId)}/mockups`;
    const perVersion = `${base}/versions/${meta.versionId}`;
    // arquivos binários da versão
    for (const f of files) {
      const dp = `${perVersion}/${f.path}`;
      await this.backend.put(dp, f.bytes);
    }
    // metadata da versão
    meta.outputPsd = `${perVersion}/master-output.psd`;
    await this.backend.put(`${perVersion}/metadata.json`, Buffer.from(JSON.stringify(meta, null, 2)));

    // manifest corrente (append-only, sem apagar anterior; atualiza ponteiro current)
    let versions: string[] = [];
    const currentRel = `${base}/current.json`;
    if (await this.backend.exists(currentRel)) {
      const prev = await this.backend.get(currentRel);
      if (prev) {
        try { versions = (JSON.parse(prev.toString()) as CurrentManifest).versions ?? []; } catch { /* noop */ }
      }
    }
    if (!versions.includes(meta.versionId)) versions.push(meta.versionId);
    const manifest: CurrentManifest = { currentVersionId: meta.versionId, updatedAt: new Date().toISOString(), versions };
    await this.backend.put(currentRel, Buffer.from(JSON.stringify(manifest, null, 2)));

    // cópia da versão como "current" (PSD + previews atuais)
    for (const f of files) {
      const dp = `${base}/current/${f.path}`;
      await this.backend.put(dp, f.bytes);
    }
    return { manifest: currentRel, currentManifest: manifest };
  }

  async loadMockupVersion(projectId: string, versionId: string): Promise<MockupVersionMetadata | null> {
    const p = `${PROJ_PREFIX(projectId)}/mockups/versions/${versionId}/metadata.json`;
    const buf = await this.backend.get(p);
    if (!buf) return null;
    try { return JSON.parse(buf.toString()) as MockupVersionMetadata; } catch { return null; }
  }

  async listMockupVersions(projectId: string): Promise<string[]> {
    const prefix = `${PROJ_PREFIX(projectId)}/mockups/versions/`;
    const files = await this.backend.list(prefix);
    const dirs = new Set<string>();
    for (const f of files) {
      const seg = f.split("/")[0];
      if (seg) dirs.add(seg);
    }
    return [...dirs];
  }

  async currentManifest(projectId: string): Promise<CurrentManifest | null> {
    const buf = await this.backend.get(`${PROJ_PREFIX(projectId)}/mockups/current.json`);
    if (!buf) return null;
    try { return JSON.parse(buf.toString()) as CurrentManifest; } catch { return null; }
  }

  async getMockupFile(projectId: string, relative: string): Promise<Buffer | null> {
    return this.backend.get(`${PROJ_PREFIX(projectId)}/mockups/${relative}`);
  }

  async listProjectFiles(projectId: string, mockupPrefix: string): Promise<string[]> {
    const prefix = `${PROJ_PREFIX(projectId)}/mockups/${mockupPrefix}`;
    const files = await this.backend.list(prefix);
    return files.map((f) => `${mockupPrefix}${f}`);
  }

  async loadCurrentPreview(projectId: string, applicationId: string): Promise<Buffer | null> {
    return this.backend.get(`${PROJ_PREFIX(projectId)}/mockups/current/${applicationId}.png`);
  }

  // ---- Arquivos de projeto (PDF e outros) sob branding/<projectId>/<rel> ----
  async putProjectFile(projectId: string, rel: string, bytes: Buffer): Promise<string> {
    const p = `${PROJ_PREFIX(projectId)}/${rel}`;
    await this.backend.put(p, bytes);
    return p;
  }
  async getProjectFile(projectId: string, rel: string): Promise<Buffer | null> {
    return this.backend.get(`${PROJ_PREFIX(projectId)}/${rel}`);
  }
}

// Default root: diretório dedicado e estável (fora de /tmp e fora do workspace).
export function resolveArtifactsRoot(explicit?: string): string {
  if (explicit) return explicit;
  return process.env.PROSPECTOR_ARTIFACTS_DIR ?? join(process.cwd(), "data", "branding-artifacts");
}

export function createArtifactStore(opts?: { backend?: ArtifactBackendKind; root?: string; supabase?: SupabaseStorageConfig }): ArtifactStore {
  const kind = opts?.backend ?? (process.env.PROSPECTOR_ARTIFACT_BACKEND as ArtifactBackendKind) ?? "disk";
  if (kind === "supabase" && opts?.supabase) return new ArtifactStore(supabaseBackend(opts.supabase));
  const root = resolveArtifactsRoot(opts?.root);
  mkdirSync(root, { recursive: true });
  return new ArtifactStore(diskBackend(root));
}

export function projectIdScope(projectId: string): string {
  return createHash("sha256").update(projectId).digest("hex").slice(0, 16);
}
