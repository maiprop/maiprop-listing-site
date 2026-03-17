import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Property } from "@/data/properties";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { optimizeImage } from "@/lib/optimizeImage";
import {
  MapPin, Bed, Maximize, TrendingUp, ChevronLeft, ChevronRight,
  ExternalLink, Building, Calendar, LayoutGrid, FileText,
  Plane, Waves, Anchor, TrainFront, Car, GraduationCap,
  ShoppingCart, Cross, Heart, Landmark, TreePine, Loader2,
  ArrowLeft, Share2,
} from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import Navbar from "@/components/Navbar";
import { LeadBotProvider, useLeadBot } from "@/components/LeadBotProvider";
import { useTranslation } from "@/contexts/TranslationContext";
import { lazy, Suspense } from "react";
const LeadCaptureBot = lazy(() => import("@/components/LeadCaptureBot"));

const statusColors: Record<string, string> = {
  available: "bg-primary/20 text-primary border-primary/30",
  booked: "bg-secondary/20 text-secondary border-secondary/30",
  sold: "bg-destructive/20 text-destructive border-destructive/30",
  "under-construction": "bg-muted/30 text-muted-foreground border-muted-foreground/30",
};

const POI_ICONS: Record<string, LucideIcon> = {
  "Airport": Plane, "Sea": Waves, "Ports": Anchor, "Train Stations": TrainFront,
  "Motorway Access": Car, "Schools": GraduationCap, "Supermarket": ShoppingCart,
  "Pharmacies": Cross, "Hospitals": Heart, "Parthenon": Landmark, "Parks": TreePine,
};

interface PoiEntry { name: string; distance: string; }

const BASE_URL = "https://properties.maiprop.co";

/* ─── Before / After Slider ─── */
const BeforeAfterSlider = ({ before, after }: { before: string; after: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    updatePosition(e.clientX);
  }, [updatePosition]);

  const onPointerUp = useCallback(() => { dragging.current = false; }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-[240px] sm:h-[320px] w-full cursor-col-resize select-none overflow-hidden rounded-xl border border-border"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* After (base) */}
      <img src={optimizeImage(after, { width: 1200, height: 675 })} alt="After renovation" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      {/* Before (clipped) */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <img src={optimizeImage(before, { width: 1200, height: 675 })} alt="Before renovation" className="absolute inset-0 h-full w-full object-cover" style={{ width: `${100 / (position / 100)}%` }} draggable={false} />
      </div>
      {/* Divider handle */}
      <div className="absolute inset-y-0 w-0.5 bg-white shadow-lg" style={{ left: `${position}%` }}>
        <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-background shadow-xl">
          <ChevronLeft className="h-3 w-3 text-foreground" />
          <ChevronRight className="h-3 w-3 text-foreground" />
        </div>
      </div>
      {/* Labels */}
      <span className="absolute bottom-2 left-3 rounded-full bg-background/80 px-2 py-0.5 text-xs font-semibold backdrop-blur-sm">Before</span>
      <span className="absolute bottom-2 right-3 rounded-full bg-background/80 px-2 py-0.5 text-xs font-semibold backdrop-blur-sm">After</span>
    </div>
  );
};

const PropertyPageInner = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openWithLocation } = useLeadBot();
  const { t } = useTranslation();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgIdx, setImgIdx] = useState(0);
  const [poiEntries, setPoiEntries] = useState<PoiEntry[] | null>(null);
  const [poiLoading, setPoiLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase.from("properties").select("*").eq("id", id).single().then(({ data, error }) => {
      if (error || !data) { navigate("/", { replace: true }); return; }
      setProperty(data as Property);
      setLoading(false);
    });
  }, [id, navigate]);

  useEffect(() => {
    if (!property?.location) return;
    setPoiLoading(true);
    supabase.functions.invoke("location-poi", {
      body: { location: property.location, property_id: property.id },
    }).then(({ data, error }) => {
      setPoiEntries(error ? null : data?.poi || []);
    }).finally(() => setPoiLoading(false));
  }, [property?.id, property?.location]);

  // Google Ads remarketing — fires once property data is loaded
  useEffect(() => {
    if (!property) return;
    if (typeof window !== "undefined" && (window as any).gtag) {
      // Standard property remarketing
      (window as any).gtag("event", "page_view", {
        send_to: "AW-17031338731",
        value: property.price ?? undefined,
        currency: "EUR",
        items: [{
          id: property.id,
          google_business_vertical: "real_estate",
          location_id: property.location,
        }],
      });

      // Always stamp this property visit in sessionStorage for funnel tracking
      try {
        sessionStorage.setItem("mai_viewed_property", "1");
        sessionStorage.setItem("mai_last_property_id", property.id);
      } catch (_) { /* sessionStorage unavailable */ }

      // High-intent signal: visitor previously read a guide in this session
      // Use this event in Google Ads → Audiences to build a "guide reader → property viewer" segment
      try {
        const guideReads = JSON.parse(sessionStorage.getItem("mai_guide_reads") || "[]");
        const lastGuideCategory = sessionStorage.getItem("mai_last_guide_category") ?? undefined;
        if (guideReads.length > 0) {
          (window as any).gtag("event", "high_intent_investor", {
            send_to: "AW-17031338731",
            property_id: property.id,
            property_location: property.location,
            property_price: property.price ?? undefined,
            prior_guide_reads: guideReads.length,
            prior_guide_category: lastGuideCategory,
          });
        }
      } catch (_) { /* sessionStorage unavailable */ }
    }
  }, [property]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!property) return null;

  const images = property.images.length > 0 ? property.images : ["/placeholder.svg"];
  const currentImg = images[imgIdx % images.length];
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.location + ", Greece")}`;
  const pageUrl = `${BASE_URL}/property/${property.id}/`;
  const { search } = useLocation();
  const isLangVariant = new URLSearchParams(search).has("lang");
  const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const ogShareUrl = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/og-meta?id=${property.id}`;
  const ogImage = images[0] ? optimizeImage(images[0], { width: 1200, height: 630 }) : `${BASE_URL}/og-image.png`;

  const DEFAULT_POI: PoiEntry[] = [
    "Airport", "Sea", "Ports", "Train Stations", "Motorway Access",
    "Schools", "Supermarket", "Pharmacies", "Hospitals", "Parthenon", "Parks",
  ].map((name) => ({ name, distance: "" }));
  const displayPoi = poiEntries ?? DEFAULT_POI;

  const handleShare = async () => {
    const shareData = {
      title: property.title,
      text: `${property.title} — Golden Visa property in ${property.location}, Greece${property.price ? ` · €${property.price.toLocaleString()}` : ""}`,
      url: pageUrl,
    };
    if (navigator.share && navigator.canShare?.(shareData)) {
      try { await navigator.share(shareData); } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(pageUrl);
        toast.success("Link copied!", { description: "Property link copied to clipboard." });
      } catch {
        window.prompt("Copy this link:", pageUrl);
      }
    }
  };

  // Breadcrumb JSON-LD
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": BASE_URL + "/",
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Properties",
        "item": BASE_URL + "/#opportunities",
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": property.title,
        "item": pageUrl,
      },
    ],
  };

  // JSON-LD structured data for this property
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Apartment",
    "@id": `${pageUrl}#apartment`,
    "name": property.title,
    "publisher": { "@id": "https://properties.maiprop.co/#organization" },
    "description": property.description || `${property.title} — Golden Visa eligible property in ${property.location}, Greece.`,
    "url": pageUrl,
    "image": images[0] || ogImage,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": property.location,
      "addressCountry": "GR",
    },
    ...(property.price ? {
      "offers": {
        "@type": "Offer",
        "price": property.price,
        "priceCurrency": "EUR",
        "availability": property.status === "available"
          ? "https://schema.org/InStock"
          : "https://schema.org/SoldOut",
      }
    } : {}),
    ...(property.size ? { "floorSize": { "@type": "QuantitativeValue", "value": property.size, "unitCode": "MTK" } } : {}),
    ...(property.bedrooms ? { "numberOfRooms": property.bedrooms } : {}),
    "amenityFeature": property.tags.filter(Boolean).map((tag) => ({
      "@type": "LocationFeatureSpecification",
      "name": tag,
      "value": true,
    })),
  };

  // Keep title under 60 chars where possible: "Title | Location | mAI Investments"
  const rawTitle = `${property.title} | ${property.location} | mAI Investments`;
  const title = rawTitle.length > 60 ? `${property.title} | mAI Investments` : rawTitle;
  const description = property.description
    ? property.description.slice(0, 155) + (property.description.length > 155 ? "…" : "")
    : `${property.title} — Golden Visa property in ${property.location}, Greece.${property.price ? ` €${property.price.toLocaleString()}.` : ""}${property.size ? ` ${property.size} m².` : ""} EU residency eligible.`;

  const keywords = [
    `Golden Visa ${property.location}`,
    `${property.location} real estate investment`,
    `Greek Golden Visa property`,
    `EU residency ${property.location}`,
    `Greece property investment`,
    ...(property.tags?.filter(Boolean).slice(0, 4) ?? []),
    property.bedrooms ? `${property.bedrooms} bedroom apartment Greece` : null,
  ].filter(Boolean).join(", ");

  const heroSrc = images[0];
  const heroPreloadSrcset = heroSrc
    ? `${heroSrc}?width=480&quality=40&format=webp 480w, ${heroSrc}?width=800&quality=40&format=webp 800w, ${heroSrc}?width=1200&quality=55&format=webp 1200w`
    : null;

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content={keywords} />
        <meta name="robots" content={isLangVariant ? "noindex, follow" : "index, follow"} />
        <link rel="canonical" href={pageUrl} />
        <link rel="alternate" hrefLang="en"        href={pageUrl} />
        <link rel="alternate" hrefLang="en-US"     href={pageUrl} />
        <link rel="alternate" hrefLang="en-GB"     href={pageUrl} />
        <link rel="alternate" hrefLang="el"        href={`${pageUrl}?lang=el`} />
        <link rel="alternate" hrefLang="ar"        href={`${pageUrl}?lang=ar`} />
        <link rel="alternate" hrefLang="ar-AE"     href={`${pageUrl}?lang=ar`} />
        <link rel="alternate" hrefLang="zh"        href={`${pageUrl}?lang=zh`} />
        <link rel="alternate" hrefLang="zh-CN"     href={`${pageUrl}?lang=zh`} />
        <link rel="alternate" hrefLang="ru"        href={`${pageUrl}?lang=ru`} />
        <link rel="alternate" hrefLang="fr"        href={`${pageUrl}?lang=fr`} />
        <link rel="alternate" hrefLang="hi"        href={`${pageUrl}?lang=hi`} />
        <link rel="alternate" hrefLang="he"        href={`${pageUrl}?lang=he`} />
        <link rel="alternate" hrefLang="tr"        href={`${pageUrl}?lang=tr`} />
        <link rel="alternate" hrefLang="x-default" href={pageUrl} />
        {heroPreloadSrcset && (
          <link
            rel="preload"
            as="image"
            type="image/webp"
            imageSrcSet={heroPreloadSrcset}
            imageSizes="100vw"
          />
        )}
        <meta property="og:type" content="product" />
        <meta property="og:site_name" content="mAI Investments" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={`${property.title} — ${property.location}, Greece`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@maiprop" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:image:alt" content={`${property.title} — ${property.location}, Greece`} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": `Is ${property.title} eligible for the Greek Golden Visa?`,
              "acceptedAnswer": {
                "@type": "Answer",
                "text": `Yes. ${property.title} in ${property.location}, Greece is pre-verified and fully compliant with the Greek Golden Visa program. It meets the minimum investment threshold and all legal requirements for EU residency by investment.`,
              },
            },
            {
              "@type": "Question",
              "name": `What is the expected rental yield for ${property.title}?`,
              "acceptedAnswer": {
                "@type": "Answer",
                "text": property.yield
                  ? `${property.title} targets an estimated rental yield of ${property.yield} annually, based on the ${property.location} rental market. Actual yield depends on occupancy rate and management strategy.`
                  : `${property.title} is situated in ${property.location}, a location with strong rental demand. Contact our team for current yield projections specific to this property.`,
              },
            },
            {
              "@type": "Question",
              "name": `Where is ${property.title} located?`,
              "acceptedAnswer": {
                "@type": "Answer",
                "text": `${property.title} is located in ${property.location}, Greece. ${property.location} is a sought-after area for Golden Visa investment, offering strong rental demand and capital appreciation potential within the Greater Athens region.`,
              },
            },
            {
              "@type": "Question",
              "name": "How long does it take to complete a Golden Visa property purchase in Greece?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "The full Golden Visa process typically takes 6–9 months: 1–2 months for property selection and due diligence, 1–2 months for the legal purchase and land registry transfer, 4–6 weeks for the entry visa, and 2–4 months for the biometrics appointment followed by residency permit issuance.",
              },
            },
            {
              "@type": "Question",
              "name": "Can I rent out my Golden Visa property in Greece?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. There is no restriction on renting out your Golden Visa property in Greece. Many investors generate net rental yields of 5–7% annually through short-term or long-term rental arrangements.",
              },
            },
          ],
        }) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": ["Organization", "RealEstateAgent"],
          "@id": "https://properties.maiprop.co/#organization",
          "name": "mAI Investments Properties",
          "alternateName": "mAI Prop",
          "url": "https://properties.maiprop.co",
          "logo": {
            "@type": "ImageObject",
            "url": "https://properties.maiprop.co/images/maiprop-logo.webp",
            "width": 200,
            "height": 60,
          },
          "sameAs": [
            "https://www.facebook.com/maiprop",
            "https://www.linkedin.com/company/maiprop",
            "https://www.instagram.com/maiprop",
          ],
        }) }} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Navbar forceScrolled />
        <main className="container mx-auto max-w-4xl px-4 pt-24 pb-16 sm:pb-16 max-sm:pb-28">
          {/* Back link */}
          <button
            onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign("/#opportunities")}
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> {t("Back to properties")}
          </button>

          {/* Gallery */}
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-border">
            <img
              src={optimizeImage(currentImg, { width: 1200, height: 675 })}
              alt={`${property.title} — Golden Visa property in ${property.location}`}
              className="h-full w-full object-cover"
              loading="eager"
              decoding="async"
            />
            {property.status && (
              <Badge className={`absolute left-4 top-4 border ${statusColors[property.status] || ""}`}>
                {property.status.replace("-", " ")}
              </Badge>
            )}
            {images.length > 1 && (
              <>
                <button onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 backdrop-blur hover:bg-background transition-colors">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button onClick={() => setImgIdx((i) => (i + 1) % images.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 backdrop-blur hover:bg-background transition-colors">
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                  {images.map((_, i) => (
                    <button key={i} onClick={() => setImgIdx(i)}
                      className={`h-1.5 rounded-full transition-all ${i === imgIdx % images.length ? "w-5 bg-primary" : "w-1.5 bg-background/60"}`} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Header */}
          <div className="mt-8">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-3xl font-bold sm:text-4xl">{property.title}</h1>
              <button
                onClick={handleShare}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors mt-1"
                aria-label="Share this property"
                title="Share this property"
              >
                {<Share2 className="h-4 w-4" />}
              </button>
            </div>
            <button onClick={() => window.open(mapsUrl, "_blank")}
              className="mt-2 flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors">
              <MapPin className="h-4 w-4" /> {property.location}, Greece
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>

          <Separator className="my-6 bg-border" />

          {/* Specs */}
          <div className="flex flex-wrap gap-2">
            {property.price && (
              <Badge variant="outline" className="gap-1.5 rounded-full border-border px-4 py-2 text-sm">
                <span className="font-bold text-primary">€{property.price.toLocaleString()}</span>
              </Badge>
            )}
            {property.size && (
              <Badge variant="outline" className="gap-1.5 rounded-full border-border px-4 py-2 text-sm">
                <Maximize className="h-3.5 w-3.5 text-muted-foreground" /> {property.size} m²
              </Badge>
            )}
            {property.bedrooms && (
              <Badge variant="outline" className="gap-1.5 rounded-full border-border px-4 py-2 text-sm">
                <Bed className="h-3.5 w-3.5 text-muted-foreground" /> {property.bedrooms} Bedrooms
              </Badge>
            )}
            {property.floor && (
              <Badge variant="outline" className="gap-1.5 rounded-full border-border px-4 py-2 text-sm">
                <Building className="h-3.5 w-3.5 text-muted-foreground" /> Floor {property.floor}
              </Badge>
            )}
            {property.construction_year && (
              <Badge variant="outline" className="gap-1.5 rounded-full border-border px-4 py-2 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Built {property.construction_year}
              </Badge>
            )}
            {property.yield && (
              <Badge variant="outline" className="gap-1.5 rounded-full border-border px-4 py-2 text-sm">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" /> {property.yield}
              </Badge>
            )}
          </div>

          {/* Description */}
          {property.description && (
            <>
              <Separator className="my-6 bg-border" />
              <p className="leading-relaxed text-muted-foreground">{property.description}</p>
            </>
          )}

          <Separator className="my-8 bg-border" />

          {/* POI */}
          <section aria-label="Points of Interest">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {poiLoading ? "Loading nearby places…" : "Nearby"}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {displayPoi.map((entry) => {
                const Icon = POI_ICONS[entry.name] ?? MapPin;
                return (
                  <div key={entry.name} className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{entry.name}</p>
                      {entry.distance && <p className="text-[11px] text-muted-foreground">{entry.distance}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Tags */}
          {property.tags?.filter(Boolean).length > 0 && (
            <>
              <Separator className="my-8 bg-border" />
              <section aria-label="Property features">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Features</h2>
                <div className="flex flex-wrap gap-2">
                  {property.tags.filter(Boolean).map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1.5 rounded-full px-3 py-1 text-xs">
                      <LayoutGrid className="h-3 w-3" /> {tag}
                    </Badge>
                  ))}
                </div>
              </section>
            </>
          )}

          <Separator className="my-8 bg-border" />

          {/* Before & After Slider */}
          {property.before_image && property.after_image && (
            <>
              <section aria-label="Before and after renovation">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Before &amp; After</h2>
                <BeforeAfterSlider before={property.before_image} after={property.after_image} />
              </section>
              <Separator className="my-8 bg-border" />
            </>
          )}

          {/* Floor Plan */}
          {property.floor_plan && (
            <>
              <section aria-label="Floor plan">
                <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
                      <LayoutGrid className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Floor Plan</h2>
                  </div>
                  <img src={property.floor_plan} alt={`Floor plan of ${property.title}`}
                    className="max-h-[300px] w-full rounded-lg border border-border bg-background object-contain"
                    loading="lazy" decoding="async" />
                </div>
              </section>
              <Separator className="my-8 bg-border" />
            </>
          )}

          {/* Market Report */}
          {property.market_report && (
            <a href={property.market_report} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border-2 border-primary/20 bg-primary/5 p-4 hover:bg-primary/10 transition-colors">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Market Report</p>
                <p className="text-xs text-muted-foreground">Download the full investment analysis PDF</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          )}
        </main>

        <Suspense fallback={null}>
          <LeadCaptureBot />
        </Suspense>
      </div>
    </>
  );
};

const PropertyPage = () => (
  <LeadBotProvider>
    <PropertyPageInner />
  </LeadBotProvider>
);

export default PropertyPage;
