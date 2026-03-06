import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  MapPin, Star, CheckCircle, Phone, Mail, Globe, ExternalLink,
  ChevronLeft, Clock, Award, Users, Briefcase, MessageSquare,
  Calendar, Shield, Loader2, Languages, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useProfessionals } from "@/hooks/useProfessionals";
import { useAuth } from "@/contexts/AuthContext";
import { useStartConversation } from "@/hooks/useMessages";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const categoryLabels: Record<string, { label: string; emoji: string }> = {
  architect: { label: "Licensed Architect", emoji: "🏛️" },
  civil_engineer: { label: "Civil Engineer", emoji: "⚙️" },
  lawyer: { label: "Real Estate Lawyer", emoji: "⚖️" },
  notary: { label: "Notary Public", emoji: "📜" },
  electrician: { label: "Certified Electrician", emoji: "⚡" },
  plumber: { label: "Plumber", emoji: "🔧" },
  contractor: { label: "General Contractor", emoji: "🏗️" },
  property_manager: { label: "Property Manager", emoji: "🏢" },
  valuer: { label: "Property Valuer", emoji: "📊" },
  interior_designer: { label: "Interior Designer", emoji: "🎨" },
  financial_advisor: { label: "Financial Advisor", emoji: "💼" },
};

const mockReviews = [
  { name: "Kostas P.", rating: 5, text: "Excellent professional. Handled the entire transaction smoothly. Highly recommend!", date: "2 weeks ago", avatar: "K" },
  { name: "Elena M.", rating: 5, text: "Very knowledgeable and responsive. Made a complex process simple.", date: "1 month ago", avatar: "E" },
  { name: "Nikos A.", rating: 4, text: "Great service, very professional. Would use again.", date: "2 months ago", avatar: "N" },
];

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < Math.floor(rating) ? "fill-brand-gold text-brand-gold" : "text-muted-foreground"}`}
        />
      ))}
    </div>
  );
}

export default function ProfessionalProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: professionals = [], isLoading } = useProfessionals();
  const startConversation = useStartConversation();
  const [activeTab, setActiveTab] = useState<"overview" | "portfolio" | "reviews">("overview");
  const [contactOpen, setContactOpen] = useState(false);

  const pro = professionals.find((p: any) => p.id === id);
  const catInfo = pro ? categoryLabels[pro.category] || { label: pro.category, emoji: "👤" } : null;

  const displayName = pro
    ? (pro.profiles as any)?.display_name ||
      `${(pro.profiles as any)?.first_name || ""} ${(pro.profiles as any)?.last_name || ""}`.trim() ||
      "Professional"
    : "";

  const handleContact = async () => {
    if (!user) {
      toast.error("Please sign in to contact professionals");
      navigate("/login");
      return;
    }
    if (!pro) return;
    try {
      const convId = await startConversation.mutateAsync({ other_user_id: pro.user_id });
      navigate(`/messages`);
    } catch {
      toast.error("Could not start conversation");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pro) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">Professional not found.</p>
          <Link to="/professionals" className="text-primary hover:underline text-sm">← Back to Directory</Link>
        </div>
      </div>
    );
  }

  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* Hero / header */}
        <div className="bg-card border-b border-border">
          <div className="container py-8">
            <Link to="/professionals" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-6 w-fit">
              <ChevronLeft className="w-3 h-3" /> Back to Directory
            </Link>

            <div className="flex flex-col md:flex-row gap-6 items-start">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-28 h-28 rounded-2xl bg-gradient-primary flex items-center justify-center font-display font-bold text-4xl text-primary-foreground overflow-hidden shadow-lg">
                  {pro.avatar_url ? (
                    <img src={pro.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                  ) : initials}
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
                    <div className="flex items-center gap-2 mb-1">
                      <h1 className="font-display text-2xl md:text-3xl font-bold">{displayName}</h1>
                      {pro.verified && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">Verified</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <span className="text-lg">{catInfo?.emoji}</span>
                      <span>{pro.title || catInfo?.label}</span>
                    </div>
                    {pro.city && (
                      <div className="flex items-center gap-1 mt-1.5 text-muted-foreground text-sm">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{pro.city}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <StarRating rating={Number(pro.rating) || 0} />
                        <span className="font-semibold text-sm">{pro.rating || "—"}</span>
                        <span className="text-xs text-muted-foreground">({pro.reviews_count || 0} reviews)</span>
                      </div>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-sm text-muted-foreground">{pro.projects_count || 0} projects</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-sm text-muted-foreground">{pro.experience_years || 0} yrs experience</span>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      className="bg-gradient-primary border-0 text-primary-foreground gap-2"
                      onClick={handleContact}
                      disabled={startConversation.isPending}
                    >
                      {startConversation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                      Send Message
                    </Button>
                    <Button variant="outline" className="border-border gap-2" onClick={() => setContactOpen(!contactOpen)}>
                      <Calendar className="w-4 h-4" />
                      Request Consultation
                    </Button>
                    {pro.website_url && (
                      <Button variant="ghost" size="sm" className="gap-2 text-xs" asChild>
                        <a href={pro.website_url} target="_blank" rel="noopener noreferrer">
                          <Globe className="w-3.5 h-3.5" /> Visit Website <ExternalLink className="w-3 h-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Specialties */}
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

            {/* Stats bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-border">
              {[
                { icon: Star, label: "Rating", value: pro.rating ? `${pro.rating}/5.0` : "N/A", color: "text-brand-gold" },
                { icon: Briefcase, label: "Projects", value: pro.projects_count || 0, color: "text-primary" },
                { icon: Users, label: "Reviews", value: pro.reviews_count || 0, color: "text-accent" },
                { icon: Clock, label: "Experience", value: pro.experience_years ? `${pro.experience_years} yrs` : "N/A", color: "text-brand-emerald" },
              ].map(stat => (
                <div key={stat.label} className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div>
                    <div className={`font-display font-bold text-xl ${stat.color}`}>{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="container py-8">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main */}
            <div className="lg:col-span-2 space-y-6">
              {/* Tabs */}
              <div className="flex gap-1 bg-secondary rounded-xl p-1 w-fit">
                {(["overview", "portfolio", "reviews"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-lg text-sm transition-all capitalize font-medium ${
                      activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Overview tab */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {pro.bio && (
                    <div className="glass-card rounded-xl p-6">
                      <h2 className="font-display font-semibold mb-3">About</h2>
                      <p className="text-sm text-muted-foreground leading-relaxed">{pro.bio}</p>
                    </div>
                  )}

                  {/* Professional details */}
                  <div className="glass-card rounded-xl p-6">
                    <h2 className="font-display font-semibold mb-4">Professional Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pro.license_number && (
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                            <Shield className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">License Number</div>
                            <div className="text-sm font-medium mt-0.5">{pro.license_number}</div>
                          </div>
                        </div>
                      )}
                      {pro.hourly_rate && (
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                            <Award className="w-4 h-4 text-brand-gold" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Consultation Rate</div>
                            <div className="text-sm font-medium mt-0.5">€{pro.hourly_rate}/hr</div>
                          </div>
                        </div>
                      )}
                      {pro.experience_years && (
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                            <Clock className="w-4 h-4 text-brand-emerald" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Years of Experience</div>
                            <div className="text-sm font-medium mt-0.5">{pro.experience_years} years</div>
                          </div>
                        </div>
                      )}
                      {pro.languages && pro.languages.length > 0 && (
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                            <Languages className="w-4 h-4 text-accent" />
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Languages</div>
                            <div className="text-sm font-medium mt-0.5">{pro.languages.join(", ")}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Specialties expanded */}
                  {pro.specialties && pro.specialties.length > 0 && (
                    <div className="glass-card rounded-xl p-6">
                      <h2 className="font-display font-semibold mb-4">Areas of Expertise</h2>
                      <div className="grid grid-cols-2 gap-3">
                        {pro.specialties.map((s: string) => (
                          <div key={s} className="flex items-center gap-2 text-sm">
                            <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                            <span>{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Portfolio tab */}
              {activeTab === "portfolio" && (
                <div className="glass-card rounded-xl p-8 text-center">
                  <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <h3 className="font-semibold">Portfolio coming soon</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {displayName} has {pro.projects_count || 0} completed projects. Portfolio details will be available soon.
                  </p>
                </div>
              )}

              {/* Reviews tab */}
              {activeTab === "reviews" && (
                <div className="space-y-4">
                  <div className="glass-card rounded-xl p-6">
                    <div className="flex items-center gap-6 mb-6">
                      <div className="text-center">
                        <div className="font-display text-5xl font-bold text-brand-gold">{pro.rating || "—"}</div>
                        <StarRating rating={Number(pro.rating) || 0} />
                        <div className="text-xs text-muted-foreground mt-1">{pro.reviews_count || 0} reviews</div>
                      </div>
                      <div className="flex-1">
                        {[5, 4, 3, 2, 1].map(star => (
                          <div key={star} className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-muted-foreground w-3">{star}</span>
                            <Star className="w-3 h-3 text-brand-gold fill-brand-gold" />
                            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand-gold rounded-full"
                                style={{ width: star === 5 ? "70%" : star === 4 ? "20%" : "5%" }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {mockReviews.map((review, i) => (
                    <div key={i} className="glass-card rounded-xl p-5">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-primary flex items-center justify-center font-bold text-primary-foreground text-sm shrink-0">
                          {review.avatar}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm">{review.name}</span>
                            <span className="text-xs text-muted-foreground">{review.date}</span>
                          </div>
                          <StarRating rating={review.rating} />
                          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{review.text}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Contact card */}
              <div className="glass-card rounded-xl p-5 border border-primary/20">
                <h3 className="font-display font-semibold mb-4">Contact {displayName.split(" ")[0]}</h3>
                <div className="space-y-3">
                  <Button
                    className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
                    onClick={handleContact}
                    disabled={startConversation.isPending}
                  >
                    {startConversation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    Send Message
                  </Button>
                  <Button variant="outline" className="w-full border-border gap-2">
                    <Calendar className="w-4 h-4" />
                    Book Consultation
                  </Button>
                  {pro.hourly_rate && (
                    <div className="text-center text-xs text-muted-foreground pt-1">
                      Consultation from <span className="font-semibold text-foreground">€{pro.hourly_rate}/hr</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Verification */}
              <div className="glass-card rounded-xl p-5">
                <h3 className="font-display font-semibold mb-3 text-sm">Credentials</h3>
                <div className="space-y-2.5">
                  <div className={`flex items-center gap-2 text-sm ${pro.verified ? "text-brand-emerald" : "text-muted-foreground"}`}>
                    <CheckCircle className={`w-4 h-4 shrink-0 ${pro.verified ? "text-brand-emerald" : "text-muted-foreground"}`} />
                    {pro.verified ? "Identity Verified" : "Pending Verification"}
                  </div>
                  {pro.license_number && (
                    <div className="flex items-center gap-2 text-sm text-brand-emerald">
                      <Shield className="w-4 h-4 shrink-0" />
                      Licensed Professional
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Star className="w-4 h-4 shrink-0 text-brand-gold" />
                    {pro.reviews_count || 0} verified reviews
                  </div>
                </div>
              </div>

              {/* Category peers */}
              <div className="glass-card rounded-xl p-5">
                <h3 className="font-display font-semibold mb-3 text-sm">Similar Professionals</h3>
                <div className="space-y-3">
                  {professionals
                    .filter((p: any) => p.category === pro.category && p.id !== pro.id)
                    .slice(0, 3)
                    .map((peer: any) => {
                      const peerName = (peer.profiles as any)?.display_name || "Professional";
                      return (
                        <Link
                          key={peer.id}
                          to={`/professionals/${peer.id}`}
                          className="flex items-center gap-3 group"
                        >
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
                    <p className="text-xs text-muted-foreground">No other professionals in this category yet.</p>
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
