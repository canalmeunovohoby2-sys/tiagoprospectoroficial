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
  // Enquadramento/zoom/corte/posição NÃO são troca de imagem — é edição visual
  // de CSS (object-fit/object-position/aspect-ratio). Não exigir troca de URL.
  if (/(enquadr|zoom|cortad|cortou|cortar|recort|object-position|object-fit|background-position|background-size|posicion|reposicion|ajust)/i.test(text)) return false;
  return /(troque|troca|trocar|substitua|substitui|substituir)\s+(?:a|as|essa|esta|aquela)?\s*(imagem|foto|fotografia|banner|background)/i.test(text)
    || /(imagem|foto|fotografia|banner|background).*(troque|troca|trocar|substitua|substitui|substituir)/i.test(text);
}

/** FRAMING/CROP/ZOOM: ajustar o enquadramento da imagem EXISTENTE (NÃO trocar). */
export function requestsFramingFix(instruction: string): boolean {
  const t = String(instruction ?? "");
  return /(enquadr|enquadramento|cortad|cortou|cortando|cortar|recort|cabe[çc]a|rosto|sujeito|apare[çc]a|mostre\s+mais|mostrar\s+mais|inteir[ao]|de\s+corpo\s+inteiro|zoom|afast|aproxim|desça\s+a\s+(foto|imagem)|suba\s+a\s+(foto|imagem)|object-position|object-fit|background-position|background-size|posi[cç][ãa]o\s+da\s+(foto|imagem))/i.test(t);
}

/** Pedido PONTUAL (cor/texto/tamanho/framing/posição CSS) — não é redesign. */
const NARROW_INTENT = /(cor|color|paleta|laranja|vermelh|azul|verde|roxo|amarelo|bot[aã]o|btn|fonte|tipograf|tamanho|diminu|aument|margem|margin|padding|espa[çc]|enquadr|cabe[çc]a|rosto|sujeito|inteir|cortad|cortou|recort|zoom|aproxim|afast|posi[cç][ãa]o|object-position|object-fit|background-position|background-size|texto|t[ií]tulo|subt[ií]tulo|frase|palavra)/i;
export function requestsNarrowScope(instruction: string): boolean {
  const t = String(instruction ?? "");
  return NARROW_INTENT.test(t) && !REBUILD_INTENT.test(t);
}

function extractLogoSig(files: SiteFiles): string {
  const out = new Set<string>();
  for (const [path, content] of Object.entries(files ?? {})) {
    for (const m of content.match(/(?:src|href)=["']([^"']*(?:logo|logomarca|brand|marca|favicon)[^"']*)["']/gi) ?? []) out.add(m.toLowerCase());
    for (const m of content.match(/url\(\s*["']?([^"')]*(?:logo|logomarca|brand|marca)[^"')]*)["']?\s*\)/gi) ?? []) out.add(m.toLowerCase());
  }
  return [...out].sort().join("\n");
}

function extractTextSig(files: SiteFiles): string {
  const html = Object.entries(files ?? {}).find(([k]) => k.endsWith("index.html"))?.[1] ?? "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function countChangedFiles(before: SiteFiles, after: SiteFiles): number {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  let n = 0;
  for (const k of keys) if ((before ?? {})[k] !== (after ?? {})[k]) n++;
  return n;
}

/**
 * SCOPE GUARD — para pedidos PONTUAIS (cor/texto/tamanho/framing), detecta
 * alterações FORA DO ESCOPO (imagem/logo/texto/estrutura/arquivos demais) para o
 * agente reverter antes de finalizar. Nunca dispara em redesign explícito.
 */
export function scopeViolations(before: SiteFiles, after: SiteFiles, instruction: string): string[] {
  const ins = String(instruction ?? "");
  if (!requestsNarrowScope(ins)) return [];
  const issues: string[] = [];

  // 1) Imagens trocadas sem pedido de troca (framing/zoom NÃO troca a foto).
  if (hasImageReferenceChange(before, after) && !requestsImageSwap(ins)) {
    issues.push("As referências de IMAGEM mudaram sem você ter pedido troca de foto. Se o pedido era cor/enquadramento/texto, restaure a imagem ORIGINAL (mesmo src/asset) e ajuste apenas o CSS/enquadramento.");
  }
  // 2) Logo/identidade trocados sem pedido.
  const logoSigB = extractLogoSig(before);
  if (logoSigB && logoSigB !== extractLogoSig(after) && !/(logo|logomarca|logotipo|marca|identidade visual)/i.test(ins)) {
    issues.push("O LOGOTIPO/identidade visual foi alterado sem pedido. Restaure o logo original.");
  }
  // 3) Texto/conteúdo visível alterado sem pedido.
  const textB = extractTextSig(before);
  const textA = extractTextSig(after);
  if (textB && textB !== textA && !/(texto|t[ií]tulo|subt[ií]tulo|frase|palavra|copy|conte[uú]do|escrev|reescrev)/i.test(ins)) {
    issues.push("O TEXTO/conteúdo visível mudou sem pedido. Restaure os textos originais — altere apenas a propriedade solicitada.");
  }
  // 4) Estrutura de seções mudou sem pedido.
  const secB = siteMetrics(before).sections;
  const secA = siteMetrics(after).sections;
  if (secB > 0 && secA !== secB && !/(se[çc][ãa]o|secoes|se[çc][õo]es|adicion|remov|reorganiz|estrutur|layout|hero|p[aá]gina)/i.test(ins)) {
    issues.push(`A ESTRUTURA de seções mudou (${secB} → ${secA}) sem pedido. Preserve a estrutura existente.`);
  }
  // 5) Arquivos demais para um pedido pontual.
  const changed = countChangedFiles(before, after);
  if (changed > 3 && !/(todos os arquivos|v[aá]rios arquivos|site inteiro|global|tema inteiro)/i.test(ins)) {
    issues.push(`Muitos arquivos foram alterados (${changed}) para um pedido pontual. Restrinja a alteração ao necessário (arquivo/elemento do pedido).`);
  }
  return issues.slice(0, 4);
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
  styleLinks: number;
  cssVars: number;
  braceBalance: number;
  scripts: number;
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
  // Qualquer arquivo .css do projeto (não só "site.css") + <style> inline.
  const css = Object.entries(files ?? {})
    .filter(([k]) => /\.css$/i.test(k))
    .map(([, v]) => v)
    .join("\n");
  const inlineStyles = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) ?? []).join("\n");
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const styleSheet = `${css}\n${inlineStyles.replace(/<style[^>]*>/gi, "").replace(/<\/style>/gi, "")}`;
  const opens = (styleSheet.match(/\{/g) ?? []).length;
  const closes = (styleSheet.match(/\}/g) ?? []).length;
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
    styleLinks: (html.match(/<link[^>]+rel=["']stylesheet["']/gi) ?? []).length,
    cssVars: (styleSheet.match(/--[a-z0-9_-]+\s*:/gi) ?? []).length,
    braceBalance: opens - closes,
    scripts: (html.match(/<script[\s>]/gi) ?? []).length,
  };
}

// Compara antes/depois e devolve problemas de regressão (objetivos e graves).
// Reconstruções EXPLÍCITAS ("reescreva do zero") não passam pelo guard.
export function editRegressionIssues(before: SiteFiles, after: SiteFiles, instruction: string): string[] {
  const ins = String(instruction ?? "");
  // FASE 7 — Reconstruções EXPLÍCITAS relaxam a PRESERVAÇÃO ESTRUTURAL, mas
  // NUNCA as checagens críticas de saúde (stylesheet/chaves/scripts) mais abaixo.
  const rebuild = REBUILD_INTENT.test(ins);
  const b = siteMetrics(before);
  const a = siteMetrics(after);
  const issues: string[] = [];

  if (!rebuild) {
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
  } // fim do bloco !rebuild

  // 9) <link rel="stylesheet"> removido — sem ele o CSS/tema inteiro deixa de aplicar.
  if (b.styleLinks >= 1 && a.styleLinks === 0 && !REMOVAL.test(ins)) {
    issues.push(`O <link rel="stylesheet"> foi removido (${b.styleLinks} → 0). Restaure o vínculo com o CSS — sem ele o layout/tema para de aplicar.`);
  }

  // 10) Chaves CSS desbalanceadas (regra quebrada derruba o layout a partir do erro).
  if (b.braceBalance === 0 && a.braceBalance !== 0) {
    issues.push(`O CSS ficou com chaves desbalanceadas (${a.braceBalance > 0 ? "+" : ""}${a.braceBalance}). Corrija a regra quebrada — a partir do erro o CSS deixa de aplicar e ícones/seções quebram.`);
  }

  // 11) Variáveis CSS do tema (--...) removidas.
  if (!rebuild && b.cssVars >= 3 && a.cssVars < b.cssVars && !/variave|token|tema|remov|apag|delete|tirar/i.test(ins)) {
    issues.push(`Variáveis CSS (--...) do tema foram removidas (${b.cssVars} → ${a.cssVars}). Restaure as variáveis (cores/tokens) para preservar a identidade visual.`);
  }

  // 12) Scripts existentes removidos.
  if (b.scripts >= 1 && a.scripts === 0 && !/script|remov|apag|delete|tirar/i.test(ins)) {
    issues.push("Os scripts (<script>) do site foram removidos. Restaure os comportamentos existentes.");
  }

  return issues.slice(0, 6);
}
