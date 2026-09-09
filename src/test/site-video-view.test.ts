import { describe, it, expect } from "vitest";
import { extractSiteVideo, toSiteVideoView, hasSiteVideo, siteVideoUrl, siteVideoPosterUrl, VIDEO_RESULT_PATH } from "../lib/siteVideoView";

const result = { status: "ready", versionId: "v1", container: "webm", duration: 45, width: 1920, height: 1080, fileSize: 9000000, sceneCount: 6, createdAt: "2026-09-09T00:00:00Z", validationOk: true, persisted: true, videoRelPath: "video/current.webm" };

function files() { return { [VIDEO_RESULT_PATH]: JSON.stringify(result) }; }

describe("siteVideoView — Vídeo de apresentação (13)", () => {
  it("só marca ready quando persistido + validado", () => {
    const v = toSiteVideoView(files());
    expect(v.state).toBe("ready");
    expect(v.versionId).toBe("v1");
    expect(v.duration).toBe(45);
    expect(v.width).toBe(1920);
    const vUrl = toSiteVideoView(files(), { base: "http://localhost:8787", projectId: "p" });
    expect(vUrl.videoUrl).toContain("/video/current.webm");
    expect(vUrl.posterUrl).toContain("/video/current-poster.png");
  });

  it("validation falha → error (sem falso pronto)", () => {
    const v = toSiteVideoView({ [VIDEO_RESULT_PATH]: JSON.stringify({ ...result, validationOk: false, status: "error" }) });
    expect(v.state).toBe("error");
    expect(v.videoUrl).toBeNull();
  });

  it("sem manifesto → none", () => {
    expect(toSiteVideoView(null).state).toBe("none");
    expect(hasSiteVideo({ "x": "y" })).toBe(false);
    expect(hasSiteVideo(files())).toBe(true);
    expect(extractSiteVideo({ "x": "y" })).toBeNull();
  });

  it("monta URL do vídeo persistido por container", () => {
    expect(siteVideoUrl("http://localhost:8787/", "p", "mp4")).toContain("/video/current.mp4");
    expect(siteVideoPosterUrl("http://localhost:8787", "p")).toContain("/video/current-poster.png");
  });
});
