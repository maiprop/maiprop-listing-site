import { Link } from "react-router-dom";
import {
  FileText, Link2, TrendingUp, Building2, Briefcase, Euro, BarChart3,
  MapPin, Clock, Languages, Globe, ExternalLink, Video, Shield,
  Zap, CheckCircle, Crown,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Pro = Tables<"professionals">;

interface Props {
  pro: Pro;
  isRealEstateAgent: boolean;
  professionalIsPro: boolean;
  agentListingsCount: number;
  agentPortfolioKpis?: {
    averageDealSize: string;
    typologyMix: string;
    mainServiceArea: string;
    mainDealType: string;
  };
}

export function ProfessionalOverviewTab({ pro, isRealEstateAgent, professionalIsPro, agentListingsCount, agentPortfolioKpis }: Props) { // skipcq: JS-R1005 - This tab orchestrates intentionally distinct pro/basic/non-agent profile sections.
  return (
    <div className="space-y-5">
      {pro.bio && (
        <div className="glass-card rounded-xl p-6">
          <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> About
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{pro.bio}</p>
        </div>
      )}

      {isRealEstateAgent ? (
        professionalIsPro ? (
          <>
            {/* Social & Web Presence */}
            {(pro.website_url || pro.video_link) && (
              <div className="glass-card rounded-xl p-6">
                <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary" /> Social & Web Presence
                </h2>
                <div className="flex flex-col gap-3">
                  {pro.website_url && (
                    <a href={pro.website_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-secondary rounded-xl hover:border-primary/30 border border-border transition-colors group">
                      <Globe className="w-4 h-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">Website</div>
                        <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">{pro.website_url.replace(/^https?:\/\//, "")}</div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </a>
                  )}
                  {pro.video_link && (
                    <a href={pro.video_link} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-secondary rounded-xl hover:border-primary/30 border border-border transition-colors group">
                      <Video className="w-4 h-4 text-accent shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground">Video Introduction</div>
                        <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">Watch intro</div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Portfolio Analysis */}
            <div className="glass-card rounded-xl p-6 border border-primary/10">
              <h2 className="font-display font-semibold mb-5 flex items-center gap-2 text-primary">
                <TrendingUp className="w-4 h-4" /> Portfolio Analysis
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col items-center text-center p-4 bg-secondary rounded-xl border border-border">
                  <Euro className="w-5 h-5 text-brand-emerald mb-2" />
                  <div className="font-display font-bold text-lg text-foreground leading-tight">{agentPortfolioKpis?.averageDealSize || pro.average_deal_size || "—"}</div>
                  <div className="text-xs text-muted-foreground mt-1.5">Average Deal Size</div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">From profile or active listings</div>
                </div>
                <div className="flex flex-col items-center text-center p-4 bg-secondary rounded-xl border border-border">
                  <Building2 className="w-5 h-5 text-primary mb-2" />
                  <div className="font-display font-bold text-lg text-foreground leading-tight capitalize">{agentPortfolioKpis?.typologyMix || "—"}</div>
                  <div className="text-xs text-muted-foreground mt-1.5">Typology Mix</div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">Dominant property types</div>
                </div>
                <div className="flex flex-col items-center text-center p-4 bg-secondary rounded-xl border border-border">
                  <MapPin className="w-5 h-5 text-accent mb-2" />
                  <div className="font-display font-bold text-lg text-foreground leading-tight">{agentPortfolioKpis?.mainServiceArea || pro.city || "Greece"}</div>
                  <div className="text-xs text-muted-foreground mt-1.5">Main Area of Service</div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">Most represented market</div>
                </div>
                <div className="flex flex-col items-center text-center p-4 bg-secondary rounded-xl border border-border">
                  <Briefcase className="w-5 h-5 text-brand-gold mb-2" />
                  <div className="font-display font-bold text-lg text-foreground leading-tight">{agentPortfolioKpis?.mainDealType || "—"}</div>
                  <div className="text-xs text-muted-foreground mt-1.5">Main Deal Type</div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">Sale/rent balance</div>
                </div>
              </div>
              <div className="hidden">
                <div className="flex flex-col items-center text-center p-4 bg-secondary rounded-xl border border-border">
                  <Euro className="w-5 h-5 text-brand-emerald mb-2" />
                  <div className="font-display font-bold text-lg text-foreground leading-tight">{agentPortfolioKpis?.averageDealSize || pro.average_deal_size || "—"}</div>
                  <div className="text-xs text-muted-foreground mt-1.5">Average Deal Size</div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">From profile or active listing prices</div>
                </div>
                <div className="flex flex-col items-center text-center p-4 bg-secondary rounded-xl border border-border">
                  <Building2 className="w-5 h-5 text-primary mb-2" />
                  <div className="font-display font-bold text-2xl text-foreground leading-none">{pro.projects_count ?? "—"}</div>
                  <div className="text-xs text-muted-foreground mt-1.5">Deals Completed</div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">Total closed transactions</div>
                </div>
                <div className="flex flex-col items-center text-center p-4 bg-secondary rounded-xl border border-border">
                  <Euro className="w-5 h-5 text-brand-emerald mb-2" />
                  <div className="font-display font-bold text-xl text-foreground leading-none">{pro.average_deal_size || "—"}</div>
                  <div className="text-xs text-muted-foreground mt-1.5">Avg Deal Size</div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">Typical transaction value</div>
                </div>
              </div>
              {!!pro.average_portfolio_asset_size && (
                <div className="mt-3 flex items-center gap-2 p-3 bg-primary/5 border border-primary/15 rounded-xl">
                  <BarChart3 className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <span className="text-xs text-muted-foreground">Average portfolio asset size: </span>
                    <span className="text-sm font-semibold text-foreground">{pro.average_portfolio_asset_size}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Professional Details */}
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
          </>
        ) : (
          /* Basic agent — contact info + basic portfolio */
          <>
            <div className="glass-card rounded-xl p-6">
              <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" /> Contact Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pro.city && (
                  <div className="flex items-start gap-3 p-3 bg-secondary rounded-xl">
                    <MapPin className="w-4 h-4 text-primary/60 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs text-muted-foreground">Service Area</div>
                      <div className="text-sm font-medium mt-0.5">{pro.city} & surrounding</div>
                    </div>
                  </div>
                )}
                {pro.experience_years && (
                  <div className="flex items-start gap-3 p-3 bg-secondary rounded-xl">
                    <Clock className="w-4 h-4 text-brand-emerald mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs text-muted-foreground">Experience</div>
                      <div className="text-sm font-medium mt-0.5">{pro.experience_years} years</div>
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
                {pro.website_url && (
                  <a href={pro.website_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 bg-secondary rounded-xl hover:border-primary/30 border border-transparent transition-colors group">
                    <Globe className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">Website</div>
                      <div className="text-sm font-medium mt-0.5 truncate group-hover:text-primary transition-colors">{pro.website_url.replace(/^https?:\/\//, "")}</div>
                    </div>
                  </a>
                )}
              </div>
            </div>

            <div className="glass-card rounded-xl p-6">
              <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" /> Portfolio Overview
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center text-center p-4 bg-secondary rounded-xl">
                  <div className="font-display font-bold text-2xl text-foreground">{agentListingsCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Active Listings</div>
                </div>
                <div className="flex flex-col items-center text-center p-4 bg-secondary rounded-xl">
                  <div className="font-display font-bold text-2xl text-foreground">{pro.projects_count ?? "—"}</div>
                  <div className="text-xs text-muted-foreground mt-1">Deals Done</div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 p-3 bg-primary/5 border border-primary/15 rounded-xl">
                <Crown className="w-4 h-4 text-brand-gold shrink-0" />
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Upgrade to Pro</span> to unlock portfolio analysis, social presence, and advanced tools.{" "}
                  <Link to="/pricing" className="text-primary hover:underline">See plans →</Link>
                </p>
              </div>
            </div>
          </>
        )
      ) : (
        /* Non-agent professionals */
        <>
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
              {!!pro.hourly_rate && (
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
        </>
      )}
    </div>
  );
}
