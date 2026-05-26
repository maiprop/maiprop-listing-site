import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMaiPropVideoRoom } from "@/hooks/useMaiPropVideoRoom";

const mocks = vi.hoisted(() => ({
  channels: [] as Array<{
    id: string;
    meta: unknown;
    signalHandlers: Array<(payload: unknown) => void>;
    presenceHandlers: Array<() => void>;
  }>,
  sentSignals: [] as Array<{ type: string; to?: string }>,
  getSession: vi.fn(),
  setAuth: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const emitPresence = () => {
    for (const channel of mocks.channels) {
      for (const handler of channel.presenceHandlers) handler();
    }
  };

  return {
    supabase: {
      auth: {
        getSession: mocks.getSession,
      },
      realtime: {
        setAuth: mocks.setAuth,
      },
      removeChannel: mocks.removeChannel,
      channel: vi.fn((roomId: string) => {
        const channel = {
          id: `${roomId}-${mocks.channels.length}`,
          meta: null as unknown,
          signalHandlers: [] as Array<(payload: unknown) => void>,
          presenceHandlers: [] as Array<() => void>,
          on: vi.fn((type: string, filter: { event: string }, handler: (payload: unknown) => void) => {
            if (type === "broadcast" && filter.event === "signal") channel.signalHandlers.push(handler);
            if (type === "presence" && filter.event === "sync") channel.presenceHandlers.push(handler as () => void);
            return channel;
          }),
          subscribe: vi.fn((callback?: (status: string) => void | Promise<void>) => {
            queueMicrotask(() => void callback?.("SUBSCRIBED"));
            return channel;
          }),
          track: vi.fn(async (meta: unknown) => {
            channel.meta = meta;
            emitPresence();
            return "ok";
          }),
          untrack: vi.fn().mockResolvedValue("ok"),
          send: vi.fn(async (message: { payload: { type: string; to?: string } }) => {
            mocks.sentSignals.push(message.payload);
            for (const peerChannel of mocks.channels) {
              for (const handler of peerChannel.signalHandlers) handler({ payload: message.payload });
            }
            return "ok";
          }),
          presenceState: vi.fn(() => Object.fromEntries(
            mocks.channels
              .filter((peerChannel) => peerChannel.meta)
              .map((peerChannel) => [peerChannel.id, [peerChannel.meta]]),
          )),
        };
        mocks.channels.push(channel);
        return channel;
      }),
    },
  };
});

class FakeMediaStream {
  private tracks: Array<{ kind: string; enabled: boolean; stop: ReturnType<typeof vi.fn> }>;

  constructor(tracks: Array<{ kind: string; enabled: boolean; stop: ReturnType<typeof vi.fn> }> = []) {
    this.tracks = tracks;
  }

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }

  addTrack(track: { kind: string; enabled: boolean; stop: ReturnType<typeof vi.fn> }) {
    this.tracks.push(track);
  }
}

function createStream() {
  return new FakeMediaStream([
    { kind: "audio", enabled: true, stop: vi.fn() },
    { kind: "video", enabled: true, stop: vi.fn() },
  ]) as unknown as MediaStream;
}

class MockPeerConnection {
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  connectionState = "new";
  onicecandidate: ((event: { candidate: { toJSON: () => RTCIceCandidateInit } | null }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;

  addTrack() {}

  async createOffer() {
    return { type: "offer", sdp: "offer-sdp" } as RTCSessionDescriptionInit;
  }

  async createAnswer() {
    return { type: "answer", sdp: "answer-sdp" } as RTCSessionDescriptionInit;
  }

  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
    this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: `candidate-${description.type}` }) } });
    this.maybeConnect();
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
    this.maybeConnect();
  }

  async addIceCandidate() {}

  close() {
    this.connectionState = "closed";
  }

  private maybeConnect() {
    if (!this.localDescription || !this.remoteDescription || this.connectionState === "connected") return;
    this.connectionState = "connected";
    setTimeout(() => {
      this.onconnectionstatechange?.();
      this.ontrack?.({ streams: [createStream()] });
    }, 0);
  }
}

describe("useMaiPropVideoRoom signaling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.channels.length = 0;
    mocks.sentSignals.length = 0;
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "token" } } });
    mocks.setAuth.mockResolvedValue(undefined);

    let peerIdIndex = 0;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: vi.fn(() => ["peer-a", "peer-b"][peerIdIndex++] ?? `peer-${peerIdIndex}`) },
    });
    Object.defineProperty(globalThis, "MediaStream", { configurable: true, value: FakeMediaStream });
    Object.defineProperty(globalThis, "RTCPeerConnection", { configurable: true, value: MockPeerConnection });
    Object.defineProperty(globalThis, "RTCSessionDescription", {
      configurable: true,
      value: function RTCSessionDescription(description: RTCSessionDescriptionInit) {
        return description;
      },
    });
    Object.defineProperty(globalThis, "RTCIceCandidate", {
      configurable: true,
      value: function RTCIceCandidate(candidate: RTCIceCandidateInit) {
        return candidate;
      },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(createStream()) },
    });
  });

  it("connects two participants through offer, answer, and ICE candidate signaling", async () => {
    const buyer = renderHook(() => useMaiPropVideoRoom({ roomId: "video:consultation:consult-1", displayName: "Buyer" }));
    const professional = renderHook(() => useMaiPropVideoRoom({ roomId: "video:consultation:consult-1", displayName: "Professional" }));

    await act(async () => {
      await buyer.result.current.joinRoom();
      await professional.result.current.joinRoom();
    });

    await waitFor(() => expect(buyer.result.current.status).toBe("connected"));
    await waitFor(() => expect(professional.result.current.status).toBe("connected"));

    expect(buyer.result.current.participantCount).toBe(2);
    expect(professional.result.current.participantCount).toBe(2);
    expect(mocks.setAuth).toHaveBeenCalledWith("token");
    expect(mocks.sentSignals.map((signal) => signal.type)).toEqual(expect.arrayContaining(["offer", "answer", "candidate"]));
  });
});
