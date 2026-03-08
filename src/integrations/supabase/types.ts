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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      auction_alerts: {
        Row: {
          active: boolean | null
          city: string | null
          court_name: string | null
          created_at: string
          email_notify: boolean | null
          id: string
          max_price: number | null
          min_price: number | null
          property_type: Database["public"]["Enums"]["property_type"] | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          city?: string | null
          court_name?: string | null
          created_at?: string
          email_notify?: boolean | null
          id?: string
          max_price?: number | null
          min_price?: number | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          city?: string | null
          court_name?: string | null
          created_at?: string
          email_notify?: boolean | null
          id?: string
          max_price?: number | null
          min_price?: number | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          listing_id: string | null
          participant_a: string
          participant_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          participant_a: string
          participant_b: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          participant_a?: string
          participant_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      firesale_requests: {
        Row: {
          address: string
          ai_estimate: number | null
          asking_price: number | null
          bedrooms: number | null
          city: string
          condition: string
          contact_email: string
          contact_phone: string | null
          created_at: string
          id: string
          notes: string | null
          offer_price: number | null
          property_type: Database["public"]["Enums"]["property_type"] | null
          sqm: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address: string
          ai_estimate?: number | null
          asking_price?: number | null
          bedrooms?: number | null
          city: string
          condition: string
          contact_email: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          offer_price?: number | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          sqm: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string
          ai_estimate?: number | null
          asking_price?: number | null
          bedrooms?: number | null
          city?: string
          condition?: string
          contact_email?: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          offer_price?: number | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          sqm?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      listing_images: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          address: string | null
          ai_score: number | null
          auction_court: string | null
          auction_date: string | null
          auction_starting_bid: number | null
          bathrooms: number | null
          bedrooms: number | null
          cadastre_number: string | null
          city: string
          cover_image_url: string | null
          created_at: string
          description: string | null
          energy_class: string | null
          enfia_zone: string | null
          floor: number | null
          has_elevator: boolean | null
          has_garden: boolean | null
          has_parking: boolean | null
          has_pool: boolean | null
          has_security: boolean | null
          has_smart_home: boolean | null
          has_storage: boolean | null
          has_video_tour: boolean | null
          has_virtual_tour: boolean | null
          id: string
          latitude: number | null
          listing_type: Database["public"]["Enums"]["listing_type"]
          longitude: number | null
          owner_id: string
          postal_code: string | null
          price: number
          price_per_sqm: number | null
          property_type: Database["public"]["Enums"]["property_type"]
          region: string | null
          sqm: number
          status: Database["public"]["Enums"]["listing_status"]
          tags: string[] | null
          title: string
          total_floors: number | null
          updated_at: string
          views_count: number
          year_built: number | null
        }
        Insert: {
          address?: string | null
          ai_score?: number | null
          auction_court?: string | null
          auction_date?: string | null
          auction_starting_bid?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          cadastre_number?: string | null
          city: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          energy_class?: string | null
          enfia_zone?: string | null
          floor?: number | null
          has_elevator?: boolean | null
          has_garden?: boolean | null
          has_parking?: boolean | null
          has_pool?: boolean | null
          has_security?: boolean | null
          has_smart_home?: boolean | null
          has_storage?: boolean | null
          has_video_tour?: boolean | null
          has_virtual_tour?: boolean | null
          id?: string
          latitude?: number | null
          listing_type?: Database["public"]["Enums"]["listing_type"]
          longitude?: number | null
          owner_id: string
          postal_code?: string | null
          price: number
          price_per_sqm?: number | null
          property_type: Database["public"]["Enums"]["property_type"]
          region?: string | null
          sqm: number
          status?: Database["public"]["Enums"]["listing_status"]
          tags?: string[] | null
          title: string
          total_floors?: number | null
          updated_at?: string
          views_count?: number
          year_built?: number | null
        }
        Update: {
          address?: string | null
          ai_score?: number | null
          auction_court?: string | null
          auction_date?: string | null
          auction_starting_bid?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          cadastre_number?: string | null
          city?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          energy_class?: string | null
          enfia_zone?: string | null
          floor?: number | null
          has_elevator?: boolean | null
          has_garden?: boolean | null
          has_parking?: boolean | null
          has_pool?: boolean | null
          has_security?: boolean | null
          has_smart_home?: boolean | null
          has_storage?: boolean | null
          has_video_tour?: boolean | null
          has_virtual_tour?: boolean | null
          id?: string
          latitude?: number | null
          listing_type?: Database["public"]["Enums"]["listing_type"]
          longitude?: number | null
          owner_id?: string
          postal_code?: string | null
          price?: number
          price_per_sqm?: number | null
          property_type?: Database["public"]["Enums"]["property_type"]
          region?: string | null
          sqm?: number
          status?: Database["public"]["Enums"]["listing_status"]
          tags?: string[] | null
          title?: string
          total_floors?: number | null
          updated_at?: string
          views_count?: number
          year_built?: number | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
          status: Database["public"]["Enums"]["message_status"]
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
          status?: Database["public"]["Enums"]["message_status"]
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
          status?: Database["public"]["Enums"]["message_status"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          avatar_url: string | null
          bio: string | null
          category: Database["public"]["Enums"]["professional_category"]
          city: string | null
          created_at: string
          display_name: string | null
          experience_years: number | null
          hourly_rate: number | null
          id: string
          languages: string[] | null
          license_number: string | null
          projects_count: number | null
          rating: number | null
          reviews_count: number | null
          specialties: string[] | null
          title: string
          updated_at: string
          user_id: string
          verified: boolean
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          category: Database["public"]["Enums"]["professional_category"]
          city?: string | null
          created_at?: string
          display_name?: string | null
          experience_years?: number | null
          hourly_rate?: number | null
          id?: string
          languages?: string[] | null
          license_number?: string | null
          projects_count?: number | null
          rating?: number | null
          reviews_count?: number | null
          specialties?: string[] | null
          title: string
          updated_at?: string
          user_id: string
          verified?: boolean
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          category?: Database["public"]["Enums"]["professional_category"]
          city?: string | null
          created_at?: string
          display_name?: string | null
          experience_years?: number | null
          hourly_rate?: number | null
          id?: string
          languages?: string[] | null
          license_number?: string | null
          projects_count?: number | null
          rating?: number | null
          reviews_count?: number | null
          specialties?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
          verified?: boolean
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string
          display_name: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
          verified: boolean
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
          verified?: boolean
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id?: string
          verified?: boolean
          website_url?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      viewings: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          note: string | null
          owner_id: string
          requester_id: string
          scheduled_at: string
          status: Database["public"]["Enums"]["viewing_status"]
          updated_at: string
          video_link: string | null
          viewing_type: Database["public"]["Enums"]["viewing_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          note?: string | null
          owner_id: string
          requester_id: string
          scheduled_at: string
          status?: Database["public"]["Enums"]["viewing_status"]
          updated_at?: string
          video_link?: string | null
          viewing_type?: Database["public"]["Enums"]["viewing_type"]
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          note?: string | null
          owner_id?: string
          requester_id?: string
          scheduled_at?: string
          status?: Database["public"]["Enums"]["viewing_status"]
          updated_at?: string
          video_link?: string | null
          viewing_type?: Database["public"]["Enums"]["viewing_type"]
        }
        Relationships: [
          {
            foreignKeyName: "viewings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      listing_status:
        | "draft"
        | "active"
        | "paused"
        | "sold"
        | "rented"
        | "expired"
      listing_type: "sale" | "rent" | "auction" | "firesale"
      message_status: "sent" | "read"
      professional_category:
        | "architect"
        | "civil_engineer"
        | "lawyer"
        | "notary"
        | "electrician"
        | "plumber"
        | "contractor"
        | "property_manager"
        | "valuer"
        | "interior_designer"
        | "financial_advisor"
      property_type:
        | "apartment"
        | "house"
        | "villa"
        | "land"
        | "commercial"
        | "office"
      user_role: "individual" | "agent" | "professional"
      viewing_status: "pending" | "confirmed" | "cancelled" | "completed"
      viewing_type: "in_person" | "video"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      listing_status: [
        "draft",
        "active",
        "paused",
        "sold",
        "rented",
        "expired",
      ],
      listing_type: ["sale", "rent", "auction", "firesale"],
      message_status: ["sent", "read"],
      professional_category: [
        "architect",
        "civil_engineer",
        "lawyer",
        "notary",
        "electrician",
        "plumber",
        "contractor",
        "property_manager",
        "valuer",
        "interior_designer",
        "financial_advisor",
      ],
      property_type: [
        "apartment",
        "house",
        "villa",
        "land",
        "commercial",
        "office",
      ],
      user_role: ["individual", "agent", "professional"],
      viewing_status: ["pending", "confirmed", "cancelled", "completed"],
      viewing_type: ["in_person", "video"],
    },
  },
} as const
