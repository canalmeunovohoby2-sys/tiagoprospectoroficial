// Utilidades web para o motor de leads: normalização de resultados de Tavily/
// Firecrawl, descoberta de website por lead, validação geográfica de texto,
// extração de contatos e enriquecimento. Sem segredos, sem chamadas de rede
// diretas (recebe callers injetados) — testável com mocks.

export interface WebItem {
  title?: string;
  url: string;
  description?: string;
}

export interface WebBundle {
  tavily: WebItem[];
  firecrawl: WebItem[];
}

export type WebCaller = (provider: "tavily" | "firecrawl", payload: { query?: string; url?: string; limit?: number }) => Promise<{ ok: boolean; results?: WebItem[]; content?: string }>;

const BLOCKED_HOSTS = new Set([
  "instagram.com", "facebook.com", "linkedin.com", "twitter.com", "x.com", "youtube.com",
  "wa.me", "whatsapp.com", "guiamais.com.br", "apontador.com.br", "guiafacil.com.br",
  "yellowpages.com", "mercadolivre.com.br", "olx.com.br", "ifood.com.br", "google.com",
  "cidadeverde.com", "imoveis.com.br", "zap.com.br", "vivaoreal.com.br",
]);

function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function norm(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeWebItem(item: unknown, source: "tavily" | "firecrawl"): WebItem | null {
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  const url = typeof r.url === "string" ? r.url.trim() : "";
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const host = hostOf(url);
  if (!host || BLOCKED_HOSTS.has(host)) return null;
  return {
    title: typeof r.title === "string" ? r.title.slice(0, 300) : "",
    url,
    description: typeof r.description === "string" ? r.description.slice(0, 600) : typeof r.content === "string" ? r.content.slice(0, 600) : "",
  };
}

export function normalizeItemList(raw: unknown, source: "tavily" | "firecrawl"): WebItem[] {
  if (!Array.isArray(raw)) return [];
  const out: WebItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const n = normalizeWebItem(item, source);
    if (!n) continue;
    const key = hostOf(n.url) + n.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

// Descobre o site mais provável do negócio a partir de itens web.
// Exige sinal razoável (tokens do nome no título ou domínio) — nunca "chuta".
export function matchLeadWebsite(leadName: string, items: WebItem[]): { website: string; domain: string; evidence: string } | null {
  const name = norm(leadName);
  if (!name) return null;
  const nameTokens = name.split(/\s+/).filter((t) => t.length >= 4 && !["empresa", "servicos", "serviços", "ltda", "mei", "associados", "associacao", "associação"].includes(t));
  if (nameTokens.length === 0) return null;

  let best: { website: string; domain: string; evidence: string; score: number } | null = null;
  for (const item of items) {
    const domain = hostOf(item.url);
    const domainMain = domain.split(".")[0] ?? "";
    const title = norm(item.title ?? "");
    let score = 0;
    let evidence = "";
    // Domínio contém um token forte do nome.
    const strongToken = nameTokens.find((t) => t.length >= 5 && domainMain.includes(t));
    if (strongToken) {
      score = 90;
      evidence = `dominio_contem_${strongToken}`;
    }
    // 2+ tokens do nome no título.
    const matchedTokens = nameTokens.filter((t) => title.includes(t));
    if (matchedTokens.length >= 2) {
      score = Math.max(score, 60);
      evidence = `titulo_contem_${matchedTokens.slice(0, 2).join("_")}`;
    }
    // Token forte do nome no título, desde que o domínio não seja de agregador.
    if (score === 0) {
      const st = nameTokens.find((t) => t.length >= 6 && title.includes(t));
      if (st && domain !== "site" && !domain.includes("guia")) {
        score = 40;
        evidence = `titulo_contem_${st}`;
      }
    }
    if (score >= 40 && (!best || score > best.score)) {
      best = { website: item.url, domain, evidence, score };
    }
  }
  return best ? { website: best.website, domain: best.domain, evidence: best.evidence } : null;
}

// Validação geográfica textual: exige a cidade E o estado mencionados no texto
// (precaução contra página de outra localidade).
export function textMentionsGeo(text: string, city: string, state: string): boolean {
  const t = norm(text);
  if (!t) return false;
  const c = norm(city);
  const s = norm(state);
  if (c && s) {
    return (t.includes(c) || c.includes(t.split(" ")[0])) && (t.includes(s) || s.length === 2 && t.includes(s));
  }
  if (c) return t.includes(c);
  return !!s && t.includes(s);
}

export function extractPhoneBR(text: string): string | null {
  const m = text.match(/(?:\+?55)?\s*\(?(\d{2})\)?[\s.-]*(\d{4,5})[\s.-]*(\d{4})/);
  if (!m) return null;
  const digits = `${m[1]}${m[2]}${m[3]}`;
  return `+55 ${digits.slice(0, 2)} ${digits.slice(2, digits.length - 4)} ${digits.slice(-4)}`.replace(/  +/g, " ");
}

export function extractWhatsappBR(text: string): string | null {
  const m = text.match(/(?:\+?55)?\s*\(?(\d{2})\)?[\s.-]?(9\d{8})/);
  if (!m) return null;
  const digits = `55${m[1]}${m[2]}`;
  return digits;
}

// Evidência EXPLÍCITA de WhatsApp (links wa.me/wa.link/api.whatsapp.com e
// rótulos "whatsapp:" antes de um número). Número fixo só vira WhatsApp se
// houver essa evidência — nunca pela ausência de dados.
export function extractWhatsAppExplicit(text: string): string | null {
  if (!text) return null;
  // wa.me / wa.link / api.whatsapp.com?phone=
  const link = text.match(/wa\.(?:me|link)\/(?:\+?55)?(\d{10,13})/i) || text.match(/api\.whatsapp\.com\/send[^"'\s]*[?&]phone=(\d{10,13})/i);
  if (link) {
    const digits = link[1].replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    if (digits.length === 12 || digits.length === 13) return digits.startsWith("55") ? digits : `55${digits}`;
    return null;
  }
  // Rótulo explícito: "WhatsApp: (11) 91234-5678", "whatsapp (11) 3456-7890"
  const labeled = text.match(/whatsapp[^\d]{0,16}\s*\(?(\d{2})\)?[\s.-]*(\d{4,5})[\s.-]*(\d{4})/i);
  if (labeled) {
    return `55${labeled[1]}${labeled[2]}${labeled[3]}`;
  }
  return null;
}

export function extractInstagramFromText(text: string): string | null {
  const m = text.match(/instagram\.com\/([A-Za-z0-9._]{2,30})/i);
  if (!m) return null;
  const handle = m[1].replace(/\/$/, "").toLowerCase();
  if (/^(explore|p|reel|reels|stories|share|accounts|about|help|web|direct|login|signup)$/.test(handle)) return null;
  return handle;
}

// Instagram do próprio negócio a partir dos itens web (sem inventar): exige
// sinal forte do nome no título OU handle compatível com token forte do nome.
// `city` é usada como evidência COMBINADA (nome + cidade) para não associar o
// Instagram de outra unidade/filial só por nome parecido.
export function matchInstagramHandle(leadName: string, items: WebItem[], opts?: { city?: string | null; state?: string | null }): string | null {
  const name = norm(leadName);
  if (!name) return null;
  const geoCity = opts?.city ? norm(opts.city) : "";
  const tokens = name.split(/\s+/).filter((t) => t.length >= 4);
  const strong = name.split(/\s+/).filter((t) => t.length >= 6);
  if (tokens.length === 0) return null;

  let best: { handle: string; score: number; why: string } | null = null;
  for (const item of items) {
    if (hostOf(item.url) !== "instagram.com") continue;
    const rawHandle = extractInstagramFromText(item.url);
    if (!rawHandle) continue;
    const handle = norm(rawHandle);
    const title = norm(item.title ?? "");
    const desc = norm(item.description ?? "");
    const context = `${title} ${desc}`;
    let score = 0;
    // Handle contém token forte do nome (ex.: petcareguarulhos ⊃ petcare).
    if (strong.some((t) => handle.includes(t))) score = 95;
    const matchedTitle = tokens.filter((t) => context.includes(t));
    if (matchedTitle.length >= 2) score = Math.max(score, 75);
    // Sinal combinado NOME + CIDADE: 1 token do nome E a cidade no contexto —
    // resolve casos com múltiplos resultados parecidos (rede/filial).
    if (score === 0 && geoCity) {
      const oneName = tokens.some((t) => context.includes(t));
      if (oneName && context.includes(geoCity)) score = 70;
    }
    if (score >= 70 && (!best || score > best.score)) {
      best = { handle: rawHandle, score, why: matchedTitle.join("_") || handle };
    }
  }
  return best?.handle ?? null;
}

// Extrai contatos do conteúdo de uma página. Só aceita telefone/whatsapp se a
// página mencionar a cidade/estado alvo (não aceita contato de outra cidade).
// Quando `requireGeo=false` (página oficial já confirmada pela fonte — Google/
// OSM ou domínio próprio do negócio), o telefone/whatsapp são aceitos porque a
// localização já veio da fonte estruturada; o Instagram sempre é extraído.
export function extractContactsFromMarkdown(md: string, city: string, state: string, opts?: { requireGeo?: boolean }): { phone: string | null; whatsapp: string | null; instagram: string | null; geoConfirmed: boolean; whatsappEvidence: "link" | "label" | "mobile" | null } {
  const requireGeo = opts?.requireGeo ?? true;
  const geoConfirmed = textMentionsGeo(md, city, state);
  const phone = extractPhoneBR(md);
  const explicitWa = extractWhatsAppExplicit(md);
  const whatsappRaw = explicitWa ?? extractWhatsappBR(md);
  const instagram = extractInstagramFromText(md);
  const trust = !requireGeo && (phone !== null || whatsappRaw !== null);
  const accepted = geoConfirmed || trust;
  const evidence: "link" | "label" | "mobile" | null = explicitWa
    ? (md.includes("wa.me") || md.includes("wa.link") || md.includes("api.whatsapp.com") ? "link" : "label")
    : whatsappRaw ? "mobile" : null;
  return { phone: accepted ? phone : null, whatsapp: accepted ? whatsappRaw : null, instagram, geoConfirmed: geoConfirmed || trust, whatsappEvidence: accepted ? evidence : null };
}

export interface EnrichSummary {
  webRawTavily: number;
  webRawFirecrawl: number;
  websitesEnriched: number;
  scrapeAttempted: number;
  contactsApplied: number;
}

export interface PublicLeadLike {
  name?: string | null;
  website?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  city?: string | null;
  state?: string | null;
  has_website?: boolean;
  score_reasons?: string[];
  /** Proveniência segura: campo -> fonte (ex.: whatsapp → website oficial). */
  sources?: Record<string, string>;
  [key: string]: unknown;
}

// Roda Tavily e Firecrawl (busca) em paralelo; falha de um não derruba o outro.
export async function runWebSources(opts: {
  query: string;
  limit?: number;
  call: WebCaller;
}): Promise<WebBundle> {
  const { query, limit = 8, call } = opts;
  const [tavily, firecrawl] = await Promise.allSettled([
    call("tavily", { query, limit }),
    call("firecrawl", { query, limit }),
  ]);
  const tv = tavily.status === "fulfilled" ? tavily.value : { ok: false };
  const fc = firecrawl.status === "fulfilled" ? firecrawl.value : { ok: false };
  return {
    tavily: tv.ok ? normalizeItemList(tv.results, "tavily") : [],
    firecrawl: fc.ok ? normalizeItemList(fc.results, "firecrawl") : [],
  };
}

// Aplica o enriquecimento web sobre os leads geo-confirmados. Nunca cria lead
// novo, nunca remove lead e nunca lança (falhas viram summary.error? retorna ok).
export async function enrichLeadsWithWeb(opts: {
  leads: PublicLeadLike[];
  web: WebBundle;
  city: string;
  state: string;
  scrape?: (url: string) => Promise<string | null>;
  maxScrape?: number;
}): Promise<{ leads: PublicLeadLike[]; summary: EnrichSummary & { error?: string } }> {
  const { leads, web, city, state, scrape, maxScrape = 2 } = opts;
  const summary: EnrichSummary & { error?: string } = {
    webRawTavily: web.tavily.length,
    webRawFirecrawl: web.firecrawl.length,
    websitesEnriched: 0,
    scrapeAttempted: 0,
    contactsApplied: 0,
  };

  const items = [...web.tavily, ...web.firecrawl];
  if (leads.length === 0) return { leads, summary };

  const seenDomain = new Set<string>();
  const toScrape: Array<{ lead: PublicLeadLike; url: string; trustGeo: boolean }> = [];

  for (const lead of leads) {
    const name = typeof lead.name === "string" ? lead.name : "";
    if (!name.trim()) continue;

    // (5.31) Instagram do próprio negócio também sai dos RESULTADOS de busca —
    // nunca "chuta" (exige sinal do nome no título/handle).
    if (!lead.instagram) {
      const ig = matchInstagramHandle(name, items, { city, state });
      if (ig) {
        lead.instagram = ig;
        const reasons = Array.isArray(lead.score_reasons) ? [...lead.score_reasons] : [];
        reasons.push("Instagram → pesquisa web");
        lead.score_reasons = reasons;
        const src = (lead.sources as Record<string, string> | undefined) ?? {};
        src.instagram = "pesquisa web";
        lead.sources = src;
      }
    }

    // Lead JÁ COM website (ex.: veio do Google Places/OSM): o site oficial era
    // ignorado e o Instagram/contatos nunca eram extraídos. Agora o site oficial
    // entra na fila de enriquecimento (geografia já confiável pela fonte).
    if (lead.website) {
      const d = hostOf(lead.website);
      if (d) seenDomain.add(d);
      const needsContact = (!lead.phone && !lead.whatsapp) || !lead.instagram;
      if (scrape && needsContact && toScrape.length < maxScrape) {
        toScrape.push({ lead, url: lead.website, trustGeo: true });
      }
      continue;
    }

    const match = matchLeadWebsite(name, items);
    if (!match) continue;
    if (seenDomain.has(match.domain)) continue;
    seenDomain.add(match.domain);
    lead.website = match.website;
    lead.has_website = true;
    const reasons = Array.isArray(lead.score_reasons) ? [...lead.score_reasons] : [];
    reasons.push(`Site encontrado via web (${match.evidence})`);
    lead.score_reasons = reasons;
    summary.websitesEnriched += 1;
    // Só confia no contato sem texto de cidade quando o DOMÍNIO comprova o nome
    // (senão mantém a exigência de geografia para não misturar filiais).
    const trustGeo = match.evidence.startsWith("dominio_contem");
    if (scrape && (!lead.phone && !lead.whatsapp) && toScrape.length < maxScrape) {
      toScrape.push({ lead, url: match.website, trustGeo });
    }
  }

  for (const item of toScrape) {
    summary.scrapeAttempted += 1;
    try {
      const md = await scrape?.(item.url);
      if (!md) continue;
      const contacts = extractContactsFromMarkdown(md, city, state, { requireGeo: !item.trustGeo });
      const reasons = Array.isArray(item.lead.score_reasons) ? [...item.lead.score_reasons] : [];
      const src = (item.lead.sources as Record<string, string> | undefined) ?? {};
      const origin = item.trustGeo ? "website oficial" : "website";
      if (contacts.whatsapp && !item.lead.whatsapp) {
        item.lead.whatsapp = contacts.whatsapp;
        src.whatsapp = `${origin} (${contacts.whatsappEvidence === "mobile" ? "número móvel" : "evidência explícita de WhatsApp"})`;
        reasons.push(`WhatsApp → ${src.whatsapp}`);
      }
      if (contacts.phone && !item.lead.phone) {
        item.lead.phone = contacts.phone;
        src.phone = `${origin} (telefone)`;
        reasons.push(`Telefone → ${src.phone}`);
      }
      if (contacts.instagram && !item.lead.instagram) {
        item.lead.instagram = contacts.instagram;
        src.instagram = `${origin} (link na página)`;
        reasons.push(`Instagram → ${src.instagram}`);
      }
      if (contacts.whatsapp || contacts.phone || contacts.instagram) {
        summary.contactsApplied += 1;
        item.lead.sources = src;
        item.lead.score_reasons = reasons;
      }
    } catch {
      // scrape nunca quebra a busca
    }
  }

  return { leads, summary };
}

function hostOfBanned(url: string): boolean {
  const h = hostOf(url);
  return !h || BLOCKED_HOSTS.has(h);
}
export { hostOf, hostOfBanned };
