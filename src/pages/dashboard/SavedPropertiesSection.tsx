import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/PropertyCard";
import { dbListingToCard } from "@/lib/listingUtils";
import type { DbListingCardRow } from "@/lib/domainContracts";

const SAVED_TABS = [
  { label: "All",        value: "" },
  { label: "Sale",       value: "sale" },
  { label: "Rent",       value: "rent" },
  { label: "Auction",    value: "auction" },
  { label: "Quick Sale", value: "firesale" },
] as const;

type FavoriteItem = {
  id?: string;
  listing_id: string;
  listings?: DbListingCardRow | null;
};

export function SavedPropertiesSection({
  favorites,
  favLoading,
}: {
  favorites: FavoriteItem[];
  favLoading: boolean;
}) {
  const [tab, setTab] = useState<string>("");
  const filtered = favorites.filter(
    (f): f is FavoriteItem & { listings: DbListingCardRow } =>
      Boolean(f.listings) && (!tab || f.listings?.listing_type === tab),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Saved Properties</h1>
          <p className="text-sm text-muted-foreground mt-1">{favorites.length} saved</p>
        </div>
        <Button variant="outline" className="border-border gap-2 text-sm" asChild>
          <Link to="/listings"><Search className="w-4 h-4" /> Browse More</Link>
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {SAVED_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              tab === t.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {t.label}
            {t.value && (
              <span className="ml-1.5 text-xs opacity-60">
                {favorites.filter((f) => f.listings?.listing_type === t.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {favLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <Heart className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">{tab ? `No saved ${tab} properties` : "No saved properties yet"}</p>
          <p className="text-sm text-muted-foreground mt-1">Browse listings and tap the heart to save</p>
          <Button variant="outline" className="border-border mt-4" asChild>
            <Link to="/listings">Browse Listings</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((f) => (
            <PropertyCard key={f.id ?? f.listing_id} property={dbListingToCard(f.listings)} />
          ))}
        </div>
      )}
    </div>
  );
}
