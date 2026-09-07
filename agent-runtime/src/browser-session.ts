// Browser session (5.20) — servidor estático local seguro por workspace +
// Playwright. Serve APENAS o root do workspace autorizado (sem traversal).
// (5.28) Arquivos de imagem cujo conteúdo é um DATA URL (anexos do usuário em
// assets/) são servidos como bytes decodificados — permite o Cline referenciar
// <img src="assets/foto.png"> no browser QA de verdade.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { chromium, type Browser, type Page } from "playwright";

export interface BrowserInspection {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  documentWidth: number;
  horizontalOverflow: boolean;
  overflowPixels: number;
  consoleErrors: string[];
  consoleWarnings: string[];
  failedRequests: string[];
  headings: string[];
  links: number;
  brokenAnchors: string[];
  images: Array<{ src: string; alt: string; failed: boolean }>;
  screenshotPath?: string;
  raw?: Record<string, unknown>;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export class BrowserSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private server: ReturnType<typeof createServer> | null = null;
  private root: string;
  private currentPort = 0;
  private consoleLogs: string[] = [];
  private requestErrors: string[] = [];
  private screenshotDir: string;

  constructor(workspaceRoot: string) {
    this.root = resolve(workspaceRoot);
    // Screenshots sempre em diretório temporário (nunca no workspace do projeto).
    this.screenshotDir = process.env.PROSPECTOR_SHOTS && process.env.PROSPECTOR_SHOTS.trim()
      ? resolve(process.env.PROSPECTOR_SHOTS)
      : join(tmpdir(), "prospector-shots");
  }

  private mimeOf(path: string): string {
    const idx = path.lastIndexOf(".");
    return idx >= 0 ? MIME[path.slice(idx).toLowerCase()] ?? "application/octet-stream" : "application/octet-stream";
  }

  // Anexos de imagem do usuário são gravados no workspace como DATA URL (texto).
  // Ao servir assets/*.png|jpg|webp|gif com conteúdo "data:image/...;base64,...",
  // decodifica para bytes reais para o navegador renderizar (browser QA do Cline).
  private decodeDataUrlAsset(content: Buffer, path: string): Buffer | null {
    const mime = this.mimeOf(path);
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(mime)) return null;
    const text = content.toString("utf8");
    const m = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/s.exec(text.trim());
    if (!m) return null;
    const bytes = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
    if (bytes.length === 0 || bytes.length > 4_000_000) return null;
    return bytes;
  }

  // Inicia servidor estático servindo apenas o workspace root.
  async startServer(): Promise<string> {
    if (this.server && this.currentPort) return `http://127.0.0.1:${this.currentPort}/`;
    const server = createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
        let rel = urlPath.replace(/^\/+/, "");
        if (!rel) rel = "index.html";
        // Previna path traversal e acesso fora do root.
        const target = resolve(this.root, rel);
        if (target !== this.root && !target.startsWith(this.root + sep)) {
          res.writeHead(403); res.end("forbidden"); return;
        }
        if (/\.env($|\.)/.test(target)) { res.writeHead(403); res.end("forbidden"); return; }
        const file = existsSync(target) && statSync(target).isFile() ? target : join(target, "index.html");
        if (!existsSync(file)) { res.writeHead(404); res.end("not found"); return; }
        const content = readFileSync(file);
        const decoded = this.decodeDataUrlAsset(content, file);
        if (decoded) {
          const imgMime = this.mimeOf(file);
          res.writeHead(200, { "Content-Type": imgMime, "Cache-Control": "no-store" });
          res.end(decoded);
          return;
        }
        res.writeHead(200, { "Content-Type": this.mimeOf(file), "Cache-Control": "no-store" });
        res.end(content);
      } catch {
        res.writeHead(500); res.end("error");
      }
    });
    await new Promise<void>((resolveListen) => {
      server.listen(0, "127.0.0.1", () => resolveListen());
    });
    const addr = server.address();
    this.currentPort = typeof addr === "object" && addr ? addr.port : 8788;
    this.server = server;
    return `http://127.0.0.1:${this.currentPort}/`;
  }

  async open(url: string, viewport?: { width: number; height: number }): Promise<BrowserInspection> {
    const base = this.server ? `http://127.0.0.1:${this.currentPort}/` : await this.startServer();
    const fullUrl = url.startsWith("http") ? url : new URL(url || "/", base).href;
    if (!fullUrl.startsWith(base)) {
      // perigo: só permitimos a própria origem (bloqueia acesso externo do agente)
      throw new Error("URL fora do workspace bloqueada (segurança).");
    }
    if (!this.browser) this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage({ viewport: viewport ?? { width: 1366, height: 768 } });
    this.consoleLogs = [];
    this.requestErrors = [];
    this.page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") this.consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });
    this.page.on("requestfailed", (req) => {
      this.requestErrors.push(`${req.method()} ${req.url()} (${req.failure()?.errorText ?? "failed"})`);
    });
    await this.page.goto(fullUrl, { waitUntil: "networkidle", timeout: 20_000 }).catch(() => {});
    return this.inspectCurrent();
  }

  async inspectCurrent(): Promise<BrowserInspection> {
    if (!this.page) throw new Error("Página não aberta. Use browser_open primeiro.");
    const data = await this.page.evaluate(() => {
      const docW = document.documentElement.scrollWidth;
      const viewW = window.innerWidth || document.documentElement.clientWidth;
      const overflow = docW - viewW;
      const anchors = [...document.querySelectorAll<HTMLAnchorElement>("a[href^='#']")].map((a) => a.getAttribute("href") ?? "");
      const brokenAnchors = anchors.filter((h) => h.length > 1 && !document.querySelector(h));
      const images = [...document.images].map((img) => ({
        src: img.currentSrc || img.src || "",
        alt: img.alt ?? "",
        failed: img.complete && img.naturalWidth === 0,
      }));
      return {
        documentWidth: docW,
        viewportWidth: viewW,
        horizontalOverflow: overflow > 1,
        overflowPixels: Math.max(0, overflow),
        brokenAnchors,
        images,
        headings: [...document.querySelectorAll("h1,h2,h3")].map((h) => `${h.tagName}: ${(h.textContent ?? "").trim().slice(0, 80)}`).slice(0, 20),
        links: document.querySelectorAll("a[href]").length,
        title: document.title,
      };
    });
    const viewport = this.page.viewportSize() ?? { width: 0, height: 0 };
    return {
      url: this.page.url(),
      title: data.title,
      viewport,
      documentWidth: data.documentWidth,
      horizontalOverflow: data.horizontalOverflow,
      overflowPixels: data.overflowPixels,
      consoleErrors: this.consoleLogs.filter((l) => l.startsWith("[error]")),
      consoleWarnings: this.consoleLogs.filter((l) => l.startsWith("[warning]")),
      failedRequests: this.requestErrors,
      headings: data.headings,
      links: data.links,
      brokenAnchors: data.brokenAnchors,
      images: data.images.filter((i) => i.failed),
    };
  }

  async setViewport(width: number, height: number): Promise<void> {
    if (!this.page) throw new Error("Página não aberta.");
    await this.page.setViewportSize({ width, height });
    await this.page.waitForTimeout(120);
  }

  // Executa JavaScript no contexto da página (mesma origem do workspace).
  // Permite reproduzir cliques/interações e inspecionar o estado ANTES/DEPOIS.
  async evaluate(expression: string): Promise<{ ok: boolean; value?: unknown; error?: string }> {
    if (!this.page) return { ok: false, error: "Página não aberta. Use browser_open primeiro." };
    if (typeof expression !== "string" || !expression.trim()) return { ok: false, error: "Expressão vazia." };
    try {
      const value = await this.page.evaluate((expr) => {
        // eslint-disable-next-line no-new-func
        const fn = new Function(`"use strict"; return (${expr});`);
        return fn();
      }, expression);
      return { ok: true, value };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async pressKey(key: "Escape" | "Enter" | "Tab"): Promise<void> {
    if (!this.page) throw new Error("Página não aberta.");
    await this.page.keyboard.press(key);
  }

  // Mede se a página está "preta": amostra 25 pontos e verifica a cor final
  // (subindo a cadeia de backgrounds opacos). Tela preta real = >=70% dos
  // pontos resolvem para preto opaco.
  async measureBlackScreen(): Promise<{ black: boolean; ratio: number }> {
    if (!this.page) return { black: false, ratio: 0 };
    const code = `(() => {
      const resolveColor = (el) => {
        let e = el;
        while (e && e !== document.documentElement) {
          const cs = window.getComputedStyle(e);
          const bg = cs.backgroundColor;
          const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/.exec(bg);
          if (m) {
            const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
            if (a > 0.02) return { r: +m[1], g: +m[2], b: +m[3], a };
          }
          e = e.parentElement;
        }
        return null;
      };
      const points = [];
      for (let gx = 1; gx <= 5; gx++) for (let gy = 1; gy <= 5; gy++) points.push([gx / 6, gy / 6]);
      let dark = 0;
      for (const p of points) {
        const el = document.elementFromPoint(Math.floor(window.innerWidth * p[0]), Math.floor(window.innerHeight * p[1]));
        const c = resolveColor(el);
        if (c) {
          const opaque = Math.min(1, c.a);
          const lum = (c.r + c.g + c.b) / 3;
          if (opaque >= 0.6 && lum <= 30) dark += 1;
        }
      }
      const center = resolveColor(document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2));
      return { dark, total: points.length, center, bodyBg: window.getComputedStyle(document.body).backgroundColor, text: (document.body.textContent || '').length };
    })()`;
    try {
      const value = await this.page.evaluate((c) => {
        // eslint-disable-next-line no-new-func
        const fn = new Function(`return (${c});`);
        return fn();
      }, code);
      const res = value as { dark: number; total: number };
      const ratio = res.total ? res.dark / res.total : 0;
      return { black: ratio >= 0.7, ratio: Number(ratio.toFixed(2)) };
    } catch {
      return { black: false, ratio: 0 };
    }
  }

  // Lista elementos clicáveis (para auditoria de interação).
  async clickableElements(): Promise<Array<{ sel: string; text: string; tag: string; visible: boolean }>> {
    if (!this.page) return [];
    const code = `(() => {
      const selFor = (el) => {
        if (el.id) return '#' + CSS.escape(el.id);
        if (el.getAttribute('data-testid')) return '[data-testid="' + CSS.escape(el.getAttribute('data-testid')) + '"]';
        const cls = Array.prototype.slice.call(el.classList, 0, 3).map(function (c) { return '.' + CSS.escape(c); }).join('');
        return cls ? el.tagName.toLowerCase() + cls : el.tagName.toLowerCase();
      };
      const els = Array.prototype.slice.call(document.querySelectorAll('a[href], button, [role="button"], input[type="submit"], input[type="button"], [onclick], summary'));
      return els.slice(0, 16).map(function (el) {
        return { sel: selFor(el), text: (el.textContent || '').trim().slice(0, 40), tag: el.tagName.toLowerCase(), visible: !!(el.offsetWidth || el.offsetHeight) };
      });
    })()`;
    const value = await this.page.evaluate((c) => {
      // eslint-disable-next-line no-new-func
      const fn = new Function(`return (${c});`);
      return fn();
    }, code);
    return Array.isArray(value) ? (value as Array<{ sel: string; text: string; tag: string; visible: boolean }>) : [];
  }

  // Clica num elemento pelo seletor (dispatch click via JS — força interação
  // mesmo sob overlay, igual ao handler real de clique).
  async clickSelector(sel: string): Promise<void> {
    if (!this.page) throw new Error("Página não aberta.");
    await this.page.evaluate((s) => {
      const el = document.querySelector(s);
      if (el instanceof HTMLElement) {
        el.click();
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      } else {
        throw new Error(`elemento não encontrado: ${s}`);
      }
    }, sel);
  }

  // Seletor do elemento no centro da tela (backdrop/overlay) ou ancestral clicável.
  async topCenterSelector(): Promise<string | null> {
    if (!this.page) return null;
    const code = `(() => {
      let el = document.elementFromPoint(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2));
      let e = el;
      for (let i = 0; i < 7 && e; i++) {
        if (e.id) return '#' + CSS.escape(e.id);
        if (e.hasAttribute && (e.hasAttribute('onclick') || e.getAttribute('role') === 'button') && e.classList && e.classList.length) {
          return e.tagName.toLowerCase() + '.' + CSS.escape(e.classList[0]);
        }
        e = e.parentElement;
      }
      return null;
    })()`;
    try {
      const value = await this.page.evaluate((c) => {
        // eslint-disable-next-line no-new-func
        const fn = new Function(`return (${c});`);
        return fn();
      }, code);
      return typeof value === "string" && value ? value : null;
    } catch {
      return null;
    }
  }

  async reload(): Promise<BrowserInspection> {
    if (!this.page) throw new Error("Página não aberta.");
    this.consoleLogs = [];
    this.requestErrors = [];
    await this.page.reload({ waitUntil: "networkidle", timeout: 20_000 }).catch(() => {});
    return this.inspectCurrent();
  }

  async screenshot(name = "site", opts?: { fullPage?: boolean }): Promise<string> {
    if (!this.page) throw new Error("Página não aberta.");
    const fs = await import("node:fs");
    fs.mkdirSync(this.screenshotDir, { recursive: true });
    const file = join(this.screenshotDir, `${name}-${Date.now()}.png`);
    await this.page.screenshot({ path: file, fullPage: opts?.fullPage ?? true });
    return file;
  }

  formatInspection(i: BrowserInspection, includeScreenshot = false): string {
    const issues: string[] = [];
    if (i.horizontalOverflow) issues.push(`Overflow horizontal: ${i.overflowPixels}px (viewport ${i.viewport.width}px, documento ${i.documentWidth}px).`);
    for (const e of i.consoleErrors) issues.push(`Console error: ${e}`);
    for (const b of i.brokenAnchors) issues.push(`Anchor quebrado: ${b} não existe no DOM.`);
    for (const img of i.images) issues.push(`Imagem falhou ao carregar: ${img.src.slice(0, 120)}.`);
    for (const f of i.failedRequests) issues.push(`Request falhou: ${f.slice(0, 140)}`);
    const lines = [
      "BROWSER INSPECTION",
      `url: ${i.url}`,
      `title: ${i.title}`,
      `viewport: ${i.viewport.width}x${i.viewport.height}`,
      `documentWidth: ${i.documentWidth}`,
      `horizontalOverflow: ${i.horizontalOverflow}`,
      `consoleErrors: ${i.consoleErrors.length}`,
      `consoleWarnings: ${i.consoleWarnings.length}`,
      `failedRequests: ${i.failedRequests.length}`,
      `brokenAnchors: ${i.brokenAnchors.length}`,
      `failedImages: ${i.images.length}`,
      `headings: ${i.headings.length}`,
      `links: ${i.links}`,
    ];
    if (issues.length) lines.push("", "issues:", ...issues.map((s) => `- ${s}`));
    if (includeScreenshot && i.screenshotPath) lines.push("", `screenshot: ${i.screenshotPath}`);
    return lines.join("\n");
  }

  async close(): Promise<void> {
    try { await this.page?.close(); } catch { /* noop */ }
    try { await this.browser?.close(); } catch { /* noop */ }
    this.page = null;
    this.browser = null;
    if (this.server) {
      await new Promise<void>((r) => this.server?.close(() => r()));
      this.server = null;
      this.currentPort = 0;
    }
  }
}
