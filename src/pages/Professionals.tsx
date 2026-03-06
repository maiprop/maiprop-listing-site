import { useState } from "react";
import { Search, Star, MapPin, Mail, CheckCircle, Filter, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useProfessionals } from "@/hooks/useProfessionals";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

const categories = [
  { label: "All", value: "" },
  { label: "Architects", value: "architect", emoji: "🏛️" },
  { label: "Civil Engineers", value: "civil_engineer", emoji: "⚙️" },
  { label: "Lawyers", value: "lawyer", emoji: "⚖️" },
  { label: "Notaries", value: "notary", emoji: "📜" },
  { label: "Electricians", value: "electrician", emoji: "⚡" },
  { label: "Plumbers", value: "plumber", emoji: "🔧" },
  { label: "Contractors", value: "contractor", emoji: "🏗️" },
  { label: "Property Managers", value: "property_manager", emoji: "🏢" },
  { label: "Valuers", value: "valuer", emoji: "📊" },
  { label: "Interior Designers", value: "interior_designer", emoji: "🎨" },
  { label: "Financial Advisors", value: "financial_advisor", emoji: "💼" },
];

const categoryInfo: Record<string, { emoji: string; label: string }> = {
  architect: { emoji: "🏛️", label: "Architect" },
  civil_engineer: { emoji: "⚙️", label: "Civil Engineer" },
  lawyer: { emoji: "⚖️", label: "Lawyer" },
  notary: { emoji: "📜", label: "Notary" },
  electrician: { emoji: "⚡", label: "Electrician" },
  plumber: { emoji: "🔧", label: "Plumber" },
  contractor: { emoji: "🏗️", label: "Contractor" },
  property_manager: { emoji: "🏢", label: "Property Manager" },
  valuer: { emoji: "📊", label: "Valuer" },
  interior_designer: { emoji: "🎨", label: "Interior Designer" },
  financial_advisor: { emoji: "💼", label: "Financial Advisor" },
};

// Static fallback professionals to show when DB is empty
const staticPros = [
  { id: "s1", name: "Stavros Papadimitriou", category: "architect", title: "Licensed Architect", city: "Athens, Kolonaki", rating: 4.9, reviews_count: 84, projects_count: 120, experience_years: 18, verified: true, specialties: ["Residential", "Renovation", "Interior"], avatar: "S" },
  { id: "s2", name: "Eleni Karamanlis", category: "lawyer", title: "Real Estate Lawyer", city: "Athens, Syntagma", rating: 4.8, reviews_count: 156, projects_count: 400, experience_years: 12, verified: true, specialties: ["Conveyancing", "Auctions", "Golden Visa"], avatar: "E" },
  { id: "s3", name: "Dimitris Kouros", category: "civil_engineer", title: "Civil Engineer", city: "Thessaloniki", rating: 4.7, reviews_count: 62, projects_count: 89, experience_years: 10, verified: true, specialties: ["Static Analysis", "Renovation", "New Build"], avatar: "D" },
  { id: "s4", name: "Maria Antoniadou", category: "notary", title: "Notary Public", city: "Athens, Omonoia", rating: 4.9, reviews_count: 210, projects_count: 600, experience_years: 20, verified: true, specialties: ["Property Transfer", "Wills", "Contracts"], avatar: "M" },
  { id: "s5", name: "Nikos Alexopoulos", category: "electrician", title: "Certified Electrician", city: "Glyfada", rating: 4.6, reviews_count: 48, projects_count: 300, experience_years: 15, verified: true, specialties: ["Smart Home", "Solar", "Commercial"], avatar: "N" },
  { id: "s6", name: "Petros Georgiou", category: "contractor", title: "General Contractor", city: "Piraeus", rating: 4.7, reviews_count: 91, projects_count: 145, experience_years: 22, verified: false, specialties: ["Full Renovation", "New Build", "Commercial"], avatar: "P" },
];

export default function Professionals() {
  const [selectedCat, setSelectedCat] = useState("");
  const [search, setSearch] = useState("");

  const { data: dbPros = [], isLoading } = useProfessionals(selectedCat || undefined);

  // Merge DB and static data
  const allPros = dbPros.length > 0 ? dbPros : staticPros;

  const filtered = allPros.filter((p: any) => {
    const name = (p.profiles as any)?.display_name || p.name || "";
    const title = p.title || "";
    return !search || name.toLowerCase().includes(search.toLowerCase()) || title.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* Header */}
        <div className="bg-card border-b border-border py-12">
          <div className="container">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-accent uppercase tracking-widest">Pro Network</span>
            </div>
            <h1 className="font-display text-4xl font-bold mb-2">Professional Directory</h1>
            <p className="text-muted-foreground max-w-xl">Find vetted architects, lawyers, engineers, and tradespeople for your property project. Standardized profiles, verified credentials.</p>
          </div>
        </div>

        <div className="container py-8">
          {/* Search */}
          <div className="flex gap-3 mb-6 flex-wrap">
            <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-secondary border border-border rounded-xl px-4 py-2.5 focus-within:border-primary transition-colors">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name or specialty..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
          </div>

          {/* Categories */}
          <div className="flex gap-2 flex-wrap mb-8">
            {categories.map(cat => (
              <button
                key={cat.value}
                onClick={() => setSelectedCat(cat.value)}
                className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                  selectedCat === cat.value
                    ? "bg-accent/20 border border-accent/40 text-accent"
                    : "bg-secondary border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat.emoji && <span className="mr-1.5">{cat.emoji}</span>}
                {cat.label}
              </button>
            ))}
          </div>

          {/* Cards */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((pro: any) => {
                const isDb = !!pro.profiles;
                const name = isDb ? ((pro.profiles as any)?.display_name || "Professional") : pro.name;
                const catData = categoryInfo[pro.category] || { emoji: "👤", label: pro.category };
                const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                const city = pro.city || "Greece";
                const rating = Number(pro.rating) || 0;
                const specialties = pro.specialties || [];

                return (
                  <div key={pro.id} className="glass-card rounded-xl p-5 property-card flex flex-col gap-4">
                    {/* Header */}
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-xl bg-gradient-primary flex items-center justify-center font-display font-bold text-xl text-primary-foreground shrink-0 overflow-hidden">
                        {pro.avatar_url
                          ? <img src={pro.avatar_url} alt={name} className="w-full h-full object-cover" />
                          : (initials || (pro.avatar as string))}
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
                          <span className="text-xs text-muted-foreground">{city}</span>
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

                    {/* Specialties */}
                    {specialties.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap">
                        {specialties.slice(0, 3).map((s: string) => (
                          <span key={s} className="px-2 py-0.5 rounded-full bg-secondary border border-border text-xs text-muted-foreground">{s}</span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 mt-auto">
                      {isDb ? (
                        <Button size="sm" className="flex-1 bg-gradient-primary border-0 text-primary-foreground text-xs" asChild>
                          <Link to={`/professionals/${pro.id}`}>View Profile</Link>
                        </Button>
                      ) : (
                        <Button size="sm" className="flex-1 bg-gradient-primary border-0 text-primary-foreground text-xs" disabled>
                          View Profile
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="border-border px-3">
                        <Mail className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Join CTA */}
          <div className="mt-12 glass-card rounded-2xl p-8 text-center border border-accent/20">
            <h3 className="font-display text-xl font-bold mb-2">Are you a Professional?</h3>
            <p className="text-muted-foreground mb-4 text-sm">Join 12,000+ verified professionals on maiProp. Get leads from property buyers, sellers, and investors.</p>
            <Button className="bg-gradient-accent border-0 text-accent-foreground" asChild>
              <Link to="/signup?role=professional">Create Pro Profile — Free</Link>
            </Button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
