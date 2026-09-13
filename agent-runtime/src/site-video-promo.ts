// ============================================================================
// VÍDEO PROMOCIONAL DO SITE (apresentação para o cliente) — MP4 H.264.
//
// CORREÇÃO CRÍTICA: TODO código enviado ao Chromium via `page.evaluate` é uma
// STRING autocontida (IIFE) — NUNCA um callback/closure. Motivo: o runtime roda
// via `tsx/esm` (esbuild `keepNames`), que injeta o helper `__name` nos callbacks
// transpilados; esse helper não existe no browser e causava
// "ReferenceError: __name is not defined". Strings não passam por transpilação.
//
// PERSONALIZAÇÃO POR PROJETO: cada execução usa exclusivamente o workspace do
// `projectId`, ANALISA o DOM REAL daquele site e monta um roteiro específico
// (seções/cards/galeria/portfólio/depoimentos/faq/form/WhatsApp/CTA/footer).
// Nada de roteiro universal nem seletores fixos.
//
// SOMENTE LEITURA: nunca envia formulário, nunca clica de verdade (só ripple).
// ============================================================================
import { mkdirSync, existsSync, readFileSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createArtifactStore, type ArtifactStore } from "./artifact-store.js";
import { resolveFfmpeg, probeVideo, serve } from "./site-video.js";

const DEFAULT_W = 1280;
const DEFAULT_H = 720;

export type PromoPhase = "preparing" | "opening" | "analyzing" | "recording" | "processing" | "validating" | "done";

export interface PromoVideoOptions {
  workspaceRoot: string;
  projectId: string;
  store?: ArtifactStore;
  width?: number;
  height?: number;
  /** alvo de duração em segundos (default 30; faixa 20–45). */
  target?: number;
  cinematic?: boolean;
  onPhase?: (phase: PromoPhase, detail?: string) => void;
}

export interface PromoPlanItem { kind: string; text: string; top: number; x?: number; y?: number; }

export interface PromoVideoResult {
  ok: boolean;
  reason?: string;
  duration?: number;
  width?: number;
  height?: number;
  fileSize?: number;
  codec?: string;
  relPath?: string;
  posterRelPath?: string;
  checks?: string[];
  issues?: string[];
  /** Roteiro REAL descoberto no DOM deste site (prova de personalização). */
  plan?: PromoPlanItem[];
}

function logPhase(opts: PromoVideoOptions, phase: PromoPhase, detail?: string): void {
  try { opts.onPhase?.(phase, detail); } catch { /* noop */ }
}

// ── Cursor sintético (Pagecast-like) — STRING autocontida ───────────────────
async function injectCursor(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    if (document.getElementById('__pc_cursor')) return;
    var style = document.createElement('style');
    style.textContent = '#__pc_cursor{position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;pointer-events:none;transform:translate(40px,40px);filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}#__pc_cursor svg{display:block}.__pc_ripple{position:fixed;z-index:2147483646;pointer-events:none;border:3px solid rgba(37,99,235,.9);border-radius:50%;width:12px;height:12px;transform:translate(-50%,-50%);animation:__pc_ripple .6s ease-out forwards}@keyframes __pc_ripple{0%{opacity:.95;width:12px;height:12px}100%{opacity:0;width:74px;height:74px}}';
    document.documentElement.appendChild(style);
    var cur = document.createElement('div');
    cur.id = '__pc_cursor';
    cur.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 2 L20 12 L12 13.2 L8.8 21 Z" fill="#111827" stroke="#ffffff" stroke-width="1.5"/></svg>';
    document.documentElement.appendChild(cur);
    window.__pc = {
      click: function (x, y) {
        var r = document.createElement('div');
        r.className = '__pc_ripple';
        r.style.left = x + 'px'; r.style.top = y + 'px';
        document.documentElement.appendChild(r);
        setTimeout(function () { r.remove(); }, 700);
      }
    };
  })()`);
}

async function moveCursor(page: Page, x: number, y: number, ms: number): Promise<void> {
  await page.evaluate(`(() => new Promise(function (resolve) {
    var cur = document.getElementById('__pc_cursor');
    if (!cur) return resolve(true);
    var nums = (cur.style.transform || '').match(/-?[0-9.]+/g) || ['40', '40'];
    var sx = parseFloat(nums[0] || '40'), sy = parseFloat(nums[1] || '40');
    var tx = ${Math.round(x)}, ty = ${Math.round(y)}, dur = ${Math.max(1, Math.round(ms))};
    var t0 = performance.now();
    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function step() {
      var p = Math.min(1, (performance.now() - t0) / dur);
      var e = ease(p);
      cur.style.transform = 'translate(' + (sx + (tx - sx) * e) + 'px, ' + (sy + (ty - sy) * e) + 'px)';
      if (p < 1) requestAnimationFrame(step); else resolve(true);
    }
    requestAnimationFrame(step);
  }))()`);
}

async function smoothScroll(page: Page, toY: number, ms: number): Promise<void> {
  await page.evaluate(`(() => new Promise(function (resolve) {
    var startY = window.scrollY;
    var endY = ${Math.max(0, Math.round(toY))}, dur = ${Math.max(1, Math.round(ms))};
    var t0 = performance.now();
    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function step() {
      var p = Math.min(1, (performance.now() - t0) / dur);
      window.scrollTo(0, startY + (endY - startY) * ease(p));
      if (p < 1) requestAnimationFrame(step); else resolve(true);
    }
    requestAnimationFrame(step);
  }))()`);
}

async function ripple(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(`(() => { if (window.__pc && window.__pc.click) window.__pc.click(${Math.round(x)}, ${Math.round(y)}); })()`);
}

// ── ANÁLISE REAL DO DOM (STRING autocontida, adaptativa) ────────────────────
async function discoverTargets(page: Page): Promise<{ docH: number; vw: number; vh: number; targets: PromoPlanItem[] }> {
  const raw = await page.evaluate(`(() => {
    var vw = window.innerWidth, vh = window.innerHeight;
    var docH = document.documentElement.scrollHeight;
    var out = [];
    var rank = { gallery: 9, portfolio: 9, testimonials: 9, faq: 9, stats: 8, form: 10, whatsapp: 9, cta: 9, card: 7, image: 6, hero: 5, section: 3, header: 2, footer: 4 };
    function text(el) { return (el.textContent || '').replace(/[ \\t\\n\\r]+/g, ' ').trim().slice(0, 90); }
    function vis(el) { if (!el) return false; var r = el.getBoundingClientRect(); var cs = getComputedStyle(el); return r.width > 8 && r.height > 8 && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05; }
    function add(el, kind) { if (!el || !vis(el)) return; var r = el.getBoundingClientRect(); out.push({ kind: kind, text: text(el), top: Math.round(r.top + window.scrollY), x: Math.round(r.left + Math.min(r.width, vw - 40) / 2), y: Math.round(Math.max(70, Math.min(r.top, vh - 70))) }); }
    function hasForm(el) { try { var s = el.closest ? el.closest('section') : null; return !!(s && s.querySelector('form')); } catch (e) { return false; } }
    function kindOf(el) {
      var t = (el.textContent || '').toLowerCase();
      if (/whatsapp|zap/.test(t)) return 'whatsapp';
      if (/depoiment|testimonial|avalia/.test(t)) return 'testimonials';
      if (/galeria|gallery/.test(t)) return 'gallery';
      if (/portf[oó]lio|projetos|trabalhos/.test(t)) return 'portfolio';
      if (/faq|d[uú]vidas|perguntas/.test(t)) return 'faq';
      if (/n[uú]meros|estat|resultados/.test(t)) return 'stats';
      if (/contato|or[çc]amento|agende|fale/.test(t)) return hasForm(el) ? 'form' : 'cta';
      return 'section';
    }
    function firstByText(sel, re) { var els = document.querySelectorAll(sel); for (var i = 0; i < els.length; i++) { if (re.test((els[i].textContent || '').toLowerCase())) return els[i]; } return null; }
    add(document.querySelector('header'), 'header');
    add(document.querySelector('h1'), 'hero');
    var h2s = document.querySelectorAll('h2,h3');
    for (var i = 0; i < h2s.length && i < 10; i++) add(h2s[i], kindOf(h2s[i]));
    add(firstByText('section,div', /galeria|gallery/i), 'gallery');
    add(firstByText('section,div', /portf[oó]lio|portfolio|projetos|trabalhos/i), 'portfolio');
    add(firstByText('section,div', /depoiment|testimonial|avalia/i), 'testimonials');
    add(firstByText('section,div', /faq|d[uú]vidas|perguntas/i), 'faq');
    add(firstByText('section,div', /n[uú]meros|estat|resultados/i), 'stats');
    add(document.querySelector('form'), 'form');
    add(firstByText('main a, main button', /whatsapp|zap/i), 'whatsapp');
    var cards = document.querySelectorAll('article,.card,[class*="card"]');
    for (var c = 0; c < cards.length && c < 3; c++) add(cards[c], 'card');
    var imgs = document.querySelectorAll('main img');
    for (var g = 0; g < imgs.length && g < 2; g++) add(imgs[g], 'image');
    add(firstByText('main a, main button', /contato|or[çc]amento|agende|fale|saiba|compre|pedir|reserv/i), 'cta');
    add(document.querySelector('footer'), 'footer');
    var plan = [];
    for (var k = 0; k < out.length; k++) {
      var t = out[k]; var j = -1;
      for (var m = 0; m < plan.length; m++) { if (Math.abs(plan[m].top - t.top) < 80) { j = m; break; } }
      if (j === -1) plan.push(t);
      else if (plan[j].kind !== 'hero' && plan[j].kind !== 'header' && (rank[t.kind] || 0) > (rank[plan[j].kind] || 0)) plan[j] = t;
    }
    return { docH: docH, vw: vw, vh: vh, targets: plan };
  })()`);
  return raw as { docH: number; vw: number; vh: number; targets: PromoPlanItem[] };
}

/** Ritmo da apresentação: rolagem LENTA e proporcional à distância + pausas
 *  maiores nas seções importantes, ajustado para caber em ~totalMs. Puro/testável. */
export function computePacing(plan: PromoPlanItem[], startY: number, totalMs: number): { scrolls: number[]; dwells: number[]; pauseBefore: number } {
  const important = new Set(["hero", "cta", "whatsapp", "form", "gallery", "portfolio", "testimonials", "card", "faq", "stats"]);
  const pauseBefore = 350;
  const positions = plan.map((t) => Math.max(0, t.top - 60));
  // Rolagem lenta (~650px/s): duração proporcional à distância, com limites.
  const scrolls: number[] = [];
  let prev = Math.max(0, startY);
  for (const y of positions) {
    const dist = Math.abs(y - prev);
    scrolls.push(Math.max(900, Math.min(3400, Math.round(dist * 1.5))));
    prev = y;
  }
  const scrollTotal = scrolls.reduce((a, b) => a + b, 0);
  const baseDwell = plan.map((t) => (important.has(t.kind) ? 2400 : 1600));
  // tempo real por cena: pausa antes + movimento do cursor (~900ms) + descida final
  const fixed = scrollTotal + plan.length * (pauseBefore + 900) + 1500;
  const nominal = baseDwell.reduce((a, b) => a + b, 0) || 1;
  const scale = Math.max(0, totalMs - fixed) / nominal;
  const dwells = baseDwell.map((d) => Math.max(1200, Math.min(3600, Math.round(d * scale))));
  return { scrolls, dwells, pauseBefore };
}

/** Roteiro ADAPTATIVO: topo → conteúdo real do site (priorizando o que existe) → fim. */
export function pickPlan(docH: number, vh: number, targets: PromoPlanItem[]): PromoPlanItem[] {
  const top: PromoPlanItem = targets.find((t) => t.kind === "hero") ?? targets.find((t) => t.kind === "header") ?? { kind: "hero", text: "Topo", top: 0 };
  const maxTop = Math.max(0, docH - vh);
  const ends = targets.filter((t) => t.kind === "footer" || t.kind === "cta" || t.kind === "whatsapp");
  const bottomTop = Math.max(maxTop, ...ends.map((t) => t.top));
  const bottom: PromoPlanItem = ends.find((t) => t.top === bottomTop) ?? { kind: "cta", text: "Final", top: bottomTop };

  // Conteúdo do meio: prioriza regiões ricas (galeria/portfólio/depoimentos/faq/form/cards/imagens).
  const priority = ["gallery", "portfolio", "testimonials", "faq", "stats", "form", "whatsapp", "card", "image", "section"];
  const mids = targets
    .filter((t) => t.top > top.top + 80 && t.top < bottom.top - 80)
    .sort((a, b) => (priority.indexOf(a.kind) - priority.indexOf(b.kind)) || (a.top - b.top))
    .slice(0, 12)
    .sort((a, b) => a.top - b.top);

  const plan = [top, ...mids, bottom];
  // Dedupe por proximidade, PREFERINDO o elemento mais específico (nunca derruba hero/header).
  const rank: Record<string, number> = { gallery: 9, portfolio: 9, testimonials: 9, faq: 9, stats: 8, form: 9, whatsapp: 9, cta: 9, card: 7, image: 6, section: 3, header: 2, footer: 4 };
  const deduped: PromoPlanItem[] = [];
  for (const t of plan) {
    const j = deduped.findIndex((x) => Math.abs(x.top - t.top) < 80);
    if (j === -1) { deduped.push(t); continue; }
    const cur = deduped[j];
    if (cur.kind !== "hero" && cur.kind !== "header" && (rank[t.kind] ?? 0) > (rank[cur.kind] ?? 0)) deduped[j] = t;
  }
  // GARANTE destaque de conversão quando o site tem CTA/WhatsApp/formulário.
  if (!deduped.some((t) => t.kind === "whatsapp" || t.kind === "cta" || t.kind === "form")) {
    const conv = targets.filter((t) => t.kind === "whatsapp" || t.kind === "cta" || t.kind === "form").sort((a, b) => b.top - a.top)[0];
    if (conv) {
      const idx = deduped.findIndex((t) => t.top >= conv.top);
      deduped.splice(idx === -1 ? Math.max(0, deduped.length - 1) : idx, 0, conv);
    }
  }
  return deduped;
}

async function navigateAndRecord(page: Page, plan: PromoPlanItem[], targetSeconds: number): Promise<void> {
  const startY = (await page.evaluate(`(() => window.scrollY)()`)) as number;
  const totalMs = Math.max(28000, Math.min(42000, Math.round(targetSeconds * 1000)));
  const pacing = computePacing(plan, typeof startY === "number" ? startY : 0, totalMs);
  for (let i = 0; i < plan.length; i++) {
    const t = plan[i];
    const cx = t.x ?? 640;
    const cy = t.y ?? 360;
    // pequena pausa ANTES de ir para a próxima seção (naturalidade)
    await page.waitForTimeout(pacing.pauseBefore);
    await smoothScroll(page, Math.max(0, t.top - 60), pacing.scrolls[i]);
    // cursor se move devagar e o mouse real passa por cima (hover REAL)
    await moveCursor(page, cx, cy, 900);
    try { await page.mouse.move(cx, cy, { steps: 15 }); } catch { /* hover opcional */ }
    if (t.kind === "cta" || t.kind === "form" || t.kind === "whatsapp") {
      try { await ripple(page, cx, cy); } catch { /* noop */ }
    }
    // permanece na seção (mais tempo nas importantes)
    await page.waitForTimeout(pacing.dwells[i]);
  }
  // Encerra descendo SUAVEMENTE até o fim real da página (footer).
  const endRaw = await page.evaluate(`(() => ({ endY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight), curY: window.scrollY }))()`);
  const end = endRaw as { endY: number; curY: number };
  if (Math.abs(end.curY - end.endY) > 40) {
    await smoothScroll(page, end.endY, 1800);
    await page.waitForTimeout(1500);
  }
}

// ── Encode MP4 (H.264) com cinematic opcional + fallback seguro ─────────────
function encodeMp4(webmPath: string, mp4Path: string, w: number, h: number, cinematic: boolean): { ok: boolean; error?: string } {
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) return { ok: false, error: "MP4 encoding requires FFmpeg (ffmpeg-static ou ffmpeg no PATH) — nenhum encoder disponível." };
  const base = ["-y", "-i", webmPath];
  const enc = ["-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4Path];
  const attempts: string[][] = [];
  if (cinematic) {
    attempts.push([...base, "-vf", `zoompan=z='min(1+0.0002*on,1.02)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=30`, ...enc]);
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
    if (duration !== undefined && (duration < 8 || duration > 95)) issues.push(`duração fora da faixa (${duration}s)`);
    if (codec && !/h264|avc/i.test(codec)) issues.push(`codec não é H.264 (${codec})`);
  } else {
    checks.push("probe FFmpeg: indisponível (validação apenas por boxes)");
  }
  return { ok: issues.length === 0, checks, issues, duration, codec, fileSize: buf.length };
}

export async function generateSitePromoVideo(opts: PromoVideoOptions): Promise<PromoVideoResult> {
  const w = opts.width ?? DEFAULT_W;
  const h = opts.height ?? DEFAULT_H;
  const targetSeconds = Math.max(30, Math.min(45, opts.target ?? 35));
  const cinematic = opts.cinematic === true; // natural por padrão (sem zoom exagerado)
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
    await page.waitForTimeout(1200);

    await injectCursor(page);

    logPhase(opts, "analyzing");
    const discovery = await discoverTargets(page);
    const plan = pickPlan(discovery.docH, discovery.vh, discovery.targets);
    if (!plan.length) throw new Error("não foi possível analisar o site (nenhum elemento visível).");

    logPhase(opts, "recording");
    await navigateAndRecord(page, plan, targetSeconds);
    await page.waitForTimeout(1200);

    const video = page.video();
    if (!video) throw new Error("gravação não iniciou (Playwright recordVideo indisponível).");
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

    const bytes = readFileSync(mp4Path);
    await store.putProjectFile(opts.projectId, "video/current.mp4", bytes);
    const posterPath = join(outDir, "poster.png");
    const hasPoster = existsSync(posterPath);
    if (hasPoster) await store.putProjectFile(opts.projectId, "video/current-poster.png", readFileSync(posterPath));
    const manifest = {
      projectId: opts.projectId, container: "mp4",
      duration: validation.duration ?? Math.round(targetSeconds), width: w, height: h,
      fileSize: validation.fileSize, codec: validation.codec ?? "h264", cinematic,
      plan: plan.map((t) => ({ kind: t.kind, text: t.text, top: t.top })),
      validationOk: validation.ok, checks: validation.checks, issues: validation.issues,
      createdAt: new Date().toISOString(),
    };
    await store.putProjectFile(opts.projectId, "video/current.json", Buffer.from(JSON.stringify(manifest, null, 2)));

    rmSync(outDir, { recursive: true, force: true });

    if (!validation.ok) {
      return { ok: false, reason: `validação falhou: ${validation.issues.join("; ")}`, checks: validation.checks, issues: validation.issues, plan: manifest.plan };
    }
    logPhase(opts, "done");
    return {
      ok: true, duration: manifest.duration, width: w, height: h,
      fileSize: validation.fileSize, codec: manifest.codec,
      relPath: "video/current.mp4", posterRelPath: hasPoster ? "video/current-poster.png" : undefined,
      checks: validation.checks, issues: [], plan: manifest.plan,
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
