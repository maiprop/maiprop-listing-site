import { useState } from "react";
import { Link } from "react-router-dom";
import { Gavel, Clock, TrendingUp, Bell, Filter, ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";

import { PropertyCard } from "@/components/PropertyCard";
import { Footer } from "@/components/Footer";
import { mockProperties } from "@/data/mockProperties";

const auctionStats = [
  { value: "47", label: "This Week", icon: Gavel },
  { value: "3,218", label: "Monthly Total", icon: TrendingUp },
  { value: "€128k", label: "Avg Starting Bid", icon: TrendingUp },
  { value: "-38%", label: "Below Market Avg", icon: AlertCircle },
];

const courtLocations = [
  "All Courts", "Athens (Eirinodikio)", "Thessaloniki", "Piraeus", "Patra", "Heraklion", "Larissa", "Volos"
];

export default function Auctions() {
  const [selectedCourt, setSelectedCourt] = useState("All Courts");
  const auctions = mockProperties.filter(p => p.listingType === "auction");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <MarketTicker />
      <div className="pt-16">
        {/* Hero */}
        <div className="bg-card border-b border-border py-12">
          <div className="container">
            <div className="flex items-center gap-2 mb-3">
              <Gavel className="w-5 h-5 text-brand-gold" />
              <span className="text-xs font-bold text-brand-gold uppercase tracking-widest">Greek Judicial Auctions</span>
            </div>
            <h1 className="font-display text-4xl font-bold mb-2">Property Auctions</h1>
            <p className="text-muted-foreground max-w-xl">Direct integration with Greek judicial auctions, bank repossessions, and OAED listings. Real-time data powered by mAI Prop OS.</p>
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

        {/* Filters */}
        <div className="container pb-4">
          <div className="flex gap-2 flex-wrap">
            {courtLocations.map(court => (
              <button
                key={court}
                onClick={() => setSelectedCourt(court)}
                className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                  selectedCourt === court
                    ? "bg-brand-gold/20 border border-brand-gold/40 text-brand-gold"
                    : "bg-secondary border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {court}
              </button>
            ))}
          </div>
        </div>

        <div className="container pb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {auctions.map(p => <PropertyCard key={p.id} property={p} />)}
          </div>

          <div className="mt-8 p-6 glass-card rounded-xl border border-brand-gold/20 text-center">
            <Gavel className="w-8 h-8 text-brand-gold mx-auto mb-3" />
            <h3 className="font-display font-semibold mb-2">Full Auction Database</h3>
            <p className="text-sm text-muted-foreground mb-4">Access 3,200+ monthly auctions with AI pre-analysis reports. Available on mAI Prop OS.</p>
            <Button className="bg-gradient-gold border-0 text-background font-semibold" asChild>
              <a href="https://os.maiprop.co" target="_blank" rel="noreferrer">
                Open mAI Prop OS <ExternalLink className="w-4 h-4 ml-2" />
              </a>
            </Button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
