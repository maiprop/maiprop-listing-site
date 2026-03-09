import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, MapPin, ChevronDown, TrendingUp, Shield, Zap, Users, ArrowRight, Play, Gavel, Flame, Building2, Home, Store, Trees, ExternalLink, BarChart2, Globe, Maximize2, ListFilter, CalendarCheck, HandshakeIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { MarketTicker } from "@/components/MarketTicker";
import { PropertyCard } from "@/components/PropertyCard";
import { Footer } from "@/components/Footer";
import { mockProperties } from "@/data/mockProperties";
import { PROPERTY_TYPES } from "@/lib/propertyTypes";
import heroBg from "@/assets/hero-bg.jpg";

const stats = [
  { value: "47,000+", label: "Active Listings" },
  { value: "€2.4B", label: "Properties Sold" },
  { value: "12,500+", label: "Verified Agents" },
  { value: "3,200+", label: "Monthly Auctions" },
];

// Property counts per type (could be from DB in production)
const PROPERTY_TYPE_COUNTS: Record<string, number> = {
  apartment: 18420,
  house: 9240,
  villa: 3150,
  commercial: 4180,
  land: 6350,
  office: 1820,
};

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

const howItWorks = [
  {
    step: "1",
    icon: ListFilter,
    title: "Tell us what you're looking for",
    desc: "Search by location, budget, or property type — or let our AI suggest options based on your lifestyle and goals.",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    step: "2",
    icon: CalendarCheck,
    title: "Explore & schedule viewings",
    desc: "Browse verified listings with photos, maps, and AI-powered insights. Book in-person or online viewings in seconds.",
    color: "text-brand-emerald",
    bg: "bg-brand-emerald/10",
  },
  {
    step: "3",
    icon: HandshakeIcon,
    title: "Move in with confidence",
    desc: "Connect with trusted lawyers, notaries, and agents. We guide you every step of the way — no surprises.",
    color: "text-accent",
    bg: "bg-accent/10",
  },
];

export default function Index() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("Buy");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <MarketTicker />

      {/* Hero */}
      <section className="relative min-h-[88vh] flex items-center overflow-hidden pt-16">
        {/* Background */}
        <div className="absolute inset-0">
          <img src={heroBg} alt="Athens at night" className="w-full h-full object-cover opacity-35" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        </div>

        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(hsl(192 100% 50%) 1px, transparent 1px), linear-gradient(90deg, hsl(192 100% 50%) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="container relative z-10 py-16">
          <div className="max-w-3xl">
            {/* Friendly label */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/12 border border-primary/25 mb-6 animate-fade-in">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-semibold text-primary">Trusted by 12,500+ Greeks across Europe</span>
            </div>

            <h1 className="font-display text-5xl md:text-6xl font-bold leading-tight mb-5 animate-fade-in-up">
              Your next home<br />
              is waiting for you<br />
              <span className="gradient-text-primary">in Greece</span>
            </h1>

            {/* Friendly, jargon-free subtitle */}
            <p className="text-xl text-foreground/75 mb-3 max-w-xl animate-fade-in-up font-medium" style={{ animationDelay: "0.05s" }}>
              Buy, rent, or sell — simply and with confidence.
            </p>
            <p className="text-base text-muted-foreground mb-9 max-w-xl animate-fade-in-up leading-relaxed" style={{ animationDelay: "0.1s" }}>
              From family apartments to holiday villas, we make finding the right property in Greece easy, transparent, and stress-free. Real listings, real prices, real people.
            </p>

            {/* Search bar */}
            <div className="bg-card border border-border rounded-2xl p-2 shadow-elevated animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
              {/* Type tabs */}
              <div className="flex gap-1 p-1 mb-2">
                {["Buy", "Rent", "Auctions", "Quick Sale"].map(type => (
                  <button
                    key={type}
                    onClick={() => setSearchType(type)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      searchType === type
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 bg-secondary rounded-xl px-4 py-3">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    placeholder="City, area, or neighbourhood..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 bg-secondary rounded-xl px-4 py-3 cursor-pointer hover:bg-muted transition-colors">
                  <span className="text-sm text-muted-foreground hidden sm:block">Property type</span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </div>
                <Button size="lg" className="bg-primary hover:opacity-90 border-0 text-primary-foreground rounded-xl px-6 font-semibold" asChild>
                  <Link to="/listings">
                    <Search className="w-4 h-4 mr-2" />
                    Search
                  </Link>
                </Button>
              </div>
            </div>

            {/* Trust indicators */}
            <div className="flex items-center flex-wrap gap-x-6 gap-y-2 mt-7 animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
              {stats.map(stat => (
                <div key={stat.label} className="flex items-baseline gap-1.5">
                  <div className="font-display font-bold text-lg gradient-text-primary">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 bg-card/40 border-y border-border">
        <div className="container">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl font-bold">How it works</h2>
            <p className="text-muted-foreground mt-2">From search to keys — three simple steps</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Connector line desktop */}
            <div className="hidden md:block absolute top-8 left-1/3 right-1/3 h-0.5 bg-gradient-to-r from-primary/40 via-brand-emerald/40 to-accent/40 -translate-y-1/2" style={{ top: "2rem" }} />
            {howItWorks.map((step, i) => (
              <div key={step.step} className="relative flex flex-col items-center text-center gap-4 p-6 rounded-2xl bg-card border border-border hover:border-primary/20 transition-all group">
                <div className="relative">
                  <div className={`w-14 h-14 rounded-2xl ${step.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <step.icon className={`w-6 h-6 ${step.color}`} />
                  </div>
                  <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {step.step}
                  </div>
                </div>
                <div>
                  <h3 className="font-display font-semibold text-base mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Property types — compact icon grid */}
      <section className="py-14 container">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-2xl font-bold">Browse by Type</h2>
          <Link to="/listings" className="text-sm text-primary hover:underline flex items-center gap-1">
            All listings <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {PROPERTY_TYPES.filter(t => t.value !== "office").map(type => (
            <Link key={type.value} to={`/listings?type=${type.value}`}>
              <div className="glass-card rounded-xl p-4 flex flex-col items-center text-center hover:border-primary/40 hover:bg-primary/5 transition-all group gap-2">
                <div className={`w-12 h-12 rounded-xl ${type.bgClass} flex items-center justify-center text-2xl group-hover:scale-110 transition-transform`}>
                  {type.emoji}
                </div>
                <div className="font-display font-semibold text-xs group-hover:text-primary transition-colors">{type.label}</div>
                <div className="text-[10px] text-muted-foreground">{(PROPERTY_TYPE_COUNTS[type.value] ?? 0).toLocaleString()}</div>
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

      {/* ── mAI Prop OS Embed ── */}
      <section className="py-20 bg-card/30 overflow-hidden">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Copy */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-5">
                <BarChart2 className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">Powered by mAI Prop OS</span>
              </div>
              <h2 className="font-display text-4xl font-bold leading-tight mb-4">
                Greece's Real Estate <br />
                <span className="gradient-text-primary">Data Gateway</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Every listing on maiProp is powered by mAI Prop OS — our proprietary data platform aggregating Greek cadastre records, judicial auctions, price indices, and predictive analytics into one live dashboard.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Real-time €/m² indices for every Greek region",
                  "3,200+ monthly judicial & bank auctions",
                  "AI-powered investment scoring & portfolio tools",
                  "Automated property reports in minutes",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="flex gap-3">
                <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2 glow-cyan" asChild>
                  <a href="https://os.maiprop.co" target="_blank" rel="noreferrer">
                    Open mAI Prop OS <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
                <Button variant="outline" className="border-border gap-2" asChild>
                  <a href="https://os.maiprop.co" target="_blank" rel="noreferrer">
                    Learn More
                  </a>
                </Button>
              </div>
            </div>

            {/* Browser frame */}
            <div className="relative">
              {/* Glow behind */}
              <div className="absolute inset-0 -m-8 rounded-3xl opacity-20 blur-3xl"
                style={{ background: "radial-gradient(ellipse, hsl(183 100% 42%), transparent 70%)" }}
              />
              {/* Frame */}
              <div className="relative rounded-2xl overflow-hidden border border-primary/30 shadow-elevated glow-cyan">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-4 py-3 bg-brand-surface-3 border-b border-border">
                  <div className="flex gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-destructive/60" />
                    <span className="w-3 h-3 rounded-full bg-brand-gold/60" />
                    <span className="w-3 h-3 rounded-full bg-brand-emerald/60" />
                  </div>
                  <div className="flex-1 flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5 mx-2">
                    <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground font-mono">os.maiprop.co</span>
                  </div>
                  <a href="https://os.maiprop.co" target="_blank" rel="noreferrer"
                    className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                    <Maximize2 className="w-3.5 h-3.5" />
                  </a>
                </div>
                {/* Iframe */}
                <div className="relative aspect-[16/10] bg-brand-surface-2">
                  <iframe
                    src="https://os.maiprop.co"
                    title="mAI Prop OS — Real Estate Data Platform"
                    className="w-full h-full border-0"
                    loading="lazy"
                    style={{ transform: "scale(1)", transformOrigin: "top left" }}
                  />
                  {/* Clickable overlay that opens in new tab */}
                  <a
                    href="https://os.maiprop.co"
                    target="_blank"
                    rel="noreferrer"
                    className="absolute inset-0 bg-transparent hover:bg-primary/5 transition-colors flex items-end justify-end p-4"
                    title="Open mAI Prop OS"
                  >
                    <span className="flex items-center gap-1.5 bg-background/80 backdrop-blur-sm text-xs text-primary px-3 py-1.5 rounded-full border border-primary/30 font-medium opacity-0 hover:opacity-100 transition-opacity">
                      <ExternalLink className="w-3 h-3" /> Open Full Site
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── properties.maiprop.co Embed ── */}
      <section className="py-20 overflow-hidden">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Browser frame — left side */}
            <div className="relative order-last lg:order-first">
              {/* Glow behind */}
              <div className="absolute inset-0 -m-8 rounded-3xl opacity-20 blur-3xl"
                style={{ background: "radial-gradient(ellipse, hsl(42 95% 55%), transparent 70%)" }}
              />
              {/* Frame */}
              <div className="relative rounded-2xl overflow-hidden border border-brand-gold/30 shadow-elevated"
                style={{ boxShadow: "0 0 30px -5px hsl(42 95% 55% / 0.3)" }}>
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-4 py-3 bg-brand-surface-3 border-b border-border">
                  <div className="flex gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-destructive/60" />
                    <span className="w-3 h-3 rounded-full bg-brand-gold/60" />
                    <span className="w-3 h-3 rounded-full bg-brand-emerald/60" />
                  </div>
                  <div className="flex-1 flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5 mx-2">
                    <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground font-mono">properties.maiprop.co</span>
                  </div>
                  <a href="https://properties.maiprop.co" target="_blank" rel="noreferrer"
                    className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                    <Maximize2 className="w-3.5 h-3.5" />
                  </a>
                </div>
                {/* Iframe */}
                <div className="relative aspect-[16/10] bg-brand-surface-2">
                  <iframe
                    src="https://properties.maiprop.co"
                    title="mAI Prop Properties — Greek Golden Visa & Investment Properties"
                    className="w-full h-full border-0"
                    loading="lazy"
                  />
                  {/* Overlay */}
                  <a
                    href="https://properties.maiprop.co"
                    target="_blank"
                    rel="noreferrer"
                    className="absolute inset-0 bg-transparent hover:bg-brand-gold/5 transition-colors flex items-end justify-end p-4"
                    title="Open Properties Portal"
                  >
                    <span className="flex items-center gap-1.5 bg-background/80 backdrop-blur-sm text-xs text-brand-gold px-3 py-1.5 rounded-full border border-brand-gold/30 font-medium opacity-0 hover:opacity-100 transition-opacity">
                      <ExternalLink className="w-3 h-3" /> Open Full Site
                    </span>
                  </a>
                </div>
              </div>
            </div>

            {/* Copy */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-gold/10 border border-brand-gold/20 mb-5">
                <span className="text-xs font-semibold text-brand-gold uppercase tracking-wide">Greek Golden Visa</span>
              </div>
              <h2 className="font-display text-4xl font-bold leading-tight mb-4">
                Secure EU Residency <br />
                <span className="gradient-text-gold">Through Greek Property</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Our dedicated investment properties portal showcases curated €250K+ properties eligible for the Greek Golden Visa program — your gateway to EU residency, freedom of movement, and long-term capital growth.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Minimum €250K investment for EU residency",
                  "6–9 months to visa approval",
                  "Access for family including spouse & children",
                  "Strongest real estate yields in Southern Europe",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-gold mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="flex gap-3">
                <Button className="bg-gradient-gold border-0 text-background font-semibold gap-2" asChild>
                  <a href="https://properties.maiprop.co" target="_blank" rel="noreferrer">
                    Explore Properties <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
                <Button variant="outline" className="border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10" asChild>
                  <a href="https://properties.maiprop.co" target="_blank" rel="noreferrer">
                    Golden Visa Guide
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
