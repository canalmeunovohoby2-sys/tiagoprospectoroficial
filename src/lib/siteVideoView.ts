// Site video view model (13) — lê o manifesto (assets/videos/video-result.json)
// e projeta para a UI. Só marca "Pronto" quando o vídeo real está persistido e
// validado. Nunca carrega o MP4 em base64 — usa URL autenticada + poster.
export const VIDEO_RESULT_PATH = "assets/videos/video-result.json";

export interface SiteVideoView {
  state: "none" | "ready" | "error";
  versionId: string | null;
  container: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  sceneCount: number | null;
  createdAt: string | null;
  validationOk: boolean | null;
  videoUrl: string | null;
  posterUrl: string | null;
  reason?: string;
}

export function extractSiteVideo(files: Record<string, string> | null | undefined): Record<string, unknown> | null {
  if (!files) return null;
  const raw = files[VIDEO_RESULT_PATH];
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
}

export function toSiteVideoView(files: Record<string, string> | null | undefined, opts?: { base?: string; projectId?: string }): SiteVideoView {
  const r = extractSiteVideo(files);
  const ready = !!r && r.validationOk === true && r.status === "ready";
  return {
    state: !r ? "none" : (ready ? "ready" : "error"),
    versionId: typeof r?.versionId === "string" ? r.versionId : null,
    container: typeof r?.container === "string" ? r.container : null,
    duration: typeof r?.duration === "number" ? r.duration : null,
    width: typeof r?.width === "number" ? r.width : null,
    height: typeof r?.height === "number" ? r.height : null,
    fileSize: typeof r?.fileSize === "number" ? r.fileSize : null,
    sceneCount: typeof r?.sceneCount === "number" ? r.sceneCount : null,
    createdAt: typeof r?.createdAt === "string" ? r.createdAt : null,
    validationOk: typeof r?.validationOk === "boolean" ? r.validationOk : null,
    videoUrl: opts?.base && opts.projectId && (r?.container === "mp4" || r?.container === "webm") ? siteVideoUrl(opts.base, opts.projectId, r.container as string) : null,
    posterUrl: opts?.base && opts.projectId ? siteVideoPosterUrl(opts.base, opts.projectId) : null,
    reason: typeof r?.reason === "string" ? r.reason : undefined,
  };
}

export function siteVideoUrl(base: string, projectId: string, container: string): string {
  return `${String(base ?? "").replace(/\/$/, "")}/artifacts/branding/${encodeURIComponent(projectId)}/video/current.${container}`;
}

export function siteVideoPosterUrl(base: string, projectId: string): string {
  return `${String(base ?? "").replace(/\/$/, "")}/artifacts/branding/${encodeURIComponent(projectId)}/video/current-poster.png`;
}

export function hasSiteVideo(files: Record<string, string> | null | undefined): boolean {
  return !!files && !!files[VIDEO_RESULT_PATH];
}
