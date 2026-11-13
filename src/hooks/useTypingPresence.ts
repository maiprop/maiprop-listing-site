import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const TYPING_HEARTBEAT_MS = 750;

export function useTypingPresence(
  activeConvId: string,
  user: User | null,
  accessToken: string | undefined,
) {
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingChannelReadyRef = useRef(false);
  const typingIntentRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingHeartbeatRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendTypingState = useCallback(
    (channel: ReturnType<typeof supabase.channel>, typing: boolean) => {
      if (!user) return;
      channel.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: user.id, typing },
      }).catch(() => undefined);
    },
    [user],
  );

  const scheduleTypingStop = useCallback(
    (channel: ReturnType<typeof supabase.channel>) => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        typingIntentRef.current = false;
        if (typingHeartbeatRef.current) {
          clearTimeout(typingHeartbeatRef.current);
          typingHeartbeatRef.current = null;
        }
        if (
          typingChannelReadyRef.current &&
          typingChannelRef.current === channel
        ) {
          sendTypingState(channel, false);
        }
        typingTimeoutRef.current = null;
      }, 3_000);
    },
    [sendTypingState],
  );

  const publishTypingIntent = useCallback(
    (channel: ReturnType<typeof supabase.channel>) => {
      if (typingHeartbeatRef.current) {
        scheduleTypingStop(channel);
        return;
      }

      const publish = () => {
        if (
          !typingIntentRef.current ||
          !typingChannelReadyRef.current ||
          typingChannelRef.current !== channel
        ) {
          typingHeartbeatRef.current = null;
          return;
        }
        sendTypingState(channel, true);
        typingHeartbeatRef.current = setTimeout(publish, TYPING_HEARTBEAT_MS);
      };

      publish();
      scheduleTypingStop(channel);
    },
    [scheduleTypingStop, sendTypingState],
  );

  // Typing is a transient event, so use private Broadcast rather than Presence.
  useEffect(() => {
    if (typingChannelRef.current) {
      supabase.removeChannel(typingChannelRef.current);
      typingChannelRef.current = null;
    }
    typingChannelReadyRef.current = false;
    typingIntentRef.current = false;
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (typingHeartbeatRef.current) {
      clearTimeout(typingHeartbeatRef.current);
      typingHeartbeatRef.current = null;
    }
    if (remoteTypingTimeoutRef.current) {
      clearTimeout(remoteTypingTimeoutRef.current);
      remoteTypingTimeoutRef.current = null;
    }
    setOtherIsTyping(false);

    if (!activeConvId || !user || !accessToken) return;

    // Private realtime channel — gated by the realtime.messages SELECT policy
    // added in 20260627000000_audit_remediations.sql which enforces conversation
    // participation. Previously the public channel name `typing:<convId>` was
    // joinable by anyone who knew or guessed a conversation UUID.
    // Realtime transport authorization (channel join) is distinct from
    // application-table row access; the above describes the intended policy,
    // not a live-tested guarantee.
    const channel = supabase.channel(`typing:${activeConvId}`, {
      config: { broadcast: { self: false }, private: true },
    });
    let cancelled = false;

    typingChannelRef.current = channel;
    const subscribeToTyping = async () => {
      try {
        await supabase.realtime.setAuth(accessToken);
        if (cancelled) return;
        channel
          .on("broadcast", { event: "typing" }, ({ payload }) => {
            if (cancelled || typingChannelRef.current !== channel) return;
            const state = payload as { userId?: unknown; typing?: unknown };
            if (state.userId === user.id || typeof state.typing !== "boolean") return;
            if (remoteTypingTimeoutRef.current) clearTimeout(remoteTypingTimeoutRef.current);
            setOtherIsTyping(state.typing);
            remoteTypingTimeoutRef.current = state.typing
              ? setTimeout(() => {
                  if (cancelled || typingChannelRef.current !== channel) return;
                  setOtherIsTyping(false);
                  remoteTypingTimeoutRef.current = null;
                }, 4_000)
              : null;
          })
          .subscribe((status) => {
            if (cancelled || typingChannelRef.current !== channel) return;
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              typingChannelReadyRef.current = false;
              typingIntentRef.current = false;
              typingChannelRef.current = null;
              if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = null;
              }
              if (typingHeartbeatRef.current) {
                clearTimeout(typingHeartbeatRef.current);
                typingHeartbeatRef.current = null;
              }
              if (remoteTypingTimeoutRef.current) {
                clearTimeout(remoteTypingTimeoutRef.current);
                remoteTypingTimeoutRef.current = null;
              }
              setOtherIsTyping(false);
              void supabase.removeChannel(channel);
              return;
            }
            typingChannelReadyRef.current = status === "SUBSCRIBED";
            if (status === "SUBSCRIBED" && typingIntentRef.current) {
              publishTypingIntent(channel);
            }
          });
      } catch {
        if (!cancelled && typingChannelRef.current === channel) {
          supabase.removeChannel(channel);
          typingChannelRef.current = null;
          typingChannelReadyRef.current = false;
        }
      }
    };
    void subscribeToTyping();

    return () => {
      cancelled = true;
      if (typingChannelReadyRef.current && typingIntentRef.current) {
        sendTypingState(channel, false);
      }
      if (typingChannelRef.current === channel) {
        typingChannelRef.current = null;
        supabase.removeChannel(channel);
      }
      typingChannelReadyRef.current = false;
      typingIntentRef.current = false;
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (typingHeartbeatRef.current) {
        clearTimeout(typingHeartbeatRef.current);
        typingHeartbeatRef.current = null;
      }
      if (remoteTypingTimeoutRef.current) {
        clearTimeout(remoteTypingTimeoutRef.current);
        remoteTypingTimeoutRef.current = null;
      }
    };
  }, [activeConvId, publishTypingIntent, sendTypingState, accessToken, user]);

  const broadcastTyping = () => {
    typingIntentRef.current = true;
    if (!typingChannelRef.current || !typingChannelReadyRef.current || !user) return;
    publishTypingIntent(typingChannelRef.current);
  };

  const stopTyping = () => {
    typingIntentRef.current = false;
    if (typingHeartbeatRef.current) {
      clearTimeout(typingHeartbeatRef.current);
      typingHeartbeatRef.current = null;
    }
    if (typingChannelReadyRef.current) {
      if (typingChannelRef.current) sendTypingState(typingChannelRef.current, false);
    }
  };

  return { otherIsTyping, broadcastTyping, stopTyping };
};
