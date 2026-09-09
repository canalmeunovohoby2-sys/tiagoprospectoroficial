// Brand PDF view model (11) — lê o manifesto do Manual da Identidade
// (assets/pdfs/pdf-result.json) persistido no projeto e projeta para a UI.
// Só mostra "Pronto" quando o PDF realmente existe, está persistido e válido.
export const PDF_RESULT_PATH = "assets/pdfs/pdf-result.json";

export interface BrandPdfView {
  state: "none" | "ready" | "error";
  versionId: string | null;
  identityName: string;
  pageCount: number | null;
  createdAt: string | null;
  primary: string;
  validationOk: boolean | null;
  persisted: boolean | null;
  pdfUrl: string | null;
  reason?: string;
}

export function extractBrandPdf(files: Record<string, string> | null | undefined): {
  status?: string; versionId?: string; identityName?: string; pageCount?: number;
  createdAt?: string; primary?: string; validationOk?: boolean; persisted?: boolean; reason?: string;
} | null {
  if (!files) return null;
  const raw = files[PDF_RESULT_PATH];
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    return {
      status: typeof j.status === "string" ? j.status : undefined,
      versionId: typeof j.versionId === "string" ? j.versionId : undefined,
      identityName: typeof j.identityName === "string" ? j.identityName : undefined,
      pageCount: typeof j.pageCount === "number" ? j.pageCount : undefined,
      createdAt: typeof j.createdAt === "string" ? j.createdAt : undefined,
      primary: typeof j.primary === "string" ? j.primary : undefined,
      validationOk: typeof j.validationOk === "boolean" ? j.validationOk : undefined,
      persisted: typeof j.persisted === "boolean" ? j.persisted : undefined,
      reason: typeof j.reason === "string" ? j.reason : undefined,
    };
  } catch {
    return null;
  }
}

export function toBrandPdfView(files: Record<string, string> | null | undefined, opts?: { base?: string; projectId?: string }): BrandPdfView {
  const r = extractBrandPdf(files);
  return {
    state: !r ? "none" : (r.persisted && r.validationOk && r.status === "ready" ? "ready" : "error"),
    versionId: r?.versionId ?? null,
    identityName: r?.identityName ?? "",
    pageCount: r?.pageCount ?? null,
    createdAt: r?.createdAt ?? null,
    primary: r?.primary ?? "#111",
    validationOk: r?.validationOk ?? null,
    persisted: r?.persisted ?? null,
    pdfUrl: opts?.base && opts.projectId ? brandPdfUrl(opts.base, opts.projectId) : null,
    reason: r?.reason,
  };
}

export function brandPdfUrl(base: string, projectId: string): string {
  return `${String(base ?? "").replace(/\/$/, "")}/artifacts/branding/${encodeURIComponent(projectId)}/pdf/current.pdf`;
}

export function hasBrandPdf(files: Record<string, string> | null | undefined): boolean {
  return !!files && !!files[PDF_RESULT_PATH];
}
