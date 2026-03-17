import { lazy, Suspense, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Navbar from "@/components/Navbar";
import { useProperties } from "@/contexts/PropertyContext";
import {
  CheckCircle, MapPin, Bed, Maximize, TrendingUp, Tag,
  ExternalLink, ChevronLeft, ChevronRight, Building,
  Calendar, Share2, MessageCircle, Home as HomeIcon,
} from "lucide-react";
import { toast } from "sonner";
import { optimizeImage } from "@/lib/optimizeImage";
import { Property } from "@/data/properties";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollReveal, RevealItem } from "@/components/ScrollReveal";
import { LeadBotProvider, useLeadBot } from "@/components/LeadBotProvider";
import { useTranslation } from "@/contexts/TranslationContext";

const LeadCaptureBot = lazy(() => import("@/components/LeadCaptureBot"));

const BASE_URL = "https://properties.maiprop.co";

const Inner = () => {
  const { properties } = useProperties();
  const delivered = properties.filter((p) => p.project_type === "delivered");
  const [selected, setSelected] = useState<Property | null>(null);
  const { setIsOpen } = useLeadBot();
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>Golden Visa Portfolio & Track Record — 19+ Delivered Properties | mAI Investments</title>
        <meta name="description" content="19+ successfully delivered Golden Visa properties in Athens. €6.3M invested, 100% visa success rate, 6.4% average ROI. Browse our full track record." />
        <meta name="keywords" content="Golden Visa track record, Greece property portfolio, mAI Investments delivered properties, Athens Golden Visa investment results, Greek real estate ROI, Golden Visa success rate" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={`${BASE_URL}/trackrecord/`} />
        <link rel="alternate" hrefLang="en"        href={`${BASE_URL}/trackrecord/`} />
        <link rel="alternate" hrefLang="en-US"     href={`${BASE_URL}/trackrecord/`} />
        <link rel="alternate" hrefLang="en-GB"     href={`${BASE_URL}/trackrecord/`} />
        <link rel="alternate" hrefLang="el"        href={`${BASE_URL}/trackrecord/?lang=el`} />
        <link rel="alternate" hrefLang="ar"        href={`${BASE_URL}/trackrecord/?lang=ar`} />
        <link rel="alternate" hrefLang="zh"        href={`${BASE_URL}/trackrecord/?lang=zh`} />
        <link rel="alternate" hrefLang="ru"        href={`${BASE_URL}/trackrecord/?lang=ru`} />
        <link rel="alternate" hrefLang="fr"        href={`${BASE_URL}/trackrecord/?lang=fr`} />
        <link rel="alternate" hrefLang="hi"        href={`${BASE_URL}/trackrecord/?lang=hi`} />
        <link rel="alternate" hrefLang="he"        href={`${BASE_URL}/trackrecord/?lang=he`} />
        <link rel="alternate" hrefLang="tr"        href={`${BASE_URL}/trackrecord/?lang=tr`} />
        <link rel="alternate" hrefLang="x-default" href={`${BASE_URL}/trackrecord/`} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${BASE_URL}/trackrecord/`} />
        <meta property="og:title" content="Golden Visa Portfolio & Track Record — 19+ Delivered Properties | mAI Investments" />
        <meta property="og:description" content="19+ successfully delivered Golden Visa properties in Athens. €6.3M closed, 100% visa success rate, 6.4% average ROI." />
        <meta property="og:image" content={`${BASE_URL}/og-image.png`} />
        <meta property="og:image:alt" content="mAI Investments delivered Golden Visa property portfolio in Athens, Greece" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": `${BASE_URL}/` },
            { "@type": "ListItem", "position": 2, "name": "Golden Visa Portfolio & Track Record", "item": `${BASE_URL}/trackrecord/` },
          ]
        }) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "@id": `${BASE_URL}/trackrecord/#collectionpage`,
          "name": "Golden Visa Portfolio & Track Record",
          "description": "19+ successfully delivered Golden Visa properties in Athens. €6.3M invested, 100% visa success rate, 6.4% average ROI.",
          "url": `${BASE_URL}/trackrecord/`,
          "isPartOf": { "@id": `${BASE_URL}/#website` },
          "publisher": { "@id": "https://properties.maiprop.co/#organization" },
          "inLanguage": "en",
          "about": {
            "@type": "Thing",
            "name": "Greek Golden Visa Delivered Properties"
          }
        }) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "How many Golden Visa properties has mAI Investments delivered?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "mAI Investments has successfully delivered 19+ Golden Visa properties in Athens, with €6.3M in total investment value closed. Every investor in our portfolio holds an active Greek Golden Visa with a 100% success rate."
              }
            },
            {
              "@type": "Question",
              "name": "What is the average rental yield on delivered mAI Investments properties?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Delivered properties achieve an average rental yield of 6.4% per year through managed short-term rentals. Properties are fully renovated, furnished, and listed on platforms like Airbnb before investor handover."
              }
            },
            {
              "@type": "Question",
              "name": "Were there any delays in the delivered projects?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "No. Every project in the mAI Investments track record was delivered on schedule, with no renovation delays or visa rejections. Our in-house project management team oversees each property from acquisition through to rental launch."
              }
            },
            {
              "@type": "Question",
              "name": "Can I see documentation for delivered properties?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. Verified investors can request the full documentation package for any delivered project — including before/after photos, renovation invoices, rental income statements, and Golden Visa approval letters. Contact us to arrange access."
              }
            },
            {
              "@type": "Question",
              "name": "How is the track record verified?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Every project listed in the track record has been legally completed with Greek notary-authenticated title deeds, supported by licensed architect renovation permits and verified Golden Visa approval certificates from the Greek Ministry of Migration."
              }
            }
          ]
        }) }} />
      </Helmet>

      <main className="min-h-screen bg-background">
        <Navbar forceScrolled />

        {/* Breadcrumb */}
        <nav className="mt-[64px] border-b border-border/40 bg-background/80 backdrop-blur-sm" aria-label="Breadcrumb">
          <div className="container mx-auto px-6 py-4">
            <ol className="flex items-center gap-2 text-xs text-muted-foreground" itemScope itemType="https://schema.org/BreadcrumbList">
              <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                <Link to="/" className="hover:text-primary transition-colors" itemProp="item">
                  <span itemProp="name">Home</span>
                </Link>
                <meta itemProp="position" content="1" />
              </li>
              <li className="text-muted-foreground/50 select-none">›</li>
              <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                <span className="text-foreground font-medium" itemProp="name">Track Record</span>
                <meta itemProp="position" content="2" />
              </li>
            </ol>
          </div>
        </nav>

        {/* Hero */}
        <section className="bg-background pt-12 pb-16">
          <div className="container mx-auto px-6 text-center">
            <ScrollReveal>
              <Badge className="mb-4 border-primary/30 bg-primary/10 text-primary">
                <CheckCircle className="mr-1 h-3 w-3" /> Track Record
              </Badge>
              <h1 className="mb-4 text-4xl font-bold md:text-5xl">
                {t("Golden Visa Portfolio & Track Record")}
              </h1>
              <p className="mx-auto max-w-2xl text-muted-foreground text-lg">
                {t("Every project below has been sourced, renovated, tenanted, and delivered to investors who hold an active Greek Golden Visa. No delays, no surprises.")}
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* Full grid */}
        <section className="py-20">
          <div className="container mx-auto px-6">
            {delivered.length === 0 ? (
              <p className="text-center text-muted-foreground">No delivered projects yet.</p>
            ) : (
              <ScrollReveal variant="stagger">
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {delivered.map((p) => (
                    <RevealItem key={p.id}>
                      <div className="group overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                        <button onClick={() => setSelected(p)} className="w-full text-left">
                          <div className="relative aspect-video overflow-hidden">
                            <img
                              src={optimizeImage(p.images[0] || p.after_image || "/placeholder.svg", { width: 600, height: 400 })}
                              alt={`${p.title} — delivered Golden Visa property in ${p.location}`}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform group-hover:scale-105 rounded-t-xl"
                            />
                            <Badge className="absolute right-3 top-3 border-none bg-primary/90 text-primary-foreground">
                              Delivered
                            </Badge>
                          </div>
                          <div className="p-4 pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="font-semibold leading-snug">{p.title}</h3>
                                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                                  <MapPin className="h-3 w-3" /> {p.location}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <Link
                                  to={`/property/${p.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
                                  aria-label="View full property page"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const shareUrl = `${window.location.origin}/property/${p.id}`;
                                    try {
                                      await navigator.clipboard.writeText(shareUrl);
                                      toast.success("Link copied!");
                                    } catch {
                                      window.prompt("Copy this link:", shareUrl);
                                    }
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
                                  aria-label="Share property"
                                >
                                  <Share2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </button>
                      </div>
                    </RevealItem>
                  ))}
                </div>
              </ScrollReveal>
            )}

            {/* CTA */}
            <ScrollReveal>
              <div className="mt-16 rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center">
                <h2 className="mb-2 text-2xl font-bold">{t("Looking for something similar?")}</h2>
                <p className="mb-6 text-muted-foreground">
                  {t("Contact us today and we'll match you with a Golden Visa property that fits your goals.")}
                </p>
                <Button size="lg" className="gap-2" onClick={() => setIsOpen(true)}>
                  <MessageCircle className="h-4 w-4" />
                  {t("Contact Us")}
                </Button>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </main>

      <DeliveredModal property={selected} open={!!selected} onClose={() => setSelected(null)} />
      <Suspense fallback={null}>
        <LeadCaptureBot />
      </Suspense>
    </>
  );
};

/* ─── Modal ─── */
interface ModalProps { property: Property | null; open: boolean; onClose: () => void; }

const DeliveredModal = ({ property, open, onClose }: ModalProps) => {
  const [imgIdx, setImgIdx] = useState(0);

  const handleShare = async () => {
    if (!property) return;
    const shareUrl = `${window.location.origin}/property/${property.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied!");
    } catch {
      window.prompt("Copy this link:", shareUrl);
    }
  };

  if (!property) return null;
  const hasBeforeAfter = property.before_image && property.after_image;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.location + ", Greece")}`;
  const allPhotos = [...property.images, ...(property.after_image ? [property.after_image] : [])].filter(Boolean);
  const hasPhotos = allPhotos.length > 0;

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); setImgIdx(0); }}>
      <DialogContent className="max-h-[95vh] max-w-5xl overflow-y-auto border-border bg-card p-0 w-[95vw] sm:w-auto">
        {hasPhotos && (
          <div className="relative h-[300px] sm:h-[520px] w-full overflow-hidden">
            <img src={optimizeImage(allPhotos[imgIdx % allPhotos.length], { width: 900, height: 600 })} alt={`${property.title} — delivered Golden Visa property in ${property.location}, Athens Greece`} className="h-full w-full object-cover" />
            {allPhotos.length > 1 && (
              <>
                <button onClick={() => setImgIdx((i) => (i - 1 + allPhotos.length) % allPhotos.length)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 backdrop-blur hover:bg-background">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button onClick={() => setImgIdx((i) => (i + 1) % allPhotos.length)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 backdrop-blur hover:bg-background">
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/70 px-3 py-1 text-xs backdrop-blur">
                  {imgIdx % allPhotos.length + 1} / {allPhotos.length}
                </div>
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {allPhotos.map((src, i) => (
                    <button key={i} onClick={() => setImgIdx(i)} className={`h-10 w-14 overflow-hidden rounded border-2 transition-all ${i === imgIdx % allPhotos.length ? "border-primary shadow-lg" : "border-transparent opacity-60 hover:opacity-100"}`}>
                      <img src={optimizeImage(src, { width: 120, height: 80 })} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <div className="space-y-3 p-4">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-xl">{property.title}</DialogTitle>
              <button onClick={handleShare} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors" aria-label="Share property">
                <Share2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <button onClick={() => window.open(mapsUrl, "_blank")} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
              <MapPin className="h-4 w-4" /> {property.location} <ExternalLink className="h-3 w-3" />
            </button>
          </DialogHeader>
          {property.tags?.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="h-4 w-4 text-secondary" />
              {property.tags.map((tag) => (
                <Badge key={tag} className="border-secondary/30 bg-secondary/15 text-secondary">{tag}</Badge>
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground">{property.description}</p>
          <div className="flex flex-wrap gap-2">
            {property.price && <Badge variant="outline" className="gap-1.5 rounded-full border-border px-3 py-1.5 text-sm"><span className="text-primary font-semibold">€{property.price.toLocaleString()}</span></Badge>}
            {property.size && <Badge variant="outline" className="gap-1.5 rounded-full border-border px-3 py-1.5 text-sm"><Maximize className="h-3.5 w-3.5 text-muted-foreground" /> {property.size} m²</Badge>}
            {property.bedrooms && <Badge variant="outline" className="gap-1.5 rounded-full border-border px-3 py-1.5 text-sm"><Bed className="h-3.5 w-3.5 text-muted-foreground" /> {property.bedrooms} BR</Badge>}
            {property.floor && <Badge variant="outline" className="gap-1.5 rounded-full border-border px-3 py-1.5 text-sm"><Building className="h-3.5 w-3.5 text-muted-foreground" /> Floor {property.floor}</Badge>}
            {property.construction_year && <Badge variant="outline" className="gap-1.5 rounded-full border-border px-3 py-1.5 text-sm"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Built {property.construction_year}</Badge>}
            {property.yield && <Badge variant="outline" className="gap-1.5 rounded-full border-border px-3 py-1.5 text-sm"><TrendingUp className="h-3.5 w-3.5 text-muted-foreground" /> {property.yield}</Badge>}
          </div>
          {hasBeforeAfter && (
            <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Before & After</h4>
              <BeforeAfterSlider before={property.before_image!} after={property.after_image!} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const BeforeAfterSlider = ({ before, after }: { before: string; after: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const dragging = useRef(false);
  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(Math.max(0, Math.min(clientX - rect.left, rect.width)) / rect.width * 100);
  }, []);
  return (
    <div ref={containerRef} className="relative h-[240px] sm:h-[300px] w-full cursor-col-resize select-none overflow-hidden rounded-lg border border-border"
      onPointerDown={(e) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); updatePosition(e.clientX); }}
      onPointerMove={(e) => { if (dragging.current) updatePosition(e.clientX); }}
      onPointerUp={() => { dragging.current = false; }}>
      <img src={optimizeImage(after, { width: 800, height: 400 })} alt="After renovation — completed Golden Visa investment property in Greece" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <img src={optimizeImage(before, { width: 800, height: 400 })} alt="Before renovation — original condition of Greek real estate investment property" className="h-full w-full object-cover grayscale-[40%]" style={{ width: containerRef.current?.offsetWidth ?? "100%" }} />
      </div>
      <div className="absolute top-0 bottom-0 z-10 w-0.5 bg-primary" style={{ left: `${position}%` }}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary bg-card shadow-lg">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-primary">
            <path d="M6 10L2 10M2 10L4.5 7.5M2 10L4.5 12.5M14 10L18 10M18 10L15.5 7.5M18 10L15.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <span className="absolute bottom-2 left-2 z-20 rounded-full bg-destructive/80 px-3 py-1 text-xs font-semibold text-destructive-foreground backdrop-blur">Before</span>
      <span className="absolute bottom-2 right-2 z-20 rounded-full bg-primary/80 px-3 py-1 text-xs font-semibold text-primary-foreground backdrop-blur">After</span>
    </div>
  );
};

const Portfolio = () => (
  <LeadBotProvider>
    <Inner />
  </LeadBotProvider>
);

export default Portfolio;
