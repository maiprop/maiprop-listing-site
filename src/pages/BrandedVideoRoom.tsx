import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Video, ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Branded video room — embeds the professional's video call link in a branded frame.
 * Used when clients join a consultation video call.
 */
export default function BrandedVideoRoom() {
  const { professionalId } = useParams();

  const { data: pro, isLoading, error } = useQuery({
    queryKey: ["professional", professionalId],
    queryFn: async () => {
      if (!professionalId) return null;
      const { data, error } = await supabase
        .from("professionals")
        .select("id, display_name, avatar_url, title, category, video_link")
        .eq("id", professionalId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!professionalId,
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
          <Link to="/professionals"><Button variant="outline" className="mt-4">Back to Professionals</Button></Link>
        </div>
      </div>
    );
  }

  if (!pro.video_link) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 text-center px-4">
          <Video className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No video link configured</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">This professional has not set up a video call link yet.</p>
          <Link to={`/professionals/${pro.id}`}><Button variant="outline">View Profile</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* Branded header */}
        <div className="border-b border-border bg-card/80 py-4 px-4">
          <div className="container flex items-center gap-4">
            <Link to={`/professionals/${pro.id}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to profile
            </Link>
            <div className="flex-1 flex items-center gap-3">
              {pro.avatar_url && (
                <img src={pro.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
              )}
              <div>
                <p className="font-display font-semibold text-foreground">{pro.display_name}</p>
                <p className="text-xs text-muted-foreground">{pro.title || pro.category}</p>
              </div>
            </div>
            <a
              href={pro.video_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              Open in new window <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Branded video room — most platforms block iframe, so we use a branded join card */}
        <div className="container py-12 max-w-xl mx-auto">
          <div className="glass-card rounded-2xl border border-primary/20 overflow-hidden">
            <div className="p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Video className="w-10 h-10 text-primary" />
              </div>
              <h2 className="font-display text-xl font-bold mb-1">Video consultation with {pro.display_name}</h2>
              <p className="text-sm text-muted-foreground mb-6">{pro.title || pro.category}</p>
              <a
                href={pro.video_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-8 py-3 rounded-xl hover:bg-primary/90 transition-colors"
              >
                <Video className="w-5 h-5" /> Join video call
              </a>
              <p className="text-xs text-muted-foreground mt-4">
                Opens Zoom, Whereby, or your platform in a new tab
              </p>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-6">
            mAI Prop · Professional consultation
          </p>
        </div>
      </div>
    </div>
  );
}
