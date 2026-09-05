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
:root{--p:${primary};--onp:${onPrimary};--s:${secondary};--a:${accent};--bg:${background};--sf:${surface};--on:${onSurface};--mu:${muted};--bd:${border};--hf:"${headingFont}","Plus Jakarta Sans",sans-serif;--bf:"${bodyFont}",Inter,sans-serif;--r:18px;--max:1160px;--shadow-soft:0 8px 30px -12px rgba(16,24,40,.14);--shadow-lift:0 30px 70px -30px rgba(16,24,40,.38)}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--on);font-family:var(--bf);line-height:1.65;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden}
img{display:block;max-width:100%}
a{color:inherit;text-decoration:none}
.container{max-width:var(--max);margin:0 auto;padding:0 24px}
/* Header glass */
header.sticky{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--sf) 82%,transparent);backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);border-bottom:1px solid color-mix(in srgb,var(--bd) 70%,transparent)}
.nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px;max-width:var(--max);margin:0 auto;transition:padding .3s}
header.scrolled .nav{padding-block:10px}
.brand{font-family:var(--hf);font-weight:800;font-size:1.25rem;letter-spacing:-.02em;color:var(--p)}
.brand span{display:block;font-family:var(--bf);font-weight:500;font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:var(--mu);margin-top:2px}
.nav ul{display:flex;gap:28px;list-style:none}
.nav ul a{position:relative;font-size:14px;font-weight:500;color:var(--on);opacity:.75;transition:opacity .2s}
.nav ul a::after{content:"";position:absolute;left:0;right:100%;bottom:-5px;height:2px;background:var(--p);transition:right .25s ease}
.nav ul a:hover{opacity:1}
.nav ul a:hover::after{right:0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;background:var(--a);color:#1c1917;font-weight:700;border-radius:999px;padding:13px 28px;text-decoration:none;transition:transform .2s,box-shadow .25s,filter .2s;box-shadow:0 14px 34px -14px color-mix(in srgb,var(--a) 70%,transparent)}
.btn::after{content:"→";transition:transform .2s}
.btn:hover{transform:translateY(-2px);filter:brightness(1.05);box-shadow:0 20px 44px -16px color-mix(in srgb,var(--a) 80%,transparent)}
.btn:hover::after{transform:translateX(3px)}
/* Hero */
.hero{position:relative;background:var(--bg);color:var(--on);padding:clamp(64px,9vw,120px) 0 clamp(56px,8vw,110px);overflow:hidden}
.hero::before{content:"";position:absolute;top:-140px;right:-140px;width:440px;height:440px;border-radius:50%;background:radial-gradient(circle at center,color-mix(in srgb,var(--p) 18%,transparent),transparent 70%);pointer-events:none}
.hero::after{content:"";position:absolute;bottom:-180px;left:-120px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle at center,color-mix(in srgb,var(--a) 14%,transparent),transparent 70%);pointer-events:none}
.hero.statement{background:linear-gradient(135deg,var(--s) 0%,color-mix(in srgb,var(--s) 82%,var(--p)) 100%);color:var(--onp)}
.hero.statement::before{background:radial-gradient(circle,color-mix(in srgb,var(--onp) 12%,transparent),transparent 70%)}
.hero.statement::after{background:radial-gradient(circle,color-mix(in srgb,var(--a) 26%,transparent),transparent 70%)}
.hero .container{position:relative;z-index:1}
.hero-grid{display:grid;gap:clamp(32px,5vw,64px);align-items:center}
.hero-grid.split{grid-template-columns:1.05fr .95fr}
.eyebrow{display:inline-flex;align-items:center;gap:12px;font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--p);font-weight:700;margin-bottom:20px}
.eyebrow::before{content:"";height:1px;width:34px;background:var(--p)}
.statement .eyebrow{color:var(--onp)}
.statement .eyebrow::before{background:var(--a)}
.hero h1{font-family:var(--hf);font-size:clamp(2.5rem,6vw,4.4rem);line-height:1.03;letter-spacing:-.03em;font-weight:800;margin-bottom:22px;text-wrap:balance}
.hero p.lead{font-size:clamp(1.05rem,1.6vw,1.25rem);line-height:1.6;color:var(--mu);max-width:600px;margin-bottom:32px;text-wrap:pretty}
.statement p.lead{color:color-mix(in srgb,var(--onp) 88%,transparent)}
.hero .btn-group{display:flex;flex-wrap:wrap;gap:14px;align-items:center}
.hero-fig{position:relative;border-radius:calc(var(--r)*1.2);overflow:hidden;box-shadow:var(--shadow-lift);aspect-ratio:4/3}
.hero-fig img{width:100%;height:100%;object-fit:cover;transition:transform 1.2s cubic-bezier(.2,.7,.2,1)}
.hero-fig:hover img{transform:scale(1.04)}
.hero-fig::after{content:"";position:absolute;inset:0;border:1px solid rgba(255,255,255,.08);border-radius:inherit;pointer-events:none}
.statement .hero-fig{aspect-ratio:21/9;margin-top:44px;border-radius:var(--r)}
section{padding:clamp(60px,8vw,104px) 0}
section.sf{background:var(--sf)}
/* Section headers */
.sec-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:clamp(36px,5vw,56px)}
.sec-head h2{font-family:var(--hf);font-size:clamp(2rem,4vw,3.1rem);line-height:1.06;letter-spacing:-.025em;font-weight:800;margin-top:16px;text-wrap:balance}
.sec-head .sub{max-width:400px;color:var(--mu);font-size:1.02rem}
/* Trust strip */
.trust{background:var(--bg);padding:30px 0;border-block:1px solid var(--bd)}
.trust ul{display:flex;flex-wrap:wrap;justify-content:center;gap:16px 42px;list-style:none;color:var(--mu);font-size:14px;font-weight:500}
.trust li{display:flex;gap:10px;align-items:center}
.trust li::before{content:"";width:7px;height:7px;border-radius:99px;background:linear-gradient(135deg,var(--p),var(--a))}
.features{background:var(--bg)}
.features .grid{border:1px solid var(--bd);border-radius:calc(var(--r)*.9);display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1px;background:var(--bd);overflow:hidden}
.feature{background:var(--sf);padding:32px 28px;position:relative;transition:background .25s}
.feature::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--p),transparent);opacity:0;transition:opacity .25s}
.feature:hover{background:color-mix(in srgb,var(--sf) 88%,var(--p) 4%)}
.feature:hover::before{opacity:1}
.feature h3{font-family:var(--hf);margin-bottom:10px;letter-spacing:-.01em}
.feature p{color:var(--mu);font-size:14.5px}
.numbers{background:linear-gradient(135deg,var(--s),color-mix(in srgb,var(--s) 70%,#000)) ;color:var(--onp);position:relative;overflow:hidden}
.numbers::before{content:"";position:absolute;inset:0;background:radial-gradient(600px 300px at 85% -20%,color-mix(in srgb,var(--a) 30%,transparent),transparent)}
.numbers .grid{position:relative;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:34px;text-align:center}
.numbers b{font-family:var(--hf);font-size:clamp(2.2rem,4vw,3.2rem);display:block;line-height:1;letter-spacing:-.02em;margin-bottom:8px}
.numbers span{font-size:13px;opacity:.82;letter-spacing:.04em}
.services{background:var(--bg)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}
.card{position:relative;background:var(--sf);border:1px solid var(--bd);border-radius:calc(var(--r)*.8);padding:32px 28px;overflow:hidden;transition:transform .25s,box-shadow .3s,border-color .25s}
.card::after{content:"";position:absolute;top:0;left:0;width:100%;height:3px;background:linear-gradient(90deg,var(--p),var(--a));transform:scaleX(0);transform-origin:left;transition:transform .3s}
.card:hover{transform:translateY(-6px);border-color:color-mix(in srgb,var(--p) 30%,var(--bd));box-shadow:var(--shadow-lift)}
.card:hover::after{transform:scaleX(1)}
.card h3{font-family:var(--hf);margin-bottom:10px;letter-spacing:-.01em;font-size:1.18rem}
.card p{color:var(--mu);font-size:14.5px}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:36px;counter-reset:step}
.step{position:relative;border-top:2px solid var(--bd);padding-top:24px;transition:border-color .25s}
.step:first-child{border-color:var(--p)}
.step i{font-style:normal;font-family:var(--hf);font-size:clamp(1.6rem,3vw,2.2rem);color:var(--p);display:block;margin-bottom:10px;font-weight:800}
.step h3{margin-bottom:8px}
.step p{color:var(--mu);font-size:14.5px}
.faq{background:var(--bg)}
.faq details{border:1px solid var(--bd);border-radius:16px;background:var(--sf);padding:20px 24px;margin-bottom:14px;max-width:780px;box-shadow:var(--shadow-soft);transition:border-color .2s}
.faq details[open]{border-color:color-mix(in srgb,var(--p) 35%,var(--bd))}
.faq summary{cursor:pointer;font-weight:600;font-size:1.02rem;display:flex;justify-content:space-between;gap:16px;list-style:none;align-items:center}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";color:var(--p);font-size:22px;font-weight:400;transition:transform .2s;line-height:1}
.faq details[open] summary::after{content:"–"}
.faq p{color:var(--mu);font-size:14.5px;margin-top:14px;max-width:640px}
.gallery{background:var(--sf)}
.gallery .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.gallery .grid.editorial{grid-auto-rows:230px}
.gallery .grid.editorial .g1{grid-column:span 2;grid-row:span 2}
.gallery figure{position:relative;border-radius:calc(var(--r)*.8);overflow:hidden;margin:0;box-shadow:var(--shadow-soft)}
.gallery img{width:100%;height:100%;object-fit:cover;transition:transform .8s cubic-bezier(.2,.7,.2,1);aspect-ratio:4/3}
.gallery .grid.editorial figure{height:100%}
.gallery .grid.editorial img{aspect-ratio:auto;height:100%}
.gallery figure:hover img{transform:scale(1.07)}
.about .cols{display:grid;gap:clamp(32px,5vw,64px);grid-template-columns:1fr 1.4fr;align-items:start}
.about .cols h2{font-size:clamp(1.8rem,3vw,2.6rem);margin-bottom:18px}
.about .cols p{color:var(--mu);font-size:1.05rem;max-width:620px}
.cta{position:relative;background:linear-gradient(135deg,var(--s) 0%,color-mix(in srgb,var(--s) 70%,var(--p)) 100%);color:var(--onp);text-align:center;overflow:hidden}
.cta::before{content:"";position:absolute;top:-160px;left:50%;transform:translateX(-50%);width:560px;height:360px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--a) 34%,transparent),transparent 70%)}
.cta .container{position:relative}
.cta h2{font-family:var(--hf);font-size:clamp(2rem,4vw,3.2rem);line-height:1.05;letter-spacing:-.025em;margin-bottom:16px;text-wrap:balance}
.cta p{opacity:.9;max-width:560px;margin:0 auto;font-size:1.05rem}
.cta p:last-child{margin-top:30px}
.cta .btn{background:var(--a);color:#1c1917}
.contact .grid{display:grid;gap:clamp(32px,5vw,56px);grid-template-columns:1fr 1fr}
.contact h2{font-size:clamp(1.8rem,3vw,2.5rem);margin-bottom:14px}
.contact p a{font-weight:700;color:var(--p);border-bottom:1px solid color-mix(in srgb,var(--p) 40%,transparent);transition:border-color .2s}
.contact p a:hover{border-color:var(--p)}
footer{background:linear-gradient(160deg,var(--s),color-mix(in srgb,var(--s) 78%,#000));color:var(--onp);padding:clamp(48px,6vw,72px) 0 30px;position:relative;overflow:hidden}
footer::before{content:"";position:absolute;top:-160px;left:-120px;width:360px;height:300px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--a) 24%,transparent),transparent 70%)}
footer.light{background:var(--sf);color:var(--on);border-top:1px solid var(--bd)}
footer.light::before{background:radial-gradient(circle,color-mix(in srgb,var(--p) 12%,transparent),transparent 70%)}
footer .container{position:relative}
.footer-cols{display:grid;gap:36px;grid-template-columns:1.5fr 1fr 1fr;margin-bottom:42px}
footer h4{font-family:var(--hf);font-size:1.05rem;margin-bottom:16px;letter-spacing:-.01em}
footer ul{list-style:none;font-size:14.5px;opacity:.85;display:grid;gap:8px}
footer ul a:hover{opacity:1;text-decoration:underline;text-underline-offset:3px}
footer p{font-size:14.5px;opacity:.85;max-width:340px}
footer .foot-line{border-top:1px solid rgba(255,255,255,.14);padding-top:22px;font-size:12.5px;opacity:.72;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
footer.light .foot-line{border-color:var(--bd)}
/* Reveal on scroll */
.reveal{opacity:0;transform:translateY(26px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
.reveal.in{opacity:1;transform:none}
@media(max-width:900px){.hero-grid.split,.about .cols,.contact .grid,.footer-cols{grid-template-columns:1fr}.cards,.gallery .grid{grid-template-columns:1fr 1fr}.nav ul{display:none}.hero::before,.hero::after{width:280px;height:280px}}
@media(max-width:600px){.cards,.gallery .grid{grid-template-columns:1fr}.nav{padding:14px 16px}}
@media (prefers-reduced-motion: reduce){html{scroll-behavior:auto}.reveal{opacity:1 !important;transform:none !important;transition:none}*{transition:none !important;animation:none !important}}
`;

  const parts: string[] = [];
  parts.push(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${seoTitle}</title>`);
  parts.push(`<link href="https://fonts.googleapis.com/css2?family=${headingFont.replace(/ /g, "+")}&family=${bodyFont.replace(/ /g, "+")}&display=swap" rel="stylesheet">`);
  parts.push(`<style>${css}</style></head><body>`);

  // Header
  parts.push(`<header class="sticky"><nav class="nav"><a class="brand" href="#top">${name}${seg ? `<span>${t(seg)}</span>` : ""}</a>`);
  if (nav.length) parts.push(`<ul>${nav.map((n) => `<li><a href="#${t(n.anchor)}">${t(n.label) || t(n.anchor)}</a></li>`).join("")}</ul>`);
  const wa = str(block("contact").whatsapp || block("contact").phone);
  if (wa) parts.push(`<a class="btn" href="https://wa.me/${wa.replace(/\D/g, "")}" target="_blank" rel="noreferrer">Falar agora</a>`);
  parts.push(`</nav></header>`);

  const revealAttr = (extra?: string) => `class="reveal${extra ? " " + extra : ""}"`;

  if (sectionTypes.includes("hero") || heroTitle) {
    const sub = t(hero.subtitle);
    parts.push(`<section id="top" class="hero ${statement ? "statement" : ""}"><div class="container ${statement ? "" : "hero-grid split"}">`);
    parts.push(`<div ${revealAttr()}>${statement ? `<span class="eyebrow">${t(seg)}</span>` : `<div><span class="eyebrow">${t(seg)}</span></div>`}<h1>${heroTitle}</h1>`);
    if (sub) parts.push(`<p class="lead">${sub}</p>`);
    const cta = str(hero.primary_cta);
    const ctaHref = statement ? "#contact" : wa ? `https://wa.me/${wa.replace(/\D/g, "")}` : "#contact";
    const ctaTarget = ctaHref.startsWith("http") ? ` target="_blank" rel="noreferrer"` : "";
    if (cta) parts.push(`<div class="btn-group"><a class="btn" href="${ctaHref}"${ctaTarget}>${t(cta)}</a></div>`);
    parts.push(`</div>`);
    if (heroImg) parts.push(`<div ${revealAttr()} class="hero-fig"><img src="${imgSrc(hero.image)}" alt=""/></div>`);
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
    parts.push(`<section id="features" class="features"><div class="container"><div class="sec-head" ${revealAttr()}><div><span class="eyebrow">Diferenciais</span><h2>${t(features.title) || "Por que nos escolher"}</h2></div></div><div class="grid">${items.filter((i) => str(i.title)).map((i) => `<div class="feature" ${revealAttr()}><h3>${t(i.title)}</h3>${str(i.description) ? `<p>${t(i.description)}</p>` : ""}</div>`).join("")}</div></div></section>`);
  }

  const services = block("services");
  if (sectionTypes.includes("services") && Array.isArray(services.items)) {
    const items = services.items as Array<Record<string, unknown>>;
    parts.push(`<section id="services" class="services"><div class="container"><div class="sec-head" ${revealAttr()}><div><span class="eyebrow">Serviços</span><h2>${t(services.title) || "Serviços"}</h2></div>${str(services.subtitle) ? `<p class="sub">${t(services.subtitle)}</p>` : ""}</div><div class="cards">${items.filter((i) => str(i.title)).map((i) => `<div class="card" ${revealAttr()}><h3>${t(i.title)}</h3>${str(i.description) ? `<p>${t(i.description)}</p>` : ""}</div>`).join("")}</div></div></section>`);
  }

  const numbers = block("numbers");
  if (sectionTypes.includes("numbers") && Array.isArray(numbers.items)) {
    const items = numbers.items as Array<Record<string, unknown>>;
    if (items.some((i) => str(i.value))) parts.push(`<div class="numbers"><div class="container"><div class="grid">${items.map((i) => `<div ${revealAttr()}><b>${t(i.value)}</b><span>${t(i.label)}</span></div>`).join("")}</div></div></div>`);
  }

  const process = block("process");
  if (sectionTypes.includes("process") && Array.isArray(process.steps)) {
    const steps = process.steps as Array<Record<string, unknown>>;
    parts.push(`<section class="services"><div class="container"><div class="sec-head" ${revealAttr()}><div><span class="eyebrow">Como funciona</span><h2>${t(process.title) || "Nosso processo"}</h2></div></div><div class="steps">${steps.map((s, idx) => `<div class="step" ${revealAttr()}><i>${String(idx + 1).padStart(2, "0")}</i><h3>${t(s.title)}</h3>${str(s.description) ? `<p>${t(s.description)}</p>` : ""}</div>`).join("")}</div></div></section>`);
  }

  const about = block("about");
  if (sectionTypes.includes("about") && str(about.body)) {
    parts.push(`<section id="about" class="about sf"><div class="container"><div class="cols"><div ${revealAttr()}><span class="eyebrow">Sobre</span></div><div ${revealAttr()}><h2 style="font-family:var(--hf);font-size:clamp(1.8rem,3vw,2.6rem);margin-bottom:18px">${t(about.title) || "Sobre"}</h2><p style="color:var(--mu)">${t(about.body)}</p></div></div></div></section>`);
  }

  if (sectionTypes.includes("gallery") && Array.isArray(gallery.items)) {
    const editorial = str(gallery.layout) === "editorial";
    parts.push(`<section id="gallery" class="gallery"><div class="container"><div class="sec-head" ${revealAttr()}><div><h2>${t(gallery.title) || "Ambiente e inspiração"}</h2></div></div><div class="grid ${editorial ? "editorial" : ""}">${galleryItems.slice(0, editorial ? 7 : 6).map((item, idx) => { const src = imgSrc((item as Record<string, unknown>).image ?? item); return `<figure ${revealAttr()} class="${editorial && idx === 0 ? "g1" : ""}"><img loading="lazy" src="${src}" alt=""/></figure>`; }).join("")}</div></div></section>`);
  }

  const faq = block("faq");
  if (sectionTypes.includes("faq") && Array.isArray(faq.items)) {
    const items = faq.items as Array<Record<string, unknown>>;
    if (items.some((i) => str(i.question))) {
      parts.push(`<section id="faq" class="faq"><div class="container"><div class="sec-head" ${revealAttr()}><div><h2>${t(faq.title) || "Perguntas frequentes"}</h2></div></div>${items.map((i) => `<details ${revealAttr()}><summary>${t(i.question)}</summary>${str(i.answer) ? `<p>${t(i.answer)}</p>` : ""}</details>`).join("")}</div></section>`);
    }
  }

  const ctaBlock = block("cta");
  if (sectionTypes.includes("cta") && str(ctaBlock.title)) {
    parts.push(`<div id="cta" class="cta"><div class="container" ${revealAttr()}><h2>${t(ctaBlock.title)}</h2>${str(ctaBlock.body) ? `<p>${t(ctaBlock.body)}</p>` : ""}${wa ? `<p><a class="btn" href="https://wa.me/${wa.replace(/\D/g, "")}" target="_blank" rel="noreferrer">${t(ctaBlock.button_label) || "Falar agora"}</a></p>` : ""}</div></div>`);
  }

  const contact = block("contact");
  const phone = str(contact.phone);
  if (sectionTypes.includes("contact") && (str(contact.title) || phone || wa)) {
    parts.push(`<section id="contact" class="contact sf"><div class="container"><div class="grid"><div ${revealAttr()}><span class="eyebrow">Contato</span><h2 style="font-family:var(--hf);font-size:clamp(1.8rem,3vw,2.5rem);margin-bottom:14px">${t(contact.title) || "Contato"}</h2>${str(contact.body) ? `<p style="color:var(--mu)">${t(contact.body)}</p>` : ""}</div><div ${revealAttr()}>${phone ? `<p><a href="tel:${phone.replace(/\D/g, "")}">${t(phone)}</a></p>` : ""}${wa ? `<p><a href="https://wa.me/${wa.replace(/\D/g, "")}" target="_blank" rel="noreferrer">${t(wa)}</a></p>` : ""}</div></div></div></section>`);
  }

  // Footer
  const isLightFooter = ["editorial", "centered", "multi_column", "minimal", "large_cta"].includes(str(ds.footer_style));
  parts.push(`<footer class="${isLightFooter ? "light" : ""}"><div class="container"><div class="footer-cols"><div><h4>${name}</h4>${str(block("footer").tagline) ? `<p>${t(block("footer").tagline)}</p>` : ""}</div>${nav.length ? `<div><h4>Navegação</h4><ul>${nav.map((n) => `<li><a href="#${t(n.anchor)}">${t(n.label) || t(n.anchor)}</a></li>`).join("")}</ul></div>` : ""}<div><h4>Contato</h4><ul>${phone ? `<li><a href="tel:${phone.replace(/\D/g, "")}">${t(phone)}</a></li>` : ""}${wa ? `<li><a href="https://wa.me/${wa.replace(/\D/g, "")}" target="_blank" rel="noreferrer">${t(wa)}</a></li>` : ""}</ul></div></div><div class="foot-line"><span>© ${new Date().getFullYear()} ${name} · ${t(seg)}</span></div></div></footer>`);

  parts.push(`<script src="./src/main.js"></script></body></html>`);
  return parts.join("");
}

export const SITE_CSS_PATH = "src/site.css";

export function buildSiteCss(): string {
  return "/* gerado pelo TiagoProspector */\n";
}

export function buildSiteMainJs(): string {
  return `// Interações do site exportado (scroll suave + reveal on scroll + header).
document.addEventListener("DOMContentLoaded", () => {
  // Reveal suave por seção ao entrar no viewport.
  const revealEls = document.querySelectorAll(".reveal");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !("IntersectionObserver" in window)) {
    revealEls.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });
    revealEls.forEach((el, i) => {
      el.style.transitionDelay = \`\${(i % 4) * 70}ms\`;
      io.observe(el);
    });
  }

  // Cabeçalho ganha sombra sutil ao rolar.
  const header = document.querySelector("header");
  if (header) {
    const onScroll = () => {
      header.classList.toggle("scrolled", window.scrollY > 12);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // Scroll suave para âncoras (fallback caso o CSS não cubra).
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
