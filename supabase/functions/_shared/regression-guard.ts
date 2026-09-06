// Edit Regression Guard (5.30) — protege um site EXISTENTE durante edições.
// Princípio: EDITAR ≠ RECONSTRUIR. Detecta regressões objetivas e catastróficas
// entre o estado anterior e o resultado de uma edição (perda de layout, imagens,
// seções, navegação, footer, efeitos, CTAs, conteúdo, responsividade) e devolve
// problemas para o agente corrigir/restaurar antes de finalizar.
// Puro e compartilhado entre o runtime (Node) e a edge function (Deno).

export type SiteFiles = Record<string, string>;

// URLs de imagem usadas no projeto (html <img> e background url() no CSS), sem
// data URIs — usado para comprovar troca REAL de imagem (não aceitar "fingir").
export function extractImageUrls(files: SiteFiles): string[] {
  const out = new Set<string>();
  for (const [path, content] of Object.entries(files ?? {})) {
    const isCss = /\.css$/i.test(path);
    const srcs = content.match(/src=["']([^"']+)["']/gi) ?? [];
    for (const s of srcs) {
      const u = s.replace(/^src=["']|["']$/g, "");
      if (u && !u.startsWith("data:image")) out.add(u);
    }
    const urls = isCss ? content.match(/url\(\s*["']?([^"')]+)["']?\s*\)/gi) ?? [] : [];
    for (const u of urls) {
      const clean = u.replace(/^url\(\s*["']?|["']?\s*\)$/gi, "");
      if (clean && !clean.startsWith("data:")) out.add(clean);
    }
  }
  return [...out].sort();
}

/** Houve troca real: o CONJUNTO de referências de imagem mudou entre antes/depois. */
export function hasImageReferenceChange(before: SiteFiles, after: SiteFiles): boolean {
  const a = extractImageUrls(before).join("\n");
  const b = extractImageUrls(after).join("\n");
  return a !== b;
}

/** Detector de intenção explícita de troca/substituição de imagem. */
export function requestsImageSwap(instruction: string): boolean {
  const text = String(instruction ?? "").trim();
  if (!text) return false;
  return /(troque|troca|trocar|substitua|substitui|substituir|altere)\s+(?:a|a[s]|essa|esta|aquela)?\s*(imagem|foto|fotografia|banner|background)/i.test(text)
    || /(imagem|foto|fotografia|banner|background).*(troque|troca|trocar|substitua|substitui|substituir|altere)/i.test(text);
}

export interface SiteMetrics {
  contentLen: number;
  imgTags: number;
  sections: number;
  headings: number;
  navLinks: number;
  hasFooter: boolean;
  mediaQueries: number;
  keyframes: number;
  motionRules: number;
  hasH1: boolean;
  ctaLinks: number;
  colorCount: number;
}

function fileOf(files: SiteFiles, suffix: string): string {
  const key = Object.keys(files).find((k) => k.endsWith(suffix));
  return key ? files[key] : "";
}

const REBUILD_INTENT = /reconstru|reescrev[ae]\s+(tudo|o site|o arquivo|do zero)|refa[çc]a\s+(tudo|o site|do zero)|redesign completo|remova\s+tudo|apague\s+tudo|do zero|come[çc]e\s+(de|do) novo/i;
const REMOVAL = /remov|apag|apague|tirar?|tira|delete|exclu[ií]/i;

function navIntent(instruction: string): boolean {
  return /(nav|menu)/i.test(instruction) && REMOVAL.test(instruction);
}
function imgIntent(instruction: string): boolean {
  return /(imag|foto|fotograf|figur|galeri)/i.test(instruction) && REMOVAL.test(instruction);
}
function footerIntent(instruction: string): boolean {
  return /(footer|rodap[ée])/i.test(instruction) && REMOVAL.test(instruction);
}
function effectIntent(instruction: string): boolean {
  return /(efeit|anima[cç]|transi[cç]|hover|microintera[cç])/i.test(instruction) && REMOVAL.test(instruction);
}
function ctaIntent(instruction: string): boolean {
  return /(cta|bot[aã]o|bot[aã]oes|btn)/i.test(instruction) && REMOVAL.test(instruction);
}
function headingIntent(instruction: string): boolean {
  return /(t[ií]tul|hero|h1)/i.test(instruction) && REMOVAL.test(instruction);
}
function responsiveIntent(instruction: string): boolean {
  return /(responsiv|@?media|mobile)/i.test(instruction) && REMOVAL.test(instruction);
}

export function siteMetrics(files: SiteFiles): SiteMetrics {
  const html = fileOf(files, "index.html");
  const css = fileOf(files, "site.css");
  const inlineStyles = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) ?? []).join("\n");
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const styleSheet = `${css}\n${inlineStyles.replace(/<style[^>]*>/gi, "").replace(/<\/style>/gi, "")}`;
  return {
    contentLen: text.length,
    imgTags: (html.match(/<img[^>]+src=/gi) ?? []).length,
    sections: (html.match(/<section[^>]*>/gi) ?? []).length,
    headings: (html.match(/<h[1-6][^>]*>/gi) ?? []).length,
    navLinks: (html.match(/<nav[\s\S]*?<\/nav>/gi) ?? []).join(" ").match(/<a[\s>]/gi)?.length ?? 0,
    hasFooter: /<footer[\s\S]*?<\/footer>/i.test(html) || /<\/footer>/i.test(html),
    mediaQueries: (styleSheet.match(/@media/gi) ?? []).length,
    keyframes: (styleSheet.match(/@keyframes/gi) ?? []).length,
    motionRules: (styleSheet.match(/@keyframes|animation:|transition:|backdrop-filter|transform:/gi) ?? []).length,
    hasH1: /<h1[\s>]/i.test(html),
    ctaLinks: (html.match(/(class="[^"]*(cta|btn)[^"]*"|href="[^"]*(whatsapp|wa\.me|agendar|reservar|matricul)[^"]*")/gi) ?? []).length,
    colorCount: new Set((styleSheet.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((c) => c.toLowerCase())).size,
  };
}

// Compara antes/depois e devolve problemas de regressão (objetivos e graves).
// Reconstruções EXPLÍCITAS ("reescreva do zero") não passam pelo guard.
export function editRegressionIssues(before: SiteFiles, after: SiteFiles, instruction: string): string[] {
  const ins = String(instruction ?? "");
  if (REBUILD_INTENT.test(ins)) return [];
  const b = siteMetrics(before);
  const a = siteMetrics(after);
  const issues: string[] = [];

  // 1) Conteúdo desapareceu de forma drástica (>55% do texto).
  if (b.contentLen > 600 && a.contentLen < b.contentLen * 0.45 && !REMOVAL.test(ins)) {
    issues.push(`O conteúdo do site encolheu drasticamente (${b.contentLen.toLocaleString("pt-BR")} → ${a.contentLen.toLocaleString("pt-BR")} caracteres). Uma edição deve PRESERVAR o conteúdo existente — restaure as seções/textos que sumiram ou faça uma edição localizada.`);
  }

  // 2) Imagens sumiram em massa.
  if (b.imgTags >= 3 && a.imgTags < Math.ceil(b.imgTags * 0.5) && !imgIntent(ins)) {
    issues.push(`Imagens do site sumiram (${b.imgTags} → ${a.imgTags}). Preserve as imagens existentes — remova/substitua somente as que o pedido envolve.`);
  } else if (b.imgTags >= 2 && a.imgTags === 0 && !imgIntent(ins)) {
    issues.push(`Todas as imagens foram removidas (${b.imgTags} → 0). Restaure as imagens do site.`);
  }

  // 3) Navegação perdida.
  if (b.navLinks >= 3 && a.navLinks < 2 && !navIntent(ins)) {
    issues.push(`A navegação (<nav>) foi perdida ou esvaziada (${b.navLinks} → ${a.navLinks} links). Restaure o menu/navegação original.`);
  }

  // 4) Footer removido.
  if (b.hasFooter && !a.hasFooter && !footerIntent(ins)) {
    issues.push("O rodapé (<footer>) foi removido. Restaure o rodapé com a marca/contato existentes.");
  }

  // 5) Responsividade perdida (todas as @media removidas).
  if (b.mediaQueries >= 1 && a.mediaQueries === 0 && !responsiveIntent(ins)) {
    issues.push("As regras responsivas (@media) foram removidas. Restaure a responsividade mobile/tablet/desktop.");
  }

  // 6) Efeitos/animações perdidos.
  if (b.keyframes >= 1 && a.keyframes === 0 && !effectIntent(ins)) {
    issues.push(`As animações (@keyframes) foram removidas (${b.keyframes} → 0). Restaure as animações/efeitos existentes.`);
  } else if (b.keyframes >= 2 && a.keyframes < Math.ceil(b.keyframes / 2) && !effectIntent(ins)) {
    issues.push(`Mais da metade das animações (@keyframes) sumiu (${b.keyframes} → ${a.keyframes}). Restaure as animações/efeitos existentes.`);
  }
  if (b.motionRules >= 5 && a.motionRules < Math.ceil(b.motionRules / 2) && !effectIntent(ins)) {
    issues.push(`Muitos efeitos visuais foram removidos (transições/animações/transform: ${b.motionRules} → ${a.motionRules}). Preserve as animações, transições e efeitos existentes.`);
  }

  // 7) CTA principal perdido.
  if (b.ctaLinks >= 1 && a.ctaLinks === 0 && !ctaIntent(ins)) {
    issues.push("Nenhum CTA (botão/whatsapp/agendar) restou no site. Restaure os CTAs de conversão.");
  }

  // 8) Título/hero principal perdido.
  if (b.hasH1 && !a.hasH1 && !headingIntent(ins)) {
    issues.push("O título principal (h1/hero) foi removido. Restaure o título principal do site.");
  }

  return issues.slice(0, 4);
}
