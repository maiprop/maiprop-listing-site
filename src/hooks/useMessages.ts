import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function useConversations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("conversations")
        .select(`
          *,
          listings(title, city, cover_image_url),
          profile_a:profiles!conversations_participant_a_fkey(display_name, avatar_url, user_id),
          profile_b:profiles!conversations_participant_b_fkey(display_name, avatar_url, user_id),
          messages(content, created_at, sender_id)
        `)
        .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useMessages(conversation_id: string) {
  return useQuery({
    queryKey: ["messages", conversation_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*, profiles!messages_sender_id_fkey(display_name, avatar_url)")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!conversation_id,
    refetchInterval: 5000, // Poll every 5 seconds for new messages
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ conversation_id, content }: { conversation_id: string; content: string }) => {
      if (!user) throw new Error("Must be logged in");
      const { data, error } = await supabase
        .from("messages")
        .insert({ conversation_id, sender_id: user.id, content })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { conversation_id }) => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversation_id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useStartConversation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ other_user_id, listing_id }: { other_user_id: string; listing_id?: string }) => {
      if (!user) throw new Error("Must be logged in");
      // Check if conversation already exists
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .or(
          `and(participant_a.eq.${user.id},participant_b.eq.${other_user_id}),and(participant_a.eq.${other_user_id},participant_b.eq.${user.id})`
        )
        .eq("listing_id", listing_id || null)
        .single();

      if (existing) return existing.id;

      const { data, error } = await supabase
        .from("conversations")
        .insert({
          participant_a: user.id,
          participant_b: other_user_id,
          listing_id: listing_id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
