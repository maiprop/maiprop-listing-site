import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  MapPin, Star, CheckCircle, Globe, ExternalLink,
  ChevronLeft, Clock, Award, Users, Briefcase, MessageSquare,
  Calendar, Shield, Loader2, Languages, ChevronRight,
  Phone, Mail, Euro, FileText, ThumbsUp, Zap, Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useProfessionals } from "@/hooks/useProfessionals";
import { useAuth } from "@/contexts/AuthContext";
import { useStartConversation } from "@/hooks/useMessages";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

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

export default function ProfessionalProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: professionals = [], isLoading } = useProfessionals();
  const startConversation = useStartConversation();
  const [activeTab, setActiveTab] = useState<"overview" | "services" | "reviews">("overview");

  const pro = professionals.find((p: any) => p.id === id);
  const catInfo = pro ? categoryLabels[pro.category] || { label: pro.category, emoji: "👤", description: "" } : null;
  const services = pro ? servicesByCategory[pro.category] || [] : [];

  const displayName = pro
    ? (pro.profiles as any)?.display_name ||
      `${(pro.profiles as any)?.first_name || ""} ${(pro.profiles as any)?.last_name || ""}`.trim() ||
      "Professional"
    : "";

  const handleContact = async () => {
    if (!user) { toast.error("Please sign in to contact professionals"); navigate("/login"); return; }
    if (!pro) return;
    try {
      await startConversation.mutateAsync({ other_user_id: pro.user_id });
      navigate("/messages");
    } catch { toast.error("Could not start conversation"); }
  };

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
                    <Button className="bg-gradient-primary border-0 text-primary-foreground gap-2" onClick={handleContact} disabled={startConversation.isPending}>
                      {startConversation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                      Send Message
                    </Button>
                    <Button variant="outline" className="border-border gap-2">
                      <Calendar className="w-4 h-4" /> Book Consultation
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
                  <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2" onClick={handleContact} disabled={startConversation.isPending}>
                    {startConversation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    Send Message
                  </Button>
                  <Button variant="outline" className="w-full border-border gap-2">
                    <Calendar className="w-4 h-4" /> Book Consultation
                  </Button>
                  <Button variant="outline" className="w-full border-border gap-2 text-muted-foreground">
                    <Phone className="w-4 h-4" /> Request Callback
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
                  {professionals
                    .filter((p: any) => p.category === pro.category && p.id !== pro.id)
                    .slice(0, 3)
                    .map((peer: any) => {
                      const peerName = (peer.profiles as any)?.display_name || "Professional";
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
                  {professionals.filter((p: any) => p.category === pro.category && p.id !== pro.id).length === 0 && (
                    <p className="text-xs text-muted-foreground">No others in this category yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
