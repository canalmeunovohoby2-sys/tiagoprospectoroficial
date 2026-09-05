// Quick Strategies (5.27) — camada reutilizável de comandos rápidos do editor.
// Cada comando gera uma MISSÃO profissional completa para o Cline Agent
// (analisar → decidir → executar → testar → criticar → corrigir → verificar),
// não um prompt solto. O agente real, as ferramentas (browser/Gemini Vision),
// autosave, versionamento e os guards (Completion/Generation) continuam sendo
// os mesmos. Puro e testável.

export type StrategyId =
  | "premium_design"
  | "improve_design"
  | "analyze_site"
  | "optimize_mobile"
  | "improve_images"
  | "improve_copy"
  | "improve_conversion"
  | "full_audit";

export interface QuickStrategy {
  id: StrategyId;
  label: string;
  emoji: string;
  /** true = somente analisar e relatar (NÃO altera arquivos). */
  analyzeOnly: boolean;
  /** Descrição curta exibida no tooltip do botão. */
  hint: string;
}

export const QUICK_STRATEGIES: QuickStrategy[] = [
  { id: "premium_design", label: "Aplicar Design Premium", emoji: "✨", analyzeOnly: false, hint: "Direção de arte, composição, identidade, tipografia e espaçamento em nível de agência." },
  { id: "improve_design", label: "Melhorar Design", emoji: "🎨", analyzeOnly: false, hint: "Refinar cores, ritmo, hierarquia e seções genéricas." },
  { id: "analyze_site", label: "Analisar Site", emoji: "🔎", analyzeOnly: true, hint: "Relatório técnico e visual do código/site (não altera nada)." },
  { id: "optimize_mobile", label: "Otimizar Mobile", emoji: "📱", analyzeOnly: false, hint: "Responsividade real: sem overflow, mobile/tablet/desktop." },
  { id: "improve_images", label: "Melhorar Imagens", emoji: "🖼️", analyzeOnly: false, hint: "Imagens contextuais, distintas e bem tratadas." },
  { id: "improve_copy", label: "Melhorar Textos", emoji: "✍️", analyzeOnly: false, hint: "Copy focada em benefício e conversão (sem inventar dados)." },
  { id: "improve_conversion", label: "Melhorar Conversão", emoji: "📈", analyzeOnly: false, hint: "CTAs, prova e arquitetura de conversão." },
  { id: "full_audit", label: "Auditoria Completa", emoji: "🧪", analyzeOnly: false, hint: "Código + UX/UI + conteúdo + imagens + links + responsividade + console + conversão." },
];

export interface StrategyContext {
  name?: string | null;
  segment?: string | null;
}

// Núcleo do ciclo profissional (anti-preguiça) usado por todas as estratégias
// que ALTERAM. Fica fora da instrução em si (o prompt do agente já traz a
// identidade), mas reafirma o modo de trabalho e o uso de ferramentas.
const CYCLE = `Trabalhe em ciclos: analisar o estado real (leia arquivos e, se disponível, abra o site no navegador) → decidir a melhor solução → executar alterações reais no código → testar (desktop e mobile) → criticar → corrigir → melhorar → verificar. Evidência é obrigatória: só relate o que realmente alterou.`;

// Seções usadas nas instruções que exigem navegação contextual segura.
function businessLine(ctx: StrategyContext): string {
  const parts = [ctx.name && `Empresa: ${ctx.name}`, ctx.segment && `Segmento: ${ctx.segment}`];
  return parts.filter(Boolean).join(" · ") || "negócio";
}

function buildCommon(extra: string, ctx: StrategyContext): string {
  return `Você está trabalhando no site deste negócio: ${businessLine(ctx)}.\n${extra}`;
}

// Monta a instrução (missão) para o Cline de cada comando.
export function buildStrategyInstruction(id: StrategyId, ctx: StrategyContext): string {
  switch (id) {
    case "premium_design":
      return buildCommon(
        `APLICAR DESIGN PREMIUM. ${CYCLE}
Analise o negócio, público e direção desejada; depois implemente melhorias coordenadas e reais para elevar a QUALIDADE VISUAL: composição e ritmo entre seções (nada de cards empilhados), hierarquia tipográfica, identidade (paleta própria do segmento), espaçamento, header/nav, hero marcante, CTAs, footer completo, responsividade e microinterações. Abra o site (browser) e, quando possível, use visual_review (Gemini) para validar antes de finalizar. NÃO invente dados; NÃO use a mesma imagem repetida.`,
        ctx,
      );

    case "improve_design":
      return buildCommon(
        `MELHORAR DESIGN. ${CYCLE}
Leia o site atual e refine o design de forma coordenada: paleta, tipografia, hierarquia, seções que parecem genéricas, cards, espaçamento, hero e consistência. Mantenha a identidade do negócio e os dados reais. Valide no browser (desktop/mobile).`,
        ctx,
      );

    case "analyze_site":
      return buildCommon(
        `ANÁLISE COMPLETA (SOMENTE LEITURA — NÃO altere nenhum arquivo e não use write/edit/delete).
Leia os arquivos e, se disponível, abra o site no navegador (browser_open/inspect, console, links, mobile) e use visual_review quando possível. Produza um RELATÓRIO em pt-BR com: o que está bom, problemas reais encontrados (composição, hierarquia, contraste, imagens, CTA, navegação, responsividade, console, links, conteúdo, conversão) e recomendações concretas por prioridade. Seja honesto: só relate o que verificou.`,
        ctx,
      );

    case "optimize_mobile":
      return buildCommon(
        `OTIMIZAR MOBILE. ${CYCLE}
Abra o site, teste em mobile (browser_set_viewport mobile) e desktop; identifique overflow horizontal, textos apertados, botões/CTAs difíceis de tocar, grids que quebram e imagens que estouram o viewport. Corrija o CSS/HTML de verdade para funcionar bem em mobile, tablet e desktop. Revalide no browser após corrigir.`,
        ctx,
      );

    case "improve_images":
      return buildCommon(
        `MELHORAR IMAGENS. ${CYCLE}
Avalie as imagens atuais: contexto com o negócio/serviço, coerência e variedade (NUNCA a mesma imagem repetida). Corrija/substitua o que for inadequado e aplique tratamento visual (proporção, object-fit, sobreposição/overlay quando couber). Use imagens reais contextualizadas (Unsplash de alta resolução, 2-3+ distintas e coerentes). NÃO invente.`,
        ctx,
      );

    case "improve_copy":
      return buildCommon(
        `MELHORAR TEXTOS/COPY. ${CYCLE}
Revise a copy do site: clareza, benefício, tom do segmento e hierarquia da mensagem. Reescreva o que estiver genérico ou fraco em pt-BR, com foco em conversão. NUNCA invente endereço/telefone/horários/preços/avaliações/certificações/resultados/serviços não fornecidos; se faltar dado, use texto neutro.`,
        ctx,
      );

    case "improve_conversion":
      return buildCommon(
        `MELHORAR CONVERSÃO (CRO). ${CYCLE}
Analise a jornada: hero (mensagem + CTA principal), clareza do que é oferecido, seções de valor, prova (apenas com dados reais), CTAs posicionados e o que leva à ação (WhatsApp/agendar/contato). Melhore o que estiver fraco no código. NÃO invente dados.`,
        ctx,
      );

    case "full_audit":
      return buildCommon(
        `AUDITORIA COMPLETA. ${CYCLE}
Verifique: código (arquivos, HTML/CSS válidos, classes usadas existem), UX/UI (composição, hierarquia, contraste, identidade), conteúdo (sem invenção, sem placeholder), imagens (contextuais, sem repetição), links/anchors, responsividade (mobile/desktop, sem overflow), console/erros e conversão (CTAs). Abra o site no browser e use visual_review quando possível. CORRIJA apenas o que for apropriado e com evidência; relate o que foi corrigido.`,
        ctx,
      );

    default:
      return buildCommon(`Revise o site e aplique melhorias profissionais reais. ${CYCLE}`, ctx);
  }
}

export function strategyById(id: string): QuickStrategy | undefined {
  return QUICK_STRATEGIES.find((s) => s.id === id);
}
