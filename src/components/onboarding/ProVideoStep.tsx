import { Video, ArrowRight, Loader2 } from "lucide-react";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  videoLink: string;
  calendarNotes: string;
  loading: boolean;
  authLoading: boolean;
  onVideoLinkChange: (v: string) => void;
  onCalendarNotesChange: (v: string) => void;
  onSave: () => void;
  onSkip: () => void;
}

export function ProVideoStep({ videoLink, calendarNotes, loading, authLoading, onVideoLinkChange, onCalendarNotesChange, onSave, onSkip }: Props) {
  return (
    <div>
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-brand-purple/10 border border-brand-purple/25 flex items-center justify-center mx-auto mb-4">
          <Video className="w-7 h-7 text-brand-purple" />
        </div>
        <h1 className="font-display font-bold text-2xl text-foreground mb-1">Video Consultations</h1>
        <p className="text-muted-foreground text-sm">Add your meeting link so clients can book video calls with you</p>
      </div>
      <div className="space-y-4 mb-6">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Meeting Link</label>
          <div className="relative">
            <Video className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="url"
              placeholder="https://meet.google.com/xxx or https://zoom.us/j/..."
              value={videoLink}
              onChange={e => onVideoLinkChange(e.target.value)}
              className="w-full bg-secondary border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Supports Google Meet, Zoom, Teams, Whereby, and any video link</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Booking Notes (optional)</label>
          <textarea
            rows={2}
            placeholder="e.g. 'Please bring property documents to the call'"
            value={calendarNotes}
            onChange={e => onCalendarNotesChange(e.target.value)}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none"
          />
        </div>
      </div>
      <div className="bg-amber-500/8 border border-amber-500/25 rounded-2xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Crown className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-foreground">Professional plans</span>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          Review the current professional plans in a new tab without leaving your unsaved onboarding details.
        </p>
        <Button asChild variant="outline" size="sm" className="w-full border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300">
          <a href="/pricing?audience=professional" target="_blank" rel="noreferrer">
            <Crown className="w-3.5 h-3.5 mr-1.5" /> View professional plans
          </a>
        </Button>
      </div>
      <Button
        className="w-full bg-gradient-primary border-0 text-primary-foreground"
        disabled={loading || authLoading}
        onClick={onSave}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Finish Setup <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
      <button
        className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={onSkip}
      >
        Skip for now →
      </button>
    </div>
  );
}
