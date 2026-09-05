// Niche Design Intelligence — perfil de direção criativa por nicho.
// Usado pelo generate-site (design brief) e por testes automatizados.
// Puro (sem Deno/sem rede) para rodar em testes e no edge.

export interface NicheDesign {
  cluster: string;
  objectives: string[];
  visualConcept: string;
  layoutArchetype: "editorial" | "corporate" | "minimal" | "luxury" | "bold" | "service_focused" | "local_business";
  heroComposition: "split" | "centered" | "editorial" | "statement" | "service_first";
  recommendedSections: string[];
  typographyDirection: string;
  colorDirection: string;
  imageStrategy: string;
  tone: string;
  cta: string;
  navStyle: "minimal" | "centered" | "boxed";
  density: "airy" | "balanced" | "dense";
  decorative: "none" | "low" | "medium";
  radius: "none" | "small" | "medium" | "large";
  interactionNotes: string;
}

const byKeyword: Array<{ keywords: string[]; profile: NicheDesign }> = [
  {
    keywords: ["clinica", "clinicas", "medico", "medicos", "saude", "saúde", "dentista", "psicologo", "fisioterapia", "estetica", "estética", "dermatologia", "veterinaria"],
    profile: {
      cluster: "saude_bem_estar",
      objectives: ["transmitir confiança e cuidado", "gerar agendamentos/consultas", "humanizar a marca"],
      visualConcept: "Limpo, sofisticado e acolhedor — hospitalidade clínica de alto padrão, com muito espaço negativo e hierarquia calma.",
      layoutArchetype: "service_focused",
      heroComposition: "split",
      recommendedSections: ["hero", "trust", "services", "features", "numbers", "about", "testimonials", "faq", "cta", "contact"],
      typographyDirection: "Serif elegante ou geométrica suave nos títulos + grotesca legível no corpo; escala grande controlada.",
      colorDirection: "Paleta sóbria e clara: azul-petróleo/teal ou azul escuro com neutros quentes; 1 cor de destaque reservada para CTA.",
      imageStrategy: "Fotografia limpa de ambiente/atendimento (ilustrativa) em tons suaves; imagens com moldura generosa e cantos leves.",
      tone: "Profissional, acolhedor, humano; frases curtas que traduzem cuidado.",
      cta: "Agendar atendimento",
      navStyle: "minimal",
      density: "airy",
      decorative: "low",
      radius: "medium",
      interactionNotes: "Hover suave em cards de serviço e botões; reveal delicado por seção.",
    },
  },
  {
    keywords: ["advogado", "advogados", "advocacia", "juridico", "jurídico", "contador", "contabilidade", "escritorio", "escritório"],
    profile: {
      cluster: "profissional_consultivo",
      objectives: ["autoridade e confiança", "gerar consultas/contato", "transmitir solidez institucional"],
      visualConcept: "Editorial e institucional — composição de revista de negócios, tipografia serif forte e cores profundas.",
      layoutArchetype: "editorial",
      heroComposition: "editorial",
      recommendedSections: ["hero", "trust", "about", "services", "features", "process", "testimonials", "cta", "contact"],
      typographyDirection: "Serif display (ex.: Playfair/Libre Baskerville) para títulos + sans humanista no corpo; tracking sóbrio.",
      colorDirection: "Azul-petróleo ou grafite profundo + off-white; contraste controlado; quase nenhuma cor decorativa.",
      imageStrategy: "Poucas imagens, editoriais e sóbrias; predominância de tipografia e espaço.",
      tone: "Sóbrio, direto, seguro; sem jargão vazio.",
      cta: "Falar com um especialista",
      navStyle: "centered",
      density: "balanced",
      decorative: "none",
      radius: "small",
      interactionNotes: "Linhas e sublinhados animados; transições discretas (sem efeitos chamativos).",
    },
  },
  {
    keywords: ["restaurante", "pizzaria", "hamburgueria", "lanchonete", "padaria", "confeitaria", "cafe", "café", "cafeteria", "churrascaria", "sorveteria", "doceria"],
    profile: {
      cluster: "alimentacao",
      objectives: ["despertar desejo", "gerar reservas/pedidos", "posicionar a experiência"],
      visualConcept: "Sensorial e marcante — tipografia display expressiva, imagens de produto em destaque, clima de desejo.",
      layoutArchetype: "bold",
      heroComposition: "split",
      recommendedSections: ["hero", "services", "features", "numbers", "about", "testimonials", "cta", "contact"],
      typographyDirection: "Display forte (condensada/expressiva) para títulos + sans legível no corpo; títulos com impacto.",
      colorDirection: "Fundo quente/creme com cor de marca marcante (vinho, mostarda, terracota) e neutros; CTA alto contraste.",
      imageStrategy: "Imagens grandes de produto/ambiente (ilustrativas) dominando a composição; tratamento generoso.",
      tone: "Apetitoso, direto, com personalidade; nomes e descrições curtas e evocativas.",
      cta: "Reservar / Fazer pedido",
      navStyle: "minimal",
      density: "balanced",
      decorative: "medium",
      radius: "large",
      interactionNotes: "Cards de prato com zoom sutil na imagem; botões com feedback imediato.",
    },
  },
  {
    keywords: ["arquitetura", "arquiteto", "design de interiores", "interiores", "paisagismo", "decoracao", "decoração"],
    profile: {
      cluster: "arquitetura_design",
      objectives: ["mostrar portfólio", "gerar contato para projetos", "transmitir bom gosto"],
      visualConcept: "Portfólio editorial — grandes imagens, composição assimétrica, tipografia forte e minimalista.",
      layoutArchetype: "editorial",
      heroComposition: "editorial",
      recommendedSections: ["hero", "trust", "services", "features", "about", "testimonials", "cta", "contact"],
      typographyDirection: "Sans geométrica ou serif de moda; escala grande; muito espaço.",
      colorDirection: "Neutros arquitetônicos (grafite, concreto, off-white) com um acento contido.",
      imageStrategy: "Imagens em áreas amplas (ilustrativas de ambientes) com grids editoriais.",
      tone: "Refinado, direto, com vocabulário do segmento.",
      cta: "Solicitar projeto",
      navStyle: "boxed",
      density: "airy",
      decorative: "none",
      radius: "small",
      interactionNotes: "Reveal de imagens; hovers discretos; navegação fixa elegante.",
    },
  },
  {
    keywords: ["oficina", "mecanica", "mecânica", "automotivo", "autopecas", "autopeças", "funilaria", "pneu", "som automotivo", "lavagem"],
    profile: {
      cluster: "automotivo",
      objectives: ["gerar orçamentos e agendamentos", "transmitir confiança técnica", "deixar serviços claros"],
      visualConcept: "Robusto, objetivo e técnico — alta legibilidade, informações comerciais claras e CTA forte.",
      layoutArchetype: "service_focused",
      heroComposition: "service_first",
      recommendedSections: ["hero", "services", "features", "process", "numbers", "testimonials", "cta", "contact"],
      typographyDirection: "Sans forte e utilitária (peso alto nos títulos), sem ornamentos.",
      colorDirection: "Grafite/azul-escuro com laranja/amarelo técnico para CTA; contraste alto.",
      imageStrategy: "Fotos de serviços/oficina (ilustrativas); menos decoração, mais informação.",
      tone: "Objetivo, confiável, próximo; números e serviços bem organizados.",
      cta: "Solicitar orçamento",
      navStyle: "minimal",
      density: "balanced",
      decorative: "low",
      radius: "medium",
      interactionNotes: "Botões grandes e visíveis; hover com destaque claro.",
    },
  },
  {
    keywords: ["salao", "salão", "beleza", "cabeleireiro", "barbearia", "esteticista", "manicure", "sobrancelha", "unhas"],
    profile: {
      cluster: "beleza",
      objectives: ["agendamentos", "posicionar qualidade/estética", "mostrar ambiente e resultados"],
      visualConcept: "Refinado e sofisticado, sem estereótipos — tons neutros elegantes com tipografia de moda.",
      layoutArchetype: "luxury",
      heroComposition: "split",
      recommendedSections: ["hero", "services", "features", "about", "testimonials", "cta", "contact"],
      typographyDirection: "Serif sofisticada ou sans de moda; pesos refinados; escala generosa.",
      colorDirection: "Neutros quentes (creme, caramelo, grafite) com acento metálico/terroso; nada de rosa-choque padrão.",
      imageStrategy: "Imagens elegantes de ambiente/detalhes (ilustrativas), clima editorial.",
      tone: "Elegante, pessoal, aspiracional porém acessível.",
      cta: "Agendar horário",
      navStyle: "centered",
      density: "airy",
      decorative: "low",
      radius: "large",
      interactionNotes: "Transições suaves; preview de serviços com hover refinado.",
    },
  },
];

const FALLBACK: NicheDesign = {
  cluster: "geral",
  objectives: ["gerar contato qualificado", "apresentar serviços com clareza", "transmitir confiança local"],
  visualConcept: "Direção visual limpa e profissional com personalidade própria do segmento; composição equilibrada e moderna.",
  layoutArchetype: "service_focused",
  heroComposition: "split",
  recommendedSections: ["hero", "trust", "services", "features", "about", "cta", "contact"],
  typographyDirection: "Par de fontes contemporâneo e coerente (display + body); escala clara e legível.",
  colorDirection: "Paleta funcional com 1–2 cores de marca + neutros; contraste legível; cor de CTA distinta.",
  imageStrategy: "Imagens ilustrativas do ambiente/serviço quando aplicável; caso contrário composição tipográfica forte.",
  tone: "Direto, profissional e específico do segmento; sem clichês vazios.",
  cta: "Falar conosco",
  navStyle: "minimal",
  density: "balanced",
  decorative: "low",
  radius: "medium",
  interactionNotes: "Hover suave e reveal discreto por seção.",
};

export function normSeg(segment: string): string {
  return segment.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function getNicheDesign(segment: string): NicheDesign {
  const s = normSeg(segment || "");
  for (const entry of byKeyword) {
    if (entry.keywords.some((k) => s.includes(normSeg(k)))) return entry.profile;
  }
  return FALLBACK;
}

export function suggestedSections(segment: string): string[] {
  return getNicheDesign(segment).recommendedSections;
}

// Descritor compacto para instruir o modelo (evita vazar estruturas gigantes).
export function buildDesignBrief(segment: string): Record<string, string[]> {
  const d = getNicheDesign(segment);
  return {
    objectives: d.objectives,
    visualConcept: [d.visualConcept],
    layout: [d.layoutArchetype, d.heroComposition, d.navStyle, d.density],
    typography: [d.typographyDirection],
    colors: [d.colorDirection],
    images: [d.imageStrategy],
    tone: [d.tone],
    cta: [d.cta],
    recommendedSections: d.recommendedSections,
    interactions: [d.interactionNotes],
  };
}
