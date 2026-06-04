import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  Camera,
  Check,
  Clock,
  Copy,
  FileDown,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  StickyNote,
  Video,
  VideoOff,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMaiPropVideoRoom } from "@/hooks/useMaiPropVideoRoom";

export type MaiPropVideoRoomSubject = {
  title: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
};

type MaiPropVideoRoomProps = {
  roomTopic: string;
  roomDisplayName: string;
  roomUrl: string;
  userName: string;
  subject: MaiPropVideoRoomSubject;
  contextLabel: string;
  backHref: string;
  backLabel: string;
  notesStorageKey: string;
  notesPlaceholder: string;
  summaryTitle: string;
  summaryFilePrefix: string;
  followUpHref?: string;
  followUpLabel?: string;
  onReturn?: () => void;
};

function formatTimer(secs: number) {
  const minutes = Math.floor(secs / 60).toString().padStart(2, "0");
  const seconds = (secs % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function downloadSummary(
  filenamePrefix: string,
  summaryTitle: string,
  subject: MaiPropVideoRoomSubject,
  callStartTime: Date,
  elapsedSeconds: number,
  callNotes: string,
) {
  const lines = [
    summaryTitle,
    "=".repeat(summaryTitle.length),
    `With: ${subject.title}`,
    subject.subtitle ? `Context: ${subject.subtitle}` : null,
    `Date: ${callStartTime.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
    `Time: ${callStartTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
    `Duration: ${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`,
    "",
    "Notes:",
    callNotes || "(no notes)",
  ].filter(Boolean);
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${callStartTime.toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function MaiPropVideoRoom({
  roomTopic,
  roomDisplayName,
  roomUrl,
  userName,
  subject,
  contextLabel,
  backHref,
  backLabel,
  notesStorageKey,
  notesPlaceholder,
  summaryTitle,
  summaryFilePrefix,
  followUpHref,
  followUpLabel = "Book Follow-up",
  onReturn,
}: MaiPropVideoRoomProps) {
  const [copied, setCopied] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [callNotes, setCallNotes] = useState("");
  const [callStartTime] = useState(() => new Date());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const room = useMaiPropVideoRoom({ roomId: roomTopic, displayName: userName });
  const joined = room.status === "joining" || room.status === "waiting" || room.status === "connected";

  useEffect(() => {
    if (joined && !callEnded) {
      timerRef.current = setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [joined, callEnded]);

  const handleCameraCheck = async () => {
    try {
      await room.startLocalMedia();
      toast.success("Camera and microphone are working.");
    } catch (_err: unknown) {
      toast.error("Could not access camera or microphone. Please check your browser permissions.");
    }
  };

  const handleCopyRoomLink = async () => {
    await navigator.clipboard.writeText(roomUrl);
    setCopied(true);
    toast.success("Room link copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = async () => {
    try {
      await room.joinRoom();
    } catch (_err: unknown) {
      toast.error("Could not join the mAI prop video room. Please check your browser permissions.");
    }
  };

  const handleEndCall = () => {
    const savedNotes = localStorage.getItem(notesStorageKey);
    if (savedNotes) setCallNotes(savedNotes);
    room.leaveRoom();
    setCallEnded(true);
  };

  const handleSaveNotes = () => {
    localStorage.setItem(notesStorageKey, callNotes);
    toast.success("Notes saved locally.");
  };

  if (callEnded) {
    return (
      <div className="container py-12 max-w-xl mx-auto space-y-4">
        <div className="glass-card rounded-xl border border-primary/20 overflow-hidden">
          <div className="bg-primary/5 px-6 py-5 border-b border-primary/10 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Check className="w-7 h-7 text-primary" />
            </div>
            <h2 className="font-display text-xl font-bold text-foreground">Call Summary</h2>
            <p className="text-sm text-muted-foreground mt-1">{summaryTitle}</p>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-center">
                <Clock className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                <p className="text-sm font-bold text-foreground">{formatTimer(elapsedSeconds)}</p>
                <p className="text-xs text-muted-foreground">Duration</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-center">
                <Video className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                <p className="text-sm font-bold text-foreground truncate">{subject.title.split(" ")[0]}</p>
                <p className="text-xs text-muted-foreground">Session</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-center">
                <CalendarPlus className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                <p className="text-sm font-bold text-foreground">{callStartTime.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                <p className="text-xs text-muted-foreground">{callStartTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                <StickyNote className="w-3.5 h-3.5" /> Notes
              </label>
              <textarea
                rows={5}
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder={notesPlaceholder}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={handleSaveNotes}>
                <Check className="w-3.5 h-3.5" /> Save Notes
              </Button>
            </div>
          </div>

          <div className="px-6 pb-6 space-y-2">
            {followUpHref && (
              <Link to={followUpHref} className="block">
                <Button variant="outline" className="w-full gap-2">
                  <CalendarPlus className="w-4 h-4" /> {followUpLabel}
                </Button>
              </Link>
            )}
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => downloadSummary(summaryFilePrefix, summaryTitle, subject, callStartTime, elapsedSeconds, callNotes)}
            >
              <FileDown className="w-4 h-4" /> Download Summary as Text
            </Button>
            {onReturn ? (
              <Button className="w-full gap-2" onClick={onReturn}>
                <ArrowLeft className="w-4 h-4" /> {backLabel}
              </Button>
            ) : (
              <Link to={backHref} className="block">
                <Button className="w-full gap-2">
                  <ArrowLeft className="w-4 h-4" /> {backLabel}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="container py-12 max-w-xl mx-auto space-y-4">
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-3 text-sm text-center text-muted-foreground">
          Using <span className="font-semibold text-primary">mAI prop video room</span> for this {contextLabel.toLowerCase()}.
        </div>

        <div className="glass-card rounded-xl border border-border overflow-hidden">
          <div className="p-8">
            <div className="flex items-center gap-3 mb-6">
              {subject.avatarUrl && <img src={subject.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover" />}
              <div>
                <p className="font-display font-semibold">{subject.title}</p>
                {subject.subtitle && <p className="text-xs text-muted-foreground">{subject.subtitle}</p>}
              </div>
            </div>

            <ul className="space-y-3 mb-6 text-sm">
              <li className="flex items-start gap-3">
                <Camera className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Your microphone and camera stay inside this browser room.</span>
              </li>
              <li className="flex items-start gap-3">
                <Mic className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">
                  You are joining as <span className="font-medium text-foreground">{userName}</span>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">The room opens here; the other participant needs this same link.</span>
              </li>
            </ul>

            <div className="flex items-center gap-3 mb-6">
              <Button variant="outline" size="sm" onClick={handleCameraCheck} disabled={room.status === "checking" || room.cameraChecked} className="gap-2">
                {room.status === "checking" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : room.cameraChecked ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                {room.cameraChecked ? "Camera & mic OK" : "Test camera & mic"}
              </Button>
              {room.cameraChecked && <span className="text-xs text-green-600 dark:text-green-400">All good, ready to join.</span>}
            </div>

            {room.errorMessage && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 mb-6 text-sm text-destructive">
                {room.errorMessage}
              </div>
            )}

            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 mb-6 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Room name</p>
                <p className="text-sm font-mono font-medium">{roomDisplayName}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleCopyRoomLink} className="gap-1.5 shrink-0">
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>

            <Button className="w-full gap-2 text-base py-6" onClick={handleJoin} disabled={room.status === "checking" || room.status === "joining"}>
              {room.status === "joining" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
              Join now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6 max-w-6xl mx-auto space-y-4">
      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        <section className="relative min-h-[520px] rounded-xl border border-border bg-black overflow-hidden">
          <video ref={room.remoteVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
          {room.status !== "connected" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-6">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-4">
                <Video className="w-8 h-8" />
              </div>
              <p className="font-semibold">{room.status === "joining" ? "Connecting to room..." : "Waiting for the other participant"}</p>
              <p className="text-sm text-white/70 mt-1">Share the room link if they have not joined yet.</p>
            </div>
          )}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/70 text-white text-xs font-mono px-3 py-1.5 rounded-full backdrop-blur-sm pointer-events-none select-none">
            <Clock className="w-3.5 h-3.5 text-red-400" />
            {formatTimer(elapsedSeconds)}
          </div>
        </section>

        <aside className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <video ref={room.localVideoRef} autoPlay muted playsInline className="aspect-video w-full rounded-lg bg-black object-cover" />
            <p className="text-xs text-muted-foreground mt-2 truncate">{userName}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="text-sm font-semibold capitalize">{room.status}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Participants</p>
              <p className="text-sm font-semibold">{room.participantCount}{room.remoteDisplayName ? ` - ${room.remoteDisplayName}` : ""}</p>
            </div>
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={handleCopyRoomLink}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              Copy room link
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="gap-2" onClick={room.toggleAudio}>
              {room.audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              {room.audioEnabled ? "Mute" : "Unmute"}
            </Button>
            <Button variant="outline" className="gap-2" onClick={room.toggleVideo}>
              {room.videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              {room.videoEnabled ? "Camera" : "Camera off"}
            </Button>
          </div>

          <Button variant="destructive" className="w-full gap-2" onClick={handleEndCall}>
            <PhoneOff className="w-4 h-4" /> End call
          </Button>
        </aside>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground text-center">
        This in-app room uses browser WebRTC with Supabase Realtime signaling. External provider links can still be used when the host adds one.
      </div>

      <p className="text-center text-xs text-muted-foreground">
        mAI Prop - {contextLabel}
      </p>
    </div>
  );
}
