import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Loader2, Video } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { MaiPropVideoRoom } from "@/components/video/MaiPropVideoRoom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  createAbsoluteVideoRoomUrl,
  createMaiPropVideoRoomDisplayName,
  createMaiPropVideoRoomTopic,
  createViewingVideoRoomPath,
  getVideoPlatformName,
  normalizeVideoLink,
} from "@/lib/videoRooms";
import type { Tables } from "@/integrations/supabase/types";

type ViewingVideoRoom = Tables<"viewings"> & {
  listings?: {
    title: string;
    city: string | null;
    cover_image_url: string | null;
    address: string | null;
  } | null;
};

export default function VideoViewingRoom() {
  const { viewingId } = useParams<{ viewingId: string }>();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const userName = profile?.display_name ?? user?.email ?? "Guest";

  const { data: viewing, isLoading, error } = useQuery({
    queryKey: ["video-viewing-room", viewingId],
    queryFn: async () => {
      if (!viewingId) return null;
      const { data, error: queryError } = await supabase
        .from("viewings")
        .select("*, listings(title, city, cover_image_url, address)")
        .eq("id", viewingId)
        .single();
      if (queryError) throw queryError;
      return data as ViewingVideoRoom;
    },
    enabled: Boolean(viewingId),
  });

  if (isLoading || (!viewing && !error)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !viewing || viewing.viewing_type !== "video") {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 text-center px-4">
          <p className="text-muted-foreground">Video viewing not found.</p>
          <Link to="/dashboard?tab=viewings">
            <Button variant="outline" className="mt-4">Back to Viewings</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (viewing.status !== "confirmed") {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 text-center px-4">
          <p className="text-muted-foreground">Video viewing is not ready yet.</p>
          <Link to="/dashboard?tab=viewings">
            <Button variant="outline" className="mt-4">Back to Viewings</Button>
          </Link>
        </div>
      </div>
    );
  }

  const externalVideoLink = normalizeVideoLink(viewing.video_link);
  const platformName = getVideoPlatformName(viewing.video_link);
  const roomPath = createViewingVideoRoomPath(viewing.id);
  const roomUrl = createAbsoluteVideoRoomUrl(roomPath);
  const roomTopic = createMaiPropVideoRoomTopic("viewing", viewing.id);
  const roomDisplayName = createMaiPropVideoRoomDisplayName("viewing", viewing.id);
  const propertyName = viewing.listings?.title ?? "Property viewing";
  const scheduledLabel = new Date(viewing.scheduled_at).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const header = (
    <div className="border-b border-border bg-card/80 py-4 px-4">
      <div className="container flex items-center gap-4">
        <Link to="/dashboard?tab=viewings" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to viewings
        </Link>
        <div className="flex-1 flex items-center gap-3 min-w-0">
          {viewing.listings?.cover_image_url && <img src={viewing.listings.cover_image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />}
          <div className="min-w-0">
            <p className="font-display font-semibold text-foreground truncate">{propertyName}</p>
            <p className="text-xs text-muted-foreground truncate">{viewing.listings?.city ?? viewing.listings?.address ?? "Video viewing"} - {scheduledLabel}</p>
          </div>
        </div>
        <a
          href={externalVideoLink ?? roomUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          Open in new window <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );

  if (externalVideoLink) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-16">
          {header}
          <div className="container py-12 max-w-xl mx-auto">
            <div className="glass-card rounded-xl border border-primary/20 overflow-hidden">
              <div className="p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Video className="w-10 h-10 text-primary" />
                </div>
                <h2 className="font-display text-xl font-bold mb-1">Video viewing for {propertyName}</h2>
                <p className="text-sm text-muted-foreground mb-2">{scheduledLabel}</p>
                <p className="text-xs text-muted-foreground mb-6">
                  The host set {platformName ?? "an external video link"} for this viewing.
                </p>
                <a
                  href={externalVideoLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-8 py-3 rounded-xl hover:bg-primary/90 transition-colors"
                >
                  <Video className="w-5 h-5" /> Open {platformName ?? "video call"}
                </a>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-6">mAI Prop - Property video viewing</p>
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
        <MaiPropVideoRoom
          roomTopic={roomTopic}
          roomDisplayName={roomDisplayName}
          roomUrl={roomUrl}
          userName={userName}
          subject={{
            title: propertyName,
            subtitle: `${viewing.status} video viewing - ${scheduledLabel}`,
            avatarUrl: viewing.listings?.cover_image_url,
          }}
          contextLabel="Property video viewing"
          backHref="/dashboard?tab=viewings"
          backLabel="Return to Viewings"
          notesStorageKey={`viewing-call-notes-${viewing.id}`}
          notesPlaceholder="Add viewing notes, questions, and follow-up tasks..."
          summaryTitle="mAI Prop Video Viewing Summary"
          summaryFilePrefix={`video-viewing-${propertyName.replace(/\s+/g, "-").toLowerCase()}`}
          onReturn={() => navigate("/dashboard?tab=viewings")}
        />
      </div>
    </div>
  );
}
