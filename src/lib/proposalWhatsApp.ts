// Proposta comercial via WhatsApp — interface interna de vendas/prospecção.
// Usa EXCLUSIVAMENTE o WhatsApp comprovado do lead (nunca converte telefone
// fixo, nunca usa o WhatsApp do usuário como fallback).

export interface ProposalLeadLike {
  id?: string | null;
  name?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  segment?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface ProposalTarget {
  /** WhatsApp bruto como veio do lead (exibição/prova). */
  whatsapp: string | null;
  /** Número internacional (55 + DDD + número) pronto para a URL wa/api. */
  phoneNumber: string | null;
  hasWhatsapp: boolean;
}

// Número de WhatsApp = somente o campo `whatsapp` do lead. Telefone fixo NUNCA
// é convertido em WhatsApp.
export function resolveProposalTarget(lead: ProposalLeadLike): ProposalTarget {
  const raw = typeof lead.whatsapp === "string" && lead.whatsapp.trim() ? lead.whatsapp.trim() : null;
  if (!raw) return { whatsapp: null, phoneNumber: null, hasWhatsapp: false };
  const digits = raw.replace(/\D+/g, "");
  if (digits.length === 10 || digits.length === 11) {
    return { whatsapp: raw, phoneNumber: `55${digits}`, hasWhatsapp: true };
  }
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return { whatsapp: raw, phoneNumber: digits, hasWhatsapp: true };
  }
  return { whatsapp: raw, phoneNumber: null, hasWhatsapp: false };
}

export interface ProposalMessageOptions {
  name?: string | null;
  segment?: string | null;
  city?: string | null;
  siteUrl?: string | null;
}

export function businessLabel(name?: string | null, city?: string | null): string {
  const base = (name ?? "").trim() || "sua empresa";
  return city ? `${base} (${city})` : base;
}

// Mensagem padrão de proposta — SEMPRE editável antes do envio.
export function buildProposalMessage(opts: ProposalMessageOptions): string {
  const target = businessLabel(opts.name, opts.city);
  const context = opts.segment ? ` site profissional para ${target}` : ` proposta para ${target}`;
  const base = `Olá! Aqui é o Tiago, do nosso time de criação de sites. 👋\n\nPreparamos${context} pensado para o seu negócio crescer.`;
  const url = (opts.siteUrl ?? "").trim();
  if (url) {
    return `${base}\n\nSegue o link da proposta/demonstração para você conferir:\n${url}\n\nQualquer dúvida, é só me chamar por aqui!`;
  }
  return `${base}\n\nAssim que o link da demonstração estiver publicado, envio por aqui. Qualquer dúvida, é só chamar!`;
}

// Link público do site/proposta correspondente ao projeto do lead.
export function publicSiteUrl(origin: string, slug?: string | null): string | null {
  const s = (slug ?? "").trim();
  if (!s) return null;
  return `${origin.replace(/\/+$/, "")}/public/${encodeURIComponent(s)}`;
}

// URL do WhatsApp Web/desktop (api.whatsapp.com — funcional em desktop/web).
export function whatsappProposalUrl(phoneNumber: string, message: string): string {
  return `https://api.whatsapp.com/send?phone=${encodeURIComponent(phoneNumber)}&text=${encodeURIComponent(message)}`;
}
