/**
 * Listing Promotions admin panel. Admin-only.
 * Campaign truth comes from the allocation ledger and is measured only inside
 * each campaign window. Lifetime listing views are intentionally excluded.
 */

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Search, ImageOff, BarChart3, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { getListingDetailPath } from "@/lib/listingRoutes";
import { parseMutationInput, rowUpdateMutationSchema } from "@/lib/mutationSchemas";

type ListingStatus = Database["public"]["Enums"]["listing_status"];
type CampaignRow = Database["public"]["Functions"]["get_admin_listing_promotion_campaigns"]["Returns"][number];

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
  property_type: string;
  price: number;
  cover_image_url: string | null;
  is_featured: boolean;
  priority_placement: number;
  status: ListingStatus;
  owner_id: string | null;
  seller_name: string | null;
  featured_until: string | null;
  priority_until: string | null;
  listing_type: string;
  campaigns: PromotionCampaign[];
};

type PromotionCampaign = {
  type: "spotlight" | "priority";
  source: "admin" | "plan" | "addon";
  status: string;
  startsAt: string;
  endsAt: string;
  detailViews: number;
  saves: number;
  enquiries: number;
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

const SOURCE_LABELS: Record<PromotionCampaign["source"], string> = {
  admin: "Admin grant",
  plan: "Plan benefit",
  addon: "Paid add-on",
};

function isCampaignType(value: string | null): value is PromotionCampaign["type"] {
  return value === "spotlight" || value === "priority";
}

function isCampaignSource(value: string | null): value is PromotionCampaign["source"] {
  return value === "admin" || value === "plan" || value === "addon";
}

function pluralize(value: number, singular: string, plural = `${singular}s`): string {
  return `${value.toLocaleString("en-US")} ${value === 1 ? singular : plural}`;
}

function enquiryConversion(campaign: PromotionCampaign): string {
  if (campaign.detailViews <= 0) return "No conversion rate yet";
  return `${((campaign.enquiries / campaign.detailViews) * 100).toFixed(1)}% enquiry conversion`;
}

function groupCampaignRows(rows: CampaignRow[]): FeaturedListing[] {
  const listings = new Map<string, FeaturedListing>();

  for (const row of rows) {
    let listing = listings.get(row.listing_id);
    if (!listing) {
      listing = {
        id: row.listing_id,
        title: row.title,
        city: row.city,
        property_type: row.property_type,
        price: row.price,
        cover_image_url: row.cover_image_url,
        is_featured: row.is_featured,
        priority_placement: row.priority_placement,
        status: row.status as ListingStatus,
        owner_id: row.owner_id,
        seller_name: row.seller_name,
        featured_until: row.featured_until,
        priority_until: row.priority_until,
        listing_type: row.listing_type,
        campaigns: [],
      };
      listings.set(row.listing_id, listing);
    }

    if (
      isCampaignType(row.campaign_type)
      && isCampaignSource(row.source_type)
      && row.starts_at
      && row.ends_at
    ) {
      listing.campaigns.push({
        type: row.campaign_type,
        source: row.source_type,
        status: row.campaign_status ?? "active",
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        detailViews: row.detail_views,
        saves: row.saves,
        enquiries: row.enquiries,
      });
    }
  }

  return [...listings.values()];
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
  const { data, error } = await supabase.rpc("get_admin_listing_promotion_campaigns");
  if (error) throw error;
  return groupCampaignRows(data ?? []);
}

export default function AdminFeaturedListings() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [updatingPriority, setUpdatingPriority] = useState<Record<string, boolean>>({});
  const [updatingUntil, setUpdatingUntil] = useState<Record<string, boolean>>({});

  const { data: listings = [], isLoading, error } = useQuery<FeaturedListing[]>({
    queryKey: ["admin-featured-listings"],
    queryFn: fetchFeaturedListings,
  });

  const featuredCount = listings.filter((l) => l.is_featured).length;
  const priorityCount = listings.filter((l) => l.priority_placement > 0).length;
  const campaignCount = listings.reduce((sum, listing) => sum + listing.campaigns.length, 0);

  const filtered = listings.filter((l) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return l.title.toLowerCase().includes(q) || l.city.toLowerCase().includes(q);
  });

  const handleToggleFeatured = useCallback(
    async (listing: FeaturedListing) => {
      if (listing.listing_type === "open_house") {
        toast.error("Open Houses use chronological scheduling and cannot receive listing boosts.");
        return;
      }
      setToggling((prev) => ({ ...prev, [listing.id]: true }));
      const next = !listing.is_featured;
      try {
        await updateFeaturedListing(listing.id, { is_featured: next }, "spotlight listing update");
        await queryClient.invalidateQueries({ queryKey: ["admin-featured-listings"] });
        toast.success(next ? "Spotlight enabled for listing" : "Spotlight removed from listing");
      } catch (e: unknown) {
        toast.error((e as Error)?.message ?? "Failed to update Spotlight status");
      } finally {
        setToggling((prev) => ({ ...prev, [listing.id]: false }));
      }
    },
    [queryClient],
  );

  const handleTogglePriority = useCallback(
    async (listing: FeaturedListing) => {
      if (listing.listing_type === "open_house") {
        toast.error("Open Houses use chronological scheduling and cannot receive listing boosts.");
        return;
      }
      const enabled = listing.priority_placement <= 0;
      setUpdatingPriority((prev) => ({ ...prev, [listing.id]: true }));
      try {
        await updateFeaturedListing(listing.id, { priority_placement: enabled ? 1 : 0 }, "priority listing update");
        await queryClient.invalidateQueries({ queryKey: ["admin-featured-listings"] });
        toast.success(enabled ? "Priority enabled for listing" : "Priority removed from listing");
      } catch (e: unknown) {
        toast.error((e as Error)?.message ?? "Failed to update priority");
      } finally {
        setUpdatingPriority((prev) => ({ ...prev, [listing.id]: false }));
      }
    },
    [queryClient],
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
            Listing Promotions
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Control Spotlight badges and Priority placement for active listings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm shrink-0">
          <Badge variant="default" className="gap-1.5 text-xs">
            <Star className="w-3 h-3" />
            {featuredCount} Spotlight
          </Badge>
          <Badge variant="outline" className="text-xs">
            {priorityCount} Priority
          </Badge>
          <span className="text-muted-foreground">across {listings.length} listings</span>
        </div>
      </div>

      {!isLoading && campaignCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          <BarChart3 className="mt-0.5 w-4 h-4 text-primary shrink-0" />
          <p className="text-muted-foreground">
            Results cover detail-page activity recorded inside each allocation window. Impressions,
            CTR, and uplift are not reported until dedicated exposure tracking exists.
          </p>
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
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Campaign</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Results</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Spotlight</th>
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
                const promotionsEligible = listing.listing_type !== "open_house";
                const priorityCampaign = listing.campaigns.find((campaign) => campaign.type === "priority");

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

                    {/* Campaign dates and source */}
                    <td className="px-4 py-3 hidden lg:table-cell min-w-52">
                      {!promotionsEligible ? (
                        <p className="max-w-52 text-xs text-muted-foreground">
                          Promotions unavailable for Open Houses.
                        </p>
                      ) : listing.campaigns.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No active campaign</span>
                      ) : (
                        <div className="space-y-2">
                          {listing.campaigns.map((campaign) => (
                            <div key={`${campaign.type}-${campaign.startsAt}`} className="space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant={campaign.type === "spotlight" ? "default" : "outline"} className="text-xs capitalize">
                                  {campaign.type}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {SOURCE_LABELS[campaign.source]}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDate(campaign.startsAt)} - {formatDate(campaign.endsAt)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Campaign-window outcomes. These are not impressions. */}
                    <td className="px-4 py-3 hidden xl:table-cell min-w-64">
                      {listing.campaigns.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No campaign results</span>
                      ) : (
                        <div className="space-y-2">
                          {listing.campaigns.map((campaign) => (
                            <div key={`${campaign.type}-${campaign.startsAt}-results`} className="space-y-1">
                              <p className="text-xs text-foreground">
                                {pluralize(campaign.detailViews, "detail view")} &middot; {pluralize(campaign.saves, "save")} &middot; {pluralize(campaign.enquiries, "enquiry", "enquiries")}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">{enquiryConversion(campaign)}</span>
                                <Badge variant="outline" className="text-xs">Collecting data</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Spotlight toggle */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Switch
                          checked={listing.is_featured}
                          disabled={isTogglingThis || !promotionsEligible}
                          onCheckedChange={() => handleToggleFeatured(listing)}
                          aria-label={`Toggle Spotlight for ${listing.title}`}
                        />
                        {promotionsEligible && listing.is_featured && (
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
                            aria-label={`Spotlight until for ${listing.title}`}
                            title={listing.featured_until ? `Expires ${formatDate(listing.featured_until)}` : "No Spotlight expiry set"}
                          />
                        )}
                      </div>
                    </td>

                    {/* Priority placement */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <Switch
                          checked={listing.priority_placement > 0}
                          disabled={isUpdatingPriorityThis || !promotionsEligible}
                          onCheckedChange={() => handleTogglePriority(listing)}
                          aria-label={`Toggle Priority for ${listing.title}`}
                        />
                        {promotionsEligible && listing.priority_placement > 0 && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            Until {formatDate(listing.priority_until ?? priorityCampaign?.endsAt ?? null)}
                          </span>
                        )}
                      </div>
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
