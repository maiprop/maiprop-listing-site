/**
 * MyListingsSection — the "My Listings" tab body of the Dashboard.
 *
 * Extracted from Dashboard.tsx as part of the maintainability work tracked
 * in docs/testing.md and the audit reconciliation. The section is fully
 * self-contained: it owns its own data hooks, mutation hooks, and local
 * filter state. The parent only needs to pass `bioType` and `role`, both
 * of which it already derives from the auth context for nav decisions.
 *
 * React Query dedupes the `useMyListings()` call against the parent's
 * concurrent invocation, so there's no extra network cost.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Building2,
  Crown,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Edit2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  useMyListings,
  useUpdateListing,
  useDeleteListing,
} from "@/hooks/useListings";
import { cn } from "@/lib/utils";
import type { ParticipantId } from "@/lib/participantConfig";
import type { DashboardRole } from "@/lib/dashboardNav";

type ListingFilter = "all" | "off_market" | "new_build";

interface MyListingsSectionProps {
  bioType: ParticipantId | null;
  role: DashboardRole;
}

/** Roles that should see the off-market / new-building filter chips. */
const FILTER_ELIGIBLE_ROLES: ReadonlyArray<DashboardRole> = [
  "agent",
  "seller",
  "developer",
  "institutional",
];

export function MyListingsSection({ bioType, role }: MyListingsSectionProps) {
  const { data: myListings = [], isLoading } = useMyListings();
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();

  const [listingFilter, setListingFilter] = useState<ListingFilter>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const isSellSide = role === "agent" || role === "developer";
  const showFilterChips =
    FILTER_ELIGIBLE_ROLES.includes(role) &&
    myListings.some((l) => l.is_off_market || l.listing_type === "new_build");

  const toggleListingStatus = (id: string, currentStatus: string) => {
    updateListing.mutate({
      id,
      updates: {
        status: currentStatus === "active" ? "paused" : "active",
      },
    });
  };

  const filteredListings =
    listingFilter === "off_market"
      ? myListings.filter((l) => l.is_off_market)
      : listingFilter === "new_build"
        ? myListings.filter((l) => l.listing_type === "new_build")
        : myListings;

  const filterChips: { key: ListingFilter; label: string }[] = [
    { key: "all", label: `All (${myListings.length})` },
    {
      key: "off_market",
      label: `Off-market (${myListings.filter((l) => l.is_off_market).length})`,
    },
    {
      key: "new_build",
      label: `New Buildings (${myListings.filter((l) => l.listing_type === "new_build").length})`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-display text-2xl font-bold">My Listings</h1>
        <Button
          className="bg-gradient-primary border-0 text-primary-foreground gap-2"
          asChild
        >
          <Link to="/listings/new">
            <Plus className="w-4 h-4" /> Create Listing
          </Link>
        </Button>
      </div>

      {showFilterChips && (
        <div className="flex gap-2 flex-wrap text-xs">
          {filterChips.map((f) => (
            <button
              key={f.key}
              onClick={() => setListingFilter(f.key)}
              className={cn(
                "px-3 py-1.5 rounded-full border font-medium transition-colors",
                listingFilter === f.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : myListings.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No listings yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Start by creating your first property listing
          </p>
          <Button
            className="bg-gradient-primary border-0 text-primary-foreground gap-2"
            asChild
          >
            <Link
              to={
                bioType === "developer"
                  ? "/listings/new-building"
                  : "/listings/new"
              }
            >
              <Plus className="w-4 h-4" /> Create First Listing
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredListings.map((l) => {
            const isProjectAd = l.listing_type === "new_build";
            const editHref = isProjectAd
              ? (l.project_id ? `/projects/${l.project_id}` : "/projects")
              : `/listings/${l.id}/edit`;
            const editLabel = isProjectAd ? "Manage project" : "Edit listing";
            return (
            <div
              key={l.id}
              data-testid={`my-listing-card-${l.id}`}
              className="glass-card rounded-xl p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex min-w-0 gap-3 sm:flex-1 sm:items-center">
              <img
                src={
                  l.cover_image_url ||
                  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=200&q=60"
                }
                alt=""
                className="w-16 h-16 rounded-lg object-cover shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <p className="min-w-0 basis-full font-semibold text-sm leading-tight sm:basis-auto sm:flex-1 sm:truncate">{l.title}</p>
                  {l.is_featured && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold border border-brand-gold/30 whitespace-nowrap">
                      Spotlight
                    </span>
                  )}
                  {(l.tags || []).includes("exclusive") && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium whitespace-nowrap">
                      Exclusive
                    </span>
                  )}
                  {l.is_off_market && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground whitespace-nowrap">
                      Off-market
                    </span>
                  )}
                  {l.listing_type === "new_build" && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                      New Building
                    </span>
                  )}
                </div>
                <p
                  data-testid={`my-listing-meta-${l.id}`}
                  className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 break-words"
                >
                  {l.city} · €{Number(l.price).toLocaleString()} · {l.sqm}m²
                </p>
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full mt-1 inline-block",
                    l.status === "active"
                      ? "bg-brand-emerald/20 text-brand-emerald"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {l.status}
                </span>
              </div>
              </div>
              <div
                data-testid={`my-listing-actions-${l.id}`}
                className="flex w-full items-center gap-1 flex-wrap justify-between border-t border-border/60 pt-3 sm:w-auto sm:shrink-0 sm:justify-end sm:border-t-0 sm:pt-0"
              >
                {isSellSide && (
                  <>
                    <button
                      onClick={() =>
                        updateListing.mutate({
                          id: l.id,
                          updates: { is_featured: !l.is_featured },
                        })
                      }
                      className={cn(
                        "p-2 rounded-lg transition-colors",
                        l.is_featured
                          ? "bg-brand-gold/20 text-brand-gold"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                      )}
                      title={
                        l.is_featured
                          ? "Spotlight (click to remove)"
                          : "Add Spotlight badge"
                      }
                    >
                      <Crown className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      defaultValue={l.priority_placement ?? 0}
                      onBlur={(e) => {
                        const v = Math.min(
                          10,
                          Math.max(0, Number(e.target.value) || 0),
                        );
                        if (v !== (l.priority_placement ?? 0)) {
                          updateListing.mutate({
                            id: l.id,
                            updates: { priority_placement: v },
                          });
                        }
                      }}
                      className="w-12 px-1.5 py-1 rounded-lg border border-border bg-secondary text-xs text-center"
                      title="Priority 0–10"
                    />
                  </>
                )}
                <span className="text-xs text-muted-foreground mr-auto sm:mr-2 whitespace-nowrap">
                  {l.views_count} views
                </span>
                <Link
                  to={editHref}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                  aria-label={editLabel}
                  title={editLabel}
                >
                  <Edit2 className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => toggleListingStatus(l.id, l.status)}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                  aria-label={
                    l.status === "active"
                      ? "Pause listing"
                      : "Activate listing"
                  }
                >
                  {l.status === "active" ? (
                    <ToggleRight className="w-4 h-4 text-primary" />
                  ) : (
                    <ToggleLeft className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => setConfirmDeleteId(l.id)}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                  aria-label="Delete listing"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this listing?"
        description="This action cannot be undone. The listing and its images will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDeleteId) {
            deleteListing.mutate(confirmDeleteId);
            setConfirmDeleteId(null);
          }
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

export default MyListingsSection;
