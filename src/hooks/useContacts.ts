import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Database, TablesUpdate } from "@/integrations/supabase/types";
import { USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";

const DEAL_STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;

/** A CRM contact row as returned by the list query, including the joined listing summary. */
export type Contact = Pick<
  Database["public"]["Tables"]["contacts"]["Row"],
  | "id"
  | "user_id"
  | "name"
  | "email"
  | "phone"
  | "source"
  | "deal_stage"
  | "notes"
  | "follow_up_at"
  | "listing_id"
  | "created_at"
  | "updated_at"
> & {
  listings: Pick<
    Database["public"]["Tables"]["listings"]["Row"],
    "id" | "title" | "city" | "cover_image_url"
  > | null;
};

/** A contact task row (CRM to-do item). */
export type ContactTask = Database["public"]["Tables"]["contact_tasks"]["Row"];

/** Returns the current user's CRM contacts with linked listing data. */
export function useContacts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contacts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("contacts")
        .select("id, user_id, name, email, phone, source, deal_stage, notes, follow_up_at, listing_id, created_at, updated_at, listings(id, title, city, cover_image_url)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}

export { DEAL_STAGES };

export function useCreateContact() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (contact: {
      name: string;
      email?: string;
      phone?: string;
      source?: string;
      notes?: string;
      deal_stage?: string;
      follow_up_at?: string | null;
      listing_id?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("contacts")
        .insert({
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          source: contact.source,
          notes: contact.notes,
          deal_stage: contact.deal_stage || "new",
          follow_up_at: contact.follow_up_at,
          listing_id: contact.listing_id,
          user_id: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact added");
    },
    onError: () => toast.error("Could not add contact. Please try again."),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"contacts"> }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("contacts")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact updated");
    },
    onError: () => toast.error("Could not update contact. Please try again."),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("contacts").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact deleted");
    },
    onError: () => toast.error("Could not delete contact. Please try again."),
  });
}

export function useContactTasks(contactId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contact_tasks", contactId, user?.id],
    queryFn: async () => {
      if (!contactId || !user) return [];
      const { data, error } = await supabase
        .from("contact_tasks")
        .select("id, contact_id, user_id, title, notes, due_at, completed_at, created_at, updated_at")
        .eq("contact_id", contactId)
        .eq("user_id", user.id)
        .order("due_at", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!contactId && !!user,
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
}

export function useCreateContactTask() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      contactId,
      title,
      dueAt,
      notes,
    }: {
      contactId: string;
      title: string;
      dueAt?: string | null;
      notes?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("contact_tasks")
        .insert({
          contact_id: contactId,
          user_id: user.id,
          title,
          due_at: dueAt || null,
          notes: notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["contact_tasks", v.contactId] });
      toast.success("Task added");
    },
    onError: () => toast.error("Failed to add task. Please try again."),
  });
}

export function useUpdateContactTask() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: { title?: string; due_at?: string | null; completed_at?: string | null; notes?: string };
    }) => {
      if (!user) throw new Error("Must be logged in");
      const { data, error } = await supabase
        .from("contact_tasks")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["contact_tasks", data.contact_id] });
    },
    onError: () => toast.error("Failed to update task. Please try again."),
  });
}
