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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      account_deletion_jobs: {
        Row: {
          attempt_id: string
          attempts: number
          completed_at: string | null
          last_error: string | null
          leased_until: string
          requested_at: string
          stage: string
          status: string
          user_id: string
        }
        Insert: {
          attempt_id?: string
          attempts?: number
          completed_at?: string | null
          last_error?: string | null
          leased_until?: string
          requested_at?: string
          stage?: string
          status?: string
          user_id: string
        }
        Update: {
          attempt_id?: string
          attempts?: number
          completed_at?: string | null
          last_error?: string | null
          leased_until?: string
          requested_at?: string
          stage?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      addon_purchases: {
        Row: {
          addon_key: string
          audience: string
          checkout_mode: string
          created_at: string
          credits_consumed: number
          credits_granted: number
          credits_refunded: number
          id: string
          last_refund_id: string | null
          livemode: boolean
          metadata: Json
          module: string
          quantity: number
          refund_status: string
          refunded_at: string | null
          runtime_mode: string
          status: string
          stripe_amount_total: number | null
          stripe_charge_id: string | null
          stripe_currency: string | null
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string
          stripe_subscription_id: string | null
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          addon_key: string
          audience: string
          checkout_mode: string
          created_at?: string
          credits_consumed?: number
          credits_granted?: number
          credits_refunded?: number
          id?: string
          last_refund_id?: string | null
          livemode?: boolean
          metadata?: Json
          module: string
          quantity?: number
          refund_status?: string
          refunded_at?: string | null
          runtime_mode?: string
          status?: string
          stripe_amount_total?: number | null
          stripe_charge_id?: string | null
          stripe_currency?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id: string
          stripe_subscription_id?: string | null
          unit: string
          updated_at?: string
          user_id: string
        }
        Update: {
          addon_key?: string
          audience?: string
          checkout_mode?: string
          created_at?: string
          credits_consumed?: number
          credits_granted?: number
          credits_refunded?: number
          id?: string
          last_refund_id?: string | null
          livemode?: boolean
          metadata?: Json
          module?: string
          quantity?: number
          refund_status?: string
          refunded_at?: string | null
          runtime_mode?: string
          status?: string
          stripe_amount_total?: number | null
          stripe_charge_id?: string | null
          stripe_currency?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string
          stripe_subscription_id?: string | null
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addon_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          entity: string
          id: number
          new_data: Json | null
          occurred_at: string
          old_data: Json | null
          reason: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          entity: string
          id?: number
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          reason?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          entity?: string
          id?: number
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          reason?: string | null
          target_id?: string | null
        }
        Relationships: []
      }
      agent_data_input_bans: {
        Row: {
          banned_at: string
          banned_by: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          banned_at?: string
          banned_by?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          banned_at?: string
          banned_by?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agent_data_inputs: {
        Row: {
          agent_side: string
          applied_to_invoice_at: string | null
          buyer_name: string | null
          city: string | null
          closing_date: string
          created_at: string
          discount_applied: boolean
          discount_applied_at: string | null
          discount_invoice_id: string | null
          discount_pct: number
          id: string
          kaek: string | null
          notes: string | null
          postal_code: string | null
          property_address: string
          property_type: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sale_price: number
          seller_name: string | null
          status: string
          stripe_credit_amount_cents: number | null
          stripe_credit_currency: string | null
          stripe_credit_id: string | null
          transaction_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_side: string
          applied_to_invoice_at?: string | null
          buyer_name?: string | null
          city?: string | null
          closing_date: string
          created_at?: string
          discount_applied?: boolean
          discount_applied_at?: string | null
          discount_invoice_id?: string | null
          discount_pct?: number
          id?: string
          kaek?: string | null
          notes?: string | null
          postal_code?: string | null
          property_address: string
          property_type: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sale_price: number
          seller_name?: string | null
          status?: string
          stripe_credit_amount_cents?: number | null
          stripe_credit_currency?: string | null
          stripe_credit_id?: string | null
          transaction_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_side?: string
          applied_to_invoice_at?: string | null
          buyer_name?: string | null
          city?: string | null
          closing_date?: string
          created_at?: string
          discount_applied?: boolean
          discount_applied_at?: string | null
          discount_invoice_id?: string | null
          discount_pct?: number
          id?: string
          kaek?: string | null
          notes?: string | null
          postal_code?: string | null
          property_address?: string
          property_type?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sale_price?: number
          seller_name?: string | null
          status?: string
          stripe_credit_amount_cents?: number | null
          stripe_credit_currency?: string | null
          stripe_credit_id?: string | null
          transaction_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_limits: {
        Row: {
          bucket: string
          description: string | null
          free_monthly: number
          is_pro_only: boolean
          pro_monthly: number
          updated_at: string
        }
        Insert: {
          bucket: string
          description?: string | null
          free_monthly?: number
          is_pro_only?: boolean
          pro_monthly?: number
          updated_at?: string
        }
        Update: {
          bucket?: string
          description?: string | null
          free_monthly?: number
          is_pro_only?: boolean
          pro_monthly?: number
          updated_at?: string
        }
        Relationships: []
      }
      articles: {
        Row: {
          category: string
          content: Json
          created_at: string
          id: string
          meta_description: string
          published: boolean
          read_time: string
          slug: string
          title: string
          topic: string
          updated_at: string
        }
        Insert: {
          category?: string
          content?: Json
          created_at?: string
          id?: string
          meta_description?: string
          published?: boolean
          read_time?: string
          slug: string
          title?: string
          topic: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: Json
          created_at?: string
          id?: string
          meta_description?: string
          published?: boolean
          read_time?: string
          slug?: string
          title?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      billing_customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          livemode: boolean
          metadata: Json
          runtime_mode: string
          stripe_customer_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          livemode?: boolean
          metadata?: Json
          runtime_mode?: string
          stripe_customer_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          livemode?: boolean
          metadata?: Json
          runtime_mode?: string
          stripe_customer_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      billing_subscriptions: {
        Row: {
          audience: string | null
          billing_cycle: string | null
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          livemode: boolean
          metadata: Json
          plan_key: string | null
          runtime_mode: string
          state_observed_at: string
          state_source: string
          status: string
          stripe_customer_id: string
          stripe_event_created_at: string | null
          stripe_event_id: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          stripe_subscription_id: string
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audience?: string | null
          billing_cycle?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          livemode?: boolean
          metadata?: Json
          plan_key?: string | null
          runtime_mode?: string
          state_observed_at?: string
          state_source?: string
          status: string
          stripe_customer_id: string
          stripe_event_created_at?: string | null
          stripe_event_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audience?: string | null
          billing_cycle?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          livemode?: boolean
          metadata?: Json
          plan_key?: string | null
          runtime_mode?: string
          state_observed_at?: string
          state_source?: string
          status?: string
          stripe_customer_id?: string
          stripe_event_created_at?: string | null
          stripe_event_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      consultation_requests: {
        Row: {
          callback_time: string | null
          created_at: string
          id: string
          lead_status: string | null
          meeting_type: string | null
          message: string | null
          notes: string | null
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
          lead_status?: string | null
          meeting_type?: string | null
          message?: string | null
          notes?: string | null
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
          lead_status?: string | null
          meeting_type?: string | null
          message?: string | null
          notes?: string | null
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
      contact_submissions: {
        Row: {
          admin_notes: string | null
          company: string | null
          created_at: string
          document_type: string | null
          email: string
          handled_at: string | null
          handled_by: string | null
          id: string
          listing_title: string | null
          message: string | null
          name: string | null
          share_to_email: string | null
          status: string
          type: string
        }
        Insert: {
          admin_notes?: string | null
          company?: string | null
          created_at?: string
          document_type?: string | null
          email: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          listing_title?: string | null
          message?: string | null
          name?: string | null
          share_to_email?: string | null
          status?: string
          type?: string
        }
        Update: {
          admin_notes?: string | null
          company?: string | null
          created_at?: string
          document_type?: string | null
          email?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          listing_title?: string | null
          message?: string | null
          name?: string | null
          share_to_email?: string | null
          status?: string
          type?: string
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
          reminder_sent_at: string | null
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
          reminder_sent_at?: string | null
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
          reminder_sent_at?: string | null
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
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closed_reason: string | null
          created_at: string
          id: string
          last_message_at: string | null
          listing_id: string | null
          participant_a: string
          participant_b: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closed_reason?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          participant_a: string
          participant_b: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closed_reason?: string | null
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
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
            referencedColumns: ["id"]
          },
        ]
      }
      firesale_interest: {
        Row: {
          admin_note: string | null
          created_at: string
          deal_id: string
          id: string
          investor_id: string
          last_status_changed_at: string
          message: string | null
          proof_amount: number | null
          proof_of_funds_url: string | null
          proof_of_funds_verified_at: string | null
          proof_of_funds_verified_by: string | null
          reservation_expires_at: string | null
          reserved_at: string | null
          reserved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          deal_id: string
          id?: string
          investor_id: string
          last_status_changed_at?: string
          message?: string | null
          proof_amount?: number | null
          proof_of_funds_url?: string | null
          proof_of_funds_verified_at?: string | null
          proof_of_funds_verified_by?: string | null
          reservation_expires_at?: string | null
          reserved_at?: string | null
          reserved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          deal_id?: string
          id?: string
          investor_id?: string
          last_status_changed_at?: string
          message?: string | null
          proof_amount?: number | null
          proof_of_funds_url?: string | null
          proof_of_funds_verified_at?: string | null
          proof_of_funds_verified_by?: string | null
          reservation_expires_at?: string | null
          reserved_at?: string | null
          reserved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firesale_interest_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "firesale_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firesale_interest_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "firesale_interest_proof_of_funds_verified_by_fkey"
            columns: ["proof_of_funds_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "firesale_interest_reserved_by_fkey"
            columns: ["reserved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      firesale_interest_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          deal_id: string
          from_status: string | null
          id: string
          interest_id: string
          metadata: Json
          to_status: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          deal_id: string
          from_status?: string | null
          id?: string
          interest_id: string
          metadata?: Json
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          deal_id?: string
          from_status?: string | null
          id?: string
          interest_id?: string
          metadata?: Json
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firesale_interest_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "firesale_interest_audit_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "firesale_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firesale_interest_audit_log_interest_id_fkey"
            columns: ["interest_id"]
            isOneToOne: false
            referencedRelation: "firesale_interest"
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
          seller_responded_at: string | null
          seller_response: string | null
          seller_response_price: number | null
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
          seller_responded_at?: string | null
          seller_response?: string | null
          seller_response_price?: number | null
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
          seller_responded_at?: string | null
          seller_response?: string | null
          seller_response_price?: number | null
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
          ai_estimate: number | null
          asking_price: number | null
          bedrooms: number | null
          city: string
          condition: string | null
          created_at: string
          id: string
          property_type: Database["public"]["Enums"]["property_type"] | null
          sqm: number | null
          status: string | null
        }
        Insert: {
          address: string
          ai_estimate?: number | null
          asking_price?: number | null
          bedrooms?: number | null
          city: string
          condition?: string | null
          created_at: string
          id: string
          property_type?: Database["public"]["Enums"]["property_type"] | null
          sqm?: number | null
          status?: string | null
        }
        Update: {
          address?: string
          ai_estimate?: number | null
          asking_price?: number | null
          bedrooms?: number | null
          city?: string
          condition?: string | null
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
          activated_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          livemode: boolean
          runtime_mode: string
          started_at: string
          status: string
          stripe_customer_id: string | null
          stripe_session_id: string | null
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          livemode?: boolean
          runtime_mode?: string
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_session_id?: string | null
          tier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          livemode?: boolean
          runtime_mode?: string
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_session_id?: string | null
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
          rejection_reason: string | null
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
          rejection_reason?: string | null
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
          rejection_reason?: string | null
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
          origin_context_key: string
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
          origin_context_key?: string
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
          origin_context_key?: string
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
            foreignKeyName: "leads_listing_id_fkey1"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_listing_id_fkey1"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_listing_id_fkey1"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_listing_id_fkey1"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_professional_id_fkey1"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_project_id_fkey1"
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
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_promotion_allocations: {
        Row: {
          addon_purchase_id: string | null
          billing_subscription_id: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          listing_id: string | null
          listing_snapshot: Json
          owner_id: string | null
          owner_snapshot: Json
          plan_cycle_start: string | null
          promotion_type: string
          request_key: string
          revoke_reason: string | null
          revoked_at: string | null
          source_type: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          addon_purchase_id?: string | null
          billing_subscription_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          listing_id?: string | null
          listing_snapshot?: Json
          owner_id?: string | null
          owner_snapshot?: Json
          plan_cycle_start?: string | null
          promotion_type: string
          request_key: string
          revoke_reason?: string | null
          revoked_at?: string | null
          source_type: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          addon_purchase_id?: string | null
          billing_subscription_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          listing_id?: string | null
          listing_snapshot?: Json
          owner_id?: string | null
          owner_snapshot?: Json
          plan_cycle_start?: string | null
          promotion_type?: string
          request_key?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          source_type?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_promotion_allocations_addon_purchase_id_fkey"
            columns: ["addon_purchase_id"]
            isOneToOne: false
            referencedRelation: "addon_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_promotion_allocations_billing_subscription_id_fkey"
            columns: ["billing_subscription_id"]
            isOneToOne: false
            referencedRelation: "billing_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_promotion_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "listing_promotion_allocations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_promotion_allocations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_promotion_allocations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_promotion_allocations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_promotion_allocations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
          status: Database["public"]["Enums"]["listing_report_status"]
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          reporter_id?: string | null
          status?: Database["public"]["Enums"]["listing_report_status"]
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          reporter_id?: string | null
          status?: Database["public"]["Enums"]["listing_report_status"]
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
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_view_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_view_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_view_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
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
          featured_until: string | null
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
          location_search_text: string | null
          longitude: number | null
          min_rental_months: number | null
          monthly_expenses: number | null
          noise_score: number | null
          open_house_date: string | null
          open_house_transaction_type: string | null
          organization_id: string | null
          owner_id: string | null
          pets_allowed: boolean | null
          plot_depth: number | null
          plot_surface: number | null
          postal_code: string | null
          price: number
          price_per_sqm: number | null
          priority_placement: number
          priority_until: string | null
          project_id: string | null
          property_type: Database["public"]["Enums"]["property_type"]
          region: string | null
          road_type: string | null
          safety_score: number | null
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
          walkability_score: number | null
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
          featured_until?: string | null
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
          location_search_text?: string | null
          longitude?: number | null
          min_rental_months?: number | null
          monthly_expenses?: number | null
          noise_score?: number | null
          open_house_date?: string | null
          open_house_transaction_type?: string | null
          organization_id?: string | null
          owner_id?: string | null
          pets_allowed?: boolean | null
          plot_depth?: number | null
          plot_surface?: number | null
          postal_code?: string | null
          price: number
          price_per_sqm?: number | null
          priority_placement?: number
          priority_until?: string | null
          project_id?: string | null
          property_type: Database["public"]["Enums"]["property_type"]
          region?: string | null
          road_type?: string | null
          safety_score?: number | null
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
          walkability_score?: number | null
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
          featured_until?: string | null
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
          location_search_text?: string | null
          longitude?: number | null
          min_rental_months?: number | null
          monthly_expenses?: number | null
          noise_score?: number | null
          open_house_date?: string | null
          open_house_transaction_type?: string | null
          organization_id?: string | null
          owner_id?: string | null
          pets_allowed?: boolean | null
          plot_depth?: number | null
          plot_surface?: number | null
          postal_code?: string | null
          price?: number
          price_per_sqm?: number | null
          priority_placement?: number
          priority_until?: string | null
          project_id?: string | null
          property_type?: Database["public"]["Enums"]["property_type"]
          region?: string | null
          road_type?: string | null
          safety_score?: number | null
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
          walkability_score?: number | null
          wc_count?: number | null
          website_url?: string | null
          within_city_plan?: boolean | null
          within_settlement?: boolean | null
          year_built?: number | null
          zone_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_leads: {
        Row: {
          created_at: string
          email: string
          follow_up_at: string | null
          followup_step: number
          full_name: string
          id: string
          investment_budget: number
          investment_timeline: string
          listing_id: string | null
          message: string | null
          nationality: string
          notes: string | null
          owner_id: string | null
          phone: string
          preferred_location: string
          professional_id: string | null
          project_id: string | null
          property_type: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          follow_up_at?: string | null
          followup_step?: number
          full_name: string
          id?: string
          investment_budget: number
          investment_timeline?: string
          listing_id?: string | null
          message?: string | null
          nationality: string
          notes?: string | null
          owner_id?: string | null
          phone: string
          preferred_location?: string
          professional_id?: string | null
          project_id?: string | null
          property_type?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          follow_up_at?: string | null
          followup_step?: number
          full_name?: string
          id?: string
          investment_budget?: number
          investment_timeline?: string
          listing_id?: string | null
          message?: string | null
          nationality?: string
          notes?: string | null
          owner_id?: string | null
          phone?: string
          preferred_location?: string
          professional_id?: string | null
          project_id?: string | null
          property_type?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
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
          client_delivery_id: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          receiver_id: string | null
          sender_id: string
          status: Database["public"]["Enums"]["message_status"]
        }
        Insert: {
          client_delivery_id?: string | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          receiver_id?: string | null
          sender_id: string
          status?: Database["public"]["Enums"]["message_status"]
        }
        Update: {
          client_delivery_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          receiver_id?: string | null
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
      new_building_leads: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          investment_budget: number
          new_building_id: string
          notes: string
          phone: string | null
          updated_at: string
          user_id: string
          utm_source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id?: string
          investment_budget?: number
          new_building_id: string
          notes?: string
          phone?: string | null
          updated_at?: string
          user_id: string
          utm_source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          investment_budget?: number
          new_building_id?: string
          notes?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "new_building_leads_new_building_id_fkey"
            columns: ["new_building_id"]
            isOneToOne: false
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "new_building_leads_new_building_id_fkey"
            columns: ["new_building_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "new_building_leads_new_building_id_fkey"
            columns: ["new_building_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "new_building_leads_new_building_id_fkey"
            columns: ["new_building_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
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
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_house_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_house_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_house_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
            referencedColumns: ["id"]
          },
        ]
      }
      open_house_registrations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attended_at: string | null
          budget_range: string | null
          contact_email: string | null
          contact_name: string | null
          contact_permission_at: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          id_doc_type: Database["public"]["Enums"]["oh_id_doc_type"] | null
          id_doc_url: string | null
          id_verification_consent_at: string | null
          id_verified_at: string | null
          investor_declaration_signed_at: string | null
          listing_id: string
          mortgage_status: string | null
          note: string | null
          pof_rejection_reason: string | null
          pof_verified_status: string | null
          privacy_acknowledged_at: string | null
          proof_amount: number | null
          proof_of_funds_url: string | null
          rejection_reason: string | null
          requester_id: string
          screening_doc_url: string | null
          screening_score: number | null
          status: Database["public"]["Enums"]["oh_registration_status"] | null
          timeslot_index: number | null
          updated_at: string | null
          visit_purpose: string | null
          waiver_signed_at: string | null
          waiver_url: string | null
          working_with_agent: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attended_at?: string | null
          budget_range?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_permission_at?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          id_doc_type?: Database["public"]["Enums"]["oh_id_doc_type"] | null
          id_doc_url?: string | null
          id_verification_consent_at?: string | null
          id_verified_at?: string | null
          investor_declaration_signed_at?: string | null
          listing_id: string
          mortgage_status?: string | null
          note?: string | null
          pof_rejection_reason?: string | null
          pof_verified_status?: string | null
          privacy_acknowledged_at?: string | null
          proof_amount?: number | null
          proof_of_funds_url?: string | null
          rejection_reason?: string | null
          requester_id: string
          screening_doc_url?: string | null
          screening_score?: number | null
          status?: Database["public"]["Enums"]["oh_registration_status"] | null
          timeslot_index?: number | null
          updated_at?: string | null
          visit_purpose?: string | null
          waiver_signed_at?: string | null
          waiver_url?: string | null
          working_with_agent?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attended_at?: string | null
          budget_range?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_permission_at?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          id_doc_type?: Database["public"]["Enums"]["oh_id_doc_type"] | null
          id_doc_url?: string | null
          id_verification_consent_at?: string | null
          id_verified_at?: string | null
          investor_declaration_signed_at?: string | null
          listing_id?: string
          mortgage_status?: string | null
          note?: string | null
          pof_rejection_reason?: string | null
          pof_verified_status?: string | null
          privacy_acknowledged_at?: string | null
          proof_amount?: number | null
          proof_of_funds_url?: string | null
          rejection_reason?: string | null
          requester_id?: string
          screening_doc_url?: string | null
          screening_score?: number | null
          status?: Database["public"]["Enums"]["oh_registration_status"] | null
          timeslot_index?: number | null
          updated_at?: string | null
          visit_purpose?: string | null
          waiver_signed_at?: string | null
          waiver_url?: string | null
          working_with_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "open_house_registrations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_house_registrations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_house_registrations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_house_registrations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
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
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_house_settings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_house_settings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_house_settings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "public_listing_catalogue"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_audit_ledger: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          organization_id: string | null
          permission: string | null
          request_id: string | null
          subject_id: string | null
          subject_table: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          permission?: string | null
          request_id?: string | null
          subject_id?: string | null
          subject_table?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          permission?: string | null
          request_id?: string | null
          subject_id?: string | null
          subject_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_audit_ledger_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "organization_audit_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_domains: {
        Row: {
          created_at: string
          created_by: string | null
          domain: string
          id: string
          organization_id: string
          sso_required: boolean
          updated_at: string
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          domain: string
          id?: string
          organization_id: string
          sso_required?: boolean
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          domain?: string
          id?: string
          organization_id?: string
          sso_required?: boolean
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_domains_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "organization_domains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      organization_sso_providers: {
        Row: {
          attribute_mapping: Json
          configured_by: string | null
          created_at: string
          domain_id: string | null
          entity_id: string | null
          id: string
          metadata_url: string | null
          organization_id: string
          provider_type: string
          status: string
          supabase_provider_id: string | null
          updated_at: string
        }
        Insert: {
          attribute_mapping?: Json
          configured_by?: string | null
          created_at?: string
          domain_id?: string | null
          entity_id?: string | null
          id?: string
          metadata_url?: string | null
          organization_id: string
          provider_type?: string
          status?: string
          supabase_provider_id?: string | null
          updated_at?: string
        }
        Update: {
          attribute_mapping?: Json
          configured_by?: string | null
          created_at?: string
          domain_id?: string | null
          entity_id?: string | null
          id?: string
          metadata_url?: string | null
          organization_id?: string
          provider_type?: string
          status?: string
          supabase_provider_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_sso_providers_configured_by_fkey"
            columns: ["configured_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "organization_sso_providers_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "organization_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_sso_providers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          plan: string
          procurement_status: string
          security_review_status: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          plan?: string
          procurement_status?: string
          security_review_status?: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          plan?: string
          procurement_status?: string
          security_review_status?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
      privacy_audit_log: {
        Row: {
          actor_id: string | null
          event_type: string
          id: number
          metadata: Json
          occurred_at: string
          request_id: string | null
          target_user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          event_type: string
          id?: number
          metadata?: Json
          occurred_at?: string
          request_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          event_type?: string
          id?: number
          metadata?: Json
          occurred_at?: string
          request_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "privacy_audit_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "privacy_export_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_export_requests: {
        Row: {
          completed_at: string | null
          error_code: string | null
          expires_at: string | null
          export_storage_path: string | null
          id: string
          metadata: Json
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          error_code?: string | null
          expires_at?: string | null
          export_storage_path?: string | null
          id?: string
          metadata?: Json
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          error_code?: string | null
          expires_at?: string | null
          export_storage_path?: string | null
          id?: string
          metadata?: Json
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      private_owner_ad_alerts: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      pro_product_ids: {
        Row: {
          created_at: string
          product_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
        }
        Relationships: []
      }
      procurement_evidence: {
        Row: {
          created_at: string
          evidence_type: string
          evidence_url: string | null
          expires_at: string | null
          id: string
          notes: string | null
          organization_id: string | null
          owner_user_id: string | null
          reviewed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_type: string
          evidence_url?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          owner_user_id?: string | null
          reviewed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_type?: string
          evidence_url?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          owner_user_id?: string | null
          reviewed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_evidence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_evidence_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
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
      professional_review_responses: {
        Row: {
          body: string
          created_at: string
          professional_id: string
          responder_id: string
          review_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          professional_id: string
          responder_id: string
          review_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          professional_id?: string
          responder_id?: string
          review_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_review_responses_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_review_responses_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "professional_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_reviews: {
        Row: {
          body: string | null
          created_at: string
          id: string
          professional_id: string
          property_city: string | null
          rating: number
          recommended: boolean
          reviewer_id: string
          service_type: string | null
          title: string | null
          transaction_year: number | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          professional_id: string
          property_city?: string | null
          rating: number
          recommended?: boolean
          reviewer_id: string
          service_type?: string | null
          title?: string | null
          transaction_year?: number | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          professional_id?: string
          property_city?: string | null
          rating?: number
          recommended?: boolean
          reviewer_id?: string
          service_type?: string | null
          title?: string | null
          transaction_year?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_reviews_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
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
          archived_at: string | null
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
          notes: string | null
          projects_count: number | null
          rating: number | null
          rejection_reason: string | null
          reviews_count: number | null
          specialties: string[] | null
          subscription_tier: string | null
          title: string
          updated_at: string
          user_id: string
          verified: boolean
          verified_at: string | null
          video_link: string | null
          website_url: string | null
        }
        Insert: {
          archived_at?: string | null
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
          notes?: string | null
          projects_count?: number | null
          rating?: number | null
          rejection_reason?: string | null
          reviews_count?: number | null
          specialties?: string[] | null
          subscription_tier?: string | null
          title: string
          updated_at?: string
          user_id: string
          verified?: boolean
          verified_at?: string | null
          video_link?: string | null
          website_url?: string | null
        }
        Update: {
          archived_at?: string | null
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
          notes?: string | null
          projects_count?: number | null
          rating?: number | null
          rejection_reason?: string | null
          reviews_count?: number | null
          specialties?: string[] | null
          subscription_tier?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          verified?: boolean
          verified_at?: string | null
          video_link?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_moderated_at: string | null
          account_moderated_by: string | null
          account_moderation_reason: string | null
          account_status: string
          avatar_url: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string
          display_name: string | null
          first_name: string | null
          force_pro_access: boolean | null
          id: string
          investor_mode: boolean
          is_platform_admin: boolean
          last_name: string | null
          participant_type: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          role_switch_in_progress_at: string | null
          subscription_product_id: string | null
          updated_at: string
          user_id: string
          verified: boolean
          video_link: string | null
          website_url: string | null
        }
        Insert: {
          account_moderated_at?: string | null
          account_moderated_by?: string | null
          account_moderation_reason?: string | null
          account_status?: string
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          force_pro_access?: boolean | null
          id?: string
          investor_mode?: boolean
          is_platform_admin?: boolean
          last_name?: string | null
          participant_type?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          role_switch_in_progress_at?: string | null
          subscription_product_id?: string | null
          updated_at?: string
          user_id: string
          verified?: boolean
          video_link?: string | null
          website_url?: string | null
        }
        Update: {
          account_moderated_at?: string | null
          account_moderated_by?: string | null
          account_moderation_reason?: string | null
          account_status?: string
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          force_pro_access?: boolean | null
          id?: string
          investor_mode?: boolean
          is_platform_admin?: boolean
          last_name?: string | null
          participant_type?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          role_switch_in_progress_at?: string | null
          subscription_product_id?: string | null
          updated_at?: string
          user_id?: string
          verified?: boolean
          video_link?: string | null
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
          owner_participant_type: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          first_name?: string | null
          last_name?: string | null
          owner_participant_type?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          first_name?: string | null
          last_name?: string | null
          owner_participant_type?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          user_id?: string
        }
        Relationships: []
      }
      project_leads: {
        Row: {
          created_at: string
          email: string | null
          id: string
          metadata: Json | null
          name: string
          notes: string | null
          phone: string | null
          project_id: string
          source: string | null
          status: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json | null
          name: string
          notes?: string | null
          phone?: string | null
          project_id: string
          source?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          notes?: string | null
          phone?: string | null
          project_id?: string
          source?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_leads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_media: {
        Row: {
          created_at: string
          id: string
          media_type: string
          project_id: string
          sort_order: number
          title: string | null
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          media_type: string
          project_id: string
          sort_order?: number
          title?: string | null
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          media_type?: string
          project_id?: string
          sort_order?: number
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_media_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_units: {
        Row: {
          availability_status: string
          balcony_sqm: number | null
          bathrooms: number | null
          bedrooms: number | null
          city_view: boolean | null
          cooling_system: string | null
          created_at: string
          energy_class: string | null
          floor: number | null
          heating_system: string | null
          id: string
          internal_sqm: number | null
          kitchen_type: string | null
          listing_id: string | null
          living_rooms: number | null
          mountain_view: boolean | null
          parking_price: number | null
          parking_sqm: number | null
          price: number | null
          price_per_sqm: number | null
          project_id: string
          sea_view: boolean | null
          storage_price: number | null
          storage_sqm: number | null
          unit_id: string | null
          unit_number: string | null
          updated_at: string
          vat_included: boolean | null
        }
        Insert: {
          availability_status?: string
          balcony_sqm?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city_view?: boolean | null
          cooling_system?: string | null
          created_at?: string
          energy_class?: string | null
          floor?: number | null
          heating_system?: string | null
          id?: string
          internal_sqm?: number | null
          kitchen_type?: string | null
          listing_id?: string | null
          living_rooms?: number | null
          mountain_view?: boolean | null
          parking_price?: number | null
          parking_sqm?: number | null
          price?: number | null
          price_per_sqm?: number | null
          project_id: string
          sea_view?: boolean | null
          storage_price?: number | null
          storage_sqm?: number | null
          unit_id?: string | null
          unit_number?: string | null
          updated_at?: string
          vat_included?: boolean | null
        }
        Update: {
          availability_status?: string
          balcony_sqm?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city_view?: boolean | null
          cooling_system?: string | null
          created_at?: string
          energy_class?: string | null
          floor?: number | null
          heating_system?: string | null
          id?: string
          internal_sqm?: number | null
          kitchen_type?: string | null
          listing_id?: string | null
          living_rooms?: number | null
          mountain_view?: boolean | null
          parking_price?: number | null
          parking_sqm?: number | null
          price?: number | null
          price_per_sqm?: number | null
          project_id?: string
          sea_view?: boolean | null
          storage_price?: number | null
          storage_sqm?: number | null
          unit_id?: string | null
          unit_number?: string | null
          updated_at?: string
          vat_included?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "project_units_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_units_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_units_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_units_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_units_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_views: {
        Row: {
          id: string
          project_id: string
          viewed_at: string
          viewer_id: string | null
        }
        Insert: {
          id?: string
          project_id: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          viewed_at?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_views_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          architect_group: string | null
          archived_at: string | null
          area_description: string | null
          building_permit_number: string | null
          city: string | null
          construction_company: string | null
          construction_start_date: string | null
          cover_image_url: string | null
          created_at: string
          delivery_date: string | null
          description: string | null
          developer_company: string | null
          id: string
          latitude: number | null
          longitude: number | null
          municipality: string | null
          name: string
          organization_id: string | null
          owner_id: string
          permit_approval_date: string | null
          status: string
          structural_completion_date: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          architect_group?: string | null
          archived_at?: string | null
          area_description?: string | null
          building_permit_number?: string | null
          city?: string | null
          construction_company?: string | null
          construction_start_date?: string | null
          cover_image_url?: string | null
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          developer_company?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          municipality?: string | null
          name: string
          organization_id?: string | null
          owner_id: string
          permit_approval_date?: string | null
          status?: string
          structural_completion_date?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          architect_group?: string | null
          archived_at?: string | null
          area_description?: string | null
          building_permit_number?: string | null
          city?: string | null
          construction_company?: string | null
          construction_start_date?: string | null
          cover_image_url?: string | null
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          developer_company?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          municipality?: string | null
          name?: string
          organization_id?: string | null
          owner_id?: string
          permit_approval_date?: string | null
          status?: string
          structural_completion_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          after_image: string
          bedrooms: number | null
          before_image: string
          construction_year: string
          created_at: string
          date_added: string
          description: string
          floor: string
          floor_plan: string
          id: string
          images: string[]
          location: string
          market_report: string
          poi: string[]
          poi_cache: Json | null
          price: number | null
          project_type: string
          size: number | null
          sort_order: number
          status: string
          tags: string[]
          title: string
          updated_at: string
          yield: string
        }
        Insert: {
          after_image?: string
          bedrooms?: number | null
          before_image?: string
          construction_year?: string
          created_at?: string
          date_added?: string
          description?: string
          floor?: string
          floor_plan?: string
          id?: string
          images?: string[]
          location?: string
          market_report?: string
          poi?: string[]
          poi_cache?: Json | null
          price?: number | null
          project_type?: string
          size?: number | null
          sort_order?: number
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          yield?: string
        }
        Update: {
          after_image?: string
          bedrooms?: number | null
          before_image?: string
          construction_year?: string
          created_at?: string
          date_added?: string
          description?: string
          floor?: string
          floor_plan?: string
          id?: string
          images?: string[]
          location?: string
          market_report?: string
          poi?: string[]
          poi_cache?: Json | null
          price?: number | null
          project_type?: string
          size?: number | null
          sort_order?: number
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          yield?: string
        }
        Relationships: []
      }
      property_report_cache: {
        Row: {
          ai: Json | null
          created_at: string
          expires_at: string
          features: Json
          file_name: string
          generated_at: string
          html: string
          id: string
          lang: string
          listing_id: string
          report_type: string
          source: string
          updated_at: string
        }
        Insert: {
          ai?: Json | null
          created_at?: string
          expires_at?: string
          features?: Json
          file_name: string
          generated_at?: string
          html: string
          id?: string
          lang?: string
          listing_id: string
          report_type?: string
          source?: string
          updated_at?: string
        }
        Update: {
          ai?: Json | null
          created_at?: string
          expires_at?: string
          features?: Json
          file_name?: string
          generated_at?: string
          html?: string
          id?: string
          lang?: string
          listing_id?: string
          report_type?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_report_cache_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_report_cache_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_report_cache_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_report_cache_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_counters: {
        Row: {
          bucket: string
          count: number
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      role_switch_history: {
        Row: {
          from_plan_key: string | null
          from_type: string
          had_active_sub: boolean
          id: string
          sub_cancelled: boolean
          switch_kind: string | null
          switched_at: string
          to_plan_key: string | null
          to_type: string | null
          user_id: string
        }
        Insert: {
          from_plan_key?: string | null
          from_type: string
          had_active_sub?: boolean
          id?: string
          sub_cancelled?: boolean
          switch_kind?: string | null
          switched_at?: string
          to_plan_key?: string | null
          to_type?: string | null
          user_id: string
        }
        Update: {
          from_plan_key?: string | null
          from_type?: string
          had_active_sub?: boolean
          id?: string
          sub_cancelled?: boolean
          switch_kind?: string | null
          switched_at?: string
          to_plan_key?: string | null
          to_type?: string | null
          user_id?: string
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
      stripe_webhook_events: {
        Row: {
          api_version: string | null
          created_at: string
          error: string | null
          event_id: string
          event_type: string
          livemode: boolean
          metadata: Json
          processed_at: string | null
          runtime_mode: string
          status: string
          updated_at: string
        }
        Insert: {
          api_version?: string | null
          created_at?: string
          error?: string | null
          event_id: string
          event_type: string
          livemode?: boolean
          metadata?: Json
          processed_at?: string | null
          runtime_mode?: string
          status?: string
          updated_at?: string
        }
        Update: {
          api_version?: string | null
          created_at?: string
          error?: string | null
          event_id?: string
          event_type?: string
          livemode?: boolean
          metadata?: Json
          processed_at?: string | null
          runtime_mode?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscription_trial_claims: {
        Row: {
          claimed_at: string
          id: string
          livemode: boolean
          metadata: Json
          plan_key: string
          pricing_audience: string
          runtime_mode: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          claimed_at?: string
          id?: string
          livemode?: boolean
          metadata?: Json
          plan_key: string
          pricing_audience: string
          runtime_mode?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          claimed_at?: string
          id?: string
          livemode?: boolean
          metadata?: Json
          plan_key?: string
          pricing_audience?: string
          runtime_mode?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_days?: number
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
      usage_ai_calls: {
        Row: {
          bucket: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
          user_id?: string
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
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ai_valuations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ai_valuations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ai_valuations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
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
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_priority_ads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_priority_ads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_priority_ads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
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
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_property_reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_property_reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_property_reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
            referencedColumns: ["id"]
          },
        ]
      }
      user_auth_activity_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          route: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          route?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          route?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_search_events: {
        Row: {
          created_at: string
          filters: Json
          id: string
          metadata: Json
          normalized_query: string
          query_text: string
          result_count: number | null
          route: string | null
          surface: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          metadata?: Json
          normalized_query: string
          query_text: string
          result_count?: number | null
          route?: string | null
          surface: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          metadata?: Json
          normalized_query?: string
          query_text?: string
          result_count?: number | null
          route?: string | null
          surface?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_search_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
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
            referencedRelation: "listing_management_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viewings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listing_reference_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viewings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viewings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_listing_catalogue"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      listing_management_catalogue: {
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
          city: string | null
          commercial_subtype: string | null
          construction_status: string | null
          cover_image_url: string | null
          coverage_ratio: number | null
          created_at: string | null
          deposit_months: number | null
          description: string | null
          distance_from_city: number | null
          distance_from_sea: number | null
          energy_class: string | null
          enfia_zone: string | null
          facade_length: number | null
          featured_until: string | null
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
          id: string | null
          is_buildable: boolean | null
          is_corner: boolean | null
          is_featured: boolean | null
          is_neoclassical: boolean | null
          is_off_market: boolean | null
          is_penthouse: boolean | null
          is_pre_sale: boolean | null
          is_preserved: boolean | null
          kitchens: number | null
          land_use: string | null
          latitude: number | null
          levels: number | null
          listing_images: Json | null
          listing_type: Database["public"]["Enums"]["listing_type"] | null
          living_rooms: number | null
          location_search_text: string | null
          longitude: number | null
          min_rental_months: number | null
          monthly_expenses: number | null
          noise_score: number | null
          open_house_date: string | null
          open_house_settings: Json | null
          open_house_transaction_type: string | null
          organization_id: string | null
          owner_id: string | null
          pets_allowed: boolean | null
          plot_depth: number | null
          plot_surface: number | null
          postal_code: string | null
          price: number | null
          price_per_sqm: number | null
          priority_placement: number | null
          priority_until: string | null
          project_id: string | null
          property_type: Database["public"]["Enums"]["property_type"] | null
          region: string | null
          road_type: string | null
          safety_score: number | null
          short_term_rental: boolean | null
          slope: string | null
          sqm: number | null
          status: Database["public"]["Enums"]["listing_status"] | null
          suitable_commercial_use: boolean | null
          suitable_holiday: boolean | null
          suitable_investment: boolean | null
          suitable_student: boolean | null
          tags: string[] | null
          title: string | null
          total_floors: number | null
          updated_at: string | null
          views_count: number | null
          walkability_score: number | null
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
          city?: string | null
          commercial_subtype?: string | null
          construction_status?: string | null
          cover_image_url?: string | null
          coverage_ratio?: number | null
          created_at?: string | null
          deposit_months?: number | null
          description?: string | null
          distance_from_city?: number | null
          distance_from_sea?: number | null
          energy_class?: string | null
          enfia_zone?: string | null
          facade_length?: number | null
          featured_until?: string | null
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
          id?: string | null
          is_buildable?: boolean | null
          is_corner?: boolean | null
          is_featured?: boolean | null
          is_neoclassical?: boolean | null
          is_off_market?: boolean | null
          is_penthouse?: boolean | null
          is_pre_sale?: boolean | null
          is_preserved?: boolean | null
          kitchens?: number | null
          land_use?: string | null
          latitude?: number | null
          levels?: number | null
          listing_images?: never
          listing_type?: Database["public"]["Enums"]["listing_type"] | null
          living_rooms?: number | null
          location_search_text?: string | null
          longitude?: number | null
          min_rental_months?: number | null
          monthly_expenses?: number | null
          noise_score?: number | null
          open_house_date?: string | null
          open_house_settings?: never
          open_house_transaction_type?: string | null
          organization_id?: string | null
          owner_id?: string | null
          pets_allowed?: boolean | null
          plot_depth?: number | null
          plot_surface?: number | null
          postal_code?: string | null
          price?: number | null
          price_per_sqm?: number | null
          priority_placement?: number | null
          priority_until?: string | null
          project_id?: string | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          region?: string | null
          road_type?: string | null
          safety_score?: number | null
          short_term_rental?: boolean | null
          slope?: string | null
          sqm?: number | null
          status?: Database["public"]["Enums"]["listing_status"] | null
          suitable_commercial_use?: boolean | null
          suitable_holiday?: boolean | null
          suitable_investment?: boolean | null
          suitable_student?: boolean | null
          tags?: string[] | null
          title?: string | null
          total_floors?: number | null
          updated_at?: string | null
          views_count?: number | null
          walkability_score?: number | null
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
          city?: string | null
          commercial_subtype?: string | null
          construction_status?: string | null
          cover_image_url?: string | null
          coverage_ratio?: number | null
          created_at?: string | null
          deposit_months?: number | null
          description?: string | null
          distance_from_city?: number | null
          distance_from_sea?: number | null
          energy_class?: string | null
          enfia_zone?: string | null
          facade_length?: number | null
          featured_until?: string | null
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
          id?: string | null
          is_buildable?: boolean | null
          is_corner?: boolean | null
          is_featured?: boolean | null
          is_neoclassical?: boolean | null
          is_off_market?: boolean | null
          is_penthouse?: boolean | null
          is_pre_sale?: boolean | null
          is_preserved?: boolean | null
          kitchens?: number | null
          land_use?: string | null
          latitude?: number | null
          levels?: number | null
          listing_images?: never
          listing_type?: Database["public"]["Enums"]["listing_type"] | null
          living_rooms?: number | null
          location_search_text?: string | null
          longitude?: number | null
          min_rental_months?: number | null
          monthly_expenses?: number | null
          noise_score?: number | null
          open_house_date?: string | null
          open_house_settings?: never
          open_house_transaction_type?: string | null
          organization_id?: string | null
          owner_id?: string | null
          pets_allowed?: boolean | null
          plot_depth?: number | null
          plot_surface?: number | null
          postal_code?: string | null
          price?: number | null
          price_per_sqm?: number | null
          priority_placement?: number | null
          priority_until?: string | null
          project_id?: string | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          region?: string | null
          road_type?: string | null
          safety_score?: number | null
          short_term_rental?: boolean | null
          slope?: string | null
          sqm?: number | null
          status?: Database["public"]["Enums"]["listing_status"] | null
          suitable_commercial_use?: boolean | null
          suitable_holiday?: boolean | null
          suitable_investment?: boolean | null
          suitable_student?: boolean | null
          tags?: string[] | null
          title?: string | null
          total_floors?: number | null
          updated_at?: string | null
          views_count?: number | null
          walkability_score?: number | null
          wc_count?: number | null
          website_url?: string | null
          within_city_plan?: boolean | null
          within_settlement?: boolean | null
          year_built?: number | null
          zone_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_reference_catalogue: {
        Row: {
          address: string | null
          city: string | null
          cover_image_url: string | null
          id: string | null
          is_pre_sale: boolean | null
          listing_type: Database["public"]["Enums"]["listing_type"] | null
          organization_id: string | null
          owner_id: string | null
          price: number | null
          project_id: string | null
          sqm: number | null
          status: Database["public"]["Enums"]["listing_status"] | null
          title: string | null
          views_count: number | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          cover_image_url?: string | null
          id?: string | null
          is_pre_sale?: boolean | null
          listing_type?: Database["public"]["Enums"]["listing_type"] | null
          organization_id?: string | null
          owner_id?: string | null
          price?: number | null
          project_id?: string | null
          sqm?: number | null
          status?: Database["public"]["Enums"]["listing_status"] | null
          title?: string | null
          views_count?: number | null
        }
        Update: {
          address?: string | null
          city?: string | null
          cover_image_url?: string | null
          id?: string | null
          is_pre_sale?: boolean | null
          listing_type?: Database["public"]["Enums"]["listing_type"] | null
          organization_id?: string | null
          owner_id?: string | null
          price?: number | null
          project_id?: string | null
          sqm?: number | null
          status?: Database["public"]["Enums"]["listing_status"] | null
          title?: string | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      public_listing_catalogue: {
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
          city: string | null
          commercial_subtype: string | null
          construction_status: string | null
          cover_image_url: string | null
          coverage_ratio: number | null
          created_at: string | null
          deposit_months: number | null
          description: string | null
          distance_from_city: number | null
          distance_from_sea: number | null
          energy_class: string | null
          facade_length: number | null
          featured_until: string | null
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
          id: string | null
          is_buildable: boolean | null
          is_corner: boolean | null
          is_featured: boolean | null
          is_neoclassical: boolean | null
          is_off_market: boolean | null
          is_penthouse: boolean | null
          is_pre_sale: boolean | null
          is_preserved: boolean | null
          kitchens: number | null
          land_use: string | null
          latitude: number | null
          levels: number | null
          listing_images: Json | null
          listing_images_detail: Json | null
          listing_type: Database["public"]["Enums"]["listing_type"] | null
          living_rooms: number | null
          location_search_text: string | null
          longitude: number | null
          min_rental_months: number | null
          monthly_expenses: number | null
          noise_score: number | null
          open_house_date: string | null
          open_house_transaction_type: string | null
          owner_id: string | null
          pets_allowed: boolean | null
          plot_depth: number | null
          plot_surface: number | null
          postal_code: string | null
          price: number | null
          price_per_sqm: number | null
          priority_placement: number | null
          priority_until: string | null
          project: Json | null
          project_detail: Json | null
          project_id: string | null
          property_type: Database["public"]["Enums"]["property_type"] | null
          region: string | null
          road_type: string | null
          safety_score: number | null
          short_term_rental: boolean | null
          slope: string | null
          sqm: number | null
          status: Database["public"]["Enums"]["listing_status"] | null
          suitable_commercial_use: boolean | null
          suitable_holiday: boolean | null
          suitable_investment: boolean | null
          suitable_student: boolean | null
          tags: string[] | null
          title: string | null
          total_floors: number | null
          updated_at: string | null
          views_count: number | null
          walkability_score: number | null
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
          city?: string | null
          commercial_subtype?: string | null
          construction_status?: string | null
          cover_image_url?: string | null
          coverage_ratio?: number | null
          created_at?: string | null
          deposit_months?: number | null
          description?: string | null
          distance_from_city?: number | null
          distance_from_sea?: number | null
          energy_class?: string | null
          facade_length?: number | null
          featured_until?: string | null
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
          id?: string | null
          is_buildable?: boolean | null
          is_corner?: boolean | null
          is_featured?: boolean | null
          is_neoclassical?: boolean | null
          is_off_market?: boolean | null
          is_penthouse?: boolean | null
          is_pre_sale?: boolean | null
          is_preserved?: boolean | null
          kitchens?: number | null
          land_use?: string | null
          latitude?: number | null
          levels?: number | null
          listing_images?: never
          listing_images_detail?: never
          listing_type?: Database["public"]["Enums"]["listing_type"] | null
          living_rooms?: number | null
          location_search_text?: string | null
          longitude?: number | null
          min_rental_months?: number | null
          monthly_expenses?: number | null
          noise_score?: number | null
          open_house_date?: string | null
          open_house_transaction_type?: string | null
          owner_id?: string | null
          pets_allowed?: boolean | null
          plot_depth?: number | null
          plot_surface?: number | null
          postal_code?: string | null
          price?: number | null
          price_per_sqm?: number | null
          priority_placement?: number | null
          priority_until?: string | null
          project?: never
          project_detail?: never
          project_id?: string | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          region?: string | null
          road_type?: string | null
          safety_score?: number | null
          short_term_rental?: boolean | null
          slope?: string | null
          sqm?: number | null
          status?: Database["public"]["Enums"]["listing_status"] | null
          suitable_commercial_use?: boolean | null
          suitable_holiday?: boolean | null
          suitable_investment?: boolean | null
          suitable_student?: boolean | null
          tags?: string[] | null
          title?: string | null
          total_floors?: number | null
          updated_at?: string | null
          views_count?: number | null
          walkability_score?: number | null
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
          city?: string | null
          commercial_subtype?: string | null
          construction_status?: string | null
          cover_image_url?: string | null
          coverage_ratio?: number | null
          created_at?: string | null
          deposit_months?: number | null
          description?: string | null
          distance_from_city?: number | null
          distance_from_sea?: number | null
          energy_class?: string | null
          facade_length?: number | null
          featured_until?: string | null
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
          id?: string | null
          is_buildable?: boolean | null
          is_corner?: boolean | null
          is_featured?: boolean | null
          is_neoclassical?: boolean | null
          is_off_market?: boolean | null
          is_penthouse?: boolean | null
          is_pre_sale?: boolean | null
          is_preserved?: boolean | null
          kitchens?: number | null
          land_use?: string | null
          latitude?: number | null
          levels?: number | null
          listing_images?: never
          listing_images_detail?: never
          listing_type?: Database["public"]["Enums"]["listing_type"] | null
          living_rooms?: number | null
          location_search_text?: string | null
          longitude?: number | null
          min_rental_months?: number | null
          monthly_expenses?: number | null
          noise_score?: number | null
          open_house_date?: string | null
          open_house_transaction_type?: string | null
          owner_id?: string | null
          pets_allowed?: boolean | null
          plot_depth?: number | null
          plot_surface?: number | null
          postal_code?: string | null
          price?: number | null
          price_per_sqm?: number | null
          priority_placement?: number | null
          priority_until?: string | null
          project?: never
          project_detail?: never
          project_id?: string | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          region?: string | null
          road_type?: string | null
          safety_score?: number | null
          short_term_rental?: boolean | null
          slope?: string | null
          sqm?: number | null
          status?: Database["public"]["Enums"]["listing_status"] | null
          suitable_commercial_use?: boolean | null
          suitable_holiday?: boolean | null
          suitable_investment?: boolean | null
          suitable_student?: boolean | null
          tags?: string[] | null
          title?: string | null
          total_floors?: number | null
          updated_at?: string | null
          views_count?: number | null
          walkability_score?: number | null
          wc_count?: number | null
          website_url?: string | null
          within_city_plan?: boolean | null
          within_settlement?: boolean | null
          year_built?: number | null
          zone_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_open_house_offer: {
        Args: { p_offer_id: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "open_house_offers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      activate_listing_promotion: {
        Args: {
          p_listing_id: string
          p_promotion_type: string
          p_request_key: string
        }
        Returns: Json
      }
      addon_credit_bucket: { Args: { p_addon_key: string }; Returns: string }
      addon_credit_units: {
        Args: { p_addon_key: string; p_quantity?: number }
        Returns: number
      }
      admin_ban_reported_content_owner: {
        Args: { p_reason?: string; p_report_id: string }
        Returns: string
      }
      admin_ban_reported_content_owner_for_user: {
        Args: { _admin_user_id: string; p_reason?: string; p_report_id: string }
        Returns: string
      }
      admin_broadcast_notification: {
        Args: {
          p_body: string
          p_link?: string
          p_segment: string
          p_title: string
          p_type?: string
        }
        Returns: number
      }
      admin_broadcast_notification_for_user: {
        Args: {
          _admin_user_id: string
          p_body: string
          p_link?: string
          p_segment: string
          p_title: string
          p_type?: string
        }
        Returns: number
      }
      admin_resolve_listing_report: {
        Args: { p_report_id: string }
        Returns: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reporter_id: string | null
          status: Database["public"]["Enums"]["listing_report_status"]
        }
        SetofOptions: {
          from: "*"
          to: "listing_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_resolve_listing_report_for_user: {
        Args: { _admin_user_id: string; p_report_id: string }
        Returns: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reporter_id: string | null
          status: Database["public"]["Enums"]["listing_report_status"]
        }
        SetofOptions: {
          from: "*"
          to: "listing_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_review_agent_data_input:
        | {
            Args: { p_action: string; p_id: string; p_reason?: string }
            Returns: {
              agent_side: string
              applied_to_invoice_at: string | null
              buyer_name: string | null
              city: string | null
              closing_date: string
              created_at: string
              discount_applied: boolean
              discount_applied_at: string | null
              discount_invoice_id: string | null
              discount_pct: number
              id: string
              kaek: string | null
              notes: string | null
              postal_code: string | null
              property_address: string
              property_type: string
              rejection_reason: string | null
              reviewed_at: string | null
              reviewed_by: string | null
              sale_price: number
              seller_name: string | null
              status: string
              stripe_credit_amount_cents: number | null
              stripe_credit_currency: string | null
              stripe_credit_id: string | null
              transaction_type: string
              updated_at: string
              user_id: string
            }
            SetofOptions: {
              from: "*"
              to: "agent_data_inputs"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_decision: string
              p_input_id: string
              p_lifetime_ban?: boolean
              p_reason?: string
              p_reviewer_id?: string
            }
            Returns: {
              agent_side: string
              applied_to_invoice_at: string | null
              buyer_name: string | null
              city: string | null
              closing_date: string
              created_at: string
              discount_applied: boolean
              discount_applied_at: string | null
              discount_invoice_id: string | null
              discount_pct: number
              id: string
              kaek: string | null
              notes: string | null
              postal_code: string | null
              property_address: string
              property_type: string
              rejection_reason: string | null
              reviewed_at: string | null
              reviewed_by: string | null
              sale_price: number
              seller_name: string | null
              status: string
              stripe_credit_amount_cents: number | null
              stripe_credit_currency: string | null
              stripe_credit_id: string | null
              transaction_type: string
              updated_at: string
              user_id: string
            }
            SetofOptions: {
              from: "*"
              to: "agent_data_inputs"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      admin_review_invitation_request: {
        Args: {
          p_admin_user_id: string
          p_decision: string
          p_rejection_reason?: string
          p_request_id: string
          p_tier?: string
        }
        Returns: {
          email: string
          full_name: string
          granted_role: string
          request_id: string
          status: string
          subscription_status: string
          tier: string
        }[]
      }
      admin_set_firesale_investor_publication: {
        Args: { p_deal_id: string; p_published: boolean }
        Returns: {
          deal_id: string
          published_to_investors: boolean
          status: string
        }[]
      }
      admin_set_firesale_investor_publication_for_user: {
        Args: {
          _admin_user_id: string
          p_deal_id: string
          p_published: boolean
        }
        Returns: {
          deal_id: string
          published_to_investors: boolean
          status: string
        }[]
      }
      admin_set_listing_promotions: {
        Args: {
          p_actor_id: string
          p_listing_id: string
          p_priority_enabled: boolean
          p_spotlight_enabled: boolean
          p_spotlight_ends_at: string
        }
        Returns: undefined
      }
      admin_suspend_reported_listing: {
        Args: { p_reason?: string; p_report_id: string }
        Returns: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reporter_id: string | null
          status: Database["public"]["Enums"]["listing_report_status"]
        }
        SetofOptions: {
          from: "*"
          to: "listing_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_suspend_reported_listing_for_user: {
        Args: { _admin_user_id: string; p_reason?: string; p_report_id: string }
        Returns: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reporter_id: string | null
          status: Database["public"]["Enums"]["listing_report_status"]
        }
        SetofOptions: {
          from: "*"
          to: "listing_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_firesale_interest_workflow: {
        Args: {
          p_admin_note?: string
          p_interest_id: string
          p_proof_amount?: number
          p_reservation_hours?: number
          p_status: string
          p_verify_pof?: boolean
        }
        Returns: {
          admin_note: string | null
          created_at: string
          deal_id: string
          id: string
          investor_id: string
          last_status_changed_at: string
          message: string | null
          proof_amount: number | null
          proof_of_funds_url: string | null
          proof_of_funds_verified_at: string | null
          proof_of_funds_verified_by: string | null
          reservation_expires_at: string | null
          reserved_at: string | null
          reserved_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "firesale_interest"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_firesale_interest_workflow_for_user: {
        Args: {
          _admin_user_id: string
          p_admin_note?: string
          p_interest_id: string
          p_proof_amount?: number
          p_reservation_hours?: number
          p_status: string
          p_verify_pof?: boolean
        }
        Returns: {
          admin_note: string | null
          created_at: string
          deal_id: string
          id: string
          investor_id: string
          last_status_changed_at: string
          message: string | null
          proof_amount: number | null
          proof_of_funds_url: string | null
          proof_of_funds_verified_at: string | null
          proof_of_funds_verified_by: string | null
          reservation_expires_at: string | null
          reserved_at: string | null
          reserved_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "firesale_interest"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_firesale_pipeline_deal: {
        Args: {
          p_admin_notes?: string
          p_deal_id: string
          p_offer_price?: number
          p_seller_response?: string
          p_seller_response_price?: number
          p_status: string
        }
        Returns: {
          deal_id: string
          notified: number
          status: string
        }[]
      }
      admin_update_firesale_pipeline_deal_for_user: {
        Args: {
          _admin_user_id: string
          p_admin_notes?: string
          p_deal_id: string
          p_offer_price?: number
          p_seller_response?: string
          p_seller_response_price?: number
          p_status: string
        }
        Returns: {
          deal_id: string
          notified: number
          status: string
        }[]
      }
      admin_update_listing_promotion_expiry: {
        Args: {
          p_actor_id: string
          p_ends_at: string
          p_listing_id: string
          p_promotion_type: string
        }
        Returns: undefined
      }
      admin_user_activity_snapshot: {
        Args: { p_days?: number; p_limit?: number }
        Returns: Json
      }
      agent_data_input_discount_pct_per_input: { Args: never; Returns: number }
      agent_data_input_max_per_month: { Args: never; Returns: number }
      agent_data_input_quota: {
        Args: { p_user_id?: string }
        Returns: {
          is_banned: boolean
          monthly_limit: number
          remaining: number
          used: number
        }[]
      }
      apply_subscription_lapse_controls: {
        Args: { p_user_id: string }
        Returns: Json
      }
      apply_verified_data_input_discount: {
        Args: { p_invoice_id: string; p_user_id: string }
        Returns: {
          applied_count: number
          applied_pct: number
        }[]
      }
      archive_role_data: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      authoritative_role:
        | { Args: never; Returns: Database["public"]["Enums"]["user_role"] }
        | {
            Args: { _user_id: string }
            Returns: Database["public"]["Enums"]["user_role"]
          }
      authorize_property_report_generation: {
        Args: { p_user_id: string }
        Returns: Json
      }
      begin_account_deletion_job: {
        Args: { p_user_id: string }
        Returns: string
      }
      begin_role_switch: { Args: never; Returns: undefined }
      begin_role_switch_for_user: {
        Args: { _user_id: string }
        Returns: undefined
      }
      bulk_update_project_unit_prices_for_user: {
        Args: { _user_id: string; p_percentage: number; p_project_id: string }
        Returns: number
      }
      can_review_professional: {
        Args: { p_professional_id: string; p_reviewer_id: string }
        Returns: boolean
      }
      charge_property_report_fetch_for_user: {
        Args: {
          p_cache_generated_at: string
          p_listing_id: string
          p_user_id: string
        }
        Returns: Json
      }
      check_ai_quota: { Args: { p_bucket: string }; Returns: Json }
      check_ai_quota_for_user: {
        Args: { _user_id: string; p_bucket: string }
        Returns: Json
      }
      check_ai_quotas_for_user: {
        Args: { _user_id: string; p_buckets: string[] }
        Returns: Json
      }
      check_and_increment_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: Json
      }
      check_listing_quota: { Args: never; Returns: boolean }
      claim_property_report_generation: {
        Args: {
          p_holder: string
          p_lang: string
          p_lease_seconds?: number
          p_listing_id: string
        }
        Returns: boolean
      }
      complete_onboarding_role: {
        Args: {
          p_city?: string
          p_display_name?: string
          p_participant_type: string
          p_phone?: string
          p_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: undefined
      }
      complete_onboarding_role_for_user: {
        Args: {
          p_city?: string
          p_display_name?: string
          p_participant_type: string
          p_phone?: string
          p_role: Database["public"]["Enums"]["user_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      consume_addon_credit_for_user: {
        Args: { p_bucket: string; p_user_id: string }
        Returns: boolean
      }
      create_listing_for_user: { Args: { p_payload: Json }; Returns: Json }
      create_open_house_registration: {
        Args: {
          p_contact_email?: string
          p_contact_name?: string
          p_contact_permission?: boolean
          p_contact_phone?: string
          p_id_verification_consent?: boolean
          p_listing_id: string
          p_note?: string
          p_privacy_acknowledgement?: boolean
          p_timeslot_index?: number
          p_visit_purpose?: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          attended_at: string | null
          budget_range: string | null
          contact_email: string | null
          contact_name: string | null
          contact_permission_at: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          id_doc_type: Database["public"]["Enums"]["oh_id_doc_type"] | null
          id_doc_url: string | null
          id_verification_consent_at: string | null
          id_verified_at: string | null
          investor_declaration_signed_at: string | null
          listing_id: string
          mortgage_status: string | null
          note: string | null
          pof_rejection_reason: string | null
          pof_verified_status: string | null
          privacy_acknowledged_at: string | null
          proof_amount: number | null
          proof_of_funds_url: string | null
          rejection_reason: string | null
          requester_id: string
          screening_doc_url: string | null
          screening_score: number | null
          status: Database["public"]["Enums"]["oh_registration_status"] | null
          timeslot_index: number | null
          updated_at: string | null
          visit_purpose: string | null
          waiver_signed_at: string | null
          waiver_url: string | null
          working_with_agent: string | null
        }
        SetofOptions: {
          from: "*"
          to: "open_house_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_open_house_registration_for_user: {
        Args: {
          _user_id: string
          p_contact_email?: string
          p_contact_name?: string
          p_contact_permission?: boolean
          p_contact_phone?: string
          p_id_verification_consent?: boolean
          p_listing_id: string
          p_note?: string
          p_privacy_acknowledgement?: boolean
          p_timeslot_index?: number
          p_visit_purpose?: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          attended_at: string | null
          budget_range: string | null
          contact_email: string | null
          contact_name: string | null
          contact_permission_at: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          id_doc_type: Database["public"]["Enums"]["oh_id_doc_type"] | null
          id_doc_url: string | null
          id_verification_consent_at: string | null
          id_verified_at: string | null
          investor_declaration_signed_at: string | null
          listing_id: string
          mortgage_status: string | null
          note: string | null
          pof_rejection_reason: string | null
          pof_verified_status: string | null
          privacy_acknowledged_at: string | null
          proof_amount: number | null
          proof_of_funds_url: string | null
          rejection_reason: string | null
          requester_id: string
          screening_doc_url: string | null
          screening_score: number | null
          status: Database["public"]["Enums"]["oh_registration_status"] | null
          timeslot_index: number | null
          updated_at: string | null
          visit_purpose: string | null
          waiver_signed_at: string | null
          waiver_url: string | null
          working_with_agent: string | null
        }
        SetofOptions: {
          from: "*"
          to: "open_house_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_billing_runtime_mode: { Args: never; Returns: string }
      deactivate_listing_promotion: {
        Args: { p_listing_id: string; p_promotion_type: string }
        Returns: number
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_listing_for_user: { Args: { p_id: string }; Returns: boolean }
      delete_project_and_unlink_listings: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expand_location_search_aliases: {
        Args: { input: string }
        Returns: string
      }
      expire_featured_listings: { Args: never; Returns: undefined }
      expire_listing_promotions: { Args: never; Returns: number }
      expire_past_auctions: { Args: never; Returns: number }
      get_account_deletion_storage_objects: {
        Args: { p_user_id: string }
        Returns: {
          bucket_id: string
          name: string
        }[]
      }
      get_addon_credit_balance: {
        Args: { p_bucket: string; p_user_id: string }
        Returns: number
      }
      get_admin_listing_promotion_campaigns: {
        Args: never
        Returns: {
          campaign_status: string
          campaign_type: string
          city: string
          cover_image_url: string
          detail_views: number
          ends_at: string
          enquiries: number
          featured_until: string
          is_featured: boolean
          listing_id: string
          listing_type: string
          owner_id: string
          price: number
          priority_placement: number
          priority_until: string
          property_type: string
          saves: number
          seller_name: string
          source_type: string
          starts_at: string
          status: string
          title: string
        }[]
      }
      get_agent_data_input_status: {
        Args: { p_user_id?: string }
        Returns: {
          ban_reason: string
          banned_at: string
          discount_pct_per_input: number
          lifetime_banned: boolean
          monthly_count: number
          monthly_limit: number
          pending_discount_count: number
          pending_discount_pct: number
          total_pending: number
          total_rejected: number
          total_verified: number
        }[]
      }
      get_agent_monthly_input_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_ai_call_monthly_base_limit: {
        Args: { p_bucket: string; p_user_id: string }
        Returns: number
      }
      get_ai_call_monthly_limit: {
        Args: { p_bucket: string; p_user_id: string }
        Returns: number
      }
      get_auction_alert_limit: { Args: { p_user_id: string }; Returns: number }
      get_auction_listing_visible_limit: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_available_addon_credits: {
        Args: { p_bucket: string; p_user_id: string }
        Returns: number
      }
      get_contact_monthly_limit: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_listing_limit:
        | { Args: { p_is_pro: boolean; p_role: string }; Returns: number }
        | { Args: { p_user_id: string }; Returns: number }
      get_listing_management_catalogue: {
        Args: never
        Returns: {
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
          city: string | null
          commercial_subtype: string | null
          construction_status: string | null
          cover_image_url: string | null
          coverage_ratio: number | null
          created_at: string | null
          deposit_months: number | null
          description: string | null
          distance_from_city: number | null
          distance_from_sea: number | null
          energy_class: string | null
          enfia_zone: string | null
          facade_length: number | null
          featured_until: string | null
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
          id: string | null
          is_buildable: boolean | null
          is_corner: boolean | null
          is_featured: boolean | null
          is_neoclassical: boolean | null
          is_off_market: boolean | null
          is_penthouse: boolean | null
          is_pre_sale: boolean | null
          is_preserved: boolean | null
          kitchens: number | null
          land_use: string | null
          latitude: number | null
          levels: number | null
          listing_images: Json | null
          listing_type: Database["public"]["Enums"]["listing_type"] | null
          living_rooms: number | null
          location_search_text: string | null
          longitude: number | null
          min_rental_months: number | null
          monthly_expenses: number | null
          noise_score: number | null
          open_house_date: string | null
          open_house_settings: Json | null
          open_house_transaction_type: string | null
          organization_id: string | null
          owner_id: string | null
          pets_allowed: boolean | null
          plot_depth: number | null
          plot_surface: number | null
          postal_code: string | null
          price: number | null
          price_per_sqm: number | null
          priority_placement: number | null
          priority_until: string | null
          project_id: string | null
          property_type: Database["public"]["Enums"]["property_type"] | null
          region: string | null
          road_type: string | null
          safety_score: number | null
          short_term_rental: boolean | null
          slope: string | null
          sqm: number | null
          status: Database["public"]["Enums"]["listing_status"] | null
          suitable_commercial_use: boolean | null
          suitable_holiday: boolean | null
          suitable_investment: boolean | null
          suitable_student: boolean | null
          tags: string[] | null
          title: string | null
          total_floors: number | null
          updated_at: string | null
          views_count: number | null
          walkability_score: number | null
          wc_count: number | null
          website_url: string | null
          within_city_plan: boolean | null
          within_settlement: boolean | null
          year_built: number | null
          zone_type: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "listing_management_catalogue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_listing_promotion_balance: { Args: never; Returns: Json }
      get_listing_reference_catalogue: {
        Args: never
        Returns: {
          address: string | null
          city: string | null
          cover_image_url: string | null
          id: string | null
          is_pre_sale: boolean | null
          listing_type: Database["public"]["Enums"]["listing_type"] | null
          organization_id: string | null
          owner_id: string | null
          price: number | null
          project_id: string | null
          sqm: number | null
          status: Database["public"]["Enums"]["listing_status"] | null
          title: string | null
          views_count: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "listing_reference_catalogue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_open_house_capacity: {
        Args: { p_listing_id: string }
        Returns: {
          active_total: number
          listing_id: string
          max_total_visitors: number
          slot_counts: Json
        }[]
      }
      get_open_house_capacity_for_user: {
        Args: { _user_id: string; p_listing_id: string }
        Returns: {
          active_total: number
          listing_id: string
          max_total_visitors: number
          slot_counts: Json
        }[]
      }
      get_open_house_rsvp_monthly_limit: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_priority_ad_monthly_limit: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_professionals_per_category_limit: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_professionals_with_priority: {
        Args: { p_category?: string }
        Returns: {
          archived_at: string | null
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
          notes: string | null
          projects_count: number | null
          rating: number | null
          rejection_reason: string | null
          reviews_count: number | null
          specialties: string[] | null
          subscription_tier: string | null
          title: string
          updated_at: string
          user_id: string
          verified: boolean
          verified_at: string | null
          video_link: string | null
          website_url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "professionals"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_listing_catalogue: {
        Args: never
        Returns: {
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
          city: string | null
          commercial_subtype: string | null
          construction_status: string | null
          cover_image_url: string | null
          coverage_ratio: number | null
          created_at: string | null
          deposit_months: number | null
          description: string | null
          distance_from_city: number | null
          distance_from_sea: number | null
          energy_class: string | null
          facade_length: number | null
          featured_until: string | null
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
          id: string | null
          is_buildable: boolean | null
          is_corner: boolean | null
          is_featured: boolean | null
          is_neoclassical: boolean | null
          is_off_market: boolean | null
          is_penthouse: boolean | null
          is_pre_sale: boolean | null
          is_preserved: boolean | null
          kitchens: number | null
          land_use: string | null
          latitude: number | null
          levels: number | null
          listing_images: Json | null
          listing_images_detail: Json | null
          listing_type: Database["public"]["Enums"]["listing_type"] | null
          living_rooms: number | null
          location_search_text: string | null
          longitude: number | null
          min_rental_months: number | null
          monthly_expenses: number | null
          noise_score: number | null
          open_house_date: string | null
          open_house_transaction_type: string | null
          owner_id: string | null
          pets_allowed: boolean | null
          plot_depth: number | null
          plot_surface: number | null
          postal_code: string | null
          price: number | null
          price_per_sqm: number | null
          priority_placement: number | null
          priority_until: string | null
          project: Json | null
          project_detail: Json | null
          project_id: string | null
          property_type: Database["public"]["Enums"]["property_type"] | null
          region: string | null
          road_type: string | null
          safety_score: number | null
          short_term_rental: boolean | null
          slope: string | null
          sqm: number | null
          status: Database["public"]["Enums"]["listing_status"] | null
          suitable_commercial_use: boolean | null
          suitable_holiday: boolean | null
          suitable_investment: boolean | null
          suitable_student: boolean | null
          tags: string[] | null
          title: string | null
          total_floors: number | null
          updated_at: string | null
          views_count: number | null
          walkability_score: number | null
          wc_count: number | null
          website_url: string | null
          within_city_plan: boolean | null
          within_settlement: boolean | null
          year_built: number | null
          zone_type: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "public_listing_catalogue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_profile_summaries: {
        Args: { p_user_ids: string[] }
        Returns: {
          avatar_url: string
          display_name: string
          owner_participant_type: string
          user_id: string
        }[]
      }
      get_report_monthly_base_limit: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_report_monthly_limit: { Args: { p_user_id: string }; Returns: number }
      get_saved_search_limit: { Args: { p_user_id: string }; Returns: number }
      get_search_alert_limit: { Args: { p_user_id: string }; Returns: number }
      get_valuation_monthly_limit: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_viewing_limit: {
        Args: { p_is_requester: boolean; p_user_id: string }
        Returns: number
      }
      grant_platform_admin: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      grant_platform_admin_by_email: {
        Args: { target_email: string }
        Returns: undefined
      }
      grant_platform_admin_by_email_for_caller: {
        Args: { caller_user_id: string; target_email: string }
        Returns: undefined
      }
      has_audience_scoped_pro_entitlement: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      has_buy_side_role: { Args: { _user_id: string }; Returns: boolean }
      has_current_investor_subscription:
        | { Args: never; Returns: boolean }
        | { Args: { p_user_id: string }; Returns: boolean }
      has_platform_admin: { Args: { _user_id?: string }; Returns: boolean }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _role: Database["public"]["Enums"]["user_role"]
              _user_id: string
            }
            Returns: boolean
          }
      has_sell_side_role: { Args: { _user_id: string }; Returns: boolean }
      increment_listing_views: {
        Args: { p_listing_id: string }
        Returns: undefined
      }
      invoke_send_saved_search_alerts_cron: { Args: never; Returns: undefined }
      is_account_deletion_active: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      is_pro: { Args: { p_user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_location_text: { Args: { input: string }; Returns: string }
      profile_pricing_audience: {
        Args: {
          p_participant_type?: string
          p_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: string
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reconcile_addon_refund_event: {
        Args: {
          p_livemode: boolean
          p_metadata?: Json
          p_purchase_id: string
          p_refunded_amount: number
          p_runtime_mode: string
          p_status: string
          p_stripe_refund_id: string
          p_total_amount: number
        }
        Returns: Json
      }
      record_ai_call: { Args: { p_bucket: string }; Returns: Json }
      record_listing_view: {
        Args: { p_listing_id: string; p_viewer_id?: string }
        Returns: undefined
      }
      record_listing_view_event: {
        Args: { p_listing_id: string; p_viewer_id?: string }
        Returns: undefined
      }
      record_role_switch_audit: {
        Args: {
          _from_type: string
          _had_active_sub: boolean
          _sub_cancelled: boolean
          _switch_kind: string
          _to_type: string
        }
        Returns: string
      }
      record_role_switch_audit_for_user: {
        Args: {
          _from_type: string
          _had_active_sub: boolean
          _sub_cancelled: boolean
          _switch_kind: string
          _to_type: string
          _user_id: string
        }
        Returns: string
      }
      record_user_auth_activity: {
        Args: { p_event_type: string; p_metadata?: Json; p_route?: string }
        Returns: string
      }
      release_expired_firesale_reservations: {
        Args: { p_deal_id?: string }
        Returns: number
      }
      release_property_report_generation: {
        Args: { p_holder: string; p_lang: string; p_listing_id: string }
        Returns: boolean
      }
      reopen_open_house_offer_selection: {
        Args: { p_listing_id: string }
        Returns: undefined
      }
      reserve_ai_quota: { Args: { p_bucket: string }; Returns: Json }
      reserve_ai_quota_for_user: {
        Args: { _user_id: string; p_bucket: string }
        Returns: Json
      }
      resolve_subscription_state_for_service: {
        Args: { p_required_stripe_subscription_id?: string; p_user_id: string }
        Returns: Json
      }
      seed_grant_agent_role: {
        Args: { user_ids: string[] }
        Returns: undefined
      }
      seed_grant_role: {
        Args: { target_role: string; user_ids: string[] }
        Returns: undefined
      }
      send_message_with_attachments: {
        Args: {
          p_attachments?: Json
          p_client_delivery_id: string
          p_content: string
          p_conversation_id: string
        }
        Returns: {
          client_delivery_id: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          receiver_id: string | null
          sender_id: string
          status: Database["public"]["Enums"]["message_status"]
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_account_deletion_job_stage: {
        Args: {
          p_attempt_id: string
          p_last_error?: string
          p_stage: string
          p_status: string
          p_user_id: string
        }
        Returns: undefined
      }
      store_property_report_cache_generation: {
        Args: {
          p_ai: Json
          p_expires_at: string
          p_features: Json
          p_file_name: string
          p_generated_at: string
          p_html: string
          p_lang: string
          p_listing_id: string
        }
        Returns: {
          ai: Json | null
          created_at: string
          expires_at: string
          features: Json
          file_name: string
          generated_at: string
          html: string
          id: string
          lang: string
          listing_id: string
          report_type: string
          source: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "property_report_cache"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_agent_data_input:
        | {
            Args: {
              p_buyer_name?: string
              p_closed_at: string
              p_closing_price: number
              p_kaek?: string
              p_notes?: string
              p_property_address: string
              p_property_city: string
              p_property_postal_code?: string
              p_property_type?: string
              p_seller_name?: string
              p_transaction_type: string
            }
            Returns: string
          }
        | {
            Args: {
              p_agent_side?: string
              p_buyer_name?: string
              p_closed_at: string
              p_closing_price: number
              p_kaek?: string
              p_notes?: string
              p_property_address: string
              p_property_city: string
              p_property_postal_code?: string
              p_property_type?: string
              p_seller_name?: string
              p_transaction_type: string
            }
            Returns: string
          }
      submit_firesale_interest: {
        Args: {
          p_deal_id: string
          p_message?: string
          p_proof_amount?: number
          p_proof_of_funds_url?: string
        }
        Returns: {
          admin_note: string | null
          created_at: string
          deal_id: string
          id: string
          investor_id: string
          last_status_changed_at: string
          message: string | null
          proof_amount: number | null
          proof_of_funds_url: string | null
          proof_of_funds_verified_at: string | null
          proof_of_funds_verified_by: string | null
          reservation_expires_at: string | null
          reserved_at: string | null
          reserved_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "firesale_interest"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_firesale_interest_for_user: {
        Args: {
          _user_id: string
          p_deal_id: string
          p_message?: string
          p_proof_amount?: number
          p_proof_of_funds_url?: string
        }
        Returns: {
          admin_note: string | null
          created_at: string
          deal_id: string
          id: string
          investor_id: string
          last_status_changed_at: string
          message: string | null
          proof_amount: number | null
          proof_of_funds_url: string | null
          proof_of_funds_verified_at: string | null
          proof_of_funds_verified_by: string | null
          reservation_expires_at: string | null
          reserved_at: string | null
          reserved_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "firesale_interest"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_open_house_offer: {
        Args: {
          p_amount: number
          p_currency?: string
          p_listing_id: string
          p_message?: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "open_house_offers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      track_user_search: {
        Args: {
          p_filters?: Json
          p_metadata?: Json
          p_query: string
          p_result_count?: number
          p_route?: string
          p_surface: string
        }
        Returns: undefined
      }
      unarchive_role_data: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      update_listing_for_user: {
        Args: { p_id: string; p_updates: Json }
        Returns: Json
      }
      uuid_from_realtime_topic: {
        Args: { p_prefix: string; p_topic: string }
        Returns: string
      }
      validate_role_switch_for_user: {
        Args: { _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      listing_report_status: "pending" | "resolved" | "dismissed"
      listing_status:
        | "draft"
        | "active"
        | "paused"
        | "sold"
        | "rented"
        | "expired"
      listing_type:
        | "sale"
        | "rent"
        | "auction"
        | "firesale"
        | "open_house"
        | "new_build"
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
        | "studio"
        | "maisonette"
        | "warehouse"
        | "hotel"
        | "mixed_use"
        | "parking"
        | "storage"
      user_role:
        | "buyer"
        | "agent"
        | "professional"
        | "seller"
        | "admin"
        | "investor"
        | "institutional"
        | "developer"
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
      app_role: ["admin", "moderator", "user"],
      listing_report_status: ["pending", "resolved", "dismissed"],
      listing_status: [
        "draft",
        "active",
        "paused",
        "sold",
        "rented",
        "expired",
      ],
      listing_type: [
        "sale",
        "rent",
        "auction",
        "firesale",
        "open_house",
        "new_build",
      ],
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
        "studio",
        "maisonette",
        "warehouse",
        "hotel",
        "mixed_use",
        "parking",
        "storage",
      ],
      user_role: [
        "buyer",
        "agent",
        "professional",
        "seller",
        "admin",
        "investor",
        "institutional",
        "developer",
      ],
      viewing_status: ["pending", "confirmed", "cancelled", "completed"],
      viewing_type: ["in_person", "video"],
    },
  },
} as const
