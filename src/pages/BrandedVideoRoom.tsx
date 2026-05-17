import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navbar } from "@/components/Navbar";
import {
  Video,
  ArrowLeft,
  Loader2,
  ExternalLink,
  Mic,
  Camera,
  Copy,
  Check,
  PhoneOff,
  Clock,
  FileDown,
  CalendarPlus,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type ProfessionalVideoProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  title: string | null;
  category: string | null;
  video_link: string | null;
};

const EXTERNAL_PATTERNS = ["zoom.us", "whereby.com", "meet.google.com", "teams.microsoft.com"];

function getPlatformName(videoLink: string | null) {
  if (!videoLink) return null;
  if (videoLink.includes("zoom.us")) return "Zoom";
  if (videoLink.includes("whereby.com")) return "Whereby";
  if (videoLink.includes("meet.google.com")) return "Google Meet";
  if (videoLink.includes("teams.microsoft.com")) return "Microsoft Teams";
  return null;
}

function formatTimer(secs: number) {
  const minutes = Math.floor(secs / 60).toString().padStart(2, "0");
  const seconds = (secs % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function downloadSummary(pro: ProfessionalVideoProfile, callStartTime: Date, elapsedSeconds: number, callNotes: string) {
  const lines = [
    "mAI Prop Consultation Summary",
    "============================",
    `Professional: ${pro.display_name ?? "Unknown professional"}`,
    `Title: ${pro.title ?? pro.category ?? "Professional"}`,
    `Date: ${callStartTime.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
    `Time: ${callStartTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
    `Duration: ${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`,
    "",
    "Notes:",
    callNotes || "(no notes)",
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `consultation-summary-${(pro.display_name || "unknown").replace(/\s+/g, "-").toLowerCase()}-${callStartTime.toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BrandedVideoRoom() {
  const { professionalId } = useParams<{ professionalId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userName = profile?.display_name ?? "Guest";

  const [joined, setJoined] = useState(false);
  const [cameraChecked, setCameraChecked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cameraCheckPending, setCameraCheckPending] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [callNotes, setCallNotes] = useState("");
  const [callStartTime] = useState(() => new Date());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const { data: pro, isLoading, error } = useQuery({
    queryKey: ["professional", professionalId],
    queryFn: async () => {
      if (!professionalId) return null;
      const { data, error: queryError } = await supabase
        .from("professionals")
        .select("id, display_name, avatar_url, title, category, video_link")
        .eq("id", professionalId)
        .single();
      if (queryError) throw queryError;
      return data as ProfessionalVideoProfile;
    },
    enabled: Boolean(professionalId),
  });

  const videoLink = pro?.video_link ?? "";
  const isExternalLink = Boolean(videoLink) && EXTERNAL_PATTERNS.some((pattern) => videoLink.includes(pattern));
  const platformName = getPlatformName(pro?.video_link ?? null);
  const jitsiRoom = `maiprop-${professionalId}`;
  const jitsiUrl = `https://meet.jit.si/${jitsiRoom}`;
  const jitsiEmbedSrc = `${jitsiUrl}#config.prejoinPageEnabled=false&config.startWithVideoMuted=false&userInfo.displayName=${encodeURIComponent(userName)}`;
  const localStorageKey = `call-notes-${professionalId ?? "unknown"}`;

  const handleCameraCheck = useCallback(async () => {
    setCameraCheckPending(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setCameraChecked(true);
      toast.success("Camera and microphone are working.");
    } catch (_err: unknown) {
      toast.error("Could not access camera or microphone. Please check your browser permissions.");
    } finally {
      setCameraCheckPending(false);
    }
  }, []);

  const handleCopyRoomLink = useCallback(async () => {
    await navigator.clipboard.writeText(jitsiUrl);
    setCopied(true);
    toast.success("Room link copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  }, [jitsiUrl]);

  const handleEndCall = () => {
    const savedNotes = localStorage.getItem(localStorageKey);
    if (savedNotes) setCallNotes(savedNotes);
    setCallEnded(true);
  };

  const handleSaveNotes = () => {
    localStorage.setItem(localStorageKey, callNotes);
    toast.success("Notes saved locally.");
  };

  if (isLoading || (!pro && !error)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !pro) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 text-center px-4">
          <p className="text-muted-foreground">Professional not found.</p>
          <Link to="/professionals">
            <Button variant="outline" className="mt-4">Back to Professionals</Button>
          </Link>
        </div>
      </div>
    );
  }

  const header = (
    <div className="border-b border-border bg-card/80 py-4 px-4">
      <div className="container flex items-center gap-4">
        <Link to={`/professionals/${pro.id}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to profile
        </Link>
        <div className="flex-1 flex items-center gap-3">
          {pro.avatar_url && <img src={pro.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />}
          <div>
            <p className="font-display font-semibold text-foreground">{pro.display_name}</p>
            <p className="text-xs text-muted-foreground">{pro.title ?? pro.category}</p>
          </div>
        </div>
        <a
          href={isExternalLink && pro.video_link ? pro.video_link : jitsiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          Open in new window <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );

  if (isExternalLink && pro.video_link) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-16">
          {header}
          <div className="container py-12 max-w-xl mx-auto">
            <div className="glass-card rounded-2xl border border-primary/20 overflow-hidden">
              <div className="p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Video className="w-10 h-10 text-primary" />
                </div>
                <h2 className="font-display text-xl font-bold mb-1">Video consultation with {pro.display_name}</h2>
                <p className="text-sm text-muted-foreground mb-2">{pro.title ?? pro.category}</p>
                <p className="text-xs text-muted-foreground mb-6">
                  This professional uses <span className="font-semibold">{platformName ?? "an external video provider"}</span>. maiProp does not generate or confirm the meeting link on this page.
                </p>
                <a
                  href={pro.video_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-8 py-3 rounded-xl hover:bg-primary/90 transition-colors"
                >
                  <Video className="w-5 h-5" /> Open {platformName ?? "video call"}
                </a>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-6">mAI Prop · Professional consultation</p>
          </div>
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-16">
          {header}
          <div className="container py-12 max-w-xl mx-auto space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-3 text-sm text-center text-muted-foreground">
              Using <span className="font-semibold text-primary">maiProp video room</span> as the shared fallback meeting room for this professional.
            </div>

            <div className="glass-card rounded-2xl border border-border overflow-hidden">
              <div className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  {pro.avatar_url && <img src={pro.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />}
                  <div>
                    <p className="font-display font-semibold">{pro.display_name}</p>
                    <p className="text-xs text-muted-foreground">{pro.title ?? pro.category}</p>
                  </div>
                </div>

                <ul className="space-y-3 mb-6 text-sm">
                  <li className="flex items-start gap-3">
                    <Camera className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      Your microphone and camera will be requested by Jitsi when you join.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Mic className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      You are joining as <span className="font-medium text-foreground">{userName}</span>.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Clock className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      This room is only the meeting surface. It does not mean the professional has confirmed the session or is already present.
                    </span>
                  </li>
                </ul>

                <div className="flex items-center gap-3 mb-6">
                  <Button variant="outline" size="sm" onClick={handleCameraCheck} disabled={cameraCheckPending || cameraChecked} className="gap-2">
                    {cameraCheckPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : cameraChecked ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                    {cameraChecked ? "Camera & mic OK" : "Test camera & mic"}
                  </Button>
                  {cameraChecked && <span className="text-xs text-green-600 dark:text-green-400">All good, ready to join.</span>}
                </div>

                <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 mb-6 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Room name</p>
                    <p className="text-sm font-mono font-medium">{jitsiRoom}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleCopyRoomLink} className="gap-1.5 shrink-0">
                    {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                </div>

                <Button className="w-full gap-2 text-base py-6" onClick={() => setJoined(true)}>
                  <Video className="w-5 h-5" /> Join now
                </Button>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">mAI Prop · Professional consultation</p>
          </div>
        </div>
      </div>
    );
  }

  if (callEnded) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-16">
          {header}
          <div className="container py-12 max-w-xl mx-auto space-y-4">
            <div className="glass-card rounded-2xl border border-primary/20 overflow-hidden">
              <div className="bg-primary/5 px-6 py-5 border-b border-primary/10 text-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-7 h-7 text-primary" />
                </div>
                <h2 className="font-display text-xl font-bold text-foreground">Call Summary</h2>
                <p className="text-sm text-muted-foreground mt-1">Your consultation has ended</p>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-center">
                    <Clock className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                    <p className="text-sm font-bold text-foreground">{formatTimer(elapsedSeconds)}</p>
                    <p className="text-xs text-muted-foreground">Duration</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-center">
                    <Video className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                    <p className="text-sm font-bold text-foreground truncate">{(pro.display_name || "").split(" ")[0]}</p>
                    <p className="text-xs text-muted-foreground">Participant</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-center">
                    <CalendarPlus className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                    <p className="text-sm font-bold text-foreground">{callStartTime.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                    <p className="text-xs text-muted-foreground">{callStartTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                    <StickyNote className="w-3.5 h-3.5" /> Consultation Notes
                  </label>
                  <textarea
                    rows={5}
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    placeholder="Add consultation notes, action items, and follow-up tasks..."
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                  <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={handleSaveNotes}>
                    <Check className="w-3.5 h-3.5" /> Save Notes
                  </Button>
                </div>
              </div>

              <div className="px-6 pb-6 space-y-2">
                <Link to={`/professionals/${pro.id}`} className="block">
                  <Button variant="outline" className="w-full gap-2">
                    <CalendarPlus className="w-4 h-4" /> Book Follow-up
                  </Button>
                </Link>
                <Button variant="outline" className="w-full gap-2" onClick={() => downloadSummary(pro, callStartTime, elapsedSeconds, callNotes)}>
                  <FileDown className="w-4 h-4" /> Download Summary as Text
                </Button>
                <Button className="w-full gap-2" onClick={() => navigate(`/professionals/${pro.id}`)}>
                  <ArrowLeft className="w-4 h-4" /> Return to Profile
                </Button>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">mAI Prop · Professional consultation</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {header}
        <div className="container py-6 max-w-5xl mx-auto space-y-4">
          <div className="relative">
            <iframe
              src={jitsiEmbedSrc}
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              className="w-full rounded-xl border border-border"
              style={{ height: "600px" }}
              title="Video consultation"
            />
            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/70 text-white text-xs font-mono px-3 py-1.5 rounded-full backdrop-blur-sm pointer-events-none select-none">
              <Clock className="w-3.5 h-3.5 text-red-400" />
              {formatTimer(elapsedSeconds)}
            </div>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground text-center">
            This room runs on Jitsi as a shared fallback. Session confirmation, attendance, and reminders still depend on the professional.
          </div>

          <div className="flex justify-center">
            <Button variant="destructive" className="gap-2" onClick={handleEndCall}>
              <PhoneOff className="w-4 h-4" /> End call
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            mAI Prop · Professional consultation powered by{" "}
            <a href="https://meet.jit.si" target="_blank" rel="noopener noreferrer" className="underline">
              Jitsi Meet
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
