import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const DEAL_STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;

export function useContacts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contacts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*, listings(id, title, city, cover_image_url)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
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
      const { data, error } = await supabase
        .from("contacts")
        .insert({
          ...contact,
          user_id: user!.id,
          deal_stage: contact.deal_stage || "new",
        } as Record<string, unknown>)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { data, error } = await supabase
        .from("contacts")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact deleted");
    },
    onError: (e: Error) => toast.error(e.message),
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
        .select("*")
        .eq("contact_id", contactId)
        .eq("user_id", user.id)
        .order("due_at", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!contactId && !!user,
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
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateContactTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: { title?: string; due_at?: string | null; completed_at?: string | null; notes?: string };
    }) => {
      const { data, error } = await supabase
        .from("contact_tasks")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["contact_tasks", data.contact_id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
