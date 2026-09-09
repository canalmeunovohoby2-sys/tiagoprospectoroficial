import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { analyzeSite, buildVideoScript, validateSiteVideo, generateAndPersistSiteVideo, loadSiteVideo } from "../src/site-video";
import { createArtifactStore } from "../src/artifact-store";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function writeSite(ws: string) {
  mkdirSync(join(ws, "assets/brand"), { recursive: true });
  writeFileSync(join(ws, "brand-state.json"), JSON.stringify({ name: "Bella", selectedConceptId: "1", palette: { primary: "#4F46E5", secondary: "#0EA5E9", accent: "#F59E0B", background: "#FFFFFF", foreground: "#111111" } }));
  writeFileSync(join(ws, "assets/brand/primary.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#4F46E5"/><text x="60" y="26" fill="#fff">B</text></svg>`);
  writeFileSync(join(ws, "index.html"), `<!doctype html><html><head><title>Bella Studio</title><style>body{font-family:sans-serif;color:#111;margin:0}h1{margin:40px}section{padding:40px;min-height:40vh;border-top:1px solid #ccc}h2{font-size:1.6em}a.btn{background:#4F46E5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none}</style></head><body><h1>Bella Studio — Soluções criativas</h1><section><h2>Nossos Serviços</h2><p>Identidade, site e mockups.</p></section><section><h2>Diferenciais</h2><p>Atendimento próximo.</p></section><section><h2>Portfólio</h2><p>Projetos reais.</p></section><section><h2>Fale Conosco</h2><a class="btn" href="https://wa.me/5511">Falar no WhatsApp</a></section></body></html>`);
}

describe("site-video — análise/roteiro (13)", () => {
  let ws: string;
  beforeAll(() => { ws = mkdtempSync(join(tmpdir(), "vid-")); writeSite(ws); });
  afterAll(() => { rmSync(ws, { recursive: true, force: true }); });

  it("analisa o site REAL (DOM) e identifica seções/CTA sem inventar", async () => {
    const brief = await analyzeSite(ws, "A", { target: 45, width: 1920, height: 1080 });
    expect(brief.title).toBe("Bella Studio");
    expect(brief.brand.toLowerCase()).toContain("bella");
    expect(brief.width).toBe(1920); expect(brief.height).toBe(1080);
    expect(brief.sections.some((s) => s.kind === "hero")).toBe(true);
    expect(brief.sections.some((s) => s.kind === "services")).toBe(true);
    expect(brief.sections.some((s) => s.kind === "contact")).toBe(true);
    expect(brief.recommendedScenes.length).toBeGreaterThan(0);
  }, 90000);

  it("roteiro ~40–50s, variável por site e termina em CTA", () => {
    const brief = { recommendedScenes: ["sec1", "sec2", "sec4"], sections: [{ id: "sec1", label: "Hero", heading: "H", scrollY: 0, kind: "hero" }, { id: "sec2", label: "Serviços", heading: "S", scrollY: 500, kind: "services" }, { id: "sec4", label: "Contato", heading: "C", scrollY: 4000, kind: "contact" }], durationTarget: 45, ctas: ["WhatsApp"] } as Parameters<typeof buildVideoScript>[0];
    const script = buildVideoScript(brief);
    const total = script.reduce((s, c) => s + c.duration, 0);
    expect(total).toBeGreaterThanOrEqual(38);
    expect(total).toBeLessThanOrEqual(58);
    expect(script[script.length - 1].kind).toBe("cta");
    // variação entre sites (durações diferentes em inputs diferentes)
    const brief2 = JSON.parse(JSON.stringify(brief)); brief2.recommendedScenes = ["sec2"]; brief2.durationTarget = 50;
    const s2 = buildVideoScript(brief2 as never);
    expect(JSON.stringify(s2.map((x) => x.duration))).not.toBe(JSON.stringify(script.map((x) => x.duration)));
  }, 60000);

  it("valida container/proporção/magic (e rejeita arquivo não-MP4)", () => {
    const m = { container: "mp4" as const, width: 1920, height: 1080, duration: 12, scenes: [] as never[] };
    const r = validateSiteVideo(join(ws, "index.html"), m);
    expect(r.ok).toBe(false); // html não é MP4
    expect(r.issues.some((i) => /MP4|H\.264/i.test(i))).toBe(true);
  }, 60000);
});

describe("site-video — E2E real (13)", () => {
  let wsA: string, wsB: string;
  let storeA: ReturnType<typeof createArtifactStore>; let storeB: ReturnType<typeof createArtifactStore>;
  const A = "vidA", B = "vidB";
  beforeAll(() => {
    wsA = mkdtempSync(join(tmpdir(), "vid-a-")); wsB = mkdtempSync(join(tmpdir(), "vid-b-")); writeSite(wsA); writeSite(wsB);
    storeA = createArtifactStore({ backend: "disk", root: mkdtempSync(join(tmpdir(), "vid-store-a-")) });
    storeB = createArtifactStore({ backend: "disk", root: mkdtempSync(join(tmpdir(), "vid-store-b-")) });
  });
  afterAll(() => { rmSync(wsA, { recursive: true, force: true }); rmSync(wsB, { recursive: true, force: true }); });

  it("captura REAL (Playwright recordVideo) → MP4/WebM → validate → persist → workspace destruído → recuperação → isolamento", async () => {
    const frameA = mkdtempSync(join(tmpdir(), "vid-frames-a-"));
    const res = await generateAndPersistSiteVideo({ workspaceRoot: wsA, projectId: A, store: storeA, target: 12, frameDir: frameA });
    // eslint-disable-next-line no-console
    console.log("VIDEO RES:", res.ok, "reason:", res.reason);
    expect(res.ok).toBe(true); // MP4 real validado (ftyp + H.264 + 16:9 + cenas)
    expect(res.manifest).toBeTruthy();
    const man = res.manifest!;
    expect(man.container).toBe("mp4"); // FASE 14: saída deve ser MP4 real
    expect(man.width).toBe(1920); expect(man.height).toBe(1080);
    expect(man.scenes.length).toBeGreaterThan(0);
    expect(man.validationOk).toBe(true);
    expect(man.sha256).toMatch(/^[a-f0-9]{64}$/);

    // workspace destruído/recriado → recupera do ArtifactStore
    rmSync(wsA, { recursive: true, force: true }); mkdirSync(wsA, { recursive: true });
    const rec = await loadSiteVideo(storeA, A);
    expect(rec!.currentVideo).toBeTruthy();
    expect(rec!.currentManifest).toBeTruthy();
    expect(sha(rec!.currentVideo!)).toBe(man.sha256);
    expect(rec!.currentManifest!.versionId).toBe(man.versionId);

    // isolamento: B ainda sem vídeo (e não vê A)
    const b0 = await loadSiteVideo(storeB, B);
    expect(b0!.currentVideo).toBeNull();
    expect(b0!.versions).toEqual([]);
    rmSync(frameA, { recursive: true, force: true });
  }, 180000);

  it("versionamento: nova geração preserva a anterior", async () => {
    const frameA = mkdtempSync(join(tmpdir(), "vid-frames-ver-"));
    // primeira geração já feita no teste anterior (A tem v1); gera v2
    const res = await generateAndPersistSiteVideo({ workspaceRoot: wsA, projectId: A, store: storeA, target: 8, frameDir: frameA });
    expect(res.ok).toBe(true);
    const loaded = await loadSiteVideo(storeA, A);
    expect(loaded!.versions.length).toBeGreaterThanOrEqual(2);
    expect(loaded!.currentManifest!.versionId).toBe(res.manifest!.versionId); // v2 atual
    rmSync(frameA, { recursive: true, force: true });
  }, 180000);
});
