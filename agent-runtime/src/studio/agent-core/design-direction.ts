// Direção de Arte (primeira geração do React Studio).
//
// Objetivo: em vez de "mais instruções genéricas", o Coder recebe um BRIEFING de
// direção de arte CONCRETO e específico daquele negócio — arquétipo, composição de
// hero, grid, ritmo, tratamento de imagem, movimento, escala tipográfica e estilo
// de CTA — escolhido DETERMINISTICAMENTE pela identidade do projeto (mesmo negócio
// → direção estável; negócios diferentes → direções diferentes). Puro e testável.
//
// A IA continua decidindo os detalhes (paleta exata, fontes, conteúdo); o briefing
// apenas impede que todo cliente receba o MESMO "site de blocos".

export interface DesignBusiness {
  name?: string | null;
  segment?: string | null;
  category?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  /** Fotos REAIS do negócio (URLs) — mudam a estratégia visual. */
  photos?: string[];
  /** Cores de identidade JÁ existentes (ex.: do site atual) — preservar. */
  brandColors?: string[];
  /** Serviços informados (entram no plano de seções quando existirem). */
  services?: string[];
}

export interface DesignDirection {
  /** Identidade técnica do negócio (hash estável) — base da variação. */
  seed: string;
  /** Personalidade de marca derivada do SEGMENTO (não do gosto do modelo). */
  personality: string;
  archetype: string;
  heroComposition: string;
  grid: string;
  imageTreatment: string;
  rhythm: string;
  motion: string;
  typeScale: string;
  ctaStyle: string;
  density: string;
  /** FASE 3 — conceito visual em uma linha (consequência do contexto). */
  visualConcept: string;
  /** FASE 3 — plano de seções DESTE negócio (diferenciação estrutural). */
  sectionPlan: string[];
  /** FASE 3 — estratégia de imagem (fotos reais vs composição sem foto). */
  imageStrategy: string;
  /** FASE 3 — cores de identidade preservadas (quando existirem). */
  brandColors: string[];
  /** FASE 3 — por que esta direção evita o "site de IA". */
  differentiationRationale: string;
  /** Clichês específicos a evitar nesta direção. */
  avoid: string[];
  /** Bloco textual pronto para o prompt. */
  block: string;
}

export const ART_DIRECTION_MARKER = "ART-DIRECTION:";

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(arr: readonly T[], seed: string, salt: string): T {
  return arr[hash(`${seed}::${salt}`) % arr.length];
}

const ARCHETYPES = [
  "editorial", "cinematic", "architectural", "boutique", "technical",
  "warm-human", "bold-contrast", "minimal-lux",
] as const;

const HERO_COMPOSITIONS = [
  "assimétrico com texto lateral e imagem dominante",
  "foto full-bleed com tipografia sobreposta e gradiente sutil",
  "hero dividido em duas colunas com proporções diferentes",
  "editorial deslocado (título grande fora do eixo + imagem recortada)",
  "blocos sobrepostos com profundidade e CTA integrado",
  "tipografia dominante à esquerda e recorte fotográfico à direita",
] as const;

const GRIDS = [
  "grid assimétrico (colunas de larguras diferentes)",
  "grid editorial de 12 colunas com offset à esquerda",
  "duas colunas com imagem maior que o texto",
  "composição que quebra o grid em 1–2 pontos intencionais",
  "margens amplas com bloco de conteúdo deslocado do centro",
] as const;

const IMAGE_TREATMENTS = [
  "editorial", "documental", "arquitetônico", "detalhe", "produto", "textura",
] as const;

const RHYTHMS = [
  "impacto → respiro → conteúdo → respiro → comercial",
  "abertura densa → seções médias → fechamento comercial amplo",
  "alterna blocos compactos e blocos de viewport inteira",
  "começa editorial e evolui para blocos densos de informação",
] as const;

const MOTIONS = ["sem movimento", "revelação sutil na entrada", "micro-hover em cards e botões"] as const;

const TYPE_SCALES = [
  "display-led (títulos muito grandes contra corpo pequeno)",
  "mixo serif de título + sans no corpo",
  "geométrica moderna com pesos contrastantes",
] as const;

const CTA_STYLES = [
  "CTA integrado à composição do hero + banda comercial no meio",
  "um CTA primário claro repetido com a MESMA linguagem, sem 'Saiba mais'",
  "CTA contextual por seção (linguagem específica do negócio)",
] as const;

const DENSITIES = ["aerada", "equilibrada", "densa com âncoras visuais"] as const;

interface Personality {
  label: string;
  traits: string;
  palette: string;
  trust: string;
  focus: string;
  avoid: string[];
}

const DEFAULT_PERSONALITY: Personality = {
  label: "profissional e claro",
  traits: "credibilidade, clareza, serviço",
  palette: "neutra com 1 cor de acento, contraste bem resolvido",
  trust: "competência demonstrada (serviços, atendimento, localização)",
  focus: "serviço principal, diferenciais e contato",
  avoid: ["frases corporativas vazias", "cards todos iguais"],
};

const PERSONALITIES: Array<{ match: RegExp; p: Personality }> = [
  {
    // Odontologia: editorial/clínico-premium (não "azul hospitalar").
    match: /odont|dentist|dentária|dentaria|ortodont|implante|prótese|protese/i,
    p: {
      label: "odontológico editorial",
      traits: "elegância, precisão, confiança, sofisticação silenciosa",
      palette: "base clara (marfim/off-white) + neutros frios + UM acento premium (grafite, verde-sálvia ou dourado discreto); evitar azul-hospital genérico",
      trust: "fotografia limpa e humana do consultório/equipe, endereço e agendamento visíveis",
      focus: "tratamentos/tecnologia com hierarquia editorial e CTA de avaliação",
      avoid: ["azul hospitalar", "ícones de dente repetidos", "cards idênticos de serviços", "caras de SaaS/dashboard", "título gigante + botão + imagem"],
    },
  },
  {
    // Massoterapia/wellness/spa: sensorial, boutique. (ANTES de "terapia": o termo
    // "Massoterapia" contém "terapia" — o específico precisa vir primeiro.)
    match: /massoterap|massagem|wellness|spa|estétic|estetic|relax|bem-estar|bem estar|aromaterap|terapias corporais/i,
    p: {
      label: "sensorial e boutique",
      traits: "atmosfera, textura, calma, cuidado com o corpo",
      palette: "naturais e quentes (bege, areia, terracota, verde-oliva) com textura sutil; sem cores sintéticas",
      trust: "fotografia de ambiente e detalhe (toalhas, óleos, mãos), clima acolhedor e localização",
      focus: "experiência/rituais, atmosfera e agendamento por WhatsApp",
      avoid: ["estética de clínica fria", "ícones genéricos de folha", "blocos simétricos iguais", "cores neon"],
    },
  },
  {
    // Psicologia/terapia: humano, acolhedor, silencioso.
    match: /psic|psicolog|psiquiatr|ansiedade|depress|acolh|terapeuta|terapêut/i,
    p: {
      label: "humano e acolhedor",
      traits: "escuta, confiança, calma, presença humana",
      palette: "naturais/terrosas e claras (areia, oliva, terracota suave); contraste baixo e confortável",
      trust: "confiança ANTES de venda: quem atende, como funciona o processo, sigilo e acolhimento",
      focus: "apresentação humana, como funciona a terapia e um CTA gentil de conversa",
      avoid: ["venda agressiva", "estética de aplicativo", "ícones de cérebro/lâmpada", "gradientes vibrantes", "excesso de cards"],
    },
  },
  {
    match: /clínic|clinic|medic|saúde|saude|dermat|fono|fisiot|hospital|laborat/i,
    p: {
      label: "clínico-premium",
      traits: "confiança, precisão, limpeza, cuidado",
      palette: "clara e neutra com um acento sóbrio; nada de saturação",
      trust: "rigor técnico, ambiente acolhedor e endereço/localização visíveis",
      focus: "especialidades/serviços, confiança e agendamento",
      avoid: ["estética de banco de imagens", "ícones genéricos de saúde em excesso", "excesso de gradientes"],
    },
  },
  {
    match: /pet|veterin|animal|banho|tosa/i,
    p: {
      label: "acolhedor e energético",
      traits: "proximidade, cuidado, personalidade",
      palette: "quente/terrosa com acento vivo, contraste amigável",
      trust: "cuidado real, serviços claros e quem cuida",
      focus: "serviços/cuidados, galeria e agendamento",
      avoid: ["aparência infantil exagerada", "cards repetitivos de serviços"],
    },
  },
  {
    match: /restaur|bar|pizza|café|cafe|cafeter|cozinha|gastro|lanche|churrasc|doceria|confeitaria/i,
    p: {
      label: "gastronômico e sensorial",
      traits: "desejo, atmosfera, identidade",
      palette: "quente ou escura com acento; contraste de apetite",
      trust: "fotos reais de prato/ambiente e localização",
      focus: "destaques do menu/ambiente, localização e reserva/pedido",
      avoid: ["fotos genéricas de comida", "menu inventado com preços falsos"],
    },
  },
  {
    match: /advog|jurídic|juridic|escritório de advoc|contabil|contábil|consultoria/i,
    p: {
      label: "sóbrio e institucional",
      traits: "autoridade, discrição, solidez",
      palette: "escura/neutra com acento contido",
      trust: "áreas de atuação, sobriedade e contato profissional",
      focus: "áreas de atuação e credibilidade (sem inventar números/prêmios)",
      avoid: ["promessas de resultado", "selos/prêmios inventados"],
    },
  },
  {
    match: /academia|fitness|personal|cross|muscula|pilates|dança|luta|esporte/i,
    p: {
      label: "atlético e enérgico",
      traits: "força, movimento, superação",
      palette: "alto contraste (escuro + acento vibrante)",
      trust: "estrutura, modalidades e resultados reais quando existirem",
      focus: "modalidades, estrutura e CTA de aula/plano",
      avoid: ["clichê de 'shape perfeito'", "glow/neon exagerado"],
    },
  },
  {
    match: /imobili|imóve|imove|corretor|incorpora|arquitet|constru/i,
    p: {
      label: "arquitetônico e editorial",
      traits: "espaço, sofisticação, permanência",
      palette: "neutra sofisticada com acento discreto",
      trust: "fotografia dominante do imóvel/obra e localização",
      focus: "imóveis/portfólio, diferenciais e contato",
      avoid: ["cards idênticos por imóvel", "tipografia fraca"],
    },
  },
  {
    match: /eletric|elétrica|eletrica|hidrául|hidraul|obra|reforma|pintur|engenharia|serralher|marcenaria|climatiza|ar-condicionado/i,
    p: {
      label: "técnico e confiável",
      traits: "competência, agilidade, segurança",
      palette: "contraste forte, tom industrial com acento de sinalização",
      trust: "serviços claros, atendimento rápido e área atendida",
      focus: "serviços, atendimento 24h/quando real e CTA direto (orçamento)",
      avoid: ["decoração sem função", "ícones aleatórios em excesso"],
    },
  },
  {
    match: /beleza|salão|salao|barbear|estétic|estetic|manicure|makeup|sobrancelha|depila|cabelo/i,
    p: {
      label: "sofisticado e pessoal",
      traits: "estilo, cuidado, autoestima",
      palette: "neutra com acento elegante; contraste refinado",
      trust: "resultado real (galeria) e agendamento simples",
      focus: "serviços, galeria de resultados e agendamento",
      avoid: ["excesso de brilho/glow", "cards iguais de procedimentos"],
    },
  },
];

export function personalityFor(segment: string, seed?: string): Personality {
  const compat = PERSONALITIES.filter(({ match }) => match.test(segment));
  if (compat.length === 0) return DEFAULT_PERSONALITY;
  // DETERMINÍSTICO POR CLIENTE (não por segmento): dois clientes do MESMO segmento
  // podem receber personalidades diferentes (dentro das compatíveis com o segmento)
  // — evita que todos os sites do mesmo ramo tenham a mesma "cara".
  if (!seed || compat.length === 1) return compat[0].p;
  return pick(compat, seed, "personality").p;
}

// FASE 3 — hero/estratégia quando existem FOTOS REAIS (o negócio é o visual).
const PHOTO_LED_HEROES = [
  "foto real full-bleed com tipografia sobreposta e gradiente apenas para legibilidade",
  "hero assimétrico com a foto real dominante (2/3) e bloco de texto curto",
  "abertura com foto real em sangria + faixa de prova (endereço/atendimento) logo abaixo",
] as const;

/**
 * FASE 3 — cores de identidade JÁ existentes no projeto (somente variáveis
 * declaradas: --primary/--accent/--brand...). Determinístico; nunca inventa.
 */
export function extractBrandColors(files: Record<string, string> | null | undefined): string[] {
  if (!files) return [];
  const out = new Set<string>();
  for (const content of Object.values(files)) {
    if (typeof content !== "string") continue;
    for (const m of content.matchAll(/--(?:primary|accent|brand|brand-color|cor-primaria|cor-principal|destaque)[a-z-]*\s*:\s*([^;}\n]+)/gi)) {
      for (const hex of (m[1] ?? "").matchAll(/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/gi)) out.add(hex[0].toLowerCase());
    }
  }
  return [...out].slice(0, 6);
}

/** FASE 3 — plano de seções derivado do contexto (estrutural, não template). */
function buildSectionPlan(p: Personality, business: DesignBusiness, realPhotos: boolean, seed: string): string[] {
  const seg = `${business.segment ?? ""} ${business.category ?? ""}`.toLowerCase();
  const abrir: string[] = ["Abertura (hero) — composição do hero da direção"];
  const meio: string[] = [];
  if (realPhotos) meio.push("Prova visual: galeria/ambiente com as fotos REAIS do negócio");
  if ((business.services ?? []).length > 0) meio.push(`Serviços reais informados (${(business.services ?? []).slice(0, 4).join(", ")})`);
  if (/usinag|metalog|industrial|engenharia|máquina|maquina|fabrica|fábrica|precis/i.test(seg)) {
    meio.push("Capacidades e especificações técnicas (o que a operação executa de verdade)");
    meio.push("Processo/qualidade (método, tolerância, controle) — sem números inventados");
  } else if (/restaurant|restaurante|pizzaria|bar|lanch|comida|café|cafe|doceria|confeitaria|aliment/i.test(seg)) {
    meio.push("Destaques do cardápio/produtos (sem preços inventados)");
    meio.push("Ambiente e experiência presencial");
  } else if (/clinic|clín|odont|dentist|médic|medic|saúde|saude|terap|psic|estétic|estetic/i.test(seg)) {
    meio.push("Tratamentos/áreas de atendimento com hierarquia editorial");
    meio.push("Prova de confiança: estrutura, equipe e processo (sem depoimentos inventados)");
  } else if (/imobil|corretor|imóvel|imovel|incorpora/i.test(seg)) {
    meio.push("Imóveis/destaques com ficha objetiva (dados reais)");
    meio.push("Região de atuação e processo de atendimento");
  } else if (/transport|logístic|logistic|frete|mudança|mudanca|frota/i.test(seg)) {
    meio.push("Capacidade operacional: frota/alcance/cobertura (apenas dados reais)");
    meio.push("Processo de cotação e acompanhamento");
  } else {
    meio.push(`Destaque principal: ${p.focus}`);
    meio.push("Diferenciais reais e como o cliente é atendido");
  }
  const perto = [business.address, business.city, business.state].filter(Boolean).length > 0;
  const conversao: string[] = [];
  if (perto) conversao.push("Localização/atendimento presencial (endereço e região reais)");
  conversao.push(`Conversão: ${p.trust}`);
  // Duas ordens determinísticas: a direção decide se a prova visual vem antes do
  // detalhamento técnico ou depois (nunca a mesma sequência para todos).
  const provaPrimeiro = hash(`${seed}::ordem`) % 2 === 0;
  const blocos = provaPrimeiro ? [...meio, ...conversao] : [...conversao.slice(0, 1), ...meio, ...conversao.slice(1)];
  return [...abrir, ...blocos];
}

export function buildDesignDirection(business: DesignBusiness, seedSource?: string): DesignDirection {
  const name = String(business?.name ?? "").trim();
  const segment = String(business?.segment ?? business?.category ?? "").trim();
  const city = String(business?.city ?? "").trim();
  const seed = String(seedSource ?? `${name}|${segment}|${city}`).trim() || "prospector";

  const p = personalityFor(`${segment} ${business?.category ?? ""}`, seed);
  const realPhotos = false; // business.photos = LEAD_REFERENCE_ONLY (fotos do Google/Maps): NAO ativam hero fotorrealista nem galeria
  const brandColors = (business?.brandColors ?? []).map((c) => String(c).toLowerCase()).filter((c) => /^#[0-9a-f]{3,6}$/.test(c));

  const archetype = pick(ARCHETYPES, seed, "archetype");
  const heroComposition = realPhotos ? pick(PHOTO_LED_HEROES, seed, "hero-photo") : pick(HERO_COMPOSITIONS, seed, "hero");
  const grid = pick(GRIDS, seed, "grid");
  const imageTreatment = pick(IMAGE_TREATMENTS, seed, "img");
  const rhythm = pick(RHYTHMS, seed, "rhythm");
  const motion = pick(MOTIONS, seed, "motion");
  const typeScale = pick(TYPE_SCALES, seed, "type");
  const ctaStyle = pick(CTA_STYLES, seed, "cta");
  const density = pick(DENSITIES, seed, "density");
  const sectionPlan = buildSectionPlan(p, business, realPhotos, seed);

  const imageStrategy = realPhotos
    ? `priorizar as ${business.photos?.length ?? 0} foto(s) REAIS do negócio (hero/galeria/ambiente) — NÃO substituir por stock, NÃO esconder a operação atrás de gradientes ou ícones`
    : "SEM foto real utilizável: compor com tipografia, cor e estrutura (NUNCA fingir que uma imagem genérica é o negócio; stock ilustrativo só com função comercial clara)";
  const visualConcept = `${p.label} · ${archetype} — ${realPhotos ? "fotografia real como protagonista" : "tipografia e composição como protagonistas"}`;
  const differentiationRationale = `Mesmo dentro do mesmo segmento, esta direção é derivada dos dados deste negócio (${[name, city].filter(Boolean).join(", ") || "contexto atual"}), não de um template: ${p.focus}. Evitar: ${p.avoid.slice(0, 3).join("; ")}.`;

  const avoid = [
    "navbar → hero centralizado → 3 cards → texto+imagem → 4 cards → galeria → depoimentos → CTA (bloco padrão)",
    "todas as seções com o mesmo espaçamento e o mesmo peso visual",
    "tudo centralizado e tudo em cards idênticos",
    "gradientes, blobs, círculos e ícones decorativos sem propósito",
    "clichês de IA: 'soluções inovadoras', 'excelência em atendimento', emojis como design",
    ...p.avoid,
  ];

  const block = ["DIRECAO VISUAL — REFERENCIA, NAO ESPECIFICACAO: voce e o diretor de arte e decide a identidade final; os itens abaixo sao inspiracao/contexto (adapte, combine, substitua ou ignore quando outra solucao servir melhor). Nao e template obrigatorio.",
    "DIREÇÃO CRIATIVA DESTE NEGÓCIO (consequência dos DADOS REAIS deste cliente — obrigatória; NÃO é template e NÃO use a mesma para outro cliente):",
    "- Esta direção é o PONTO DE PARTIDA da SUA análise, não uma ordem fixa: VOCÊ decide a identidade visual (paleta, tipografia, composição, ritmo, imagens e estrutura) a partir do segmento, público, posicionamento e material REAL deste negócio. Ela deve parecer própria deste cliente e DIFERENTE de qualquer outro — inclusive de outro cliente do mesmo segmento.",
    `- Conceito visual: ${visualConcept}.`,
    `- Personalidade da marca: ${p.label} — ${p.traits}.`,
    p.palette ? `- Paleta: ${p.palette}.` : "",
    brandColors.length ? `- IDENTIDADE EXISTENTE (preservar de verdade): ${brandColors.join(", ")} — são as cores do negócio; use como base/acento e NÃO recrie a marca com outra paleta.` : "",
    `- Confiança a transmitir: ${p.trust}.`,
    `- Destaque: ${p.focus}.`,
    `- Arquétipo visual: ${archetype}.`,
    `- Composição do hero: ${heroComposition}.`,
    `- Grid/composição: ${grid}.`,
    `- Imagens: ${imageStrategy} (tratamento: ${imageTreatment} — a imagem PARTICIPA da composição, não é enfeite de card).`,
    `- Ritmo vertical: ${rhythm}.`,
    `- Movimento: ${motion} (sutil, nunca competindo com o conteúdo).`,
    `- Tipografia: ${typeScale}.`,
    `- Estilo de CTA: ${ctaStyle} (linguagem específica do negócio, nunca repetir 'Saiba mais').`,
    `- Densidade: ${density}.`,
    `- ESTRUTURA SUGERIDA (voce decide; pode reordenar, cortar ou criar secoes): ${sectionPlan.join(" → ")}.`,
    `- Por que esta direção: ${differentiationRationale}`,
    `- EVITE: ${avoid.join(" | ")}.`,
    `- ANTES de codar, faça a ANÁLISE: segmento, público, posicionamento, ticket percebido, objetivo comercial, principal dúvida/confiança do cliente.`,
    `- Registre a SUA direcao (voce decide, nao e gabarito) como um comentário em src/App.tsx começando com "${ART_DIRECTION_MARKER}" (arquétipo, paleta em HEX, fontes, hero, grid) - registro da decisao do designer.`,
    "- AUTOCRÍTICA antes de finalizar (se falhar, reestruture a composição, não finalize): sem o nome/logo, ainda parece deste segmento? poderia ser confundido com outro site do mesmo sistema? o hero tem personalidade? as imagens participam? há hierarquia e ritmo? há excesso de cards/seções iguais?",
  ].filter((l) => !!l).join("\n");

  return {
    seed, personality: p.label, archetype, heroComposition, grid, imageTreatment,
    rhythm, motion, typeScale, ctaStyle, density, visualConcept, sectionPlan, imageStrategy, brandColors, differentiationRationale, avoid, block,
  };
}

/** true quando o projeto declara uma direção de arte (comentário marcado). */
export function hasArtDirection(files: Record<string, string> | null | undefined): boolean {
  if (!files || typeof files !== "object") return false;
  for (const [path, content] of Object.entries(files)) {
    if (!/^src\/.*\.(tsx|jsx|css)$/i.test(path)) continue;
    if (typeof content === "string" && content.includes(ART_DIRECTION_MARKER)) return true;
  }
  return false;
}
