import { useState } from "react";
import { Search, Star, MapPin, Phone, Mail, ExternalLink, Filter, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const categories = [
  { label: "All Professionals", value: "" },
  { label: "Architects", value: "architect", emoji: "🏛️" },
  { label: "Civil Engineers", value: "engineer", emoji: "⚙️" },
  { label: "Lawyers", value: "lawyer", emoji: "⚖️" },
  { label: "Notaries", value: "notary", emoji: "📜" },
  { label: "Electricians", value: "electrician", emoji: "⚡" },
  { label: "Plumbers", value: "plumber", emoji: "🔧" },
  { label: "Contractors", value: "contractor", emoji: "🏗️" },
  { label: "Property Managers", value: "manager", emoji: "🏢" },
  { label: "Valuers", value: "valuer", emoji: "📊" },
];

const professionals = [
  { id: "1", name: "Stavros Papadimitriou", category: "architect", emoji: "🏛️", title: "Licensed Architect", location: "Athens, Kolonaki", rating: 4.9, reviews: 84, projects: 120, experience: "18 years", verified: true, specialties: ["Residential", "Renovation", "Interior"], avatar: "S" },
  { id: "2", name: "Eleni Karamanlis", category: "lawyer", emoji: "⚖️", title: "Real Estate Lawyer", location: "Athens, Syntagma", rating: 4.8, reviews: 156, projects: 400, experience: "12 years", verified: true, specialties: ["Conveyancing", "Auctions", "Golden Visa"], avatar: "E" },
  { id: "3", name: "Dimitris Kouros", category: "engineer", emoji: "⚙️", title: "Civil Engineer", location: "Thessaloniki", rating: 4.7, reviews: 62, projects: 89, experience: "10 years", verified: true, specialties: ["Static Analysis", "Renovation", "New Build"], avatar: "D" },
  { id: "4", name: "Maria Antoniadou", category: "notary", emoji: "📜", title: "Notary Public", location: "Athens, Omonoia", rating: 4.9, reviews: 210, projects: 600, experience: "20 years", verified: true, specialties: ["Property Transfer", "Wills", "Contracts"], avatar: "M" },
  { id: "5", name: "Nikos Alexopoulos", category: "electrician", emoji: "⚡", title: "Certified Electrician", location: "Glyfada", rating: 4.6, reviews: 48, projects: 300, experience: "15 years", verified: true, specialties: ["Smart Home", "Solar", "Commercial"], avatar: "N" },
  { id: "6", name: "Petros Georgiou", category: "contractor", emoji: "🏗️", title: "General Contractor", location: "Piraeus", rating: 4.7, reviews: 91, projects: 145, experience: "22 years", verified: false, specialties: ["Full Renovation", "New Build", "Commercial"], avatar: "P" },
];

export default function Professionals() {
  const [selectedCat, setSelectedCat] = useState("");
  const [search, setSearch] = useState("");

  const filtered = professionals.filter(p =>
    (!selectedCat || p.category === selectedCat) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.title.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
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
                placeholder="Search professionals..."
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(pro => (
              <div key={pro.id} className="glass-card rounded-xl p-5 property-card">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-primary flex items-center justify-center font-display font-bold text-xl text-primary-foreground shrink-0">
                    {pro.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display font-semibold text-sm truncate">{pro.name}</span>
                      {pro.verified && <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{pro.title}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{pro.location}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-brand-gold fill-brand-gold" />
                    <span className="text-sm font-semibold">{pro.rating}</span>
                    <span className="text-xs text-muted-foreground">({pro.reviews})</span>
                  </div>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{pro.projects} projects</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{pro.experience}</span>
                </div>

                <div className="flex gap-1.5 flex-wrap mt-3">
                  {pro.specialties.map(s => (
                    <span key={s} className="px-2 py-0.5 rounded-full bg-secondary border border-border text-xs text-muted-foreground">{s}</span>
                  ))}
                </div>

                <div className="flex gap-2 mt-4">
                  <Button size="sm" className="flex-1 bg-gradient-primary border-0 text-primary-foreground text-xs">
                    View Profile
                  </Button>
                  <Button size="sm" variant="outline" className="border-border px-3">
                    <Mail className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="border-border px-3">
                    <Phone className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Join CTA */}
          <div className="mt-12 glass-card rounded-2xl p-8 text-center border border-accent/20">
            <h3 className="font-display text-xl font-bold mb-2">Are you a Professional?</h3>
            <p className="text-muted-foreground mb-4 text-sm">Join 12,000+ verified professionals on maiProp. Get leads from property buyers, sellers, and investors.</p>
            <Button className="bg-gradient-accent border-0 text-accent-foreground">
              Create Pro Profile — Free
            </Button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
