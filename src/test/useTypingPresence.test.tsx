import { act, renderHook } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTypingPresence } from "@/hooks/useTypingPresence";

const mocks = vi.hoisted(() => ({ channel: vi.fn(), setAuth: vi.fn(), removeChannel: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { channel: mocks.channel, realtime: { setAuth: mocks.setAuth }, removeChannel: mocks.removeChannel },
}));

const user = { id: "me" } as User;
const makeChannel = () => {
  let receive!: (message: { payload: { userId: unknown; typing: unknown } }) => void;
  let status!: (value: string) => void;
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, callback: typeof receive) => { receive = callback; return channel; }),
    subscribe: vi.fn((callback: typeof status) => { status = callback; return channel; }),
    send: vi.fn().mockResolvedValue("ok"),
  };
  return { channel, receive: (payload: { userId: unknown; typing: unknown }) => receive({ payload }), status: (value: string) => status(value) };
};
const flushAuth = async () => { await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.setAuth.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); });

describe("useTypingPresence", () => {
  it("cancels delayed authorization for an old conversation and identity", async () => {
    let resolveAuth!: () => void;
    mocks.setAuth.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveAuth = resolve; }));
    const old = makeChannel();
    const current = makeChannel();
    mocks.channel.mockReturnValueOnce(old.channel).mockReturnValueOnce(current.channel);
    const { result, rerender } = renderHook(
      ({ id, actor }) => useTypingPresence(id, actor, "token"),
      { initialProps: { id: "a", actor: user } },
    );
    rerender({ id: "b", actor: { ...user, id: "new-user" } });
    await flushAuth();
    await act(async () => { resolveAuth(); await Promise.resolve(); });
    expect(old.channel.on).not.toHaveBeenCalled();
    expect(old.channel.subscribe).not.toHaveBeenCalled();
    expect(mocks.removeChannel).toHaveBeenCalledWith(old.channel);
    act(() => current.status("SUBSCRIBED"));
    act(() => result.current.broadcastTyping());
    expect(current.channel.send).toHaveBeenLastCalledWith({ type: "broadcast", event: "typing", payload: { userId: "new-user", typing: true } });
  });

  it("keeps full-user and token dependencies while stable inputs keep the channel", async () => {
    const channels = [makeChannel(), makeChannel(), makeChannel()];
    channels.forEach(({ channel }) => mocks.channel.mockReturnValueOnce(channel));
    const { rerender } = renderHook(
      ({ actor, token }) => useTypingPresence("a", actor, token),
      { initialProps: { actor: user, token: "one" } },
    );
    await flushAuth();
    rerender({ actor: user, token: "one" });
    expect(mocks.channel).toHaveBeenCalledTimes(1);
    const replacement = { ...user };
    rerender({ actor: replacement, token: "one" });
    await flushAuth();
    expect(mocks.channel).toHaveBeenCalledTimes(2);
    rerender({ actor: replacement, token: "two" });
    await flushAuth();
    expect(mocks.channel).toHaveBeenCalledTimes(3);
    expect(mocks.setAuth.mock.calls).toEqual([["one"], ["one"], ["two"]]);
    expect(mocks.channel).toHaveBeenLastCalledWith("typing:a", { config: { broadcast: { self: false }, private: true } });
    expect(mocks.setAuth.mock.invocationCallOrder[2]).toBeLessThan(channels[2].channel.on.mock.invocationCallOrder[0]);
  });

  it("queues intent, sends 750ms heartbeats and keeps the idle false after stopTyping", async () => {
    const current = makeChannel();
    mocks.channel.mockReturnValue(current.channel);
    const { result, unmount } = renderHook(() => useTypingPresence("a", user, "token"));
    await flushAuth();
    expect(Object.keys(result.current).sort()).toEqual(["broadcastTyping", "otherIsTyping", "stopTyping"]);
    act(() => result.current.broadcastTyping());
    expect(current.channel.send).not.toHaveBeenCalled();
    act(() => current.status("SUBSCRIBED"));
    await act(async () => { await vi.advanceTimersByTimeAsync(750); });
    expect(current.channel.send.mock.calls.map(([message]) => message.payload.typing)).toEqual([true, true]);
    act(() => result.current.stopTyping());
    await act(async () => { await vi.advanceTimersByTimeAsync(2_250); });
    expect(current.channel.send.mock.calls.map(([message]) => message.payload.typing)).toEqual([true, true, false, false]);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(current.channel.send).toHaveBeenCalledTimes(4);
  });

  it.each(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])("removes a failed %s channel and clears its timers", async (failure) => {
    const current = makeChannel();
    mocks.channel.mockReturnValue(current.channel);
    const { result } = renderHook(() => useTypingPresence("a", user, "token"));
    await flushAuth();
    act(() => current.status("SUBSCRIBED"));
    act(() => { result.current.broadcastTyping(); current.receive({ userId: "other", typing: true }); });
    expect(result.current.otherIsTyping).toBe(true);
    act(() => current.status(failure));
    expect(result.current.otherIsTyping).toBe(false);
    expect(mocks.removeChannel).toHaveBeenCalledWith(current.channel);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(current.channel.send).toHaveBeenCalledTimes(1);
  });

  it("handles rejected auth and send promises and missing inputs locally", async () => {
    const rejected = makeChannel();
    const current = makeChannel();
    mocks.channel.mockReturnValueOnce(rejected.channel).mockReturnValueOnce(current.channel);
    mocks.setAuth.mockRejectedValueOnce(new Error("local auth failure"));
    const { result, rerender } = renderHook(
      ({ id, actor, token }: { id: string; actor: User | null; token: string | undefined }) => useTypingPresence(id, actor, token),
      { initialProps: { id: "a", actor: user as User | null, token: "one" as string | undefined } },
    );
    await flushAuth();
    expect(mocks.removeChannel).toHaveBeenCalledWith(rejected.channel);
    expect(rejected.channel.subscribe).not.toHaveBeenCalled();
    rerender({ id: "b", actor: user, token: "one" });
    await flushAuth();
    current.channel.send.mockRejectedValue(new Error("local send failure"));
    act(() => current.status("SUBSCRIBED"));
    act(() => result.current.broadcastTyping());
    await flushAuth();
    act(() => result.current.stopTyping());
    await flushAuth();
    rerender({ id: "", actor: user, token: "one" });
    rerender({ id: "b", actor: null, token: "one" });
    rerender({ id: "b", actor: user, token: undefined });
    expect(mocks.channel).toHaveBeenCalledTimes(2);
  });
});
