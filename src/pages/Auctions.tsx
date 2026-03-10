import { useState } from "react";
import { Gavel, TrendingUp, Bell, ExternalLink, AlertCircle, Loader2, MapPin, Calendar, Euro, Map, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { MapView, MapListing } from "@/components/MapView";

// ── Fetch all future auctions from DB ─────────────────────────────────────────
function useAuctionListings(city?: string) {
  return useQuery({
    queryKey: ["auction-listings", city],
    queryFn: async () => {
      let query = supabase
        .from("listings")
        .select("id, title, city, address, price, auction_starting_bid, auction_date, auction_court, property_type, cover_image_url, sqm, bedrooms, bathrooms, latitude, longitude, tags")
        .eq("listing_type", "auction")
        .eq("status", "active")
        .gte("auction_date", new Date().toISOString())
        .order("auction_date", { ascending: true })
        .limit(500);

      if (city && city !== "All Cities") {
        query = query.ilike("city", `%${city}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

const CITY_FILTERS = ["All Cities", "Αθήνα", "Θεσσαλονίκη", "Πειραιάς", "Πάτρα", "Ηράκλειο", "Λάρισα", "Βόλος"];

const PROPERTY_TYPE_GR: Record<string, string> = {
  apartment: "Διαμέρισμα",
  house: "Κατοικία",
  villa: "Βίλα",
  land: "Γη",
  commercial: "Επαγγελματικός",
  office: "Γραφείο",
};

type ViewMode = "list" | "map";

export default function Auctions() {
  const [selectedCity, setSelectedCity] = useState("All Cities");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const { data: auctions = [], isLoading, error } = useAuctionListings(selectedCity);

  // Dynamic stats from real data
  const now = new Date();
  const thisWeek = auctions.filter(a => {
    if (!a.auction_date) return false;
    const d = new Date(a.auction_date);
    const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }).length;

  const avgBid = auctions.length
    ? Math.round(auctions.reduce((sum, a) => sum + (a.auction_starting_bid ?? a.price ?? 0), 0) / auctions.length)
    : 0;

  const auctionStats = [
    { value: isLoading ? "—" : String(thisWeek), label: "This Week", icon: Gavel },
    { value: isLoading ? "—" : auctions.length.toLocaleString(), label: "Total Listed", icon: TrendingUp },
    { value: isLoading ? "—" : avgBid > 0 ? `€${(avgBid / 1000).toFixed(0)}k` : "—", label: "Avg Starting Bid", icon: TrendingUp },
    { value: "-38%", label: "Below Market Avg", icon: AlertCircle },
  ];

  // Map listings shape
  const mapListings: MapListing[] = auctions
    .filter(a => a.latitude != null && a.longitude != null)
    .map(a => ({
      id: a.id,
      title: a.title,
      price: a.auction_starting_bid ?? a.price ?? 0,
      sqm: a.sqm ?? 0,
      bedrooms: a.bedrooms ?? undefined,
      bathrooms: a.bathrooms ?? undefined,
      latitude: a.latitude,
      longitude: a.longitude,
      images: a.cover_image_url ? [a.cover_image_url] : [],
      listingType: "auction",
      city: a.city,
      _raw: a,
    }));

  const mappableCount = mapListings.length;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* Hero */}
        <div className="bg-card border-b border-border py-12">
          <div className="container">
            <div className="flex items-center gap-2 mb-3">
              <Gavel className="w-5 h-5 text-brand-gold" />
              <span className="text-xs font-bold text-brand-gold uppercase tracking-widest">Greek Judicial Auctions</span>
            </div>
            <h1 className="font-display text-4xl font-bold mb-2">Property Auctions</h1>
            <p className="text-muted-foreground max-w-xl">
              Direct integration with Greek judicial auctions, bank repossessions, and OAED listings. Real-time data powered by mAI Prop OS.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
              {auctionStats.map(s => (
                <div key={s.label} className="glass-card rounded-xl p-4 text-center">
                  <div className="font-display text-2xl font-bold gradient-text-gold">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alert CTA */}
        <div className="container py-6">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-brand-gold/10 border border-brand-gold/20">
            <Bell className="w-5 h-5 text-brand-gold shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Get notified of new auctions matching your criteria</p>
              <p className="text-xs text-muted-foreground mt-0.5">Set custom alerts for location, price range, and property type</p>
            </div>
            <Button className="bg-gradient-gold border-0 text-background font-semibold shrink-0">
              Set Alert
            </Button>
          </div>
        </div>

        {/* Toolbar: city filters + view toggle */}
        <div className="container pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {CITY_FILTERS.map(city => (
                <button
                  key={city}
                  onClick={() => setSelectedCity(city)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                    selectedCity === city
                      ? "bg-brand-gold/20 border border-brand-gold/40 text-brand-gold"
                      : "bg-secondary border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>

            {/* View mode toggle */}
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 border border-border shrink-0">
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="w-3.5 h-3.5" /> List
              </button>
              <button
                onClick={() => setViewMode("map")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === "map" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Map className="w-3.5 h-3.5" /> Map
                {!isLoading && mappableCount > 0 && (
                  <span className="ml-0.5 text-[10px] bg-brand-gold/20 text-brand-gold px-1.5 py-0.5 rounded-full font-bold">
                    {mappableCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── MAP VIEW ── */}
        {viewMode === "map" && (
          <div className="container pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-[560px] rounded-2xl bg-card border border-border">
                <Loader2 className="w-6 h-6 animate-spin text-brand-gold" />
              </div>
            ) : mappableCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-[560px] rounded-2xl bg-card border border-border gap-3">
                <MapPin className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {auctions.length === 0
                    ? "No auctions yet — sync from Admin Panel first."
                    : `${auctions.length} auction(s) found but none have coordinates. Sync from OS to get lat/lng data.`}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-3">
                  Showing <span className="font-semibold text-foreground">{mappableCount}</span> pinned auction{mappableCount !== 1 ? "s" : ""} on map
                  {auctions.length > mappableCount && ` (${auctions.length - mappableCount} without coordinates hidden)`}
                </p>
                <MapView listings={mapListings} height="560px" />
              </div>
            )}
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {viewMode === "list" && (
          <div className="container pb-16">
            {isLoading && (
              <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading auctions from OS…</span>
              </div>
            )}

            {error && (
              <div className="text-center py-20">
                <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Failed to load auctions. Please try again.</p>
              </div>
            )}

            {!isLoading && !error && auctions.length === 0 && (
              <div className="text-center py-20">
                <Gavel className="w-12 h-12 text-brand-gold/30 mx-auto mb-4" />
                <p className="font-display font-semibold text-lg mb-2">No upcoming auctions yet</p>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {selectedCity !== "All Cities"
                    ? `No auctions found in ${selectedCity}. Try "All Cities" or ask an admin to sync from mAI Prop OS.`
                    : "Auction listings will appear here once synced from mAI Prop OS. Ask an admin to run the auction poll from the Dashboard."}
                </p>
              </div>
            )}

            {!isLoading && auctions.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground mb-4">
                  Showing <span className="font-semibold text-foreground">{auctions.length}</span> upcoming auctions
                  {selectedCity !== "All Cities" ? ` in ${selectedCity}` : ""}
                  {" · "}ordered by auction date
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {auctions.map(a => (
                    <Link
                      key={a.id}
                      to={`/property/${a.id}`}
                      className="glass-card rounded-xl overflow-hidden border border-border hover:border-brand-gold/40 transition-all group"
                    >
                      {/* Image / placeholder */}
                      <div className="relative h-44 bg-secondary overflow-hidden">
                        {a.cover_image_url ? (
                          <img
                            src={a.cover_image_url}
                            alt={a.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Gavel className="w-10 h-10 text-muted-foreground/20" />
                          </div>
                        )}
                        {/* Auction date badge */}
                        {a.auction_date && (
                          <div className="absolute top-2 left-2 flex items-center gap-1 bg-background/90 backdrop-blur-sm border border-border rounded-full px-2 py-0.5 text-[10px] font-semibold">
                            <Calendar className="w-3 h-3 text-brand-gold" />
                            {format(new Date(a.auction_date), "dd MMM yyyy")}
                          </div>
                        )}
                        {/* Property type badge */}
                        <div className="absolute top-2 right-2 bg-brand-gold/90 text-background text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {PROPERTY_TYPE_GR[a.property_type] ?? a.property_type}
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-4 space-y-2">
                        <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-brand-gold transition-colors">
                          {a.title}
                        </h3>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{a.address ? `${a.address}, ` : ""}{a.city}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center gap-1 font-display font-bold text-brand-gold">
                            <Euro className="w-3.5 h-3.5" />
                            {(a.auction_starting_bid ?? a.price ?? 0).toLocaleString("el-GR")}
                          </div>
                          {a.sqm && a.sqm > 1 && (
                            <span className="text-xs text-muted-foreground">{a.sqm} τ.μ.</span>
                          )}
                        </div>
                        {a.auction_court && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {a.auction_court}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}

            {/* CTA */}
            <div className="mt-10 p-6 glass-card rounded-xl border border-brand-gold/20 text-center">
              <Gavel className="w-8 h-8 text-brand-gold mx-auto mb-3" />
              <h3 className="font-display font-semibold mb-2">Full Auction Database</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Access 3,200+ monthly auctions with AI pre-analysis reports. Available on mAI Prop OS.
              </p>
              <Button className="bg-gradient-gold border-0 text-background font-semibold" asChild>
                <a href="https://os.maiprop.co" target="_blank" rel="noreferrer">
                  Open mAI Prop OS <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </Button>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
