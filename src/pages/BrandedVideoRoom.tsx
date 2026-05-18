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
  createProfessionalVideoRoomPath,
  getVideoPlatformName,
  normalizeVideoLink,
} from "@/lib/videoRooms";

type ProfessionalVideoProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  title: string | null;
  category: string | null;
  video_link: string | null;
};

export default function BrandedVideoRoom() {
  const { professionalId } = useParams<{ professionalId: string }>();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const userName = profile?.display_name ?? user?.email ?? "Guest";

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

  const externalVideoLink = normalizeVideoLink(pro.video_link);
  const platformName = getVideoPlatformName(pro.video_link);
  const roomPath = createProfessionalVideoRoomPath(pro.id);
  const roomUrl = createAbsoluteVideoRoomUrl(roomPath);
  const roomTopic = createMaiPropVideoRoomTopic("professional", pro.id);
  const roomDisplayName = createMaiPropVideoRoomDisplayName("professional", pro.id);
  const professionalName = pro.display_name ?? "Professional";
  const professionalSubtitle = pro.title ?? pro.category ?? "Professional";

  const header = (
    <div className="border-b border-border bg-card/80 py-4 px-4">
      <div className="container flex items-center gap-4">
        <Link to={`/professionals/${pro.id}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to profile
        </Link>
        <div className="flex-1 flex items-center gap-3 min-w-0">
          {pro.avatar_url && <img src={pro.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />}
          <div className="min-w-0">
            <p className="font-display font-semibold text-foreground truncate">{professionalName}</p>
            <p className="text-xs text-muted-foreground truncate">{professionalSubtitle}</p>
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
                <h2 className="font-display text-xl font-bold mb-1">Video consultation with {professionalName}</h2>
                <p className="text-sm text-muted-foreground mb-2">{professionalSubtitle}</p>
                <p className="text-xs text-muted-foreground mb-6">
                  This professional uses {platformName ?? "an external video provider"}.
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
            <p className="text-center text-xs text-muted-foreground mt-6">mAI Prop - Professional consultation</p>
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
            title: professionalName,
            subtitle: professionalSubtitle,
            avatarUrl: pro.avatar_url,
          }}
          contextLabel="Professional consultation"
          backHref={`/professionals/${pro.id}`}
          backLabel="Return to Profile"
          notesStorageKey={`consultation-call-notes-${pro.id}`}
          notesPlaceholder="Add consultation notes, action items, and follow-up tasks..."
          summaryTitle="mAI Prop Consultation Summary"
          summaryFilePrefix={`consultation-summary-${professionalName.replace(/\s+/g, "-").toLowerCase()}`}
          followUpHref={`/professionals/${pro.id}`}
          followUpLabel="Book Follow-up"
          onReturn={() => navigate(`/professionals/${pro.id}`)}
        />
      </div>
    </div>
  );
}
