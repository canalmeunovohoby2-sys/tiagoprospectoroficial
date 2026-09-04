import type { Lead } from "@/data/types";
import { computeOrvixDiagnostic, type OrvixDiagnostic } from "@/lib/orvixDiagnostics";

/**
 * Orvix ERP — Gerador de Abordagem Comercial (template-based, sem IA).
 * Tudo em memória. Nada persistido. Utiliza o diagnóstico já existente
 * para adaptar tom, dores e chamada por segmento.
 */

export interface OrvixApproachSection {
  saudacao: string;
  quebraGelo: string;
  problema: string;
  solucao: string;
  cta: string;
}

export interface OrvixApproach {
  diagnostic: OrvixDiagnostic;
  sections: OrvixApproachSection;
  whatsapp: string;
  email: { subject: string; body: string };
  ligacao: string;
  resumo30s: string;
}

function firstName(name: string | null | undefined): string {
  if (!name) return "";
  return name.split(/[-–—|·,()]/)[0].trim();
}

function urgencyTone(erpScore: number): "alta" | "media" | "baixa" {
  if (erpScore >= 70) return "alta";
  if (erpScore >= 40) return "media";
  return "baixa";
}

/**
 * Gera 5 seções estruturadas + variantes por canal (WhatsApp, e-mail, ligação, 30s).
 */
export function generateOrvixApproach(lead: Lead): OrvixApproach {
  const diag = computeOrvixDiagnostic(lead);
  const empresa = lead.name ?? "sua empresa";
  const nomeCurto = firstName(lead.name);
  const cidade = lead.city ?? "sua cidade";
  const segmento = diag.segmentLabel.toLowerCase();
  const topPains = diag.pains.slice(0, 3);
  const topModules = diag.modules.slice(0, 4);
  const tone = urgencyTone(diag.erpScore);

  // ---------------- Seções estruturadas ----------------
  const saudacao = `Olá, tudo bem? Sou consultor Orvix e passo bem rápido aqui na ${empresa}.`;

  const quebraGelo = (() => {
    const rating = typeof lead.rating === "number" ? lead.rating : null;
    const reviews = Number(lead.reviews_count ?? 0);
    if (rating && rating >= 4.5 && reviews >= 20) {
      return `Vi que a ${empresa} tem ótima reputação em ${cidade} (${rating.toFixed(1)} com ${reviews} avaliações) — parabéns pela operação.`;
    }
    if (!lead.website && !lead.has_website) {
      return `Percebi que a ${empresa} ainda não trabalha com um sistema web/online — normalmente isso indica que a operação é bem manual no dia a dia.`;
    }
    return `Estamos ajudando ${segmento}s aqui em ${cidade} a organizar a operação de ponta a ponta.`;
  })();

  const problema = topPains.length
    ? `Em ${segmento}s, três pontos costumam pesar bastante: ${topPains.join(", ").toLowerCase()}. Faz sentido esse cenário aí na ${empresa}?`
    : `Em ${segmento}s, o controle manual da operação costuma pesar bastante no dia a dia. Faz sentido esse cenário na ${empresa}?`;

  const solucao = `A Orvix resolve exatamente isso com ${topModules.join(", ")} — ${diag.pitch}`;

  const cta = (() => {
    if (tone === "alta") {
      return `Consigo te mostrar em 15 minutos como isso funcionaria dentro da ${empresa}. Prefere hoje à tarde ou amanhã cedo?`;
    }
    if (tone === "media") {
      return `Posso te enviar um vídeo curto (2 min) mostrando o sistema rodando em ${segmento}s. Pode ser?`;
    }
    return `Se fizer sentido, te mando um material rápido sobre o Orvix. Posso enviar?`;
  })();

  const sections: OrvixApproachSection = { saudacao, quebraGelo, problema, solucao, cta };

  // ---------------- WhatsApp (mensagem única, curta, com emojis) ----------------
  const whatsapp = [
    `Olá${nomeCurto ? `, ${nomeCurto}` : ""}! Tudo bem? 👋`,
    ``,
    `Aqui é da Orvix. Dei uma olhada rápida na ${empresa} e reparei que ${segmento}s em ${cidade} costumam sofrer com ${topPains[0]?.toLowerCase() ?? "controle manual da operação"} 😬.`,
    ``,
    `Temos uma solução com ${topModules.slice(0, 3).join(", ")} que resolve isso de forma prática 🚀.`,
    ``,
    cta.replace(/\?$/, "") + " 🙌",
  ].join("\n");

  // ---------------- E-mail ----------------
  const emailSubject = `${empresa} — como reduzir ${topPains[0]?.toLowerCase() ?? "trabalho manual"} com um ERP feito para ${segmento}s`;
  const emailBody = [
    `Olá${nomeCurto ? `, ${nomeCurto}` : ""},`,
    ``,
    `${saudacao}`,
    ``,
    `${quebraGelo}`,
    ``,
    `Nos ${segmento}s que atendemos, os pontos que mais aparecem são:`,
    ...topPains.map((p) => `  • ${p}`),
    ``,
    `A Orvix atua exatamente nesses pontos com os módulos ${topModules.join(", ")}.`,
    `${diag.pitch}`,
    ``,
    `${cta}`,
    ``,
    `Abraço,`,
    `Equipe Orvix`,
  ].join("\n");

  // ---------------- Ligação (roteiro curto) ----------------
  const ligacao = [
    `[Abertura] "${saudacao}"`,
    ``,
    `[Contexto] "${quebraGelo}"`,
    ``,
    `[Pergunta-chave] "${problema}"`,
    ``,
    `[Se sim] "${solucao}"`,
    ``,
    `[Fechamento] "${cta}"`,
  ].join("\n");

  // ---------------- Resumo 30 segundos ----------------
  const resumo30s =
    `${empresa} é ${segmento === "comércio" ? "um comércio" : `um(a) ${segmento}`} em ${cidade} com ERP Score Orvix ${diag.erpScore}/100 (${diag.opportunity}). ` +
    `Provável dor principal: ${topPains[0]?.toLowerCase() ?? "operação manual"}. ` +
    `Módulos indicados: ${topModules.join(", ")}. ` +
    `Abordagem: ${tone === "alta" ? "prioridade alta, agendar demo curta" : tone === "media" ? "enviar vídeo curto e nutrir" : "material rápido e follow-up leve"}.`;

  return {
    diagnostic: diag,
    sections,
    whatsapp,
    email: { subject: emailSubject, body: emailBody },
    ligacao,
    resumo30s,
  };
}
