// Lead scoring engine (Money / Pain / Final).
// Pure functions — no side effects. Inputs are partial Lead-like objects
// so this works both at API normalization time and for already-stored leads.

export interface ScoreableLead {
  rating?: number | null;
  reviews_count?: number | null;
  website?: string | null;
  has_website?: boolean | null;
  website_quality?: "good" | "bad" | "outdated" | null;
  instagram?: string | null;
  facebook?: string | null;
}

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function hasWebsite(lead: ScoreableLead): boolean {
  if (lead.has_website === true) return true;
  if (typeof lead.website === "string" && lead.website.trim().length > 0) return true;
  return false;
}

export function calculateMoneyScore(lead: ScoreableLead): number {
  let score = 0;
  const reviews = typeof lead.reviews_count === "number" ? lead.reviews_count : 0;
  const rating = typeof lead.rating === "number" ? lead.rating : 0;

  if (reviews > 300) score += 35;
  else if (reviews > 100) score += 25;
  else if (reviews > 30) score += 15;

  if (rating >= 4.7) score += 20;
  else if (rating >= 4.3) score += 10;

  if (hasWebsite(lead)) score += 25;

  return clamp(score);
}

export function calculatePainScore(lead: ScoreableLead): number {
  let score = 0;

  const hasSite = hasWebsite(lead);
  if (!hasSite) {
    score += 40;
  } else if (lead.website_quality === "bad" || lead.website_quality === "outdated") {
    score += 30;
  }

  if (!lead.instagram || String(lead.instagram).trim() === "") score += 15;
  if (!lead.facebook || String(lead.facebook).trim() === "") score += 10;

  return clamp(score);
}

export function calculateIntentScore(lead: ScoreableLead): number {
  let score = 0;
  const rating = typeof lead.rating === "number" ? lead.rating : 0;
  const reviews = typeof lead.reviews_count === "number" ? lead.reviews_count : 0;
  const hasSite = hasWebsite(lead);
  const hasIg = !!(lead.instagram && String(lead.instagram).trim() !== "");
  const hasFb = !!(lead.facebook && String(lead.facebook).trim() !== "");

  if (rating >= 4.5 && !hasSite) score += 40;
  if (reviews > 100 && !hasSite) score += 35;
  if (!hasIg || !hasFb) score += 25;
  if (rating === 5.0) score += 20;

  return clamp(score);
}

export function calculateFinalScore(lead: ScoreableLead): number {
  const money = calculateMoneyScore(lead);
  const pain = calculatePainScore(lead);
  const intent = calculateIntentScore(lead);
  return clamp(Math.round(money * 0.4 + pain * 0.35 + intent * 0.25));
}

export function enrichLeadWithScores<T extends ScoreableLead>(
  lead: T,
): T & { money_score: number; pain_score: number; intent_score: number; final_score: number } {
  const money_score = calculateMoneyScore(lead);
  const pain_score = calculatePainScore(lead);
  const intent_score = calculateIntentScore(lead);
  const final_score = clamp(Math.round(money_score * 0.4 + pain_score * 0.35 + intent_score * 0.25));
  return { ...lead, money_score, pain_score, intent_score, final_score };
}

export function sortLeadsByScore<T extends { final_score?: number }>(leads: T[]): T[] {
  // Stable sort: preserves original order for equal scores; does not mutate input.
  return leads
    .map((lead, index) => ({ lead, index }))
    .sort((a, b) => {
      const diff = (b.lead.final_score ?? 0) - (a.lead.final_score ?? 0);
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map(({ lead }) => lead);
}

export function getLeadTemperature(score?: number): { label: "HOT" | "WARM" | "COLD"; badgeClass: string } {
  const s = typeof score === "number" ? score : 0;
  if (s >= 80) {
    return {
      label: "HOT",
      badgeClass: "text-[10px] border-rose-500/50 text-rose-400 bg-rose-500/10",
    };
  }
  if (s >= 50) {
    return {
      label: "WARM",
      badgeClass: "text-[10px] border-amber-500/50 text-amber-400 bg-amber-500/10",
    };
  }
  return {
    label: "COLD",
    badgeClass: "text-[10px] border-sky-500/50 text-sky-400 bg-sky-500/10",
  };
}

export function buildScoreReasons(lead: ScoreableLead): string[] {
  const reasons: string[] = [];
  const reviews = typeof lead.reviews_count === "number" ? lead.reviews_count : 0;
  const rating = typeof lead.rating === "number" ? lead.rating : 0;
  if (reviews > 100) reasons.push("Muitas avaliações");
  if (hasWebsite(lead)) reasons.push("Possui website");
  if (rating >= 4.5) reasons.push("Alta reputação");
  if (!hasWebsite(lead)) reasons.push("Sem site");
  return reasons.slice(0, 3);
}
