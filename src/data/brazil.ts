export const BR_STATES = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" },
];

export const SEGMENTS = [
  "Dentistas",
  "Médicos",
  "Advogados",
  "Contadores",
  "Imobiliárias",
  "Restaurantes",
  "Oficinas",
  "Academias",
  "Clínicas",
  "Estéticas",
  "Construtoras",
  "Arquitetos",
  "Psicólogos",
  "Veterinários",
  "Salões de beleza",
  "Pet shops",
  "Escolas",
  "Hotéis",
  "Cafeterias",
  "Lojas de roupas",
];

// Fetch cities for a given state from the IBGE public API.
export async function fetchCities(uf: string | null | undefined, signal?: AbortSignal): Promise<string[]> {
  const normalizedUf = typeof uf === "string" ? uf.trim().toUpperCase() : "";

  console.debug("[Search/fetchCities] input", { uf, normalizedUf });

  if (!normalizedUf) {
    console.debug("[Search/fetchCities] empty UF, returning no cities");
    return [];
  }

  const isKnownState = BR_STATES.some((state) => state.uf === normalizedUf);
  if (!isKnownState) {
    console.warn("[Search/fetchCities] invalid UF received", { normalizedUf });
    return [];
  }

  const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${normalizedUf}/municipios?orderBy=nome`;
  console.debug("[Search/fetchCities] request:start", { url });

  const res = await fetch(url, { signal });
  console.debug("[Search/fetchCities] response", { ok: res.ok, status: res.status, statusText: res.statusText });

  if (!res.ok) throw new Error(`IBGE ${res.status}: ${res.statusText || "erro ao carregar municípios"}`);

  const data: unknown = await res.json();
  console.debug("[Search/fetchCities] payload", {
    isArray: Array.isArray(data),
    count: Array.isArray(data) ? data.length : 0,
    first: Array.isArray(data) ? data[0] : null,
  });

  if (!Array.isArray(data)) {
    throw new Error("Resposta inválida da API do IBGE");
  }

  const cities = data
    .map((c) => {
      if (!c || typeof c !== "object" || !("nome" in c)) return "";
      const name = (c as { nome?: unknown }).nome;
      return typeof name === "string" ? name.trim() : "";
    })
    .filter((name): name is string => name.length > 0);

  const uniqueCities = Array.from(new Set(cities));
  console.debug("[Search/fetchCities] parsed", { count: uniqueCities.length, cities: uniqueCities.slice(0, 8) });

  return uniqueCities;
}

export const CRM_COLUMNS: { id: import("./types").CrmStatus; label: string; tone: string }[] = [
  { id: "new", label: "Novo Lead", tone: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  { id: "contacted", label: "Contato realizado", tone: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
  { id: "awaiting", label: "Aguardando resposta", tone: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  { id: "negotiation", label: "Negociação", tone: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  { id: "proposal", label: "Proposta enviada", tone: "bg-pink-500/10 text-pink-500 border-pink-500/20" },
  { id: "client", label: "Cliente", tone: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  { id: "lost", label: "Perdido", tone: "bg-rose-500/10 text-rose-500 border-rose-500/20" },
];
