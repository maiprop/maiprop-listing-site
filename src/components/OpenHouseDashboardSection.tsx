import { useState } from "react";
import { Link } from "react-router-dom";
import {
  DoorOpen, Calendar, Euro, Users, Check, X, Clock,
  ChevronDown, ChevronUp, Loader2, Plus, Building2, Eye, Star,
  CheckCircle2, AlertCircle, Timer, Flame, ArrowRight, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useMyOpenHouseRegistrations,
  useMyOpenHouseOffers,
  type MyOpenHouseRegistration,
  type MyOpenHouseOffer,
} from "@/hooks/useOpenHouseAssetControl";
import type { ListingWithJoins } from "@/hooks/useListings";
import OpenHouseAssetControlPanel from "./OpenHouseAssetControlPanel";

import { fmtDate, fmtTime } from "@/lib/format";

// ── Helpers ───────────────────────────────────────────────────────────────────
function getCountdown(iso: string): { label: string; urgent: boolean } | null {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 48) return null;
  return { label: hours === 0 ? `${mins}m` : `${hours}h ${mins}m`, urgent: hours < 6 };
}

const REG_STATUS_STYLES: Record<string, string> = {
  pending:   "bg-amber-500/15 text-amber-700 border-amber-500/30",
  approved:  "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  rejected:  "bg-destructive/15 text-destructive border-destructive/30",
  attended:  "bg-primary/15 text-primary border-primary/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};
const REG_STATUS_ICONS: Record<string, React.ElementType> = {
  pending:   Timer,
  approved:  CheckCircle2,
  rejected:  X,
  attended:  Check,
  cancelled: X,
};

const OFFER_STATUS_STYLES: Record<string, string> = {
  submitted: "bg-amber-500/15 text-amber-700",
  revealed:  "bg-primary/15 text-primary",
  accepted:  "bg-emerald-500/15 text-emerald-700",
  rejected:  "bg-destructive/15 text-destructive",
  withdrawn: "bg-muted text-muted-foreground",
};

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeading({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
        {title}
        {count !== undefined && (
          <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold">{count}</span>
        )}
      </h2>
      {action}
    </div>
  );
}

// ── Expandable owner listing card ─────────────────────────────────────────────
/** A subset of fields used by the dashboard card. The dashboard receives full listings
    via myListings, so we extend ListingWithJoins for compatibility. */
type DashboardListing = ListingWithJoins;

function OwnerListingCard({ listing }: { listing: DashboardListing }) {
  const [expanded, setExpanded] = useState(false);
  const countdown = listing.open_house_date ? getCountdown(listing.open_house_date) : null;

  return (
    <div className="glass-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/40 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {listing.cover_image_url
          ? <img src={listing.cover_image_url} alt={listing.title} className="w-14 h-14 rounded-lg object-cover shrink-0" />
          : <div className="w-14 h-14 rounded-lg bg-secondary shrink-0 flex items-center justify-center"><Building2 className="w-5 h-5 text-muted-foreground" /></div>
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">{listing.title}</p>
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full",
              listing.status === "active" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"
            )}>{listing.status}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {listing.open_house_date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {fmtDate(listing.open_house_date)} · {fmtTime(listing.open_house_date)}
              </span>
            )}
            {countdown && (
              <span className={cn(
                "flex items-center gap-1 font-bold",
                countdown.urgent ? "text-destructive" : "text-brand-gold"
              )}>
                {countdown.urgent ? <Flame className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {countdown.label} away
              </span>
            )}
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {listing.views_count ?? 0}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1 hidden sm:flex"
            asChild
            onClick={(e) => e.stopPropagation()}
          >
            <Link to={`/open-house/${listing.id}`}>
              <Pencil className="w-3 h-3" /> Manage
            </Link>
          </Button>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded: Asset Control Panel */}
      {expanded && (
        <div className="border-t border-border p-4 bg-secondary/20">
          <OpenHouseAssetControlPanel listingId={listing.id} isOwner={true} listingPrice={listing.price} />
        </div>
      )}
    </div>
  );
}

// ── Participant registration card ─────────────────────────────────────────────
function ParticipantRegistrationCard({ reg }: { reg: MyOpenHouseRegistration }) {
  const listing = reg.listings;
  const StatusIcon = REG_STATUS_ICONS[reg.status] || Timer;
  const countdown = listing?.open_house_date ? getCountdown(listing.open_house_date) : null;
  const ohDate = listing?.open_house_date ? new Date(listing.open_house_date) : null;
  const ohDatePassed = ohDate ? ohDate < new Date() : false;
  const canSubmitOffer = reg.status === "attended" && ohDatePassed;

  let offerEligibilityLabel: string | null = null;
  if (reg.status === "attended") {
    offerEligibilityLabel = ohDatePassed ? "You can submit an offer" : `Offer opens after ${ohDate?.toLocaleDateString("en-GB")} ${ohDate?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  } else if (reg.status === "approved") {
    offerEligibilityLabel = "Attend the open house to unlock offer submission";
  } else if (reg.status === "pending") {
    offerEligibilityLabel = "Awaiting approval — contact unlocks after approval";
  }

  return (
    <Link to={`/open-house/${reg.listing_id}`} className="glass-card rounded-xl p-4 flex gap-3 hover:border-primary/40 transition-colors">
      {listing?.cover_image_url
        ? <img src={listing.cover_image_url} alt={listing.title} className="w-14 h-14 rounded-lg object-cover shrink-0" />
        : <div className="w-14 h-14 rounded-lg bg-secondary shrink-0 flex items-center justify-center"><DoorOpen className="w-5 h-5 text-muted-foreground" /></div>
      }
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-semibold text-sm truncate">{listing?.title || "Open House"}</p>
        {listing?.open_house_date && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span>{fmtDate(listing.open_house_date)} · {fmtTime(listing.open_house_date)}</span>
            {countdown && (
              <span className={cn(
                "ml-2 flex items-center gap-0.5 font-bold",
                countdown.urgent ? "text-destructive" : "text-brand-gold"
              )}>
                <Clock className="w-3 h-3" /> {countdown.label}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium capitalize",
            REG_STATUS_STYLES[reg.status] ?? REG_STATUS_STYLES.cancelled
          )}>
            <StatusIcon className="w-3 h-3" />
            {reg.status}
          </span>
          {reg.timeslot_index != null && (
            <span className="text-xs text-muted-foreground">Slot #{reg.timeslot_index + 1}</span>
          )}
        </div>
        {offerEligibilityLabel && (
          <p className={cn(
            "text-[11px] mt-1",
            canSubmitOffer ? "text-emerald-600 font-medium" : "text-muted-foreground"
          )}>
            {canSubmitOffer && <Euro className="w-3 h-3 inline mr-0.5" />}
            {offerEligibilityLabel}
          </p>
        )}
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground self-center shrink-0" />
    </Link>
  );
}

// ── Participant offer card ────────────────────────────────────────────────────
function ParticipantOfferCard({ offer }: { offer: MyOpenHouseOffer }) {
  const listing = offer.listings;

  return (
    <Link to={`/open-house/${offer.listing_id}`} className="glass-card rounded-xl p-4 flex gap-3 hover:border-primary/40 transition-colors">
      {listing?.cover_image_url
        ? <img src={listing.cover_image_url} alt={listing.title} className="w-14 h-14 rounded-lg object-cover shrink-0" />
        : <div className="w-14 h-14 rounded-lg bg-secondary shrink-0 flex items-center justify-center"><Euro className="w-5 h-5 text-muted-foreground" /></div>
      }
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-semibold text-sm truncate">{listing?.title || "Open House"}</p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {listing?.city && <span>{listing.city}</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-sm font-bold text-foreground">
            {offer.status === "submitted" ? "🔒 Sealed" : `€${Number(offer.amount).toLocaleString()}`}
          </span>
          <span className={cn(
            "text-xs px-2 py-0.5 rounded-full font-medium capitalize",
            OFFER_STATUS_STYLES[offer.status] ?? "bg-muted text-muted-foreground"
          )}>
            {offer.status}
          </span>
          {offer.status === "accepted" && <Star className="w-3.5 h-3.5 text-brand-gold fill-brand-gold" />}
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground self-center shrink-0" />
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OpenHouseDashboardSection({
  myListings,
}: {
  myListings: DashboardListing[];
}) {
  const { data: myRegs = [], isLoading: regsLoading } = useMyOpenHouseRegistrations();
  const { data: myOffers = [], isLoading: offersLoading } = useMyOpenHouseOffers();

  const ownerListings = myListings.filter((l) => l.listing_type === "open_house");
  const upcomingRegs = myRegs.filter((r) => r.status !== "cancelled");
  const activeOffers = myOffers.filter((o) => o.status !== "withdrawn");

  const pendingRegs = upcomingRegs.filter((r) => r.status === "pending").length;
  const approvedRegs = upcomingRegs.filter((r) => r.status === "approved").length;

  const isEmpty = ownerListings.length === 0 && myRegs.length === 0 && myOffers.length === 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <DoorOpen className="w-6 h-6 text-emerald-600" />
            Open Houses
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your open house listings, registrations, and sealed offers.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-1.5 text-sm" asChild>
            <Link to="/open-houses"><Eye className="w-4 h-4" /> Browse</Link>
          </Button>
          <Button className="gap-1.5 text-sm bg-gradient-primary border-0 text-primary-foreground" asChild>
            <Link to="/listings/new"><Plus className="w-4 h-4" /> Create Open House</Link>
          </Button>
        </div>
      </div>

      {/* ── Summary stats ─────────────────────────────────────────────────── */}
      {!isEmpty && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border p-3 bg-card">
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />My Listings</p>
            <p className="font-display text-2xl font-bold mt-1">{ownerListings.length}</p>
          </div>
          <div className="rounded-xl border border-border p-3 bg-card">
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />My Registrations</p>
            <p className="font-display text-2xl font-bold mt-1">{upcomingRegs.length}</p>
            {pendingRegs > 0 && <p className="text-[10px] text-amber-600 font-semibold mt-0.5">{pendingRegs} pending</p>}
          </div>
          <div className="rounded-xl border border-border p-3 bg-card">
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />Approved</p>
            <p className="font-display text-2xl font-bold mt-1 text-emerald-600">{approvedRegs}</p>
          </div>
          <div className="rounded-xl border border-border p-3 bg-card">
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Euro className="w-3.5 h-3.5" />Offers Made</p>
            <p className="font-display text-2xl font-bold mt-1">{activeOffers.length}</p>
          </div>
        </div>
      )}

      {/* ── Owner: My Open House Listings ─────────────────────────────────── */}
      {ownerListings.length > 0 && (
        <div className="space-y-3">
          <SectionHeading
            title="My Open House Listings"
            count={ownerListings.length}
            action={
              <Button size="sm" variant="outline" className="text-xs gap-1" asChild>
                <Link to="/listings/new"><Plus className="w-3 h-3" /> Add</Link>
              </Button>
            }
          />
          <div className="space-y-3">
            {ownerListings.map((l) => (
              <OwnerListingCard key={l.id} listing={l} />
            ))}
          </div>
        </div>
      )}

      {/* ── Participant: My Registrations ─────────────────────────────────── */}
      {(regsLoading || upcomingRegs.length > 0) && (
        <div className="space-y-3">
          <SectionHeading title="My Registrations" count={upcomingRegs.length} />
          {regsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : upcomingRegs.length === 0 ? (
            <div className="glass-card rounded-xl p-8 text-center">
              <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No registrations yet. Browse open houses to pre-register.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Info guide for pending registrations */}
              {pendingRegs > 0 && (
                <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 px-4 py-3 text-xs text-amber-700 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    <strong>{pendingRegs} registration{pendingRegs > 1 ? "s" : ""} pending</strong> — the owner will review and approve shortly. You'll be notified once approved.
                  </span>
                </div>
              )}
              {approvedRegs > 0 && (
                <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 px-4 py-3 text-xs text-emerald-700 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    <strong>{approvedRegs} approved</strong> — you're confirmed to attend. After the visit, you can submit a sealed offer from the property page.
                  </span>
                </div>
              )}
              {upcomingRegs.map((r) => (
                <ParticipantRegistrationCard key={r.id} reg={r} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Participant: My Offers ─────────────────────────────────────────── */}
      {(offersLoading || activeOffers.length > 0) && (
        <div className="space-y-3">
          <SectionHeading title="My Sealed Offers" count={activeOffers.length} />
          {offersLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-primary/5 border border-primary/15 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
                <Euro className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                <span>
                  Offers remain <strong>sealed</strong> until the owner reveals them. Once revealed, they can accept or reject. You can update your offer before the deadline.
                </span>
              </div>
              <div className="space-y-3">
                {activeOffers.map((o) => (
                  <ParticipantOfferCard key={o.id} offer={o} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {isEmpty && (
        <div className="glass-card rounded-xl p-14 text-center">
          <DoorOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
          <h3 className="font-display text-lg font-semibold mb-2">No open house activity yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Discover upcoming open houses and pre-register, or create your own open house listing to start receiving visitors.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Button variant="outline" className="gap-2" asChild>
              <Link to="/open-houses"><Eye className="w-4 h-4" /> Browse Open Houses</Link>
            </Button>
            <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
              <Link to="/listings/new"><Plus className="w-4 h-4" /> Create Listing</Link>
            </Button>
          </div>

          {/* How it works */}
          <div className="mt-8 grid sm:grid-cols-2 gap-4 text-left">
            <div className="rounded-xl bg-card border border-border p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">As a visitor</p>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Browse open houses and choose a property</li>
                <li>Pre-register to book a timeslot</li>
                <li>Get approved and attend the viewing</li>
                <li>Submit a sealed offer after your visit</li>
              </ol>
            </div>
            <div className="rounded-xl bg-card border border-border p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">As an owner / agent</p>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Create a listing with Open House type</li>
                <li>Configure timeslots and requirements</li>
                <li>Review and approve registrations</li>
                <li>Reveal and accept sealed offers</li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
