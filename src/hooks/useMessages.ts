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
      const { data: convs, error: convError } = await supabase
        .from("conversations")
        .select(`
          *,
          listings(title, city, cover_image_url),
          messages(content, created_at, sender_id)
        `)
        .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (convError) throw convError;
      const list = convs || [];
      const userIds = new Set<string>();
      list.forEach((c: any) => {
        if (c.participant_a) userIds.add(c.participant_a);
        if (c.participant_b) userIds.add(c.participant_b);
      });
      if (userIds.size === 0) return list;
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("user_id, display_name, avatar_url")
        .in("user_id", Array.from(userIds));
      const profileByUserId = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      return list.map((c: any) => ({
        ...c,
        profile_a: profileByUserId.get(c.participant_a) ?? null,
        profile_b: profileByUserId.get(c.participant_b) ?? null,
      }));
    },
    enabled: !!user,
  });
}

export function useMessages(conversation_id: string) {
  return useQuery({
    queryKey: ["messages", conversation_id],
    queryFn: async () => {
      const { data: msgs, error } = await supabase
        .from("messages")
        .select("id, content, created_at, sender_id, conversation_id, status, message_attachments(storage_path, filename, mime_type)")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const list = msgs || [];
      const senderIds = [...new Set(list.map((m: any) => m.sender_id).filter(Boolean))];
      if (senderIds.length === 0) return list;
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("user_id, display_name, avatar_url")
        .in("user_id", senderIds);
      const profileByUserId = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      return list.map((m: any) => ({
        ...m,
        profiles: profileByUserId.get(m.sender_id) ?? null,
      }));
    },
    enabled: !!conversation_id,
    refetchInterval: 5000,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      conversation_id,
      content,
      attachmentPaths,
    }: {
      conversation_id: string;
      content: string;
      attachmentPaths?: { path: string; filename: string; mime_type?: string }[];
    }) => {
      if (!user) throw new Error("Must be logged in");
      const { data, error } = await supabase
        .from("messages")
        .insert({ conversation_id, sender_id: user.id, content })
        .select()
        .single();
      if (error) throw error;
      if (attachmentPaths?.length) {
        await supabase.from("message_attachments").insert(
          attachmentPaths.map((a) => ({
            message_id: data.id,
            storage_path: a.path,
            filename: a.filename,
            mime_type: a.mime_type,
          }))
        );
      }
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversation_id);
      return data;
    },
    onSuccess: (_, { conversation_id }) => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversation_id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useMarkMessagesRead(conversationId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user || !conversationId) return;
      const { data: msgs } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .neq("sender_id", user.id)
        .eq("status", "sent");
      if (!msgs?.length) return;
      await supabase
        .from("messages")
        .update({ status: "read" })
        .in("id", msgs.map((m) => m.id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
  });
}

export function useStartConversation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ other_user_id, listing_id }: { other_user_id: string; listing_id?: string }) => {
      if (!user) throw new Error("Must be logged in");
      const { data: existingList } = await supabase
        .from("conversations")
        .select("id, listing_id")
        .or(
          `and(participant_a.eq.${user.id},participant_b.eq.${other_user_id}),and(participant_a.eq.${other_user_id},participant_b.eq.${user.id})`
        );
      const targetListingId = listing_id ?? null;
      const match = (existingList || []).find(
        (c: any) => c.listing_id === targetListingId || (c.listing_id == null && targetListingId == null)
      );
      if (match) return match.id;

      const { data, error } = await supabase
        .from("conversations")
        .insert({
          participant_a: user.id,
          participant_b: other_user_id,
          listing_id: targetListingId,
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
