// Classificação de presença digital do lead (FASE 5 da auditoria de busca).
//
// REGRA DE PRODUTO: NÃO descartar empresa por ter site — coletar tudo, classificar
// e ORDENAR: sem site primeiro, presença desconhecida no meio, rede social e site
// próprio depois. "Desconhecido" NUNCA é tratado como "sem site".

export type SiteStatus = "sem_site" | "desconhecido" | "site_social" | "site_proprio";

const SOCIAL_RE =
  /(instagram\.com|facebook\.com|fb\.com|linktr\.ee|linkr\.bio|beacons\.ai|linkbio|wa\.me|whatsapp\.com|t\.me\/|catalogo\.|cardapio\.|menu\.|link\.me)/i;

export function siteStatusOf(lead: { website?: string | null; has_website?: boolean | null }): SiteStatus {
  const site = String(lead.website ?? "").trim();
  if (site) return SOCIAL_RE.test(site) ? "site_social" : "site_proprio";
  if (lead.has_website === false) return "sem_site";
  if (lead.has_website === true) return "site_proprio";
  return "desconhecido";
}

const ORDER: Record<SiteStatus, number> = {
  sem_site: 0,
  desconhecido: 1,
  site_social: 2,
  site_proprio: 3,
};

/** Ordenação estável por prioridade comercial (sem descartar ninguém). */
export function prioritizeSiteLess<T extends { website?: string | null; has_website?: boolean | null }>(leads: T[]): T[] {
  return leads
    .map((lead, index) => ({ lead, index }))
    .sort((a, b) => {
      const d = ORDER[siteStatusOf(a.lead)] - ORDER[siteStatusOf(b.lead)];
      return d !== 0 ? d : a.index - b.index;
    })
    .map((x) => x.lead);
}

export const SITE_STATUS_LABEL: Record<SiteStatus, string> = {
  sem_site: "Sem site",
  desconhecido: "Não verificado",
  site_social: "Só rede social",
  site_proprio: "Site",
};
