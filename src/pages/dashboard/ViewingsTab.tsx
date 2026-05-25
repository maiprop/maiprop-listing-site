import { Loader2, Calendar, Check, ExternalLink, Lock, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useViewings, useUpdateViewing, useUpdateViewingStatus } from "@/hooks/useViewings";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { Link, useNavigate } from "react-router-dom";
import { createViewingVideoRoomPath } from "@/lib/videoRooms";
import type { Tables } from "@/integrations/supabase/types";
import type { Profile } from "@/contexts/AuthContext";

type Viewing = Tables<"viewings"> & { listings?: { title: string; city: string | null; cover_image_url: string | null; address: string | null } | null };

const FREE_VIEWING_CAP = 3;

function ViewingCard({
  v,
  isOwner,
  profile,
  updateViewing,
  updateStatus,
}: {
  v: Viewing;
  isOwner: boolean;
  profile: Profile | null;
  updateViewing: ReturnType<typeof useUpdateViewing>;
  updateStatus: ReturnType<typeof useUpdateViewingStatus>;
}) {
  const isVideo = v.viewing_type === "video";
  const hasVideoLink = !!v.video_link;
  const roomPath = createViewingVideoRoomPath(v.id);
  const canJoinMaiPropRoom = isVideo && !hasVideoLink && v.status === "confirmed";
  const isPending = v.status === "pending";
  return (
    <div className="glass-card rounded-xl p-4 flex flex-wrap items-start gap-4">
      <div className={`w-2 h-10 rounded-full shrink-0 ${
        v.status === "confirmed" ? "bg-brand-emerald" : v.status === "pending" ? "bg-brand-gold" : "bg-muted-foreground"
      }`} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{v.listings?.title || "Property"}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(v.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {" · "}{isVideo ? "📹 Video" : "🏠 In-person"}
        </p>
        <span className={`text-xs px-2 py-0.5 rounded-full capitalize inline-block mt-1 ${
          v.status === "confirmed" ? "bg-brand-emerald/20 text-brand-emerald" : "bg-brand-gold/20 text-brand-gold"
        }`}>
          {v.status}
        </span>
        {isOwner && isPending && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-brand-emerald hover:bg-brand-emerald/90 text-white"
              disabled={updateStatus.isPending}
              onClick={() => updateStatus.mutate({ id: v.id, status: "confirmed" })}
            >
              <Check className="w-3.5 h-3.5" />
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
              disabled={updateStatus.isPending}
              onClick={() => updateStatus.mutate({ id: v.id, status: "cancelled" })}
            >
              <X className="w-3.5 h-3.5" />
              Decline
            </Button>
          </div>
        )}
        {isVideo && isOwner && !hasVideoLink && v.status === "confirmed" && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <input
              type="url"
              placeholder="Paste video call link (Zoom, Whereby...)"
              defaultValue={profile?.video_link || ""}
              className="flex-1 min-w-[200px] bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const url = (e.target as HTMLInputElement).value.trim();
                  if (url) updateViewing.mutate({ id: v.id, updates: { video_link: url } });
                }
              }}
            />
            <Button
              size="sm"
              className="text-xs h-8"
              onClick={(e) => {
                const input = (e.currentTarget as HTMLElement).previousElementSibling as HTMLInputElement | null;
                const url = input?.value?.trim();
                if (url) updateViewing.mutate({ id: v.id, updates: { video_link: url } });
              }}
            >
              Set external link
            </Button>
          </div>
        )}
        {isVideo && hasVideoLink && (
          <a href={v.video_link ?? undefined} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline">
            <ExternalLink className="w-3 h-3" /> Join video call
          </a>
        )}
        {canJoinMaiPropRoom && (
          <Link to={roomPath} className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline">
            <Video className="w-3 h-3" /> Join mAI prop video room
          </Link>
        )}
        {isVideo && !hasVideoLink && v.status !== "confirmed" && (
          <p className="text-xs text-muted-foreground mt-2">mAI prop video room opens after the viewing is confirmed.</p>
        )}
      </div>
    </div>
  );
}

export default function ViewingsTab() {
  const { profile } = useAuth();
  const { isPro } = useSubscription();
  const navigate = useNavigate();
  const { data: viewings = [], isLoading: viewingsLoading } = useViewings("requester");
  const { data: ownViewings = [] } = useViewings("owner");
  const updateViewing = useUpdateViewing();
  const updateStatus = useUpdateViewingStatus();

  const all = Array.from(new Map<string, Viewing>(
    [...viewings, ...ownViewings].map((v: Viewing) => [v.id, v])
  ).values());
  const byDate = all.reduce((acc: Record<string, Viewing[]>, v) => {
    const d = new Date(v.scheduled_at).toLocaleDateString("en-GB");
    if (!acc[d]) acc[d] = [];
    acc[d].push(v);
    return acc;
  }, {});
  const sortedDates = Object.keys(byDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  // For free users: show first FREE_VIEWING_CAP viewings, blur the rest
  const totalViewings = all.length;
  const hiddenCount = isPro ? 0 : Math.max(0, totalViewings - FREE_VIEWING_CAP);
  let freeCount = 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Viewings</h1>
        {!isPro && totalViewings > FREE_VIEWING_CAP && (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5 text-xs text-primary">
            <Lock className="w-3 h-3" />
            {hiddenCount} viewings hidden — upgrade to see all
          </div>
        )}
      </div>
      {viewingsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {all.length === 0 ? (
            <div className="glass-card rounded-xl p-12 text-center">
              <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold">No viewings scheduled</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedDates.map((dateStr) => {
                const dateCards = byDate[dateStr].map((v: Viewing) => {
                  const isOwner = ownViewings.some((o: Viewing) => o.id === v.id);
                  freeCount++;
                  const locked = !isPro && freeCount > FREE_VIEWING_CAP;
                  if (locked) return null;
                  return <ViewingCard key={v.id} v={v} isOwner={isOwner} profile={profile} updateViewing={updateViewing} updateStatus={updateStatus} />;
                }).filter(Boolean);
                if (!dateCards.length) return null;
                return (
                  <div key={dateStr}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{dateStr}</p>
                    <div className="space-y-2">{dateCards}</div>
                  </div>
                );
              })}

              {/* Upgrade prompt if items are hidden */}
              {!isPro && hiddenCount > 0 && (
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <div className="pointer-events-none select-none opacity-30 blur-sm p-4 space-y-2">
                    {Array.from({ length: Math.min(hiddenCount, 2) }).map((_, i) => (
                      <div key={i} className="h-16 bg-muted rounded-lg" />
                    ))}
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm">
                    <Lock className="w-5 h-5 text-muted-foreground" />
                    <p className="text-sm font-medium">{hiddenCount} more viewing{hiddenCount > 1 ? "s" : ""} hidden</p>
                    <Button size="sm" onClick={() => navigate("/pricing")}>Upgrade to Pro</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
