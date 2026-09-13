// Visual Task classification (6.0) — diferencia o tipo de tarefa para orientar o
// ciclo visual autônomo (INSPECIONAR → EDITAR → RENDERIZAR → MEDIR → ANALISAR →
// CORRIGIR → MEDIR → FINALIZAR) sem virar um sistema de regras rígido de design.
// Puro e testável. Regra: se houver dúvida, tratar como VISUAL.

export type TaskClass = "visual" | "content" | "code";

// Termos de impacto visual/estrutural forte → exige ciclo visual (medir/renderizar).
const VISUAL_TERMS =
  /hero|layout|espa[çc]|gap|padding|margin|alinh|posicion|dimens|largura|altura|tamanho|card|bot[aã]o|cta|\bcor\b|font|tipograf|imagem|foto|banner|se[çc][ãa]o|section|responsiv|mobile|tablet|desktop|header|footer|menu|navega|grid|coluna|centraliz|propor[çc]|sobrepost|overlap|dist[aâ]ncia|hierarquia|composi[çc]|z-?index|anima|movimento|movi|efeito|transi[çc]|fade|reveal|scroll|rola|desliz|surgi|aparec|din[aâ]mic|parado|est[aá]tic|hover|motion|enquadr|cortad|cortou|recort|zoom|object-position|object-fit|background-position|background-size|avatar|retrato|headshot/i;

// Termos puramente de conteúdo/texto → sem exaurir ciclo geométrico.
const CONTENT_TERMS =
  /texto|copy|conte[úu]do|frase|palavra|par[aá]grafo|redigir|escrever|t[ií]tulo|subt[ií]tulo|nome|telefone|whatsapp|endere[çc]o|hor[aá]rio|descri[çc][ãa]o|legenda/i;

// Termos técnicos (sem impacto visual direto).
const CODE_TERMS =
  /typescript|\.ts\b|\.js\b|fun[çc][ãa]o|bug|erro|depend[eê]ncia|import\s|lint|build|teste\s+unit|corrigir\s+erro|arquivo|remov|apag|exclu|renome|mover|delete|\.json\b/i;

export function classifyTask(instruction: string): TaskClass {
  const t = String(instruction ?? "").trim();
  if (!t) return "visual"; // ambíguo → visual
  if (VISUAL_TERMS.test(t)) return "visual";
  if (CONTENT_TERMS.test(t)) return "content";
  if (CODE_TERMS.test(t)) return "code";
  // Sem sinal claro: se houver dúvida, tratar como visual (regra da fase).
  return "visual";
}

export function requiresVisualCycle(cls: TaskClass): boolean {
  return cls === "visual";
}
