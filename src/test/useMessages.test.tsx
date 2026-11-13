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
  useAuthMock, fromMock, rpcMock, channelMock, removeChannelMock, onMock, subscribeMock, toastMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
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
    rpc: (...a: unknown[]) => rpcMock(...a),
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
import {
  accountQueryKey,
  resetIdentityQueryStateForTests,
  transitionQueryIdentity,
  transitionQueryAuthorization,
} from "@/lib/identityQueryBoundary";

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return wrapperWithClient(client);
};

const wrapperWithClient = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const existingMessage = {
  id: "m-existing",
  client_delivery_id: null,
  conversation_id: "c-1",
  sender_id: "u-2",
  content: "Earlier",
  created_at: "2026-07-14T08:00:00.000Z",
  status: "sent",
  message_attachments: [],
  profiles: null,
};

const serverMessage = {
  id: "m-server",
  client_delivery_id: null,
  conversation_id: "c-1",
  sender_id: "u-1",
  receiver_id: null,
  content: "Optimistic hello",
  created_at: "2026-07-14T09:00:00.000Z",
  read_at: null,
  status: "sent",
};

const messageQueryKey = (conversationId: string) =>
  accountQueryKey("u-1", "messages", conversationId);
const conversationsQueryKey = accountQueryKey("u-1", "conversations");

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

const conversationQuery = (result: { data: unknown; error: Error | null }) => {
  const limit = vi.fn().mockResolvedValue(result);
  const nestedOrder = vi.fn().mockReturnValue({ limit });
  const rootOrder = vi.fn().mockReturnValue({ order: nestedOrder });
  return { select: () => ({ or: () => ({ order: rootOrder }) }) };
};

beforeEach(() => {
  resetIdentityQueryStateForTests();
  useAuthMock.mockReset();
  fromMock.mockReset();
  rpcMock.mockReset();
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
    fromMock.mockReturnValue(conversationQuery({ data: [], error: null }));
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
    fromMock.mockReturnValue(conversationQuery({
      data: [{ id: "c-1", participant_a: null, participant_b: null }],
      error: null,
    }));
    const { result } = renderHook(() => useConversations(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      {
        id: "c-1",
        participant_a: null,
        participant_b: null,
        listings: null,
        profile_a: null,
        profile_b: null,
      },
    ]);
  });

  it("joins participant profiles via profiles_public", async () => {
    const queryResult = {
      data: [{ id: "c-1", participant_a: "p-a", participant_b: "p-b" }],
      error: null,
    };
    const profilesIn = vi.fn().mockResolvedValue({
      data: [{ user_id: "p-a", display_name: "Alice", avatar_url: null }],
      error: null,
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "conversations") return conversationQuery(queryResult);
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
    fromMock.mockReturnValue(conversationQuery({ data: null, error: new Error("denied") }));
    const { result } = renderHook(() => useConversations(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useMessages", () => {
  it("scopes message data to the authenticated account", async () => {
    const client = createQueryClient();
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useMessages("conv-1"), {
      wrapper: wrapperWithClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryState(
      accountQueryKey("u-1", "messages", "conv-1"),
    )).toBeDefined();
    expect(client.getQueryState(["messages", "conv-1"])).toBeUndefined();
  });

  it("ignores a realtime callback captured before an account transition", async () => {
    const client = createQueryClient();
    transitionQueryIdentity(client, "u-1");
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useMessages("c-1"), {
      wrapper: wrapperWithClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const insertSubscription = onMock.mock.calls.find(
      ([kind, filter]) => kind === "postgres_changes" && filter?.event === "INSERT",
    );

    transitionQueryIdentity(client, "u-2");
    const accountBKey = accountQueryKey("u-2", "messages", "c-1");
    client.setQueryData(accountBKey, [{ id: "account-b-message" }]);
    act(() => {
      (insertSubscription?.[2] as (payload: { new: typeof serverMessage }) => void)({
        new: serverMessage,
      });
    });

    expect(client.getQueryData(accountBKey)).toEqual([{ id: "account-b-message" }]);
    expect(client.getQueryState(accountQueryKey("u-1", "messages", "c-1")))
      .toBeUndefined();
  });

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

  it("invalidates the recipient cache when a message arrives through realtime", async () => {
    const client = createQueryClient();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }),
      }),
    });

    const { result } = renderHook(() => useMessages("c-1"), {
      wrapper: wrapperWithClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const insertSubscription = onMock.mock.calls.find(
      ([kind, filter]) => kind === "postgres_changes" && filter?.event === "INSERT",
    );
    expect(insertSubscription).toBeDefined();

    act(() => {
      (insertSubscription?.[2] as (payload: { new: typeof serverMessage }) => void)({
        new: serverMessage,
      });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: messageQueryKey("c-1") });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: conversationsQueryKey,
    });
  });

  it("refetches once when realtime becomes subscribed to close the initial-query gap", async () => {
    const client = createQueryClient();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }),
      }),
    });

    renderHook(() => useMessages("c-1"), {
      wrapper: wrapperWithClient(client),
    });
    await waitFor(() => expect(subscribeMock).toHaveBeenCalled());

    const onStatus = subscribeMock.mock.calls[0]?.[0] as
      | ((status: string) => void)
      | undefined;
    act(() => onStatus?.("SUBSCRIBED"));

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: messageQueryKey("c-1"),
    });
  });

  it("performs a post-subscription fetch when the initial message query is still in flight", async () => {
    const client = createQueryClient();
    const initial = deferred<{ data: []; error: null }>();
    const order = vi.fn()
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce({ data: [], error: null });
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ order }) }),
    });

    renderHook(() => useMessages("c-1"), {
      wrapper: wrapperWithClient(client),
    });
    await waitFor(() => expect(order).toHaveBeenCalledTimes(1));
    const onStatus = subscribeMock.mock.calls[0]?.[0] as
      | ((status: string) => void)
      | undefined;

    act(() => onStatus?.("SUBSCRIBED"));
    initial.resolve({ data: [], error: null });

    await waitFor(() => expect(order).toHaveBeenCalledTimes(2));
  });

  it("adds realtime inserts to the active recipient cache immediately", async () => {
    const client = createQueryClient();
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }),
      }),
    });

    const { result } = renderHook(() => useMessages("c-1"), {
      wrapper: wrapperWithClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const insertSubscription = onMock.mock.calls.find(
      ([kind, filter]) => kind === "postgres_changes" && filter?.event === "INSERT",
    );
    act(() => {
      (insertSubscription?.[2] as (payload: { new: typeof serverMessage }) => void)({
        new: serverMessage,
      });
    });

    expect(client.getQueryData<Array<{ id: string }>>(messageQueryKey("c-1")))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: "m-server" })]));
  });

  it("replaces the matching optimistic message when realtime arrives before the mutation response", async () => {
    const client = createQueryClient();
    const queryResult = deferred<{ data: typeof existingMessage[]; error: null }>();
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({ order: vi.fn().mockReturnValue(queryResult.promise) }),
      }),
    });
    client.setQueryData(messageQueryKey("c-1"), [
      existingMessage,
      {
        ...serverMessage,
        id: "optimistic:pending-send",
        created_at: "2026-07-14T08:59:59.000Z",
        message_attachments: [{
          storage_path: "u-1/c-1/report.pdf",
          filename: "report.pdf",
          mime_type: "application/pdf",
        }],
        profiles: null,
      },
    ]);

    const view = renderHook(() => useMessages("c-1"), {
      wrapper: wrapperWithClient(client),
    });
    await waitFor(() => expect(subscribeMock).toHaveBeenCalled());
    const insertSubscription = onMock.mock.calls.find(
      ([, filter]) => (filter as { event?: string } | undefined)?.event === "INSERT",
    );

    act(() => {
      (insertSubscription?.[2] as (payload: { new: typeof serverMessage }) => void)({
        new: serverMessage,
      });
    });

    const cached = client.getQueryData<Array<{
      id: string;
      message_attachments: Array<{ filename: string }>;
    }>>(messageQueryKey("c-1"));
    expect(cached?.filter((message) => message.id === "m-server")).toHaveLength(1);
    expect(cached?.some((message) => message.id.startsWith("optimistic:"))).toBe(false);
    expect(cached?.find((message) => message.id === "m-server")?.message_attachments)
      .toEqual([expect.objectContaining({ filename: "report.pdf" })]);

    view.unmount();
    queryResult.resolve({ data: [], error: null });
  });

  it("reconciles repeated identical sends by client delivery identity", async () => {
    const client = createQueryClient();
    const queryResult = deferred<{ data: []; error: null }>();
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({ order: vi.fn().mockReturnValue(queryResult.promise) }),
      }),
    });
    const firstDeliveryId = "00000000-0000-4000-8000-000000000011";
    const secondDeliveryId = "00000000-0000-4000-8000-000000000012";
    client.setQueryData(messageQueryKey("c-1"), [
      {
        ...serverMessage,
        id: "optimistic:first",
        client_delivery_id: firstDeliveryId,
        message_attachments: [],
        profiles: null,
      },
      {
        ...serverMessage,
        id: "optimistic:second",
        client_delivery_id: secondDeliveryId,
        message_attachments: [],
        profiles: null,
      },
    ]);

    const view = renderHook(() => useMessages("c-1"), {
      wrapper: wrapperWithClient(client),
    });
    await waitFor(() => expect(subscribeMock).toHaveBeenCalled());
    const insertSubscription = onMock.mock.calls.find(
      ([, filter]) => (filter as { event?: string } | undefined)?.event === "INSERT",
    );

    act(() => {
      (insertSubscription?.[2] as (payload: { new: typeof serverMessage & {
        client_delivery_id: string;
      } }) => void)({
        new: { ...serverMessage, client_delivery_id: secondDeliveryId },
      });
    });

    const cached = client.getQueryData<Array<{
      id: string;
      client_delivery_id: string | null;
    }>>(messageQueryKey("c-1"));
    expect(cached).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "optimistic:first", client_delivery_id: firstDeliveryId }),
      expect.objectContaining({ id: "m-server", client_delivery_id: secondDeliveryId }),
    ]));
    expect(cached?.some((message) => message.id === "optimistic:second")).toBe(false);

    view.unmount();
    queryResult.resolve({ data: [], error: null });
  });

  it("keeps unmatched optimistic messages when a server refetch completes", async () => {
    const client = createQueryClient();
    const optimisticMessage = {
      ...serverMessage,
      id: "optimistic:still-pending",
      content: "Still pending",
      created_at: "2026-07-14T09:01:00.000Z",
      message_attachments: [],
      profiles: null,
    };
    client.setQueryData(messageQueryKey("c-1"), [existingMessage, optimisticMessage]);
    fromMock.mockImplementation((table: string) => {
      if (table === "messages") {
        return {
          select: () => ({
            eq: () => ({
              order: vi.fn().mockResolvedValue({ data: [existingMessage], error: null }),
            }),
          }),
        };
      }
      if (table === "profiles_public") {
        return {
          select: () => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }),
        };
      }
      throw new Error("unexpected " + table);
    });

    const { result } = renderHook(() => useMessages("c-1"), {
      wrapper: wrapperWithClient(client),
    });
    await act(async () => {
      await result.current.refetch();
    });

    expect(client.getQueryData<Array<{ id: string }>>(messageQueryKey("c-1")))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "m-existing" }),
        expect.objectContaining({ id: "optimistic:still-pending" }),
      ]));
  });
});

describe("useSendMessage", () => {
  it("does not dispatch an A send after query cancellation yields to account C", async () => {
    const client = createQueryClient();
    const cancellation = deferred<void>();
    const cancelQueries = vi.spyOn(client, "cancelQueries")
      .mockImplementationOnce(() => cancellation.promise);
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: wrapperWithClient(client),
    });
    let mutation!: Promise<unknown>;
    act(() => {
      mutation = result.current.mutateAsync({
        conversation_id: "a-conv",
        content: "A's pending message",
      });
    });
    await waitFor(() => expect(cancelQueries).toHaveBeenCalled());
    act(() => { transitionQueryIdentity(client, "u-2"); });
    cancellation.resolve();
    await act(async () => { await mutation.catch(() => undefined); });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("does not recreate an optimistic A message after A to C to A during cancellation", async () => {
    const client = createQueryClient();
    transitionQueryIdentity(client, "u-1");
    const cancellation = deferred<void>();
    const cancelQueries = vi.spyOn(client, "cancelQueries")
      .mockImplementationOnce(() => cancellation.promise);
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: wrapperWithClient(client),
    });
    let mutation!: Promise<unknown>;
    act(() => {
      mutation = result.current.mutateAsync({
        conversation_id: "a-conv",
        content: "A's interrupted message",
      });
    });
    await waitFor(() => expect(cancelQueries).toHaveBeenCalled());
    act(() => {
      transitionQueryIdentity(client, "u-2");
      transitionQueryIdentity(client, "u-1");
    });
    expect(client.getQueryData(messageQueryKey("a-conv"))).toBeUndefined();
    cancellation.resolve();
    await act(async () => { await mutation.catch(() => undefined); });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(client.getQueryData(messageQueryKey("a-conv"))).toBeUndefined();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("adds the sender message to the cache before atomic delivery resolves", async () => {
    const client = createQueryClient();
    const delivery = deferred<{ data: typeof serverMessage; error: null }>();
    rpcMock.mockReturnValue({ single: vi.fn().mockReturnValue(delivery.promise) });
    client.setQueryData(messageQueryKey("c-1"), [existingMessage]);

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: wrapperWithClient(client),
    });
    let mutation!: Promise<typeof serverMessage>;
    act(() => {
      mutation = result.current.mutateAsync({
        conversation_id: "c-1",
        content: "Optimistic hello",
      });
    });

    await waitFor(() => {
      const cached = client.getQueryData<Array<{
        id: string;
        content: string;
        client_delivery_id: string | null;
      }>>(messageQueryKey("c-1"));
      expect(cached).toHaveLength(2);
      expect(cached?.[1]).toMatchObject({
        id: expect.stringMatching(/^optimistic:/),
        conversation_id: "c-1",
        sender_id: "u-1",
        content: "Optimistic hello",
        status: "sent",
        client_delivery_id: expect.any(String),
      });
      expect(rpcMock).toHaveBeenCalledWith(
        "send_message_with_attachments",
        expect.objectContaining({
          p_conversation_id: "c-1",
          p_content: "Optimistic hello",
          p_client_delivery_id: cached?.[1].client_delivery_id,
          p_attachments: [],
        }),
      );
    });

    const deliveryId = (rpcMock.mock.calls[0][1] as { p_client_delivery_id: string })
      .p_client_delivery_id;
    delivery.resolve({
      data: { ...serverMessage, client_delivery_id: deliveryId },
      error: null,
    });
    await act(async () => {
      await mutation;
    });
  });

  it("reconciles an optimistic message with realtime and mutation results without duplicates", async () => {
    const client = createQueryClient();
    const delivery = deferred<{ data: typeof serverMessage; error: null }>();
    rpcMock.mockReturnValue({ single: vi.fn().mockReturnValue(delivery.promise) });
    client.setQueryData(messageQueryKey("c-1"), [existingMessage]);

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: wrapperWithClient(client),
    });
    let mutation!: Promise<typeof serverMessage>;
    act(() => {
      mutation = result.current.mutateAsync({
        conversation_id: "c-1",
        content: "Optimistic hello",
      });
    });
    await waitFor(() => {
      const cached = client.getQueryData<Array<{ id: string }>>(messageQueryKey("c-1"));
      expect(cached?.some((message) => message.id.startsWith("optimistic:"))).toBe(true);
    });

    client.setQueryData<Array<Record<string, unknown>>>(messageQueryKey("c-1"), (cached = []) => [
      ...cached,
      { ...serverMessage, message_attachments: [], profiles: null },
    ]);
    delivery.resolve({ data: serverMessage, error: null });
    await act(async () => {
      await mutation;
    });

    const reconciled = client.getQueryData<Array<{ id: string }>>(messageQueryKey("c-1"));
    expect(reconciled?.filter((message) => message.id === "m-server")).toHaveLength(1);
    expect(reconciled?.some((message) => message.id.startsWith("optimistic:"))).toBe(false);
  });

  it("removes the optimistic message when atomic delivery fails", async () => {
    const client = createQueryClient();
    const delivery = deferred<{ data: null; error: Error }>();
    rpcMock.mockReturnValue({ single: vi.fn().mockReturnValue(delivery.promise) });
    client.setQueryData(messageQueryKey("c-1"), [existingMessage]);

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: wrapperWithClient(client),
    });
    let mutation!: Promise<unknown>;
    act(() => {
      mutation = result.current.mutateAsync({
        conversation_id: "c-1",
        content: "Will fail",
      });
    });
    await waitFor(() => {
      const cached = client.getQueryData<Array<{ id: string }>>(messageQueryKey("c-1"));
      expect(cached?.some((message) => message.id.startsWith("optimistic:"))).toBe(true);
    });

    delivery.resolve({ data: null, error: new Error("delivery denied") });
    await act(async () => {
      await mutation.catch(() => undefined);
    });

    expect(client.getQueryData(messageQueryKey("c-1"))).toEqual([existingMessage]);
    expect(toastMock.error).toHaveBeenCalledWith("delivery denied");
  });

  it("removes only the failed optimistic message when sends overlap", async () => {
    const client = createQueryClient();
    const firstInsert = deferred<{ data: null; error: Error }>();
    const secondInsert = deferred<{ data: typeof serverMessage; error: null }>();
    let deliveryCall = 0;
    rpcMock.mockImplementation(() => ({
      single: vi.fn().mockImplementation(() => {
        deliveryCall += 1;
        return deliveryCall === 1 ? firstInsert.promise : secondInsert.promise;
      }),
    }));
    client.setQueryData(messageQueryKey("c-1"), [existingMessage]);

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: wrapperWithClient(client),
    });
    let failedMutation!: Promise<unknown>;
    let successfulMutation!: Promise<typeof serverMessage>;
    act(() => {
      failedMutation = result.current.mutateAsync({
        conversation_id: "c-1",
        content: "First fails",
      });
      successfulMutation = result.current.mutateAsync({
        conversation_id: "c-1",
        content: "Second survives",
      });
    });

    await waitFor(() => {
      const cached = client.getQueryData<Array<{ id: string; content: string }>>(messageQueryKey("c-1"));
      expect(cached?.filter((message) => message.id.startsWith("optimistic:"))).toHaveLength(2);
    });

    firstInsert.resolve({ data: null, error: new Error("first denied") });
    await act(async () => {
      await failedMutation.catch(() => undefined);
    });

    const afterFailure = client.getQueryData<Array<{ id: string; content: string }>>(messageQueryKey("c-1"));
    expect(afterFailure?.some((message) => message.content === "Second survives")).toBe(true);

    secondInsert.resolve({
      data: { ...serverMessage, id: "m-second", content: "Second survives" },
      error: null,
    });
    await act(async () => {
      await successfulMutation;
    });
  });

  it("delivers message and attachment metadata through one RPC", async () => {
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { ...serverMessage, id: "m-new" }, error: null }),
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        conversation_id: "c-1",
        content: "Hey there",
        attachmentPaths: [{ path: "p/a.png", filename: "a.png", mime_type: "image/png" }],
      });
    });
    expect(rpcMock).toHaveBeenCalledWith("send_message_with_attachments", {
      p_conversation_id: "c-1",
      p_content: "Hey there",
      p_client_delivery_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      p_attachments: [
        { storage_path: "p/a.png", filename: "a.png", mime_type: "image/png" },
      ],
    });
  });

  it("rejects + toasts when no user", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const client = createQueryClient();
    const setQueryData = vi.spyOn(client, "setQueryData");
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: wrapperWithClient(client),
    });
    await act(async () => {
      await result.current
        .mutateAsync({ conversation_id: "c", content: "x" })
        .catch(() => {});
    });
    expect(setQueryData).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/logged in/i));
  });

  it("sends an empty attachment array when no files are attached", async () => {
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { ...serverMessage, id: "m-new" }, error: null }),
    });
    const { result } = renderHook(() => useSendMessage(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ conversation_id: "c-1", content: "no-attach" });
    });
    expect(rpcMock).toHaveBeenCalledWith(
      "send_message_with_attachments",
      expect.objectContaining({ p_attachments: [] }),
    );
  });
});

describe("useMarkMessagesRead", () => {
  const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: "read-id-" + i }));
  type SelectResult = { data: { id: string }[] | null; error: Error | null };
  const transport = (selection: SelectResult | Promise<SelectResult>) => {
    const sent = vi.fn().mockResolvedValue(selection);
    const sender = vi.fn().mockReturnValue({ eq: sent });
    const conversation = vi.fn().mockReturnValue({ neq: sender });
    const select = vi.fn().mockReturnValue({ eq: conversation });
    const write = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ in: write });
    fromMock.mockReturnValue({ select, update });
    return { select, conversation, sender, sent, update, write };
  };
  const setup = (conversationId = "c-1") => {
    const client = createQueryClient();
    transitionQueryIdentity(client, "u-1");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const hook = renderHook(({ id }) => useMarkMessagesRead(id), {
      initialProps: { id: conversationId }, wrapper: wrapperWithClient(client),
    });
    return { ...hook, client, invalidate };
  };
  const outcome = (promise: Promise<unknown>) => promise.then(
    value => ({ value, error: null }), error => ({ value: undefined, error }),
  );

  it("successful empty SELECT writes nothing and invalidates only the initiating exact message key", async () => {
    const sdk = transport({ data: [], error: null });
    const { result, invalidate } = setup();
    await act(async () => { await result.current.mutateAsync(); });
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(sdk.update).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: messageQueryKey("c-1"), exact: true });
  });

  it("surfaces a resolved SELECT error without writing or success invalidation", async () => {
    const error = new Error("receipt SELECT denied");
    const sdk = transport({ data: null, error });
    const { result, invalidate } = setup();
    await act(async () => { await expect(result.current.mutateAsync()).rejects.toBe(error); });
    await waitFor(() => expect(result.current.error).toBe(error));
    expect(sdk.select).toHaveBeenCalledWith("id");
    expect(sdk.conversation).toHaveBeenCalledWith("conversation_id", "c-1");
    expect(sdk.sender).toHaveBeenCalledWith("sender_id", "u-1");
    expect(sdk.sent).toHaveBeenCalledWith("status", "sent");
    expect(sdk.update).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("surfaces a resolved UPDATE error with unchanged SELECT scope, payload and IDs", async () => {
    const error = new Error("receipt UPDATE denied");
    const sdk = transport({ data: [{ id: "m-1" }, { id: "m-2" }], error: null });
    sdk.write.mockResolvedValue({ error });
    const { result, invalidate } = setup();
    await act(async () => { await expect(result.current.mutateAsync()).rejects.toBe(error); });
    await waitFor(() => expect(result.current.error).toBe(error));
    expect(sdk.select).toHaveBeenCalledWith("id");
    expect(sdk.conversation).toHaveBeenCalledWith("conversation_id", "c-1");
    expect(sdk.sender).toHaveBeenCalledWith("sender_id", "u-1");
    expect(sdk.sent).toHaveBeenCalledWith("status", "sent");
    expect(sdk.update).toHaveBeenCalledExactlyOnceWith({ status: "read" });
    expect(sdk.write).toHaveBeenCalledExactlyOnceWith("id", ["m-1", "m-2"]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("retains the small successful write and exact initiating invalidation", async () => {
    const sdk = transport({ data: [{ id: "m-1" }, { id: "m-2" }], error: null });
    const { result, invalidate } = setup();
    await act(async () => { await result.current.mutateAsync(); });
    expect(sdk.update).toHaveBeenCalledExactlyOnceWith({ status: "read" });
    expect(sdk.write).toHaveBeenCalledExactlyOnceWith("id", ["m-1", "m-2"]);
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: messageQueryKey("c-1"), exact: true });
  });

  it("writes all 251 returned IDs exactly once in batches of at most 250", async () => {
    const selected = rows(251);
    const sdk = transport({ data: selected, error: null });
    const { result, invalidate } = setup();
    await act(async () => { await result.current.mutateAsync(); });
    expect(sdk.write).toHaveBeenCalledTimes(2);
    const batches = sdk.write.mock.calls.map((call: unknown[]) => call[1] as string[]);
    expect(batches.map(batch => batch.length)).toEqual([250, 1]);
    expect(batches.flat()).toEqual(selected.map(row => row.id));
    expect(new Set(batches.flat()).size).toBe(251);
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: messageQueryKey("c-1"), exact: true });
  });

  it("stops 501 IDs on the second batch error without a third write or success invalidation", async () => {
    const selected = rows(501);
    const error = new Error("second batch rejected");
    const sdk = transport({ data: selected, error: null });
    sdk.write.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error });
    const { result, invalidate } = setup();
    await act(async () => { await expect(result.current.mutateAsync()).rejects.toBe(error); });
    expect(sdk.write).toHaveBeenCalledTimes(2);
    expect(sdk.write.mock.calls.map((call: unknown[]) => call[1])).toEqual([
      selected.slice(0, 250).map(row => row.id), selected.slice(250, 500).map(row => row.id),
    ]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("validates every batch before any write when a later row ID is malformed", async () => {
    const sdk = transport({ data: [...rows(250), { id: "" }], error: null });
    const { result, invalidate } = setup();
    await act(async () => { await expect(result.current.mutateAsync()).rejects.toThrow(); });
    expect(sdk.update).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not start transport from an already stale render epoch", async () => {
    transport({ data: rows(1), error: null });
    const { result, client, invalidate } = setup();
    const initiate = result.current.mutateAsync;
    transitionQueryAuthorization(client, "u-1", "new-permissions");
    await act(async () => { await outcome(initiate()); });
    expect(fromMock).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it.each(["actor", "authorization"] as const)("stops after SELECT when the real %s epoch transitions", async (change) => {
    const selection = deferred<SelectResult>();
    const sdk = transport(selection.promise);
    const { result, client, invalidate, rerender } = setup();
    let pending!: ReturnType<typeof outcome>;
    act(() => { pending = outcome(result.current.mutateAsync()); });
    await waitFor(() => expect(sdk.sent).toHaveBeenCalledTimes(1));
    act(() => {
      if (change === "actor") {
        transitionQueryIdentity(client, "u-2");
        useAuthMock.mockReturnValue({ user: { id: "u-2" } });
      } else {
        transitionQueryAuthorization(client, "u-1", "profile-hydrated");
      }
      rerender({ id: "c-1" });
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    await act(async () => { selection.resolve({ data: rows(1), error: null }); await pending; });
    expect(sdk.update).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(false);
  });

  it("does not dispatch a second batch after an actor switch during the first UPDATE", async () => {
    const firstWrite = deferred<{ error: Error | null }>();
    const sdk = transport({ data: rows(251), error: null });
    sdk.write.mockReturnValueOnce(firstWrite.promise);
    const { result, client, invalidate, rerender } = setup();
    let pending!: ReturnType<typeof outcome>;
    act(() => { pending = outcome(result.current.mutateAsync()); });
    await waitFor(() => expect(sdk.write).toHaveBeenCalledTimes(1));
    act(() => {
      transitionQueryIdentity(client, "u-2");
      useAuthMock.mockReturnValue({ user: { id: "u-2" } });
      rerender({ id: "c-1" });
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    await act(async () => { firstWrite.resolve({ error: null }); await pending; });
    expect(sdk.write).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("keeps a same-actor conversation A completion owned by A after selecting B", async () => {
    const firstWrite = deferred<{ error: Error | null }>();
    const sdk = transport({ data: rows(1), error: null });
    sdk.write.mockReturnValueOnce(firstWrite.promise);
    const { result, invalidate, rerender } = setup("conversation-A");
    let pending!: ReturnType<typeof outcome>;
    act(() => { pending = outcome(result.current.mutateAsync()); });
    await waitFor(() => expect(sdk.write).toHaveBeenCalledTimes(1));
    rerender({ id: "conversation-B" });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    await act(async () => { firstWrite.resolve({ error: null }); expect((await pending).error).toBeNull(); });
    expect(sdk.conversation).toHaveBeenCalledExactlyOnceWith("conversation_id", "conversation-A");
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: messageQueryKey("conversation-A"), exact: true });
    expect(result.current.isPending).toBe(false);
  });

  it("keeps B pending while detached A settles and invalidates only A", async () => {
    const firstWrite = deferred<{ error: Error | null }>();
    const secondWrite = deferred<{ error: Error | null }>();
    const sdk = transport({ data: rows(1), error: null });
    sdk.write.mockReturnValueOnce(firstWrite.promise).mockReturnValueOnce(secondWrite.promise);
    const { result, invalidate, rerender } = setup("conversation-A");
    let pendingA!: ReturnType<typeof outcome>;
    let pendingB!: ReturnType<typeof outcome>;
    act(() => { pendingA = outcome(result.current.mutateAsync()); });
    await waitFor(() => expect(sdk.write).toHaveBeenCalledTimes(1));
    rerender({ id: "conversation-B" });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    act(() => { pendingB = outcome(result.current.mutateAsync()); });
    await waitFor(() => expect(sdk.write).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isPending).toBe(true));
    await act(async () => { firstWrite.resolve({ error: null }); expect((await pendingA).error).toBeNull(); });
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: messageQueryKey("conversation-A"), exact: true });
    expect(result.current.isPending).toBe(true);
    await act(async () => { secondWrite.resolve({ error: null }); expect((await pendingB).error).toBeNull(); });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(invalidate.mock.calls).toEqual([
      [{ queryKey: messageQueryKey("conversation-A"), exact: true }],
      [{ queryKey: messageQueryKey("conversation-B"), exact: true }],
    ]);
  });

  it("settles a successful mutation without waiting for message refetch", async () => {
    transport({ data: rows(1), error: null });
    const refetch = deferred<void>();
    const { result, invalidate } = setup();
    invalidate.mockReturnValueOnce(refetch.promise);
    let pending!: ReturnType<typeof outcome>;
    act(() => { pending = outcome(result.current.mutateAsync()); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: messageQueryKey("c-1"), exact: true });
    await act(async () => { refetch.resolve(); await pending; });
  });

  it("does not retarget an initiating SELECT when the same actor selects B before it settles", async () => {
    const selection = deferred<SelectResult>();
    const sdk = transport(selection.promise);
    const { result, invalidate, rerender } = setup("conversation-A");
    let pending!: ReturnType<typeof outcome>;
    act(() => { pending = outcome(result.current.mutateAsync()); });
    await waitFor(() => expect(sdk.sent).toHaveBeenCalledTimes(1));
    rerender({ id: "conversation-B" });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    await act(async () => { selection.resolve({ data: rows(1), error: null }); expect((await pending).error).toBeNull(); });
    expect(sdk.conversation).toHaveBeenCalledExactlyOnceWith("conversation_id", "conversation-A");
    expect(sdk.write).toHaveBeenCalledExactlyOnceWith("id", ["read-id-0"]);
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: messageQueryKey("conversation-A"), exact: true });
  });

  it.each(["actor", "conversation"] as const)("has no transport when %s is absent", async (missing) => {
    transport({ data: rows(1), error: null });
    const client = createQueryClient();
    if (missing === "actor") useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useMarkMessagesRead(missing === "conversation" ? "" : "c-1"), { wrapper: wrapperWithClient(client) });
    await act(async () => { await result.current.mutateAsync(); });
    expect(fromMock).not.toHaveBeenCalled();
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

  it("falls back to a concurrently-created conversation when insert fails", async () => {
    const firstOr = vi.fn().mockResolvedValueOnce({ data: [], error: null });
    const fallbackOr = vi.fn().mockResolvedValueOnce({
      data: [{ id: "c-raced", listing_id: "l-1" }],
      error: null,
    });
    const insertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("duplicate key value violates unique constraint"),
    });
    const insert = vi.fn().mockReturnValue({ select: () => ({ single: insertSingle }) });
    let conversationsSelectCalls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table !== "conversations") throw new Error("unexpected " + table);
      return {
        select: () => ({
          or: conversationsSelectCalls++ === 0 ? firstOr : fallbackOr,
        }),
        insert,
      };
    });
    const { result } = renderHook(() => useStartConversation(), { wrapper: wrapper() });

    let id: string | undefined;
    await act(async () => {
      id = await result.current.mutateAsync({ other_user_id: "u-2", listing_id: "l-1" });
    });

    expect(insert).toHaveBeenCalledWith({
      participant_a: "u-1",
      participant_b: "u-2",
      listing_id: "l-1",
    });
    expect(id).toBe("c-raced");
  });

  it("rejects the insert error when no fallback conversation exists", async () => {
    const firstOr = vi.fn().mockResolvedValueOnce({ data: [], error: null });
    const fallbackOr = vi.fn().mockResolvedValueOnce({ data: [], error: null });
    const insertError = new Error("network down");
    const insert = vi.fn().mockReturnValue({
      select: () => ({ single: vi.fn().mockResolvedValue({ data: null, error: insertError }) }),
    });
    let conversationsSelectCalls = 0;
    fromMock.mockImplementation(() => ({
      select: () => ({ or: conversationsSelectCalls++ === 0 ? firstOr : fallbackOr }),
      insert,
    }));
    const { result } = renderHook(() => useStartConversation(), { wrapper: wrapper() });

    await expect(
      result.current.mutateAsync({ other_user_id: "u-2", listing_id: "l-1" }),
    ).rejects.toThrow(/network down/i);
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
