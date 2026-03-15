import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Calendar, MapPin, ArrowRight, Loader2, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { PropertyCard } from "@/components/PropertyCard";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getStreetViewProxyUrl } from "@/lib/config";

export default function OpenHouses() {
  const [searchParams] = useSearchParams();
  const cityParam = searchParams.get("city") || "";

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ["open-houses", cityParam],
    queryFn: async () => {
      const now = new Date().toISOString();
      let query = supabase
        .from("listings")
        .select("*, listing_images(url, sort_order)")
        .eq("status", "active")
        .eq("listing_type", "open_house")
        .gte("open_house_date", now)
        .order("open_house_date", { ascending: true })
        .limit(100);
      if (cityParam) query = query.ilike("city", `%${cityParam}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).sort((a: any, b: any) => {
        const aHasImg = !!(a.cover_image_url || a.listing_images?.length);
        const bHasImg = !!(b.cover_image_url || b.listing_images?.length);
        return (bHasImg ? 1 : 0) - (aHasImg ? 1 : 0);
      });
    },
  });

  const cards = listings.map((l: any) => {
    const imgs: string[] = l.cover_image_url ? [l.cover_image_url] : [];
    if (!imgs.length && l.listing_images?.length) {
      const sorted = [...l.listing_images].sort((a: any, b: any) => a.sort_order - b.sort_order);
      sorted.forEach((img: any) => imgs.push(img.url));
    }
    const svFallback = l.latitude != null && l.longitude != null ? getStreetViewProxyUrl({ lat: Number(l.latitude), lng: Number(l.longitude) }) : null;
    if (!imgs.length && svFallback) imgs.push(svFallback);
    return {
      id: l.id,
      title: l.title,
      address: l.address || l.city,
      city: l.city,
      price: Number(l.price),
      pricePerSqm: l.price_per_sqm ? Number(l.price_per_sqm) : undefined,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      sqm: Number(l.sqm),
      floor: l.floor,
      totalFloors: l.total_floors,
      yearBuilt: l.year_built,
      energyClass: l.energy_class,
      images: imgs,
      type: l.property_type,
      listingType: "open_house" as const,
      auctionDate: l.open_house_date ? new Date(l.open_house_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : undefined,
      aiScore: l.ai_score,
      views: l.views_count,
      tags: l.tags || [],
    };
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        <div className="border-b border-border bg-card/60 py-8">
          <div className="container">
            <div className="flex items-center gap-2 mb-2">
              <DoorOpen className="w-5 h-5 text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">Open Houses</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">Upcoming Open Houses</h1>
            <p className="text-muted-foreground text-sm mt-1">Find properties with scheduled open house viewings. No appointment needed.</p>
          </div>
        </div>

        <div className="container py-8">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : listings.length === 0 ? (
            <div className="glass-card rounded-xl p-16 text-center">
              <Calendar className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
              <h2 className="font-display text-lg font-semibold mb-2">No upcoming open houses</h2>
              <p className="text-sm text-muted-foreground mb-4">Check back soon for scheduled open house viewings.</p>
              <Button variant="outline" asChild><Link to="/listings">Browse all listings</Link></Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {cards.map((p) => (
                <PropertyCard key={p.id} property={p} />
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
