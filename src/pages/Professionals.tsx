import { useState, useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { Search, Star, MapPin, CheckCircle, Loader2, MessageSquare, ArrowRight, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { AIServiceMatchModal } from "@/components/AIServiceMatchModal";
import { useProfessionals } from "@/hooks/useProfessionals";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getPlanLimits } from "@/hooks/usePlanLimits";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import { Link } from "react-router-dom";

// ─── Category Groups ──────────────────────────────────────────────────────────
const categoryGroups = [
  {
    id: "agents",
    label: "Real Estate Agents",
    emoji: "🏠",
    color: "text-white",
    bg: "bg-gradient-accent",
    border: "border-transparent",
    categories: ["real_estate_agent"],
    description: "Buy, sell, rent — licensed agents & agencies",
  },
  {
    id: "legal",
    label: "Legal & Title",
    emoji: "⚖️",
    color: "text-white",
    bg: "bg-gradient-primary",
    border: "border-transparent",
    categories: ["lawyer", "notary"],
    description: "Property title, contracts, conveyancing",
  },
  {
    id: "finance",
    label: "Finance & Insurance",
    emoji: "💼",
    color: "text-white",
    bg: "bg-gradient-emerald",
    border: "border-transparent",
    categories: ["financial_advisor", "valuer", "insurance_broker"],
    description: "Mortgages, valuations, property insurance",
  },
  {
    id: "design",
    label: "Design & Planning",
    emoji: "🏛️",
    color: "text-white",
    bg: "bg-gradient-warm",
    border: "border-transparent",
    categories: ["architect", "civil_engineer", "interior_designer", "urban_planning_consultant", "building_permit_consultant"],
    description: "Architecture, engineering, urban planning",
  },
  {
    id: "construction",
    label: "Construction & Trades",
    emoji: "🏗️",
    color: "text-white",
    bg: "bg-gradient-primary",
    border: "border-transparent",
    categories: [
      "electrician",
      "plumber",
      "contractor",
      "concrete_contractor",
      "steel_structure_contractor",
      "carpenter",
      "tile_installer",
      "painter",
      "drywall_installer",
      "waterproofing_specialist",
      "insulation_contractor",
      "roofing_contractor",
      "window_aluminum_installer",
      "elevator_installer",
      "smart_home_installer",
    ],
    description: "Electricians, plumbers, contractors and trade specialists",
  },
  {
    id: "consultants",
    label: "Consultants & Compliance",
    emoji: "📄",
    color: "text-white",
    bg: "bg-gradient-accent",
    border: "border-transparent",
    categories: [
      "utility_certification_provider",
      "esg_sustainability_consultant",
      "legalization_specialist",
      "energy_certificate_inspector",
      "building_regulation_consultant",
      "fire_protection_consultant",
    ],
    description: "Utility certification, legalization, energy & compliance",
  },
  {
    id: "management",
    label: "Property & Hospitality",
    emoji: "🏢",
    color: "text-white",
    bg: "bg-gradient-gold",
    border: "border-transparent",
    categories: ["property_manager", "facility_manager", "short_term_rental_operator", "hotel_hospitality_operator"],
    description: "Property management, STR and hospitality operators",
  },
  {
    id: "advisory",
    label: "Advisory & Tech",
    emoji: "✈️",
    color: "text-white",
    bg: "bg-gradient-emerald",
    border: "border-transparent",
    categories: ["relocation_immigration_consultant", "marketing_agency", "crm_listing_data_provider"],
    description: "Relocation, marketing, CRM and data providers",
  },
];



const categoryInfo: Record<string, { emoji: string; label: string; group: string }> = {
  real_estate_agent: { emoji: "🏠", label: "Real Estate Agent", group: "agents" },
  architect: { emoji: "🏛️", label: "Architect", group: "design" },
  civil_engineer: { emoji: "⚙️", label: "Civil Engineer", group: "design" },
  lawyer: { emoji: "⚖️", label: "Lawyer", group: "legal" },
  notary: { emoji: "📜", label: "Notary", group: "legal" },
  electrician: { emoji: "⚡", label: "Electrician", group: "construction" },
  plumber: { emoji: "🔧", label: "Plumber", group: "construction" },
  contractor: { emoji: "🏗️", label: "Contractor", group: "construction" },
  property_manager: { emoji: "🏢", label: "Property Manager", group: "management" },
  valuer: { emoji: "📊", label: "Valuer", group: "finance" },
  interior_designer: { emoji: "🎨", label: "Interior Designer", group: "design" },
  financial_advisor: { emoji: "💼", label: "Financial Advisor", group: "finance" },
  insurance_broker: { emoji: "🛡️", label: "Insurance Broker", group: "finance" },
  utility_certification_provider: { emoji: "📄", label: "Utility & Certification", group: "consultants" },
  esg_sustainability_consultant: { emoji: "🌱", label: "ESG / Sustainability", group: "consultants" },
  relocation_immigration_consultant: { emoji: "✈️", label: "Relocation / Immigration", group: "advisory" },
  facility_manager: { emoji: "🔑", label: "Facility Manager", group: "management" },
  short_term_rental_operator: { emoji: "🏡", label: "Short-Term Rental", group: "management" },
  hotel_hospitality_operator: { emoji: "🏨", label: "Hotel / Hospitality", group: "management" },
  marketing_agency: { emoji: "📸", label: "Marketing / Media", group: "advisory" },
  crm_listing_data_provider: { emoji: "📊", label: "CRM / Data Provider", group: "advisory" },
  concrete_contractor: { emoji: "🧱", label: "Concrete Contractor", group: "construction" },
  steel_structure_contractor: { emoji: "🔩", label: "Steel Structure", group: "construction" },
  carpenter: { emoji: "🪚", label: "Carpenter", group: "construction" },
  tile_installer: { emoji: "🔲", label: "Tile Installer", group: "construction" },
  painter: { emoji: "🖌️", label: "Painter", group: "construction" },
  building_permit_consultant: { emoji: "📝", label: "Building Permit", group: "design" },
  urban_planning_consultant: { emoji: "🗺️", label: "Urban Planning", group: "design" },
  legalization_specialist: { emoji: "📜", label: "Legalization Specialist", group: "consultants" },
  energy_certificate_inspector: { emoji: "⚡", label: "Energy Certificate (ΠΕΑ)", group: "consultants" },
  building_regulation_consultant: { emoji: "✔️", label: "Regulation Compliance", group: "consultants" },
  fire_protection_consultant: { emoji: "🔥", label: "Fire Protection", group: "consultants" },
  drywall_installer: { emoji: "📐", label: "Drywall Installer", group: "construction" },
  waterproofing_specialist: { emoji: "💧", label: "Waterproofing", group: "construction" },
  insulation_contractor: { emoji: "🧊", label: "Insulation", group: "construction" },
  roofing_contractor: { emoji: "🏠", label: "Roofing", group: "construction" },
  window_aluminum_installer: { emoji: "🪟", label: "Window / Aluminum", group: "construction" },
  elevator_installer: { emoji: "🛗", label: "Elevator Installer", group: "construction" },
  smart_home_installer: { emoji: "📱", label: "Smart Home", group: "construction" },
};

function limitProfessionalsPerCategory<T extends { category?: string | null }>(
  professionals: T[],
  limit: number | null | undefined,
): T[] {
  if (limit == null) return professionals;
  if (limit <= 0) return [];

  const seenByCategory = new Map<string, number>();
  return professionals.filter((professional) => {
    const category = professional.category || "__uncategorized";
    const seen = seenByCategory.get(category) ?? 0;
    if (seen >= limit) return false;
    seenByCategory.set(category, seen + 1);
    return true;
  });
}

export default function Professionals() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFromUrl = searchParams.get("category");
  const searchFromUrl = searchParams.get("search") || "";
  const { profile } = useAuth();
  const { isPro } = useSubscription();

  const [selectedGroup, setSelectedGroup] = useState<string | null>(() => {
    if (!categoryFromUrl) return null;
    const g = categoryGroups.find((gr) => gr.categories.includes(categoryFromUrl));
    return g?.id ?? null;
  });
  const [search, setSearch] = useState(searchFromUrl);
  const [aiMatchOpen, setAiMatchOpen] = useState(false);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const scrollCategories = (dir: "left" | "right") => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const step = 280;
    el.scrollBy({ left: dir === "left" ? -step : step, behavior: "smooth" });
  };

  const selectGroup = (groupId: string | null) => {
    if (!groupId) {
      setSelectedGroup(null);
      setSearchParams((p) => {
        const n = new URLSearchParams(p);
        n.delete("category");
        return n;
      });
      return;
    }

    const group = categoryGroups.find((g) => g.id === groupId) ?? null;
    setSelectedGroup(group?.id ?? null);
    const cat = group?.categories?.[0];
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      if (cat) n.set("category", cat);
      else n.delete("category");
      return n;
    });
  };

  useEffect(() => {
    if (categoryFromUrl) {
      const g = categoryGroups.find((gr) => gr.categories.includes(categoryFromUrl));
      setSelectedGroup(g?.id ?? null);
    }
  }, [categoryFromUrl]);

  useEffect(() => { setSearch(searchFromUrl); }, [searchFromUrl]);

  // Derive DB categories from group selection
  const dbCategory = selectedGroup ?
  undefined // fetch all, filter client-side by group
  : undefined;

  const { data: professionals = [], isLoading } = useProfessionals(dbCategory);
  const participantType = getParticipantTypeFromProfile(profile);
  const professionalsPerCategory = getPlanLimits(
    participantType,
    isPro ? "pro" : "free",
  ).professionalsPerCategory;

  const categoryFiltered = (Array.isArray(professionals) ? professionals : []).filter((p) => {
    // Category from URL (e.g. from homepage search) — exact match
    if (categoryFromUrl) {
      if (p.category !== categoryFromUrl) return false;
    } else if (selectedGroup) {
      const group = categoryGroups.find((g) => g.id === selectedGroup);
      if (group && !group.categories.includes(p.category)) return false;
    }
    return true;
  });
  const cappedProfessionals = limitProfessionalsPerCategory(categoryFiltered, professionalsPerCategory);
  const visibleProfessionals = cappedProfessionals.filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (p.display_name || "").toLowerCase().includes(q) ||
      (p.title || "").toLowerCase().includes(q) ||
      (p.specialties || []).join(" ").toLowerCase().includes(q) ||
      (p.city || "").toLowerCase().includes(q));

  });

  const activeGroup = selectedGroup ? categoryGroups.find((g) => g.id === selectedGroup) : null;

  return (
    <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Helmet>
        <title>Find Property Professionals in Greece — mAI prop</title>
        <meta name="description" content="Connect with verified architects, lawyers, agents and contractors for your Greek property transaction." />
        <link rel="canonical" href="https://maiprop.co/professionals" />
        <meta property="og:title" content="Property Professionals Directory — mAI prop" />
        <meta property="og:description" content="Verified architects, lawyers, agents and contractors across Greece." />
        <meta property="og:url" content="https://maiprop.co/professionals" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Greek Property Professionals Directory",
          "url": "https://maiprop.co/professionals",
          "description": "Verified architects, lawyers, agents and contractors across Greece.",
          "provider": { "@type": "Organization", "name": "mAI prop", "url": "https://maiprop.co" },
        })}</script>
      </Helmet>
      <Navbar />
      {aiMatchOpen && <AIServiceMatchModal onClose={() => setAiMatchOpen(false)} onNavigate={(cat) => { setSearchParams((p) => { const n = new URLSearchParams(p); n.set("category", cat); return n; }); setSelectedGroup(categoryGroups.find((g) => g.categories.includes(cat))?.id ?? null); }} />}
      <main id="main-content" className="pt-16">

        {/* ── Hero ───────────────────────────────────────────────────── */}
        <div className="relative bg-card border-b border-border overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "linear-gradient(hsl(265 80% 60%) 1px, transparent 1px), linear-gradient(90deg, hsl(265 80% 60%) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-10"
          style={{ background: "radial-gradient(hsl(183 100% 42%), transparent 70%)" }} />

          <div className="container relative py-8 sm:py-14">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent/15 border border-accent/30 mb-4 sm:mb-5">
              <Search className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-bold text-accent uppercase tracking-widest">Professional Directory</span>
            </div>
            <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 items-end">
              <div>
                <h1 className="font-display text-3xl sm:text-5xl font-bold mb-3 leading-tight text-foreground">
                  The right expert,<br />
                  <span className="gradient-text-cyan drop-shadow-[0_0_20px_rgba(133,106,255,0.65)]">
                    one click away
                  </span>
                </h1>
                <p className="text-muted-foreground max-w-lg text-base sm:text-lg leading-relaxed mb-4 sm:mb-5">
                  Architects, lawyers, contractors and more — a curated directory of verified property professionals across Greece.
                </p>
                <Button
                  onClick={() => setAiMatchOpen(true)}
                  className="bg-gradient-accent text-accent-foreground border-0 shadow-md hover:opacity-95 gap-2 px-5 sm:px-7"
                >
                  <Search className="w-4 h-4" />
                  Explore directory
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
              











              
            </div>
          </div>
        </div>

        {/* ── Category Groups ─────────────────────────────────────────── */}
        <div className="bg-card/40 border-b border-border">
          <div className="container py-4 sm:py-6">
            {/* Mobile: compact dropdown */}
            <div className="sm:hidden">
              <label className="sr-only" htmlFor="professional-category-group">Category</label>
              <div className="relative">
                <select
                  id="professional-category-group"
                  value={selectedGroup ?? ""}
                  onChange={(e) => selectGroup(e.target.value || null)}
                  className="w-full h-10 appearance-none bg-secondary border border-border rounded-xl pl-3 pr-9 text-sm text-foreground outline-none focus:border-primary cursor-pointer"
                >
                  <option value="">All Professionals</option>
                  {categoryGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.emoji} {g.label}
                    </option>
                  ))}
                </select>
                <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none rotate-90" />
              </div>
            </div>

            {/* Desktop/tablet: scrollable chips */}
            <div className="relative hidden sm:flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Scroll categories left"
                className="shrink-0 h-9 w-9 rounded-full border-border hover:bg-secondary hidden sm:flex"
                onClick={() => scrollCategories("left")}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {/* Slider — horizontally scrollable */}
              <div
                ref={categoryScrollRef}
                className="flex gap-2 overflow-x-auto scrollbar-none pb-1 flex-1 min-w-0"
              >
              <button
                onClick={() => selectGroup(null)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium border transition-all shrink-0 ${
                !selectedGroup ?
                "bg-secondary border-primary/40 text-foreground" :
                "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"}`
                }>
                All Professionals
              </button>
              <button
                onClick={() => {
                  if (selectedGroup === "agents") selectGroup(null);
                  else selectGroup("agents");
                }}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-semibold border transition-all shrink-0 ${
                 selectedGroup === "agents" ?
                 "bg-primary/10 border-primary/20 text-primary" :
                "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"}`}
              >
                <span>🏠</span>
                <span>Real Estate Agents</span>
              </button>
              {categoryGroups.filter(g => g.id !== "agents").map((group) =>
              <button
                key={group.id}
                onClick={() => {
                  if (selectedGroup === group.id) selectGroup(null);
                  else selectGroup(group.id);
                }}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-semibold border transition-all shrink-0 ${
                selectedGroup === group.id ?
                `${group.bg} ${group.border} ${group.color}` :
                "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"}`
                }>
                  <span>{group.emoji}</span>
                  <span>{group.label}</span>
                </button>
              )}
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Scroll categories right"
                className="shrink-0 h-9 w-9 rounded-full border-border hover:bg-secondary hidden sm:flex"
                onClick={() => scrollCategories("right")}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="container py-6 sm:py-8 pb-8">

          {/* ── Search ───────────────────────────────────────────────── */}
          <div className="flex gap-3 mb-6 flex-wrap items-center">
            <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-secondary border border-border rounded-xl px-4 py-2.5 focus-within:border-primary transition-colors">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                aria-label="Search professionals by name, specialty, or city"
                placeholder="Search by name, specialty, city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            </div>
          </div>

          {/* ── Results ──────────────────────────────────────────────── */}
          {isLoading ?
          <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div> :
          visibleProfessionals.length === 0 ?
          <div className="text-center py-20 text-muted-foreground">
              <p className="text-lg font-medium mb-1">No professionals found</p>
              <p className="text-sm">Try adjusting your search or category filter</p>
            </div> :

          <>
              <p className="text-sm text-muted-foreground mb-4" aria-live="polite" aria-atomic="true">{visibleProfessionals.length} professional{visibleProfessionals.length !== 1 ? "s" : ""} found{activeGroup ? ` in ${activeGroup.label}` : ""}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {visibleProfessionals.map((pro) => {
                const name = pro.display_name || "Professional";
                const catData = categoryInfo[pro.category] || { emoji: "👤", label: pro.category, group: "" };
                const group = categoryGroups.find((g) => g.id === catData.group);
                const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                const rating = Number(pro.rating) || 0;
                const specialties = pro.specialties || [];

                const professionalIsPro = (pro.subscription_tier || "").toLowerCase() === "pro";

                return (
                  <div
                    key={pro.id}
                    className="relative glass-card rounded-2xl p-5 flex flex-col gap-4 border border-white/5 hover:border-brand-purple/40 hover:shadow-elevated transition-all group overflow-hidden"
                  >
                    <div className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{ background: "radial-gradient(circle at 0 0, hsl(var(--brand-cyan-soft)/0.25), transparent 55%)" }}
                    />
                      {/* Category badge */}
                      {group && (
                        <div className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-white/8 border border-white/20 backdrop-blur-sm text-white">
                          <span className="text-base leading-none">{group.emoji}</span>
                          <span>{group.label}</span>
                        </div>
                      )}

                      {/* Header */}
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center font-display font-bold text-xl text-primary-foreground shrink-0 overflow-hidden ring-2 ring-white/40 shadow-lg">
                          {pro.avatar_url ?
                        <img src={pro.avatar_url} alt={name} className="w-full h-full object-cover" /> :
                        initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-display font-semibold text-sm truncate text-foreground">{name}</span>
                            {pro.verified && <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />}
                            {(pro.subscription_tier || "").toLowerCase() === "pro" && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-brand-gold/15 border border-brand-gold/30 text-brand-gold text-[10px] font-semibold shrink-0">
                                <Crown className="w-2.5 h-2.5" /> Pro
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="mr-1">{catData.emoji}</span>{pro.title || catData.label}
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{pro.city || "Greece"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Star className="w-3.5 h-3.5 text-brand-gold fill-brand-gold" />
                          <span className="font-semibold text-foreground">{rating > 0 ? rating : "—"}</span>
                          <span className="text-muted-foreground">({pro.reviews_count || 0})</span>
                        </div>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-muted-foreground">{pro.projects_count || 0} projects</span>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-muted-foreground">{pro.experience_years || 0} yrs</span>
                      </div>

                      {/* Hourly rate */}
                      {!!pro.hourly_rate &&
                    <div className="text-xs text-muted-foreground">
                          From <span className="font-semibold text-foreground">€{pro.hourly_rate}/hr</span>
                        </div>
                    }

                      {/* Specialties */}
                      {specialties.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                          {specialties.slice(0, 3).map((s: string) => (
                            <span
                              key={s}
                              className="px-2.5 py-0.5 rounded-full bg-white/6 border border-white/15 text-[11px] text-foreground"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Actions — message links to profile; only Pro professionals show Send Message there */}
                      <div className="flex gap-2 mt-auto">
                        <Button
                          size="sm"
                          className="flex-1 bg-gradient-primary border-0 text-primary-foreground text-xs gap-1.5 shadow-sm"
                          asChild
                        >
                          <Link to={`/professionals/${pro.id}`}>View Profile <ArrowRight className="w-3 h-3" /></Link>
                        </Button>
                        <Button size="sm" variant="outline" className="border-border px-3" asChild aria-label={`${professionalIsPro ? "Contact" : "View contact details for"} ${pro.display_name}`}>
                          <Link to={professionalIsPro ? `/professionals/${pro.id}?contact=1` : `/professionals/${pro.id}`}>
                            <MessageSquare className="w-3.5 h-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </div>);

              })}
              </div>
            </>
          }

          {/* ── AI Advantage Section ─────────────────────────────────── */}
          {/* ── Join CTA ─────────────────────────────────────────────── */}
          <div className="mt-10 glass-card rounded-2xl p-8 text-center border border-accent/20">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 mb-4">
              <span className="text-xs font-semibold text-accent">Free to join</span>
            </div>
            <h3 className="font-display text-xl font-bold mb-2">Are you a Professional?</h3>
            <p className="text-muted-foreground mb-5 text-sm max-w-sm mx-auto">Join 2,400+ verified professionals. Get qualified leads from buyers, sellers, and investors.</p>
            <Button className="bg-gradient-accent border-0 text-accent-foreground gap-2" asChild>
              <Link to="/signup?role=professional">
                Create Pro Profile — Free <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>);

}
