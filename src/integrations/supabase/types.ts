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
      consultation_requests: {
        Row: {
          callback_time: string | null
          created_at: string
          id: string
          message: string | null
          preferred_date: string | null
          preferred_time: string | null
          professional_id: string
          request_type: string
          requester_email: string
          requester_id: string | null
          requester_name: string
          requester_phone: string | null
          service: string | null
          status: string
          updated_at: string
        }
        Insert: {
          callback_time?: string | null
          created_at?: string
          id?: string
          message?: string | null
          preferred_date?: string | null
          preferred_time?: string | null
          professional_id: string
          request_type: string
          requester_email: string
          requester_id?: string | null
          requester_name: string
          requester_phone?: string | null
          service?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          callback_time?: string | null
          created_at?: string
          id?: string
          message?: string | null
          preferred_date?: string | null
          preferred_time?: string | null
          professional_id?: string
          request_type?: string
          requester_email?: string
          requester_id?: string | null
          requester_name?: string
          requester_phone?: string | null
          service?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_tasks: {
        Row: {
          completed_at: string | null
          contact_id: string
          created_at: string
          due_at: string | null
          id: string
          notes: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          contact_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          notes?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          contact_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          notes?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          deal_stage: string
          email: string | null
          follow_up_at: string | null
          id: string
          listing_id: string | null
          name: string
          notes: string | null
          phone: string | null
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deal_stage?: string
          email?: string | null
          follow_up_at?: string | null
          id?: string
          listing_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deal_stage?: string
          email?: string | null
          follow_up_at?: string | null
          id?: string
          listing_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
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
      cron_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      deal_checklists: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          items: Json
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          items?: Json
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          items?: Json
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          price_alert: boolean
          price_when_saved: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          price_alert?: boolean
          price_when_saved?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          price_alert?: boolean
          price_when_saved?: number | null
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
          admin_notes: string | null
          ai_estimate: number | null
          asking_price: number | null
          bedrooms: number | null
          city: string
          condition: string | null
          contact_email: string
          contact_phone: string | null
          created_at: string
          id: string
          notes: string | null
          offer_price: number | null
          property_type: Database["public"]["Enums"]["property_type"] | null
          published_to_investors: boolean
          sqm: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address: string
          admin_notes?: string | null
          ai_estimate?: number | null
          asking_price?: number | null
          bedrooms?: number | null
          city: string
          condition?: string | null
          contact_email: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          offer_price?: number | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          published_to_investors?: boolean
          sqm: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string
          admin_notes?: string | null
          ai_estimate?: number | null
          asking_price?: number | null
          bedrooms?: number | null
          city?: string
          condition?: string | null
          contact_email?: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          offer_price?: number | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          published_to_investors?: boolean
          sqm?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      firesale_requests_investor_feed: {
        Row: {
          address: string
          asking_price: number | null
          city: string
          created_at: string
          id: string
          property_type: Database["public"]["Enums"]["property_type"] | null
          sqm: number | null
          status: string | null
        }
        Insert: {
          address: string
          asking_price?: number | null
          city: string
          created_at: string
          id: string
          property_type?: Database["public"]["Enums"]["property_type"] | null
          sqm?: number | null
          status?: string | null
        }
        Update: {
          address?: string
          asking_price?: number | null
          city?: string
          created_at?: string
          id?: string
          property_type?: Database["public"]["Enums"]["property_type"] | null
          sqm?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firesale_requests_investor_feed_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "firesale_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          started_at: string
          status: string
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          started_at?: string
          status?: string
          tier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          started_at?: string
          status?: string
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invitation_requests: {
        Row: {
          aum_range: string | null
          company: string | null
          company_website: string | null
          created_at: string
          deal_size_range: string | null
          email: string
          full_name: string | null
          geographic_focus: string | null
          id: string
          investment_focus: string | null
          investment_vehicle: string | null
          job_title: string | null
          linkedin_url: string | null
          message: string | null
          phone: string | null
          source: string | null
          status: string
          terms_accepted: boolean | null
          user_id: string | null
          years_experience: string | null
        }
        Insert: {
          aum_range?: string | null
          company?: string | null
          company_website?: string | null
          created_at?: string
          deal_size_range?: string | null
          email: string
          full_name?: string | null
          geographic_focus?: string | null
          id?: string
          investment_focus?: string | null
          investment_vehicle?: string | null
          job_title?: string | null
          linkedin_url?: string | null
          message?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          terms_accepted?: boolean | null
          user_id?: string | null
          years_experience?: string | null
        }
        Update: {
          aum_range?: string | null
          company?: string | null
          company_website?: string | null
          created_at?: string
          deal_size_range?: string | null
          email?: string
          full_name?: string | null
          geographic_focus?: string | null
          id?: string
          investment_focus?: string | null
          investment_vehicle?: string | null
          job_title?: string | null
          linkedin_url?: string | null
          message?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          terms_accepted?: boolean | null
          user_id?: string | null
          years_experience?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          created_at: string
          email: string | null
          follow_up_at: string | null
          id: string
          listing_id: string | null
          message: string | null
          name: string
          notes: string | null
          owner_id: string
          phone: string | null
          professional_id: string | null
          project_id: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          follow_up_at?: string | null
          id?: string
          listing_id?: string | null
          message?: string | null
          name: string
          notes?: string | null
          owner_id: string
          phone?: string | null
          professional_id?: string | null
          project_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          follow_up_at?: string | null
          id?: string
          listing_id?: string | null
          message?: string | null
          name?: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
          professional_id?: string | null
          project_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      listing_reports: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reporter_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          reporter_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          reporter_id?: string | null
        }
        Relationships: []
      }
      listing_view_events: {
        Row: {
          id: string
          listing_id: string
          viewed_at: string
          viewer_id: string | null
        }
        Insert: {
          id?: string
          listing_id: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Update: {
          id?: string
          listing_id?: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_view_events_listing_id_fkey"
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
          agent_fee_included: boolean | null
          ai_score: number | null
          auction_court: string | null
          auction_date: string | null
          auction_starting_bid: number | null
          available_from: string | null
          bathrooms: number | null
          bedrooms: number | null
          building_allowance: number | null
          cadastre_number: string | null
          city: string
          commercial_subtype: string | null
          construction_status: string | null
          cover_image_url: string | null
          coverage_ratio: number | null
          created_at: string
          deposit_months: number | null
          description: string | null
          distance_from_city: number | null
          distance_from_sea: number | null
          energy_class: string | null
          enfia_zone: string | null
          facade_length: number | null
          floor: number | null
          floor_height: number | null
          has_ac: boolean | null
          has_alarm: boolean | null
          has_attic: boolean | null
          has_awning: boolean | null
          has_balcony: boolean | null
          has_cctv: boolean | null
          has_disability_access: boolean | null
          has_double_glazing: boolean | null
          has_electricity_supply: boolean | null
          has_elevator: boolean | null
          has_equipped: boolean | null
          has_facade: boolean | null
          has_fireplace: boolean | null
          has_furnished: boolean | null
          has_garden: boolean | null
          has_internal_staircase: boolean | null
          has_land_concession: boolean | null
          has_loading_dock: boolean | null
          has_night_power: boolean | null
          has_painted: boolean | null
          has_parking: boolean | null
          has_pool: boolean | null
          has_satellite: boolean | null
          has_secure_door: boolean | null
          has_security: boolean | null
          has_smart_home: boolean | null
          has_solar_water: boolean | null
          has_storage: boolean | null
          has_structured_cabling: boolean | null
          has_three_phase_power: boolean | null
          has_underfloor_heating: boolean | null
          has_video_tour: boolean | null
          has_view: boolean | null
          has_virtual_tour: boolean | null
          has_water_supply: boolean | null
          has_window_screens: boolean | null
          heating_system: string | null
          id: string
          is_buildable: boolean | null
          is_corner: boolean | null
          is_featured: boolean
          is_neoclassical: boolean | null
          is_off_market: boolean
          is_penthouse: boolean | null
          is_pre_sale: boolean
          is_preserved: boolean | null
          kitchens: number | null
          land_use: string | null
          latitude: number | null
          levels: number | null
          listing_type: Database["public"]["Enums"]["listing_type"]
          living_rooms: number | null
          longitude: number | null
          min_rental_months: number | null
          monthly_expenses: number | null
          open_house_date: string | null
          owner_id: string | null
          pets_allowed: boolean | null
          plot_depth: number | null
          plot_surface: number | null
          postal_code: string | null
          price: number
          price_per_sqm: number | null
          priority_placement: number
          property_type: Database["public"]["Enums"]["property_type"]
          region: string | null
          road_type: string | null
          short_term_rental: boolean | null
          slope: string | null
          sqm: number
          status: Database["public"]["Enums"]["listing_status"]
          suitable_commercial_use: boolean | null
          suitable_holiday: boolean | null
          suitable_investment: boolean | null
          suitable_student: boolean | null
          tags: string[] | null
          title: string
          total_floors: number | null
          updated_at: string
          views_count: number
          wc_count: number | null
          website_url: string | null
          within_city_plan: boolean | null
          within_settlement: boolean | null
          year_built: number | null
          zone_type: string | null
        }
        Insert: {
          address?: string | null
          agent_fee_included?: boolean | null
          ai_score?: number | null
          auction_court?: string | null
          auction_date?: string | null
          auction_starting_bid?: number | null
          available_from?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          building_allowance?: number | null
          cadastre_number?: string | null
          city: string
          commercial_subtype?: string | null
          construction_status?: string | null
          cover_image_url?: string | null
          coverage_ratio?: number | null
          created_at?: string
          deposit_months?: number | null
          description?: string | null
          distance_from_city?: number | null
          distance_from_sea?: number | null
          energy_class?: string | null
          enfia_zone?: string | null
          facade_length?: number | null
          floor?: number | null
          floor_height?: number | null
          has_ac?: boolean | null
          has_alarm?: boolean | null
          has_attic?: boolean | null
          has_awning?: boolean | null
          has_balcony?: boolean | null
          has_cctv?: boolean | null
          has_disability_access?: boolean | null
          has_double_glazing?: boolean | null
          has_electricity_supply?: boolean | null
          has_elevator?: boolean | null
          has_equipped?: boolean | null
          has_facade?: boolean | null
          has_fireplace?: boolean | null
          has_furnished?: boolean | null
          has_garden?: boolean | null
          has_internal_staircase?: boolean | null
          has_land_concession?: boolean | null
          has_loading_dock?: boolean | null
          has_night_power?: boolean | null
          has_painted?: boolean | null
          has_parking?: boolean | null
          has_pool?: boolean | null
          has_satellite?: boolean | null
          has_secure_door?: boolean | null
          has_security?: boolean | null
          has_smart_home?: boolean | null
          has_solar_water?: boolean | null
          has_storage?: boolean | null
          has_structured_cabling?: boolean | null
          has_three_phase_power?: boolean | null
          has_underfloor_heating?: boolean | null
          has_video_tour?: boolean | null
          has_view?: boolean | null
          has_virtual_tour?: boolean | null
          has_water_supply?: boolean | null
          has_window_screens?: boolean | null
          heating_system?: string | null
          id?: string
          is_buildable?: boolean | null
          is_corner?: boolean | null
          is_featured?: boolean
          is_neoclassical?: boolean | null
          is_off_market?: boolean
          is_penthouse?: boolean | null
          is_pre_sale?: boolean
          is_preserved?: boolean | null
          kitchens?: number | null
          land_use?: string | null
          latitude?: number | null
          levels?: number | null
          listing_type?: Database["public"]["Enums"]["listing_type"]
          living_rooms?: number | null
          longitude?: number | null
          min_rental_months?: number | null
          monthly_expenses?: number | null
          open_house_date?: string | null
          owner_id?: string | null
          pets_allowed?: boolean | null
          plot_depth?: number | null
          plot_surface?: number | null
          postal_code?: string | null
          price: number
          price_per_sqm?: number | null
          priority_placement?: number
          property_type: Database["public"]["Enums"]["property_type"]
          region?: string | null
          road_type?: string | null
          short_term_rental?: boolean | null
          slope?: string | null
          sqm: number
          status?: Database["public"]["Enums"]["listing_status"]
          suitable_commercial_use?: boolean | null
          suitable_holiday?: boolean | null
          suitable_investment?: boolean | null
          suitable_student?: boolean | null
          tags?: string[] | null
          title: string
          total_floors?: number | null
          updated_at?: string
          views_count?: number
          wc_count?: number | null
          website_url?: string | null
          within_city_plan?: boolean | null
          within_settlement?: boolean | null
          year_built?: number | null
          zone_type?: string | null
        }
        Update: {
          address?: string | null
          agent_fee_included?: boolean | null
          ai_score?: number | null
          auction_court?: string | null
          auction_date?: string | null
          auction_starting_bid?: number | null
          available_from?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          building_allowance?: number | null
          cadastre_number?: string | null
          city?: string
          commercial_subtype?: string | null
          construction_status?: string | null
          cover_image_url?: string | null
          coverage_ratio?: number | null
          created_at?: string
          deposit_months?: number | null
          description?: string | null
          distance_from_city?: number | null
          distance_from_sea?: number | null
          energy_class?: string | null
          enfia_zone?: string | null
          facade_length?: number | null
          floor?: number | null
          floor_height?: number | null
          has_ac?: boolean | null
          has_alarm?: boolean | null
          has_attic?: boolean | null
          has_awning?: boolean | null
          has_balcony?: boolean | null
          has_cctv?: boolean | null
          has_disability_access?: boolean | null
          has_double_glazing?: boolean | null
          has_electricity_supply?: boolean | null
          has_elevator?: boolean | null
          has_equipped?: boolean | null
          has_facade?: boolean | null
          has_fireplace?: boolean | null
          has_furnished?: boolean | null
          has_garden?: boolean | null
          has_internal_staircase?: boolean | null
          has_land_concession?: boolean | null
          has_loading_dock?: boolean | null
          has_night_power?: boolean | null
          has_painted?: boolean | null
          has_parking?: boolean | null
          has_pool?: boolean | null
          has_satellite?: boolean | null
          has_secure_door?: boolean | null
          has_security?: boolean | null
          has_smart_home?: boolean | null
          has_solar_water?: boolean | null
          has_storage?: boolean | null
          has_structured_cabling?: boolean | null
          has_three_phase_power?: boolean | null
          has_underfloor_heating?: boolean | null
          has_video_tour?: boolean | null
          has_view?: boolean | null
          has_virtual_tour?: boolean | null
          has_water_supply?: boolean | null
          has_window_screens?: boolean | null
          heating_system?: string | null
          id?: string
          is_buildable?: boolean | null
          is_corner?: boolean | null
          is_featured?: boolean
          is_neoclassical?: boolean | null
          is_off_market?: boolean
          is_penthouse?: boolean | null
          is_pre_sale?: boolean
          is_preserved?: boolean | null
          kitchens?: number | null
          land_use?: string | null
          latitude?: number | null
          levels?: number | null
          listing_type?: Database["public"]["Enums"]["listing_type"]
          living_rooms?: number | null
          longitude?: number | null
          min_rental_months?: number | null
          monthly_expenses?: number | null
          open_house_date?: string | null
          owner_id?: string | null
          pets_allowed?: boolean | null
          plot_depth?: number | null
          plot_surface?: number | null
          postal_code?: string | null
          price?: number
          price_per_sqm?: number | null
          priority_placement?: number
          property_type?: Database["public"]["Enums"]["property_type"]
          region?: string | null
          road_type?: string | null
          short_term_rental?: boolean | null
          slope?: string | null
          sqm?: number
          status?: Database["public"]["Enums"]["listing_status"]
          suitable_commercial_use?: boolean | null
          suitable_holiday?: boolean | null
          suitable_investment?: boolean | null
          suitable_student?: boolean | null
          tags?: string[] | null
          title?: string
          total_floors?: number | null
          updated_at?: string
          views_count?: number
          wc_count?: number | null
          website_url?: string | null
          within_city_plan?: boolean | null
          within_settlement?: boolean | null
          year_built?: number | null
          zone_type?: string | null
        }
        Relationships: []
      }
      message_attachments: {
        Row: {
          created_at: string
          filename: string
          id: string
          message_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          message_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          message_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
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
      open_house_offers: {
        Row: {
          amount: number
          bidder_id: string
          currency: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          listing_id: string
          message: string | null
          revealed_at: string | null
          status: Database["public"]["Enums"]["oh_offer_status"] | null
          submitted_at: string | null
        }
        Insert: {
          amount: number
          bidder_id: string
          currency?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          listing_id: string
          message?: string | null
          revealed_at?: string | null
          status?: Database["public"]["Enums"]["oh_offer_status"] | null
          submitted_at?: string | null
        }
        Update: {
          amount?: number
          bidder_id?: string
          currency?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          listing_id?: string
          message?: string | null
          revealed_at?: string | null
          status?: Database["public"]["Enums"]["oh_offer_status"] | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "open_house_offers_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "open_house_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      open_house_registrations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attended_at: string | null
          created_at: string | null
          id: string
          id_doc_type: Database["public"]["Enums"]["oh_id_doc_type"] | null
          id_doc_url: string | null
          id_verified_at: string | null
          investor_declaration_signed_at: string | null
          listing_id: string
          note: string | null
          proof_amount: number | null
          proof_of_funds_url: string | null
          rejection_reason: string | null
          requester_id: string
          status: Database["public"]["Enums"]["oh_registration_status"] | null
          timeslot_index: number | null
          updated_at: string | null
          waiver_signed_at: string | null
          waiver_url: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attended_at?: string | null
          created_at?: string | null
          id?: string
          id_doc_type?: Database["public"]["Enums"]["oh_id_doc_type"] | null
          id_doc_url?: string | null
          id_verified_at?: string | null
          investor_declaration_signed_at?: string | null
          listing_id: string
          note?: string | null
          proof_amount?: number | null
          proof_of_funds_url?: string | null
          rejection_reason?: string | null
          requester_id: string
          status?: Database["public"]["Enums"]["oh_registration_status"] | null
          timeslot_index?: number | null
          updated_at?: string | null
          waiver_signed_at?: string | null
          waiver_url?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attended_at?: string | null
          created_at?: string | null
          id?: string
          id_doc_type?: Database["public"]["Enums"]["oh_id_doc_type"] | null
          id_doc_url?: string | null
          id_verified_at?: string | null
          investor_declaration_signed_at?: string | null
          listing_id?: string
          note?: string | null
          proof_amount?: number | null
          proof_of_funds_url?: string | null
          rejection_reason?: string | null
          requester_id?: string
          status?: Database["public"]["Enums"]["oh_registration_status"] | null
          timeslot_index?: number | null
          updated_at?: string | null
          waiver_signed_at?: string | null
          waiver_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "open_house_registrations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_house_registrations_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      open_house_settings: {
        Row: {
          allow_sealed_bids: boolean | null
          broker_required: boolean | null
          created_at: string | null
          id: string
          listing_id: string
          max_total_visitors: number | null
          max_visitors_per_slot: number | null
          min_proof_amount: number | null
          offer_deadline: string | null
          require_investor_declaration: boolean | null
          require_proof_of_funds: boolean | null
          timeslots: Json | null
          updated_at: string | null
        }
        Insert: {
          allow_sealed_bids?: boolean | null
          broker_required?: boolean | null
          created_at?: string | null
          id?: string
          listing_id: string
          max_total_visitors?: number | null
          max_visitors_per_slot?: number | null
          min_proof_amount?: number | null
          offer_deadline?: string | null
          require_investor_declaration?: boolean | null
          require_proof_of_funds?: boolean | null
          timeslots?: Json | null
          updated_at?: string | null
        }
        Update: {
          allow_sealed_bids?: boolean | null
          broker_required?: boolean | null
          created_at?: string | null
          id?: string
          listing_id?: string
          max_total_visitors?: number | null
          max_visitors_per_slot?: number | null
          min_proof_amount?: number | null
          offer_deadline?: string | null
          require_investor_declaration?: boolean | null
          require_proof_of_funds?: boolean | null
          timeslots?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "open_house_settings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          created_at: string
          id: string
          listing_ids: string[]
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_ids?: string[]
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_ids?: string[]
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_configs: {
        Row: {
          amount: number
          audience: string
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          metadata: Json | null
          module: string
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          amount?: number
          audience: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          metadata?: Json | null
          module: string
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          audience?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          metadata?: Json | null
          module?: string
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      professional_availability: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          professional_id: string
          start_time: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          professional_id: string
          start_time: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          professional_id?: string
          start_time?: string
        }
        Relationships: []
      }
      professional_services: {
        Row: {
          category: string
          created_at: string
          currency: string
          description: string | null
          estimated_hours: number | null
          id: string
          is_active: boolean
          is_premium: boolean
          pricing_model: string
          professional_id: string
          rate_amount: number | null
          service_key: string
          service_name: string
          updated_at: string
          video_enabled: boolean
        }
        Insert: {
          category: string
          created_at?: string
          currency?: string
          description?: string | null
          estimated_hours?: number | null
          id?: string
          is_active?: boolean
          is_premium?: boolean
          pricing_model?: string
          professional_id: string
          rate_amount?: number | null
          service_key: string
          service_name: string
          updated_at?: string
          video_enabled?: boolean
        }
        Update: {
          category?: string
          created_at?: string
          currency?: string
          description?: string | null
          estimated_hours?: number | null
          id?: string
          is_active?: boolean
          is_premium?: boolean
          pricing_model?: string
          professional_id?: string
          rate_amount?: number | null
          service_key?: string
          service_name?: string
          updated_at?: string
          video_enabled?: boolean
        }
        Relationships: []
      }
      professionals: {
        Row: {
          avatar_url: string | null
          average_deal_size: string | null
          average_portfolio_asset_size: string | null
          bio: string | null
          calendar_notes: string | null
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
          subscription_tier: string | null
          title: string
          updated_at: string
          user_id: string
          verified: boolean
          video_link: string | null
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          average_deal_size?: string | null
          average_portfolio_asset_size?: string | null
          bio?: string | null
          calendar_notes?: string | null
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
          subscription_tier?: string | null
          title: string
          updated_at?: string
          user_id: string
          verified?: boolean
          video_link?: string | null
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          average_deal_size?: string | null
          average_portfolio_asset_size?: string | null
          bio?: string | null
          calendar_notes?: string | null
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
          subscription_tier?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          verified?: boolean
          video_link?: string | null
          website_url?: string | null
        }
        Relationships: []
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
          is_platform_admin: boolean
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
          is_platform_admin?: boolean
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
          is_platform_admin?: boolean
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
      profiles_public: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          first_name: string | null
          last_name: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          first_name?: string | null
          last_name?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          first_name?: string | null
          last_name?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          address: string | null
          city: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          created_at: string
          email_alerts: boolean
          filters: Json
          id: string
          last_alert_listing_ids: string[] | null
          last_alert_sent_at: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_alerts?: boolean
          filters?: Json
          id?: string
          last_alert_listing_ids?: string[] | null
          last_alert_sent_at?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_alerts?: boolean
          filters?: Json
          id?: string
          last_alert_listing_ids?: string[] | null
          last_alert_sent_at?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          created_at: string
          direction: string
          entity_id: string
          entity_type: string
          error_message: string | null
          id: string
          payload: Json | null
          records_affected: number | null
          status: string
        }
        Insert: {
          created_at?: string
          direction: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          records_affected?: number | null
          status?: string
        }
        Update: {
          created_at?: string
          direction?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          payload?: Json | null
          records_affected?: number | null
          status?: string
        }
        Relationships: []
      }
      usage_ai_valuations: {
        Row: {
          created_at: string
          id: string
          listing_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_ai_valuations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_priority_ads: {
        Row: {
          created_at: string
          id: string
          listing_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_priority_ads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_property_reports: {
        Row: {
          created_at: string
          id: string
          listing_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_property_reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      grant_platform_admin: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      grant_platform_admin_by_email: {
        Args: { target_email: string }
        Returns: undefined
      }
      has_platform_admin: { Args: { _user_id?: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
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
      listing_type: "sale" | "rent" | "auction" | "firesale" | "open_house"
      message_status: "sent" | "read"
      oh_id_doc_type: "id_card" | "passport"
      oh_offer_status:
        | "submitted"
        | "revealed"
        | "accepted"
        | "rejected"
        | "withdrawn"
      oh_registration_status:
        | "pending"
        | "approved"
        | "rejected"
        | "attended"
        | "cancelled"
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
        | "real_estate_agent"
        | "insurance_broker"
        | "utility_certification_provider"
        | "esg_sustainability_consultant"
        | "relocation_immigration_consultant"
        | "facility_manager"
        | "short_term_rental_operator"
        | "hotel_hospitality_operator"
        | "marketing_agency"
        | "crm_listing_data_provider"
        | "concrete_contractor"
        | "steel_structure_contractor"
        | "carpenter"
        | "tile_installer"
        | "painter"
        | "building_permit_consultant"
        | "urban_planning_consultant"
        | "legalization_specialist"
        | "energy_certificate_inspector"
        | "building_regulation_consultant"
        | "fire_protection_consultant"
        | "drywall_installer"
        | "waterproofing_specialist"
        | "insulation_contractor"
        | "roofing_contractor"
        | "window_aluminum_installer"
        | "elevator_installer"
        | "smart_home_installer"
      property_type:
        | "apartment"
        | "house"
        | "villa"
        | "land"
        | "commercial"
        | "office"
      user_role:
        | "individual"
        | "agent"
        | "professional"
        | "seller_landlord"
        | "investor"
        | "institutional"
        | "developer"
        | "admin"
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
      listing_type: ["sale", "rent", "auction", "firesale", "open_house"],
      message_status: ["sent", "read"],
      oh_id_doc_type: ["id_card", "passport"],
      oh_offer_status: [
        "submitted",
        "revealed",
        "accepted",
        "rejected",
        "withdrawn",
      ],
      oh_registration_status: [
        "pending",
        "approved",
        "rejected",
        "attended",
        "cancelled",
      ],
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
        "real_estate_agent",
        "insurance_broker",
        "utility_certification_provider",
        "esg_sustainability_consultant",
        "relocation_immigration_consultant",
        "facility_manager",
        "short_term_rental_operator",
        "hotel_hospitality_operator",
        "marketing_agency",
        "crm_listing_data_provider",
        "concrete_contractor",
        "steel_structure_contractor",
        "carpenter",
        "tile_installer",
        "painter",
        "building_permit_consultant",
        "urban_planning_consultant",
        "legalization_specialist",
        "energy_certificate_inspector",
        "building_regulation_consultant",
        "fire_protection_consultant",
        "drywall_installer",
        "waterproofing_specialist",
        "insulation_contractor",
        "roofing_contractor",
        "window_aluminum_installer",
        "elevator_installer",
        "smart_home_installer",
      ],
      property_type: [
        "apartment",
        "house",
        "villa",
        "land",
        "commercial",
        "office",
      ],
      user_role: [
        "individual",
        "agent",
        "professional",
        "seller_landlord",
        "investor",
        "institutional",
        "developer",
        "admin",
      ],
      viewing_status: ["pending", "confirmed", "cancelled", "completed"],
      viewing_type: ["in_person", "video"],
    },
  },
} as const
