// Generation Quality Gate (5.21) — checagem técnica pós-geração para tornar a
// QUALIDADE consequência do processo (não da sorte do modelo). Detecta apenas
// deficiências objetivas e devolve instruções de correção concretas.
// Puro e testável.

export interface GenerationAssertion {
  ok: boolean;
  issues: string[]; // problemas detectados (para realimentar o agente)
}

// Segmentos onde imagem é parte essencial da experiência.
export const VISUAL_SEGMENTS = [
  "academia", "academias", "restaurante", "restaurantes", "cafeteria", "cafeterias",
  "arquitetura", "design de interiores", "beleza", "estética", "salão", "automotivo",
  "hotel", "pousada", "pet", "fotografia", "eventos", "odontologia", "clínica",
  "alimentação", "espaço", "gastronomia", "moda",
];

const GENERIC_TEXT = /lorem ipsum|insira|placeholder|xxxxx|\[seu texto\]/i;

export function assertGenerationQuality(
  files: Record<string, string>,
  opts: { segment?: string; name?: string; businessHas?: (field: string) => boolean },
): GenerationAssertion {
  const issues: string[] = [];
  const keys = Object.keys(files ?? {});
  const htmlPath = keys.find((k) => k.endsWith("index.html"));
  const html = htmlPath ? files[htmlPath] ?? "" : "";
  const css = keys.find((k) => k.endsWith("site.css")) ? files[keys.find((k) => k.endsWith("site.css"))!] ?? "" : "";

  if (!htmlPath) issues.push("index.html não foi criado.");
  if (!html.includes("<!doctype") && !html.includes("<html")) issues.push("index.html sem estrutura HTML válida.");

  // Imagens: para segmentos visuais, ausência total de img/url() é deficiência.
  const segment = (opts.segment ?? "").toLowerCase();
  const isVisual = VISUAL_SEGMENTS.some((s) => segment.includes(s));
  const imgCount = (html.match(/<img[^>]+src=/gi) ?? []).length;
  const bgCount = (html.match(/url\(/gi) ?? []).length + (css.match(/url\(/gi) ?? []).length;
  if (isVisual && imgCount === 0 && bgCount === 0) {
    issues.push("Segmento visual sem imagens (nenhum <img> nem background url). Adicione imagens contextuais relevantes ao negócio (ex.: ambiente/serviço) com URLs ilustrativas adequadas e tratamento visual (object-fit, proporção).");
  } else if (!isVisual && imgCount === 0) {
    issues.push("Nenhuma imagem utilizada. Considere ao menos uma imagem/ícone contextual se fizer sentido ao negócio.");
  }

  // ANTI-REPETIÇÃO DE IMAGEM (5.27): a MESMA url usada várias vezes indica
  // "as mesmas fotos" / preguiça visual.
  const imgUrls = [...html.matchAll(/src=["']([^"']+)["']/gi)].map((m) => m[1]).filter((u) => u && !u.startsWith("data:") && !u.startsWith("data:image"));
  const urlCount = new Map<string, number>();
  for (const u of imgUrls) urlCount.set(u, (urlCount.get(u) ?? 0) + 1);
  const dup = [...urlCount.entries()].filter(([, c]) => c > 1);
  if (dup.length) {
    issues.push(`A MESMA imagem está sendo usada ${dup.map(([u, c]) => `${c}x (${u.slice(0, 70)})`).join(", ")}. Use imagens DISTINTAS e coerentes — não repita a mesma foto no site.`);
  }
  // Pouca variedade: site com 4+ <img> mas menos de 3 URLs únicas.
  if (imgUrls.length >= 4 && urlCount.size < 3) {
    issues.push("Pouca variedade de imagens (todas as fotos iguais/repetidas). Diversifique as imagens para parecer um site profissional.");
  }

  // Responsividade
  if (!/@media/i.test(css || html)) issues.push("Sem regras responsivas (@media). Adicione layout mobile (a partir de ~900px e ~600px).");

  // CTA
  const hasCta = /agend|matricul|come[çc]e|experimente|fale|contato|whatsapp|ligue|reserve|peça|peça|solicite|inscreva/i.test(html);
  if (!hasCta) issues.push("Sem CTA claro (agendar/matricular/falar/contato/WhatsApp). Adicione um CTA principal de conversão.");

  // Navegação
  if (!/<nav|class="[^"]*nav|id="nav"/i.test(html)) issues.push("Sem navegação (<nav>/menu). Adicione navegação com âncoras para as seções principais.");

  // Footer mínimo
  const footer = (html.match(/<footer[\s\S]*?<\/footer>/i) ?? [""])[0];
  if (!footer) issues.push("Sem <footer>. Adicione rodapé com marca, contato/navegação e copyright.");
  else if (!/©|contato|whatsapp|telefone/i.test(footer)) issues.push("Footer muito simples (sem contato/marca). Enriqueça o rodapé.");

  // Texto genérico
  if (GENERIC_TEXT.test(html)) issues.push("Conteúdo genérico detectado (lorem/placeholder). Substitua por texto real do negócio.");

  // Hero
  if (!/hero|class="[^"]*intro|class="[^"]*top/i.test(html)) issues.push("Sem seção hero clara no topo.");

  // Anti-template visual: grade genérica de cards em excesso (ex.: 6+ cards iguais
  // numa só seção) indica "cards empilhados" sem composição/ritmo.
  const cardMatch = html.match(/class="[^"]*\bcard\b[^"]*"/gi) ?? [];
  if (cardMatch.length >= 6) {
    issues.push("Muitos cards com a mesma classe/genérica numa página (parece 'cards empilhados'). Varie a composição: use listas editoriais, divisões assimétricas, imagens+texto, números/timeline — cards só quando ajudam o design.");
  }
  // Sinal de PDF/apresentação: 3+ seções consecutivas só com título+texto simples.
  const sections = html.match(/<section[^>]*>[\s\S]*?<\/section>/gi) ?? [];
  let textOnlyRuns = 0;
  let maxRun = 0;
  for (const sec of sections) {
    const hasLayout = /<img|<ul|<table|<figure|grid|class="[^"]*(split|cols|grid|media|list)/i.test(sec);
    if (!hasLayout) { textOnlyRuns++; maxRun = Math.max(maxRun, textOnlyRuns); }
    else textOnlyRuns = 0;
  }
  if (sections.length >= 4 && maxRun >= 3) {
    issues.push("Várias seções seguidas só com texto (sem composição) — parece PDF/apresentação. Varie layout entre seções.");
  }

  // Nome da empresa visível
  const name = (opts.name ?? "").trim();
  if (name && name.length > 2 && !html.includes(name)) issues.push(`O nome da empresa ("${name}") não aparece no HTML.`);

  // Dados inventados (horários/avaliações) quando o negócio não os forneceu — só marca se óbvio:
  if (!opts.businessHas?.("hours") && /\b\d{1,2}h\s*[aà]\s*\d{1,2}h\b|segunda a s[aá]bado|de segunda a sexta/i.test(html)) {
    issues.push("Horário de funcionamento não fornecido no contexto — remova horários inventados.");
  }

  return { ok: issues.length === 0, issues };
}
