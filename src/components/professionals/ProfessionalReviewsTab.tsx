import { useState } from "react";
import { Star, ThumbsUp, PenLine, X, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocationAutocompleteInput } from "@/components/location/LocationAutocompleteInput";
import { useProfessionalReviews, useSubmitReview } from "@/hooks/useProfessionalReviews";
import type { ReviewStats } from "@/hooks/useProfessionalReviews";
import { StarRating, getReviewServiceTypes } from "./ProfileComponents";

interface Props {
  professionalId: string;
  proCategory: string;
  displayName: string;
  user: { id: string } | null;
  reviewStats: ReviewStats;
}

export function ProfessionalReviewsTab({ professionalId, proCategory, displayName, user, reviewStats }: Props) {
  const { data: reviews = [] } = useProfessionalReviews(professionalId);
  const submitReview = useSubmitReview(professionalId);

  const [reviewStarFilter, setReviewStarFilter] = useState<number | null>(null);
  const [writeOpen, setWriteOpen] = useState(false);
  const [draftRating, setDraftRating] = useState(5);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftService, setDraftService] = useState("");
  const [draftCity, setDraftCity] = useState("");
  const [draftYear] = useState(new Date().getFullYear());
  const [draftRecommended, setDraftRecommended] = useState(true);

  return (
    <div className="space-y-4">

      {/* Summary row */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center gap-6 flex-wrap">
          {/* Score */}
          <div className="text-center shrink-0 min-w-[64px]">
            <div className="font-display text-4xl font-bold text-brand-gold leading-none">
              {reviewStats.avg > 0 ? reviewStats.avg.toFixed(1) : "—"}
            </div>
            <StarRating rating={reviewStats.avg} />
            <div className="text-xs text-muted-foreground mt-1">{reviewStats.total} reviews</div>
          </div>

          {/* Bar breakdown */}
          <div className="flex-1 min-w-[180px] space-y-1">
            {([5, 4, 3, 2, 1] as const).map(star => {
              const count = reviewStats.by_star[star];
              const pct = reviewStats.total > 0 ? Math.round((count / reviewStats.total) * 100) : 0;
              return (
                <button
                  key={star}
                  onClick={() => setReviewStarFilter(reviewStarFilter === star ? null : star)}
                  className={`flex items-center gap-2 w-full group transition-opacity ${reviewStarFilter !== null && reviewStarFilter !== star ? "opacity-40" : ""}`}
                >
                  <span className="text-xs text-muted-foreground w-3 shrink-0">{star}</span>
                  <Star className="w-3 h-3 text-brand-gold fill-brand-gold shrink-0" />
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-brand-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Quick stats */}
          <div className="flex flex-col gap-2 text-sm shrink-0">
            {reviewStats.total > 0 && (
              <div className="flex items-center gap-1.5 text-brand-emerald font-medium">
                <ThumbsUp className="w-3.5 h-3.5" />
                {reviewStats.recommended_pct}% recommend
              </div>
            )}
            {user && (
              <button
                onClick={() => setWriteOpen(v => !v)}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <PenLine className="w-3.5 h-3.5" /> Write a review
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Write review form */}
      {writeOpen && (
        <div className="glass-card rounded-xl p-5 border border-primary/20 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Your review</p>
            <button aria-label="Close review form" onClick={() => setWriteOpen(false)}><X className="w-4 h-4 text-muted-foreground" aria-hidden="true" /></button>
          </div>
          {/* Star picker */}
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(s => (
              <button key={s} onClick={() => setDraftRating(s)}>
                <Star className={`w-5 h-5 transition-colors ${s <= draftRating ? "fill-brand-gold text-brand-gold" : "text-muted-foreground/30"}`} />
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={draftService}
              onChange={e => setDraftService(e.target.value)}
              className="col-span-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Service type</option>
              {getReviewServiceTypes(proCategory).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <LocationAutocompleteInput
              mode="city"
              value={draftCity}
              onChange={setDraftCity}
              placeholder="City"
              inputClassName="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <input
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            placeholder="Headline (e.g. Excellent negotiator)"
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <textarea
            rows={3}
            value={draftBody}
            onChange={e => setDraftBody(e.target.value)}
            placeholder="Your experience — keep it brief and specific."
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={draftRecommended} onChange={e => setDraftRecommended(e.target.checked)}
                className="accent-primary" />
              <span className="text-muted-foreground">I'd recommend {displayName.split(" ")[0]}</span>
            </label>
            <Button
              size="sm"
              className="bg-gradient-primary border-0 text-primary-foreground"
              disabled={submitReview.isPending || draftRating === 0}
              onClick={() => {
                submitReview.mutate({
                  rating: draftRating,
                  title: draftTitle,
                  body: draftBody,
                  service_type: draftService,
                  property_city: draftCity,
                  transaction_year: draftYear,
                  recommended: draftRecommended,
                }, { onSuccess: () => setWriteOpen(false) });
              }}
            >
              {submitReview.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Submit"}
            </Button>
          </div>
        </div>
      )}

      {/* Filter pills */}
      {reviewStats.total > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setReviewStarFilter(null)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${reviewStarFilter === null ? "bg-primary/10 text-primary border-primary/30 font-semibold" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            All ({reviewStats.total})
          </button>
          {([5, 4, 3, 2, 1] as const).filter(s => reviewStats.by_star[s] > 0).map(s => (
            <button
              key={s}
              onClick={() => setReviewStarFilter(reviewStarFilter === s ? null : s)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1 ${reviewStarFilter === s ? "bg-brand-gold/10 text-brand-gold border-brand-gold/30 font-semibold" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              <Star className="w-2.5 h-2.5 fill-current" /> {s} ({reviewStats.by_star[s]})
            </button>
          ))}
        </div>
      )}

      {/* Review cards */}
      {reviews.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <Star className="w-7 h-7 mx-auto mb-2 opacity-20" />
          No reviews yet.
          {user && !writeOpen && (
            <button onClick={() => setWriteOpen(true)} className="block mx-auto mt-2 text-primary text-xs hover:underline">
              Be the first to leave one
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {reviews
            .filter(r => reviewStarFilter === null || r.rating === reviewStarFilter)
            .map(r => {
              const name = r.reviewer?.display_name || "Anonymous";
              const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
              const date = new Date(r.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
              return (
                <div key={r.id} className="glass-card rounded-xl p-4 space-y-2">
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden">
                        {r.reviewer?.avatar_url
                          ? <img src={r.reviewer.avatar_url} alt={`${name} profile photo`} className="w-full h-full object-cover" />
                          : initials}
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-none">{name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-3 h-3 ${i < r.rating ? "fill-brand-gold text-brand-gold" : "text-muted-foreground/20"}`} />
                      ))}
                    </div>
                  </div>

                  {/* Tags row */}
                  <div className="flex gap-1.5 flex-wrap">
                    {r.service_type && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">{r.service_type}</span>
                    )}
                    {r.property_city && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5" />{r.property_city}
                      </span>
                    )}
                    {r.recommended && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-emerald/10 border border-brand-emerald/20 text-brand-emerald flex items-center gap-1">
                        <ThumbsUp className="w-2.5 h-2.5" /> Recommends
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  {r.title && <p className="text-sm font-semibold">{r.title}</p>}
                  {r.body && <p className="text-sm text-muted-foreground leading-relaxed">{r.body}</p>}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
