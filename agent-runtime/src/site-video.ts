// Site Video (13) — vídeo profissional (aprox. 40–50s) do site FINALIZADO, gerado
// pelo MESMO agente/runtime. Pipeline REAL: analisa o site real (DOM/Playwright),
// cria um roteiro visual com distribuição variável, captura cenas reais (scroll
// suave + gravação real via Playwright recordVideo), compõe/renderiza e PERSISTE
// no ArtifactStore. NUNCA inventa conteúdo; captura apenas a página pública real.
// Container: WebM (gravação nativa do Chromium). Quando FFmpeg existe, TRANCODIFICA
// para MP4 (libx264 + yuv420p + faststart); caso contrário mantém o WebM e sinaliza.
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, extname, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chromium, type Browser, type Page } from "playwright";
import { ArtifactStore } from "./artifact-store.js";
import { resolveBrandIdentity } from "./mockup-integration.js";

export type VideoContainer = "mp4" | "webm";

export interface SiteVideoSection { id: string; label: string; heading: string; scrollY: number; kind: "hero" | "services" | "differentiators" | "gallery" | "proof" | "contact" | "cta" | "other"; }
export interface SiteVideoScene { id: string; sectionId: string; label: string; heading: string; scrollY: number; duration: number; transition: "fade" | "scroll" | "cut" | "zoom"; kind: SiteVideoSection["kind"]; overlay?: string; }
export interface SiteVideoBrief {
  projectId: string; title: string; brand: string;
  visualLanguage: string; durationTarget: number; width: number; height: number;
  hero: string; sections: SiteVideoSection[]; differentiators: string[]; services: string[]; ctas: string[];
  recommendedScenes: string[]; narrative: string;
}
export interface SiteVideoManifest {
  projectId: string; versionId: string; duration: number; width: number; height: number; fps: number;
  container: VideoContainer; scenes: SiteVideoScene[]; sourceSections: string[];
  fileSize: number; sha256: string; createdAt: string; validatedAt: string | null; validationOk: boolean;
  videoRelPath: string; posterRelPath?: string; reason?: string;
}
const SHA = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function serve(root: string): Promise<{ server: Server; url: string }> {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      let path = decodeURIComponent((req.url ?? "/").split("?")[0]);
      if (path === "/") path = "/index.html";
      const clean = path.replace(/^\/+/, "").split("/").filter((s) => s && s !== "..");
      const base = resolve(root);
      const target = join(base, ...clean);
      const ok = target === base || target.startsWith(base + sep);
      const file = ok && existsSync(target) && statSync(target).isFile() ? target : (ok && existsSync(join(target, "index.html")) ? join(target, "index.html") : null);
      if (!file) { res.writeHead(404); res.end("not found"); return; }
      const ext = extname(file); const mime = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".json": "application/json; charset=utf-8" }[ext] ?? "application/octet-stream";
      res.writeHead(200, { "content-type": mime, "cache-control": "no-store" });
      res.end(readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => { const addr = server.address() as { port: number }; done({ server, url: `http://127.0.0.1:${addr.port}/` }); });
  });
}

function kindOf(heading: string): SiteVideoSection["kind"] {
  const h = heading.toLowerCase();
  if (/serviç|servic|servi\w/i.test(h)) return "services";
  if (/diferencia|diferencial|por que|vantag|benef[iíç]/i.test(h)) return "differentiators";
  if (/galeria|portf[oó]lio|portfólio|projeto/i.test(h)) return "gallery";
  if (/depoiment|prova|aval[iíç]|testimonial/i.test(h)) return "proof";
  if (/contato|fale|localiza|endere/i.test(h)) return "contact";
  if (/sobre|empresa|quem/i.test(h)) return "other";
  return "other";
}

export async function analyzeSite(workspaceRoot: string, projectId: string, opts?: { target?: number; width?: number; height?: number }): Promise<SiteVideoBrief> {
  const W = opts?.width ?? 1920, H = opts?.height ?? 1080;
  const { server, url } = await serve(workspaceRoot);
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    const info = await page.evaluate(() => {
      const docH = document.documentElement.scrollHeight;
      const headings = [...document.querySelectorAll("h1,h2,h3")].map((h) => ({ t: h.tagName, text: (h.textContent ?? "").trim().slice(0, 120), top: Math.round(h.getBoundingClientRect().top + window.scrollY) })).filter((x) => x.text);
      const ctas = [...document.querySelectorAll("a[href],button")].filter((el) => /(contato|whatsapp|orcamento|saiba|agende|compre|inscrev|baixe|pedir)/i.test((el.textContent ?? ""))).slice(0, 8).map((el) => (el.textContent ?? "").trim().slice(0, 60));
      const images = document.querySelectorAll("img").length;
      return { docH, title: document.title || "Site", headings, ctas, images };
    });
    const sections: SiteVideoSection[] = [];
    let hero = info.headings[0]?.text ?? info.title;
    const seen = new Set<string>();
    info.headings.forEach((h, i) => {
      const kind = i === 0 ? "hero" : kindOf(h.text);
      const id = `sec${i + 1}`;
      if (seen.has(h.text)) return; seen.add(h.text);
      sections.push({ id, label: h.text.slice(0, 30), heading: h.text, scrollY: Math.max(0, h.top - 40), kind });
    });
    if (!sections.length) sections.push({ id: "hero", label: "Hero", heading: info.title, scrollY: 0, kind: "hero" });
    const ctas = info.ctas.length ? info.ctas : ["Contato"];
    // identidade real para a narrativa
    let brand = "Marca";
    try { const id = resolveBrandIdentity(readWorkspaceFiles(workspaceRoot)); brand = id?.name ?? brand; } catch { /* sem identidade */ }
    const docH = info.docH;
    const durationTarget = opts?.target ?? 45;
    const recommendedScenes = sections.filter((s) => s.kind !== "other").map((s) => s.id).slice(0, 6);
    if (!recommendedScenes.length) recommendedScenes.push(sections[0].id);
    return {
      projectId, title: info.title, brand, visualLanguage: `layout desktop ${W}×${H}`,
      durationTarget, width: W, height: H,
      hero, sections, differentiators: sections.filter((s) => s.kind === "differentiators").map((s) => s.heading),
      services: sections.filter((s) => s.kind === "services").map((s) => s.heading),
      ctas, recommendedScenes,
      narrative: `${brand}: apresentação do site ${info.title} — ${sections.length} seções reais, foco no melhor conteúdo e no CTA final.`,
    };
  } finally {
    await browser.close(); await new Promise<void>((r) => server.close(() => r()));
  }
}

function readWorkspaceFiles(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string, rel?: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name); const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".git") walk(full, r); }
      else if (r.endsWith(".json") || r.endsWith(".svg")) { try { out[r] = readFileSync(full, "utf8"); } catch { /* noop */ } }
    }
  };
  walk(root); return out;
}

// ---- Roteiro visual (distribuição VARIÁVEL) ----
export function buildVideoScript(brief: SiteVideoBrief): SiteVideoScene[] {
  const parts = brief.recommendedScenes.length ? brief.recommendedScenes : (brief.sections.map((s) => s.id));
  const scenes: SiteVideoScene[] = [];
  const total = brief.durationTarget;
  const portion = total / (parts.length + 1); // + cta final
  const secs = (i: number) => Math.max(3, Math.round(portion * (0.8 + 0.4 * ((i * 7) % 3)))); // variação por seção
  let t = 0;
  const ctaScene = brief.sections.find((s) => s.kind === "contact") ?? { id: "cta", label: "CTA", heading: brief.ctas[0] ?? "Contato", scrollY: Number.MAX_SAFE_INTEGER, kind: "cta" as const };
  const tos = parts.map((id) => { const s = brief.sections.find((x) => x.id === id) ?? brief.sections[0]; return s; });
  // primeiro: hero (impacto) na largura de tela inicial
  tos.forEach((s, i) => {
    const d = secs(i);
    scenes.push({ id: `s${i + 1}`, sectionId: s.id, label: s.label, heading: s.heading, scrollY: s.scrollY, duration: d, transition: i === 0 ? "fade" : "scroll", kind: s.kind === "other" ? "other" : s.kind, overlay: i === 0 ? brief.hero : undefined });
    t += d;
  });
  // CTA de encerramento (scroll até o fim)
  const ctaDur = Math.max(5, total - t);
  scenes.push({ id: "cta", sectionId: ctaScene.id, label: "CTA / Encerramento", heading: ctaScene.heading || brief.ctas[0] || "Contato", scrollY: ctaScene.scrollY === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : ctaScene.scrollY, duration: ctaDur, transition: "zoom", kind: "cta", overlay: brief.ctas[0] ?? "Contato" });
  return scenes;
}

export async function renderFrameScreenshots(workspaceRoot: string, scenes: SiteVideoScene[], outDir: string, opts?: { width?: number; height?: number }): Promise<string[]> {
  const W = opts?.width ?? 1920, H = opts?.height ?? 1080;
  const { server, url } = await serve(workspaceRoot);
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
  const paths: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    for (const sc of scenes) {
      if (sc.scrollY === Number.MAX_SAFE_INTEGER) await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));
      else await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), sc.scrollY);
      await page.waitForTimeout(600);
      const p = join(outDir, `${sc.id}.png`);
      await page.screenshot({ path: p });
      paths.push(p);
    }
  } finally {
    await browser.close(); await new Promise<void>((r) => server.close(() => r()));
  }
  return paths;
}

export async function renderSiteVideo(workspaceRoot: string, brief: SiteVideoBrief, scenes: SiteVideoScene[], outDir: string): Promise<{ videoPath: string; container: VideoContainer; duration: number; width: number; height: number; frames: string[]; mp4?: string }> {
  mkdirSync(outDir, { recursive: true });
  const W = brief.width, H = brief.height;
  const { server, url } = await serve(workspaceRoot);
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: outDir, size: { width: W, height: H } } });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    for (const sc of scenes) {
      if (sc.scrollY === Number.MAX_SAFE_INTEGER) await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));
      else await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), sc.scrollY);
      await page.waitForTimeout(Math.max(500, sc.duration * 400));
    }
    await page.waitForTimeout(1500);
    const video = page.video()!;
    await ctx.close();
    const webmPath = await video.path();
    await browser.close();
    await new Promise<void>((r) => server.close(() => r()));

    // TRANSCONTA para MP4 real (H.264 / yuv420p / faststart) — determinístico
    const ffmpeg = resolveFfmpeg();
    if (!ffmpeg) throw new Error("MP4 encoding requires FFmpeg (ffmpeg-static ou ffmpeg no PATH) — nenhum encoder disponível.");
    const mp4Path = join(outDir, "video.mp4");
    const r = spawnSync(ffmpeg, ["-y", "-i", webmPath, "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4Path], { stdio: "ignore", timeout: 300_000 });
    if (r.status !== 0 || !existsSync(mp4Path) || statSync(mp4Path).size < 1024) throw new Error(`Falha ao transcode WebM→MP4 (ffmpeg exit ${r.status}).`);
    const frames = await renderFrameScreenshots(workspaceRoot, scenes, join(outDir, "frames"), { width: W, height: H });
    const duration = scenes.reduce((s, c) => s + c.duration, 0);
    return { videoPath: mp4Path, container: "mp4", duration, width: W, height: H, frames, mp4: mp4Path };
  } catch (e) {
    await browser.close().catch(() => {}); await new Promise<void>((r) => server.close(() => r()));
    throw e;
  }
}

// ---- Encoder determinístico: ffmpeg-static (bundled) → senão ffmpeg no PATH ----
let ffmpegPath: string | null | undefined;
export function resolveFfmpeg(): string | null {
  if (ffmpegPath !== undefined) return ffmpegPath;
  try { // eslint-disable-next-line @typescript-eslint/no-var-requires
    const p = (require("ffmpeg-static") as string | null);
    if (typeof p === "string" && p && existsSync(p)) { ffmpegPath = p; return p; }
  } catch { /* sem ffmpeg-static */ }
  try { const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }); if (r.status === 0) { ffmpegPath = "ffmpeg"; return "ffmpeg"; } } catch { /* noop */ }
  ffmpegPath = null;
  return null;
}

// ---- Probe de vídeo real via ffmpeg (duração/resolução/codec) ----
export function probeVideo(videoPath: string): { ok: boolean; duration?: number; width?: number; height?: number; codec?: string; raw?: string } {
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) return { ok: false };
  try {
    const r = spawnSync(ffmpeg, ["-i", videoPath], { encoding: "utf8" });
    const err = `${r.stderr ?? ""} ${r.stdout ?? ""}`;
    const dur = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(err);
    const durSec = dur ? (+dur[1] * 3600 + +dur[2] * 60 + +dur[3]) : undefined;
    const res = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(err);
    const codec = /Video:\s*(\w+)/.exec(err)?.[1];
    return { ok: !!dur || !!res, duration: durSec, width: res ? +res[1] : undefined, height: res ? +res[2] : undefined, codec, raw: err.slice(0, 400) };
  } catch { return { ok: false }; }
}

// ---- Validação real do vídeo (confirma MP4 H.264/válido, não apenas arquivo) ----
export function validateSiteVideo(videoPath: string, m: { container: VideoContainer; width: number; height: number; duration: number; scenes: SiteVideoScene[] }): { ok: boolean; checks: string[]; issues: string[] } {
  const checks: string[] = []; const issues: string[] = [];
  if (!existsSync(videoPath)) { issues.push("vídeo ausente"); checks.push("existe: não"); return { ok: false, checks, issues }; }
  const buf = readFileSync(videoPath);
  checks.push(`existe: sim (${buf.length} bytes)`);
  if (buf.length < 1024) issues.push(`vídeo pequeno demais (${buf.length} bytes)`);
  const isMp4 = /ftyp/.test(buf.subarray(4, 64).toString("latin1"));
  checks.push(`container: esperado MP4 → ${isMp4 ? "ftyp ok" : "NÃO É MP4"}`);
  if (m.container === "mp4" && !isMp4) issues.push("esperado MP4 (ftyp) mas não confirmado");
  // H.264 (avc1) presente no container
  const hasAvc1 = buf.includes(Buffer.from("avc1"));
  checks.push(`codec H.264: ${hasAvc1 ? "avc1 ok" : "avc1 ausente"}`);
  if (m.container === "mp4" && !hasAvc1) issues.push("MP4 sem H.264 (avc1) — esperado yuv420p/H.264");
  // moov/mvhd (apresentação legível)
  const hasMoov = buf.includes(Buffer.from("moov")) && buf.includes(Buffer.from("mvhd"));
  checks.push(`estrutura MP4: ${hasMoov ? "moov/mvhd ok" : "sem moov/mvhd"}`);
  if (m.container === "mp4" && !hasMoov) issues.push("MP4 sem moov/mvhd (apresentação incompleta)");
  checks.push(`dimensões: ${m.width}×${m.height} (16:9: ${Math.round((m.width / m.height) * 100) / 100 === 1.78 ? "ok" : "não"})`);
  if (m.width / m.height < 1.7 || m.width / m.height > 1.9) issues.push(`proporção não é 16:9 (${m.width}/${m.height})`);
  // probe real (duração/codec) quando FFmpeg disponível
  const probe = probeVideo(videoPath);
  if (probe.ok && probe.duration !== undefined) {
    checks.push(`probe duração: ${Math.round(probe.duration)}s · codec ${probe.codec}`);
    if (probe.codec && !/h264|avc/i.test(probe.codec)) issues.push(`codec no container não é H.264 (${probe.codec})`);
  } else {
    checks.push("probe ffmpeg: indisponível (validação por boxes)");
  }
  checks.push(`duração (manifesto): ${m.duration}s`);
  if (m.duration <= 0) issues.push(`duração inválida (${m.duration}s)`);
  checks.push(`cenas: ${m.scenes.length}`);
  return { ok: issues.length === 0, checks, issues };
}

// ---- Persistência + recuperação ----
export async function persistSiteVideo(store: ArtifactStore, projectId: string, videoPath: string, frames: string[], manifest: SiteVideoManifest): Promise<void> {
  const base = "video";
  const vidBytes = readFileSync(videoPath);
  const perVersion = `video/versions/${manifest.versionId}`;
  await store.putProjectFile(projectId, `${perVersion}/video.${manifest.container}`, vidBytes);
  await store.putProjectFile(projectId, `${perVersion}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)));
  await store.putProjectFile(projectId, `video/current.${manifest.container}`, vidBytes);
  await store.putProjectFile(projectId, `video/current.json`, Buffer.from(JSON.stringify(manifest, null, 2)));
  // frame/pôster (primeiro frame) para preview rápido
  if (frames.length) {
    const poster = readFileSync(frames[0]);
    await store.putProjectFile(projectId, `video/current-poster.png`, poster);
    manifest.posterRelPath = "video/current-poster.png";
    await store.putProjectFile(projectId, `video/current.json`, Buffer.from(JSON.stringify(manifest, null, 2)));
  }
  let versions: string[] = [];
  const vs = await store.getProjectFile(projectId, `video/versions.json`);
  if (vs) { try { versions = JSON.parse(vs.toString()); } catch { versions = []; } }
  if (!versions.includes(manifest.versionId)) versions.push(manifest.versionId);
  await store.putProjectFile(projectId, `video/versions.json`, Buffer.from(JSON.stringify(versions)));
}

export async function loadSiteVideo(store: ArtifactStore, projectId: string, container?: VideoContainer): Promise<{ currentVideo: Buffer | null; currentManifest: SiteVideoManifest | null; poster: Buffer | null; versions: string[] } | null> {
  const base = "video";
  const mBuf = await store.getProjectFile(projectId, `${base}/current.json`);
  const manifest = mBuf ? (JSON.parse(mBuf.toString()) as SiteVideoManifest) : null;
  const ext = container ?? manifest?.container ?? "webm";
  const video = await store.getProjectFile(projectId, `${base}/current.${ext}`);
  const poster = await store.getProjectFile(projectId, `${base}/current-poster.png`);
  let versions: string[] = [];
  const vs = await store.getProjectFile(projectId, `${base}/versions.json`);
  if (vs) { try { versions = JSON.parse(vs.toString()); } catch { versions = []; } }
  return { currentVideo: video ?? null, currentManifest: manifest, poster: poster ?? null, versions };
}

export async function generateAndPersistSiteVideo(input: { workspaceRoot: string; projectId: string; store: ArtifactStore; target?: number; frameDir?: string }): Promise<{ manifest: SiteVideoManifest | null; ok: boolean; reason?: string; videoPath?: string }> {
  const target = input.target ?? 45;
  const frameDir = input.frameDir ?? join(process.cwd(), "data", "video-frames");
  try {
    const brief = await analyzeSite(input.workspaceRoot, input.projectId, { target });
    const scenes = buildVideoScript(brief);
    const outDir = join(frameDir, input.projectId, new Date().toISOString().replace(/[:.]/g, "-"));
    const render = await renderSiteVideo(input.workspaceRoot, brief, scenes, outDir);
    const container = render.container;
    const versionId = new Date().toISOString().replace(/[:.]/g, "-");
    const videoBytes = readFileSync(render.videoPath);
    const baseManifest = {
      projectId: input.projectId, versionId, duration: render.duration, width: render.width, height: render.height,
      fps: 30, container, scenes, sourceSections: brief.recommendedScenes,
      fileSize: videoBytes.length, sha256: SHA(videoBytes), createdAt: new Date().toISOString(),
      validatedAt: null, validationOk: false, videoRelPath: `video/current.${container}`,
    };
    const validation = validateSiteVideo(render.videoPath, baseManifest);
    const manifest: SiteVideoManifest = { ...baseManifest, validatedAt: validation.ok ? new Date().toISOString() : null, validationOk: validation.ok, posterRelPath: undefined };
    await persistSiteVideo(input.store, input.projectId, render.videoPath, render.frames, manifest);
    // limpa frames temporários (performance #24) — mantém apenas persistido
    rmSync(outDir, { recursive: true, force: true });
    return { manifest, ok: validation.ok, videoPath: render.videoPath, reason: validation.ok ? undefined : validation.issues.join("; ") };
  } catch (e) {
    return { manifest: null, ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

// ---- Manifesto (texto) para a UI — o MP4/WebM nunca vai para generated_code ----
import { writeFileSync } from "node:fs";
export const VIDEO_RESULT_REL = "assets/videos/video-result.json";
export const VIDEO_HISTORY_REL = "assets/videos/video-history.json";

export interface SiteVideoResultText {
  status: "ready" | "error";
  versionId: string; container: VideoContainer; duration: number; width: number; height: number;
  sceneCount: number; sourceSections: string[]; fileSize: number; createdAt: string;
  validationOk: boolean; persisted: boolean; videoRelPath: string; posterRelPath?: string; reason?: string;
}

export function siteVideoResultText(m: SiteVideoManifest): SiteVideoResultText {
  return {
    status: m.validationOk ? "ready" : "error",
    versionId: m.versionId, container: m.container, duration: m.duration, width: m.width, height: m.height,
    sceneCount: m.scenes.length, sourceSections: m.sourceSections, fileSize: m.fileSize, createdAt: m.createdAt,
    validationOk: m.validationOk, persisted: m.validationOk, videoRelPath: m.videoRelPath, posterRelPath: m.posterRelPath,
  };
}

export function writeSiteVideoManifest(workspaceRoot: string, m: SiteVideoManifest): Record<string, string> {
  const result = siteVideoResultText(m);
  let history: SiteVideoResultText[] = [];
  const hp = join(workspaceRoot, VIDEO_HISTORY_REL);
  if (existsSync(hp)) { try { history = JSON.parse(readFileSync(hp, "utf8")); } catch { history = []; } }
  history.push({ ...result });
  mkdirSync(join(workspaceRoot, "assets/videos"), { recursive: true });
  writeFileSync(join(workspaceRoot, VIDEO_RESULT_REL), JSON.stringify(result, null, 2));
  writeFileSync(hp, JSON.stringify(history, null, 2));
  return { [VIDEO_RESULT_REL]: JSON.stringify(result, null, 2), [VIDEO_HISTORY_REL]: JSON.stringify(history, null, 2) };
}
