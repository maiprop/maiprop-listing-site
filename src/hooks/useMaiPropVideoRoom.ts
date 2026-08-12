import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPublicApi } from "@/lib/publicApi";

type RoomStatus = "idle" | "checking" | "ready" | "joining" | "waiting" | "connected" | "failed";

type SignalPayload = {
  roomId: string;
  type: "offer" | "answer" | "candidate" | "leave";
  from: string;
  to?: string;
  displayName?: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type PresenceMeta = {
  peerId: string;
  displayName: string;
  joinedAt: string;
};

type UseMaiPropVideoRoomOptions = {
  roomId: string;
  displayName: string;
};

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

type TurnCredentialsResponse = {
  iceServers?: unknown;
};

function isIceServer(value: unknown): value is RTCIceServer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const urls = (value as { urls?: unknown }).urls;
  return typeof urls === "string" ||
    (
      Array.isArray(urls) &&
      urls.length > 0 &&
      urls.every((url) => typeof url === "string")
    );
}

async function getIceServers(
  roomId: string,
  accessToken: string,
): Promise<RTCIceServer[]> {
  const response = await fetchPublicApi<TurnCredentialsResponse>(
    "/api/turn-credentials",
    {
      method: "POST",
      body: { roomId },
      headers: { Authorization: `Bearer ${accessToken}` },
      timeoutMs: 5_000,
    },
  );
  return Array.isArray(response?.iceServers) &&
    response.iceServers.every(isIceServer)
    ? response.iceServers
    : DEFAULT_ICE_SERVERS;
}

function createPeerId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `peer-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function useMaiPropVideoRoom({ roomId, displayName }: UseMaiPropVideoRoomOptions) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const peerIdRef = useRef(createPeerId());
  const remotePeerIdRef = useRef<string | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const joinInFlightRef = useRef(false);
  const iceServersRef = useRef<RTCIceServer[]>(DEFAULT_ICE_SERVERS);

  const [status, setStatus] = useState<RoomStatus>("idle");
  const [cameraChecked, setCameraChecked] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(1);
  const [remoteDisplayName, setRemoteDisplayName] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const attachLocalStream = useCallback((stream: MediaStream) => {
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    setAudioEnabled(stream.getAudioTracks().some((track) => track.enabled));
    setVideoEnabled(stream.getVideoTracks().some((track) => track.enabled));
  }, []);

  const attachRemoteStream = useCallback((stream: MediaStream) => {
    remoteStreamRef.current = stream;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
  }, []);

  const clearRemoteStream = useCallback(() => {
    remoteStreamRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (typeof MediaStream !== "undefined") attachRemoteStream(new MediaStream());
  }, [attachRemoteStream]);

  const startLocalMedia = useCallback(async () => {
    if (localStreamRef.current) {
      setCameraChecked(true);
      setStatus((current) => current === "checking" ? "ready" : current);
      return localStreamRef.current;
    }

    setStatus("checking");
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      attachLocalStream(stream);
      setCameraChecked(true);
      setStatus("ready");
      return stream;
    } catch (_err: unknown) {
      setStatus("failed");
      setErrorMessage("Could not access camera or microphone. Please check your browser permissions.");
      throw _err;
    }
  }, [attachLocalStream]);

  const sendSignal = useCallback(async (payload: Omit<SignalPayload, "roomId" | "from" | "displayName">) => {
    const channel = channelRef.current;
    if (!channel) return;
    await channel.send({
      type: "broadcast",
      event: "signal",
      payload: {
        ...payload,
        roomId,
        from: peerIdRef.current,
        displayName,
      } satisfies SignalPayload,
    });
  }, [displayName, roomId]);

  const createPeerConnection = useCallback((remotePeerId: string) => {
    const existing = peerConnectionRef.current;
    if (existing) return existing;

    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
    });
    const remoteStream = new MediaStream();
    attachRemoteStream(remoteStream);

    localStreamRef.current?.getTracks().forEach((track) => {
      if (localStreamRef.current) pc.addTrack(track, localStreamRef.current);
    });

    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
      attachRemoteStream(remoteStream);
      setStatus("connected");
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void sendSignal({
        type: "candidate",
        to: remotePeerId,
        candidate: event.candidate.toJSON(),
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("connected");
      if (pc.connectionState === "failed") {
        pc.close();
        peerConnectionRef.current = null;
        pendingCandidatesRef.current = [];
      }
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        setStatus(remotePeerIdRef.current ? "waiting" : "ready");
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [attachRemoteStream, sendSignal]);

  const flushPendingCandidates = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc?.remoteDescription) return;
    const candidates = pendingCandidatesRef.current.splice(0);
    for (const candidate of candidates) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const startOffer = useCallback(async (remotePeerId: string) => {
    if (!localStreamRef.current || !channelRef.current) return;
    if (peerConnectionRef.current?.localDescription) return;

    remotePeerIdRef.current = remotePeerId;
    const pc = createPeerConnection(remotePeerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal({ type: "offer", to: remotePeerId, description: offer });
  }, [createPeerConnection, sendSignal]);

  const handleSignal = useCallback(async ({ payload }: { payload: SignalPayload }) => {
    if (!payload || payload.roomId !== roomId || payload.from === peerIdRef.current) return;
    if (payload.to && payload.to !== peerIdRef.current) return;

    if (payload.displayName) setRemoteDisplayName(payload.displayName);

    if (payload.type === "leave") {
      if (payload.from === remotePeerIdRef.current) {
        peerConnectionRef.current?.close();
        peerConnectionRef.current = null;
        remotePeerIdRef.current = null;
        pendingCandidatesRef.current = [];
        clearRemoteStream();
        setStatus("waiting");
      }
      return;
    }

    if (!localStreamRef.current) await startLocalMedia();
    remotePeerIdRef.current = payload.from;
    const pc = createPeerConnection(payload.from);

    if (payload.type === "offer" && payload.description) {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.description));
      await flushPendingCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal({ type: "answer", to: payload.from, description: answer });
      setStatus("waiting");
    }

    if (payload.type === "answer" && payload.description) {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.description));
      await flushPendingCandidates();
    }

    if (payload.type === "candidate" && payload.candidate) {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } else {
        pendingCandidatesRef.current.push(payload.candidate);
      }
    }
  }, [clearRemoteStream, createPeerConnection, flushPendingCandidates, roomId, sendSignal, startLocalMedia]);

  const resetRoomConnection = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    remotePeerIdRef.current = null;
    pendingCandidatesRef.current = [];
    clearRemoteStream();
    setRemoteDisplayName(null);
    if (channelRef.current) {
      channelRef.current.untrack().catch(() => undefined);
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, [clearRemoteStream]);

  const joinRoom = useCallback(async () => {
    if (joinInFlightRef.current) return;
    joinInFlightRef.current = true;
    setErrorMessage(null);
    try {
      await startLocalMedia();
      setStatus("joining");
      resetRoomConnection();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        joinInFlightRef.current = false;
        setStatus("failed");
        setErrorMessage("Please sign in again before joining the mAI prop video room.");
        return;
      }
      iceServersRef.current = await getIceServers(
        roomId,
        session.access_token,
      );
      await supabase.realtime.setAuth(session.access_token);
      let subscriptionFailed = false;

      const channel = supabase.channel(roomId, {
        config: {
          broadcast: { self: false },
          presence: { key: peerIdRef.current },
          private: true,
        },
      });
      channelRef.current = channel;

      channel
        .on("broadcast", { event: "signal" }, (payload) => {
          void handleSignal(payload as unknown as { payload: SignalPayload });
        })
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState<PresenceMeta>();
          const peers = Object.values(state).flat().filter((peer) => peer.peerId !== peerIdRef.current);
          setParticipantCount(peers.length + 1);
          const firstPeer = peers[0];
          if (!firstPeer) {
            peerConnectionRef.current?.close();
            peerConnectionRef.current = null;
            remotePeerIdRef.current = null;
            pendingCandidatesRef.current = [];
            clearRemoteStream();
            setRemoteDisplayName(null);
            setStatus("waiting");
            return;
          }
          setRemoteDisplayName(firstPeer.displayName);
          if (!remotePeerIdRef.current) remotePeerIdRef.current = firstPeer.peerId;
          if (peerIdRef.current < firstPeer.peerId) void startOffer(firstPeer.peerId);
        })
        .subscribe(async (subscribeStatus) => {
          if (subscribeStatus === "SUBSCRIBED") {
            joinInFlightRef.current = false;
            setStatus("waiting");
            try {
              await channel.track({
                peerId: peerIdRef.current,
                displayName,
                joinedAt: new Date().toISOString(),
              } satisfies PresenceMeta);
            } catch (_err: unknown) {
              resetRoomConnection();
              setStatus("failed");
              setErrorMessage("Could not announce your presence in the mAI prop video room. Please retry or use an external meeting link.");
            }
          }
          if (subscribeStatus === "CHANNEL_ERROR" || subscribeStatus === "TIMED_OUT") {
            subscriptionFailed = true;
            joinInFlightRef.current = false;
            resetRoomConnection();
            setStatus("failed");
            setErrorMessage("Could not connect to the mAI prop video room. Please retry or use an external meeting link.");
          }
        });
      if (!subscriptionFailed) {
        joinInFlightRef.current = false;
        setStatus("waiting");
      }
    } catch (err: unknown) {
      joinInFlightRef.current = false;
      throw err;
    } finally {
      window.setTimeout(() => {
        joinInFlightRef.current = false;
      }, 10_000);
    }
  }, [clearRemoteStream, displayName, handleSignal, resetRoomConnection, roomId, startLocalMedia, startOffer]);

  const leaveRoom = useCallback(() => {
    void sendSignal({ type: "leave", to: remotePeerIdRef.current ?? undefined });
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    remotePeerIdRef.current = null;
    pendingCandidatesRef.current = [];
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (channelRef.current) {
      channelRef.current.untrack().catch(() => undefined);
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setParticipantCount(1);
    setRemoteDisplayName(null);
    setCameraChecked(false);
    setAudioEnabled(true);
    setVideoEnabled(true);
    setStatus("idle");
  }, [sendSignal]);

  const toggleAudio = useCallback(() => {
    const enabled = !audioEnabled;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
    setAudioEnabled(enabled);
  }, [audioEnabled]);

  const toggleVideo = useCallback(() => {
    const enabled = !videoEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
    setVideoEnabled(enabled);
  }, [videoEnabled]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
  });

  useEffect(() => () => leaveRoom(), [leaveRoom]);

  return useMemo(() => ({
    localVideoRef,
    remoteVideoRef,
    status,
    cameraChecked,
    errorMessage,
    participantCount,
    remoteDisplayName,
    audioEnabled,
    videoEnabled,
    startLocalMedia,
    joinRoom,
    leaveRoom,
    toggleAudio,
    toggleVideo,
  }), [
    audioEnabled,
    cameraChecked,
    errorMessage,
    joinRoom,
    leaveRoom,
    participantCount,
    remoteDisplayName,
    startLocalMedia,
    status,
    toggleAudio,
    toggleVideo,
    videoEnabled,
  ]);
}
