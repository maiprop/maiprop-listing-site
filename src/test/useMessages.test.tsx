/**
 * Tests for the hooks exported from `@/hooks/useMessages`. Covers the
 * conversations + messages queries (with profile joins), realtime channel
 * subscribe/unsubscribe, send / mark-read / start-conversation mutations.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const {
  useAuthMock, fromMock, channelMock, removeChannelMock, onMock, subscribeMock, toastMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  fromMock: vi.fn(),
  channelMock: vi.fn(),
  removeChannelMock: vi.fn(),
  onMock: vi.fn(),
  subscribeMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...a: unknown[]) => fromMock(...a),
    channel: (...a: unknown[]) => channelMock(...a),
    removeChannel: (...a: unknown[]) => removeChannelMock(...a),
  },
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkMessagesRead,
  useStartConversation,
} from "@/hooks/useMessages";

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

const buildChannel = () => {
  const chain: Record<string, unknown> = {};
  // .on(...) returns the same chain for further `.on` chains
  onMock.mockImplementation(() => chain);
  // .subscribe() also returns the same chain
  subscribeMock.mockImplementation(() => chain);
  chain.on = onMock;
  chain.subscribe = subscribeMock;
  return chain;
};

beforeEach(() => {
  useAuthMock.mockReset();
  fromMock.mockReset();
  channelMock.mockReset();
  removeChannelMock.mockReset();
  onMock.mockReset();
  subscribeMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
  channelMock.mockReturnValue(buildChannel());
});

describe("useConversations", () => {
  it("subscribes to a channel scoped to the user and unsubscribes on unmount", async () => {
    fromMock.mockReturnValue({ select: () => ({ or: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) });
    const { unmount } = renderHook(() => useConversations(), { wrapper: wrapper() });
    await waitFor(() => expect(channelMock).toHaveBeenCalledWith("conversations:user:u-1"));
    expect(onMock).toHaveBeenCalledTimes(2); // both filters
    expect(subscribeMock).toHaveBeenCalled();
    unmount();
    expect(removeChannelMock).toHaveBeenCalled();
  });

  it("returns empty when there is no user (and skips subscribe)", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useConversations(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(channelMock).not.toHaveBeenCalled();
  });

  it("returns conversations with null profile_a / profile_b when no participants", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: "c-1", participant_a: null, participant_b: null }], error: null });
    fromMock.mockReturnValue({ select: () => ({ or: () => ({ order }) }) });
    const { result } = renderHook(() => useConversations(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: "c-1", participant_a: null, participant_b: null, profile_a: null, profile_b: null },
    ]);
  });

  it("joins participant profiles via profiles_public", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ id: "c-1", participant_a: "p-a", participant_b: "p-b" }],
      error: null,
    });
    const profilesIn = vi.fn().mockResolvedValue({
      data: [{ user_id: "p-a", display_name: "Alice", avatar_url: null }],
      error: null,
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "conversations") return { select: () => ({ or: () => ({ order }) }) };
      if (table === "profiles_public") return { select: () => ({ in: profilesIn }) };
      throw new Error("unexpected " + table);
    });
    const { result } = renderHook(() => useConversations(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const row = (result.current.data as { profile_a: { display_name: string } | null; profile_b: unknown }[])[0];
    expect(row.profile_a?.display_name).toBe("Alice");
    expect(row.profile_b).toBeNull();
  });

  it("propagates supabase errors", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: new Error("denied") });
    fromMock.mockReturnValue({ select: () => ({ or: () => ({ order }) }) });
    const { result } = renderHook(() => useConversations(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useMessages", () => {
  it("subscribes to the conversation channel and unsubscribes on unmount", async () => {
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) });
    const { unmount } = renderHook(() => useMessages("conv-1"), { wrapper: wrapper() });
    await waitFor(() => expect(channelMock).toHaveBeenCalledWith("messages:conv-1"));
    expect(onMock).toHaveBeenCalledTimes(2); // INSERT + UPDATE
    unmount();
    expect(removeChannelMock).toHaveBeenCalled();
  });

  it("attaches null profiles when there are no senders", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: "m-1", sender_id: null, content: "hi" }], error: null });
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ order }) }) });
    const { result } = renderHook(() => useMessages("conv-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const row = (result.current.data as { profiles: unknown }[])[0];
    expect(row.profiles).toBeNull();
  });

  it("joins sender profiles via profiles_public.in()", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: "m-1", sender_id: "u-2", content: "hi" }], error: null });
    const profilesIn = vi.fn().mockResolvedValue({
      data: [{ user_id: "u-2", display_name: "Bob", avatar_url: null }],
      error: null,
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "messages") return { select: () => ({ eq: () => ({ order }) }) };
      if (table === "profiles_public") return { select: () => ({ in: profilesIn }) };
      throw new Error("unexpected " + table);
    });
    const { result } = renderHook(() => useMessages("conv-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const row = (result.current.data as { profiles: { display_name: string } | null }[])[0];
    expect(row.profiles?.display_name).toBe("Bob");
  });
});

describe("useSendMessage", () => {
  it("inserts message + attachments + bumps last_message_at", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "m-new" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insertMessage = vi.fn().mockReturnValue({ select });
    const insertAttach = vi.fn().mockResolvedValue({ error: null });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    fromMock.mockImplementation((table: string) => {
      if (table === "messages") return { insert: insertMessage };
      if (table === "message_attachments") return { insert: insertAttach };
      if (table === "conversations") return { update };
      throw new Error("unexpected " + table);
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        conversation_id: "c-1",
        content: "Hey there",
        attachmentPaths: [{ path: "p/a.png", filename: "a.png", mime_type: "image/png" }],
      });
    });
    expect(insertMessage).toHaveBeenCalledWith({
      conversation_id: "c-1",
      sender_id: "u-1",
      content: "Hey there",
      receiver_id: null,
    });
    expect(insertAttach).toHaveBeenCalledWith([
      { message_id: "m-new", storage_path: "p/a.png", filename: "a.png", mime_type: "image/png" },
    ]);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ last_message_at: expect.any(String) }));
    expect(eq).toHaveBeenCalledWith("id", "c-1");
  });

  it("rejects + toasts when no user", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useSendMessage(), { wrapper: wrapper() });
    await act(async () => {
      await result.current
        .mutateAsync({ conversation_id: "c", content: "x" })
        .catch(() => {});
    });
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/logged in/i));
  });

  it("works without attachments (skips message_attachments insert)", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "m-new" }, error: null });
    const insertMessage = vi.fn().mockReturnValue({ select: () => ({ single }) });
    const insertAttach = vi.fn();
    const eq = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "messages") return { insert: insertMessage };
      if (table === "message_attachments") return { insert: insertAttach };
      if (table === "conversations") return { update: () => ({ eq }) };
      throw new Error("unexpected " + table);
    });
    const { result } = renderHook(() => useSendMessage(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ conversation_id: "c-1", content: "no-attach" });
    });
    expect(insertAttach).not.toHaveBeenCalled();
  });
});

describe("useMarkMessagesRead", () => {
  it("noop when no msgs to mark (early returns)", async () => {
    const eq2 = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const neq = vi.fn().mockReturnValue({ eq: eq1 });
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ neq }) }) });
    const { result } = renderHook(() => useMarkMessagesRead("c-1"), { wrapper: wrapper() });
    await act(async () => { await result.current.mutateAsync(); });
    // No update call — no second .from for "messages" with .update
    expect(fromMock).toHaveBeenCalledWith("messages");
  });

  it("updates status:read for unread messages from other senders", async () => {
    const sentEq = vi.fn().mockResolvedValue({ data: [{ id: "m-1" }, { id: "m-2" }], error: null });
    const inFn = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation((_t: string) => ({
      select: () => ({ eq: () => ({ neq: () => ({ eq: sentEq }) }) }),
      update: () => ({ in: inFn }),
    }));
    const { result } = renderHook(() => useMarkMessagesRead("c-1"), { wrapper: wrapper() });
    await act(async () => { await result.current.mutateAsync(); });
    expect(inFn).toHaveBeenCalledWith("id", ["m-1", "m-2"]);
  });
});

describe("useStartConversation", () => {
  it("returns the existing conversation id when one already exists", async () => {
    const or = vi.fn().mockResolvedValue({
      data: [
        { id: "c-existing", listing_id: "l-1" },
        { id: "c-other", listing_id: "l-2" },
      ],
    });
    fromMock.mockReturnValue({ select: () => ({ or }) });
    const { result } = renderHook(() => useStartConversation(), { wrapper: wrapper() });
    let id: string | undefined;
    await act(async () => {
      id = await result.current.mutateAsync({ other_user_id: "u-2", listing_id: "l-1" });
    });
    expect(id).toBe("c-existing");
  });

  it("creates a new conversation when none matches", async () => {
    const or = vi.fn().mockResolvedValue({ data: [] });
    const single = vi.fn().mockResolvedValue({ data: { id: "c-new" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    fromMock.mockImplementation((_t: string) => ({ select: () => ({ or }), insert }));
    const { result } = renderHook(() => useStartConversation(), { wrapper: wrapper() });
    let id: string | undefined;
    await act(async () => {
      id = await result.current.mutateAsync({ other_user_id: "u-2" });
    });
    expect(insert).toHaveBeenCalledWith({
      participant_a: "u-1",
      participant_b: "u-2",
      listing_id: null,
    });
    expect(id).toBe("c-new");
  });

  it("reuses an existing participant thread when the requested listing differs", async () => {
    const or = vi.fn().mockResolvedValue({
      data: [{ id: "c-existing-pair", listing_id: "l-other" }],
      error: null,
    });
    const insert = vi.fn();
    fromMock.mockReturnValue({ select: () => ({ or }), insert });
    const { result } = renderHook(() => useStartConversation(), { wrapper: wrapper() });

    let id: string | undefined;
    await act(async () => {
      id = await result.current.mutateAsync({ other_user_id: "u-2", listing_id: "l-new" });
    });

    expect(insert).not.toHaveBeenCalled();
    expect(id).toBe("c-existing-pair");
  });

  it("rejects self-contact before writing a conversation", async () => {
    const from = vi.fn();
    fromMock.mockImplementation(from);
    const { result } = renderHook(() => useStartConversation(), { wrapper: wrapper() });

    await expect(
      result.current.mutateAsync({ other_user_id: "u-1", listing_id: "l-1" }),
    ).rejects.toThrow(/yourself/i);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects when there is no user", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useStartConversation(), { wrapper: wrapper() });
    await expect(
      result.current.mutateAsync({ other_user_id: "u-2" }),
    ).rejects.toThrow(/logged in/i);
  });
});
