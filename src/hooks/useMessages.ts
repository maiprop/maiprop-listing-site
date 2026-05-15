import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type ConversationCandidate = { id: string; listing_id: string | null };
type StartConversationInput = { other_user_id: string; listing_id?: string };

const getParticipantConversationFilter = (currentUserId: string, otherUserId: string) =>
  `and(participant_a.eq.${currentUserId},participant_b.eq.${otherUserId}),and(participant_a.eq.${otherUserId},participant_b.eq.${currentUserId})`;

const findMatchingConversation = (
  conversations: ConversationCandidate[],
  targetListingId: string | null,
) => conversations.find(
  (conversation) => conversation.listing_id === targetListingId || (conversation.listing_id == null && targetListingId == null),
);

const selectParticipantConversations = async (
  participantFilter: string,
): Promise<ConversationCandidate[]> => {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, listing_id")
    .or(participantFilter);
  if (error) throw error;
  return data ?? [];
};

const insertConversation = async (
  currentUserId: string,
  otherUserId: string,
  targetListingId: string | null,
) => {
  const { data, error } = await supabase.from("conversations")
    .insert({
      participant_a: currentUserId,
      participant_b: otherUserId,
      listing_id: targetListingId,
    })
    .select()
    .single();
  if (error) throw error;
  return data.id;
};

const getReusableConversationId = (
  conversations: ConversationCandidate[],
  targetListingId: string | null,
) => findMatchingConversation(conversations, targetListingId)?.id ?? conversations[0]?.id;

const getFallbackConversationId = async (participantFilter: string) => {
  const { data } = await supabase
    .from("conversations")
    .select("id, listing_id")
    .or(participantFilter);
  return data?.[0]?.id ?? null;
};

const startConversationForUser = async (
  currentUserId: string | undefined,
  { other_user_id, listing_id }: StartConversationInput,
) => {
  if (!currentUserId) throw new Error("Must be logged in");
  if (other_user_id === currentUserId) throw new Error("Cannot start a conversation with yourself");

  const participantFilter = getParticipantConversationFilter(currentUserId, other_user_id);
  const targetListingId = listing_id ?? null;
  const conversations = await selectParticipantConversations(participantFilter);
  const reusableConversationId = getReusableConversationId(conversations, targetListingId);
  if (reusableConversationId) return reusableConversationId;

  try {
    return await insertConversation(currentUserId, other_user_id, targetListingId);
  } catch (error: unknown) {
    const fallbackConversationId = await getFallbackConversationId(participantFilter);
    if (fallbackConversationId) return fallbackConversationId;
    throw error;
  }
};

export function useConversations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`conversations:user:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `participant_a=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations", user.id] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `participant_b=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["conversations", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

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
      list.forEach((c) => {
        if (c.participant_a) userIds.add(c.participant_a);
        if (c.participant_b) userIds.add(c.participant_b);
      });
      // Always return the mapped shape so the return type is a single, not a union —
      // downstream components rely on profile_a / profile_b being present.
      if (userIds.size === 0) {
        return list.map((c) => ({ ...c, profile_a: null, profile_b: null }));
      }
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("user_id, display_name, avatar_url")
        .in("user_id", Array.from(userIds));
      const profileByUserId = new Map((profiles || []).map((p) => [p.user_id, p]));
      return list.map((c) => ({
        ...c,
        profile_a: profileByUserId.get(c.participant_a ?? "") ?? null,
        profile_b: profileByUserId.get(c.participant_b ?? "") ?? null,
      }));
    },
    enabled: !!user,
  });
}

export function useMessages(conversation_id: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversation_id) return;

    const channel = supabase
      .channel(`messages:${conversation_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation_id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", conversation_id] });
          // Also refresh conversations sidebar so last_message_at updates
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation_id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", conversation_id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation_id, queryClient]);

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
      const senderIds = [...new Set(list.map((m) => m.sender_id).filter((id): id is string => !!id))];
      // Always attach the `profiles` field so the query return type is non-union.
      if (senderIds.length === 0) {
        return list.map((m) => ({ ...m, profiles: null }));
      }
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("user_id, display_name, avatar_url")
        .in("user_id", senderIds);
      const profileByUserId = new Map((profiles || []).map((p) => [p.user_id, p]));
      return list.map((m) => ({
        ...m,
        profiles: profileByUserId.get(m.sender_id ?? "") ?? null,
      }));
    },
    enabled: !!conversation_id,
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
       
      const { data, error } = await supabase.from("messages")
        .insert({ conversation_id, sender_id: user.id, content, receiver_id: null })
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
    mutationFn: (input: StartConversationInput) => startConversationForUser(user?.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
