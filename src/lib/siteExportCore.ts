// Exportação do Site Project (versão editada) para um projeto Vite estático.
// Núcleo puro (sem DOM/fetch) — testável. Nada de secrets/código interno.

export function sanitizeSlug(value: string, fallback = "site"): string {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

export interface AssetRef { url: string; localPath?: string; external?: boolean }

// URLs de imagem utilizadas pelo site (hero + galeria).
export function collectSpecImages(spec: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const content = (spec.content && typeof spec.content === "object" ? spec.content : {}) as Record<string, unknown>;
  const hero = content.hero && typeof content.hero === "object" ? (content.hero as Record<string, unknown>) : {};
  const add = (v: unknown) => {
    if (typeof v === "string" && /^https?:\/\//i.test(v)) urls.push(v);
    else if (v && typeof v === "object") {
      const img = v as Record<string, unknown>;
      if (typeof img.url === "string" && /^https?:\/\//i.test(img.url)) urls.push(img.url);
    }
  };
  add(hero.image);
  const gallery = content.gallery && typeof content.gallery === "object" ? (content.gallery as Record<string, unknown>) : {};
  if (Array.isArray(gallery.items)) gallery.items.forEach((item) => add(item && typeof item === "object" ? (item as Record<string, unknown>).image : item));
  return Array.from(new Set(urls));
}

function str(v: unknown): string { return typeof v === "string" ? v : ""; }
function safeText(v: unknown): string {
  return str(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface SiteLike {
  business?: Record<string, unknown>;
  design_system?: Record<string, unknown>;
  sections?: Array<{ type?: string; id?: string }>;
  navigation?: Array<{ label?: unknown; anchor?: unknown }>;
  content?: Record<string, unknown>;
  calls_to_action?: unknown[];
  seo?: Record<string, unknown>;
}

function oneOf(v: unknown, list: string[], fallback: string): string {
  const s = str(v); return list.includes(s) ? s : fallback;
}

const SECTION_ORDER = ["hero", "trust", "features", "numbers", "process", "faq", "gallery", "about", "services", "testimonials", "cta", "contact"];

// Constrói o HTML estático completo (com CSS de estilos) a partir da spec.
export function buildSiteHtml(spec: SiteLike, assets: Record<string, string>): string {
  const b = spec.business ?? {};
  const ds = (spec.design_system ?? {}) as Record<string, unknown>;
  const colors = (ds.colors && typeof ds.colors === "object" ? ds.colors : {}) as Record<string, string>;
  const typo = (ds.typography && typeof ds.typography === "object" ? ds.typography : {}) as Record<string, string>;
  const c = spec.content ?? {};
  const block = (k: string): Record<string, unknown> => (c[k] && typeof c[k] === "object" ? (c[k] as Record<string, unknown>) : {});
  const t = (v: unknown): string => safeText(str(v));
  const name = t(b.name) || "Minha Empresa";
  const seg = t(b.segment);
  const hero = block("hero");
  const sections = spec.sections ?? [];
  const sectionTypes = SECTION_ORDER.filter((s) => sections.some((x) => x.type === s));
  const nav = Array.isArray(spec.navigation) ? (spec.navigation as Array<{ label?: unknown; anchor?: unknown }>) : [];
  const gallery = block("gallery");
  const galleryItems = Array.isArray(gallery.items) ? gallery.items : [];
  const imgSrc = (v: unknown): string => {
    if (typeof v === "string") return assets[v] ?? v;
    if (v && typeof v === "object") {
      const u = (v as Record<string, unknown>).url;
      if (typeof u === "string") return assets[u] ?? u;
    }
    return "";
  };
  const heroImg = imgSrc(hero.image);
  const primary = colors.primary ?? "#0f766e";
  const onPrimary = colors.on_primary ?? "#ffffff";
  const secondary = colors.secondary ?? "#134e4a";
  const accent = colors.accent ?? "#b45309";
  const background = colors.background ?? "#f8fafc";
  const surface = colors.surface ?? "#ffffff";
  const onSurface = colors.on_surface ?? "#0f172a";
  const muted = colors.muted ?? "#64748b";
  const border = colors.border ?? "#e2e8f0";
  const headingFont = (typo.heading_font ?? "Plus Jakarta Sans").split(",")[0];
  const bodyFont = (typo.body_font ?? "Inter").split(",")[0];
  const hVariant = str(ds.hero_variant);
  const statement = hVariant === "statement";
  const heroTitle = t(hero.title) || name;
  const seoTitle = (() => {
    const heroSeo = (hero as Record<string, unknown>).seo;
    const fromHero = heroSeo && typeof heroSeo === "object" ? (heroSeo as Record<string, unknown>).title : undefined;
    return t(typeof fromHero === "string" ? fromHero : spec.seo?.title) || name;
  })();

  const css = `
:root{--p:${primary};--onp:${onPrimary};--s:${secondary};--a:${accent};--bg:${background};--sf:${surface};--on:${onSurface};--mu:${muted};--bd:${border};--hf:"${headingFont}","Plus Jakarta Sans",sans-serif;--bf:"${bodyFont}",Inter,sans-serif;--r:18px;--max:1160px}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--on);font-family:var(--bf);line-height:1.6;-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%}
a{color:inherit}
.container{max-width:var(--max);margin:0 auto;padding:0 24px}
header.sticky{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--sf) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--bd)}
.nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 24px;max-width:var(--max);margin:0 auto}
.brand{font-family:var(--hf);font-weight:700;color:var(--p)}
.nav ul{display:flex;gap:22px;list-style:none}
.nav ul a{text-decoration:none;font-size:14px;color:var(--on);opacity:.85}
.nav ul a:hover{opacity:1;text-decoration:underline;text-underline-offset:4px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--a);color:#1c1917;font-weight:600;border-radius:999px;padding:12px 24px;text-decoration:none;transition:transform .2s,box-shadow .2s}
.btn:hover{transform:translateY(-2px);box-shadow:0 12px 30px -12px rgba(0,0,0,.35)}
.hero{background:var(--bg);color:var(--on);padding:90px 0 80px}
.hero.statement{background:var(--s);color:var(--onp)}
.hero-grid{display:grid;gap:40px;align-items:center}
.hero-grid.split{grid-template-columns:1.05fr .95fr}
.eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--p);font-weight:700;margin-bottom:18px}
.eyebrow::before{content:"";height:1px;width:28px;background:var(--p)}
.statement .eyebrow{color:var(--onp)}
.hero h1{font-family:var(--hf);font-size:clamp(2.3rem,5vw,3.8rem);line-height:1.05;letter-spacing:-.02em;margin-bottom:20px}
.hero p.lead{font-size:1.1rem;color:var(--mu);max-width:560px;margin-bottom:28px}
.statement p.lead{color:rgba(255,255,255,.85)}
.hero-fig{border-radius:calc(var(--r)*1.1);overflow:hidden;box-shadow:0 30px 70px -30px rgba(16,24,40,.4);aspect-ratio:4/3}
.hero-fig img{width:100%;height:100%;object-fit:cover}
.statement .hero-fig{aspect-ratio:21/9;margin-top:34px;border-radius:var(--r)}
section{padding:78px 0}
section.sf{background:var(--sf)}
.sec-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:48px}
.sec-head h2{font-family:var(--hf);font-size:clamp(1.8rem,3.2vw,2.7rem);letter-spacing:-.02em;margin-top:12px}
.sec-head .sub{max-width:380px;color:var(--mu)}
.trust{background:var(--bg);padding:26px 0}
.trust ul{display:flex;flex-wrap:wrap;justify-content:center;gap:14px 34px;list-style:none;color:var(--mu);font-size:14px}
.trust li{display:flex;gap:8px;align-items:center}
.trust li::before{content:"";width:6px;height:6px;border-radius:99px;background:var(--p)}
.features{background:var(--bg)}
.features .grid{border:1px solid var(--bd);border-radius:calc(var(--r)*.9);display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1px;background:var(--bd);overflow:hidden}
.feature{background:var(--sf);padding:26px}
.feature h3{font-family:var(--hf);margin-bottom:8px}
.feature p{color:var(--mu);font-size:14px}
.numbers{background:var(--s);color:var(--onp)}
.numbers .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:30px;text-align:center}
.numbers b{font-family:var(--hf);font-size:2rem;display:block}
.numbers span{font-size:13px;opacity:.8}
.services{background:var(--bg)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}
.card{background:var(--sf);border:1px solid var(--bd);border-radius:calc(var(--r)*.7);padding:26px;transition:transform .25s,box-shadow .25s}
.card:hover{transform:translateY(-4px);box-shadow:0 24px 50px -24px rgba(16,24,40,.35)}
.card h3{font-family:var(--hf);margin-bottom:8px}
.card p{color:var(--mu);font-size:14px}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:30px}
.step{border-top:2px solid var(--bd);padding-top:18px}
.step:first-child{border-color:var(--p)}
.step i{font-style:normal;font-family:var(--hf);font-size:2rem;color:var(--p);display:block;margin-bottom:8px}
.step h3{margin-bottom:6px}
.step p{color:var(--mu);font-size:14px}
.faq{background:var(--bg)}
.faq details{border:1px solid var(--bd);border-radius:14px;background:var(--sf);padding:16px 20px;margin-bottom:12px;max-width:760px}
.faq summary{cursor:pointer;font-weight:600;display:flex;justify-content:space-between;gap:16px;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";color:var(--p);font-size:20px}
.faq details[open] summary::after{content:"–"}
.faq p{color:var(--mu);font-size:14px;margin-top:12px}
.gallery{background:var(--sf)}
.gallery .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.gallery .grid.editorial{grid-auto-rows:220px}
.gallery .grid.editorial .g1{grid-column:span 2;grid-row:span 2}
.gallery img{width:100%;height:100%;object-fit:cover;border-radius:calc(var(--r)*.7)}
.about .cols{display:grid;gap:40px;grid-template-columns:1fr 1.4fr;align-items:start}
.cta{background:var(--s);color:var(--onp);text-align:center}
.cta h2{font-family:var(--hf);font-size:clamp(1.7rem,3vw,2.6rem);margin-bottom:12px}
.contact .grid{display:grid;gap:34px;grid-template-columns:1fr 1fr}
footer{background:var(--s);color:var(--onp);padding:50px 0 28px}
footer.light{background:var(--sf);color:var(--on);border-top:1px solid var(--bd)}
.footer-cols{display:grid;gap:30px;grid-template-columns:1.4fr 1fr 1fr;margin-bottom:36px}
footer h4{font-family:var(--hf);margin-bottom:12px}
footer ul{list-style:none;font-size:14px;opacity:.85}
footer .foot-line{border-top:1px solid rgba(255,255,255,.15);padding-top:20px;font-size:12px;opacity:.7;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media(max-width:900px){.hero-grid.split,.about .cols,.contact .grid,.footer-cols{grid-template-columns:1fr}.cards,.gallery .grid{grid-template-columns:1fr 1fr}.nav ul{display:none}}
@media(max-width:600px){.cards,.gallery .grid{grid-template-columns:1fr}}
`;

  const parts: string[] = [];
  parts.push(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${seoTitle}</title>`);
  parts.push(`<link href="https://fonts.googleapis.com/css2?family=${headingFont.replace(/ /g, "+")}&family=${bodyFont.replace(/ /g, "+")}&display=swap" rel="stylesheet">`);
  parts.push(`<style>${css}</style></head><body>`);

  // Header
  parts.push(`<header class="sticky"><nav class="nav"><a class="brand" href="#top">${name}</a>`);
  if (nav.length) parts.push(`<ul>${nav.map((n) => `<li><a href="#${t(n.anchor)}">${t(n.label) || t(n.anchor)}</a></li>`).join("")}</ul>`);
  const wa = str(block("contact").whatsapp || block("contact").phone);
  if (wa) parts.push(`<a class="btn" href="https://wa.me/${wa.replace(/\D/g, "")}" target="_blank" rel="noreferrer">Falar agora</a>`);
  parts.push(`</nav></header>`);

  if (sectionTypes.includes("hero") || heroTitle) {
    const sub = t(hero.subtitle);
    parts.push(`<section id="top" class="hero ${statement ? "statement" : ""}"><div class="container ${statement ? "" : "hero-grid split"}">`);
    parts.push(`<div>${statement ? `<span class="eyebrow">${t(seg)}</span>` : `<div><span class="eyebrow">${t(seg)}</span></div>`}<h1>${heroTitle}</h1>`);
    if (sub) parts.push(`<p class="lead">${sub}</p>`);
    const cta = str(hero.primary_cta);
    if (cta) parts.push(`<a class="btn" href="#contact">${t(cta)}</a>`);
    parts.push(`</div>`);
    if (heroImg) parts.push(`<div class="hero-fig"><img src="${imgSrc(hero.image)}" alt=""/></div>`);
    parts.push(`</div></section>`);
  }

  const trust = block("trust");
  if (sectionTypes.includes("trust") && Array.isArray(trust.items)) {
    const items = trust.items.map((i) => t((i as Record<string, unknown>).text)).filter(Boolean);
    if (items.length) parts.push(`<div class="trust"><div class="container"><ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul></div></div>`);
  }

  const features = block("features");
  if (sectionTypes.includes("features") && Array.isArray(features.items)) {
    const items = features.items as Array<Record<string, unknown>>;
    parts.push(`<section id="features" class="features"><div class="container"><div class="sec-head"><div><span class="eyebrow">Diferenciais</span><h2>${t(features.title) || "Por que nos escolher"}</h2></div></div><div class="grid">${items.filter((i) => str(i.title)).map((i) => `<div class="feature"><h3>${t(i.title)}</h3>${str(i.description) ? `<p>${t(i.description)}</p>` : ""}</div>`).join("")}</div></div></section>`);
  }

  const services = block("services");
  if (sectionTypes.includes("services") && Array.isArray(services.items)) {
    const items = services.items as Array<Record<string, unknown>>;
    parts.push(`<section id="services" class="services"><div class="container"><div class="sec-head"><div><span class="eyebrow">Serviços</span><h2>${t(services.title) || "Serviços"}</h2></div>${str(services.subtitle) ? `<p class="sub">${t(services.subtitle)}</p>` : ""}</div><div class="cards">${items.filter((i) => str(i.title)).map((i) => `<div class="card"><h3>${t(i.title)}</h3>${str(i.description) ? `<p>${t(i.description)}</p>` : ""}</div>`).join("")}</div></div></section>`);
  }

  const numbers = block("numbers");
  if (sectionTypes.includes("numbers") && Array.isArray(numbers.items)) {
    const items = numbers.items as Array<Record<string, unknown>>;
    if (items.some((i) => str(i.value))) parts.push(`<div class="numbers"><div class="container"><div class="grid">${items.map((i) => `<div><b>${t(i.value)}</b><span>${t(i.label)}</span></div>`).join("")}</div></div></div>`);
  }

  const process = block("process");
  if (sectionTypes.includes("process") && Array.isArray(process.steps)) {
    const steps = process.steps as Array<Record<string, unknown>>;
    parts.push(`<section class="services"><div class="container"><div class="sec-head"><div><span class="eyebrow">Como funciona</span><h2>${t(process.title) || "Nosso processo"}</h2></div></div><div class="steps">${steps.map((s, idx) => `<div class="step"><i>${String(idx + 1).padStart(2, "0")}</i><h3>${t(s.title)}</h3>${str(s.description) ? `<p>${t(s.description)}</p>` : ""}</div>`).join("")}</div></div></section>`);
  }

  const about = block("about");
  if (sectionTypes.includes("about") && str(about.body)) {
    parts.push(`<section id="about" class="about sf"><div class="container"><div class="cols"><div><span class="eyebrow">Sobre</span></div><div><h2 class="sec-head" style="margin-bottom:20px">${t(about.title) || "Sobre"}</h2><p style="color:var(--mu)">${t(about.body)}</p></div></div></div></section>`);
  }

  if (sectionTypes.includes("gallery") && Array.isArray(gallery.items)) {
    const editorial = str(gallery.layout) === "editorial";
    parts.push(`<section id="gallery" class="gallery"><div class="container"><div class="sec-head"><div><h2>${t(gallery.title) || "Ambiente e inspiração"}</h2></div></div><div class="grid ${editorial ? "editorial" : ""}">${galleryItems.slice(0, editorial ? 7 : 6).map((item, idx) => { const src = imgSrc((item as Record<string, unknown>).image ?? item); return `<div class="${editorial && idx === 0 ? "g1" : ""}"><img loading="lazy" src="${src}" alt=""/></div>`; }).join("")}</div></div></section>`);
  }

  const faq = block("faq");
  if (sectionTypes.includes("faq") && Array.isArray(faq.items)) {
    const items = faq.items as Array<Record<string, unknown>>;
    if (items.some((i) => str(i.question))) {
      parts.push(`<section id="faq" class="faq"><div class="container"><div class="sec-head"><div><h2>${t(faq.title) || "Perguntas frequentes"}</h2></div></div>${items.map((i) => `<details><summary>${t(i.question)}</summary>${str(i.answer) ? `<p>${t(i.answer)}</p>` : ""}</details>`).join("")}</div></section>`);
    }
  }

  const ctaBlock = block("cta");
  if (sectionTypes.includes("cta") && str(ctaBlock.title)) {
    parts.push(`<div id="cta" class="cta"><div class="container"><h2>${t(ctaBlock.title)}</h2>${str(ctaBlock.body) ? `<p style="opacity:.9">${t(ctaBlock.body)}</p>` : ""}${wa ? `<p style="margin-top:24px"><a class="btn" href="https://wa.me/${wa.replace(/\D/g, "")}" target="_blank" rel="noreferrer">${t(ctaBlock.button_label) || "Falar agora"}</a></p>` : ""}</div></div>`);
  }

  const contact = block("contact");
  const phone = str(contact.phone);
  if (sectionTypes.includes("contact") && (str(contact.title) || phone || wa)) {
    parts.push(`<section id="contact" class="contact sf"><div class="container"><div class="grid"><div><span class="eyebrow">Contato</span><h2 class="sec-head" style="margin-bottom:12px">${t(contact.title) || "Contato"}</h2>${str(contact.body) ? `<p style="color:var(--mu)">${t(contact.body)}</p>` : ""}</div><div><p>${phone ? `<a href="tel:${phone.replace(/\D/g, "")}" style="color:var(--p);font-weight:600">${t(phone)}</a>` : ""}</p><p>${wa ? `<a href="https://wa.me/${wa.replace(/\D/g, "")}" target="_blank" rel="noreferrer" style="color:var(--p);font-weight:600">${t(wa)}</a>` : ""}</p></div></div></div></section>`);
  }

  // Footer
  parts.push(`<footer class="${oneOf(ds.footer_style, ["editorial", "centered"], "") === "" ? "" : "light"}"><div class="container"><div class="footer-cols"><div><h4>${name}</h4>${str(block("footer").tagline) ? `<p style="opacity:.8">${t(block("footer").tagline)}</p>` : ""}</div>${nav.length ? `<div><h4>Navegação</h4><ul>${nav.map((n) => `<li><a href="#${t(n.anchor)}">${t(n.label) || t(n.anchor)}</a></li>`).join("")}</ul></div>` : ""}<div><h4>Contato</h4><ul>${phone ? `<li>${t(phone)}</li>` : ""}${wa ? `<li>${t(wa)}</li>` : ""}</ul></div></div><div class="foot-line"><span>© ${new Date().getFullYear()} ${name} · ${t(seg)}</span></div></div></footer>`);

  parts.push(`<script src="./src/main.js"></script></body></html>`);
  return parts.join("");
}

export const SITE_CSS_PATH = "src/site.css";

export function buildSiteCss(): string {
  return "/* gerado pelo TiagoProspector */\n";
}

export function buildSiteMainJs(): string {
  return `// Interações leves do site (scroll suave já vem do CSS).
const header = document.querySelector("header");
window.addEventListener("scroll", () => { if (!header) return; }, { passive: true });
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href"); if (!id || id === "#") return;
    const el = document.querySelector(id); if (!el) return;
    e.preventDefault(); el.scrollIntoView({ behavior: "smooth" });
  });
});
`;
}

export function buildPackageJson(name: string): string {
  return JSON.stringify({
    name,
    private: true,
    version: "1.0.0",
    type: "module",
    scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
    devDependencies: { vite: "^5.4.19" },
  }, null, 2);
}

export function buildViteConfig(): string {
  return `import { defineConfig } from "vite";
export default defineConfig({ base: "./" });
`;
}

export function buildTsconfig(): string {
  return `{ "compilerOptions": { "target": "ES2020", "module": "ESNext", "moduleResolution": "bundler", "lib": ["ES2020", "DOM"] }, "include": ["src"] }\n`;
}

export function buildReadme(spec: SiteLike, projectName: string, externalAssets: string[]): string {
  const name = str(spec.business?.name) || projectName;
  return `# ${name}

Site criado no TiagoProspector.

## Stack
HTML5 + CSS (design system gerado) + Vite.

## Como usar
\`\`\`bash
npm install
npm run dev
\`\`\`

Build de produção:
\`\`\`bash
npm run build
npm run preview
\`\`\`

## Estrutura
- \`index.html\` — página (conteúdo já renderizado)
- \`src/site.css\` / \`src/main.js\` — estilos e interações
- \`public/assets/\` — imagens do site (quando baixadas localmente)

${externalAssets.length ? `## Observações sobre assets externos\nAs seguintes imagens são referenciadas remotamente (não foi possível baixá-las localmente):\n${externalAssets.map((u) => `- ${u}`).join("\n")}\n` : "## Observações sobre assets\nAs imagens utilizadas são ilustrativas (licença Pexels) — não são fotos reais do negócio.\n"}
`;
}

export function buildProjectFiles(spec: SiteLike, assets: Record<string, string>, external: string[]): Record<string, string> {
  const slug = sanitizeSlug(str(spec.business?.name) || "site", "meu-site");
  const html = buildSiteHtml(spec, assets);
  return {
    [`${slug}/package.json`]: buildPackageJson(slug),
    [`${slug}/vite.config.ts`]: buildViteConfig(),
    [`${slug}/tsconfig.json`]: buildTsconfig(),
    [`${slug}/index.html`]: html,
    [`${slug}/src/site.css`]: buildSiteCss(),
    [`${slug}/src/main.js`]: buildSiteMainJs(),
    [`${slug}/src/site.json`]: JSON.stringify(spec, null, 2),
    [`${slug}/README.md`]: buildReadme(spec, slug, external),
    [`${slug}/.env.example`]: "# O projeto é estático e não requer variáveis de ambiente.\n",
  };
}
