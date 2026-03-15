import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Star, MapPin, CheckCircle, Loader2, MessageSquare, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { AIServiceMatchModal } from "@/components/AIServiceMatchModal";
import { useProfessionals } from "@/hooks/useProfessionals";
import { Link } from "react-router-dom";

// ─── Category Groups ──────────────────────────────────────────────────────────
const categoryGroups = [
  { id: "agents", label: "Real Estate Agents", emoji: "🏠", color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20", categories: ["real_estate_agent"], description: "Buy, sell, rent — licensed agents & agencies" },
  { id: "legal", label: "Legal & Title", emoji: "⚖️", color: "text-brand-gold", bg: "bg-brand-gold/10", border: "border-brand-gold/20", categories: ["lawyer", "notary"], description: "Property title, contracts, conveyancing" },
  { id: "finance", label: "Finance & Insurance", emoji: "💼", color: "text-brand-emerald", bg: "bg-brand-emerald/10", border: "border-brand-emerald/20", categories: ["financial_advisor", "valuer", "insurance_broker"], description: "Mortgages, valuations, property insurance" },
  { id: "design", label: "Design & Planning", emoji: "🏛️", color: "text-primary", bg: "bg-primary/10", border: "border-primary/20", categories: ["architect", "civil_engineer", "interior_designer", "urban_planning_consultant", "building_permit_consultant"], description: "Architecture, engineering, urban planning" },
];

const ALL_CATEGORIES = categoryGroups.flatMap((g) => g.categories);

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


export default function Professionals() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFromUrl = searchParams.get("category");
  const searchFromUrl = searchParams.get("search") || "";

  const [selectedGroup, setSelectedGroup] = useState<string | null>(() => {
    if (!categoryFromUrl) return null;
    const g = categoryGroups.find((gr) => gr.categories.includes(categoryFromUrl));
    return g?.id ?? null;
  });
  const [search, setSearch] = useState(searchFromUrl);
  const [aiMatchOpen, setAiMatchOpen] = useState(false);

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

  const filtered = professionals.filter((p: any) => {
    // Category from URL (e.g. from homepage search) — exact match
    if (categoryFromUrl) {
      if (p.category !== categoryFromUrl) return false;
    } else if (selectedGroup) {
      const group = categoryGroups.find((g) => g.id === selectedGroup);
      if (group && !group.categories.includes(p.category)) return false;
    }
    // Text search
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
    <div className="min-h-screen bg-background">
      <Navbar />
      {aiMatchOpen && <AIServiceMatchModal onClose={() => setAiMatchOpen(false)} onNavigate={(cat) => { setSearchParams((p) => { const n = new URLSearchParams(p); n.set("category", cat); return n; }); setSelectedGroup(categoryGroups.find((g) => g.categories.includes(cat))?.id ?? null); }} />}
      <div className="pt-16">

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
                <h1 className="font-display text-3xl sm:text-5xl font-bold mb-3 leading-tight">
                  Every expert you need for<br />
                  <span className="gradient-text-cyan">property in Greece</span>
                </h1>
                <p className="text-muted-foreground max-w-lg text-base sm:text-lg leading-relaxed mb-4 sm:mb-5">
                  From legal due-diligence to renovation — find professionals by criteria, availability and area coverage.
                </p>
                <Button
                  onClick={() => setAiMatchOpen(true)}
                  variant="outline"
                  className="border-primary/40 text-primary hover:bg-primary/10 gap-2"
                >
                  <Search className="w-4 h-4" />
                  Find my professional
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
              











              
            </div>
          </div>
        </div>

        {/* ── Category Groups ─────────────────────────────────────────── */}
        <div className="bg-card/40 border-b border-border">
          <div className="container py-4 sm:py-6">
            {/* Horizontally scrollable on mobile */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
              <button
                onClick={() => { setSelectedGroup(null); setSearchParams((p) => { const n = new URLSearchParams(p); n.delete("category"); return n; }); }}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium border transition-all shrink-0 ${
                !selectedGroup ?
                "bg-secondary border-primary/40 text-foreground" :
                "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"}`
                }>
                All Professionals
              </button>
              <button
                onClick={() => {
                  if (selectedGroup === "agents") { setSelectedGroup(null); setSearchParams((p) => { const n = new URLSearchParams(p); n.delete("category"); return n; }); }
                  else { setSelectedGroup("agents"); setSearchParams((p) => { const n = new URLSearchParams(p); n.set("category", "real_estate_agent"); return n; }); }
                }}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-semibold border transition-all shrink-0 ${
                selectedGroup === "agents" ?
                "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" :
                "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"}`}
              >
                <span>🏠</span>
                <span>Real Estate Agents</span>
              </button>
              {categoryGroups.filter(g => g.id !== "agents").map((group) =>
              <button
                key={group.id}
                onClick={() => {
                  if (selectedGroup === group.id) { setSelectedGroup(null); setSearchParams((p) => { const n = new URLSearchParams(p); n.delete("category"); return n; }); }
                  else {
                    setSelectedGroup(group.id);
                    const cat = group.categories[0];
                    setSearchParams((p) => { const n = new URLSearchParams(p); if (cat) n.set("category", cat); else n.delete("category"); return n; });
                  }
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
          </div>
        </div>

        <div className="container py-6 sm:py-8 pb-24 lg:pb-8">

          {/* ── Search ───────────────────────────────────────────────── */}
          <div className="flex gap-3 mb-6 flex-wrap items-center">
            <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-secondary border border-border rounded-xl px-4 py-2.5 focus-within:border-primary transition-colors">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="text"
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
          filtered.length === 0 ?
          <div className="text-center py-20 text-muted-foreground">
              <p className="text-lg font-medium mb-1">No professionals found</p>
              <p className="text-sm">Try adjusting your search or category filter</p>
            </div> :

          <>
              <p className="text-sm text-muted-foreground mb-4">{filtered.length} professional{filtered.length !== 1 ? "s" : ""} found{activeGroup ? ` in ${activeGroup.label}` : ""}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {filtered.map((pro: any) => {
                const name = pro.display_name || "Professional";
                const catData = categoryInfo[pro.category] || { emoji: "👤", label: pro.category, group: "" };
                const group = categoryGroups.find((g) => g.id === catData.group);
                const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                const rating = Number(pro.rating) || 0;
                const specialties = pro.specialties || [];

                return (
                  <div key={pro.id} className="glass-card rounded-xl p-5 flex flex-col gap-4 hover:border-primary/20 transition-all group">
                      {/* Category badge */}
                      {group &&
                    <div className={`self-start flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${group.bg} ${group.border} border ${group.color}`}>
                          {group.emoji} {group.label}
                        </div>
                    }

                      {/* Header */}
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-xl bg-gradient-primary flex items-center justify-center font-display font-bold text-xl text-primary-foreground shrink-0 overflow-hidden">
                          {pro.avatar_url ?
                        <img src={pro.avatar_url} alt={name} className="w-full h-full object-cover" /> :
                        initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-display font-semibold text-sm truncate">{name}</span>
                            {pro.verified && <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="mr-1">{catData.emoji}</span>{pro.title || catData.label}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{pro.city || "Greece"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-brand-gold fill-brand-gold" />
                          <span className="text-sm font-semibold">{rating > 0 ? rating : "—"}</span>
                          <span className="text-xs text-muted-foreground">({pro.reviews_count || 0})</span>
                        </div>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-xs text-muted-foreground">{pro.projects_count || 0} projects</span>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-xs text-muted-foreground">{pro.experience_years || 0} yrs</span>
                      </div>

                      {/* Hourly rate */}
                      {pro.hourly_rate &&
                    <div className="text-xs text-muted-foreground">
                          From <span className="font-semibold text-foreground">€{pro.hourly_rate}/hr</span>
                        </div>
                    }

                      {/* Specialties */}
                      {specialties.length > 0 &&
                    <div className="flex gap-1.5 flex-wrap">
                          {specialties.slice(0, 3).map((s: string) =>
                      <span key={s} className="px-2 py-0.5 rounded-full bg-secondary border border-border text-xs text-muted-foreground">{s}</span>
                      )}
                        </div>
                    }

                      {/* Actions — message links to profile; only Pro professionals show Send Message there */}
                      <div className="flex gap-2 mt-auto">
                        <Button size="sm" className="flex-1 bg-gradient-primary border-0 text-primary-foreground text-xs gap-1.5" asChild>
                          <Link to={`/professionals/${pro.id}`}>View Profile <ArrowRight className="w-3 h-3" /></Link>
                        </Button>
                        <Button size="sm" variant="outline" className="border-border px-3" asChild title="Message">
                          <Link to={`/professionals/${pro.id}`}><MessageSquare className="w-3.5 h-3.5" /></Link>
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
      </div>
      <Footer />
    </div>);

}