export type CrmStatus =
  | "new"
  | "contacted"
  | "awaiting"
  | "negotiation"
  | "proposal"
  | "client"
  | "lost";

export interface Lead {
  id: string;
  user_id: string;
  search_id: string | null;
  name: string;
  category: string | null;
  segment: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  google_url: string | null;
  instagram: string | null;
  facebook: string | null;
  rating: number | null;
  reviews_count: number | null;
  score: number;
  score_reasons: string[];
  has_website: boolean;
  is_favorite: boolean;
  is_contacted: boolean;
  in_crm: boolean;
  crm_status: CrmStatus;
  crm_order: number;
  notes: string | null;
  ai_message: string | null;
  opening_hours: string[] | null;
  latitude: number | null;
  longitude: number | null;
  confidence: "high" | "medium" | "low" | null;
  money_score?: number;
  pain_score?: number;
  intent_score?: number;
  final_score?: number;
  created_at: string;
  updated_at: string;
}

export interface Search {
  id: string;
  user_id: string;
  state: string;
  city: string;
  segment: string;
  results_count: number;
  notes: string | null;
  created_at: string;
}
