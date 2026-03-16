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

  const mockCards = [
    {
      id: "mock-open-1",
      title: "Modern 2BR in Kifisia",
      address: "Kifisia Center",
      city: "Athens",
      price: 420000,
      pricePerSqm: 3100,
      bedrooms: 2,
      bathrooms: 2,
      sqm: 135,
      floor: 2,
      totalFloors: 4,
      yearBuilt: 2015,
      energyClass: "A",
      images: ["https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=800&q=60"],
      type: "apartment" as const,
      listingType: "open_house" as const,
      auctionDate: "Sat 19 Apr · 11:00",
      aiScore: 87,
      views: 132,
      tags: ["Balcony", "Parking"],
    },
    {
      id: "mock-open-2",
      title: "Sea-view Villa in Vouliagmeni",
      address: "Panorama Vouliagmeni",
      city: "Athens Riviera",
      price: 1450000,
      pricePerSqm: 5200,
      bedrooms: 4,
      bathrooms: 4,
      sqm: 280,
      floor: 0,
      totalFloors: 2,
      yearBuilt: 2020,
      energyClass: "A+",
      images: ["https://images.unsplash.com/photo-1507089947368-19c1da9775ae?w=800&q=60"],
      type: "house",
      listingType: "open_house" as const,
      auctionDate: "Sun 20 Apr · 17:00",
      aiScore: 92,
      views: 89,
      tags: ["Pool", "Garden", "Parking"],
    },
    {
      id: "mock-open-3",
      title: "Loft Near Aristotelous Square",
      address: "City Center",
      city: "Thessaloniki",
      price: 310000,
      pricePerSqm: 2900,
      bedrooms: 1,
      bathrooms: 1,
      sqm: 107,
      floor: 5,
      totalFloors: 7,
      yearBuilt: 2010,
      energyClass: "B+",
      images: ["https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=800&q=60"],
      type: "apartment",
      listingType: "open_house" as const,
      auctionDate: "Thu 24 Apr · 19:30",
      aiScore: 84,
      views: 54,
      tags: ["City view", "Elevator"],
    },
  ];

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
            <div className="space-y-6">
              <div className="glass-card rounded-xl p-16 text-center">
                <Calendar className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
                <h2 className="font-display text-lg font-semibold mb-2">No upcoming open houses</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Here are a few sample open houses to show how this section looks. Real events will appear as agents publish them.
                </p>
                <Button variant="outline" asChild><Link to="/listings">Browse all listings</Link></Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {mockCards.map((p) => (
                  <div key={p.id} className="space-y-2">
                    <PropertyCard property={p} />
                    <div className="text-xs text-muted-foreground space-y-1 rounded-lg bg-card border border-border/60 px-3 py-2">
                      {p.id === "mock-open-1" && (
                        <>
                          <p><span className="font-semibold text-foreground">Visitor flow:</span> Choose this open house, pre-register from the detail page, receive confirmation, then attend and submit a sealed offer after the viewing.</p>
                          <p><span className="font-semibold text-foreground">Owner / agent flow:</span> Create the open house from your listing, manage registrations and timeslots in Dashboard → Open Houses, then review and accept offers after the event.</p>
                        </>
                      )}
                      {p.id === "mock-open-2" && (
                        <>
                          <p><span className="font-semibold text-foreground">Visitor flow:</span> Walk in during the open window, check in on-site, and scan the QR code to get the digital brochure and submit an offer later from your account.</p>
                          <p><span className="font-semibold text-foreground">Owner / agent flow:</span> Track visitor count and interest, collect offers linked to this event, and mark the accepted offer in Dashboard → Open Houses.</p>
                        </>
                      )}
                      {p.id === "mock-open-3" && (
                        <>
                          <p><span className="font-semibold text-foreground">Visitor flow:</span> Book a specific 15-minute slot, receive a calendar invite, attend the viewing, and follow up with the agent via Messages.</p>
                          <p><span className="font-semibold text-foreground">Owner / agent flow:</span> Use asset control to open/close slots, view who is attending when, and message registrants before and after the viewing from Messages and Open Houses.</p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
