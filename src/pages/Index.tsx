import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, MapPin, ChevronDown, TrendingUp, Shield, Zap, Users, ArrowRight, Play, Gavel, Flame, Building2, Home, Store, Trees } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { MarketTicker } from "@/components/MarketTicker";
import { PropertyCard } from "@/components/PropertyCard";
import { Footer } from "@/components/Footer";
import { mockProperties } from "@/data/mockProperties";
import heroBg from "@/assets/hero-bg.jpg";

const stats = [
  { value: "47,000+", label: "Active Listings" },
  { value: "€2.4B", label: "Properties Sold" },
  { value: "12,500+", label: "Verified Agents" },
  { value: "3,200+", label: "Monthly Auctions" },
];

const propertyTypes = [
  { icon: Home, label: "Apartments", count: 18420, href: "/listings?type=apartment" },
  { icon: Building2, label: "Houses", count: 9240, href: "/listings?type=house" },
  { icon: Store, label: "Commercial", count: 4180, href: "/listings?type=commercial" },
  { icon: Trees, label: "Land", count: 6350, href: "/listings?type=land" },
  { icon: Gavel, label: "Auctions", count: 3218, href: "/auctions" },
  { icon: Flame, label: "Firesale™", count: 127, href: "/firesale" },
];

const features = [
  {
    icon: Zap,
    title: "AI-Powered Insights",
    desc: "Deep data analysis for every property. Price trends, neighborhood scores, investment potential — all powered by mAI Prop OS.",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    icon: Gavel,
    title: "Greek Auctions",
    desc: "Direct integration with judicial auctions, bank repos, and OAED listings. Real-time alerts and automated bidding tools.",
    color: "text-brand-gold",
    bg: "bg-brand-gold/10",
  },
  {
    icon: Flame,
    title: "Firesale™ Instant Offers",
    desc: "Sell your property in 48 hours. Get a guaranteed cash offer powered by our AI valuation engine.",
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
  {
    icon: Users,
    title: "Pro Directory",
    desc: "Connect with vetted architects, lawyers, electricians, and plumbers. All with standardized profiles and verified reviews.",
    color: "text-accent",
    bg: "bg-accent/10",
  },
  {
    icon: Shield,
    title: "Verified Listings",
    desc: "Every listing cross-checked against cadastre records. No fraud, no duplicate entries — just clean, reliable data.",
    color: "text-brand-emerald",
    bg: "bg-brand-emerald/10",
  },
  {
    icon: TrendingUp,
    title: "Portfolio Analytics",
    desc: "Track your real estate portfolio with live P&L, market exposure analysis, and AI-driven rebalancing suggestions.",
    color: "text-brand-purple",
    bg: "bg-brand-purple/10",
  },
];

const popularCities = [
  { name: "Athens", listings: 24860, trend: "+1.2%", image: "https://images.unsplash.com/photo-1555993539-1732b0258235?w=600&q=80" },
  { name: "Thessaloniki", listings: 8240, trend: "+0.8%", image: "https://images.unsplash.com/photo-1570939274717-7eda259b50ed?w=600&q=80" },
  { name: "Mykonos", listings: 1820, trend: "+2.3%", image: "https://images.unsplash.com/photo-1533104816931-20fa691ff6ca?w=600&q=80" },
  { name: "Santorini", listings: 1240, trend: "+1.9%", image: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600&q=80" },
];

export default function Index() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("Buy");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <MarketTicker />

      {/* Hero */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden pt-16">
        {/* Background */}
        <div className="absolute inset-0">
          <img src={heroBg} alt="Athens at night" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        </div>

        {/* Animated grid lines */}
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: "linear-gradient(hsl(183 100% 42%) 1px, transparent 1px), linear-gradient(90deg, hsl(183 100% 42%) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="container relative z-10">
          <div className="max-w-3xl">
            {/* Label */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6 animate-fade-in">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-semibold text-primary">Greece's Most Advanced Real Estate Platform</span>
            </div>

            <h1 className="font-display text-5xl md:text-7xl font-bold leading-tight mb-6 animate-fade-in-up">
              Find Your <br />
              <span className="gradient-text-primary">Perfect Property</span>
              <br />
              in Greece
            </h1>

            <p className="text-lg text-muted-foreground mb-8 max-w-xl animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
              From luxury villas to bank auctions. Powered by mAI Prop OS — real-time data, AI insights, and instant offers in one platform.
            </p>

            {/* Search bar */}
            <div className="glass-card rounded-2xl p-2 shadow-elevated animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
              {/* Type tabs */}
              <div className="flex gap-1 p-1 mb-2">
                {["Buy", "Rent", "Auctions", "Firesale"].map(type => (
                  <button
                    key={type}
                    onClick={() => setSearchType(type)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      searchType === type
                        ? "bg-gradient-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    {type === "Auctions" && <span className="mr-1.5 text-brand-gold">⚡</span>}
                    {type === "Firesale" && <span className="mr-1.5">🔥</span>}
                    {type}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 bg-secondary rounded-xl px-4 py-3">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    placeholder="Search by city, area, or address..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3">
                  <span className="text-sm text-muted-foreground">Type</span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </div>
                <Button size="lg" className="bg-gradient-primary border-0 text-primary-foreground rounded-xl px-6 glow-cyan" asChild>
                  <Link to="/listings">
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </Link>
                </Button>
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex items-center gap-6 mt-8 animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
              {stats.map(stat => (
                <div key={stat.label}>
                  <div className="font-display font-bold text-xl gradient-text-cyan">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Property types */}
      <section className="py-16 container">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-2xl font-bold">Browse by Type</h2>
          <Link to="/listings" className="text-sm text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {propertyTypes.map(type => (
            <Link key={type.label} to={type.href}>
              <div className="glass-card rounded-xl p-4 text-center hover:border-primary/40 hover:bg-primary/5 transition-all group">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/20 transition-colors">
                  <type.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="font-display font-semibold text-sm">{type.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{type.count.toLocaleString()} listings</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured listings */}
      <section className="py-16 bg-card/30">
        <div className="container">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="font-display text-2xl font-bold">Featured Properties</h2>
              <p className="text-sm text-muted-foreground mt-1">Premium & verified listings</p>
            </div>
            <Button variant="outline" className="border-border" asChild>
              <Link to="/listings">View All</Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {mockProperties.filter(p => p.isFeatured || p.isPremium).slice(0, 4).map(property => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        </div>
      </section>

      {/* Auctions spotlight */}
      <section className="py-16 container">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Gavel className="w-5 h-5 text-brand-gold" />
              <span className="text-xs font-semibold text-brand-gold uppercase tracking-widest">Greek Auctions</span>
            </div>
            <h2 className="font-display text-2xl font-bold">This Week's Auctions</h2>
            <p className="text-sm text-muted-foreground mt-1">Judicial & bank repo auctions — live from Greek courts</p>
          </div>
          <Button variant="outline" className="border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10" asChild>
            <Link to="/auctions">All Auctions <ArrowRight className="w-3 h-3 ml-1" /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockProperties.filter(p => p.listingType === "auction").map(property => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      </section>

      {/* Firesale CTA */}
      <section className="py-16 container">
        <div className="relative rounded-3xl overflow-hidden bg-card border border-border">
          <div className="absolute inset-0 bg-gradient-to-br from-destructive/20 via-transparent to-transparent" />
          <div className="absolute right-0 top-0 w-1/2 h-full opacity-10"
            style={{ background: "radial-gradient(circle at top right, hsl(0 72% 55%), transparent 60%)" }}
          />
          <div className="relative p-10 md:p-16 grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Flame className="w-5 h-5 text-destructive" />
                <span className="text-xs font-bold text-destructive uppercase tracking-widest">Firesale™ Instant Offer</span>
              </div>
              <h2 className="font-display text-4xl font-bold mb-4">
                Sell Your Property <br />
                <span className="gradient-text-primary">in 48 Hours</span>
              </h2>
              <p className="text-muted-foreground mb-6">
                Get a guaranteed cash offer for your property powered by our AI valuation engine. No agents, no waiting, no stress.
              </p>
              <Button size="lg" className="bg-gradient-primary border-0 text-primary-foreground" asChild>
                <Link to="/firesale">Get Instant Offer <ArrowRight className="w-4 h-4 ml-2" /></Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: "48h", label: "Average Closing" },
                { value: "100%", label: "Cash Offers" },
                { value: "€0", label: "Agent Fees" },
                { value: "AI", label: "Valuation Engine" },
              ].map(item => (
                <div key={item.label} className="glass-card rounded-xl p-4 text-center">
                  <div className="font-display text-2xl font-bold gradient-text-cyan">{item.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 bg-card/30">
        <div className="container">
          <div className="text-center mb-12">
            <span className="text-xs font-semibold text-primary uppercase tracking-widest">Why maiProp</span>
            <h2 className="font-display text-3xl font-bold mt-2">Everything You Need</h2>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">Greece's only platform combining listings, auctions, instant offers, and AI-powered data in one place.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(feature => (
              <div key={feature.title} className="glass-card rounded-xl p-6 hover:border-primary/20 transition-all">
                <div className={`w-10 h-10 rounded-xl ${feature.bg} flex items-center justify-center mb-4`}>
                  <feature.icon className={`w-5 h-5 ${feature.color}`} />
                </div>
                <h3 className="font-display font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Popular cities */}
      <section className="py-16 container">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-2xl font-bold">Popular Locations</h2>
          <Link to="/listings" className="text-sm text-primary hover:underline flex items-center gap-1">
            Explore All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {popularCities.map(city => (
            <Link key={city.name} to={`/listings?city=${city.name}`}>
              <div className="relative rounded-xl overflow-hidden aspect-[3/4] group">
                <img
                  src={city.image}
                  alt={city.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <div className="font-display font-bold text-lg">{city.name}</div>
                  <div className="text-xs text-muted-foreground">{city.listings.toLocaleString()} listings</div>
                  <div className="text-xs text-brand-emerald font-semibold">{city.trend}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Pro directory CTA */}
      <section className="py-16 container">
        <div className="relative rounded-3xl overflow-hidden bg-card border border-border p-10 md:p-16">
          <div className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: "radial-gradient(hsl(265 80% 60%) 1px, transparent 1px)",
              backgroundSize: "30px 30px",
            }}
          />
          <div className="relative max-w-2xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Users className="w-5 h-5 text-accent" />
              <span className="text-xs font-semibold text-accent uppercase tracking-widest">Pro Network</span>
            </div>
            <h2 className="font-display text-3xl font-bold mb-4">Find the Right Professional</h2>
            <p className="text-muted-foreground mb-8">
              Architects, lawyers, notaries, contractors, plumbers, and more. All vetted and rated by verified clients.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mb-8">
              {["Architects", "Lawyers", "Notaries", "Engineers", "Contractors", "Electricians", "Plumbers", "Property Managers"].map(pro => (
                <span key={pro} className="px-3 py-1.5 rounded-full bg-secondary border border-border text-sm text-muted-foreground hover:border-accent/40 hover:text-foreground cursor-pointer transition-colors">
                  {pro}
                </span>
              ))}
            </div>
            <Button size="lg" className="bg-gradient-accent border-0 text-accent-foreground" asChild>
              <Link to="/professionals">Explore Directory <ArrowRight className="w-4 h-4 ml-2" /></Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
