// Contexto de MÍDIA do React Studio (front).
//
// Reutiliza o sistema de imagens JÁ existente no TiagoProspector:
//   - foto REAL do lead (`leads.photo_name` → `resolveLeadImage`);
//   - art direction por nicho + edge `get-images` (Pexels) para imagens
//     ilustrativas quando NÃO há foto real.
// NUNCA inventa foto nem endereço: sem dado real, o campo fica vazio.

import { resolveLeadImage } from "@/lib/leadImage";
import { getImageNeeds, sectionImageQuery } from "../../../supabase/functions/_shared/image-assets";
import { supabase } from "@/integrations/supabase/client";

export interface SiteMediaInput {
  name?: string | null;
  segment?: string | null;
  category?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  /** `leads.photo_name` (foto real do estabelecimento). */
  photoName?: unknown;
  /** `leads.google_url` (fonte do place_id). */
  googleUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SiteMediaContext {
  /** Fotos REAIS do cliente (URLs https). */
  photos: string[];
  address: string | null;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
}

/** Extrai o place_id (ChIJ…) de uma URL do Google Maps — quando existir. */
export function parsePlaceId(googleUrl: unknown): string | null {
  if (typeof googleUrl !== "string") return null;
  const m = googleUrl.match(/place_id[:=]([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

/** Monta o contexto de mídia a partir de dados REAIS (lead + projeto/spec). */
export function buildSiteMediaContext(input: SiteMediaInput): SiteMediaContext {
  const photo = resolveLeadImage(input.photoName);
  const address = typeof input.address === "string" && input.address.trim() ? input.address.trim() : null;
  const category = [input.category, input.segment].find((v): v is string => typeof v === "string" && v.trim() !== "") ?? null;
  return {
    photos: photo.url ? [photo.url] : [],
    address,
    placeId: parsePlaceId(input.googleUrl),
    latitude: typeof input.latitude === "number" && Number.isFinite(input.latitude) ? input.latitude : null,
    longitude: typeof input.longitude === "number" && Number.isFinite(input.longitude) ? input.longitude : null,
    category,
  };
}

/**
 * Imagens ilustrativas (stock) pelo sistema existente: art direction do nicho +
 * edge `get-images`. Best-effort: qualquer falha devolve [] (nunca quebra a geração).
 */
export async function fetchIllustrativeImages(segment: string | null | undefined, count = 6): Promise<string[]> {
  const seg = typeof segment === "string" ? segment.trim() : "";
  if (!seg) return [];
  try {
    const needs = getImageNeeds(seg);
    const query = sectionImageQuery(seg, "hero") ?? needs.heroQuery;
    const { data, error } = await supabase.functions.invoke<{ assets?: Array<{ url?: unknown }> }>("get-images", {
      body: { query, count, orientation: needs.orientation },
    });
    if (error || !data) return [];
    const urls = (data.assets ?? [])
      .map((a) => (typeof a?.url === "string" ? a.url.trim() : ""))
      .filter((u) => /^https?:\/\//i.test(u));
    return Array.from(new Set(urls)).slice(0, count);
  } catch {
    return [];
  }
}
