// Mockup view model (10.10) — projeta o estado dos mockups (mockup-result.json)
// do projeto em um modelo pronto para a UI, e seletores puros para testes (sem RTL).
// Não duplica o motor de mockup — apenas lê o resultado REAL persistido e mapeia
// para a tela. Só mostra sucesso quando o backend comprovou (persisted).

export interface MockupPreviewLike {
  applicationId: string;
  dataUrl: string;   // PNG real (base64) da camada modificada
  bytes: number;
  width: number;
  height: number;
}

export interface MockupResultLike {
  status: "applied" | "partial" | "failed" | string;
  versionId: string;
  applicationsApplied: string[];
  applicationsUnsupported: Array<{ applicationId: string; reason: string }>;
  previews: MockupPreviewLike[];
  modifiedColors: string[];
  persisted: boolean;
  createdAt: string;
  identityUsed: { name: string; primary: string; secondary: string; accent?: string; versionId?: number | string | null } | null;
  outputPsdBytes: number;
  reason?: string;
}

export interface MockupView {
  hasMockup: boolean;
  status: string;
  isReady: boolean;
  isProcessing: boolean;
  identityName: string;
  primary: string;
  secondary: string;
  accent: string;
  applicationsApplied: string[];
  applicationsUnsupported: Array<{ applicationId: string; reason: string }>;
  previews: MockupPreviewLike[];
  modifiedColors: string[];
  versionId: string | null;
  createdAt: string | null;
}

export function extractMockupResult(files: Record<string, string> | null | undefined): MockupResultLike | null {
  if (!files) return null;
  const raw = files["assets/mockups/mockup-result.json"];
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const previews = (Array.isArray(j.previews) ? j.previews : []).map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return {
        applicationId: String(o.applicationId ?? ""),
        dataUrl: String(o.dataUrl ?? ""),
        bytes: Number(o.bytes ?? 0),
        width: Number(o.width ?? 0),
        height: Number(o.height ?? 0),
      };
    });
    const unsupported = (Array.isArray(j.applicationsUnsupported) ? j.applicationsUnsupported : []).map((u) => {
      const o = (u ?? {}) as Record<string, unknown>;
      return { applicationId: String(o.applicationId ?? ""), reason: String(o.reason ?? "") };
    });
    const identityUsed = (j.identityUsed && typeof j.identityUsed === "object") ? (j.identityUsed as Record<string, unknown>) : null;
    return {
      status: String(j.status ?? "unknown"),
      versionId: String(j.versionId ?? ""),
      applicationsApplied: (Array.isArray(j.applicationsApplied) ? j.applicationsApplied : []).map(String),
      applicationsUnsupported: unsupported,
      previews,
      modifiedColors: (Array.isArray(j.modifiedColors) ? j.modifiedColors : []).map(String),
      persisted: j.persisted === true,
      createdAt: String(j.createdAt ?? ""),
      identityUsed: identityUsed ? {
        name: String(identityUsed.name ?? "Marca"),
        primary: String(identityUsed.primary ?? "#111"),
        secondary: String(identityUsed.secondary ?? "#666"),
        accent: String(identityUsed.accent ?? ""),
        versionId: (identityUsed.versionId as number | string | null) ?? null,
      } : null,
      outputPsdBytes: Number(j.outputPsdBytes ?? 0),
      reason: typeof j.reason === "string" ? j.reason : undefined,
    };
  } catch {
    return null;
  }
}

export function toMockupView(files: Record<string, string> | null | undefined): MockupView {
  const r = extractMockupResult(files);
  const status = r?.status ?? "none";
  return {
    hasMockup: !!r,
    status,
    isReady: r?.status === "applied" && r.persisted === true,
    isProcessing: false,
    identityName: r?.identityUsed?.name ?? "",
    primary: r?.identityUsed?.primary ?? "#111",
    secondary: r?.identityUsed?.secondary ?? "#666",
    accent: r?.identityUsed?.accent ?? "",
    applicationsApplied: r?.applicationsApplied ?? [],
    applicationsUnsupported: r?.applicationsUnsupported ?? [],
    previews: r?.previews ?? [],
    modifiedColors: r?.modifiedColors ?? [],
    versionId: r?.versionId ?? null,
    createdAt: r?.createdAt ?? null,
  };
}

export function hasMockupState(files: Record<string, string> | null | undefined): boolean {
  return !!files && !!files["assets/mockups/mockup-result.json"];
}

/** URL do preview persistido a partir do runtime de artefatos (armazenamento definitivo). */
export function mockupPreviewUrl(base: string, projectId: string, applicationId: string): string {
  const clean = String(base ?? "").replace(/\/$/, "");
  return `${clean}/artifacts/branding/${encodeURIComponent(projectId)}/mockups/current/${encodeURIComponent(applicationId)}.png`;
}

/** URL do PSD derivado (binário sob demanda — nunca embutido em generated_code). */
export function mockupPsdUrl(base: string, projectId: string): string {
  const clean = String(base ?? "").replace(/\/$/, "");
  return `${clean}/artifacts/branding/${encodeURIComponent(projectId)}/mockups/current/master-output.psd`;
}
