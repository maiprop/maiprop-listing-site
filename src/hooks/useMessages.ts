import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { REALTIME_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import type { Database } from "@/integrations/supabase/types";
import {
  conversationCreateSchema,
  markMessagesReadSchema,
  messageCreateSchema,
  parseMutationInput,
} from "@/lib/mutationSchemas";
import { attachListingReferences } from "@/lib/listingReferences";

type ConversationCandidate = { id: string; listing_id: string | null };
type StartConversationInput = { other_user_id: string; listing_id?: string };
type SendMessageInput = {
  conversation_id: string;
  content: string;
  attachmentPaths?: { path: string; filename: string; mime_type?: string }[];
  client_delivery_id?: string;
};
type CachedMessage = Pick<
  Database["public"]["Tables"]["messages"]["Row"],
  | "id"
  | "client_delivery_id"
  | "content"
  | "created_at"
  | "sender_id"
  | "conversation_id"
  | "status"
> & {
  message_attachments: {
    storage_path: string;
    filename: string;
    mime_type: string | null;
  }[];
  profiles: {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};
type SendMessageContext = {
  optimisticId: string | null;
};
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

const toCachedMessage = (
  message: Database["public"]["Tables"]["messages"]["Row"],
  attachmentPaths: SendMessageInput["attachmentPaths"],
): CachedMessage => ({
  id: message.id,
  client_delivery_id: message.client_delivery_id ?? null,
  content: message.content,
  created_at: message.created_at,
  sender_id: message.sender_id,
  conversation_id: message.conversation_id,
  status: message.status,
  message_attachments: (attachmentPaths ?? []).map((attachment) => ({
    storage_path: attachment.path,
    filename: attachment.filename,
    mime_type: attachment.mime_type ?? null,
  })),
  profiles: null,
});

const reconcileSentMessage = (
  messages: CachedMessage[] | undefined,
  optimisticId: string,
  sentMessage: CachedMessage,
) => {
  const reconciled: CachedMessage[] = [];
  let hasServerMessage = false;

  for (const message of messages ?? []) {
    if (message.id === optimisticId) continue;
    if (message.id === sentMessage.id) {
      if (!hasServerMessage) reconciled.push(message);
      hasServerMessage = true;
      continue;
    }
    reconciled.push(message);
  }

  if (!hasServerMessage) reconciled.push(sentMessage);
  return reconciled;
};

const isOptimisticMessage = (message: Pick<CachedMessage, "id">) =>
  message.id.startsWith("optimistic:");

const representsSameDelivery = (
  pending: Pick<
    CachedMessage,
    "client_delivery_id" | "content" | "conversation_id" | "created_at" | "sender_id"
  >,
  delivered: Pick<
    MessageRow,
    "client_delivery_id" | "content" | "conversation_id" | "created_at" | "sender_id"
  >,
) => {
  if (pending.client_delivery_id || delivered.client_delivery_id) {
    return Boolean(
      pending.client_delivery_id &&
      delivered.client_delivery_id &&
      pending.client_delivery_id === delivered.client_delivery_id,
    );
  }

  if (
    pending.content !== delivered.content ||
    pending.conversation_id !== delivered.conversation_id ||
    pending.sender_id !== delivered.sender_id
  ) {
    return false;
  }

  const pendingAt = Date.parse(pending.created_at);
  const deliveredAt = Date.parse(delivered.created_at);
  return !Number.isFinite(pendingAt) || !Number.isFinite(deliveredAt) ||
    Math.abs(pendingAt - deliveredAt) <= 5 * 60 * 1_000;
};

const appendRealtimeMessage = (
  messages: CachedMessage[] | undefined,
  inserted: MessageRow,
) => {
  if (messages?.some((message) => message.id === inserted.id)) return messages;

  const optimisticIndex = messages?.findIndex((message) =>
    isOptimisticMessage(message) && representsSameDelivery(message, inserted)
  ) ?? -1;
  if (optimisticIndex >= 0 && messages) {
    const optimisticMessage = messages[optimisticIndex];
    const deliveredMessage = toCachedMessage(inserted, []);
    const next = [...messages];
    next[optimisticIndex] = {
      ...deliveredMessage,
      message_attachments: optimisticMessage.message_attachments,
      profiles: optimisticMessage.profiles,
    };
    return next;
  }

  return [...(messages ?? []), toCachedMessage(inserted, [])];
};

const mergeServerMessagesWithPending = (
  serverMessages: CachedMessage[],
  cachedMessages: CachedMessage[] | undefined,
) => {
  const merged = [...serverMessages];
  for (const pending of cachedMessages ?? []) {
    if (!isOptimisticMessage(pending)) continue;

    const deliveredIndex = merged.findIndex((message) =>
      representsSameDelivery(pending, message)
    );
    if (deliveredIndex < 0) {
      merged.push(pending);
      continue;
    }

    if (
      merged[deliveredIndex].message_attachments.length === 0 &&
      pending.message_attachments.length > 0
    ) {
      merged[deliveredIndex] = {
        ...merged[deliveredIndex],
        message_attachments: pending.message_attachments,
      };
    }
  }
  return merged;
};

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
  const payload = parseMutationInput(
    conversationCreateSchema,
    { currentUserId, otherUserId, targetListingId },
    "conversation",
  );
  const { data, error } = await supabase.from("conversations")
    .insert({
      participant_a: payload.currentUserId,
      participant_b: payload.otherUserId,
      listing_id: payload.targetListingId,
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

const requireCurrentUserId = (currentUserId: string | undefined) => {
  if (!currentUserId) throw new Error("Must be logged in");
  return currentUserId;
};

const assertDifferentParticipant = (currentUserId: string, otherUserId: string) => {
  if (otherUserId === currentUserId) throw new Error("Cannot start a conversation with yourself");
};

const createConversationWithFallback = async (
  currentUserId: string,
  otherUserId: string,
  targetListingId: string | null,
  participantFilter: string,
) => {
  try {
    return await insertConversation(currentUserId, otherUserId, targetListingId);
  } catch (error: unknown) {
    const fallbackConversationId = await getFallbackConversationId(participantFilter);
    if (fallbackConversationId) return fallbackConversationId;
    throw error;
  }
};

const startConversationForUser = async (
  currentUserId: string | undefined,
  { other_user_id, listing_id }: StartConversationInput,
) => {
  const userId = requireCurrentUserId(currentUserId);
  assertDifferentParticipant(userId, other_user_id);
  const participantFilter = getParticipantConversationFilter(userId, other_user_id);
  const targetListingId = listing_id ?? null;
  const conversations = await selectParticipantConversations(participantFilter);
  const reusableConversationId = getReusableConversationId(conversations, targetListingId);
  return reusableConversationId
    ?? createConversationWithFallback(userId, other_user_id, targetListingId, participantFilter);
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
          messages(content, created_at, sender_id)
        `)
        .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", {
          referencedTable: "messages",
          ascending: false,
        })
        .limit(1, { referencedTable: "messages" });
      if (convError) throw convError;
      const list = await attachListingReferences(convs ?? []);
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
    staleTime: REALTIME_QUERY_STALE_TIME,
  });
}

export function useMessages(conversation_id: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversation_id) return;
    const queryKey = ["messages", conversation_id] as const;
    let cancelled = false;
    let unsubscribeInitialQuery: (() => void) | null = null;

    const closeInitialQueryGap = () => {
      const activeQuery = queryClient.getQueryCache().find({
        queryKey,
        exact: true,
      });
      if (activeQuery?.state.fetchStatus !== "fetching") {
        void queryClient.invalidateQueries({ queryKey });
        return;
      }

      unsubscribeInitialQuery?.();
      unsubscribeInitialQuery = queryClient.getQueryCache().subscribe((event) => {
        if (event.query !== activeQuery || event.query.state.fetchStatus !== "idle") {
          return;
        }
        unsubscribeInitialQuery?.();
        unsubscribeInitialQuery = null;
        if (!cancelled) {
          void queryClient.refetchQueries({
            queryKey,
            exact: true,
            type: "active",
          });
        }
      });
      void queryClient.invalidateQueries({ queryKey });
    };

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
        (payload) => {
          const inserted = payload.new as MessageRow;
          if (inserted.id && inserted.conversation_id === conversation_id) {
            queryClient.setQueryData<CachedMessage[]>(
              ["messages", conversation_id],
              (messages) => appendRealtimeMessage(messages, inserted),
            );
          }
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
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          closeInitialQueryGap();
        }
      });

    return () => {
      cancelled = true;
      unsubscribeInitialQuery?.();
      unsubscribeInitialQuery = null;
      supabase.removeChannel(channel);
    };
  }, [conversation_id, queryClient]);

  return useQuery({
    queryKey: ["messages", conversation_id],
    queryFn: async () => {
      const queryKey = ["messages", conversation_id] as const;
      const { data: msgs, error } = await supabase
        .from("messages")
        .select("id, client_delivery_id, content, created_at, sender_id, conversation_id, status, message_attachments(storage_path, filename, mime_type)")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const list = msgs || [];
      const senderIds = [...new Set(list.map((m) => m.sender_id).filter((id): id is string => !!id))];
      // Always attach the `profiles` field so the query return type is non-union.
      if (senderIds.length === 0) {
        return mergeServerMessagesWithPending(
          list.map((m) => ({ ...m, profiles: null })),
          queryClient.getQueryData<CachedMessage[]>(queryKey),
        );
      }
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("user_id, display_name, avatar_url")
        .in("user_id", senderIds);
      const profileByUserId = new Map((profiles || []).map((p) => [p.user_id, p]));
      return mergeServerMessagesWithPending(
        list.map((m) => ({
          ...m,
          profiles: profileByUserId.get(m.sender_id ?? "") ?? null,
        })),
        queryClient.getQueryData<CachedMessage[]>(queryKey),
      );
    },
    enabled: !!conversation_id,
    staleTime: REALTIME_QUERY_STALE_TIME,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: SendMessageInput) => {
      if (!user) throw new Error("Must be logged in");
      const clientDeliveryId = input.client_delivery_id ?? crypto.randomUUID();
      input.client_delivery_id = clientDeliveryId;
      const { conversation_id, content, attachmentPaths } = input;
      const payload = parseMutationInput(
        messageCreateSchema,
        { conversation_id, content, attachmentPaths },
        "message",
      );
       
      const { data, error } = await supabase.rpc("send_message_with_attachments", {
        p_conversation_id: payload.conversation_id,
        p_content: payload.content,
        p_client_delivery_id: clientDeliveryId,
        p_attachments: (payload.attachmentPaths ?? []).map((attachment) => ({
          storage_path: attachment.path,
          filename: attachment.filename,
          mime_type: attachment.mime_type ?? null,
        })),
      })
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async (input): Promise<SendMessageContext> => {
      if (!user) return { optimisticId: null };
      const clientDeliveryId = input.client_delivery_id ?? crypto.randomUUID();
      input.client_delivery_id = clientDeliveryId;
      const { conversation_id, content, attachmentPaths } = input;

      const queryKey = ["messages", conversation_id] as const;
      await queryClient.cancelQueries({ queryKey });
      const optimisticId = `optimistic:${crypto.randomUUID()}`;
      const optimisticMessage: CachedMessage = {
        id: optimisticId,
        client_delivery_id: clientDeliveryId,
        conversation_id,
        sender_id: user.id,
        content,
        created_at: new Date().toISOString(),
        status: "sent",
        message_attachments: (attachmentPaths ?? []).map((attachment) => ({
          storage_path: attachment.path,
          filename: attachment.filename,
          mime_type: attachment.mime_type ?? null,
        })),
        profiles: null,
      };
      queryClient.setQueryData<CachedMessage[]>(queryKey, (messages = []) => [
        ...messages,
        optimisticMessage,
      ]);
      return { optimisticId };
    },
    onSuccess: (message, { conversation_id, attachmentPaths }, context) => {
      const optimisticId = context?.optimisticId;
      if (optimisticId) {
        queryClient.setQueryData<CachedMessage[]>(
          ["messages", conversation_id],
          (messages) => reconcileSentMessage(
            messages,
            optimisticId,
            toCachedMessage(message, attachmentPaths),
          ),
        );
      }
    },
    onError: (err: Error, { conversation_id }, context) => {
      if (context?.optimisticId) {
        queryClient.setQueryData<CachedMessage[]>(
          ["messages", conversation_id],
          (messages = []) => messages.filter(
            (message) => message.id !== context.optimisticId,
          ),
        );
      }
      toast.error(err.message);
    },
    onSettled: (_message, _error, { conversation_id }) => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversation_id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
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
      const payload = parseMutationInput(
        markMessagesReadSchema,
        { conversationId, messageIds: msgs.map((m) => m.id) },
        "message read update",
      );
      await supabase
        .from("messages")
        .update({ status: "read" })
        .in("id", payload.messageIds);
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
