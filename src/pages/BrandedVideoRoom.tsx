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
  isUuid,
  normalizeVideoLink,
} from "@/lib/videoRooms";

type ProfessionalVideoProfile = {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  title: string | null;
  category: string | null;
  video_link: string | null;
};

type ConsultationVideoRequest = {
  id: string;
  professional_id: string;
  requester_id: string | null;
  requester_name: string;
  requester_email: string;
  service: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  request_type: string;
  status: string;
  meeting_type: string | null;
};

export default function BrandedVideoRoom() {
  const { professionalId, consultationId } = useParams<{ professionalId: string; consultationId?: string }>();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const userName = profile?.display_name ?? user?.email ?? "Guest";

  const { data: room, isLoading, error } = useQuery({
    queryKey: ["professional-video-room", professionalId, consultationId, user?.id],
    queryFn: async () => {
      if (!isUuid(professionalId) || (consultationId && !isUuid(consultationId)) || !user?.id) return null;
      const { data, error: queryError } = await supabase
        .from("professionals")
        .select("id, user_id, display_name, avatar_url, title, category, video_link")
        .eq("id", professionalId)
        .maybeSingle();
      if (queryError) throw queryError;
      if (!data) return null;
      const professional = data as ProfessionalVideoProfile;
      const isProfessionalOwner = professional.user_id === user.id;

      if (!consultationId) {
        return isProfessionalOwner ? { professional, consultation: null } : null;
      }

      const { data: consultation, error: consultationError } = await supabase
        .from("consultation_requests")
        .select("id, professional_id, requester_id, requester_name, requester_email, service, preferred_date, preferred_time, request_type, status, meeting_type")
        .eq("id", consultationId)
        .eq("professional_id", professional.id)
        .eq("request_type", "consultation")
        .eq("status", "confirmed")
        .eq("meeting_type", "video")
        .maybeSingle();

      if (consultationError) throw consultationError;
      const scopedConsultation = consultation as ConsultationVideoRequest | null;
      if (!scopedConsultation) return null;
      if (isProfessionalOwner || scopedConsultation.requester_id === user.id) {
        return { professional, consultation: scopedConsultation };
      }
      return null;
    },
    enabled: Boolean(professionalId && user?.id),
  });

  if (!user?.id || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !room) {
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

  const { professional: pro, consultation } = room;
  const externalVideoLink = normalizeVideoLink(pro.video_link);
  const platformName = getVideoPlatformName(pro.video_link);
  const roomPath = createProfessionalVideoRoomPath(pro.id, consultation?.id);
  const roomUrl = createAbsoluteVideoRoomUrl(roomPath);
  const roomKind = consultation ? "consultation" : "professional";
  const roomId = consultation?.id ?? pro.id;
  const roomTopic = createMaiPropVideoRoomTopic(roomKind, roomId);
  const roomDisplayName = createMaiPropVideoRoomDisplayName(roomKind, roomId);
  const professionalName = pro.display_name ?? "Professional";
  const consultationSchedule = [consultation?.preferred_date, consultation?.preferred_time].filter(Boolean).join(" ");
  const professionalSubtitle = consultation?.service
    ? `${consultation.service}${consultationSchedule ? ` - ${consultationSchedule}` : ""}`
    : pro.title ?? pro.category ?? "Professional";

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
          notesStorageKey={`consultation-call-notes-${roomId}`}
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
