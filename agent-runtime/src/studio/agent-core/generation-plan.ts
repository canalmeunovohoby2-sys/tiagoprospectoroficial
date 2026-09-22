/**
 * PLANEJAMENTO DETERMINÍSTICO (inspirado no fluxo público do Lovable: entender → estrutura →
 * direção → imagens → implementar). NÃO é uma chamada de LLM: é um objeto montado com o que o
 * runtime JÁ sabe (negócio + segmento + vertical + direção), entregue à missão da 1ª geração.
 *
 * Regra de escopo: primeira geração e mudança estrutural → plano; edição localizada → NÃO
 * (a classificação `isSurgicalEditTask` já garante o caminho curto).
 */
export interface GenerationPlan {
  objetivo: string;
  secoes: string[];
  mensagemPrincipal: string;
  cta: string;
  direcaoVisual: string;
  imagensNecessarias: Array<{ secao: string; intencao: string }>;
  necessidadesTecnicas: string[];
}

export interface PlanInput {
  businessName?: string;
  segment?: string;
  city?: string;
  state?: string;
  direcaoVisual?: string;
  whatsapp?: string | null;
  address?: string | null;
}

const JORNADAS: Array<{ match: RegExp; secoes: string[]; cta: string; imagens: string[] }> = [
  {
    match: /energia\s*solar|fotovoltaic|painel solar/i,
    secoes: ["Hero com instalação real", "Tipos de telhado/terreno atendidos", "Economia na conta de luz (dados)", "Processo: visita → projeto → instalação → homologação", "Provas e cases por perfil (residencial/rural/comercial)", "FAQ (financiamento, homologação, retorno)", "Contato + localização"],
    cta: "Agendar visita técnica",
    imagens: ["instalação fotovoltaica residencial", "painéis solares em telhado", "inversor solar em parede técnica", "equipe instalando módulos"],
  },
  {
    match: /academia|fitness|crossfit|pilates|personal/i,
    secoes: ["Hero com treino real", "Modalidades/planos", "Estrutura e equipamentos", "Professores", "Resultados (só reais)", "Horários e planos", "Aula experimental"],
    cta: "Agendar aula experimental",
    imagens: ["treino de força em academia", "equipamentos de musculação", "aula coletiva de fitness", "personal trainer orientando aluno"],
  },
  {
    match: /odonto|dentista|dental/i,
    secoes: ["Hero com consultório real", "Especialidades", "Equipe e registro", "Estrutura e tecnologia", "Como é a primeira consulta", "FAQ (convênio, parcelamento, dor)", "Agendamento"],
    cta: "Agendar avaliação",
    imagens: ["consultório odontológico moderno", "dentista atendendo paciente", "equipamentos odontológicos", "recepção de clínica"],
  },
  {
    match: /restaurante|pizzaria|hamburgueria|bar\b|cafeteria|doceria|padaria/i,
    secoes: ["Hero com prato assinatura", "Menu com destaques", "Ambiente", "Como pedir (delivery/retirada)", "Avaliações", "Localização e horários"],
    cta: "Pedir agora",
    imagens: ["prato pronto servido", "cozinha em operação", "ambiente do restaurante", "mesa com clientes"],
  },
  {
    match: /usinagem|serralheria|marcenaria|metal|cnc|torno/i,
    secoes: ["Hero com processo na fábrica", "Capacidades (máquinas/tolerâncias/materiais)", "Aplicações e segmentos", "Portfólio com medidas", "Prazos e garantia", "Solicitar orçamento (upload de desenho)"],
    cta: "Solicitar orçamento",
    imagens: ["torno CNC usinando metal", "peça metálica finalizada", "fábrica industrial em operação", "inspeção de qualidade com paquímetro"],
  },
];

const GENERICA = {
  secoes: ["Hero com a proposta de valor", "Prova de competência (serviços/portfólio)", "Como funciona o atendimento", "Diferenciais objetivos", "Prova social (só reais)", "FAQ de objeções", "Contato + localização"],
  cta: "Falar no WhatsApp",
  imagens: ["o serviço em execução", "o ambiente/estrutura do negócio", "detalhe do produto ou processo", "atendimento ao cliente"],
};

function jornada(segmento: string) {
  return JORNADAS.find((j) => j.match.test(segmento)) ?? GENERICA;
}

export function buildGenerationPlan(input: PlanInput): GenerationPlan {
  const segmento = String(input.segment ?? "").trim();
  const j = jornada(segmento);
  const negocio = String(input.businessName ?? "").trim() || "o negócio";
  const onde = [input.city, input.state].filter(Boolean).join("/");
  return {
    objetivo: `Gerar o site institucional de ${negocio}${segmento ? ` (${segmento})` : ""}${onde ? ` em ${onde}` : ""}, focado em conversão local.`,
    secoes: j.secoes,
    mensagemPrincipal: `O resultado que o cliente ganha contratando ${negocio} (não a lista de features) — específico do segmento.`,
    cta: String(input.whatsapp ?? "").trim() ? `${j.cta} (WhatsApp real disponível)` : j.cta,
    direcaoVisual: String(input.direcaoVisual ?? "").trim() || "definida pela DIREÇÃO DE ARTE do projeto (mood, paleta, tipografia, composição, imagem)",
    imagensNecessarias: j.secoes.map((secao, i) => ({ secao, intencao: j.imagens[i % j.imagens.length] })),
    necessidadesTecnicas: [
      "React + TS + Vite + Tailwind na stack existente (não trocar)",
      "tokens/CSS variables para a identidade (evitar valores soltos)",
      addressObrigatorio(input) ? "seção de contato com endereço/localização (área semântica, nunca no meio da narrativa)" : "seção de contato (endereço apenas se existir dado real)",
      String(input.whatsapp ?? "").trim() ? "botão de WhatsApp com link wa.me do número real" : "sem WhatsApp real → não criar botão",
      "preview renderizado + 1 quality pass (erros objetivos) antes de concluir",
    ],
  };
}

function addressObrigatorio(input: PlanInput): boolean {
  return Boolean(String(input.address ?? "").trim());
}

/** Bloco curto e objetivo que entra na missão da 1ª geração. */
export function formatGenerationPlan(p: GenerationPlan): string {
  return [
    "SUGESTAO ESTRUTURAL (o agente decide; reordene/adapte/ignore o que nao fizer sentido — ordem: entender → estrutura → direção → imagens → implementar → validar):",
    `- Objetivo: ${p.objetivo}`,
    `- Mensagem principal: ${p.mensagemPrincipal}`,
    `- Estrutura sugerida (adapte à natureza do negócio, não vire template): ${p.secoes.join(" → ")}`,
    `- CTA principal: ${p.cta}`,
    `- Direção visual: ${p.direcaoVisual}`,
    `- Imagens necessárias (use image_plan/get-images por seção, com curadoria): ${p.imagensNecessarias.map((i) => `${i.secao} = ${i.intencao}`).join(" | ")}`,
    `- Requisitos técnicos: ${p.necessidadesTecnicas.join("; ")}`,
    "- Depois de implementar: preview + corrigir erros objetivos + 1 quality pass.",
  ].join("\n");
}
