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

export function personalityFor(segment: string): Personality {
  for (const { match, p } of PERSONALITIES) if (match.test(segment)) return p;
  return DEFAULT_PERSONALITY;
}

export function buildDesignDirection(business: DesignBusiness, seedSource?: string): DesignDirection {
  const name = String(business?.name ?? "").trim();
  const segment = String(business?.segment ?? business?.category ?? "").trim();
  const city = String(business?.city ?? "").trim();
  const seed = String(seedSource ?? `${name}|${segment}|${city}`).trim() || "prospector";

  const p = personalityFor(`${segment} ${business?.category ?? ""}`);

  const archetype = pick(ARCHETYPES, seed, "archetype");
  const heroComposition = pick(HERO_COMPOSITIONS, seed, "hero");
  const grid = pick(GRIDS, seed, "grid");
  const imageTreatment = pick(IMAGE_TREATMENTS, seed, "img");
  const rhythm = pick(RHYTHMS, seed, "rhythm");
  const motion = pick(MOTIONS, seed, "motion");
  const typeScale = pick(TYPE_SCALES, seed, "type");
  const ctaStyle = pick(CTA_STYLES, seed, "cta");
  const density = pick(DENSITIES, seed, "density");

  const avoid = [
    "navbar → hero centralizado → 3 cards → texto+imagem → 4 cards → galeria → depoimentos → CTA (bloco padrão)",
    "todas as seções com o mesmo espaçamento e o mesmo peso visual",
    "tudo centralizado e tudo em cards idênticos",
    "gradientes, blobs, círculos e ícones decorativos sem propósito",
    "clichês de IA: 'soluções inovadoras', 'excelência em atendimento', emojis como design",
    ...p.avoid,
  ];

  const block = [
    "BRIEFING DE DIREÇÃO DE ARTE (decida a partir do negócio; NÃO é layout pronto):",
    `- Personalidade da marca: ${p.label} — ${p.traits}.`,
    `- Paleta: ${p.palette}.`,
    `- Confiança a transmitir: ${p.trust}.`,
    `- Destaque: ${p.focus}.`,
    `- Arquétipo visual: ${archetype}.`,
    `- Composição do hero: ${heroComposition}.`,
    `- Grid/composição: ${grid}.`,
    `- Tratamento fotográfico: ${imageTreatment} (a imagem PARTICIPA da composição, não é enfeite de card).`,
    `- Ritmo vertical: ${rhythm}.`,
    `- Movimento: ${motion} (sutil, nunca competindo com o conteúdo).`,
    `- Tipografia: ${typeScale}.`,
    `- Estilo de CTA: ${ctaStyle} (linguagem específica do negócio, nunca repetir 'Saiba mais').`,
    `- Densidade: ${density}.`,
    `- EVITE: ${avoid.join(" | ")}.`,
    `- ANTES de codar, faça a ANÁLISE: segmento, público, posicionamento, ticket percebido, objetivo comercial, principal dúvida/confiança do cliente.`,
    `- OBRIGATÓRIO: registre a direção escolhida como um comentário em src/App.tsx começando com "${ART_DIRECTION_MARKER}" (arquétipo, paleta em HEX, fontes, hero, grid) e IMPLEMENTE essa direção de verdade.`,
    "- AUTOCRÍTICA antes de finalizar (se falhar, reestruture a composição, não finalize): sem o nome/logo, ainda parece deste segmento? poderia ser confundido com outro site do mesmo sistema? o hero tem personalidade? as imagens participam? há hierarquia e ritmo? há excesso de cards/seções iguais?",
  ].join("\n");

  return {
    seed, personality: p.label, archetype, heroComposition, grid, imageTreatment,
    rhythm, motion, typeScale, ctaStyle, density, avoid, block,
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
