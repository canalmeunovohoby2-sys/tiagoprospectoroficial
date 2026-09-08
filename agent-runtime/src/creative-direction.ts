// Creative Direction (5.25 → 6.0) — direção criativa POR NEGÓCIO, determinística
// e agora com DESIGN TOKENS EXECUTÁVEIS (não apenas prosa inspiracional).
//
// Cada nicho possui várias linguagens visuais COESAS (direction set). A escolha
// DERIVA da identidade do negócio (nome + segmento), não do nicho sozinho — assim
// dois negócios do MESMO nicho recebem direções diferentes, mas cada uma coerente.
// A troca é ESTÁVEL por projeto (sem random por run).
//
// O brief entrega tokens concretos (hex de paleta, tipografia, composição,
// arquitetura ESCOLHIDA, direção de imagens) para o agente MATERIALIZAR, em vez de
// recorrer aos seus defaults pessoais. Libert (identidade), não template: o agente
// continua livre para seções, componentes, microinterações e decisões de UX — a
// direção define a LINGUAGEM VISUAL, não o site inteiro.
// Puro e testável.

export interface PaletteTokens {
  primary: string;      // cor de marca / destaque principal
  secondary: string;    // apoio de cor
  accent: string;       // acento energético (CTA/highlights)
  background: string;   // fundo da página
  foreground: string;   // texto principal
  muted: string;        // texto secundário
  cta: string;          // cor do botão de conversão
  ctaContrast: string;  // cor do texto/ícone do CTA (contraste)
}

export interface TypographyTokens {
  heading: string;      // família dos títulos
  body: string;         // família do corpo
  headingWeights: string;
  bodyWeights: string;
  style: string;        // estilo tipográfico (ex.: "serif editorial + sans humanista")
  importUrl?: string;   // Google Fonts URL com as famílias+pesos usados
}

export interface CompositionTokens {
  hero: string;
  container: string;    // largura máx / wrapping
  alignment: string;    // tendência de alinhamento
  density: string;      // densidade visual
  sectionRhythm: string;// ritmo entre seções
  cards: string;        // linguagem de cards
  cta: string;          // tratamento do CTA
  images: string;       // tratamento de imagens
  border: string;       // raio/bordas
  shadow: string;       // linguagem de sombras
  decoration: string;   // linguagem decorativa
}

export interface DirectionTokens {
  palette: PaletteTokens;
  typography: TypographyTokens;
  composition: CompositionTokens;
}

export interface CreativeBrief {
  businessName: string;
  segment: string;
  position: string;
  sensation: string;
  archetype: string;
  paletteHint: string;
  typeHint: string;
  heroStrategy: string;
  architecture: string[];       // opções (referência interna)
  architectureChoice: string;   // arquitetura ESCOLHIDA para ESTE projeto
  imageQueries: Record<string, string>;
  copyDirection: string;
  antiTemplate: string;
  // Design tokens executáveis
  tokens: DirectionTokens;
}

interface NicheBase {
  position: string; sensation: string; copyDirection: string; antiTemplate: string;
}

interface DirectionVariant {
  archetype: string;
  paletteHint: string;
  typeHint: string;
  heroStrategy: string;
  architecture: string[];
  imageSuffix: Record<string, string>;
}

function dset(loose: NicheBase, variants: DirectionVariant[]) {
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

// Tokens executáveis por arquétipo (paleta coerente + tipografia + composição).
// Escolhidos para respeitar contraste entre CTA e CTA-contrast, e coesão com a
// linguagem do arquétipo. Nada de cores aleatórias.
const T = (
  palette: PaletteTokens, heading: string, body: string, headingWeights: string, bodyWeights: string,
  style: string, importUrl: string, composition: CompositionTokens,
): DirectionTokens => ({ palette, typography: { heading, body, headingWeights, bodyWeights, style, importUrl }, composition });

const TOKENS: Record<string, DirectionTokens> = {
  "Bold / Performance premium": T(
    { primary: "#1B1E24", secondary: "#F97316", accent: "#A3E635", background: "#0B0E13", foreground: "#F5F7FA", muted: "#9AA3AE", cta: "#F97316", ctaContrast: "#FFFFFF" },
    "Space Grotesk", "Inter", "700 800", "400 500", "sans geométrica forte + brilho neon/destacadamente escuro",
    "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;500;600&display=swap",
    { hero: "imagem de treino de alto impacto + headline de resultado e CTA em destaque", container: "máx 1200px, com larga respiração lateral", alignment: "centrado no hero, alinhado à esquerda no corpo", density: "alta (muita presença, contraste forte)", sectionRhythm: "alternância de faixas escuras com acento", cards: "cards de borda sutil, ângulo leve e hover 3D", cta: "botão com brilho/beam contínuo e hover scale", images: "recorte de ação, alto contraste, levemente granulado", border: "raios pequenos/médios (8–16px)", shadow: "sombras profundas + glow do accent", decoration: "orbes/auroras de energia + grid técnico" },
  ),
  "Editorial de força (monocromático sofisticado)": T(
    { primary: "#1A1A1A", secondary: "#E5E1DA", accent: "#C0C0C0", background: "#F4F2EE", foreground: "#161616", muted: "#6B6B6B", cta: "#161616", ctaContrast: "#FFFFFF" },
    "Fraunces", "Inter", "500 700 900", "400 500", "editorial em P&B com serif display expressiva e respiro",
    "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Inter:wght@400;500&display=swap",
    { hero: "editorial em preto e branco com headline tipográfica enorme", container: "máx 1140px, coluna editorial estreita", alignment: "esquerda (forte hierarquia de leitura)", density: "média-alta, muito contraste tipográfico", sectionRhythm: "seções espaçadas como páginas de revista", cards: "listas editoriais + números grandes + imagem", cta: "CTA sóbrio de alto contraste (preto sobre branco)", images: "P&B cinematográfico com luz dura", border: "raios mínimos (0–8px)", shadow: "sombras secas e discretas", decoration: "linhas finas, marcações geométricas" },
  ),
  "Tech / Neon clean": T(
    { primary: "#0EA5E9", secondary: "#8B5CF6", accent: "#22D3EE", background: "#0A0E17", foreground: "#E8F1FF", muted: "#93A0B4", cta: "#22D3EE", ctaContrast: "#04131A" },
    "Space Grotesk", "Inter", "500 700", "400 500", "tech com neon controlado e display técnica",
    "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&display=swap",
    { hero: "imersivo com gradiente neon/ambiente e detalhe de energia", container: "máx 1240px", alignment: "centrado no hero, esquerda no corpo", density: "alta, com véu de luz técnica", sectionRhythm: "faixas escuras com detalhes de linha/grade", cards: "cards com borda neon sutil e vidro (glassmorphism)", cta: "CTA com glow neon e hover de brilho", images: "ambiente tecnológico, alta iluminação, cores frias", border: "raios médios (12–20px)", shadow: "glow azul/violeta + sombra profunda", decoration: "orbes de luz, grade de fundo, linhas de conexão" },
  ),
  "Wellness clean": T(
    { primary: "#3E7C6B", secondary: "#E4D8C5", accent: "#D9A441", background: "#FBF9F4", foreground: "#23302B", muted: "#6E7B74", cta: "#3E7C6B", ctaContrast: "#FFFFFF" },
    "Lora", "Inter", "500 600", "400 500", "serif leve + sans humanista, arejado e calmo",
    "https://fonts.googleapis.com/css2?family=Lora:wght@500;600&family=Inter:wght@400;500&display=swap",
    { hero: "luminoso com luz natural e headline de bem-estar", container: "máx 1120px, muito espaço", alignment: "centrado, simétrico e sereno", density: "baixa-média (muito respiro)", sectionRhythm: "seções abertas e alternadas", cards: "cards limpos com imagem e muito espaço", cta: "CTA suave e arredondado com hover suave", images: "luz natural, tons claros e orgânicos", border: "raios generosos (16–24px)", shadow: "sombras leves e difusas", decoration: "formas orgânicas suaves, tons pastel" },
  ),
  "Editorial gastronômico / sensorial": T(
    { primary: "#7B2D26", secondary: "#C89B3C", accent: "#E0773B", background: "#FBF3E8", foreground: "#2C1A15", muted: "#8C6F5F", cta: "#E0773B", ctaContrast: "#FFFFFF" },
    "Fraunces", "Inter", "500 700 900", "400 500", "gastronômico sensorial com fotografia dominante e serif expressiva",
    "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Inter:wght@400;500&display=swap",
    { hero: "cinematográfico com prato/ambiente em destaque", container: "máx 1220px, imagem full em algumas seções", alignment: "mistura: hero centrado, corpo com quebra em colunas", density: "média alta (fotografia como protagonista)", sectionRhythm: "alterna imagem grande com texto editorial", cards: "menos cards; uso de imagens + texto", cta: "CTA quente (reserva) com hover caloroso", images: "fotografia gastronômica apetitosa, luz quente", border: "raios suaves (12–20px)", shadow: "sombras quentes e suaves", decoration: "texturas de papel/ares de marca + moldura natural" },
  ),
  "Bistro intimista": T(
    { primary: "#4A2C2A", secondary: "#C08A5A", accent: "#8C5B3F", background: "#1A1210", foreground: "#F3E9E0", muted: "#C2B2A6", cta: "#C08A5A", ctaContrast: "#241512" },
    "Libre Baskerville", "Inter", "400 700", "400 500", "bistro clássico e aconchegante com luz de vela",
    "https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Inter:wght@400;500&display=swap",
    { hero: "íntimo com ambiente aconchegante e headline afetiva", container: "máx 1100px", alignment: "centrado, quente e acolhedor", density: "baixa-média", sectionRhythm: "seções envolventes com luz baixa", cards: "cards discretos com foco no ambiente", cta: "CTA terroso com hover discreto", images: "luz baixa, aconchego, tons de carvão", border: "raios médios (12–18px)", shadow: "sombras profundas e calorosas", decoration: "elementos de luz difusa, madeira, detalhes dourados" },
  ),
  "Street-food pop": T(
    { primary: "#F43F5E", secondary: "#FB923C", accent: "#EAB308", background: "#FFF7ED", foreground: "#271309", muted: "#8A5A3F", cta: "#F43F5E", ctaContrast: "#FFFFFF" },
    "Poppins", "Inter", "700 800", "400 500", "street vibe, display grossa arredondada e muita energia",
    "https://fonts.googleapis.com/css2?family=Poppins:wght@700;800&family=Inter:wght@400;500&display=swap",
    { hero: "pop vibrante com comida em close e tipografia grande", container: "máx 1200px", alignment: "centrado e ousado", density: "alta (cor e energia)", sectionRhythm: "blocos ousados e coloridos", cards: "cards grossos com cores vivas", cta: "CTA de destaque vibrante com hover forte", images: "close vibrante e apetitoso", border: "raios grandes (18–28px)", shadow: "sombras coloridas/duras", decoration: "formas geométricas vivas, marquise, chips" },
  ),
  "Minimal premium": T(
    { primary: "#2B2B2B", secondary: "#8C8C8C", accent: "#C9A961", background: "#FCFCFA", foreground: "#141414", muted: "#7A7A7A", cta: "#141414", ctaContrast: "#FFFFFF" },
    "Inter", "Inter", "500 600", "300 400 500", "minimalista premium de alto contraste, muito respiro",
    "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap",
    { hero: "minimalista com uma única imagem de assinatura e respiro", container: "máx 1080px", alignment: "esquerda com grid fino", density: "baixa (muito espaço em branco)", sectionRhythm: "ritmo espaçado e preciso", cards: "cards enxutos com tipografia grande", cta: "CTA discreto de alto contraste", images: "fotografia premium clean, pouca cor", border: "raios mínimos (0–8px)", shadow: "sombras muito leves", decoration: "linhas finas, hierarquia tipográfica" },
  ),
  "Editorial de autoridade": T(
    { primary: "#1F3A5F", secondary: "#C0A44A", accent: "#9C7C2E", background: "#FCFAF6", foreground: "#1A1A1A", muted: "#6B6B6B", cta: "#1F3A5F", ctaContrast: "#FFFFFF" },
    "Playfair Display", "Inter", "500 700", "400 500", "autoridade com serif clássica e sans sóbria",
    "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Inter:wght@400;500&display=swap",
    { hero: "editorial sóbrio com tipografia forte e pouca decoração", container: "máx 1120px, coluna editorial", alignment: "esquerda, hierarquia formal", density: "média", sectionRhythm: "listas editoriais espaçadas", cards: "listas com número/índice", cta: "CTA formal de alto contraste", images: "arquitetura e ambiente sóbrios", border: "raios pequenos (4–10px)", shadow: "sombras discretas", decoration: "linhas finas, detalhes dourados" },
  ),
  "Modern financeiro": T(
    { primary: "#121212", secondary: "#C9A961", accent: "#E0C883", background: "#FFFFFF", foreground: "#171717", muted: "#7A7A7A", cta: "#121212", ctaContrast: "#FFFFFF" },
    "Cormorant Garamond", "Inter", "500 700", "400 500", "private banking com serif refinada e precisão",
    "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;700&family=Inter:wght@400;500&display=swap",
    { hero: "direto com número/posicionamento como herói", container: "máx 1160px", alignment: "esquerda e precisa", density: "média com muito branco", sectionRhythm: "seções cortadas com precisão", cards: "cards enxutos com números", cta: "CTA escuro premium", images: "arquitetura corporativa clean", border: "raios pequenos (4–10px)", shadow: "sombras leves e precisas", decoration: "linhas douradas finas" },
  ),
  "Clássico jurídico": T(
    { primary: "#1E3A34", secondary: "#B9A77A", accent: "#8E7C4B", background: "#F7F4EC", foreground: "#1B1B1B", muted: "#6E6E6E", cta: "#1E3A34", ctaContrast: "#FFFFFF" },
    "EB Garamond", "Inter", "500 700", "400 500", "jurídico tradicional com serif de credibilidade",
    "https://fonts.googleapis.com/css2?family=EB+Garamond:wght@500;700&family=Inter:wght@400;500&display=swap",
    { hero: "clássico e sóbrio com imagem de sala e tipografia de credibilidade", container: "máx 1120px", alignment: "esquerda, formal", density: "média", sectionRhythm: "seções formais espaçadas", cards: "listas institucionais", cta: "CTA sóbrio", images: "arquitetura jurídica clássica", border: "raios pequenos (4–8px)", shadow: "sombras discretas", decoration: "molduras finas, tipografia tradicional" },
  ),
  "Minimal consultivo": T(
    { primary: "#111111", secondary: "#6B7280", accent: "#4F46E5", background: "#FAFAFA", foreground: "#111111", muted: "#6B6B6B", cta: "#111111", ctaContrast: "#FFFFFF" },
    "Inter", "Inter", "500 600", "300 400 500", "consultivo minimalista, tipografia-disciplina",
    "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap",
    { hero: "minimalista com o problema/posicionamento e chamada direta", container: "máx 1040px", alignment: "esquerda, clean", density: "baixa", sectionRhythm: "seções enxutas", cards: "poucos cards, muito espaço", cta: "CTA escuro com um acento", images: "ambiente clean e sóbrio", border: "raios mínimos (0–8px)", shadow: "sombras muito leves", decoration: "linhas finas, acento único" },
  ),
  "Clinical Premium (calmo e sofisticado)": T(
    { primary: "#0E7490", secondary: "#67E8F9", accent: "#22B8CF", background: "#F5FBFC", foreground: "#0F262B", muted: "#5C7A80", cta: "#0E7490", ctaContrast: "#FFFFFF" },
    "Lora", "Inter", "500 600", "400 500", "clínico premium, calmo e sofisticado com serif elegante",
    "https://fonts.googleapis.com/css2?family=Lora:wght@500;600&family=Inter:wght@400;500&display=swap",
    { hero: "acolhedor com ambiente/profissional e headline de cuidado", container: "máx 1160px", alignment: "centrado, sereno", density: "média, sem excesso", sectionRhythm: "seções de cuidado alternadas", cards: "cards limpos com imagem de cuidado", cta: "CTA teal suave com hover de calma", images: "ambiente acolhedor e profissional", border: "raios médios (14–20px)", shadow: "sombras suaves e difusas", decoration: "curvas suaves, tons claros" },
  ),
  "Wellness sereno (claro e orgânico)": T(
    { primary: "#4E7A5A", secondary: "#D8CBB4", accent: "#9CC177", background: "#FAF8F2", foreground: "#213026", muted: "#6E7B6F", cta: "#4E7A5A", ctaContrast: "#FFFFFF" },
    "Lora", "Inter", "500 600", "400 500", "bem-estar sereno, claro e orgânico",
    "https://fonts.googleapis.com/css2?family=Lora:wght@500;600&family=Inter:wght@400;500&display=swap",
    { hero: "luminoso com bem-estar em luz natural e headline serena", container: "máx 1120px", alignment: "centrado, calmante", density: "baixa", sectionRhythm: "seções orgânicas espaçadas", cards: "cards suaves e claros", cta: "CTA verde suave", images: "luz natural, spa, tons de verde", border: "raios generosos (16–24px)", shadow: "sombras leves", decoration: "formas orgânicas, folhas" },
  ),
  "Tech health (preciso e moderno)": T(
    { primary: "#2563EB", secondary: "#93C5FD", accent: "#2DD4BF", background: "#F6F9FF", foreground: "#101828", muted: "#66748C", cta: "#2563EB", ctaContrast: "#FFFFFF" },
    "Inter", "Inter", "500 700", "400 500", "health-tech preciso e moderno, azul + teal",
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap",
    { hero: "moderno com profissional/tecnologia e headline objetiva", container: "máx 1180px", alignment: "esquerda, precisa", density: "média", sectionRhythm: "seções com números/dados", cards: "cards com hierarquia técnica", cta: "CTA azul com hover", images: "profissional de saúde/equipamento limpo", border: "raios médios (10–16px)", shadow: "sombras clean", decoration: "grid fino, ícones, dados" },
  ),
  "Automotive (robusto, técnico, direto)": T(
    { primary: "#E8590C", secondary: "#495057", accent: "#FF7A29", background: "#14171A", foreground: "#F1F3F5", muted: "#A6AEB6", cta: "#E8590C", ctaContrast: "#FFFFFF" },
    "Space Grotesk", "Inter", "500 700", "400 500", "automotivo robusto, técnico e direto",
    "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&display=swap",
    { hero: "direto com imagem de oficina/veículo e CTA de orçamento", container: "máx 1220px", alignment: "esquerda, técnica", density: "alta, industrial", sectionRhythm: "blocos funcionais", cards: "cards de serviço com ícone", cta: "CTA laranja de orçamento forte", images: "oficina, veículo, ferramentas, processo", border: "raios pequenos (6–12px)", shadow: "sombras duras", decoration: "detalhes metálicos, linhas técnicas" },
  ),
  "Performance garage (limpo e forte)": T(
    { primary: "#0F766E", secondary: "#94A3B8", accent: "#2DD4BF", background: "#0F172A", foreground: "#F1F5F9", muted: "#94A3B8", cta: "#2DD4BF", ctaContrast: "#06201C" },
    "Space Grotesk", "Inter", "500 700", "400 500", "garagem performance, limpo e forte",
    "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&display=swap",
    { hero: "de performance com veículo em destaque e headline de resultado", container: "máx 1200px", alignment: "esquerda, forte", density: "média-alta", sectionRhythm: "seções técnicas", cards: "cards com destaque de performance", cta: "CTA teal elétrico", images: "carro, oficina, diagnóstico", border: "raios médios (10–16px)", shadow: "sombras profundas + glow teal", decoration: "detalhes automotivos, gradiente escuro" },
  ),
  "Organic Premium (acolhedor, não infantil)": T(
    { primary: "#065F55", secondary: "#D9A441", accent: "#F2C14E", background: "#F7F5EF", foreground: "#16211E", muted: "#6E7B72", cta: "#065F55", ctaContrast: "#FFFFFF" },
    "Nunito", "Inter", "700 800", "400 500", "orgânico premium acolhedor, amigável sem infantil",
    "https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&family=Inter:wght@400;500&display=swap",
    { hero: "com animal em contexto de cuidado (grooming/banho)", container: "máx 1160px", alignment: "centrado, acolhedor", density: "média", sectionRhythm: "seções de cuidado", cards: "cards amigáveis com imagem de serviço", cta: "CTA verde com hover", images: "cuidado, grooming, ambiente", border: "raios generosos (16–24px)", shadow: "sombras suaves", decoration: "formas arredondadas, tons orgânicos" },
  ),
  "Spa Pet sofisticado": T(
    { primary: "#6B7A5A", secondary: "#C9A961", accent: "#E3D3B4", background: "#F8F6F0", foreground: "#2B2B23", muted: "#7A7A6A", cta: "#6B7A5A", ctaContrast: "#FFFFFF" },
    "Lora", "Inter", "500 600", "400 500", "spa pet sofisticado, sereno e elegante",
    "https://fonts.googleapis.com/css2?family=Lora:wght@500;600&family=Inter:wght@400;500&display=swap",
    { hero: "de spa animal com ambiente sereno e headline de bem-estar", container: "máx 1120px", alignment: "centrado, calmo", density: "baixa-média", sectionRhythm: "seções de spa espaçadas", cards: "cards serenos com imagem", cta: "CTA verde-sálvia", images: "spa pet, ambiente sereno", border: "raios generosos (16–24px)", shadow: "sombras leves", decoration: "formas orgânicas, texturas suaves" },
  ),
  "Playful-edit (energético, não infantil)": T(
    { primary: "#F97316", secondary: "#22B8CF", accent: "#FACC15", background: "#FFF8EF", foreground: "#2B1B0E", muted: "#8A6A4A", cta: "#F97316", ctaContrast: "#FFFFFF" },
    "Poppins", "Inter", "700 800", "400 500", "energético e amigável, sem infantil",
    "https://fonts.googleapis.com/css2?family=Poppins:wght@700;800&family=Inter:wght@400;500&display=swap",
    { hero: "alegre com animal e ação", container: "máx 1200px", alignment: "centrado, vibrante", density: "alta", sectionRhythm: "blocos vivos", cards: "cards coloridos com imagem", cta: "CTA laranja vibrante", images: "animal em ação, alegre", border: "raios grandes (18–28px)", shadow: "sombras coloridas", decoration: "formas geométricas, cores vivas" },
  ),
  "Modern Premium": T(
    { primary: "#7C3AED", secondary: "#22D3EE", accent: "#F59E0B", background: "#0B0E14", foreground: "#F5F7FA", muted: "#9AA3AE", cta: "#7C3AED", ctaContrast: "#FFFFFF" },
    "Space Grotesk", "Inter", "500 700", "400 500", "moderno premium com acento de marca e gradiente",
    "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&display=swap",
    { hero: "claro que mostra o que o negócio faz e por que importa", container: "máx 1200px", alignment: "centrado no hero, esquerda no corpo", density: "média", sectionRhythm: "seções alternadas", cards: "cards glass com hover", cta: "CTA com gradiente de marca", images: "contextuais ao negócio", border: "raios médios (12–20px)", shadow: "sombras + glow do accent", decoration: "glow/aura + grid sutil" },
  ),
};

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
    const tokens = TOKENS[FALLBACK_ARCHETYPE] ?? Object.values(TOKENS)[0];
    const arch = [
      "hero → proposta de valor → serviços → diferenciais → contato/CTA",
      "hero → sobre (o que torna único) → serviços/experiência → por que escolher → contato",
      "hero → o problema que resolve → como resolve → prova (sem inventar) → ação",
    ];
    const ai = seedOf(businessName, segment);
    return {
      businessName,
      segment: segment || "negócio",
      position: FALLBACK.position,
      sensation: FALLBACK.sensation,
      archetype: FALLBACK_ARCHETYPE,
      paletteHint: "neutros sofisticados com um acento de marca (evite o azul 'template')",
      typeHint: "sans moderna + display para destaques (escolha com personalidade)",
      heroStrategy: "hero claro que mostra o que o negócio faz e por que importa",
      architecture: arch,
      architectureChoice: arch[ai % arch.length],
      imageQueries: FALLBACK.imageQueries,
      copyDirection: FALLBACK.copyDirection,
      antiTemplate: FALLBACK.antiTemplate,
      tokens,
    };
  }

  const { loose, variants } = niche.set;
  const v = pick(variants, businessName, segment);
  const tokens = TOKENS[v.archetype];
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
  const ai = seedOf(businessName, segment);
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
    architectureChoice: v.architecture[ai % v.architecture.length],
    imageQueries,
    copyDirection: loose.copyDirection,
    antiTemplate: loose.antiTemplate,
    tokens,
  };
}

// Bloco ESTRUTURADO e EXECUTÁVEL para injetar na missão. Os tokens são decisões de
// design; o agente deve implementá-los — NÃO são sugestões genéricas. Ainda assim
// há liberdade de seções/componentes/UX (a direção define a LINGUAGEM, não um template).
export function formatCreativeBrief(brief: CreativeBrief): string {
  const t = brief.tokens;
  const pal = t.palette;
  const ty = t.typography;
  const c = t.composition;
  const queries = Object.entries(brief.imageQueries).map(([role, q]) => `   - ${role}: "${q}"`).join("\n");
  return `DESIGN TOKENS EXECUTÁVEIS (decisões de design para ESTE projeto — implemente como base real):

PALETA
- primary: ${pal.primary}
- secondary: ${pal.secondary}
- accent: ${pal.accent}
- background: ${pal.background}
- foreground: ${pal.foreground}
- muted: ${pal.muted}
- cta: ${pal.cta}
- ctaContrast: ${pal.ctaContrast}

TIPOGRAFIA
- heading: ${ty.heading} (weights ${ty.headingWeights}, style: ${ty.style})
- body: ${ty.body} (weights ${ty.bodyWeights})
- Google Fonts: ${ty.importUrl}

COMPOSIÇÃO
- hero: ${c.hero}
- container: ${c.container}
- alignment: ${c.alignment}
- density: ${c.density}
- sectionRhythm: ${c.sectionRhythm}
- cards: ${c.cards}
- cta: ${c.cta}
- images: ${c.images}
- border/radius: ${c.border}
- shadow: ${c.shadow}
- decoration: ${c.decoration}

ARQUITETURA ESCOLHIDA (execute esta, não escolha outra agora):
${brief.architectureChoice}

DIREÇÃO DE IMAGENS (referências de busca — NÃO é URL garantida; busque imagens que
correspondam a esta direção; use as queries abaixo como guia, nunca um banco fixo):
${queries}

POSICIONAMENTO: ${brief.position}
SENSAÇÃO: ${brief.sensation}
COPY: ${brief.copyDirection}
EVITE: ${brief.antiTemplate}`;
}
