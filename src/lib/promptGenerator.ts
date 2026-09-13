// ============================================================================
// CRIADOR DE PROMPT PREMIUM (determinístico, SEM IA/API).
//
// Transforma poucas informações do cliente em um briefing/prompt de altíssimo
// nível para o gerador de sites do Studio. As decisões de estratégia, arquitetura,
// direção criativa, copy, motion, mobile, SEO e tracking são tomadas AQUI — o
// usuário não precisa escrever nada disso.
//
// Regras: nada de dados factuais inventados (números, clientes, anos, prêmios,
// certificações, endereço, telefone, avaliações). Quando faltar um fato, o prompt
// instrui a DEIXAR PLACEHOLDER para substituição.
// ============================================================================

export const OBJECTIVE_OPTIONS = [
  "Gerar contatos",
  "Vender produtos/serviços",
  "Apresentar a empresa",
  "Gerar leads",
  "Agendar atendimento",
  "Receber pedidos no WhatsApp",
  "Outro",
] as const;

export const STYLE_OPTIONS = [
  "Premium",
  "Moderno",
  "Sofisticado",
  "Minimalista",
  "Impactante",
  "Elegante",
  "Tecnológico",
  "Artesanal",
  "Luxuoso",
  "Você decide",
] as const;

export interface PromptInput {
  companyName: string;
  segment: string;
  location?: string;
  offers?: string;
  audience?: string;
  differentials?: string;
  objectives: string[];
  styles: string[];
  reference?: string;
  /** Variação determinística: "Regenerar" incrementa para mudar escolhas criativas. */
  variantSeed?: number;
}

interface Palette { name: string; primary: string; secondary: string; accent: string; bg: string; surface: string; ink: string; muted: string; }
interface Archetype {
  key: string;
  label: string;
  sections: string[];
  imagery: string;
  mood: string;
  motion: string;
  typography: [string, string][];
}

const PALETTES: Palette[] = [
  { name: "verde profundo + areia", primary: "#0F5132", secondary: "#146C43", accent: "#C8A24A", bg: "#F7F5F0", surface: "#FFFFFF", ink: "#12211A", muted: "#5B6B60" },
  { name: "azul petróleo + cobre", primary: "#0E3A5B", secondary: "#155E84", accent: "#B87333", bg: "#F5F7FA", surface: "#FFFFFF", ink: "#0B1720", muted: "#5A6B78" },
  { name: "grafite + âmbar", primary: "#1F2937", secondary: "#374151", accent: "#D97706", bg: "#FAFAF9", surface: "#FFFFFF", ink: "#111827", muted: "#6B7280" },
  { name: "vinho + rosé", primary: "#5B1E2D", secondary: "#7A2E40", accent: "#D8A7A0", bg: "#FBF7F5", surface: "#FFFFFF", ink: "#2A1218", muted: "#7A5A61" },
  { name: "oliva + terracota", primary: "#4B5320", secondary: "#6B732F", accent: "#C65D3B", bg: "#F6F5EF", surface: "#FFFFFF", ink: "#1E2413", muted: "#6B7150" },
  { name: "azul-noite + ciano", primary: "#0B1D3A", secondary: "#12315E", accent: "#22D3EE", bg: "#F4F7FB", surface: "#FFFFFF", ink: "#0A1526", muted: "#5A6B85" },
];

const ARCHETYPES: Archetype[] = [
  {
    key: "saude", label: "Saúde / clínica",
    sections: ["Hero com promessa clara e CTA de agendamento", "Problema/dor que o paciente reconhece", "Especialidades e tratamentos (cards com ícone + benefício)", "Como funciona a primeira consulta (passo a passo)", "Equipe/profissionais (com espaço para credenciais reais)", "Estrutura e tecnologia do espaço", "Prova social (depoimentos reais somente)", "Perguntas frequentes", "Localização e horários", "CTA final de agendamento"],
    imagery: "fotos reais do consultório e de atendimento humano (não banco de imagem genérico de 'sorriso de banco')",
    mood: "acolhedor, confiável e clínico, sem frieza",
    motion: "sutil (reveal suave + hovers discretos)",
    typography: [["Fraunces", "Inter"], ["Cormorant Garamond", "Jost"], ["Playfair Display", "Source Sans 3"]],
  },
  {
    key: "juridico", label: "Jurídico / advocacia",
    sections: ["Hero institucional sóbrio + CTA de contato", "Áreas de atuação (lista estruturada)", "Como o escritório conduz um caso (método)", "Diferenciais e princípios", "Sócios/equipe (com espaço para OAB e formação reais)", "Resultados/publicações reais (somente se houver fonte)", "Depoimentos reais", "Perguntas frequentes", "Contato e localização", "CTA final"],
    imagery: "arquitetura sóbria, detalhes de escritório e retratos editoriais discretos",
    mood: "autoridade, serenidade e tradição contemporânea",
    motion: "mínimo (transições elegantes, sem chamar atenção)",
    typography: [["Playfair Display", "Source Sans 3"], ["Libre Baskerville", "Inter"], ["Fraunces", "Inter"]],
  },
  {
    key: "gastronomia", label: "Gastronomia / food",
    sections: ["Hero apetitoso com prato-assinatura", "Proposta conceitual do lugar", "Menu por categorias (com itens reais ou placeholders)", "Experiência/ambiente", "Ingredientes e origem", "Destaques e especialidades", "Depoimentos reais", "Reservas/pedidos (WhatsApp ou agendamento)", "Localização, horários e mapa", "CTA final"],
    imagery: "fotografia gastronômica real, close-ups com textura; evitar stock",
    mood: "sensorial, convidativo e cheio de textura",
    motion: "moderado (parallax sutil nas fotos + reveal)",
    typography: [["Fraunces", "Inter"], ["Cormorant Garamond", "Jost"], ["Space Grotesk", "Inter"]],
  },
  {
    key: "servicos_tecnicos", label: "Serviços técnicos / instalação",
    sections: ["Hero orientado a serviço + orçamento", "Serviços oferecidos (cards com escopo)", "Como trabalhamos (fluxo de atendimento)", "Diferenciais técnicos e garantias (somente reais)", "Obras/projetos realizados (fotos reais)", "Depoimentos reais", "Regiões atendidas", "Orçamento em poucos passos", "Perguntas frequentes", "CTA final de orçamento"],
    imagery: "fotos reais de instalações, equipes e antes/depois",
    mood: "confiável, técnico e direto",
    motion: "sutil",
    typography: [["Space Grotesk", "Inter"], ["Sora", "Inter"], ["Manrope", "Inter"]],
  },
  {
    key: "fitness", label: "Fitness / bem-estar",
    sections: ["Hero com transformação/objetivo", "Modalidades e planos", "Como começar (avaliação/primeira aula)", "Estrutura e equipamentos", "Professores (espaço para credenciais reais)", "Resultados reais (somente com fonte)", "Depoimentos reais", "Horários e localização", "Agende sua aula experimental", "CTA final"],
    imagery: "fotos reais de treino e estrutura, movimento autêntico",
    mood: "energético, motivador e humano",
    motion: "moderado (reveal + hovers)",
    typography: [["Space Grotesk", "Inter"], ["Sora", "Inter"], ["Manrope", "Inter"]],
  },
  {
    key: "beleza", label: "Beleza / estética",
    sections: ["Hero com resultado/experiência", "Serviços e protocolos", "Antes/depois (fotos reais)", "Profissionais e especialidades", "Ambiente e experiência", "Produtos e tecnologia", "Depoimentos reais", "Pacotes e agendamento", "Localização e horários", "CTA final de agendamento"],
    imagery: "fotos reais de resultados e do espaço; luz natural",
    mood: "sofisticado, sensorial e cuidadoso",
    motion: "moderado",
    typography: [["Fraunces", "Inter"], ["Cormorant Garamond", "Jost"], ["Playfair Display", "Source Sans 3"]],
  },
  {
    key: "educacao", label: "Educação / cursos",
    sections: ["Hero com proposta de valor do curso/escola", "Trilhas/cursos (cards)", "Metodologia", "Corpo docente (espaço para credenciais reais)", "Estrutura e recursos", "Depoimentos de alunos reais", "Calendário/turmas (com placeholders)", "Matrícula (formulário ou WhatsApp)", "Perguntas frequentes", "CTA final"],
    imagery: "fotos reais de aulas, alunos e ambiente",
    mood: "inspirador, claro e organizado",
    motion: "sutil",
    typography: [["Sora", "Inter"], ["Space Grotesk", "Inter"], ["Manrope", "Inter"]],
  },
  {
    key: "tecnologia", label: "Tecnologia / serviços digitais",
    sections: ["Hero com problema resolvido", "Solução e como funciona", "Funcionalidades/benefícios", "Casos de uso (com espaço para números reais)", "Tecnologia/stack", "Segurança e integrações", "Depoimentos reais", "Planos/contato comercial", "FAQ", "CTA final"],
    imagery: "interface real do produto, telas e diagramas limpos",
    mood: "moderno, preciso e confiável",
    motion: "moderado (microinterações com propósito)",
    typography: [["Space Grotesk", "Inter"], ["Sora", "Inter"], ["Manrope", "Inter"]],
  },
  {
    key: "pets", label: "Pets / veterinária",
    sections: ["Hero afetivo com serviço", "Serviços (banho, tosa, consultas)", "Como cuidamos (passo a passo)", "Estrutura e segurança", "Equipe (espaço para credenciais reais)", "Depoimentos reais", "Agendamento pelo WhatsApp", "Localização e horários", "CTA final"],
    imagery: "fotos reais de pets sendo cuidados; evitar stock infantilizado",
    mood: "afetivo, alegre e confiável",
    motion: "sutil",
    typography: [["Fraunces", "Inter"], ["Manrope", "Inter"], ["Sora", "Inter"]],
  },
  {
    key: "imobiliario", label: "Imobiliário / construção",
    sections: ["Hero com empreendimento/região", "Imóveis em destaque (cards reais)", "Por que escolher", "Processo de compra/locação", "Tour/plantas", "Equipe/corretores (espaço para CRECI real)", "Depoimentos reais", "Simulação/contato", "Localização", "CTA final"],
    imagery: "fotos reais dos imóveis e plantas; nada genérico",
    mood: "aspiracional, sólido e confiável",
    motion: "sutil",
    typography: [["Playfair Display", "Source Sans 3"], ["Cormorant Garamond", "Jost"], ["Fraunces", "Inter"]],
  },
  {
    key: "eventos", label: "Eventos / criação",
    sections: ["Hero com portfólio", "Tipos de evento/serviço", "Processo criativo", "Galeria de trabalhos reais", "Depoimentos reais", "Como contratar", "FAQ", "Contato/orçamento", "CTA final"],
    imagery: "fotos reais de trabalhos realizados",
    mood: "criativo, inspirador e autoral",
    motion: "moderado",
    typography: [["Space Grotesk", "Inter"], ["Fraunces", "Inter"], ["Sora", "Inter"]],
  },
  {
    key: "automotivo", label: "Automotivo",
    sections: ["Hero com serviço principal", "Serviços/especialidades", "Como funciona", "Estrutura e equipamentos", "Serviços realizados (fotos reais)", "Depoimentos reais", "Orçamento rápido (WhatsApp)", "Localização e horários", "CTA final"],
    imagery: "fotos reais da oficina, veículos e equipe",
    mood: "técnico, confiável e direto",
    motion: "sutil",
    typography: [["Space Grotesk", "Inter"], ["Sora", "Inter"], ["Manrope", "Inter"]],
  },
  {
    key: "default", label: "Negócio local / serviços",
    sections: ["Hero com proposta clara + CTA", "O que oferecemos", "Por que nos escolher", "Como funciona", "Prova social real", "Perguntas frequentes", "Localização e contato", "CTA final"],
    imagery: "fotos reais do negócio, equipe e produtos",
    mood: "profissional, próximo e confiável",
    motion: "sutil",
    typography: [["Sora", "Inter"], ["Manrope", "Inter"], ["Space Grotesk", "Inter"]],
  },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const ARCHETYPE_RULES: Array<{ key: string; re: RegExp }> = [
  { key: "saude", re: /odont|dent|cl[íi]nic|m[ée]dic|sa[úu]de|fisio|psico|terap|nutri|fono|laborat|hospital/i },
  { key: "juridico", re: /advog|jur[íi]dic|direito|escrit[óo]rio de advocacia/i },
  { key: "gastronomia", re: /restaurante|pizza|hamburg|bar\b|padaria|confeitaria|doceria|cafeteria|bistr[ôo]|lanchonete|churrasc|food/i },
  { key: "servicos_tecnicos", re: /energia solar|el[ée]tric|encanad|climatiz|ar-condicionado|dedetiz|desentup|limpeza|reforma|pintur|marcen|vidra[çc]|serralher|marmor|constru|engenh|topograf|manuten[çc][ãa]o|jardinagem|paisagis|instala[çc][ãa]o/i },
  { key: "pets", re: /\bpet\b|petshop|banho e tosa|veterin/i },
  { key: "fitness", re: /academia|crossfit|pilates|personal|fitnes|funcional|gin[áa]stica|yoga/i },
  { key: "beleza", re: /sal[ãa]o|barbearia|est[ée]tica|depila|massoter|cosm[ée]tic|cabelo|unhas|sobrancelha/i },
  { key: "educacao", re: /escola|curso|idiomas|creche|faculdade|treinamento|profissionalizante/i },
  { key: "tecnologia", re: /software|\bti\b|tecnolog|startup|ag[êe]ncia digital|marketing|sistema|saas|aplicativo/i },
  { key: "imobiliario", re: /imobili[áa]r|corretor|incorporadora/i },
  { key: "eventos", re: /evento|buffet|fot[óo]graf|filmagem|audiovisual|casamento|festa|cerimonial/i },
  { key: "automotivo", re: /oficina|autope[çc]|auto center|mec[âa]nic|pneu|funilaria/i },
];

export function classifySegment(segment: string): Archetype {
  for (const r of ARCHETYPE_RULES) if (r.re.test(segment)) {
    const a = ARCHETYPES.find((x) => x.key === r.key);
    if (a) return a;
  }
  return ARCHETYPES.find((x) => x.key === "default")!;
}

function pickPalette(input: PromptInput, seed: number): Palette {
  const styleBias: Record<string, number> = { Premium: 1, Sofisticado: 3, Minimalista: 2, Impactante: 5, Elegante: 3, Tecnológico: 5, Artesanal: 4, Luxuoso: 3, Moderno: 0, "Você decide": -1 };
  const bias = input.styles.map((s) => styleBias[s] ?? -1).find((b) => b >= 0);
  if (bias !== undefined && bias >= 0) return PALETTES[(bias + seed) % PALETTES.length];
  return PALETTES[seed % PALETTES.length];
}

function normalizeObjectives(objectives: string[]): string[] {
  const chosen = objectives.filter((o) => OBJECTIVE_OPTIONS.includes(o as never));
  return chosen.length ? chosen : ["Gerar leads"];
}

function conversionStrategy(objectives: string[]): string[] {
  const out: string[] = [];
  if (objectives.includes("Receber pedidos no WhatsApp") || objectives.includes("Gerar contatos")) {
    out.push("WhatsApp como canal principal: botão visível no header, CTAs ao longo da página e, quando fizer sentido, botão flutuante. Usar link `wa.me` com mensagem pré-preenchida citando a página/serviço (sem inventar número — usar placeholder se o cliente não informou).");
  }
  if (objectives.includes("Gerar leads") || objectives.includes("Agendar atendimento")) {
    out.push("Formulário enxuto (nome + contato + necessidade), com o mínimo de campos para reduzir fricção; feedback claro de envio e alternativa por WhatsApp.");
  }
  if (objectives.includes("Vender produtos/serviços")) {
    out.push("Estrutura comercial: oferta clara, benefícios antes de preço, blocos de objeção e CTA de compra/orçamento repetido sem exagero.");
  }
  if (objectives.includes("Apresentar a empresa")) {
    out.push("Foco em credibilidade institucional: história, valores, equipe e estrutura — sem promessas comerciais fabricadas.");
  }
  if (objectives.includes("Agendar atendimento")) {
    out.push("Fluxo de agendamento simples: escolha de serviço, preferência de horário e confirmação por WhatsApp/formulário.");
  }
  if (out.length === 0) out.push("Definir UM objetivo de conversão principal por seção e um CTA final claro, sem espalhar chamadas concorrentes.");
  return out;
}

function copyPolicy(): string {
  return [
    "Escreva copy específica para ESTE negócio, em português do Brasil, tom natural e comercial.",
    "PROIBIDO: texto genérico, lorem ipsum, frases vazias e clichês de IA — ex.: “transformamos sonhos em realidade”, “soluções inovadoras para o seu negócio”, “excelência em tudo que fazemos”, excesso de adjetivos sem informação.",
    "Cada seção deve ter uma ideia concreta e útil; se não houver dado real, escreva de forma honesta e genérica apropriada, sem inventar.",
    "NUNCA invente como fato: número de clientes, anos de experiência, certificações, prêmios, endereço, telefone, avaliações, faturamento, quantidade de unidades, resultados ou depoimentos reais.",
    "Quando faltar um fato, deixe um marcador explícito para substituição, no formato [INSERIR …] (ex.: [INSERIR TELEFONE], [INSERIR ENDEREÇO], [INSERIR ANOS DE EXPERIÊNCIA], [DEPOIMENTO REAL]).",
    "Headline: 1 ideia principal com benefício concreto; subtítulo: como isso acontece; CTAs: verbo de ação + resultado (ex.: “Pedir orçamento”, “Agendar avaliação”).",
  ].join("\n- ");
}

export function buildPremiumPrompt(input: PromptInput): string {
  const name = (input.companyName ?? "").trim();
  const segment = (input.segment ?? "").trim();
  const location = (input.location ?? "").trim();
  const offers = (input.offers ?? "").trim();
  const audience = (input.audience ?? "").trim();
  const differentials = (input.differentials ?? "").trim();
  const reference = (input.reference ?? "").trim();
  const objectives = normalizeObjectives(input.objectives ?? []);
  const styles = (input.styles ?? []).filter((s) => (STYLE_OPTIONS as readonly string[]).includes(s));
  const styleLabel = styles.length ? styles.join(" + ") : "Você decide (escolha com base no segmento)";
  const arch = classifySegment(segment);
  const seed = hash(`${name}|${segment}|${input.variantSeed ?? 0}`);
  const palette = pickPalette({ ...input, styles }, seed);
  const [fontHeading, fontBody] = arch.typography[seed % arch.typography.length];
  const motionLevel = arch.motion;

  const facts = [
    `- Empresa: ${name}`,
    `- Segmento: ${segment}`,
    location ? `- Localização: ${location}` : "- Localização: [INSERIR CIDADE/REGIÃO]",
    offers ? `- O que oferece: ${offers}` : "- O que oferece: [INSERIR SERVIÇOS/PRODUTOS PRINCIPAIS]",
    audience ? `- Público-alvo: ${audience}` : "- Público-alvo: [INSERIR PÚBLICO-ALVO]",
    differentials ? `- Diferenciais: ${differentials}` : "- Diferenciais: [INSERIR DIFERENCIAIS REAIS]",
    `- Objetivo(s) do site: ${objectives.join(", ")}`,
    `- Estilo desejado: ${styleLabel}`,
    reference ? `- Referência/observação do usuário: ${reference}` : null,
  ].filter(Boolean).join("\n");

  const sections = [...arch.sections];
  if (objectives.includes("Receber pedidos no WhatsApp") || objectives.includes("Gerar contatos")) {
    if (!sections.some((s) => /whatsapp/i.test(s))) sections.push("Bloco explícito de contato por WhatsApp");
  }
  if (objectives.includes("Gerar leads") || objectives.includes("Agendar atendimento")) {
    if (!sections.some((s) => /formul|agend/i.test(s))) sections.push("Formulário de lead/agendamento (enxuto)");
  }

  return `# BRIEFING PREMIUM — SITE ${name?.toUpperCase() || "[NOME DO CLIENTE]"} (${arch.label})

Você é, ao mesmo tempo, DIRETOR DE ARTE, UX DESIGNER, COPYWRITER, DESENVOLVEDOR FRONT-END e ESTRATEGISTA DE CONVERSÃO. Entregue um site NOVO, original e de altíssimo acabamento (padrão de um projeto vendido por R$ 10.000), em HTML/CSS/JS no workspace deste projeto. Preserve o que já existir fora do escopo pedido e edite apenas o necessário para cumprir este briefing.

## 1. CONTEXTO DO NEGÓCIO
${facts}

## 2. POSICIONAMENTO (decida e siga)
- Posicione a marca como referência séria e específica no segmento "${segment}"${location ? `, atendendo ${location}` : ""}.
- Personalidade visual e atmosfera: ${arch.mood}.
- Evite qualquer linguagem genérica de template; cada decisão deve parecer feita sob medida para ${name || "o cliente"}.

## 3. OBJETIVO & ESTRATÉGIA DE CONVERSÃO
Objetivo principal: ${objectives.join(" / ")}.
- ${conversionStrategy(objectives).join("\n- ")}
- Um CTA principal por seção, com contraste e repetição coerente; nada de banners concorrentes.

## 4. DIREÇÃO CRIATIVA (decidida — não use sempre a mesma)
- Paleta (família "${palette.name}"): primary ${palette.primary} · secondary ${palette.secondary} · accent ${palette.accent} · fundo ${palette.bg} · superfícies ${palette.surface} · texto ${palette.ink} · texto suave ${palette.muted}. Use contraste real; accent com parcimônia.
- Tipografia: títulos em "${fontHeading}", corpo em "${fontBody}". Escala clara, line-height generoso, no máximo 2 famílias.
- Imagens/tratamento: ${arch.imagery}. Priorize imagens fornecidas pelo cliente; se não houver, escolha imagens coerentes com o segmento (sem stock desconectado).
- Cards: variação real de peso/tamanho conforme importância; cantos e sombras consistentes, sem repetir "caixinha igual".
- Bordas/sombras: discretas e coerentes; profundidade por contraste e espaço, não por excesso de efeitos.
- Espaçamento/ritmo: respiro generoso entre seções; ritmo alternando blocos densos e leves; grid intencional.
- PROIBIDO: excesso de gradientes, glassmorphism gratuito, aparência de "landing page de IA", hero genérico.

## 5. ARQUITETURA DO SITE (ordem sugerida — ajuste ao conteúdo real)
${sections.map((s, i) => `${i + 1}. ${s}`).join("\n")}
(Se alguma seção não fizer sentido para este negócio, adapte — não crie seções vazias.)

## 6. COPY (regras obrigatórias)
- ${copyPolicy()}
- Entregue: headline, subtítulo, CTAs, textos de serviços (título + benefício + detalhe), diferenciais, prova social (somente real), FAQ (3–6 perguntas úteis) e chamadas de conversão.

## 7. EXPERIÊNCIA VISUAL (padrão premium)
- Composição intencional, hierarquia clara, contraste e profundidade; seções com identidade própria (não todas iguais).
- Acabamento: alinhamentos precisos, ícones coerentes, estados de hover/focus, detalhes que mostram cuidado.
- Acessibilidade: contraste AA, foco visível, textos legíveis, alt em imagens.

## 8. ANIMAÇÕES / MOTION
- Nível: ${motionLevel}. Use reveal no scroll, hovers e microinterações COM PROPÓSITO (guiar o olhar), nunca por enfeite.
- Evite animações que atrapalhem leitura, causem layout shift ou prejudiquem performance. Respeite \`prefers-reduced-motion\`.

## 9. MOBILE (projete DESDE O INÍCIO)
- Desktop, tablet e mobile planejados juntos (não "só responsivo").
- Reorganize layout, ordem das informações, tamanhos, espaçamentos, navegação (menu claro), imagens (recorte/prioridade), tipografia e CTAs (acessíveis com o polegar).
- Sem overflow horizontal; teste larguras reais.

## 10. SEO BÁSICO
- \`<title>\` e meta description específicos do negócio; hierarquia correta de headings (um H1); HTML semântico; alt text descritivo; Open Graph básico; âncoras internas coerentes.
- Não invente informações comerciais no conteúdo de SEO.

## 11. TRACKING (estrutura pronta, SEM IDs inventados)
- Deixe pronta a estrutura para Meta Pixel, Google Analytics (GA4) e Google Tag Manager, com marcadores [META_PIXEL_ID], [GA4_ID], [GTM_ID].
- Prepare eventos de: clique em CTA, clique em WhatsApp e envio de formulário (sem disparar dados falsos). Se o cliente não forneceu IDs, deixe os pontos comentados para configuração posterior.

## 12. IMAGENS E ASSETS
- Use imagens relevantes ao segmento; quando o cliente fornecer arquivos, use-os (referência real ao arquivo, sem embutir base64 gigante).
- Não invente logos, certificações, prêmios ou selos que representem fatos inexistentes.

## 13. CHECKLIST DE QUALIDADE (R$ 10.000)
Direção artística coerente · estratégia de conversão clara · UX impecável · copy específica e honesta · design system consistente (cores, tipografia, espaçamento) · responsividade real · performance · microinterações com propósito · acessibilidade · acabamento nos detalhes.

## 14. REGRAS ANTI-INVENÇÃO (obrigatórias)
- É PROIBIDO afirmar como fato qualquer dado não fornecido acima (números, clientes, anos, prêmios, certificações, endereço, telefone, avaliações, resultados, depoimentos).
- Para qualquer dado factual ausente, use marcadores [INSERIR …] e mantenha o layout pronto para substituição.
- Ao final, informe de forma honesta o que foi implementado e o que ficou como placeholder.

## ENTREGA
- Implemente em HTML/CSS/JS no workspace (edite os arquivos necessários; não reconstrua o projeto inteiro sem necessidade).
- Preserve o que não foi pedido para alterar.
- Verifique no navegador (render, console, mobile, overflow) antes de concluir.
- Responda de forma curta e objetiva.
`;
}

export function promptFileName(name: string): string {
  const slug = String(name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "cliente";
  return `prompt-premium-${slug}.md`;
}
