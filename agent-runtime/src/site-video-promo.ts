// ============================================================================
// VÍDEO PROMOCIONAL DO SITE (apresentação para o cliente) — MP4 H.264.
//
// Grava o site REAL do projeto (Chromium/Playwright recordVideo), com:
//  - cursor sintético visível + click-ripple (não há cursor do SO na gravação);
//  - navegação ADAPTATIVA descoberta no DOM real (hero → seções → imagens → CTA);
//  - scroll suave (rAF easing) e pausas naturais;
//  - efeito cinematográfico sutil (zoom lento via FFmpeg, com fallback seguro);
//  - conversão para MP4 H.264 (yuv420p/faststart) com `ffmpeg-static`;
//  - validação REAL do arquivo (ftyp/avc1/moov + probe via FFmpeg);
//  - persistência no Artifact Store ISOLADA por projeto.
//
// SOMENTE LEITURA: nunca clica de verdade (só ripple), nunca envia formulário,
// nunca edita o site.
//
// Referência técnica: github.com/mcpware/pagecast (MIT) — cursor overlay,
// click ripple, timeline de interações e cinematic crop/zoom via FFmpeg.
// ============================================================================
import { mkdirSync, existsSync, readFileSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createArtifactStore, type ArtifactStore } from "./artifact-store.js";
import { resolveFfmpeg, probeVideo, serve } from "./site-video.js";

const DEFAULT_W = 1280;
const DEFAULT_H = 720;

export type PromoPhase = "preparing" | "opening" | "recording" | "processing" | "validating" | "done";

export interface PromoVideoOptions {
  workspaceRoot: string;
  projectId: string;
  store?: ArtifactStore;
  width?: number;
  height?: number;
  /** alvo de duração em segundos (default 30; faixa 20–45). */
  target?: number;
  /** efeito cinematográfico (zoom lento). default true; se falhar, cai no plano. */
  cinematic?: boolean;
  onPhase?: (phase: PromoPhase, detail?: string) => void;
}

export interface PromoVideoResult {
  ok: boolean;
  reason?: string;
  duration?: number;
  width?: number;
  height?: number;
  fileSize?: number;
  codec?: string;
  relPath?: string;      // caminho no Artifact Store (servido pela rota de artifacts)
  posterRelPath?: string;
  checks?: string[];
  issues?: string[];
}

interface Target { kind: string; text: string; top: number; x: number; y: number; }

function logPhase(opts: PromoVideoOptions, phase: PromoPhase, detail?: string): void {
  try { opts.onPhase?.(phase, detail); } catch { /* noop */ }
}

// ---- Cursor sintético (Pagecast-like): seta + ripple, injetados na página ----
async function injectCursor(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById("__pc_cursor")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__pc_cursor{position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;pointer-events:none;transform:translate(40px,40px);filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}
      #__pc_cursor svg{display:block}
      .__pc_ripple{position:fixed;z-index:2147483646;pointer-events:none;border:3px solid rgba(37,99,235,.9);border-radius:50%;width:12px;height:12px;transform:translate(-50%,-50%);animation:__pc_ripple .6s ease-out forwards}
      @keyframes __pc_ripple{0%{opacity:.95;width:12px;height:12px}100%{opacity:0;width:74px;height:74px}}
    `;
    document.documentElement.appendChild(style);
    const cur = document.createElement("div");
    cur.id = "__pc_cursor";
    cur.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 2 L20 12 L12 13.2 L8.8 21 Z" fill="#111827" stroke="#ffffff" stroke-width="1.5"/></svg>';
    document.documentElement.appendChild(cur);
    (window as unknown as { __pc: unknown }).__pc = {
      click(x: number, y: number) {
        const r = document.createElement("div");
        r.className = "__pc_ripple";
        r.style.left = `${x}px`;
        r.style.top = `${y}px`;
        document.documentElement.appendChild(r);
        setTimeout(() => r.remove(), 700);
      },
    };
  });
}

async function moveCursor(page: Page, x: number, y: number, ms: number): Promise<void> {
  await page.evaluate(
    ({ x: tx, y: ty, ms: dur }) =>
      new Promise<boolean>((resolve) => {
        const cur = document.getElementById("__pc_cursor") as HTMLElement | null;
        if (!cur) return resolve(true);
        const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(cur.style.transform);
        const sx = m ? parseFloat(m[1]) : 40;
        const sy = m ? parseFloat(m[2]) : 40;
        const t0 = performance.now();
        const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        const step = () => {
          const p = Math.min(1, (performance.now() - t0) / dur);
          const e = ease(p);
          cur.style.transform = `translate(${sx + (tx - sx) * e}px, ${sy + (ty - sy) * e}px)`;
          if (p < 1) requestAnimationFrame(step);
          else resolve(true);
        };
        requestAnimationFrame(step);
      }),
    { x, y, ms },
  );
}

async function smoothScroll(page: Page, toY: number, ms: number): Promise<void> {
  await page.evaluate(
    ({ toY: y2, ms: dur }) =>
      new Promise<boolean>((resolve) => {
        const startY = window.scrollY;
        const t0 = performance.now();
        const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        const step = () => {
          const p = Math.min(1, (performance.now() - t0) / dur);
          window.scrollTo(0, startY + (y2 - startY) * ease(p));
          if (p < 1) requestAnimationFrame(step);
          else resolve(true);
        };
        requestAnimationFrame(step);
      }),
    { toY, ms },
  );
}

// ---- Descoberta ADAPTATIVA de alvos reais no DOM (nunca inventa seletor) ----
async function discoverTargets(page: Page): Promise<{ docH: number; vw: number; vh: number; targets: Target[] }> {
  return await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const docH = document.documentElement.scrollHeight;
    const found: Array<{ kind: string; text: string; top: number; x: number; y: number }> = [];
    const add = (el: Element | null, kind: string) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      const top = Math.round(r.top + window.scrollY);
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      found.push({
        kind,
        text,
        top,
        x: Math.round(r.left + Math.min(r.width, vw - 40) / 2),
        y: Math.round(Math.max(60, Math.min(r.top, vh - 60))),
      });
    };
    add(document.querySelector("header"), "header");
    add(document.querySelector("h1"), "hero");
    const headings = document.querySelectorAll("h2,h3");
    for (const h of Array.from(headings).slice(0, 6)) add(h, "section");
    const cards = document.querySelectorAll("article, .card, [class*='card'], [class*='servico'], [class*='service']");
    for (const c of Array.from(cards).slice(0, 4)) add(c, "card");
    const imgs = document.querySelectorAll("img");
    for (const i of Array.from(imgs).slice(0, 3)) add(i, "image");
    const form = document.querySelector("form");
    add(form, "form");
    const cta = Array.from(document.querySelectorAll("a,button")).find((el) =>
      /(contato|whatsapp|or[çc]amento|fale|agende|saiba|compre|inscrev|pe[çc]a)/i.test(el.textContent ?? ""),
    );
    add(cta ?? null, "cta");
    add(document.querySelector("footer"), "footer");
    // remove duplicados por posição (top ±80px)
    const out: typeof found = [];
    for (const t of found) {
      if (out.some((o) => Math.abs(o.top - t.top) < 80)) continue;
      out.push(t);
    }
    return { docH, vw, vh, targets: out };
  });
}

export function pickPlan(docH: number, vh: number, targets: Target[]): Target[] {
  const top: Target = targets.find((t) => t.kind === "hero") ?? targets.find((t) => t.kind === "header") ?? { kind: "hero", text: "Topo", top: 0, x: 640, y: 360 };
  // O fim é SEMPRE o ponto mais baixo real (footer/CTA ou o fim do documento),
  // para o vídeo atravessar o site INTEIRO.
  const maxTop = Math.max(0, docH - vh);
  const cands = targets.filter((t) => t.kind === "footer" || t.kind === "cta");
  const bottomTop = Math.max(maxTop, ...cands.map((t) => t.top));
  const bottom: Target = cands.find((t) => t.top === bottomTop) ?? { kind: "cta", text: "Final", top: bottomTop, x: 640, y: 360 };
  // Cobre o site COMPLETO: percorre TODAS as seções reais entre o topo e o fim.
  const mids = targets
    .filter((t) => t.top > top.top + 80 && t.top < bottom.top - 80)
    .sort((a, b) => a.top - b.top)
    .slice(0, 12);
  const plan = [top, ...mids, bottom];
  return plan.filter((t, i, arr) => arr.findIndex((x) => Math.abs(x.top - t.top) < 80) === i);
}

async function navigateAndRecord(page: Page, plan: Target[], targetSeconds: number): Promise<void> {
  const n = Math.max(1, plan.length);
  const overheadPer = 1500; // cursor + scroll aproximados por cena
  const budget = Math.max(8000, targetSeconds * 1000 - 2500);
  const dwell = Math.max(900, Math.min(2600, Math.round((budget - n * overheadPer) / n)));
  for (let i = 0; i < plan.length; i++) {
    const t = plan[i];
    await smoothScroll(page, Math.max(0, t.top - 60), 1000);
    await moveCursor(page, t.x, t.y, 650);
    try { await page.mouse.move(t.x, t.y, { steps: 8 }); } catch { /* hover opcional */ }
    if (t.kind === "cta" || t.kind === "form") {
      try { await page.evaluate(({ x, y }) => (window as unknown as { __pc: { click: (x: number, y: number) => void } }).__pc.click(x, y), { x: t.x, y: t.y }); } catch { /* noop */ }
    }
    await page.waitForTimeout(dwell);
  }
  // Garante o site COMPLETO: encerra mostrando o fim da página (rodapé/CTA final).
  const endY = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - window.innerHeight));
  const curY = await page.evaluate(() => window.scrollY);
  if (Math.abs(curY - endY) > 40) {
    await smoothScroll(page, endY, 1200);
    await page.waitForTimeout(700);
  }
}

// ---- Encode MP4 (H.264) com cinematic OPCIONAL + fallback seguro ----
function encodeMp4(webmPath: string, mp4Path: string, w: number, h: number, cinematic: boolean): { ok: boolean; error?: string } {
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) return { ok: false, error: "MP4 encoding requires FFmpeg (ffmpeg-static ou ffmpeg no PATH) — nenhum encoder disponível." };
  const base = ["-y", "-i", webmPath];
  const enc = ["-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4Path];
  const attempts: string[][] = [];
  if (cinematic) {
    // zoom lento e sutil (1.0 → 1.06) sem perder legibilidade (Pagecast: cinematic)
    attempts.push([...base, "-vf", `zoompan=z='min(1+0.0007*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=30`, ...enc]);
  }
  attempts.push([...base, ...enc]);
  for (const args of attempts) {
    try {
      const r = spawnSync(ffmpeg, args, { stdio: "ignore", timeout: 300_000 });
      if (r.status === 0 && existsSync(mp4Path) && statSync(mp4Path).size > 2048) return { ok: true };
    } catch { /* tenta o próximo */ }
  }
  return { ok: false, error: "Falha ao converter WebM→MP4 (ffmpeg)." };
}

function validateMp4(mp4Path: string, w: number, h: number): { ok: boolean; checks: string[]; issues: string[]; duration?: number; codec?: string; fileSize: number } {
  const checks: string[] = [];
  const issues: string[] = [];
  if (!existsSync(mp4Path)) { issues.push("arquivo MP4 ausente"); return { ok: false, checks, issues, fileSize: 0 }; }
  const buf = readFileSync(mp4Path);
  checks.push(`existe: sim (${buf.length} bytes)`);
  if (buf.length < 2048) issues.push(`vídeo pequeno demais (${buf.length} bytes)`);
  const isMp4 = buf.subarray(4, 64).toString("latin1").includes("ftyp");
  checks.push(`container MP4 (ftyp): ${isMp4 ? "ok" : "não"}`);
  if (!isMp4) issues.push("não é MP4 (ftyp ausente)");
  const hasAvc1 = buf.includes(Buffer.from("avc1"));
  checks.push(`codec H.264 (avc1): ${hasAvc1 ? "ok" : "ausente"}`);
  if (!hasAvc1) issues.push("MP4 sem H.264 (avc1)");
  const hasMoov = buf.includes(Buffer.from("moov")) && buf.includes(Buffer.from("mvhd"));
  checks.push(`estrutura moov/mvhd: ${hasMoov ? "ok" : "ausente"}`);
  if (!hasMoov) issues.push("MP4 sem moov/mvhd (apresentação incompleta)");
  const probe = probeVideo(mp4Path);
  let duration: number | undefined;
  let codec: string | undefined;
  if (probe.ok) {
    duration = probe.duration;
    codec = probe.codec;
    checks.push(`probe: duração ${duration ?? "?"}s · ${probe.width}×${probe.height} · codec ${codec ?? "?"}`);
    if (probe.width && probe.width !== w) issues.push(`largura inesperada (${probe.width} ≠ ${w})`);
    if (probe.height && probe.height !== h) issues.push(`altura inesperada (${probe.height} ≠ ${h})`);
    if (duration !== undefined && (duration < 10 || duration > 90)) issues.push(`duração fora da faixa (${duration}s)`);
    if (codec && !/h264|avc/i.test(codec)) issues.push(`codec não é H.264 (${codec})`);
  } else {
    checks.push("probe FFmpeg: indisponível (validação apenas por boxes)");
  }
  return { ok: issues.length === 0, checks, issues, duration, codec, fileSize: buf.length };
}

export async function generateSitePromoVideo(opts: PromoVideoOptions): Promise<PromoVideoResult> {
  const w = opts.width ?? DEFAULT_W;
  const h = opts.height ?? DEFAULT_H;
  const targetSeconds = Math.max(20, Math.min(45, opts.target ?? 30));
  const cinematic = opts.cinematic !== false;
  const store = opts.store ?? createArtifactStore();

  if (!existsSync(join(opts.workspaceRoot, "index.html"))) {
    return { ok: false, reason: "projeto sem index.html — não há site para gravar." };
  }

  const outDir = join(process.cwd(), "data", "video-promo", opts.projectId, new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(outDir, { recursive: true });
  let server: { close: (cb: () => void) => void } | null = null;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  try {
    logPhase(opts, "preparing");
    const r = await serve(opts.workspaceRoot);
    server = r.server;
    const url = r.url;

    logPhase(opts, "opening");
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
    context = await browser.newContext({ viewport: { width: w, height: h }, recordVideo: { dir: outDir, size: { width: w, height: h } } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(1200); // fontes/animações iniciais

    await injectCursor(page);
    const discovery = await discoverTargets(page);
    const plan = pickPlan(discovery.docH, discovery.vh, discovery.targets);

    logPhase(opts, "recording");
    await navigateAndRecord(page, plan, targetSeconds);
    await page.waitForTimeout(1200);

    const video = page.video();
    if (!video) throw new Error("gravação não iniciou (Playwright recordVideo indisponível).");
    // poster = 1º frame (topo) antes de fechar
    try { await page.screenshot({ path: join(outDir, "poster.png") }); } catch { /* opcional */ }
    await context.close();
    context = null;
    const webmPath = await video.path();
    await browser.close();
    browser = null;
    await new Promise<void>((res) => server!.close(() => res()));
    server = null;

    if (!webmPath || !existsSync(webmPath) || statSync(webmPath).size < 2048) {
      throw new Error("gravação vazia/falhou (WebM ausente ou muito pequeno).");
    }

    logPhase(opts, "processing");
    const mp4Path = join(outDir, "video.mp4");
    const enc = encodeMp4(webmPath, mp4Path, w, h, cinematic);
    if (!enc.ok) throw new Error(enc.error ?? "falha ao gerar MP4.");

    logPhase(opts, "validating");
    const validation = validateMp4(mp4Path, w, h);

    // Persistência ISOLADA por projeto (Artifact Store) — servida pela rota /artifacts.
    const bytes = readFileSync(mp4Path);
    await store.putProjectFile(opts.projectId, "video/current.mp4", bytes);
    const posterPath = join(outDir, "poster.png");
    const hasPoster = existsSync(posterPath);
    if (hasPoster) {
      await store.putProjectFile(opts.projectId, "video/current-poster.png", readFileSync(posterPath));
    }
    const manifest = {
      projectId: opts.projectId,
      container: "mp4",
      duration: validation.duration ?? Math.round(targetSeconds),
      width: w, height: h,
      fileSize: validation.fileSize,
      codec: validation.codec ?? "h264",
      cinematic,
      validationOk: validation.ok,
      checks: validation.checks,
      issues: validation.issues,
      createdAt: new Date().toISOString(),
    };
    await store.putProjectFile(opts.projectId, "video/current.json", Buffer.from(JSON.stringify(manifest, null, 2)));

    // limpa temporários (não deixa lixo)
    rmSync(outDir, { recursive: true, force: true });

    if (!validation.ok) {
      return { ok: false, reason: `validação falhou: ${validation.issues.join("; ")}`, checks: validation.checks, issues: validation.issues };
    }
    logPhase(opts, "done");
    return {
      ok: true,
      duration: manifest.duration,
      width: w, height: h,
      fileSize: validation.fileSize,
      codec: manifest.codec,
      relPath: "video/current.mp4",
      posterRelPath: hasPoster ? "video/current-poster.png" : undefined,
      checks: validation.checks,
      issues: [],
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
    if (server) await new Promise<void>((res) => server!.close(() => res()));
  }
}

/** Nome de download sugerido (sanitizado) — o front usa isso. */
export function promoVideoFileName(clientName: string): string {
  const slug = String(clientName ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "cliente";
  return `${slug}-apresentacao-site.mp4`;
}
