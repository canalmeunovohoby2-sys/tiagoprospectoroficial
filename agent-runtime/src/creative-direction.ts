// Creative Direction (5.25) — direção criativa POR NEGÓCIO, computada de forma
// determinística e orientada ao CONTEXTO do projeto.
//
// Cada nicho possui VÁRIAS linguagens visuais coesas (direction set). A escolha
// de qual linguagem usar DERIVA da identidade do negócio (nome + segmento), não
// do nicho sozinho — assim dois negócios do MESMO nicho (ex.: duas academias)
// recebem direções diferentes, mas cada uma coerente e profissional. A troca é
// estável por projeto (mesmo negócio → mesma direção, sem randomização por run).
//
// O brief é SEMPRE um PONTO DE PARTIDA: a direção final é do agente, baseada na
// pesquisa, no briefing e na identidade real do negócio. Não é template.
// Puro e testável.

export interface CreativeBrief {
  businessName: string;
  segment: string;
  position: string;             // percepção desejada
  sensation: string;            // sensação/emoção
  archetype: string;            // direção visual escolhida
  paletteHint: string;
  typeHint: string;
  heroStrategy: string;
  architecture: string[];       // arquiteturas possíveis (variadas)
  imageQueries: Record<string, string>; // papel -> query contextual
  copyDirection: string;
  antiTemplate: string;         // o que evitar neste segmento
}

// Parcela INVARIANTE por nicho (position/sensation/copyDirection/antiTemplate).
// Mantém coerência semântica do nicho; a DIVERSIDADE de linguagem vem em `loose`.
interface NicheBase {
  position: string; sensation: string; copyDirection: string; antiTemplate: string;
}

// Variante de linguagem visual: a parcela que MUDA entre negócios do mesmo nicho.
interface DirectionVariant {
  archetype: string;
  paletteHint: string;
  typeHint: string;
  heroStrategy: string;
  architecture: string[];
  imageSuffix: Record<string, string>; // termo diferenciador p/ cada papel de imagem
}

function dset(loose: NicheBase, variants: DirectionVariant[]): { loose: NicheBase; variants: DirectionVariant[] } {
  return { loose, variants };
}

const NICHES: Array<{ match: RegExp; set: ReturnType<typeof dset>; heroQueryBase: string }> = [
  {
    match: /academ|fitness|muscula|treino|pilates|crossfit|gin[aá]stica|personal/i,
    heroQueryBase: "academia pessoas treinando ",
    set: dset(
      {
        position: "performance + transformação + energia",
        sensation: "força, disciplina e conquista",
        copyDirection: "falar de resultado, constância e energia; CTA de agendar aula/avaliação grátis apenas se fornecido.",
        antiTemplate: "evite só grade de 'musculação, funcional, cross' como cards iguais; crie hierarquia e ritmo.",
      },
      [
        {
          archetype: "Bold / Performance premium",
          paletteHint: "grafite profundo, preto, um acento vibrante (laranja/verde-limão)",
          typeHint: "sans geométrica forte (Exo/Space Grotesk) com pesos altos",
          heroStrategy: "hero de impacto com imagem de treino/espaço e headline de resultado",
          architecture: [
            "hero de energia → experiência/conceito → modalidades → diferenciais → planos/CTA",
            "hero statement → método/treino → estrutura/equipamentos → provas → agende aula",
            "hero imersivo → transformação (sem inventar) → aulas → instrutores (sem inventar) → matrícula",
          ],
          imageSuffix: { hero: "energia intensa", gallery: "espaço de musculação arquitetura", service: "treino funcional", environment: "academia escura iluminação neon" },
        },
        {
          archetype: "Editorial de força (monocromático sofisticado)",
          paletteHint: "off-white, grafite, aço e um único acento enxuto (preto e branco com força)",
          typeHint: "serif display (Fraunces/Playfair) para títulos + sans limpa para corpo",
          heroStrategy: "hero editorial de impacto em preto e branco, imagem de atleta/espaço com headline tipográfica marcante",
          architecture: [
            "hero editorial → filosofia do treino → espaços/equipamentos → depoimentos reais → agendar",
            "hero statement → a metodologia → ambiente → coach (sem inventar) → matrícula",
            "proposta → atmosfera → programa → estrutura → por que aqui → ação",
          ],
          imageSuffix: { hero: "atleta preto e branco força", gallery: "arquitetura bruta detalhe", service: "treino técnico", environment: "academia clean grafite" },
        },
        {
          archetype: "Tech / Neon clean",
          paletteHint: "base escura + neon teal/violeta, cinzas técnicos, raro e preciso",
          typeHint: "sans moderna (Inter/Space Grotesk) com toque de display técnica",
          heroStrategy: "hero tech de impacto com imagem de treino em ambiente moderno e detalhes de energia visual",
          architecture: [
            "hero tech → experiência → modalidades com dados → diferenciais → agende",
            "conceito → como funciona → estrutura inteligente → provas → ação",
            "imersão → treino → ambiente → performance → matrícula",
          ],
          imageSuffix: { hero: "academia moderna neon ambiente", gallery: "iluminação tech detalhe", service: "treino tecnológico", environment: "academia escura iluminação" },
        },
        {
          archetype: "Wellness clean",
          paletteHint: "paleta clara (areia, verde-sálvia) com grafite suave — nada de preto pesado",
          typeHint: "serif leve (Lora/Playfair) + sans humanista, muito respiro",
          heroStrategy: "hero clean e luminoso, imagem de treino em luz natural e headline de bem-estar",
          architecture: [
            "wellness → benefícios → modalidades → ambiente acolhedor → agendar",
            "acolhimento → método → estrutura → por que escolher → contato",
            "hero leve → proposta → comunidade → espaço → ação",
          ],
          imageSuffix: { hero: "academia luz natural treino", gallery: "ambiente acolhedor areia", service: "treino bem-estar", environment: "espaço clean claro" },
        },
      ],
    ),
  },
  {
    match: /restaurante|restaur|gastronom|caf[ée]|lanchonete|pizzaria|hamburguer|bar|comida|culin[aá]ria/i,
    heroQueryBase: "prato restaurante comida ",
    set: dset(
      {
        position: "desejo + experiência + sabor",
        sensation: "apetite, aconchego, celebração",
        copyDirection: "evocar sabor e experiência; CTA de reserva/encomenda se existir.",
        antiTemplate: "evite 'menu em cards iguais' sem ritmo; a fotografia deve dominar.",
      },
      [
        {
          archetype: "Editorial gastronômico / sensorial",
          paletteHint: "terrosos quentes (vinho, mostarda, caramelo) com creme",
          typeHint: "display serif expressiva (Fraunces/Playfair) + sans limpa",
          heroStrategy: "hero cinematográfico com comida/ambiente e headline de experiência",
          architecture: [
            "identidade → experiência gastronômica → especialidades → ambiente → reserva/localização",
            "hero imersivo → história da casa → pratos assinatura → ambiente → reservar",
            "hero editorial → a cozinha (sem inventar) → menu destaque → localização/horários reais",
          ],
          imageSuffix: { hero: "prato gourmet apresentação", gallery: "ambiente mesa posta", service: "comida close saborosa", environment: "interior acolhedor" },
        },
        {
          archetype: "Bistro intimista",
          paletteHint: "creme, terracota e marrom-carvão; luz de velas e quente, sem excesso",
          typeHint: "serif clássica (Libre Baskerville) + sans discreta",
          heroStrategy: "hero intimista com ambiente aconchegante e headline afetiva",
          architecture: [
            "hero acolhedor → a casa → pratos → ambiente → reservar",
            "identidade → experiência → sabores → horários reais → reserva",
            "atmosfera → menu → história → contato",
          ],
          imageSuffix: { hero: "bistrô ambiente acolhedor", gallery: "luz cálida mesa", service: "prato da casa", environment: "interior íntimo" },
        },
        {
          archetype: "Street-food pop",
          paletteHint: "cores vivas e ousadas (tangerina, rosa, mostarda) sobre base limpa",
          typeHint: "display grossa arredondada + sans direta (muita energia)",
          heroStrategy: "hero vibrante com comida em close e tipografia grande",
          architecture: [
            "hero pop → menu de destaque → combos → como pedir → localização",
            "identidade → o que serve → promoções reais → onde encontrar → pedir",
            "chamada forte → cardápio → experiência → contato",
          ],
          imageSuffix: { hero: "comida vibrante close", gallery: "ambiente colorido urbano", service: "prato de destaque", environment: "cozinha aberta" },
        },
        {
          archetype: "Minimal premium",
          paletteHint: "neutros sofisticados com aço escovado e um detalhe (não a paleta 'escura' genérica)",
          typeHint: "sans discreta de alto contraste (fina para corpo, medium para títulos)",
          heroStrategy: "hero minimalista com uma única imagem de assinatura e muito respiro",
          architecture: [
            "minimal → experiência → especialidades → reserva",
            "identidade → proposta culinária → espaço → contato",
            "hero de assinatura → menu enxuto → ambiente → reservar",
          ],
          imageSuffix: { hero: "prato minimalista premium", gallery: "espaço elegante detalhe", service: "comida sofisticada", environment: "salão premium clean" },
        },
      ],
    ),
  },
  {
    match: /advogad|advocacia|jur[ií]dic|escrit[oó]rio de advocacia|consultoria jur/i,
    heroQueryBase: "escritório advocacia arquitetura ",
    set: dset(
      {
        position: "autoridade + segurança + sofisticação",
        sensation: "confiança e solidez",
        copyDirection: "linguagem formal e segura; sem promessas; CTA de consulta.",
        antiTemplate: "evite visual 'call center'; nada de imagens aleatórias de pessoas sorrindo.",
      },
      [
        {
          archetype: "Editorial de autoridade",
          paletteHint: "azul-marinho profundo, grafite, papel quente, detalhe dourado",
          typeHint: "serif clássica (Playfair/Libre Baskerville) + sans sóbria",
          heroStrategy: "hero editorial sóbrio com tipografia forte e pouca decoração",
          architecture: [
            "posicionamento → áreas de atuação (lista editorial) → abordagem → diferenciais → contato",
            "hero de autoridade → atuação → método → por que escolher → contato",
            "editorial → especialidades → a banca (sem inventar) → contato direto",
          ],
          imageSuffix: { hero: "arquitetura sóbria", gallery: "sala de reuniões elegante", service: "detalhe corporativo", environment: "fachada prédio profissional" },
        },
        {
          archetype: "Modern financeiro",
          paletteHint: "grafite, dourado e branco; visual de private (sem azul genérico)",
          typeHint: "serif/geométrica refinada + sans de precisão",
          heroStrategy: "hero direto com hierarquia forte e número/posicionamento como herói",
          architecture: [
            "hero de posição → áreas → abordagem com dados → por que confiar → contato",
            "posicionamento → especialidades → processo → diferença → consulta",
            "autoridade → atuação → método transparente → contato",
          ],
          imageSuffix: { hero: "arquitetura corporativa premium", gallery: "escritório moderno", service: "detalhe de autoridade", environment: "ambiente corporate" },
        },
        {
          archetype: "Clássico jurídico",
          paletteHint: "verde-escuro/petróleo com marfim e um acento grave",
          typeHint: "serif tradicional (EB Garamond) + sans discreta",
          heroStrategy: "hero clássico e sóbrio, imagem de sala e tipografia de credibilidade",
          architecture: [
            "hero → atuação → a firma (sem inventar) → contato",
            "tradição → especialidades → compromisso → contato",
            "autoridade → áreas → como atuamos → contato",
          ],
          imageSuffix: { hero: "sala de reuniões clássica", gallery: "arquitetura jurídica", service: "detalhe de credibilidade", environment: "ambiente profissional" },
        },
        {
          archetype: "Minimal consultivo",
          paletteHint: "branco, preto e UM acento sóbrio (sem excesso de cor)",
          typeHint: "sans fina de alto contraste (tipografia-disciplina)",
          heroStrategy: "hero minimalista com o problema/posicionamento e chamada direta",
          architecture: [
            "problema → como resolvemos → áreas → por que confiar → contato",
            "hero clean → atuação → abordagem → contato",
            "posicionamento → especialidades → resultado esperado → consulta",
          ],
          imageSuffix: { hero: "ambiente minimalista", gallery: "detalhe clean", service: "autoridade", environment: "escritório moderno" },
        },
      ],
    ),
  },
  {
    match: /cl[ií]nic|sa[uú]de|m[eé]dic|odontol|fisio|est[eé]tic|saude/i,
    heroQueryBase: "clínica saúde ambiente ",
    set: dset(
      {
        position: "cuidado + confiança + competência",
        sensation: "segurança, acolhimento e competência",
        copyDirection: "transmitir cuidado e segurança; nunca inventar resultados médicos; CTA de agendar.",
        antiTemplate: "evite imagem de 'call center'; prefira ambiente, profissional e cuidado.",
      },
      [
        {
          archetype: "Clinical Premium (calmo e sofisticado)",
          paletteHint: "verde-água/teal profundo, neutros claros, um acento de energia",
          typeHint: "serif elegante para títulos (Lora/Playfair) + sans humanista",
          heroStrategy: "hero acolhedor com imagem de ambiente/profissional e headline de cuidado",
          architecture: [
            "proposta → especialidades → tratamentos → confiança (sem inventar) → agendar",
            "hero de cuidado → especialidades → como funciona → estrutura → agendar",
            "acolhimento → tratamentos → por que escolher → equipe (sem inventar) → contato",
          ],
          imageSuffix: { hero: "ambiente acolhedor", gallery: "consultório limpo", service: "atendimento cuidado", environment: "sala de espera confortável" },
        },
        {
          archetype: "Wellness sereno (claro e orgânico)",
          paletteHint: "verde-sálvia, areia e branco; luz natural, sem peso escuro",
          typeHint: "serif leve + sans suave (respiração, calma)",
          heroStrategy: "hero luminoso com fotografia de bem-estar e headline serena",
          architecture: [
            "acolhimento → especialidades → cuidar de você → agendar",
            "hero sereno → como cuidamos → estrutura → contato",
            "bem-estar → tratamentos → por que aqui → agendar",
          ],
          imageSuffix: { hero: "bem-estar luz natural", gallery: "ambiente claro orgânico", service: "cuidado suave", environment: "sala acolhedora clara" },
        },
        {
          archetype: "Tech health (preciso e moderno)",
          paletteHint: "branco, azul-tech e acento de energia; limpo e preciso",
          typeHint: "sans moderna (Inter) com hierarquia técnica",
          heroStrategy: "hero moderno com imagem de profissional/tecnologia e headline objetiva",
          architecture: [
            "precisão → especialidades → tecnologia → agendar",
            "hero tech → como funciona → estrutura moderna → contato",
            "competência → tratamentos → experiência → agendar",
          ],
          imageSuffix: { hero: "profissional saúde moderno", gallery: "equipamento limpo", service: "atendimento técnico", environment: "clínica moderna" },
        },
      ],
    ),
  },
  {
    match: /automot|mec[aâ]nic|oficina|auto|carro|ve[ií]culo|pneus|el[eé]trica autom/i,
    heroQueryBase: "oficina automotiva carro serviço ",
    set: dset(
      {
        position: "competência + confiança + performance",
        sensation: "confiança técnica e resultado",
        copyDirection: "objetivo e técnico; CTA de orçamento; sem promessas de preço.",
        antiTemplate: "evite fotos aleatórias; use veículo, oficina, ferramentas, processo.",
      },
      [
        {
          archetype: "Automotive (robusto, técnico, direto)",
          paletteHint: "grafite/preto, laranja ou vermelho técnico, cinzas",
          typeHint: "sans industrial (Space Grotesk/Rajdhani) + pesos fortes",
          heroStrategy: "hero direto com imagem de oficina/veículo e CTA de orçamento",
          architecture: [
            "serviços → diferenciais → estrutura → processo → orçamento",
            "hero de serviço → o que fazemos → como funciona → por que confiar → orçamento",
            "serviços com imagem → vantagens → processo em etapas → contato",
          ],
          imageSuffix: { hero: "oficina carro serviço", gallery: "mecânico diagnóstico", service: "ferramentas elevador", environment: "oficina profissional" },
        },
        {
          archetype: "Performance garage (limpo e forte)",
          paletteHint: "grafite + aço + um acento elétrico (não o vermelho clichê)",
          typeHint: "sans forte + display técnica (tecnologia automotiva)",
          heroStrategy: "hero de performance com veículo em destaque e headline de resultado",
          architecture: [
            "hero → especialidades → estrutura → processo → orçamento",
            "performance → serviços → por que confiar → contato",
            "destaque → o que fazemos → como → orçamento",
          ],
          imageSuffix: { hero: "carro performance oficina", gallery: "diagnóstico moderno", service: "elevador detalhe", environment: "garagem limpa" },
        },
      ],
    ),
  },
  {
    match: /pet|animal|c[aã]o|cachorro|gato|banho e tosa|veterin[aá]ri/i,
    heroQueryBase: "cachorro pet banho ",
    set: dset(
      {
        position: "cuidado + confiança + experiência do animal",
        sensation: "afeto, segurança, bem-estar",
        copyDirection: "falar de cuidado e confiança do tutor; NÃO infantilizar; CTA de agendar.",
        antiTemplate: "evite '10 cachorros aleatórios'; use grooming, banho, ambiente, atendimento.",
      },
      [
        {
          archetype: "Organic Premium (acolhedor, não infantil)",
          paletteHint: "azul profundo/esmeralda com quente âmbar; neutros orgânicos",
          typeHint: "sans amigável (Nunito/Poppins) com display de marca",
          heroStrategy: "hero com animal em contexto de cuidado/serviço (grooming, banho)",
          architecture: [
            "serviços → experiência do animal → estrutura → cuidados → diferenciais → contato",
            "hero de cuidado → banho e tosa (com imagem) → ambiente → por que escolher → agendar",
            "acolhimento → serviços com contexto → estrutura → diferenciais → contato",
          ],
          imageSuffix: { hero: "grooming banho", gallery: "pet shop ambiente", service: "profissional cuidando", environment: "salão pet limpo" },
        },
        {
          archetype: "Spa Pet sofisticado",
          paletteHint: "sálvia, areia e tons suaves; elegante, sem exagero",
          typeHint: "serif leve + sans suave (calma e cuidado)",
          heroStrategy: "hero de spa animal com ambiente sereno e headline de bem-estar",
          architecture: [
            "experiência → serviços de spa → ambiente → agendar",
            "hero sereno → cuidados → estrutura → contato",
            "bem-estar → banho/tosa → por que aqui → agendar",
          ],
          imageSuffix: { hero: "banho tosa spa pet", gallery: "ambiente spa pet", service: "cuidado grooming", environment: "salão acolhedor" },
        },
        {
          archetype: "Playful-edit (energético, não infantil)",
          paletteHint: "cores vivas com equilíbrio (coral, turquesa) e base limpa",
          typeHint: "display arredondada + sans direta (amigável adulto)",
          heroStrategy: "hero alegre com animal e ação, sem cair no infantil",
          architecture: [
            "hero → serviços → diversão/cuidado → ambiente → agendar",
            "identidade → banho/tosa → experiência → contato",
            "chamada → serviços → por que escolher → agendar",
          ],
          imageSuffix: { hero: "cachorro feliz ação", gallery: "ambiente colorido", service: "banho tosa", environment: "pet shop vivo" },
        },
      ],
    ),
  },
];

const FALLBACK_ARCHETYPE = "Modern Premium";
const FALLBACK: { position: string; sensation: string; copyDirection: string; antiTemplate: string; imageQueries: Record<string, string> } = {
  position: "confiança + proximidade + competência",
  sensation: "confiança e acolhimento",
  copyDirection: "linguagem clara e específica do negócio; evitar clichês de 'qualidade/excelência'.",
  antiTemplate: "evite grade de cards genérica; varie composição entre as seções.",
  imageQueries: {
    hero: "negócio local ambiente profissional", gallery: "serviço atendimento contexto",
    service: "espaço do negócio detalhe", environment: "interior acolhedor do negócio",
  },
};

// Identidade determinística do negócio — a base para escolher a linguagem visual.
// Estável por projeto (mesmo negócio sempre a mesma direção; sem random por run).
function seedOf(businessName: string, segment: string): number {
  const s = `${String(businessName ?? "").trim()}::${String(segment ?? "").trim()}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(arr: T[], a: string, b: string): T {
  return arr[seedOf(a, b) % arr.length];
}

export function buildCreativeBrief(businessName: string, segment: string): CreativeBrief {
  const niche = NICHES.find((n) => n.match.test(segment ?? ""));

  if (!niche) {
    // Segmento desconhecido: fallback único (mantém "Modern Premium") — a direção
    // final ainda é do agente (pesquisa + negócio).
    return {
      businessName,
      segment: segment || "negócio",
      position: FALLBACK.position,
      sensation: FALLBACK.sensation,
      archetype: FALLBACK_ARCHETYPE,
      paletteHint: "neutros sofisticados com um acento de marca (evite o azul 'template')",
      typeHint: "sans moderna + display para destaques (escolha com personalidade)",
      heroStrategy: "hero claro que mostra o que o negócio faz e por que importa, com imagem contextual ou composição limpa",
      architecture: [
        "hero → proposta de valor → serviços → diferenciais → contato/CTA",
        "hero → sobre (o que torna único) → serviços/experiência → por que escolher → contato",
        "hero → o problema que resolve → como resolve → prova (sem inventar) → ação",
      ],
      imageQueries: FALLBACK.imageQueries,
      copyDirection: FALLBACK.copyDirection,
      antiTemplate: FALLBACK.antiTemplate,
    };
  }

  // Direção específica do negócio: invariantes do nicho + linguagem da variante
  // escolhida pela identidade do negócio. A query de hero mantém a base do nicho
  // (para coerência semântica) com um termo diferenciador por projeto.
  const { loose, variants } = niche.set;
  const v = pick(variants, businessName, segment);
  const imageQueries: Record<string, string> = {};
  for (const [role, base] of Object.entries({
    hero: niche.heroQueryBase,
    gallery: `${loose.position.split(" ")[0]} contexto ambiente`,
    service: "serviço atendimento profissional",
    environment: "ambiente do negócio detalhe",
  })) {
    const suffix = v.imageSuffix[role] ?? "";
    imageQueries[role] = [base, suffix].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  return {
    businessName,
    segment: segment || "negócio",
    position: loose.position,
    sensation: loose.sensation,
    archetype: v.archetype,
    paletteHint: v.paletteHint,
    typeHint: v.typeHint,
    heroStrategy: v.heroStrategy,
    architecture: v.architecture,
    imageQueries,
    copyDirection: loose.copyDirection,
    antiTemplate: loose.antiTemplate,
  };
}

// Texto enxuto do brief para injetar na missão (sem expor raciocínio excessivo).
// Aviso (5.26): é PONTO DE PARTIDA — nunca um template; a direção final vem da
// decisão contextual do agente (pesquisa + negócio).
export function formatCreativeBrief(brief: CreativeBrief): string {
  const arch = brief.architecture.map((a, i) => `${i + 1}. ${a}`).join("\n   ");
  const queries = Object.entries(brief.imageQueries).map(([role, q]) => `   - ${role}: "${q}"`).join("\n");
  return `DIREÇÃO CRIATIVA SUGERIDA (ponto de partida, NÃO um template — a direção final é SUA, baseada na pesquisa e no negócio):
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
