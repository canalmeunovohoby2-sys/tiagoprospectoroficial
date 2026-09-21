// Skills de UI/UX de elite INSTALADAS no agente gerador (Coder).
//
// NÃO é prompt: as técnicas ficam como BASE DE CONHECIMENTO e o agente consulta
// sob demanda pela ferramenta `design_skills` (topic opcional). Assim o cérebro
// (DeepSeek) tem a técnica instalada e usa QUANDO precisa, sem gastar prompt a
// cada geração. Fonte: ROLE "Senior UI/UX Director & Elite Front-End Engineer".
//
// Nada aqui substitui os sistemas do produto (fotos, Google Maps, anti-template).

export interface DesignSkill {
  /** Identificador curto usado como `topic` na ferramenta. */
  id: string;
  title: string;
  body: string;
}

export const DESIGN_SKILLS: DesignSkill[] = [
  {
    id: "contextual",
    title: "Inteligência de design contextual",
    body: `Antes de desenhar, analise: segmento, público, posicionamento, valor percebido, personalidade da marca, objetivo comercial, conversão principal, diferenciais, objeções, concorrência e o que a marca precisa transmitir. Só então defina o Design System.
- Psicologia das cores: base, secundária, contraste, destaque e cor de CTA adequadas ao segmento (dark+neon = tech/performance; dourado+mineral = luxo/estética; claros/pastéis = saúde/bem-estar; vibrantes = modernas; sóbrios = jurídico/consultoria; naturais = alimentação/beleza/pet). NUNCA reutilize a mesma paleta entre clientes.
- Tipografia: combinações coerentes (display/editorial/serifada/geométrica; ex.: Syne, Cinzel, Clash Display, Plus Jakarta, Inter, Outfit, Space Grotesk). A tipografia faz parte da identidade.
- Direção fotográfica: escolha e trate imagens por segmento, luz, ambiente e posicionamento. Imagem NÃO preenche espaço — participa da direção de arte.`,
  },
  {
    id: "design-system",
    title: "Design System & direção de arte",
    body: `Defina arquétipo, composição, grid, ritmo vertical, densidade, escala tipográfica, tratamento fotográfico, estilo de CTA, linguagem dos elementos, contraste e profundidade ANTES de codar. PROIBIDO cair por padrão em navbar → hero → 3 cards → texto+imagem → 4 cards → galeria → depoimentos → CTA → footer. Use quando fizer sentido: grids assimétricos, composição editorial, hero dividido, imagem dominante, texto sobre imagem, sobreposição, elementos fora do eixo, tipografia de grande escala, números, faixas, elementos flutuantes, imagens recortadas, espaços negativos e mudanças de densidade. O objetivo é COMPOR, não preencher seções.`,
  },
  {
    id: "luxury-dark",
    title: "Luxury Dark Mode (referência, não obrigação)",
    body: `Fundo #050505–#0D0E12; superfícies #12131C/#181A26; bordas border-white/10; acentos coerentes com o segmento (ex.: #0066FF→#00D2FF, #FF5500→#FF8800, #D4AF37→#F3E5AB). Se o negócio pedir claro/minimalista/editorial/natural/pastel/clínico/colorido, ADAPTE o Design System.`,
  },
  {
    id: "ui-polish",
    title: "UI polished",
    body: `Quando coerente: glassmorphism, backdrop-blur, transparências, bordas sutis, sombras, iluminação atmosférica, radial gradients, profundidade e sobreposição. Nunca use efeito só para mostrar capacidade: o design deve permanecer sofisticado sem eles.`,
  },
  {
    id: "motion",
    title: "Motion & microinterações",
    body: `Quando apropriado: fade-in, slide-up, reveal on scroll, hover lift, image zoom, elementos flutuantes, pulse, shimmer, beam, micro-interações e transições suaves. Botões: hover scale/lift/glow; cards: elevação e borda; imagens: group-hover:scale-110. Animar preferencialmente transform e opacity, 300–700ms, curvas suaves (ease-in-out/cubic-bezier). Qualidade, não exagero.`,
  },
  {
    id: "backgrounds",
    title: "Ambiente visual e backgrounds",
    body: `Quando fizer sentido: aura glow (orbes com radial-gradient + blur + opacidade + movimento lento) e marquee (barras infinitas de logos/métricas/frases) via CSS/keyframes. Nunca use marquee só para preencher.`,
  },
  {
    id: "cro",
    title: "CRO / arquitetura de conversão",
    body: `Header (nav, logo, CTA principal, responsivo, flutuante quando apropriado); hero (headline forte, subtítulo, proposta de valor, CTA principal, secundário quando fizer sentido, prova de autoridade SE houver); prova de valor; serviços/produtos/portfólio; galeria quando houver material; prova social SOMENTE com dados reais; planos/preços SÓ se o negócio trabalhar com isso; formulário (labels, name, type corretos, CTA de alta conversão); localização; footer completo (contatos, links, redes, legal, horário) apenas quando os dados existirem.`,
  },
  {
    id: "copy",
    title: "Copy persuasiva & neuro-design",
    body: `Headline = benefício + mecanismo/diferencial + redução de objeção. PROIBIDO genérico ("Transformamos sonhos em realidade", "Soluções inovadoras", "Excelência e qualidade"). Depoimentos reais no formato problema → transformação → resultado. Urgência SOMENTE se for real do contexto (nada de "últimas vagas").`,
  },
  {
    id: "components",
    title: "Componentes interativos",
    body: `Quando houver benefício real: acordeões, FAQ (<details>/<summary> ou JS simples), carrosséis com overflow-x-auto + snap, galerias, sliders, simuladores, calculadoras (input type=range/seletores), filtros e comparadores. Prefira soluções leves; nada de bibliotecas pesadas.`,
  },
  {
    id: "mobile",
    title: "Mobile-first & toque",
    body: `Alvos de toque ~48–56px; sticky CTA quando fizer sentido ("Falar no WhatsApp", "Agendar agora", "Solicitar orçamento"); espaçamento responsivo (py-12 md:py-24, text-3xl md:text-5xl). Nunca: overflow horizontal, texto cortado, botões pequenos, imagem quebrada, layout espremido. Mobile e desktop com composição coerente.`,
  },
  {
    id: "performance",
    title: "Performance & Web Vitals",
    body: `Imagens externas com parâmetros de otimização quando suportados; hero loading="eager"; abaixo da dobra loading="lazy"; scripts com defer quando aplicável; CSS/keyframes organizados; animar transform/opacity. A qualidade não pode depender de dezenas de bibliotecas.`,
  },
  {
    id: "code",
    title: "Código integral",
    body: `PROIBIDO código fictício/resumido ("// resto aqui", "<!-- adicione o restante -->"). Implementação COMPLETA. Em React/TS, respeite a arquitetura do projeto (não converta tudo para HTML estático).`,
  },
  {
    id: "tech",
    title: "Tecnologias",
    body: `Use o que a arquitetura permite (HTML5, CSS3, Tailwind, JS, React, TS; ícones como SVG inline). NÃO substitua o sistema de mídia PRÓPRIO do produto por URLs externas aleatórias.`,
  },
  {
    id: "integrations",
    title: "Integrações & APIs",
    body: `Formulários com name="nome"/"email"/"whatsapp" e types corretos; estrutura preparada para Pixel/GTM quando a arquitetura permitir; WhatsApp por deep link https://wa.me/<numero>?text=... SOMENTE com número real (nunca invente telefone).`,
  },
  {
    id: "media",
    title: "Mídia real",
    body: `Prioridade: 1) foto real do negócio; 2) imagem do sistema do produto; 3) ilustrativa apropriada; 4) composição alternativa profissional. NUNCA <img> quebrado, placeholder evidente, URL inválida ou vazio inesperado. A imagem segue o Design System.`,
  },
  {
    id: "maps",
    title: "Google Maps & localização",
    body: `Use o sistema de mapas existente; prioridade lat/lng → endereço → nome+cidade/UF → cidade/UF. Nunca invente endereço. Apresente o mapa com coerência visual.`,
  },
  {
    id: "critique",
    title: "Autocrítica antes de finalizar",
    body: `Avalie: parece projeto profissional? tem direção de arte? parece específico do negócio? o hero tem personalidade? a composição é interessante? as imagens integram? há hierarquia e ritmo? há excesso de cards/seções repetidas? o CTA está claro? o mobile está resolvido? parece template/IA? Se parecer genérico, REFINE a composição antes de entregar.`,
  },
  {
    id: "differentiation",
    title: "Diferenciação entre projetos",
    body: `Dois clientes NUNCA devem receber a mesma estrutura, paleta, hero, ordem, proporções e textos. Componentes podem ser reutilizados, mas a composição final deve ser específica por segmento/posicionamento.`,
  },
  {
    id: "restraint",
    title: "Performance visual sem excesso",
    body: `Efeitos são ferramentas, não obrigações. NÃO adicione automaticamente glassmorphism, glow, gradient, marquee, calculadora, carrossel, sticky CTA, badges ou animações. Premium = direção de arte + composição + hierarquia + execução + experiência.`,
  },
  {
    id: "rule",
    title: "Regra final de design",
    body: `O objetivo é um PROJETO DIGITAL COM DIREÇÃO DE ARTE: quem olha deve sentir "isso foi feito para esta empresa", não "um template que a IA preencheu". Fluxo: ANALISAR → DEFINIR DIREÇÃO → PROJETAR → IMPLEMENTAR → REVISAR → REFINAR.`,
  },
  {
    id: "inspecao-profunda",
    title: "Inspeção profunda & refatoração global",
    body: `Você é um AUDITOR DE CÓDIGO: investigue 100% do arquivo ANTES de responder — precisão cirúrgica, zero substituição parcial.
1) VARREDURA GLOBAL (zero alteração parcial): ao mudar cor/tema/fonte, varra o projeto INTEIRO e encontre TODAS as ocorrências — classes Tailwind, estilos inline, gradientes (inclui radial-gradient), bordas, cores de texto, sombras (box-shadow), ícones, SVG e regras dentro de <style>. É PROIBIDO mudar só o hero/seções principais e deixar o resto com o padrão antigo: a mudança vale do header ao footer.
2) CORES RELACIONADAS: ao trocar "amarelo por verde", troque TODAS as variações daquele tom — hover (:hover / hover:), transparências (/10, /20, /80), focus, ring, sombras, gradientes e estados ativos. Nada de "verde no principal e amarelo no hover".
3) BUG SEM DETALHE (ex.: "o menu tá quebrado", "desalinhou no mobile"): faça DIAGNÓSTICO ATIVO antes de editar. Verifique: overflow-x/rolagem horizontal, tags HTML mal fechadas ou mal aninhadas, JS com seletor/escopo errado, imagens sem dimensão/aspect-ratio, quebras em breakpoints (sm/md/lg/xl), z-index/posicionamento e altura fixa. Corrija a causa raiz E os componentes afetados pela mesma mudança.
4) MENTALIDADE DE DONO: se encontrar código obsoleto, estilo duplicado, inconsistência visual ou link quebrado relacionado ao pedido, você TEM liberdade para refatorar e melhorar.
5) INTEGRIDADE VISUAL: antes de finalizar, revise o site de cima a baixo (header → hero → seções → cards → CTA → footer) confirmando que a mudança ficou 100% homogênea e nenhuma seção ficou com o padrão antigo.
REGRAS RÍGIDAS DE ENTREGA:
- PROIBIDO resumir código após alterações: entregue o ARQUIVO COMPLETO (no HTML, de <!DOCTYPE html> até </html>; no React, o arquivo/componente integral). Nunca deixe lugar de "adicionar o resto".
- PROIBIDO mensagem de atalho: nada de "<!-- o restante permanece igual -->", "// resto do código aqui", "..." ou similares.
- COMPROMISSO DE RENDERIZAÇÃO: o resultado tem de estar sintaticamente correto e pronto para rodar (build/preview sem erro).`,
  },
];

/** Lista de tópicos aceitos como `topic` (para o enum da ferramenta). */
export const DESIGN_SKILL_TOPICS = DESIGN_SKILLS.map((s) => s.id);

function render(skills: DesignSkill[]): string {
  return skills
    .map((s, i) => `${i + 1}) ${s.title.toUpperCase()}\n${s.body}`)
    .join("\n\n");
}

/** Guia COMPLETO (todos os tópicos). */
export const DESIGN_SKILLS_FULL = render(DESIGN_SKILLS);

function normalize(topic: string): string {
  return topic.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

/**
 * Conhecimento sob demanda: sem tópico → guia completo; com tópico → só a(s)
 * seção(ões) correspondente(s) (economia de tokens). Tópico desconhecido devolve
 * o índice + o guia completo para o agente escolher.
 */
export function designSkillsKnowledge(topic?: string | null): string {
  const t = normalize(String(topic ?? ""));
  if (!t) return DESIGN_SKILLS_FULL;
  const exact = DESIGN_SKILLS.find((s) => s.id === t);
  if (exact) return render([exact]);
  const partial = DESIGN_SKILLS.filter((s) => s.id.includes(t) || s.title.toLowerCase().includes(t) || s.body.toLowerCase().includes(t));
  if (partial.length > 0 && partial.length <= 4) return render(partial);
  return `TÓPICOS DISPONÍVEIS: ${DESIGN_SKILL_TOPICS.join(", ")}\n\n${DESIGN_SKILLS_FULL}`;
}

/**
 * FUNDAÇÕES DE DESIGN — injetadas DETERMINISTICAMENTE no prompt de geração.
 * Diferente da tool `design_skills` (consulta sob demanda), este bloco SEMPRE
 * chega ao modelo quando um site novo vai ser gerado: princípios e critérios de
 * qualidade, NUNCA um template. A direção criativa específica do projeto (que
 * vem na missão) tem precedência estética — aqui está apenas a EXECUÇÃO premium.
 * Fonte: skills-pack-agente-senior (01-core-design + 02-conversao-conteudo +
 * orquestração), condensado para não inchar o contexto.
 */
export const DESIGN_FOUNDATIONS = `PRINCÍPIOS DE DESIGN PREMIUM (base de qualidade obrigatória — princípios, NUNCA template):
A DIREÇÃO CRIATIVA DESTE PROJETO (paleta, arquétipo, tipografia, composição) vem na missão e TEM PRECEDÊNCIA estética. Estes princípios garantem a EXECUÇÃO premium de qualquer direção.

1. DESIGN SYSTEM ANTES DE CODAR: tokens primeiro (1 cor de marca + 1 accent reservado ao CTA + neutros; escala de 5–9 tons da primária). Máx. 2 famílias tipográficas (1 display com personalidade + 1 corpo legível), escala modular (14/16/18/20/24/32/40/56), espaçamento em base 4/8, respiro generoso entre seções, raio de borda e sombras consistentes e sutis. Nunca cores default de framework sem intenção.

2. HIERARQUIA E COMPOSIÇÃO: em 3s o visitante entende (1) o que é o negócio, (2) por que confiar, (3) onde clicar. Um elemento dominante por seção; a cor de destaque é exclusiva do CTA principal; espaço negativo agrupa/separa; alinhamento a uma grade invisível; ritmo visual variado (grids assimétricos, split, full-bleed, editorial) — NUNCA a sequência genérica navbar→hero→3 cards→…→footer por inércia.

3. HERO COMO PEÇA DE DIREÇÃO DE ARTE: responda em segundos quem é a empresa, o que ela oferece, por que isso importa e a ação principal — sem parede de texto. PROIBIDO o padrão automático "título centralizado + texto + botão + imagem abaixo". Compose de verdade: assimetria, imagem dominante (ou de fundo com overlay legível), divisão editorial, camadas, tipografia expressiva, blocos de informação, CTA integrado à composição.

4. COPY DE CONVERSÃO: escreva sobre o RESULTADO do cliente, não sobre a empresa. Especificidade vence generalidade (números/prazos/garantias reais); banir jargão vazio ("compromisso com a qualidade"); PAS (problema→agitação→solução) para dores; falar com "você"; um CTA por seção no tom do funil.

5. PROVA SOCIAL (somente dados reais): hierarquia — números concretos > selos/certificações > depoimentos específicos (nome/foto/resultado) > avaliações externas. Nunca inventar depoimentos, números ou estrelas.

6. FAQ COMO QUEBRA DE OBJEÇÃO (quando o segmento exigir): perguntas na linguagem real do cliente cobrindo preço, garantia, segurança e prazo; respostas curtas; <details>/accordion leve.

7. MOBILE PROJETADO (não versão reduzida do desktop): reavalie ordem dos elementos, densidade, hero, tipografia fluida (clamp), imagens, navegação, espaçamento e CTAs em 390px — o resultado precisa continuar premium. Alvos de toque ≥44–48px; menu mobile com toggle seguro (abre, link fecha, Esc fecha); nunca overflow horizontal; evitar 100vh (usar 100dvh); testar mobile, tablet e desktop.

8. ACESSIBILIDADE (WCAG 2.1 AA): contraste ≥4.5:1 (≥3:1 texto grande); HTML semântico (header/nav/main/footer, <button> real, hierarquia h1–h6 sem pular); alt descritivo (decorativas alt=""); :focus-visible estilizado; <label> em todo input.

9. PERFORMANCE (Core Web Vitals): toda imagem com width/height e loading="lazy" (hero eager); font-display: swap; animar apenas transform/opacity; scripts de terceiros adiados; nenhuma biblioteca pesada sem necessidade.

10. MICROINTERAÇÕES/MOTION: sutis e funcionais (hover 150–250ms, reveal com stagger 60–100ms, easing suave); respeitar prefers-reduced-motion; decorativos com pointer-events:none atrás do conteúdo.

11. IMAGENS: derive a INTENÇÃO da imagem da direção (sujeito, atmosfera, tratamento, enquadramento); prioridade: foto real do negócio > imagem do sistema > ilustrativa coerente; trate na composição (crop, object-position, overlay); nunca imagem quebrada nem placeholder evidente.

12. SEO ON-PAGE: um único <h1>; <title> único e persuasivo + meta description; JSON-LD LocalBusiness (quando houver NAP real); NAP consistente com cidade/UF.

13. PERCEPÇÃO PREMIUM: espaçamento generoso e consistente; coerência total (1 estilo de borda, 1 linguagem de ícones, mesmo tratamento fotográfico); micro-detalhes resolvidos; o site parece feito PARA ESTA empresa.

14. EXPERIÊNCIA POR SEGMENTO: cada vertical tem expectativas, seções e objeções próprias — derive a arquitetura do SEGMENTO + DIREÇÃO do projeto, nunca de uma estrutura fixa.

15. ANTI-TEMPLATE: dois clientes nunca recebem a mesma estrutura, paleta, ordem ou textos. Efeitos (glass/glow/marquee/parallax/dark mode) são FERRAMENTAS OPCIONAIS: só entram quando a DIREÇÃO do projeto pedir — nunca automaticamente. Qualidade = direção de arte + composição + hierarquia + execução.

16. TIPOGRAFIA COM PRESENÇA: escolha pares coerentes com o segmento (display + corpo; serifada editorial, geométrica, grotesk…) — nunca a mesma fonte neutra para tudo. Trabalhe escala, peso, line-height, tracking, quebra de linha e ritmo vertical; títulos com presença visual. font-size grande NÃO substitui direção de arte.

17. ARQUITETURA NASCE DO NEGÓCIO: a ordem das seções segue a JORNADA do segmento (ex.: indústria → capacidade/aplicações/processo/prova; clínica → especialidades/profissionais/estrutura/dúvidas/agendamento; serviço premium → posicionamento/portfólio/processo/prova). NUNCA a sequência fixa hero→3 cards→sobre→serviços→depoimentos→FAQ→contato→footer por inércia.

18. DIFERENCIAÇÃO (pergunta obrigatória antes de finalizar): "se eu remover o NOME da empresa, este site ainda parece desenhado especificamente para ESTE segmento?" Se a resposta for não, refine direção, composição e conteúdo antes de finalizar.

19. PROFUNDIDADE PROPORCIONAL AO NEGÓCIO: antes de finalizar, avalie "este site explica suficientemente POR QUE esta empresa merece atenção e oferece informação suficiente para gerar confiança e conversão?" Se não, desenvolva a experiência usando o material real: proposta de valor, diferenciais, serviços/produtos, aplicações, benefícios, processo, estrutura, portfólio/cases, área de atendimento, FAQ/objeções, localização — SOMENTE o que fizer sentido para o negócio. Uma indústria comunica mais que hero→serviços→sobre→contato; um negócio pequeno pode ser naturalmente menor. NUNCA criar conteúdo falso (números, clientes, depoimentos, prêmios) para preencher espaço.

20. RITMO VISUAL (nenhuma monotonia): seções nunca em sequência interminável de cards idênticos ou três colunas repetidas — alterne composição (editorial, imagem+conteúdo, grids assimétricos, números/informações, cases, blocos de destaque, full-width, cards só quando úteis). Cada seção pertence ao MESMO projeto (mesmo sistema) com ritmo e hierarquia próprios.`;
