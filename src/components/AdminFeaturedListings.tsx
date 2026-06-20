/**
 * Featured Listings admin panel. Admin-only.
 * Manage is_featured and priority_placement for all active listings.
 * Includes view analytics: views_count, featured_since, and a performance indicator.
 */

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Search, ImageOff, TrendingUp, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { getListingDetailPath } from "@/lib/listingRoutes";
import { parseMutationInput, rowUpdateMutationSchema } from "@/lib/mutationSchemas";

type ListingStatus = Database["public"]["Enums"]["listing_status"];
type PropertyType = Database["public"]["Enums"]["property_type"];

type FeaturedListingActionUpdates = {
  is_featured?: boolean;
  priority_placement?: number;
  featured_until?: string | null;
};

type AdminFeaturedListingActionResponse = {
  ok?: boolean;
  error?: string | null;
};

type FeaturedListing = {
  id: string;
  title: string;
  city: string;
  property_type: PropertyType;
  price: number;
  cover_image_url: string | null;
  is_featured: boolean;
  priority_placement: number;
  status: ListingStatus;
  owner_id: string | null;
  seller_name: string | null;
  views_count: number;
  /** updated_at used as a proxy for when is_featured was last changed */
  featured_since: string | null;
  featured_until: string | null;
  listing_type: string;
};

type RawListingRow = {
  id: string;
  title: string;
  city: string;
  property_type: PropertyType;
  price: number;
  cover_image_url: string | null;
  is_featured: boolean;
  priority_placement: number;
  status: ListingStatus;
  owner_id: string | null;
  views_count: number;
  updated_at: string | null;
  featured_until: string | null;
  listing_type: string;
};

type ProfilesPublicRow = {
  user_id: string;
  display_name: string | null;
};

const STATUS_BADGE: Record<
  ListingStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  active:  { label: "Active",  variant: "default" },
  draft:   { label: "Draft",   variant: "secondary" },
  paused:  { label: "Paused",  variant: "outline" },
  sold:    { label: "Sold",    variant: "destructive" },
  rented:  { label: "Rented",  variant: "destructive" },
  expired: { label: "Expired", variant: "outline" },
};

import { formatPrice, formatDate } from "@/lib/format";

/** Returns a colored dot className based on views_count thresholds */
function performanceDotClass(views: number): string {
  if (views > 100) return "bg-green-500";
  if (views >= 50) return "bg-yellow-400";
  return "bg-red-500";
}

function performanceLabel(views: number): string {
  if (views > 100) return "High";
  if (views >= 50) return "Medium";
  return "Low";
}

async function updateFeaturedListing(
  listingId: string,
  updates: FeaturedListingActionUpdates,
  label: string,
): Promise<void> {
  const payload = parseMutationInput(
    rowUpdateMutationSchema,
    { id: listingId, updates },
    label,
  );
  const { data, error } = await supabase.functions.invoke<AdminFeaturedListingActionResponse>(
    "admin-featured-listing-action",
    { body: payload },
  );

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

async function fetchFeaturedListings(): Promise<FeaturedListing[]> {
  const { data: listings, error: listingsError } = await supabase
    .from("listings")
    .select(
      "id, title, city, property_type, listing_type, price, cover_image_url, is_featured, priority_placement, featured_until, status, owner_id, views_count, updated_at",
    )
    .order("is_featured", { ascending: false })
    .order("priority_placement", { ascending: false })
    .order("created_at", { ascending: false });

  if (listingsError) throw listingsError;
  if (!listings || listings.length === 0) return [];

  const rows = (listings as unknown) as RawListingRow[];

  // Collect unique owner_ids to fetch profile names
  const ownerIds = [
    ...new Set(rows.map((l) => l.owner_id).filter((id): id is string => id !== null)),
  ];

  const profileMap: Record<string, string | null> = {};
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles_public")
      .select("user_id, display_name")
      .in("user_id", ownerIds);

    if (profiles) {
      (profiles as ProfilesPublicRow[]).forEach((p) => {
        profileMap[p.user_id] = p.display_name;
      });
    }
  }

  return rows.map((l) => ({
    ...l,
    seller_name: l.owner_id ? (profileMap[l.owner_id] ?? null) : null,
    views_count: l.views_count ?? 0,
    featured_since: l.updated_at ?? null,
    featured_until: l.featured_until ?? null,
    listing_type: l.listing_type ?? "sale",
  }));
}

export default function AdminFeaturedListings() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pendingPriority, setPendingPriority] = useState<Record<string, string>>({});
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [updatingPriority, setUpdatingPriority] = useState<Record<string, boolean>>({});
  const [updatingUntil, setUpdatingUntil] = useState<Record<string, boolean>>({});

  const { data: listings = [], isLoading, error } = useQuery<FeaturedListing[]>({
    queryKey: ["admin-featured-listings"],
    queryFn: fetchFeaturedListings,
  });

  const featuredCount = listings.filter((l) => l.is_featured).length;

  const totalFeaturedImpressions = listings
    .filter((l) => l.is_featured)
    .reduce((sum, l) => sum + (l.views_count ?? 0), 0);

  const filtered = listings.filter((l) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return l.title.toLowerCase().includes(q) || l.city.toLowerCase().includes(q);
  });

  const handleToggleFeatured = useCallback(
    async (listing: FeaturedListing) => {
      setToggling((prev) => ({ ...prev, [listing.id]: true }));
      const next = !listing.is_featured;
      try {
        await updateFeaturedListing(listing.id, { is_featured: next }, "featured listing update");
        await queryClient.invalidateQueries({ queryKey: ["admin-featured-listings"] });
        toast.success(next ? "Listing marked as featured" : "Listing removed from featured");
      } catch (e: unknown) {
        toast.error((e as Error)?.message ?? "Failed to update featured status");
      } finally {
        setToggling((prev) => ({ ...prev, [listing.id]: false }));
      }
    },
    [queryClient],
  );

  const handlePriorityBlur = useCallback(
    async (listing: FeaturedListing) => {
      const raw = pendingPriority[listing.id];
      if (raw === undefined) return; // no change

      const parsed = parseInt(raw, 10);
      if (isNaN(parsed)) {
        toast.error("Priority must be a number between 1 and 10");
        setPendingPriority((prev) => {
          const next = { ...prev };
          delete next[listing.id];
          return next;
        });
        return;
      }
      const clamped = Math.min(10, Math.max(1, parsed));
      if (clamped === listing.priority_placement) {
        setPendingPriority((prev) => {
          const next = { ...prev };
          delete next[listing.id];
          return next;
        });
        return;
      }

      setUpdatingPriority((prev) => ({ ...prev, [listing.id]: true }));
      try {
        await updateFeaturedListing(listing.id, { priority_placement: clamped }, "featured priority update");
        await queryClient.invalidateQueries({ queryKey: ["admin-featured-listings"] });
        toast.success(`Priority updated to ${clamped}`);
      } catch (e: unknown) {
        toast.error((e as Error)?.message ?? "Failed to update priority");
      } finally {
        setUpdatingPriority((prev) => ({ ...prev, [listing.id]: false }));
        setPendingPriority((prev) => {
          const next = { ...prev };
          delete next[listing.id];
          return next;
        });
      }
    },
    [pendingPriority, queryClient],
  );

  const handleUntilChange = useCallback(
    async (listing: FeaturedListing, dateValue: string) => {
      setUpdatingUntil((prev) => ({ ...prev, [listing.id]: true }));
      const newVal = dateValue ? new Date(dateValue).toISOString() : null;
      try {
        await updateFeaturedListing(listing.id, { featured_until: newVal }, "featured expiry update");
        await queryClient.invalidateQueries({ queryKey: ["admin-featured-listings"] });
        toast.success(newVal ? `Expires ${formatDate(newVal)}` : "Expiry cleared");
      } catch (e: unknown) {
        toast.error((e as Error)?.message ?? "Failed to update expiry");
      } finally {
        setUpdatingUntil((prev) => ({ ...prev, [listing.id]: false }));
      }
    },
    [queryClient],
  );

  const getDetailPath = (listing: FeaturedListing): string => getListingDetailPath(listing);

  const getPriorityValue = (listing: FeaturedListing): string => {
    return pendingPriority[listing.id] !== undefined
      ? pendingPriority[listing.id]
      : String(listing.priority_placement);
  };

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive text-sm">
        Failed to load listings: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Star className="w-5 h-5 text-primary" />
            Featured Listings
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Control which listings appear as featured and set their display priority.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm shrink-0">
          <Badge variant="default" className="gap-1.5 text-xs">
            <Star className="w-3 h-3" />
            {featuredCount} featured
          </Badge>
          <span className="text-muted-foreground">of {listings.length} total</span>
        </div>
      </div>

      {/* Analytics summary bar */}
      {!isLoading && featuredCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm">
          <TrendingUp className="w-4 h-4 text-primary shrink-0" />
          <span className="text-muted-foreground">Total featured impressions:</span>
          <span className="font-semibold tabular-nums">
            {totalFeaturedImpressions.toLocaleString("en-US")}
          </span>
          <span className="text-muted-foreground">views across {featuredCount} featured listing{featuredCount !== 1 ? "s" : ""}</span>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by title or city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {search ? "No listings match your search." : "No listings found."}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-14">Photo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Listing</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Seller</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Price</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Views</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Since</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Perf.</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Expires</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Featured</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Priority</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((listing) => {
                const statusCfg =
                  STATUS_BADGE[listing.status] ?? { label: listing.status, variant: "outline" as const };
                const isTogglingThis = toggling[listing.id] ?? false;
                const isUpdatingPriorityThis = updatingPriority[listing.id] ?? false;
                const isUpdatingUntilThis = updatingUntil[listing.id] ?? false;
                const dotClass = performanceDotClass(listing.views_count);
                const perfLabel = performanceLabel(listing.views_count);

                return (
                  <tr
                    key={listing.id}
                    className={`transition-colors hover:bg-muted/30 ${listing.is_featured ? "bg-primary/5" : ""}`}
                  >
                    {/* Thumbnail */}
                    <td className="px-4 py-3">
                      {listing.cover_image_url ? (
                        <img
                          src={listing.cover_image_url}
                          alt={listing.title}
                          className="w-12 h-12 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <ImageOff className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </td>

                    {/* Title / city / type */}
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="font-medium truncate leading-tight">{listing.title}</p>
                      <p className="text-muted-foreground text-xs mt-0.5 truncate">
                        {listing.city} &middot; {listing.property_type.replace(/_/g, " ")}
                      </p>
                    </td>

                    {/* Seller */}
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell max-w-[140px]">
                      <span className="truncate block">
                        {listing.seller_name ?? (
                          <span className="italic text-xs">Unknown</span>
                        )}
                      </span>
                    </td>

                    {/* Price */}
                    <td className="px-4 py-3 font-medium hidden sm:table-cell whitespace-nowrap">
                      {formatPrice(listing.price)}
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge variant={statusCfg.variant} className="text-xs">
                        {statusCfg.label}
                      </Badge>
                    </td>

                    {/* Views count */}
                    <td className="px-4 py-3 text-center hidden lg:table-cell tabular-nums">
                      {listing.views_count.toLocaleString("en-US")}
                    </td>

                    {/* Featured since (approximated via updated_at) */}
                    <td className="px-4 py-3 text-center hidden xl:table-cell text-muted-foreground text-xs whitespace-nowrap">
                      {listing.is_featured ? formatDate(listing.featured_since) : "—"}
                    </td>

                    {/* Performance indicator */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex items-center justify-center gap-1.5">
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`}
                          title={`${perfLabel} performance (${listing.views_count} views)`}
                        />
                        <span className="text-xs text-muted-foreground">{perfLabel}</span>
                      </div>
                    </td>

                    {/* Expires column */}
                    <td className="px-4 py-3 text-center hidden xl:table-cell">
                      <input
                        type="date"
                        disabled={isUpdatingUntilThis}
                        value={listing.featured_until ? listing.featured_until.slice(0, 10) : ""}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => handleUntilChange(listing, e.target.value)}
                        className={`w-32 h-8 px-2 rounded-md border bg-background text-xs outline-none focus:border-primary disabled:opacity-50 ${
                          listing.featured_until && new Date(listing.featured_until) < new Date()
                            ? "border-destructive text-destructive"
                            : "border-border text-foreground"
                        }`}
                        aria-label={`Featured until for ${listing.title}`}
                        title={listing.featured_until ? `Expires ${formatDate(listing.featured_until)}` : "No expiry set"}
                      />
                    </td>

                    {/* Featured toggle */}
                    <td className="px-4 py-3 text-center">
                      <Switch
                        checked={listing.is_featured}
                        disabled={isTogglingThis}
                        onCheckedChange={() => handleToggleFeatured(listing)}
                        aria-label={`Toggle featured for ${listing.title}`}
                      />
                    </td>

                    {/* Priority input */}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        disabled={isUpdatingPriorityThis}
                        value={getPriorityValue(listing)}
                        onChange={(e) =>
                          setPendingPriority((prev) => ({
                            ...prev,
                            [listing.id]: e.target.value,
                          }))
                        }
                        onBlur={() => handlePriorityBlur(listing)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        className="w-16 h-8 text-center rounded-md border border-border bg-background text-sm outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label={`Priority for ${listing.title}`}
                      />
                    </td>

                    {/* View listing link */}
                    <td className="px-4 py-3 text-center">
                      <a
                        href={getDetailPath(listing)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors inline-flex"
                        title="View listing"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
