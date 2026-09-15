// BRIEFING CRIATIVO INDIVIDUAL (decisão da IA) — primeira geração.
//
// Antes, a "direção" enviada ao Coder era um texto DETERMINÍSTICO (hash do
// negócio). Ele continua existindo como BASE TÉCNICA de variação, mas NÃO é mais
// o briefing criativo principal: aqui a PRÓPRIA IA (DeepSeek) analisa os dados
// reais daquele cliente e decide a direção daquele site específico.
//
// Regras: factual (nunca inventar dados), individual (nada de sequência fixa de
// seções) e acionável (o Coder executa a partir disto).

import type { BusinessContext } from "../../tools.js";
import type { ModelCaller } from "./model.js";

export const CREATIVE_BRIEF_SYSTEM = `Você é DIRETOR DE ARTE E ESTRATEGISTA WEB de uma agência high-end.
Você recebe os dados REAIS de UM cliente e decide, individualmente, a direção criativa do site DELE.

O que você deve decidir (específico deste negócio, não genérico):
- quem é o negócio e para quem precisa falar (público implícito do segmento/cidade);
- que percepção o site precisa transmitir (confiança? desejo? energia? acolhimento? autoridade?);
- conceito visual, personalidade, atmosfera;
- composição do hero (que tipo de abertura serve a ESTE negócio);
- hierarquia da informação e ordem que faz sentido;
- tipografia (título/corpo) e paleta (com HEX) coerentes com o segmento;
- tratamento das imagens (as fotos reais disponíveis, quando existirem);
- quais seções FAZEM sentido e quais NÃO fazem (nada de preencher espaço);
- componentes adequados, CTAs (linguagem do negócio), ritmo visual, nível de sofisticação;
- comportamento mobile e forma de apresentar localização e contato;
- o que NÃO fazer naquele caso (clichês específicos daquele segmento a evitar).

REGRAS RÍGIDAS:
- NUNCA invente fatos: serviços, preços, avaliações, depoimentos, números, clientes, certificados, horários, diferenciais ou resultados que não estejam nos DADOS.
- Se os dados forem insuficientes, seja criativo na APRESENTAÇÃO e permaneça factual no conteúdo.
- NÃO use uma sequência obrigatória de seções para todos os segmentos.
- NÃO repita o mesmo briefing entre clientes: a direção tem de nascer DESTE negócio.
- Se houver fotos reais, elas são ativos do cliente: diga como usá-las (hero, galeria, ambiente). Não sugira imagem falsa para preencher seção.
- Localização: só se houver endereço/coordenadas reais.

FORMATO DA RESPOSTA (curto e acionável, ~10-16 linhas):
CONCEITO: <1 linha>
PÚBLICO: <1 linha>
PERCEPÇÃO: <1 linha>
HERO: <composição/abertura>
PALETA: <3-5 HEX + função>
TIPOGRAFIA: <título/corpo + clima>
IMAGENS: <tratamento + uso das fotos reais, se houver>
SEÇÕES: <lista QUE FAZ SENTIDO neste caso + 1-2 que NÃO fazem>
CTAs: <linguagem exata>
MOBILE: <direção>
EVITAR: <clichês deste segmento>
REGISTRE em src/App.tsx um comentário "ART-DIRECTION:" com o resumo (arquétipo, paleta HEX, fontes, hero, grid).`;

/** Prompt com os DADOS REAIS + base técnica de variação (subordinada). */
export function buildCreativeBriefPrompt(input: {
  business: BusinessContext;
  baseDirectionBlock?: string;
  extraFacts?: string;
}): string {
  const b = input.business ?? {};
  const photos = Array.isArray(b.photos) ? b.photos : [];
  const stock = Array.isArray(b.stockImages) ? b.stockImages : [];
  const facts = [
    `Empresa: ${b.name ?? "—"}`,
    `Segmento: ${b.segment ?? b.category ?? "—"}`,
    `Cidade/UF: ${[b.city, b.state].filter(Boolean).join("/") || "—"}`,
    `Endereço: ${b.address ?? "—"}`,
    `Telefone/WhatsApp: ${[b.phone, b.whatsapp].filter(Boolean).join(" / ") || "—"}`,
    `Coordenadas: ${b.latitude != null && b.longitude != null ? `${b.latitude},${b.longitude}` : "—"}`,
    `Sobre (dados do cliente): ${b.about ?? "—"}`,
    Array.isArray(b.services) && b.services.length ? `Serviços informados: ${b.services.join(", ")}` : "Serviços informados: —",
    `Fotos REAIS disponíveis: ${photos.length}${photos.length ? ` (${photos.slice(0, 4).join(", ")})` : ""}`,
    `Imagens ilustrativas do sistema: ${stock.length}`,
    input.extraFacts ? `Outros dados: ${input.extraFacts}` : "",
  ].filter(Boolean);

  return [
    "DADOS REAIS DESTE CLIENTE (única fonte de fatos — não invente nada além disto):",
    facts.map((f) => `- ${f}`).join("\n"),
    "",
    input.baseDirectionBlock
      ? `BASE TÉCNICA DE VARIAÇÃO (referência secundária/opcional — NÃO é a direção final; você pode combinar, modificar ou rejeitar):\n${input.baseDirectionBlock}`
      : "",
    "",
    "Decida agora a DIREÇÃO CRIATIVA deste site específico, no formato pedido. Seja concreto e específico deste negócio (nada de texto genérico que serviria para qualquer cliente).",
  ].filter(Boolean).join("\n");
}

/**
 * Executa a decisão criativa com a MESMA IA do run (DeepSeek). Retorna o briefing
 * em texto; em falha, devolve "" (o Coder segue com a base técnica + system).
 */
export async function generateCreativeBrief(input: {
  model: ModelCaller;
  ai: { providerId?: string; modelId?: string; apiKey?: string; baseUrl?: string };
  business: BusinessContext;
  baseDirectionBlock?: string;
  extraFacts?: string;
}): Promise<string> {
  try {
    const res = await input.model({
      providerId: input.ai.providerId,
      modelId: input.ai.modelId,
      apiKey: input.ai.apiKey,
      baseUrl: input.ai.baseUrl,
      system: CREATIVE_BRIEF_SYSTEM,
      messages: [{ role: "user", content: buildCreativeBriefPrompt({ business: input.business, baseDirectionBlock: input.baseDirectionBlock, extraFacts: input.extraFacts }) }],
      tools: [],
      maxTokens: 900,
      temperature: 0.7,
    } as never);
    const text = res?.ok && res.turn?.text ? String(res.turn.text).trim() : "";
    return text;
  } catch {
    return "";
  }
}
