import { useEffect, useRef, useState } from "react";
import {
  Monitor,
  ArrowUpRight,
  Sparkles,
  MapPin,
  Bed,
  Square,
  Heart,
  Search,
  BarChart2,
  Gavel,
  Home,
  TrendingUp,
  Layers,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "./ScrollReveal";
import { useTranslation } from "@/contexts/TranslationContext";

// ─── Live flicker hook ────────────────────────────────────────────────────────
const CITIES = [
  {
    city: "Athens",
    base: 2840,
    change: 1.2,
    up: true,
    spark: "M0,14 C4,10 8,18 12,12 C16,6 20,16 24,10 C28,4 32,14 36,8 C40,2 44,12 48,8",
  },
  {
    city: "Thessaloniki",
    base: 1920,
    change: 0.8,
    up: true,
    spark: "M0,12 C4,16 8,8 12,14 C16,20 20,10 24,16 C28,12 32,18 36,12 C40,8 44,14 48,10",
  },
  {
    city: "Mykonos",
    base: 6450,
    change: 2.3,
    up: true,
    spark: "M0,16 C4,8 8,14 12,6 C16,2 20,10 24,4 C28,8 32,4 36,10 C40,6 44,14 48,8",
  },
  {
    city: "Glyfada",
    base: 3760,
    change: 1.7,
    up: true,
    spark: "M0,10 C4,14 8,8 12,12 C16,16 20,8 24,14 C28,10 32,6 36,12 C40,8 44,12 48,6",
  },
  {
    city: "Rhodes",
    base: 2299,
    change: 3.2,
    up: true,
    spark: "M0,8 C4,12 8,4 12,10 C16,6 20,14 24,8 C28,4 32,10 36,6 C40,12 44,8 48,4",
  },
  {
    city: "Santorini",
    base: 5120,
    change: 1.9,
    up: true,
    spark: "M0,14 C4,10 8,16 12,8 C16,4 20,12 24,6 C28,10 32,4 36,8 C40,2 44,10 48,6",
  },
  {
    city: "Kifisia",
    base: 4180,
    change: 0.6,
    up: true,
    spark: "M0,12 C4,8 8,14 12,10 C16,6 20,12 24,8 C28,14 32,10 36,14 C40,8 44,12 48,10",
  },
];

function useLiveFlicker() {
  const [prices, setPrices] = useState<Record<string, number>>(Object.fromEntries(CITIES.map((c) => [c.city, c.base])));
  const [flick, setFlick] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const tick = () => {
      const row = CITIES[Math.floor(Math.random() * CITIES.length)];
      const delta = row.base * (0.0005 + Math.random() * 0.002) * (Math.random() > 0.35 ? 1 : -1);
      setPrices((prev) => ({ ...prev, [row.city]: Math.round(prev[row.city] + delta) }));
      setFlick(row.city);
      setTimeout(() => setFlick(null), 700);
      timer.current = setTimeout(tick, 2600 + Math.random() * 700);
    };
    timer.current = setTimeout(tick, 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { prices, flick };
}

// ─── Listing-site mockup ──────────────────────────────────────────────────────
const MOCK_CARDS = [
  {
    title: "Kolonaki Apartment",
    city: "Athens",
    beds: 2,
    sqm: 85,
    price: "€420,000",
    badge: "New",
    img: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=70",
  },
  {
    title: "Mykonos Villa",
    city: "Mykonos",
    beds: 4,
    sqm: 220,
    price: "€1,850,000",
    badge: "Golden Visa",
    img: "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=400&q=70",
  },
  {
    title: "Glyfada Penthouse",
    city: "Glyfada",
    beds: 3,
    sqm: 140,
    price: "€680,000",
    badge: "Featured",
    img: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&q=70",
  },
];

function PropertiesMockup() {
  const [scrollY, setScrollY] = useState(0);
  const raf = useRef<number>();

  useEffect(() => {
    let start: number | null = null;
    const animate = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      // 0→120px over 8s, then loop
      setScrollY(((elapsed % 8000) / 8000) * 120);
      raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div className="w-full bg-[hsl(222_47%_7%)] text-white overflow-hidden" style={{ minHeight: 360 }}>
      {/* Nav */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8 bg-[hsl(222_47%_6%)]">
        <span className="font-black text-sm tracking-tight text-white">
          mAI <span style={{ color: "hsl(192 100% 50%)" }}>Prop</span>
        </span>
        <div className="flex items-center gap-1.5 bg-white/6 border border-white/10 rounded-full px-3 py-1 text-[10px] text-white/50 w-40">
          <Search className="w-3 h-3" />
          <span>Search properties, areas…</span>
        </div>
        <div className="flex items-center gap-2">
          <Bell className="w-3.5 h-3.5 text-white/40" />
          <Heart className="w-3.5 h-3.5 text-white/40" />
          <div className="w-6 h-6 rounded-full bg-primary/30 border border-primary/50" />
        </div>
      </div>

      {/* Market ticker strip */}
      <div className="flex items-center gap-0 overflow-hidden border-b border-white/6 bg-[hsl(222_47%_5%)] px-0 py-0">
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-r border-white/8 shrink-0">
          <span className="relative flex w-1.5 h-1.5">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ background: "hsl(192 100% 50%)" }}
            />
            <span
              className="relative inline-flex rounded-full w-1.5 h-1.5"
              style={{ background: "hsl(192 100% 50%)" }}
            />
          </span>
          <span className="text-[9px] font-black tracking-widest uppercase" style={{ color: "hsl(192 100% 60%)" }}>
            Live
          </span>
        </div>
        <div className="flex gap-4 px-3 py-1.5 overflow-hidden">
          {CITIES.slice(0, 5).map((c) => (
            <span key={c.city} className="flex items-center gap-1.5 shrink-0 text-[10px]">
              <span className="text-white/50">{c.city}</span>
              <span className="font-bold tabular-nums" style={{ color: "hsl(192 100% 70%)" }}>
                €{c.base.toLocaleString()}
              </span>
              <span className="text-[9px]" style={{ color: c.up ? "hsl(142 72% 55%)" : "hsl(0 72% 55%)" }}>
                {c.up ? "▲" : "▼"}
                {c.change}%
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Hero */}
      <div className="relative px-4 pt-4 pb-2">
        <div className="text-[11px] font-black tracking-widest uppercase mb-1" style={{ color: "hsl(192 100% 50%)" }}>
          Greece's #1 AI Property Portal
        </div>
        <div className="text-base font-black leading-tight mb-3">
          Find Your Perfect Greek
          <br />
          <span style={{ color: "hsl(192 100% 55%)" }}>Golden Visa Property</span>
        </div>
        {/* Stats bar */}
        <div className="flex gap-3 mb-4">
          {[
            ["12,400+", "Listings"],
            ["3,200+", "Auctions/mo"],
            ["€250k", "Min GV"],
          ].map(([v, l]) => (
            <div key={l} className="flex-1 rounded-lg bg-white/5 border border-white/8 px-2 py-1.5 text-center">
              <div className="text-xs font-black" style={{ color: "hsl(192 100% 60%)" }}>
                {v}
              </div>
              <div className="text-[9px] text-white/40 mt-0.5">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scrolling cards */}
      <div className="relative px-4 pb-3 overflow-hidden" style={{ maxHeight: 170 }}>
        <div style={{ transform: `translateY(-${scrollY}px)`, transition: "none", willChange: "transform" }}>
          {[...MOCK_CARDS, ...MOCK_CARDS].map((card, i) => (
            <div key={i} className="flex gap-3 mb-2.5 rounded-xl bg-white/5 border border-white/8 overflow-hidden">
              <img src={card.img} alt="" className="w-20 h-16 object-cover shrink-0" />
              <div className="flex-1 py-2 pr-3 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "hsl(192 100% 50% / 0.15)", color: "hsl(192 100% 60%)" }}
                  >
                    {card.badge}
                  </span>
                </div>
                <div className="text-[11px] font-semibold text-white truncate">{card.title}</div>
                <div className="flex items-center gap-1 text-[9px] text-white/40 mt-0.5">
                  <MapPin className="w-2.5 h-2.5" />
                  {card.city}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center gap-2 text-[9px] text-white/50">
                    <span className="flex items-center gap-0.5">
                      <Bed className="w-2.5 h-2.5" />
                      {card.beds}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Square className="w-2.5 h-2.5" />
                      {card.sqm}m²
                    </span>
                  </div>
                  <span className="text-[11px] font-black" style={{ color: "hsl(192 100% 60%)" }}>
                    {card.price}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Fade out */}
        <div
          className="absolute inset-x-0 bottom-0 h-10 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, hsl(222 47% 7%))" }}
        />
      </div>
    </div>
  );
}

// ─── OS Dashboard mockup ──────────────────────────────────────────────────────
const REGIONS = [
  { name: "Attica", score: 87, price: 2840, change: "+4.2%", up: true },
  { name: "Central Greece", score: 71, price: 1640, change: "+2.1%", up: true },
  { name: "Crete", score: 79, price: 2180, change: "+5.8%", up: true },
  { name: "South Aegean", score: 93, price: 4750, change: "+7.1%", up: true },
  { name: "Thessaly", score: 58, price: 1210, change: "-0.3%", up: false },
];

const CHART_POINTS = [38, 42, 40, 46, 44, 52, 50, 58, 56, 62, 60, 68, 66, 72, 70, 76];

function OSDashboardMockup() {
  const { prices, flick } = useLiveFlicker();
  const [activeRegion, setActiveRegion] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActiveRegion((p) => (p + 1) % REGIONS.length), 2500);
    return () => clearInterval(id);
  }, []);

  const maxPts = Math.max(...CHART_POINTS);
  const chartH = 52;
  const ptStr = CHART_POINTS.map(
    (v, i) => `${(i / (CHART_POINTS.length - 1)) * 100},${chartH - (v / maxPts) * chartH}`,
  ).join(" ");

  return (
    <div className="w-full flex bg-[hsl(225_35%_6%)] text-white overflow-hidden" style={{ minHeight: 360 }}>
      {/* Sidebar */}
      <div className="w-10 shrink-0 flex flex-col items-center gap-3 py-3 border-r border-white/8 bg-[hsl(225_35%_5%)]">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: "hsl(263 86% 64% / 0.2)", border: "1px solid hsl(263 86% 64% / 0.4)" }}
        >
          <span className="text-[8px] font-black" style={{ color: "hsl(263 86% 75%)" }}>
            OS
          </span>
        </div>
        <div className="w-px h-3 bg-white/10" />
        {[BarChart2, MapPin, Gavel, Home, Layers].map((Icon, i) => (
          <button
            key={i}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{
              background: i === 0 ? "hsl(263 86% 64% / 0.2)" : "transparent",
              border: i === 0 ? "1px solid hsl(263 86% 64% / 0.3)" : "1px solid transparent",
            }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: i === 0 ? "hsl(263 86% 75%)" : "hsl(215 20% 40%)" }} />
          </button>
        ))}
      </div>

      {/* Main */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/8 bg-[hsl(225_35%_5%)]">
          <div>
            <div className="text-[11px] font-black text-white">Market Intelligence</div>
            <div className="text-[9px] text-white/30">Live Greek Real Estate Index</div>
          </div>
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-black"
            style={{
              background: "hsl(263 86% 64% / 0.15)",
              border: "1px solid hsl(263 86% 64% / 0.3)",
              color: "hsl(263 86% 75%)",
            }}
          >
            <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: "hsl(263 86% 64%)" }} />
            LIVE DATA
          </div>
        </div>

        <div className="flex flex-1 gap-0 overflow-hidden">
          {/* Left: price table */}
          <div className="w-1/2 border-r border-white/8 overflow-hidden">
            {/* Mini chart */}
            <div className="px-3 pt-2.5 pb-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Attica €/m² Trend</span>
                <span className="text-[10px] font-black" style={{ color: "hsl(263 86% 75%)" }}>
                  +4.2% YoY
                </span>
              </div>
              <svg
                width="100%"
                height={chartH + 4}
                viewBox={`0 0 100 ${chartH + 4}`}
                preserveAspectRatio="none"
                className="overflow-visible"
              >
                <defs>
                  <linearGradient id="osGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(263 86% 64%)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="hsl(263 86% 64%)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon points={`0,${chartH + 4} ${ptStr} 100,${chartH + 4}`} fill="url(#osGrad)" />
                <polyline
                  points={ptStr}
                  fill="none"
                  stroke="hsl(263 86% 64%)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* Live prices */}
            <div className="divide-y" style={{ borderColor: "hsl(263 86% 64% / 0.07)" }}>
              {CITIES.slice(0, 5).map((row) => {
                const isFlick = flick === row.city;
                const livePrice = prices[row.city] ?? row.base;
                return (
                  <div
                    key={row.city}
                    className="flex items-center gap-2 px-3 py-1.5 transition-all duration-300"
                    style={{ background: isFlick ? "hsl(263 86% 64% / 0.08)" : "transparent" }}
                  >
                    <span
                      className="flex-1 text-[10px] transition-colors duration-300"
                      style={{ color: isFlick ? "hsl(263 86% 80%)" : "hsl(215 20% 60%)" }}
                    >
                      {row.city}
                    </span>
                    <span
                      className="text-[10px] font-bold tabular-nums transition-colors duration-300"
                      style={{ color: isFlick ? "hsl(263 86% 75%)" : "hsl(210 40% 90%)" }}
                    >
                      €{livePrice.toLocaleString()}
                    </span>
                    <span
                      className="text-[9px] font-black w-10 text-right"
                      style={{ color: row.up ? "hsl(142 72% 55%)" : "hsl(0 72% 55%)" }}
                    >
                      {row.up ? "▲" : "▼"}
                      {row.change}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: regions + auctions */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Regions */}
            <div className="px-3 pt-2 pb-1">
              <div className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
                AI Investment Score
              </div>
              <div className="space-y-1.5">
                {REGIONS.map((r, i) => (
                  <div
                    key={r.name}
                    className="transition-all duration-500"
                    style={{
                      opacity: i === activeRegion ? 1 : 0.55,
                      transform: i === activeRegion ? "scale(1.01)" : "scale(1)",
                    }}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span
                        className="text-[9px]"
                        style={{ color: i === activeRegion ? "hsl(263 86% 80%)" : "hsl(215 20% 55%)" }}
                      >
                        {r.name}
                      </span>
                      <span
                        className="text-[9px] font-black"
                        style={{ color: i === activeRegion ? "hsl(263 86% 75%)" : "hsl(215 20% 45%)" }}
                      >
                        {r.score}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${r.score}%`,
                          background:
                            i === activeRegion
                              ? "linear-gradient(to right, hsl(263 86% 64%), hsl(192 100% 50%))"
                              : "hsl(263 86% 64% / 0.35)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Auction strip */}
            <div className="mt-auto px-3 py-2 border-t border-white/8" style={{ background: "hsl(270 40% 8% / 0.6)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px]">🔨</span>
                  <span
                    className="text-[9px] font-black tracking-wider uppercase"
                    style={{ color: "hsl(270 75% 75%)" }}
                  >
                    Judicial Auctions
                  </span>
                </div>
                <span
                  className="text-[10px] font-black px-1.5 py-0.5 rounded-md"
                  style={{ color: "hsl(270 75% 75%)", background: "hsl(270 75% 62% / 0.15)" }}
                >
                  3,241
                </span>
              </div>
              <div className="flex gap-1.5 mt-1.5">
                {[
                  ["Athens", "€95k"],
                  ["Thessaloniki", "€48k"],
                  ["Patras", "€32k"],
                ].map(([city, bid]) => (
                  <div
                    key={city}
                    className="flex-1 rounded-md px-2 py-1 text-center"
                    style={{ background: "hsl(270 40% 12% / 0.8)", border: "1px solid hsl(270 75% 62% / 0.2)" }}
                  >
                    <div className="text-[8px] text-white/40 truncate">{city}</div>
                    <div className="text-[9px] font-black" style={{ color: "hsl(270 75% 70%)" }}>
                      {bid}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Platform config ──────────────────────────────────────────────────────────
const platforms = [
  {
    badge: "POWERED BY MAI PROP",
    badgeIcon: Sparkles,
    titleLine1: "Greece's #1 AI-Powered",
    titleLine2: "Property Platform",
    titleColor: "text-primary",
    desc: "The most intelligent real estate listing portal in Greece — live market data, AI-powered search, auctions, open houses, & market professionals, all in one place.",
    bullets: [
      "Mark to Market Valuation of every listing",
      "Access to Auctions & Open Houses",
      "AI property search & side-by-side analytics",
      "Market professionals",
    ],
    bulletColor: "text-primary",
    cta: "Open mAI Prop",
    ctaStyle:
      "bg-primary text-primary-foreground shadow-[0_0_30px_hsl(179_90%_63%/0.4)] hover:bg-primary/90 hover:shadow-[0_0_50px_hsl(179_90%_63%/0.6)]",
    href: "https://maiprop.co",
    MockupComponent: PropertiesMockup,
    url: "maiprop.co",
    reverse: false,
    glowClass: "bg-primary",
  },
  {
    badge: "POWERED BY MAI PROP OS",
    badgeIcon: Monitor,
    titleLine1: "Gain The Edge In",
    titleLine2: "Greek Real Estate",
    titleColor: "text-secondary",
    desc: "mAI Prop OS is the professional data platform powering every insight on this site — aggregating cadastre records, judicial auctions, price indices, and predictive analytics into one live dashboard.",
    bullets: [
      "Real-time €/m² indices for every Greek region",
      "3,200+ monthly judicial & bank auctions tracked",
      "AI-powered investment scoring & portfolio tools",
      "Mapped data & automated property reports",
    ],
    bulletColor: "text-secondary",
    cta: "Open mAI Prop OS",
    ctaStyle:
      "bg-secondary text-secondary-foreground shadow-[0_0_30px_hsl(263_86%_64%/0.4)] hover:bg-secondary/90 hover:shadow-[0_0_50px_hsl(263_86%_64%/0.6)]",
    href: "https://app.os.maiprop.co",
    MockupComponent: OSDashboardMockup,
    url: "os.maiprop.co",
    reverse: true,
    glowClass: "bg-secondary",
  },
];

// ─── Main section ─────────────────────────────────────────────────────────────
const PlatformReference = () => {
  const { t } = useTranslation();

  return (
    <section id="platform" className="relative overflow-hidden bg-background py-16 sm:py-24">
      <div className="pointer-events-none absolute left-0 top-1/4 h-[600px] w-[600px] rounded-full bg-primary/6 blur-[180px]" />
      <div className="pointer-events-none absolute right-0 bottom-1/4 h-[500px] w-[500px] rounded-full bg-secondary/6 blur-[160px]" />

      <div className="relative container mx-auto px-6">
        {/* Section header */}
        <ScrollReveal>
          <div className="mb-4 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-4 py-1.5 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Your Ecosystem Partner
            </div>
            <h2 className="text-4xl font-bold sm:text-5xl">
              Two platforms, <span className="text-primary">one ecosystem</span>
            </h2>
            <p className="mt-4 mx-auto max-w-2xl text-muted-foreground leading-relaxed">
              {t(
                "Powered by the same AI infrastructure that drives mAI Prop — Greece's most intelligent real estate data layer, built for investors and professionals.",
              )}
            </p>
          </div>
        </ScrollReveal>

        <div className="flex flex-col">
          {platforms.map((p, i) => (
            <div key={p.url}>
              <ScrollReveal>
                <div
                  className={`grid items-center gap-12 lg:gap-20 lg:grid-cols-2 py-16 sm:py-24 ${p.reverse ? "lg:[direction:rtl]" : ""}`}
                >
                  {/* Text */}
                  <div className={p.reverse ? "[direction:ltr]" : ""}>
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-4 py-1.5 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                      <p.badgeIcon className="h-3.5 w-3.5" />
                      {p.badge}
                    </div>

                    <h3 className="text-4xl font-bold leading-tight sm:text-5xl">
                      {p.titleLine1}
                      <br />
                      <span className={p.titleColor}>{p.titleLine2}</span>
                    </h3>

                    <p className="mt-4 mb-7 text-muted-foreground leading-relaxed max-w-lg">{t(p.desc)}</p>

                    <ul className="space-y-2.5 mb-10">
                      {p.bullets.map((b) => (
                        <li key={b} className="flex items-center gap-3 text-sm text-foreground">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.bulletColor} opacity-80`}
                            style={{ background: "currentColor" }}
                          />
                          {t(b)}
                        </li>
                      ))}
                    </ul>

                    <Button
                      asChild
                      size="lg"
                      className={`gap-2 rounded-full px-8 font-semibold transition-all ${p.ctaStyle}`}
                    >
                      <a href={p.href} target="_blank" rel="noopener noreferrer">
                        {t(p.cta)} <ArrowUpRight className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>

                  {/* Browser mockup */}
                  <div className={`relative ${p.reverse ? "[direction:ltr]" : ""}`}>
                    <div
                      className={`pointer-events-none absolute -inset-6 rounded-3xl blur-[60px] opacity-20 ${p.glowClass}`}
                    />

                    <div className="relative rounded-xl overflow-hidden border border-border/50 shadow-2xl bg-card">
                      {/* Title bar */}
                      <div className="flex items-center gap-3 border-b border-border/40 bg-muted/60 px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
                          <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
                          <span className="h-3 w-3 rounded-full bg-[#28C840]" />
                        </div>
                        <div className="flex flex-1 items-center justify-center">
                          <div className="flex items-center gap-2 rounded-md bg-background/60 border border-border/40 px-3 py-1 text-xs text-muted-foreground max-w-[220px] w-full">
                            <svg
                              className="h-3 w-3 shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <circle cx="12" cy="12" r="10" />
                              <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
                            </svg>
                            {p.url}
                          </div>
                        </div>
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </div>

                      {/* Live mockup */}
                      <div className="overflow-hidden">
                        <p.MockupComponent />
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollReveal>

              {/* Divider */}
              {i < platforms.length - 1 && (
                <div className="relative flex flex-col items-center justify-center py-6 sm:py-8">
                  <div className="relative flex items-center gap-4 w-full max-w-sm">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent opacity-60" />
                    <span
                      className="shrink-0 rounded-full border border-transparent px-4 py-1 text-xs font-semibold tracking-widest uppercase"
                      style={{
                        background:
                          "linear-gradient(hsl(var(--background)), hsl(var(--background))) padding-box, linear-gradient(90deg, hsl(var(--primary)/0.3), hsl(var(--secondary)/0.6), hsl(var(--primary)/0.3)) border-box",
                        color: "hsl(var(--muted-foreground))",
                        backgroundSize: "200% auto",
                        animation: "shimmer 3s linear infinite",
                      }}
                    >
                      Also in the ecosystem
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent opacity-60" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PlatformReference;
