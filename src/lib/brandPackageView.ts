// Brand package view model (12) — lê o manifesto do pacote (assets/packages/
// package-result.json) persistido e projeta para a UI. Só marca "Pronto" quando
// o ZIP realmente existe, está persistido e validado.
export const PACKAGE_RESULT_PATH = "assets/packages/package-result.json";

export interface BrandPackageView {
  state: "none" | "ready" | "error";
  packageId: string | null;
  versionId: string | null;
  identityName: string;
  fileCount: number | null;
  totalBytes: number | null;
  zipSizeBytes: number | null;
  createdAt: string | null;
  validationOk: boolean | null;
  persisted: boolean | null;
  zipUrl: string | null;
  reason?: string;
}

export function extractBrandPackage(files: Record<string, string> | null | undefined): Record<string, unknown> | null {
  if (!files) return null;
  const raw = files[PACKAGE_RESULT_PATH];
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
}

export function toBrandPackageView(files: Record<string, string> | null | undefined, opts?: { base?: string; projectId?: string }): BrandPackageView {
  const r = extractBrandPackage(files);
  const ready = !!r && r.persisted === true && r.validationOk === true && r.status === "ready";
  return {
    state: !r ? "none" : (ready ? "ready" : "error"),
    packageId: typeof r?.packageId === "string" ? r.packageId : null,
    versionId: typeof r?.versionId === "string" ? r.versionId : null,
    identityName: typeof r?.identityName === "string" ? r.identityName : "",
    fileCount: typeof r?.fileCount === "number" ? r.fileCount : null,
    totalBytes: typeof r?.totalBytes === "number" ? r.totalBytes : null,
    zipSizeBytes: typeof r?.zipSizeBytes === "number" ? r.zipSizeBytes : null,
    createdAt: typeof r?.createdAt === "string" ? r.createdAt : null,
    validationOk: typeof r?.validationOk === "boolean" ? r.validationOk : null,
    persisted: typeof r?.persisted === "boolean" ? r.persisted : null,
    zipUrl: opts?.base && opts.projectId ? brandPackageUrl(opts.base, opts.projectId) : null,
    reason: typeof r?.reason === "string" ? r.reason : undefined,
  };
}

export function brandPackageUrl(base: string, projectId: string): string {
  return `${String(base ?? "").replace(/\/$/, "")}/artifacts/branding/${encodeURIComponent(projectId)}/package/current.zip`;
}

export function hasBrandPackage(files: Record<string, string> | null | undefined): boolean {
  return !!files && !!files[PACKAGE_RESULT_PATH];
}
