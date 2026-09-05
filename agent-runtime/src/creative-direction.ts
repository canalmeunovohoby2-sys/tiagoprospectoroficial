// Creative Direction (5.25) — direção criativa POR NEGÓCIO, computada
// deterministicamente antes do Cline escrever. Não é template rígido: é um
// brief (arquétipo, paleta, tipografia, arquitetura por papel, imagem, copy)
// que o agente adapta ao que encontrar. Garante que "entender antes de
// escrever" aconteça de forma sistemática — não depende da vontade do modelo.
// Puro e testável.

export interface CreativeBrief {
  businessName: string;
  segment: string;
  position: string;             // percepção desejada
  sensation: string;            // sensação/emoção
  archetype: string;            // direção visual
  paletteHint: string;
  typeHint: string;
  heroStrategy: string;
  architecture: string[];       // 3 arquiteturas possíveis (por papel), variadas
  imageQueries: Record<string, string>; // papel -> query contextual
  copyDirection: string;
  antiTemplate: string;         // o que evitar neste segmento
}

// Direções por nicho (sem ser "template único" — fornece linguagem e papéis).
// Quando o segmento não casa, usamos fallback genérico derivado do nome.
const NICHES: Array<{
  match: RegExp;
  position: string; sensation: string; archetype: string;
  paletteHint: string; typeHint: string; heroStrategy: string;
  architecture: string[]; copyDirection: string; antiTemplate: string;
  imageQueries: Record<string, string>;
}> = [
  {
    match: /academ|fitness|muscula|treino|pilates|crossfit|gin[aá]stica|personal/i,
    position: "performance + transformação + energia",
    sensation: "força, disciplina e conquista",
    archetype: "Bold / Performance premium",
    paletteHint: "grafite profundo, preto, um acento vibrante (laranja/verde-limão)",
    typeHint: "sans geométrica forte (Exo/Space Grotesk) com pesos altos",
    heroStrategy: "hero de impacto com imagem de treino/espaço, headline de resultado",
    architecture: [
      "hero de energia → experiência/conceito → modalidades (espaços) → diferenciais → planos/CTA",
      "hero statement → método/treino → estrutura/equipamentos → depoimentos reais (se houver) → agende aula",
      "hero imersivo → transformação (antes/depois sem inventar) → aulas → instrutores (sem inventar) → matrícula",
    ],
    copyDirection: "falar de resultado, constância e energia; CTA de agendar aula/avalição grátis apenas se fornecido.",
    antiTemplate: "evite só grade de 'musculação, funcional, cross' como cards iguais; crie hierarquia e ritmo.",
    imageQueries: {
      hero: "academia moderna pessoas treinando energia", gallery: "espaço de musculação equipamentos arquitetura",
      service: "treino funcional personal", environment: "academia escura iluminação neon",
    },
  },
  {
    match: /restaurante|restaur|gastronom|caf[ée]|lanchonete|pizzaria|hamburguer|bar|comida|culin[aá]ria/i,
    position: "desejo + experiência + sabor",
    sensation: "apetite, aconchego, celebração",
    archetype: "Editorial gastronômico / sensorial",
    paletteHint: "terrosos quentes (vinho, mostarda, caramelo) com creme",
    typeHint: "display serif expressiva (Fraunces/Playfair) + sans limpa",
    heroStrategy: "hero cinematográfico com comida/ambiente; headline de experiência",
    architecture: [
      "identidade → experiência gastronômica → especialidades → ambiente → reserva/localização",
      "hero imersivo → história da casa → pratos assinatura → ambiente → reservar",
      "hero editorial → o chef/a cozinha (sem inventar) → menu destaque → localização/horários reais",
    ],
    copyDirection: "evocar sabor e experiência; CTA de reserva/encomenda se existir.",
    antiTemplate: "evite 'menu em cards iguais' sem ritmo; fotografia deve dominar.",
    imageQueries: {
      hero: "prato gourmet apresentação restautante", gallery: "ambiente restaurante iluminação mesa posta",
      product: "comida close up saborosa", environment: "interior restaurante acolhedor",
    },
  },
  {
    match: /advogad|advocacia|jur[ií]dic|escrit[oó]rio de advocacia|consultoria jur/i,
    position: "autoridade + segurança + sofisticação",
    sensation: "confiança e solidez",
    archetype: "Editorial de autoridade",
    paletteHint: "azul-marinho profundo, grafite, papel quente, detalhe dourado",
    typeHint: "serif clássica (Playfair/Libre Baskerville) + sans sóbria",
    heroStrategy: "hero editorial sóbrio com tipografia forte; pouca decoração",
    architecture: [
      "posicionamento → áreas de atuação (lista editorial) → abordagem → diferenciais → contato",
      "hero de autoridade → atuação → método → por que escolher → contato",
      "editorial → especialidades → a banca (sem inventar) → contato direto",
    ],
    copyDirection: "linguagem formal e segura; sem promessas; CTA de consulta.",
    antiTemplate: "evite visual 'call center'; nada de imagens aleatórias de pessoas sorrindo.",
    imageQueries: {
      hero: "escritório advocacia arquitetura sóbria", gallery: "sala de reuniões elegante biblioteca",
      service: "arquitetura corporativa detalhe", environment: "fachada prédio corporativo",
    },
  },
  {
    match: /cl[ií]nic|sa[uú]de|m[eé]dic|odontol|fisio|est[eé]tic|sa[uú]de|saude/i,
    position: "cuidado + confiança + competência",
    sensation: "segurança, acolhimento e competência",
    archetype: "Clinical Premium (calmo e sofisticado)",
    paletteHint: "verde-água/teal profundo, neutros claros, um acento de energia",
    typeHint: "serif elegante para títulos (Lora/Playfair) + sans humanista",
    heroStrategy: "hero acolhedor com imagem de ambiente/profissional; headline de cuidado",
    architecture: [
      "proposta → especialidades → tratamentos → confiança (sem inventar) → contato/agendar",
      "hero de cuidado → especialidades → como funciona → estrutura → agendar",
      "acolhimento → tratamentos → por que escolher → equipe (sem inventar) → contato",
    ],
    copyDirection: "transmitir cuidado e segurança; nunca inventar resultados médicos; CTA de agendar.",
    antiTemplate: "evite imagem de 'call center'; prefira ambiente, profissional e cuidado.",
    imageQueries: {
      hero: "clínica moderna acolhedora ambiente", gallery: "consultório médico equipamento limpo",
      service: "profissional de saúde atendimento", environment: "sala de espera confortável",
    },
  },
  {
    match: /automot|mec[aâ]nic|oficina|auto|carro|ve[ií]culo|pneus|el[eé]trica autom/i,
    position: "competência + confiança + performance",
    sensation: "confiança técnica e resultado",
    archetype: "Automotive (robusto, técnico, direto)",
    paletteHint: "grafite/preto, laranja ou vermelho técnico, cinzas",
    typeHint: "sans industrial (Space Grotesk/Rajdhani) + pesos fortes",
    heroStrategy: "hero direto com imagem de oficina/veículo; CTA de orçamento",
    architecture: [
      "serviços → diferenciais → estrutura → processo → orçamento",
      "hero de serviço → o que fazemos → como funciona → por que confiar → orçamento",
      "serviços com imagem → vantagens → processo em etapas → contato",
    ],
    copyDirection: "objetivo e técnico; CTA de orçamento; sem promessas de preço.",
    antiTemplate: "evite fotos aleatórias; use veículo, oficina, ferramentas, processo.",
    imageQueries: {
      hero: "oficina mecânica carro serviço", gallery: "mecânico trabalhando diagnóstico",
      service: "elevador automotivo ferramentas", environment: "oficina organizada profissional",
    },
  },
  {
    match: /pet|animal|c[aã]o|cachorro|gato|banho e tosa|veterin[aá]ri/i,
    position: "cuidado + confiança + experiência do animal",
    sensation: "afeto, segurança, bem-estar",
    archetype: "Organic Premium (acolhedor, não infantil)",
    paletteHint: "azul profundo/esmeralda com quente âmbar; neutros orgânicos",
    typeHint: "sans amigável (Nunito/Poppins) com display de marca",
    heroStrategy: "hero com animal em contexto de cuidado/serviço (grooming, banho)",
    architecture: [
      "serviços → experiência do animal → estrutura → cuidados → diferenciais → contato",
      "hero de cuidado → banho e tosa (com imagem) → ambiente → por que escolher → agendar",
      "acolhimento → serviços com contexto → estrutura → diferenciais → contato",
    ],
    copyDirection: "falar de cuidado e confiança do tutor; NÃO infantilizar; CTA de agendar.",
    antiTemplate: "evite '10 cachorros aleatórios'; use grooming, banho, ambiente, atendimento.",
    imageQueries: {
      hero: "cachorro banho tosa pet shop", gallery: "pet shop ambiente atendimento",
      service: "profissional grooming cuidando animal", environment: "salão pet limpo acolhedor",
    },
  },
];

const FALLBACK: CreativeBrief["imageQueries"] = {
  hero: "negócio local ambiente profissional", gallery: "serviço atendimento contexto",
  service: "espaço do negócio detalhe", environment: "interior acolhedor do negócio",
};

function pick(businessName: string, index: number): string {
  const names = businessName.trim().split(/\s+/);
  const words = names.length ? names.filter((w) => w.length > 2).join(" ") : businessName;
  const options = [
    `moderna e acolhedora, destacando o que torna o negócio único — ${businessName}`,
    `direta e memorável, com foco na proposta de valor e no público de ${words || businessName}`,
    `equilibrada e premium, com hierarquia clara e personalidade própria`,
  ];
  return options[index % options.length];
}

export function buildCreativeBrief(businessName: string, segment: string): CreativeBrief {
  const niche = NICHES.find((n) => n.match.test(segment ?? "")) ?? null;
  const base = niche ?? {
    position: "confiança + proximidade + competência",
    sensation: "confiança e acolhimento",
    archetype: "Modern Premium",
    paletteHint: "neutros sofisticados com um acento de marca (evite o azul 'template')",
    typeHint: "sans moderna + display para destaques (escolha com personalidade)",
    heroStrategy: "hero claro que mostra o que o negócio faz e por que importa, com imagem contextual ou composição limpa",
    architecture: [
      "hero → proposta de valor → serviços → diferenciais → contato/CTA",
      "hero → sobre (o que torna único) → serviços/experiência → por que escolher → contato",
      "hero → o problema que resolve → como resolve → prova (sem inventar) → ação",
    ],
    copyDirection: "linguagem clara e específica do negócio; evitar clichês de 'qualidade/excelência'.",
    antiTemplate: "evite grade de cards genérica; varie composição entre as seções.",
    imageQueries: FALLBACK,
  };
  return {
    businessName,
    segment: segment || "negócio",
    position: base.position,
    sensation: base.sensation,
    archetype: base.archetype,
    paletteHint: base.paletteHint,
    typeHint: base.typeHint,
    heroStrategy: base.heroStrategy,
    architecture: base.architecture,
    imageQueries: base.imageQueries,
    copyDirection: base.copyDirection,
    antiTemplate: base.antiTemplate,
  };
}

// Texto enxuto do brief para injetar na missão (sem expor raciocínio excessivo).
// Aviso (5.26): é PONTO DE PARTIDA — nunca um template; a direção final vem da
// decisão contextual do agente (pesquisa + negócio).
export function formatCreativeBrief(brief: CreativeBrief): string {
  const arch = brief.architecture.map((a, i) => `${i + 1}. ${a}`).join("\n   ");
  const queries = Object.entries(brief.imageQueries).map(([role, q]) => `   - ${role}: "${q}"`).join("\n");
  return `DIREÇÃO CRIATIVA SUGERIDA (ponto de partida, NÃO um template — a direção final é sua, baseada na pesquisa e no negócio):
- Posicionamento: ${brief.position}
- Sensação: ${brief.sensation}
- Arquétipo visual (referência de linguagem): ${brief.archetype}
- Paleta possível (várias direções servem — escolha a que melhor traduz ESTE negócio): ${brief.paletteHint}
- Tipografia possível (idem): ${brief.typeHint}
- Hero (direção de impacto, adaptável): ${brief.heroStrategy}
- Arquiteturas possíveis (escolha 1 e refine para ESTE negócio — não copie literalmente):
   ${arch}
- Imagens contextuais (busque/us referências nesta direção; nunca use imagens de outro segmento):
${queries}
- Copy: ${brief.copyDirection}
- Evite: ${brief.antiTemplate}`;
}
