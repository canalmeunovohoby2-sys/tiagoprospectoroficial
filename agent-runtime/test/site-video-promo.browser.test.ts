import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { generateSitePromoVideo, promoVideoFileName } from "../src/site-video-promo";
import { createArtifactStore } from "../src/artifact-store";

const SITE: Record<string, string> = {
  "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Studio Aurora</title>
<link rel="stylesheet" href="./src/site.css"><link rel="icon" href="./assets/favicon.svg"></head>
<body>
<header class="top"><strong>Studio Aurora</strong><nav><a href="#serv">Serviços</a><a href="#dep">Depoimentos</a><a href="#contato">Contato</a></nav></header>
<main>
<section class="hero"><h1>Studio Aurora</h1><p>Design de interiores sob medida.</p><a class="cta" href="#contato">Fale conosco</a></section>
<section id="serv"><h2>Serviços</h2><div class="cards"><article class="card"><img src="./assets/pic.svg" alt=""><h3>Residencial</h3><p>Projeto completo.</p></article><article class="card"><h3>Comercial</h3><p>Ambientes de marca.</p></article><article class="card"><h3>Consultoria</h3><p>Direção de arte.</p></article></div></section>
<section id="dep"><h2>Depoimentos</h2><blockquote>“Trabalho impecável.” — Maria</blockquote></section>
<section id="contato"><h2>Vamos começar?</h2><a class="cta" href="https://wa.me/5511">Chamar no WhatsApp</a></section>
</main>
<footer class="rodape">© Studio Aurora</footer>
</body></html>`,
  "src/site.css": `*{box-sizing:border-box}body{margin:0;font-family:system-ui;color:#0f172a}
.top{display:flex;gap:24px;padding:18px 24px;border-bottom:1px solid #e2e8f0}
.hero{padding:96px 24px;background:#f1f5f9}.hero h1{font-size:48px;margin:0 0 12px}
section{padding:72px 24px}.cards{display:flex;gap:16px;flex-wrap:wrap}
.card{flex:1;min-width:200px;padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:12px}
.cta{display:inline-block;background:#0f766e;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none}
.rodape{padding:24px;background:#0f172a;color:#cbd5e1}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.card{animation:fadeUp .6s ease both}`,
  "assets/pic.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80" fill="#0f766e"/></svg>`,
  "assets/favicon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0f766e"/><text x="32" y="42" text-anchor="middle" font-size="30" fill="#fff">SA</text></svg>`,
  "src/site.json": JSON.stringify({ business: { name: "Studio Aurora", segment: "Design de interiores" } }),
};

let root = "";
let artifacts = "";
let projectId = "";

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "promo-site-"));
  artifacts = mkdtempSync(join(tmpdir(), "promo-artifacts-"));
  projectId = "promo-test-" + Date.now();
  for (const [p, c] of Object.entries(SITE)) {
    const full = join(root, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, c, "utf8");
  }
});
afterAll(() => {
  try { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch { /* noop */ }
  try { rmSync(artifacts, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch { /* noop */ }
});

describe("Vídeo promocional do site — geração REAL (Chromium + FFmpeg → MP4 H.264)", () => {
  it("gera um MP4 real, valida duração/resolução/codec e persiste por projeto", async () => {
    const store = createArtifactStore({ root: artifacts });
    const phases: string[] = [];
    const res = await generateSitePromoVideo({
      workspaceRoot: root,
      projectId,
      store,
      target: 20,
      width: 1280,
      height: 720,
      onPhase: (p) => phases.push(p),
    });

    expect(res.ok, res.reason ?? "").toBe(true);
    // Métricas REAIS do MP4 gerado (tamanho/duração/resolução/codec).
    // eslint-disable-next-line no-console
    console.log("[promo-video]", JSON.stringify({ duration: res.duration, width: res.width, height: res.height, fileSize: res.fileSize, codec: res.codec, checks: res.checks }));
    expect(res.width).toBe(1280);
    expect(res.height).toBe(720);
    expect(res.duration ?? 0).toBeGreaterThan(10);
    expect(res.duration ?? 0).toBeLessThanOrEqual(90);
    expect(res.codec ?? "").toMatch(/h264|avc/i);
    expect(res.fileSize ?? 0).toBeGreaterThan(2048);
    // validação real confirmou container/codec
    expect(res.checks?.some((c) => /ftyp|código|codec|avc1/i.test(c)) ?? false).toBe(true);

    // o arquivo REAL existe no Artifact Store (isolado por projeto)
    const bytes = await store.getProjectFile(projectId, "video/current.mp4");
    expect(bytes).not.toBeNull();
    expect((bytes as Buffer).length).toBeGreaterThan(2048);
    expect((bytes as Buffer).subarray(4, 12).toString("latin1")).toContain("ftyp");

    // fases reportadas
    expect(phases).toContain("recording");
    expect(phases).toContain("processing");
    expect(phases).toContain("done");

    // nome de download sanitizado
    expect(promoVideoFileName("Studio Aurora")).toBe("studio-aurora-apresentacao-site.mp4");
  }, 180_000);
});
