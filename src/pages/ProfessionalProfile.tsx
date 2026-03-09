import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  MapPin, Star, CheckCircle, Globe, ExternalLink,
  ChevronLeft, Clock, Users, Briefcase, MessageSquare,
  Calendar, Shield, Loader2, Languages, ChevronRight,
  Phone, Euro, FileText, ThumbsUp, Zap, Building2, Video,
  Sparkles, Brain, ArrowRight, Send, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useProfessionals, useProfessional } from "@/hooks/useProfessionals";
import { useNavigate } from "react-router-dom";
import SendMessageModal from "@/components/SendMessageModal";
import BookConsultationModal from "@/components/BookConsultationModal";
import RequestCallbackModal from "@/components/RequestCallbackModal";
import OnlineViewingModal from "@/components/OnlineViewingModal";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

const categoryLabels: Record<string, { label: string; emoji: string; description: string }> = {
  architect: { label: "Licensed Architect", emoji: "🏛️", description: "Building design, planning permits, renovation oversight" },
  civil_engineer: { label: "Civil Engineer", emoji: "⚙️", description: "Structural analysis, static reports, building compliance" },
  lawyer: { label: "Real Estate Lawyer", emoji: "⚖️", description: "Conveyancing, title checks, contract review, Golden Visa" },
  notary: { label: "Notary Public", emoji: "📜", description: "Property transfers, wills, authenticated contracts" },
  electrician: { label: "Certified Electrician", emoji: "⚡", description: "Electrical installations, solar, smart home wiring" },
  plumber: { label: "Plumber", emoji: "🔧", description: "Plumbing installation, maintenance, heating systems" },
  contractor: { label: "General Contractor", emoji: "🏗️", description: "Full renovation, new build, project management" },
  property_manager: { label: "Property Manager", emoji: "🏢", description: "Tenant management, maintenance coordination, rent collection" },
  valuer: { label: "Property Valuer", emoji: "📊", description: "Market appraisal, mortgage valuations, investment analysis" },
  interior_designer: { label: "Interior Designer", emoji: "🎨", description: "Space planning, styling, full renovation coordination" },
  financial_advisor: { label: "Financial Advisor", emoji: "💼", description: "Mortgage advice, investment strategy, tax planning" },
};

const servicesByCategory: Record<string, string[]> = {
  architect: ["Architectural Plans", "Building Permits", "Renovation Design", "Interior Design", "Site Supervision", "Energy Certificate"],
  civil_engineer: ["Static Reports", "Structural Analysis", "Seismic Assessment", "Building Compliance", "Construction Supervision"],
  lawyer: ["Title Search", "Contract Review", "Conveyancing", "Golden Visa Applications", "Auction Representation", "Dispute Resolution"],
  notary: ["Property Transfer Deeds", "Mortgage Deeds", "Company Incorporation", "Wills & Inheritance", "Authenticated Contracts"],
  electrician: ["Electrical Installation", "Panel Upgrades", "Smart Home", "Solar Panels", "EV Charging", "Energy Audit"],
  plumber: ["Pipe Installation", "Bathroom Remodel", "Boiler Install", "Drain Cleaning", "Water Heaters"],
  contractor: ["Full Renovation", "New Build", "Kitchen & Bath", "Structural Work", "Flooring", "Painting"],
  property_manager: ["Tenant Sourcing", "Rent Collection", "Maintenance", "Inspections", "Short-Term Rental", "ENFIA Filings"],
  valuer: ["Market Appraisal", "Mortgage Valuation", "Investment Analysis", "Portfolio Review", "Insurance Valuation"],
  interior_designer: ["Space Planning", "FF&E Specification", "3D Visualisation", "Site Coordination", "Staging for Sale"],
  financial_advisor: ["Mortgage Advice", "Investment Strategy", "Tax Planning", "Golden Visa Finance", "Portfolio Management"],
};

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star key={i} className={`w-4 h-4 ${i < Math.floor(rating) ? "fill-brand-gold text-brand-gold" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

const mockReviews = [
  { name: "Kostas P.", rating: 5, text: "Excellent professional. Handled the entire transaction seamlessly. Communication was top-notch throughout.", date: "2 weeks ago", avatar: "K", project: "Property Purchase, Athens" },
  { name: "Elena M.", rating: 5, text: "Very knowledgeable and highly responsive. Made a complex bureaucratic process feel effortless. Will definitely use again.", date: "1 month ago", avatar: "E", project: "Renovation Permit, Glyfada" },
  { name: "Nikos A.", rating: 4, text: "Great service, very professional. Delivered on time and within budget. Minor communication delays but overall excellent.", date: "2 months ago", avatar: "N", project: "Golden Visa Application" },
];

// ── Urgency badge colours ──────────────────────────────────────────────────────
const urgencyStyle: Record<string, string> = {
  high: "bg-destructive/15 text-destructive border-destructive/30",
  medium: "bg-brand-gold/15 text-brand-gold border-brand-gold/30",
  low: "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/30",
};

const categoryEmoji: Record<string, string> = {
  lawyer: "⚖️", notary: "📜", architect: "🏛️", civil_engineer: "⚙️",
  contractor: "🏗️", interior_designer: "🎨", electrician: "⚡",
  plumber: "🔧", financial_advisor: "💼", valuer: "📊", property_manager: "🏢",
};
const categoryLabel: Record<string, string> = {
  lawyer: "Real Estate Lawyer", notary: "Notary Public", architect: "Architect",
  civil_engineer: "Civil Engineer", contractor: "Contractor", interior_designer: "Interior Designer",
  electrician: "Electrician", plumber: "Plumber", financial_advisor: "Financial Advisor",
  valuer: "Property Valuer", property_manager: "Property Manager",
};

interface MatchResult {
  category: string;
  services: string[];
  explanation: string;
  urgency: "low" | "medium" | "high";
  follow_up_question?: string;
}

function AIServiceMatchModal({ onClose, onNavigate }: { onClose: () => void; onNavigate: (cat: string) => void }) {
  const [need, setNeed] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);

  const handleMatch = async () => {
    if (!need.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-service-match`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ need }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Matching failed");
      setResult(data as MatchResult);
    } catch (e: any) {
      toast.error(e.message || "AI matching failed");
    } finally {
      setLoading(false);
    }
  };

  const EXAMPLES = [
    "I want to buy an apartment in Athens — what do I need?",
    "My electrical panel is outdated and needs replacing",
    "I need a mortgage for a €400K property",
    "I want to convert my property to Airbnb",
    "I need to check if a property has clear title",
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4 bg-background/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-lg bg-card border border-border sm:rounded-2xl shadow-elevated overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border"
          style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--accent) / 0.06))" }}>
          <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center shrink-0">
            <Brain className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm">AI Service Matcher</p>
            <p className="text-[11px] text-muted-foreground">Describe your need — AI will find the right professional</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Input */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              Describe your need
            </label>
            <div className="flex gap-2">
              <textarea
                value={need}
                onChange={e => setNeed(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleMatch(); } }}
                placeholder="e.g. I want to buy a flat in Athens, I need someone to check the title is clean and handle the contracts..."
                rows={3}
                className="flex-1 bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Quick examples */}
          {!result && (
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map(ex => (
                <button key={ex} onClick={() => setNeed(ex)}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors text-left">
                  {ex}
                </button>
              ))}
            </div>
          )}

          {/* Match button */}
          <Button
            className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
            onClick={handleMatch}
            disabled={!need.trim() || loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? "Analysing your need…" : "Find my professional"}
          </Button>

          {/* Result */}
          {result && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              {/* Match header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="text-2xl">{categoryEmoji[result.category] ?? "👤"}</div>
                  <div>
                    <div className="font-display font-bold text-sm">{categoryLabel[result.category] ?? result.category}</div>
                    <div className="text-[11px] text-muted-foreground">Best match for your need</div>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-full border font-semibold uppercase tracking-wide ${urgencyStyle[result.urgency]}`}>
                  {result.urgency} urgency
                </span>
              </div>

              {/* Explanation */}
              <p className="text-sm text-muted-foreground leading-relaxed">{result.explanation}</p>

              {/* Services */}
              <div className="flex flex-wrap gap-1.5">
                {result.services.map(s => (
                  <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-card border border-border text-foreground font-medium">
                    {s}
                  </span>
                ))}
              </div>

              {/* Follow-up question */}
              {result.follow_up_question && (
                <div className="flex items-start gap-2 bg-secondary rounded-lg px-3 py-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground italic">{result.follow_up_question}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="flex-1 bg-gradient-primary border-0 text-primary-foreground gap-1.5"
                  onClick={() => { onNavigate(result.category); onClose(); }}>
                  Find {categoryLabel[result.category] ?? "Professionals"}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="border-border"
                  onClick={() => { setResult(null); setNeed(""); }}>
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfessionalProfile() {
  const { id } = useParams<{ id: string }>();
  const { data: pro, isLoading } = useProfessional(id || "");
  const { data: allProfessionals = [] } = useProfessionals();
  const [activeTab, setActiveTab] = useState<"overview" | "services" | "reviews">("overview");
  const [msgOpen, setMsgOpen] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [aiMatchOpen, setAiMatchOpen] = useState(false);
  const navigate = useNavigate();

  const catInfo = pro ? categoryLabels[pro.category] || { label: pro.category, emoji: "👤", description: "" } : null;
  const services = pro ? servicesByCategory[pro.category] || [] : [];

  const displayName = pro?.display_name || "Professional";

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (!pro) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Professional not found.</p>
        <Link to="/professionals" className="text-primary hover:underline text-sm">← Back to Directory</Link>
      </div>
    </div>
  );

  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
  const rating = Number(pro.rating) || 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {aiMatchOpen && (
        <AIServiceMatchModal
          onClose={() => setAiMatchOpen(false)}
          onNavigate={(cat) => navigate(`/professionals?category=${cat}`)}
        />
      )}
      <div className="pt-16">

        {/* ── Hero ── */}
        <div className="bg-card border-b border-border">
          <div className="container py-8">
            <Link to="/professionals" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-6 w-fit transition-colors">
              <ChevronLeft className="w-3 h-3" /> Back to Directory
            </Link>

            <div className="flex flex-col md:flex-row gap-6 items-start">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-28 h-28 rounded-2xl bg-gradient-primary flex items-center justify-center font-display font-bold text-4xl text-primary-foreground overflow-hidden shadow-lg ring-2 ring-primary/20">
                  {pro.avatar_url
                    ? <img src={pro.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                    : initials}
                </div>
                {pro.verified && (
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-md">
                    <CheckCircle className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h1 className="font-display text-2xl md:text-3xl font-bold">{displayName}</h1>
                      {pro.verified && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">✓ Verified</span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand-emerald/10 text-brand-emerald font-semibold border border-brand-emerald/20">Available</span>
                    </div>
                    <p className="flex items-center gap-2 text-muted-foreground text-sm">
                      <span className="text-lg">{catInfo?.emoji}</span>
                      <span className="font-medium text-foreground">{pro.title || catInfo?.label}</span>
                    </p>
                    {catInfo?.description && (
                      <p className="text-xs text-muted-foreground mt-1 max-w-md">{catInfo.description}</p>
                    )}
                    {pro.city && (
                      <div className="flex items-center gap-1 mt-2 text-muted-foreground text-sm">
                        <MapPin className="w-3.5 h-3.5 text-primary/60" />
                        <span>{pro.city}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <StarRating rating={rating} />
                        <span className="font-bold text-sm">{rating > 0 ? rating.toFixed(1) : "—"}</span>
                        <span className="text-xs text-muted-foreground">({pro.reviews_count || 0} reviews)</span>
                      </div>
                      <span className="text-muted-foreground text-xs">·</span>
                      <span className="text-sm text-muted-foreground">{pro.projects_count || 0} completed projects</span>
                      <span className="text-muted-foreground text-xs">·</span>
                      <span className="text-sm text-muted-foreground">{pro.experience_years || 0} yrs exp.</span>
                    </div>
                  </div>

                  {/* CTA buttons */}
                  <div className="flex flex-col gap-2 shrink-0 min-w-[160px]">
                    <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" onClick={() => setMsgOpen(true)}>
                      <MessageSquare className="w-4 h-4" /> Send Message
                    </Button>
                    <Button variant="outline" className="border-border gap-2" onClick={() => setConsultOpen(true)}>
                      <Calendar className="w-4 h-4" /> Book Consultation
                    </Button>
                    <Button variant="outline" className="border-border gap-2 text-muted-foreground" onClick={() => setVideoOpen(true)}>
                      <Video className="w-4 h-4" /> Video Meeting
                    </Button>
                    <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10 gap-2" onClick={() => setAiMatchOpen(true)}>
                      <Sparkles className="w-4 h-4" /> AI-Powered Request
                    </Button>
                    {pro.website_url && (
                      <a href={pro.website_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors py-1">
                        <Globe className="w-3.5 h-3.5" /> Visit Website <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Specialty chips */}
                {pro.specialties && pro.specialties.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-4">
                    {pro.specialties.map((s: string) => (
                      <span key={s} className="px-3 py-1 rounded-full bg-secondary border border-border text-xs text-muted-foreground">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Stats bar ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-8 pt-6 border-t border-border">
              {[
                { icon: Star, label: "Rating", value: rating > 0 ? `${rating.toFixed(1)} / 5.0` : "New", color: "text-brand-gold" },
                { icon: Briefcase, label: "Projects Done", value: pro.projects_count || 0, color: "text-primary" },
                { icon: Users, label: "Client Reviews", value: pro.reviews_count || 0, color: "text-accent" },
                { icon: Clock, label: "Experience", value: pro.experience_years ? `${pro.experience_years} yrs` : "—", color: "text-brand-emerald" },
                { icon: Euro, label: "From (per hr)", value: pro.hourly_rate ? `€${pro.hourly_rate}` : "On Request", color: "text-brand-gold" },
              ].map(stat => (
                <div key={stat.label} className="glass-card rounded-xl p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                  <div>
                    <div className={`font-display font-bold text-lg leading-none ${stat.color}`}>{stat.value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="container py-8">
          <div className="grid lg:grid-cols-3 gap-8">

            {/* Main column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Tabs */}
              <div className="flex gap-1 bg-secondary rounded-xl p-1 w-fit">
                {(["overview", "services", "reviews"] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-lg text-sm transition-all capitalize font-medium ${
                      activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}>
                    {tab}
                  </button>
                ))}
              </div>

              {/* ── Overview ── */}
              {activeTab === "overview" && (
                <div className="space-y-5">
                  {pro.bio && (
                    <div className="glass-card rounded-xl p-6">
                      <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" /> About
                      </h2>
                      <p className="text-sm text-muted-foreground leading-relaxed">{pro.bio}</p>
                    </div>
                  )}

                  {/* Professional details grid */}
                  <div className="glass-card rounded-xl p-6">
                    <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" /> Professional Details
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {pro.license_number && (
                        <div className="flex items-start gap-3 p-3 bg-secondary rounded-xl">
                          <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs text-muted-foreground">License Number</div>
                            <div className="text-sm font-mono font-medium mt-0.5">{pro.license_number}</div>
                          </div>
                        </div>
                      )}
                      {pro.hourly_rate && (
                        <div className="flex items-start gap-3 p-3 bg-secondary rounded-xl">
                          <Euro className="w-4 h-4 text-brand-gold mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs text-muted-foreground">Consultation Rate</div>
                            <div className="text-sm font-medium mt-0.5">€{pro.hourly_rate} / hour</div>
                          </div>
                        </div>
                      )}
                      {pro.experience_years && (
                        <div className="flex items-start gap-3 p-3 bg-secondary rounded-xl">
                          <Clock className="w-4 h-4 text-brand-emerald mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs text-muted-foreground">Years of Experience</div>
                            <div className="text-sm font-medium mt-0.5">{pro.experience_years} years in the field</div>
                          </div>
                        </div>
                      )}
                      {pro.languages && pro.languages.length > 0 && (
                        <div className="flex items-start gap-3 p-3 bg-secondary rounded-xl">
                          <Languages className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs text-muted-foreground">Languages</div>
                            <div className="text-sm font-medium mt-0.5">{pro.languages.join(", ")}</div>
                          </div>
                        </div>
                      )}
                      {pro.city && (
                        <div className="flex items-start gap-3 p-3 bg-secondary rounded-xl">
                          <MapPin className="w-4 h-4 text-primary/60 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs text-muted-foreground">Service Area</div>
                            <div className="text-sm font-medium mt-0.5">{pro.city} & surrounding</div>
                          </div>
                        </div>
                      )}
                      {pro.projects_count != null && (
                        <div className="flex items-start gap-3 p-3 bg-secondary rounded-xl">
                          <Briefcase className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs text-muted-foreground">Completed Projects</div>
                            <div className="text-sm font-medium mt-0.5">{pro.projects_count} projects</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Specialties */}
                  {pro.specialties && pro.specialties.length > 0 && (
                    <div className="glass-card rounded-xl p-6">
                      <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary" /> Areas of Expertise
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {pro.specialties.map((s: string) => (
                          <div key={s} className="flex items-center gap-2.5 p-2.5 bg-secondary rounded-lg">
                            <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                            <span className="text-sm">{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Services ── */}
              {activeTab === "services" && (
                <div className="space-y-5">
                  <div className="glass-card rounded-xl p-6">
                    <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-primary" /> Services Offered
                    </h2>
                    {services.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {services.map((service, i) => (
                          <div key={service} className="flex items-start gap-3 p-4 bg-secondary rounded-xl border border-border hover:border-primary/30 transition-colors">
                            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shrink-0">
                              <span className="text-primary-foreground text-xs font-bold">{i + 1}</span>
                            </div>
                            <div>
                              <div className="text-sm font-medium">{service}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {pro.hourly_rate ? `From €${pro.hourly_rate}/hr` : "Contact for pricing"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">Services list not yet configured.</p>
                    )}
                  </div>

                  {/* Availability */}
                  <div className="glass-card rounded-xl p-6">
                    <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-brand-emerald" /> Availability
                    </h2>
                    <div className="grid grid-cols-7 gap-2">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => (
                        <div key={day} className={`text-center py-2 px-1 rounded-lg text-xs ${i < 5 ? "bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20" : "bg-secondary text-muted-foreground border border-border"}`}>
                          <div className="font-semibold">{day}</div>
                          <div className="mt-0.5">{i < 5 ? "✓" : "—"}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">Typical availability Mon–Fri, 9am–6pm. Contact to confirm.</p>
                  </div>
                </div>
              )}

              {/* ── Reviews ── */}
              {activeTab === "reviews" && (
                <div className="space-y-4">
                  <div className="glass-card rounded-xl p-6">
                    <div className="flex items-start gap-6">
                      <div className="text-center shrink-0">
                        <div className="font-display text-5xl font-bold text-brand-gold">{rating > 0 ? rating.toFixed(1) : "—"}</div>
                        <StarRating rating={rating} />
                        <div className="text-xs text-muted-foreground mt-1">{pro.reviews_count || 0} reviews</div>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        {[5, 4, 3, 2, 1].map(star => (
                          <div key={star} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-3">{star}</span>
                            <Star className="w-3 h-3 text-brand-gold fill-brand-gold shrink-0" />
                            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-brand-gold rounded-full" style={{ width: star === 5 ? "70%" : star === 4 ? "20%" : "5%" }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-6 text-right">
                              {star === 5 ? "70%" : star === 4 ? "20%" : "5%"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
                      <ThumbsUp className="w-4 h-4 text-brand-emerald" />
                      <span className="text-sm text-muted-foreground">95% of clients would recommend {displayName.split(" ")[0]}</span>
                    </div>
                  </div>

                  {mockReviews.map((review, i) => (
                    <div key={i} className="glass-card rounded-xl p-5">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center font-bold text-primary-foreground shrink-0">
                          {review.avatar}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <span className="font-semibold text-sm">{review.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">· {review.project}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{review.date}</span>
                          </div>
                          <div className="flex gap-0.5 mt-1">
                            {Array.from({ length: 5 }).map((_, j) => (
                              <Star key={j} className={`w-3 h-3 ${j < review.rating ? "fill-brand-gold text-brand-gold" : "text-muted-foreground/30"}`} />
                            ))}
                          </div>
                          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{review.text}</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button variant="outline" className="w-full border-border gap-2">
                    <FileText className="w-4 h-4" /> Load More Reviews
                  </Button>
                </div>
              )}
            </div>

            {/* ── Sidebar ── */}
            <div className="space-y-4">
              {/* Contact card */}
              <div className="glass-card rounded-xl p-5 border border-primary/20 sticky top-24">
                <h3 className="font-display font-semibold mb-4">Contact {displayName.split(" ")[0]}</h3>
                <div className="space-y-2.5">
                  <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2" onClick={() => setMsgOpen(true)}>
                    <MessageSquare className="w-4 h-4" />
                    Send Message
                  </Button>
                  <Button variant="outline" className="w-full border-border gap-2" onClick={() => setConsultOpen(true)}>
                    <Calendar className="w-4 h-4" /> Book Consultation
                  </Button>
                  <Button variant="outline" className="w-full border-border gap-2 text-muted-foreground" onClick={() => setCallbackOpen(true)}>
                    <Phone className="w-4 h-4" /> Request Callback
                  </Button>
                  <Button variant="outline" className="w-full border-border gap-2 text-muted-foreground" onClick={() => setVideoOpen(true)}>
                    <Video className="w-4 h-4" /> Video Meeting
                  </Button>
                  {pro.hourly_rate && (
                    <div className="text-center text-xs text-muted-foreground pt-1">
                      Consultation from <span className="font-semibold text-foreground">€{pro.hourly_rate}/hr</span>
                    </div>
                  )}
                </div>

                {/* Response time */}
                <div className="mt-4 pt-4 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 text-brand-emerald shrink-0" />
                  Usually responds within 2 hours
                </div>
              </div>


              {/* Credentials */}
              <div className="glass-card rounded-xl p-5">
                <h3 className="font-display font-semibold mb-3 text-sm">Credentials</h3>
                <div className="space-y-2.5">
                  <div className={`flex items-center gap-2 text-sm ${pro.verified ? "text-brand-emerald" : "text-muted-foreground"}`}>
                    <CheckCircle className={`w-4 h-4 shrink-0 ${pro.verified ? "text-brand-emerald" : "text-muted-foreground"}`} />
                    {pro.verified ? "Identity Verified" : "Pending Verification"}
                  </div>
                  {pro.license_number && (
                    <div className="flex items-center gap-2 text-sm text-brand-emerald">
                      <Shield className="w-4 h-4 shrink-0" /> Licensed Professional
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Star className="w-4 h-4 shrink-0 text-brand-gold" />
                    {pro.reviews_count || 0} verified client reviews
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="w-4 h-4 shrink-0 text-primary/60" />
                    {pro.projects_count || 0} completed projects
                  </div>
                </div>
              </div>

              {/* Similar professionals */}
              <div className="glass-card rounded-xl p-5">
                <h3 className="font-display font-semibold mb-3 text-sm">Similar Professionals</h3>
                <div className="space-y-3">
                  {allProfessionals
                    .filter((p: any) => p.category === pro.category && p.id !== pro.id)
                    .slice(0, 3)
                    .map((peer: any) => {
                      const peerName = peer.display_name || "Professional";
                      return (
                        <Link key={peer.id} to={`/professionals/${peer.id}`} className="flex items-center gap-3 group">
                          <div className="w-9 h-9 rounded-lg bg-gradient-primary flex items-center justify-center font-bold text-sm text-primary-foreground shrink-0 overflow-hidden">
                            {peer.avatar_url ? <img src={peer.avatar_url} alt="" className="w-full h-full object-cover" /> : peerName[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium group-hover:text-primary transition-colors truncate">{peerName}</div>
                            <div className="text-xs text-muted-foreground">{peer.city || "Greece"}</div>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </Link>
                      );
                    })}
                  {allProfessionals.filter((p: any) => p.category === pro.category && p.id !== pro.id).length === 0 && (
                    <p className="text-xs text-muted-foreground">No others in this category yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />

      {/* ── Modals ── */}
      <SendMessageModal
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        professional={{ id: pro.id, user_id: pro.user_id, display_name: pro.display_name, title: pro.title }}
      />
      <BookConsultationModal
        open={consultOpen}
        onClose={() => setConsultOpen(false)}
        professional={{ id: pro.id, user_id: pro.user_id, display_name: pro.display_name, title: pro.title, category: pro.category, hourly_rate: pro.hourly_rate }}
      />
      <RequestCallbackModal
        open={callbackOpen}
        onClose={() => setCallbackOpen(false)}
        professional={{ id: pro.id, display_name: pro.display_name, title: pro.title }}
      />
      <OnlineViewingModal
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        professional={{ id: pro.id, display_name: pro.display_name, title: pro.title }}
      />
    </div>
  );
}
