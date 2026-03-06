import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  MapPin, Bed, Bath, Square, Heart, Share2, Phone, MessageSquare,
  Calendar, Video, ChevronLeft, ChevronRight, Star, TrendingUp,
  Shield, FileText, Zap, ExternalLink, Lock, BarChart2, Eye,
  Home, Clock, Check, Gavel, Download, Loader2, CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { MarketTicker } from "@/components/MarketTicker";
import { Footer } from "@/components/Footer";
import { PropertyCard } from "@/components/PropertyCard";
import { mockProperties } from "@/data/mockProperties";
import ViewingDialog from "@/components/ViewingDialog";
import { useListing, useListings } from "@/hooks/useListings";
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";
import { useStartConversation } from "@/hooks/useMessages";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Try to fetch from DB first
  const { data: dbListing, isLoading } = useListing(id || "");
  const { data: dbSimilar = [] } = useListings({ city: dbListing?.city });

  // Fallback to mock data if not in DB
  const mockProperty = mockProperties.find(p => p.id === id) || mockProperties[0];
  const isDbListing = !!dbListing;

  const [currentImage, setCurrentImage] = useState(0);
  const [viewingOpen, setViewingOpen] = useState(false);
  const [reportPurchased, setReportPurchased] = useState(false);

  const { data: favorites = [] } = useFavorites();
  const toggleFav = useToggleFavorite();
  const startConversation = useStartConversation();

  const isFavorited = favorites.some((f: any) => f.listing_id === id);

  const handleFavorite = () => {
    if (!user) { toast.error("Sign in to save properties"); return; }
    if (id) toggleFav.mutate({ listing_id: id, isFavorited });
  };

  const handleContact = async () => {
    if (!user) { toast.error("Sign in to contact the owner"); navigate("/login"); return; }
    const ownerId = isDbListing ? (dbListing as any).profiles?.user_id : undefined;
    if (!ownerId) { toast.info("Contact details not available"); return; }
    try {
      await startConversation.mutateAsync({ other_user_id: ownerId, listing_id: id });
      navigate("/messages");
    } catch { toast.error("Could not start conversation"); }
  };

  // Build images list
  const dbImages = dbListing
    ? [
        ...(dbListing.cover_image_url ? [dbListing.cover_image_url] : []),
        ...((dbListing as any).listing_images?.map((img: any) => img.url) || []),
      ]
    : null;
  const images = dbImages?.length ? dbImages : mockProperty.images;

  // Build data points
  const buildDataPoints = () => {
    if (isDbListing) {
      return [
        { label: "Year Built", value: dbListing.year_built?.toString() || "—" },
        { label: "Energy Class", value: dbListing.energy_class || "—" },
        { label: "Floor", value: dbListing.floor != null ? `${dbListing.floor}${dbListing.total_floors ? ` of ${dbListing.total_floors}` : ""}` : "—" },
        { label: "Cadastre No.", value: dbListing.cadastre_number || "—" },
        { label: "ENFIA Zone", value: dbListing.enfia_zone || "—" },
        { label: "Region", value: dbListing.region || "—" },
        { label: "Postal Code", value: dbListing.postal_code || "—" },
        { label: "Price/m²", value: dbListing.price_per_sqm ? `€${Number(dbListing.price_per_sqm).toLocaleString()}` : "—" },
      ];
    }
    return [
      { label: "Year Built", value: "2018" },
      { label: "Energy Class", value: "B+" },
      { label: "Floor", value: "4th of 6" },
      { label: "Heating", value: "Autonomous gas" },
      { label: "Orientation", value: "South-East" },
      { label: "Zone", value: "Residential" },
      { label: "Cadastre No.", value: "ATH-2018-104521" },
      { label: "ENFIA Zone", value: "Zone 3 — €7.80/m²" },
    ];
  };

  const aiInsights = [
    { label: "Investment Score", value: `${(isDbListing ? dbListing.ai_score : mockProperty.aiScore) || 82}/100`, trend: "+3 this month", color: "text-primary" },
    { label: "Price vs Market", value: "-8% below avg", trend: "Good deal", color: "text-brand-emerald" },
    { label: "Rental Yield Est.", value: "4.8% p.a.", trend: "Stable", color: "text-brand-gold" },
    { label: "Capital Growth", value: "+12% (5yr)", trend: "Athens avg +9%", color: "text-accent" },
  ];

  if (isLoading && !mockProperties.find(p => p.id === id)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Use DB or mock data
  const title = isDbListing ? dbListing.title : mockProperty.title;
  const city = isDbListing ? dbListing.city : mockProperty.city;
  const address = isDbListing ? (dbListing.address || city) : mockProperty.address;
  const price = isDbListing ? Number(dbListing.price) : mockProperty.price;
  const sqm = isDbListing ? Number(dbListing.sqm) : mockProperty.sqm;
  const bedrooms = isDbListing ? dbListing.bedrooms : mockProperty.bedrooms;
  const bathrooms = isDbListing ? dbListing.bathrooms : mockProperty.bathrooms;
  const listingType = isDbListing ? dbListing.listing_type : mockProperty.listingType;
  const propertyType = isDbListing ? dbListing.property_type : mockProperty.type;
  const description = isDbListing ? dbListing.description : null;
  const ownerProfile = isDbListing ? (dbListing as any).profiles : null;
  const pricePerSqm = isDbListing
    ? dbListing.price_per_sqm
    : mockProperty.pricePerSqm;

  const features = isDbListing ? [
    dbListing.has_parking && "Parking",
    dbListing.has_elevator && "Elevator",
    dbListing.has_garden && "Garden",
    dbListing.has_pool && "Pool",
    dbListing.has_storage && "Storage",
    dbListing.has_security && "Security",
    dbListing.has_smart_home && "Smart Home",
    dbListing.has_video_tour && "Video Tour",
  ].filter(Boolean) : mockProperty.tags;

  const similarListings = isDbListing
    ? dbSimilar.filter((l: any) => l.id !== id).slice(0, 4)
    : mockProperties.filter(p => p.id !== id && p.city === city).slice(0, 4);

  const mortgageMonthly = Math.round(price * 0.8 * (0.038 / 12) / (1 - Math.pow(1 + 0.038 / 12, -240)));

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
            <Link to={`/listings?city=${city}`} className="hover:text-foreground">{city}</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground truncate max-w-xs">{title}</span>
          </div>
        </div>

        <div className="container pb-16">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left: Main content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Image gallery */}
              <div className="relative rounded-2xl overflow-hidden aspect-[16/9] bg-secondary group">
                <img
                  src={images[currentImage] || images[0]}
                  alt={title}
                  className="w-full h-full object-cover"
                />
                {/* Badges */}
                <div className="absolute top-4 left-4 flex gap-2">
                  {listingType === "auction" && (
                    <span className="badge-auction text-xs font-bold px-3 py-1.5 rounded-full">AUCTION</span>
                  )}
                  {listingType === "firesale" && (
                    <span className="badge-firesale text-xs font-bold px-3 py-1.5 rounded-full">FIRESALE</span>
                  )}
                </div>
                {/* Nav arrows */}
                {images.length > 1 && (
                  <>
                    <button
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/60 backdrop-blur-sm hover:bg-background/80 transition-colors"
                      onClick={() => setCurrentImage((currentImage - 1 + images.length) % images.length)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/60 backdrop-blur-sm hover:bg-background/80 transition-colors"
                      onClick={() => setCurrentImage((currentImage + 1) % images.length)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
                {/* Actions overlay */}
                <div className="absolute top-4 right-4 flex gap-2">
                  <button
                    className={`p-2 rounded-full backdrop-blur-sm transition-all ${isFavorited ? "bg-destructive" : "bg-background/60 hover:bg-background/80"}`}
                    onClick={handleFavorite}
                  >
                    <Heart className={`w-4 h-4 ${isFavorited ? "fill-white text-white" : ""}`} />
                  </button>
                  <button className="p-2 rounded-full bg-background/60 backdrop-blur-sm hover:bg-background/80">
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
                {/* Image count */}
                <div className="absolute bottom-4 right-4 bg-background/60 backdrop-blur-sm px-3 py-1 rounded-full text-xs">
                  {currentImage + 1} / {images.length}
                </div>
                {isDbListing && (
                  <div className="absolute bottom-4 left-4 flex items-center gap-1 bg-background/60 backdrop-blur-sm px-3 py-1 rounded-full text-xs">
                    <Eye className="w-3 h-3" /> {dbListing.views_count || 0} views
                  </div>
                )}
              </div>

              {/* Title & price */}
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="font-display text-2xl md:text-3xl font-bold">{title}</h1>
                    <div className="flex items-center gap-1 mt-2 text-muted-foreground text-sm">
                      <MapPin className="w-4 h-4" />
                      {address}{address !== city ? `, ${city}` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-2xl font-bold">
                      €{price.toLocaleString()}
                      {listingType === "rent" && <span className="text-base font-normal text-muted-foreground">/mo</span>}
                    </div>
                    {pricePerSqm && (
                      <div className="text-sm text-muted-foreground">€{Number(pricePerSqm).toLocaleString()}/m²</div>
                    )}
                  </div>
                </div>

                {/* Specs */}
                <div className="flex items-center gap-3 mt-4 flex-wrap">
                  {bedrooms != null && (
                    <div className="flex items-center gap-1.5 bg-secondary px-3 py-2 rounded-lg text-sm">
                      <Bed className="w-4 h-4 text-muted-foreground" /><span>{bedrooms} bed</span>
                    </div>
                  )}
                  {bathrooms != null && (
                    <div className="flex items-center gap-1.5 bg-secondary px-3 py-2 rounded-lg text-sm">
                      <Bath className="w-4 h-4 text-muted-foreground" /><span>{bathrooms} bath</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 bg-secondary px-3 py-2 rounded-lg text-sm">
                    <Square className="w-4 h-4 text-muted-foreground" /><span>{sqm} m²</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-secondary px-3 py-2 rounded-lg text-sm capitalize">
                    <Home className="w-4 h-4 text-muted-foreground" /><span>{propertyType}</span>
                  </div>
                </div>

                {/* Feature tags */}
                {features && features.length > 0 && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {features.map((tag: any) => tag && (
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
                  {buildDataPoints().map(dp => (
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
                  {description ||
                    `This exceptional property offers a rare combination of modern architecture and premium location in the heart of ${city}. 
                    Featuring high-end finishes throughout, the property benefits from abundant natural light and exceptional views. 
                    The open-plan living area flows seamlessly to a private terrace, while the kitchen is equipped with top-of-the-line appliances.`}
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
                        {["Cadastre Verification", "5-Year Price History", "Comparable Sales", "Investment Projection", "Legal Status Check", "Neighborhood Score"].map(item => (
                          <div key={item} className={`flex items-center gap-1.5 text-xs ${reportPurchased ? "text-primary" : "text-muted-foreground"}`}>
                            {reportPurchased ? <Check className="w-3 h-3 text-primary" /> : <Lock className="w-3 h-3" />}
                            {item}
                          </div>
                        ))}
                      </div>
                      {!reportPurchased ? (
                        <div className="flex items-center gap-3">
                          <Button className="bg-gradient-primary border-0 text-primary-foreground" onClick={() => setReportPurchased(true)}>
                            Unlock Report — €29
                          </Button>
                          <span className="text-xs text-muted-foreground">One-time payment, instant access</span>
                        </div>
                      ) : (
                        <Button variant="outline" className="border-primary/30 text-primary gap-2">
                          <Download className="w-4 h-4" /> Download PDF Report
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Auction details */}
              {listingType === "auction" && (
                <div className="glass-card rounded-xl border border-brand-gold/20 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Gavel className="w-5 h-5 text-brand-gold" />
                    <h3 className="font-display font-semibold">Auction Details</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Auction Date</div>
                      <div className="font-semibold text-sm mt-1">
                        {isDbListing && dbListing.auction_date
                          ? new Date(dbListing.auction_date).toLocaleDateString("en-GB")
                          : (mockProperty as any).auctionDate || "TBC"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Starting Bid</div>
                      <div className="font-semibold text-sm mt-1 text-brand-gold">
                        €{((isDbListing ? Number(dbListing.auction_starting_bid) : (mockProperty as any).auctionStartingBid) || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Market Value</div>
                      <div className="font-semibold text-sm mt-1">€{price.toLocaleString()}</div>
                    </div>
                    {isDbListing && dbListing.auction_court && (
                      <div className="col-span-2 md:col-span-3">
                        <div className="text-xs text-muted-foreground">Court / Platform</div>
                        <div className="font-semibold text-sm mt-1">{dbListing.auction_court}</div>
                      </div>
                    )}
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
              {similarListings.length > 0 && (
                <div>
                  <h3 className="font-display font-semibold mb-4">Similar in {city}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {isDbListing
                      ? (similarListings as any[]).map((l: any) => (
                          <Link key={l.id} to={`/property/${l.id}`}
                            className="glass-card rounded-xl overflow-hidden block hover:border-primary/30 transition-colors border border-border">
                            <img src={l.cover_image_url || "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=60"}
                              alt={l.title} className="w-full h-32 object-cover" />
                            <div className="p-3">
                              <p className="font-semibold text-sm truncate">{l.title}</p>
                              <p className="text-xs text-muted-foreground mt-1">{l.city} · €{Number(l.price).toLocaleString()} · {l.sqm}m²</p>
                            </div>
                          </Link>
                        ))
                      : (similarListings as any[]).map((p: any) => <PropertyCard key={p.id} property={p} compact />)
                    }
                  </div>
                </div>
              )}
            </div>

            {/* Right: Contact sidebar */}
            <div className="space-y-4 lg:sticky lg:top-24 self-start">
              {/* Owner / Agent card */}
              <div className="glass-card rounded-xl p-5 border border-primary/10">
                {ownerProfile ? (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-lg font-bold text-primary-foreground overflow-hidden">
                        {ownerProfile.avatar_url
                          ? <img src={ownerProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                          : (ownerProfile.display_name?.[0] || "O")}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{ownerProfile.display_name || "Owner"}</div>
                        <div className="text-xs text-muted-foreground capitalize">{isDbListing && "Listing Owner"}</div>
                        {ownerProfile.verified && (
                          <div className="flex items-center gap-1 text-xs text-primary mt-0.5">
                            <CheckCircle className="w-3 h-3" /><span>Verified</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-lg font-bold text-primary-foreground">
                      A
                    </div>
                    <div>
                      <div className="font-semibold text-sm">Licensed Agent</div>
                      <div className="flex items-center gap-1 text-xs text-brand-gold mt-0.5">
                        <Star className="w-3 h-3 fill-current" /><span>Verified</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2" onClick={handleContact} disabled={startConversation.isPending}>
                    {startConversation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    Send Message
                  </Button>
                  <Button variant="outline" className="w-full border-border gap-2">
                    <Phone className="w-4 h-4" />Call Agent
                  </Button>
                  <Button variant="outline" className="w-full border-border gap-2" onClick={() => setViewingOpen(true)}>
                    <Calendar className="w-4 h-4" />Book Viewing
                  </Button>
                  <Button variant="outline" className="w-full border-border gap-2" onClick={() => setViewingOpen(true)}>
                    <Video className="w-4 h-4" />Video Viewing
                  </Button>
                </div>
                <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground text-center">
                  Response time: usually within 2 hours
                </div>
              </div>

              {/* Verified listing */}
              <div className="glass-card rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-brand-emerald" />
                  <span className="font-display font-semibold text-sm">Verified Listing</span>
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  {["Cadastre verified", "Agent ID checked", "No encumbrances found"].map(item => (
                    <div key={item} className="flex items-center gap-2">
                      <Check className="w-3 h-3 text-brand-emerald" />{item}
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-muted-foreground" />Last verified: today
                  </div>
                </div>
              </div>

              {/* Mortgage calculator */}
              <div className="glass-card rounded-xl p-5">
                <h4 className="font-display font-semibold text-sm mb-3">Mortgage Calculator</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Property Price</label>
                    <div className="bg-secondary rounded-lg px-3 py-2 text-sm font-semibold mt-1">€{price.toLocaleString()}</div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Down Payment (20%)</label>
                    <div className="bg-secondary rounded-lg px-3 py-2 text-sm mt-1">€{Math.round(price * 0.2).toLocaleString()}</div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Rate (estimated)</label>
                    <div className="bg-secondary rounded-lg px-3 py-2 text-sm mt-1">3.8% p.a.</div>
                  </div>
                  <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
                    <div className="text-xs text-muted-foreground">Est. Monthly Payment</div>
                    <div className="font-display font-bold text-lg text-primary mt-1">€{mortgageMonthly.toLocaleString()}/mo</div>
                    <div className="text-xs text-muted-foreground mt-1">Based on 20yr term</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
      <ViewingDialog
        open={viewingOpen}
        onClose={() => setViewingOpen(false)}
        property={isDbListing ? { id: dbListing.id, title: dbListing.title, city: dbListing.city, ownerId: dbListing.owner_id } : mockProperty}
      />
    </div>
  );
}
