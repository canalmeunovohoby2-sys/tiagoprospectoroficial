export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      lead_activities: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          payload: Json | null
          type: Database["public"]["Enums"]["activity_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          payload?: Json | null
          type: Database["public"]["Enums"]["activity_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          payload?: Json | null
          type?: Database["public"]["Enums"]["activity_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          ai_message: string | null
          category: string | null
          city: string | null
          confidence: string | null
          created_at: string
          crm_order: number
          crm_status: Database["public"]["Enums"]["crm_status"]
          external_id: string | null
          facebook: string | null
          final_score: number | null
          google_url: string | null
          has_website: boolean | null
          id: string
          in_crm: boolean
          instagram: string | null
          intent_score: number | null
          is_contacted: boolean
          is_favorite: boolean
          latitude: number | null
          longitude: number | null
          money_score: number | null
          name: string
          notes: string | null
          opening_hours: Json | null
          pain_score: number | null
          phone: string | null
          rating: number | null
          reviews_count: number | null
          score: number
          score_reasons: Json | null
          search_id: string | null
          segment: string | null
          state: string | null
          updated_at: string
          user_id: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          ai_message?: string | null
          category?: string | null
          city?: string | null
          confidence?: string | null
          created_at?: string
          crm_order?: number
          crm_status?: Database["public"]["Enums"]["crm_status"]
          external_id?: string | null
          facebook?: string | null
          final_score?: number | null
          google_url?: string | null
          has_website?: boolean | null
          id?: string
          in_crm?: boolean
          instagram?: string | null
          intent_score?: number | null
          is_contacted?: boolean
          is_favorite?: boolean
          latitude?: number | null
          longitude?: number | null
          money_score?: number | null
          name: string
          notes?: string | null
          opening_hours?: Json | null
          pain_score?: number | null
          phone?: string | null
          rating?: number | null
          reviews_count?: number | null
          score?: number
          score_reasons?: Json | null
          search_id?: string | null
          segment?: string | null
          state?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          ai_message?: string | null
          category?: string | null
          city?: string | null
          confidence?: string | null
          created_at?: string
          crm_order?: number
          crm_status?: Database["public"]["Enums"]["crm_status"]
          external_id?: string | null
          facebook?: string | null
          final_score?: number | null
          google_url?: string | null
          has_website?: boolean | null
          id?: string
          in_crm?: boolean
          instagram?: string | null
          intent_score?: number | null
          is_contacted?: boolean
          is_favorite?: boolean
          latitude?: number | null
          longitude?: number | null
          money_score?: number | null
          name?: string
          notes?: string | null
          opening_hours?: Json | null
          pain_score?: number | null
          phone?: string | null
          rating?: number | null
          reviews_count?: number | null
          score?: number
          score_reasons?: Json | null
          search_id?: string | null
          segment?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "searches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      searches: {
        Row: {
          city: string
          created_at: string
          id: string
          notes: string | null
          results_count: number
          segment: string
          state: string
          user_id: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          notes?: string | null
          results_count?: number
          segment: string
          state: string
          user_id: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          notes?: string | null
          results_count?: number
          segment?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          created_at: string
          done: boolean
          id: string
          identifier: string
          paid: number
          position: number
          total: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          identifier: string
          paid?: number
          position?: number
          total?: number
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          identifier?: string
          paid?: number
          position?: number
          total?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_chat_messages: {
        Row: {
          attachment: Json | null
          created_at: string
          id: string
          project_id: string
          role: string
          text: string
          user_id: string
        }
        Insert: {
          attachment?: Json | null
          created_at?: string
          id?: string
          project_id: string
          role: string
          text?: string
          user_id: string
        }
        Update: {
          attachment?: Json | null
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_chat_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      site_project_versions: {
        Row: {
          change_summary: string | null
          created_at: string
          id: string
          project_id: string
          spec: Json
          user_id: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          id?: string
          project_id: string
          spec: Json
          user_id: string
          version_number: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          id?: string
          project_id?: string
          spec?: Json
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_project_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      site_projects: {
        Row: {
          ai_model: string | null
          assets: Json
          briefing: Json
          calls_to_action: Json
          city: string | null
          company_name: string
          content: Json
          created_at: string
          design_system: Json
          generated_code: Json
          id: string
          lead_id: string | null
          name: string
          published_at: string | null
          published_spec: Json | null
          published_status: string
          segment: string | null
          seo: Json
          settings: Json
          site_structure: Json
          slug: string | null
          spec: Json
          state: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_model?: string | null
          assets?: Json
          briefing?: Json
          calls_to_action?: Json
          city?: string | null
          company_name?: string
          content?: Json
          created_at?: string
          design_system?: Json
          generated_code?: Json
          id?: string
          lead_id?: string | null
          name?: string
          published_at?: string | null
          published_spec?: Json | null
          published_status?: string
          segment?: string | null
          seo?: Json
          settings?: Json
          site_structure?: Json
          slug?: string | null
          spec?: Json
          state?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_model?: string | null
          assets?: Json
          briefing?: Json
          calls_to_action?: Json
          city?: string | null
          company_name?: string
          content?: Json
          created_at?: string
          design_system?: Json
          generated_code?: Json
          id?: string
          lead_id?: string | null
          name?: string
          published_at?: string | null
          published_spec?: Json | null
          published_status?: string
          segment?: string | null
          seo?: Json
          settings?: Json
          site_structure?: Json
          slug?: string | null
          spec?: Json
          state?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_projects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_public_site: {
        Args: { p_slug: string }
        Returns: {
          name: string
          published_at: string
          published_spec: Json
          slug: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      activity_type:
        | "contact"
        | "status_change"
        | "note"
        | "ai_message"
        | "favorite"
        | "proposal"
      app_role: "admin" | "user"
      crm_status:
        | "new"
        | "contacted"
        | "awaiting"
        | "negotiation"
        | "proposal"
        | "client"
        | "lost"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_type: [
        "contact",
        "status_change",
        "note",
        "ai_message",
        "favorite",
        "proposal",
      ],
      app_role: ["admin", "user"],
      crm_status: [
        "new",
        "contacted",
        "awaiting",
        "negotiation",
        "proposal",
        "client",
        "lost",
      ],
    },
  },
} as const
