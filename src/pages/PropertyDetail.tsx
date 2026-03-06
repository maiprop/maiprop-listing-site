import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  MapPin, Bed, Bath, Square, Heart, Share2, Phone, MessageSquare,
  Calendar, Video, ChevronLeft, ChevronRight, Star, TrendingUp,
  Shield, FileText, Zap, ExternalLink, Lock, BarChart2, Eye,
  Home, Clock, Check, Gavel, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/Navbar";
import { MarketTicker } from "@/components/MarketTicker";
import { Footer } from "@/components/Footer";
import { PropertyCard } from "@/components/PropertyCard";
import { mockProperties } from "@/data/mockProperties";
import ViewingDialog from "@/components/ViewingDialog";
import ChatWidget from "@/components/ChatWidget";

export default function PropertyDetail() {
  const { id } = useParams();
  const property = mockProperties.find(p => p.id === id) || mockProperties[0];
  const similar = mockProperties.filter(p => p.id !== property.id && p.city === property.city).slice(0, 4);
  const [currentImage, setCurrentImage] = useState(0);
  const [liked, setLiked] = useState(false);
  const [viewingOpen, setViewingOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [reportPurchased, setReportPurchased] = useState(false);

  const aiInsights = [
    { label: "Investment Score", value: `${property.aiScore || 82}/100`, trend: "+3 this month", color: "text-primary" },
    { label: "Price vs Market", value: "-8% below avg", trend: "Good deal", color: "text-brand-emerald" },
    { label: "Rental Yield Est.", value: "4.8% p.a.", trend: "Stable", color: "text-brand-gold" },
    { label: "Capital Growth", value: "+12% (5yr)", trend: "Athens avg +9%", color: "text-accent" },
  ];

  const dataPoints = [
    { label: "Year Built", value: "2018" },
    { label: "Energy Class", value: "B+" },
    { label: "Floor", value: "4th of 6" },
    { label: "Heating", value: "Autonomous gas" },
    { label: "Orientation", value: "South-East" },
    { label: "Zone", value: "Residential" },
    { label: "Cadastre No.", value: "ATH-2018-104521" },
    { label: "ENFIA Zone", value: "Zone 3 — €7.80/m²" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <MarketTicker />

      <div className="pt-16">
        {/* Breadcrumb */}
        <div className="container py-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <ChevronRight className="w-3 h-3" />
            <Link to="/listings" className="hover:text-foreground">Listings</Link>
            <ChevronRight className="w-3 h-3" />
            <Link to={`/listings?city=${property.city}`} className="hover:text-foreground">{property.city}</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground truncate max-w-xs">{property.title}</span>
          </div>
        </div>

        <div className="container pb-16">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left: Main content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Image gallery */}
              <div className="relative rounded-2xl overflow-hidden aspect-[16/9] bg-secondary group">
                <img
                  src={property.images[currentImage] || property.images[0]}
                  alt={property.title}
                  className="w-full h-full object-cover"
                />
                {/* Badges */}
                <div className="absolute top-4 left-4 flex gap-2">
                  {property.listingType === "auction" && (
                    <span className="badge-auction text-xs font-bold px-3 py-1.5 rounded-full">AUCTION</span>
                  )}
                  {property.listingType === "firesale" && (
                    <span className="badge-firesale text-xs font-bold px-3 py-1.5 rounded-full">FIRESALE</span>
                  )}
                  {property.isPremium && (
                    <span className="bg-brand-purple text-white text-xs font-bold px-3 py-1.5 rounded-full">PREMIUM</span>
                  )}
                </div>
                {/* Nav arrows */}
                {property.images.length > 1 && (
                  <>
                    <button
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/60 backdrop-blur-sm hover:bg-background/80 transition-colors"
                      onClick={() => setCurrentImage((currentImage - 1 + property.images.length) % property.images.length)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/60 backdrop-blur-sm hover:bg-background/80 transition-colors"
                      onClick={() => setCurrentImage((currentImage + 1) % property.images.length)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
                {/* Actions overlay */}
                <div className="absolute top-4 right-4 flex gap-2">
                  <button
                    className={`p-2 rounded-full backdrop-blur-sm transition-all ${liked ? "bg-destructive" : "bg-background/60 hover:bg-background/80"}`}
                    onClick={() => setLiked(!liked)}
                  >
                    <Heart className={`w-4 h-4 ${liked ? "fill-white text-white" : ""}`} />
                  </button>
                  <button className="p-2 rounded-full bg-background/60 backdrop-blur-sm hover:bg-background/80">
                    <Share2 className="w-4 h-4" />
                  </button>
                  {property.hasVirtualTour && (
                    <button className="px-3 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold backdrop-blur-sm hover:opacity-90">
                      360° Tour
                    </button>
                  )}
                  {property.hasVideo && (
                    <button className="p-2 rounded-full bg-background/60 backdrop-blur-sm hover:bg-background/80">
                      <Video className="w-4 h-4 text-primary" />
                    </button>
                  )}
                </div>
                {/* Image count */}
                <div className="absolute bottom-4 right-4 bg-background/60 backdrop-blur-sm px-3 py-1 rounded-full text-xs">
                  {currentImage + 1} / {property.images.length}
                </div>
                {/* View count */}
                <div className="absolute bottom-4 left-4 flex items-center gap-1 bg-background/60 backdrop-blur-sm px-3 py-1 rounded-full text-xs">
                  <Eye className="w-3 h-3" /> {property.views} views this week
                </div>
              </div>

              {/* Title & price */}
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="font-display text-2xl md:text-3xl font-bold">{property.title}</h1>
                    <div className="flex items-center gap-1 mt-2 text-muted-foreground text-sm">
                      <MapPin className="w-4 h-4" />
                      {property.address}, {property.city}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-2xl font-bold">
                      €{property.price.toLocaleString()}
                      {property.listingType === "rent" && <span className="text-base font-normal text-muted-foreground">/mo</span>}
                    </div>
                    {property.pricePerSqm && (
                      <div className="text-sm text-muted-foreground">€{property.pricePerSqm}/m²</div>
                    )}
                    {property.priceChange !== undefined && (
                      <div className={`text-xs font-semibold flex items-center gap-1 justify-end mt-1 ${property.priceChange > 0 ? "text-brand-emerald" : "text-destructive"}`}>
                        <TrendingUp className="w-3 h-3" />
                        {property.priceChange > 0 ? "+" : ""}{property.priceChange}% vs last month
                      </div>
                    )}
                  </div>
                </div>

                {/* Specs */}
                <div className="flex items-center gap-4 mt-4">
                  {property.bedrooms !== undefined && (
                    <div className="flex items-center gap-1.5 bg-secondary px-3 py-2 rounded-lg text-sm">
                      <Bed className="w-4 h-4 text-muted-foreground" />
                      <span>{property.bedrooms} bed</span>
                    </div>
                  )}
                  {property.bathrooms !== undefined && (
                    <div className="flex items-center gap-1.5 bg-secondary px-3 py-2 rounded-lg text-sm">
                      <Bath className="w-4 h-4 text-muted-foreground" />
                      <span>{property.bathrooms} bath</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 bg-secondary px-3 py-2 rounded-lg text-sm">
                    <Square className="w-4 h-4 text-muted-foreground" />
                    <span>{property.sqm} m²</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-secondary px-3 py-2 rounded-lg text-sm capitalize">
                    <Home className="w-4 h-4 text-muted-foreground" />
                    <span>{property.type}</span>
                  </div>
                </div>

                {/* Tags */}
                {property.tags && property.tags.length > 0 && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {property.tags.map(tag => (
                      <span key={tag} className="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary">{tag}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Insights Panel */}
              <div className="glass-card rounded-xl border border-primary/20 overflow-hidden">
                <div className="flex items-center gap-2 p-4 bg-primary/5 border-b border-primary/20">
                  <Zap className="w-4 h-4 text-primary" />
                  <span className="font-display font-semibold text-sm">AI Market Insights</span>
                  <span className="ml-auto text-xs text-muted-foreground">Powered by mAI Prop OS</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-y divide-border">
                  {aiInsights.map(insight => (
                    <div key={insight.label} className="p-4">
                      <div className="text-xs text-muted-foreground mb-1">{insight.label}</div>
                      <div className={`font-display font-bold text-lg ${insight.color}`}>{insight.value}</div>
                      <div className="text-xs text-muted-foreground mt-1">{insight.trend}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Property data */}
              <div className="glass-card rounded-xl p-6">
                <h3 className="font-display font-semibold mb-4">Property Details</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {dataPoints.map(dp => (
                    <div key={dp.label}>
                      <div className="text-xs text-muted-foreground">{dp.label}</div>
                      <div className="text-sm font-medium mt-0.5">{dp.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="glass-card rounded-xl p-6">
                <h3 className="font-display font-semibold mb-4">Description</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  This exceptional property offers a rare combination of modern architecture and premium location in the heart of {property.city}. 
                  Featuring high-end finishes throughout, the property benefits from abundant natural light and exceptional views. 
                  The open-plan living area flows seamlessly to a private terrace, while the kitchen is equipped with top-of-the-line appliances.
                  The property has been fully renovated in 2022 with premium materials and smart home integration.
                  Ideal for both primary residence and investment purposes, with strong rental demand in the area.
                </p>
              </div>

              {/* Premium AI Report */}
              <div className={`rounded-xl border overflow-hidden ${reportPurchased ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shrink-0">
                      <BarChart2 className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-display font-semibold">Full AI Property Report</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold font-semibold">PREMIUM</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        Deep-dive analysis: cadastre verification, full price history, comparable sales, neighborhood trends, investment projection, ENFIA calculation, and legal status check.
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                        {[
                          "Cadastre Verification",
                          "5-Year Price History",
                          "Comparable Sales",
                          "Investment Projection",
                          "Legal Status Check",
                          "Neighborhood Score",
                        ].map(item => (
                          <div key={item} className={`flex items-center gap-1.5 text-xs ${reportPurchased ? "text-primary" : "text-muted-foreground"}`}>
                            {reportPurchased ? (
                              <Check className="w-3 h-3 text-primary" />
                            ) : (
                              <Lock className="w-3 h-3" />
                            )}
                            {item}
                          </div>
                        ))}
                      </div>
                      {!reportPurchased ? (
                        <div className="flex items-center gap-3">
                          <Button
                            className="bg-gradient-primary border-0 text-primary-foreground"
                            onClick={() => setReportPurchased(true)}
                          >
                            Unlock Report — €29
                          </Button>
                          <span className="text-xs text-muted-foreground">One-time payment, instant access</span>
                        </div>
                      ) : (
                        <Button variant="outline" className="border-primary/30 text-primary gap-2">
                          <Download className="w-4 h-4" />
                          Download PDF Report
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Auction details */}
              {property.listingType === "auction" && (
                <div className="glass-card rounded-xl border border-brand-gold/20 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Gavel className="w-5 h-5 text-brand-gold" />
                    <h3 className="font-display font-semibold">Auction Details</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Auction Date</div>
                      <div className="font-semibold text-sm mt-1">{property.auctionDate}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Starting Bid</div>
                      <div className="font-semibold text-sm mt-1 text-brand-gold">€{property.auctionStartingBid?.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Market Value</div>
                      <div className="font-semibold text-sm mt-1">€{property.price.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="bg-brand-gold/10 rounded-lg p-3 text-xs text-muted-foreground">
                    ⚡ This is a judicial auction. Buyer must conduct own due diligence. maiProp provides AI-powered pre-auction analysis reports.
                  </div>
                  <Button className="mt-4 w-full bg-gradient-gold border-0 text-background font-semibold">
                    Set Auction Alert — Get AI Report
                  </Button>
                </div>
              )}

              {/* Similar properties */}
              {similar.length > 0 && (
                <div>
                  <h3 className="font-display font-semibold mb-4">Similar in {property.city}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {similar.map(p => (
                      <PropertyCard key={p.id} property={p} compact />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Contact sidebar */}
            <div className="space-y-4">
              {/* Agent card */}
              {property.agent && (
                <div className="glass-card rounded-xl p-5 sticky top-24">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-lg font-bold text-primary-foreground">
                      {property.agent.name[0]}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{property.agent.name}</div>
                      <div className="text-xs text-muted-foreground">Licensed Agent</div>
                      {property.agent.verified && (
                        <div className="flex items-center gap-1 text-xs text-brand-gold mt-0.5">
                          <Star className="w-3 h-3 fill-current" />
                          <span>Verified</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button
                      className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
                      onClick={() => setChatOpen(true)}
                    >
                      <MessageSquare className="w-4 h-4" />
                      Send Message
                    </Button>
                    <Button variant="outline" className="w-full border-border gap-2">
                      <Phone className="w-4 h-4" />
                      Call Agent
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full border-border gap-2"
                      onClick={() => setViewingOpen(true)}
                    >
                      <Calendar className="w-4 h-4" />
                      Book Viewing
                    </Button>
                    <Button variant="outline" className="w-full border-border gap-2">
                      <Video className="w-4 h-4" />
                      Video Viewing
                    </Button>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground text-center">
                    Response time: usually within 2 hours
                  </div>
                </div>
              )}

              {/* Quick stats card */}
              <div className="glass-card rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-brand-emerald" />
                  <span className="font-display font-semibold text-sm">Verified Listing</span>
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Check className="w-3 h-3 text-brand-emerald" />
                    Cadastre verified
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-3 h-3 text-brand-emerald" />
                    Agent ID checked
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-3 h-3 text-brand-emerald" />
                    No encumbrances found
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    Last verified: today
                  </div>
                </div>
              </div>

              {/* Mortgage calculator */}
              <div className="glass-card rounded-xl p-5">
                <h4 className="font-display font-semibold text-sm mb-3">Mortgage Calculator</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Property Price</label>
                    <div className="bg-secondary rounded-lg px-3 py-2 text-sm font-semibold mt-1">
                      €{property.price.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Down Payment (20%)</label>
                    <div className="bg-secondary rounded-lg px-3 py-2 text-sm mt-1">
                      €{Math.round(property.price * 0.2).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Rate (estimated)</label>
                    <div className="bg-secondary rounded-lg px-3 py-2 text-sm mt-1">3.8% p.a.</div>
                  </div>
                  <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
                    <div className="text-xs text-muted-foreground">Est. Monthly Payment</div>
                    <div className="font-display font-bold text-lg text-primary mt-1">
                      €{Math.round(property.price * 0.8 * (0.038 / 12) / (1 - Math.pow(1 + 0.038 / 12, -240))).toLocaleString()}/mo
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Based on 20yr term</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
      <ViewingDialog open={viewingOpen} onClose={() => setViewingOpen(false)} property={property} />
      <ChatWidget open={chatOpen} onClose={() => setChatOpen(false)} agentName={property.agent?.name || "Agent"} />
    </div>
  );
}
