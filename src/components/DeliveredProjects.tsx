import { useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useProperties } from "@/contexts/PropertyContext";
import { CheckCircle, MapPin, Bed, Maximize, TrendingUp, Tag, ExternalLink, ChevronLeft, ChevronRight, Building, Calendar, Share2 } from "lucide-react";
import { toast } from "sonner";
import { optimizeImage } from "@/lib/optimizeImage";
import { Property } from "@/data/properties";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollReveal, RevealItem } from "@/components/ScrollReveal";
import { useTranslation } from "@/contexts/TranslationContext";

const whatsappMessage = [
  "Hello! I would like to explore investment opportunities under the Greek Golden Visa program.",
  "",
  "Please share the following details:",
  "",
  "1. Full Name:",
  "2. Phone (International format):",
  "3. Email:",
  "4. Nationality (Country of citizenship):",
  "5. Investment Budget (in EUR - minimum 250000):",
  "6. Preferred Property Location:",
  "7. Property Type (Apartment or Villa):",
  "8. When are you planning to invest (0-6 months or 6-12 months):",
].join("\n");
const WHATSAPP_URL = `https://wa.me/306971853470?text=${encodeURIComponent(whatsappMessage)}`;

const trackRecord = [
{ value: "€6.3M", label: "Successfully Closed" },
{ value: "19", label: "Projects Delivered" },
{ value: "100%", label: "Visa Success Rate" },
{ value: "6.4%", label: "Avg Portfolio ROI" }];


const DeliveredProjects = () => {
  const { properties } = useProperties();
  const navigate = useNavigate();
  const delivered = properties.filter((p) => p.project_type === "delivered");
  const preview = delivered.slice(0, 3);
  const [selected, setSelected] = useState<Property | null>(null);
  const { t } = useTranslation();

  if (delivered.length === 0) return null;

  return (
    <section id="delivered" className="bg-background py-20">
      <div className="container mx-auto px-6">
        {/* Section heading */}
        <ScrollReveal>
        <div className="mb-16 text-center">
          <Badge className="mb-4 border-primary/30 bg-primary/10 text-primary">
            <CheckCircle className="mr-1 h-3 w-3" /> {t("Track Record")}
          </Badge>
          <h2 className="mb-4 text-3xl font-bold md:text-4xl text-inherit">{t("Successfully Delivered")}</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {t("A proven portfolio of completed projects — renovated, rented, and generating returns.")}
          </p>
        </div>
        </ScrollReveal>

        {/* Property cards — max 3 on homepage */}
        <ScrollReveal variant="stagger">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {preview.map((p) =>
            <RevealItem key={p.id}>
              <div className="group overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                <button
                  onClick={() => setSelected(p)}
                  className="w-full text-left">
                  <div className="relative aspect-video overflow-hidden">
                    <img
                      src={optimizeImage(p.images[0] || p.after_image || "/placeholder.svg", { width: 600, height: 400 })}
                      alt={`${p.title} — delivered Golden Visa property in ${p.location}`}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105 rounded-2xl" />
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
                          title="View full property page"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const shareUrl = `${window.location.origin}/property/${p.id}`;
                            const shareData = { title: p.title, url: shareUrl };
                            if (navigator.share && navigator.canShare?.(shareData)) {
                              try { await navigator.share(shareData); } catch { /* cancelled */ }
                            } else {
                              try {
                                await navigator.clipboard.writeText(shareUrl);
                                toast.success("Link copied!", { description: "Property link copied to clipboard." });
                              } catch {
                                window.prompt("Copy this link:", shareUrl);
                              }
                            }
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
                          aria-label="Share property"
                          title="Share property"
                        >
                          <Share2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </RevealItem>
            )}
          </div>
        </ScrollReveal>

        {/* View all CTA */}
        {delivered.length > 3 && (
          <ScrollReveal>
            <div className="mt-10 text-center">
              <p className="mb-4 text-muted-foreground">
                Showing 3 of {delivered.length} delivered projects
              </p>
              <Button onClick={() => navigate("/portfolio")} size="lg" variant="outline" className="gap-2">
                View Full Portfolio
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </ScrollReveal>
        )}
      </div>

      {/* Delivered Modal */}
      <DeliveredModal property={selected} open={!!selected} onClose={() => setSelected(null)} />
    </section>);

};

interface ModalProps {
  property: Property | null;
  open: boolean;
  onClose: () => void;
}

const DeliveredModal = ({ property, open, onClose }: ModalProps) => {
  const [imgIdx, setImgIdx] = useState(0);

  const handleShare = async () => {
    if (!property) return;
    const shareUrl = `${window.location.origin}/property/${property.id}`;
    const shareData = {
      title: property.title,
      text: `${property.title} — Delivered Golden Visa property in ${property.location}, Greece`,
      url: shareUrl,
    };
    if (navigator.share && navigator.canShare?.(shareData)) {
      try { await navigator.share(shareData); } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied!", { description: "Property link copied to clipboard." });
      } catch {
        window.prompt("Copy this link:", shareUrl);
      }
    }
  };

  if (!property) return null;

  const hasBeforeAfter = property.before_image && property.after_image;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.location + ", Greece")}`;
  const allPhotos = [
  ...property.images,
  ...(property.after_image ? [property.after_image] : [])].
  filter(Boolean);
  const hasPhotos = allPhotos.length > 0;

  return (
    <Dialog open={open} onOpenChange={() => {onClose();setImgIdx(0);}}>
      <DialogContent className="max-h-[95vh] max-w-5xl overflow-y-auto border-border bg-card p-0 w-[95vw] sm:w-auto">
        {/* Scrollable Photo Gallery */}
        {hasPhotos &&
        <div className="relative h-[300px] sm:h-[520px] w-full overflow-hidden">
            <img src={optimizeImage(allPhotos[imgIdx % allPhotos.length], { width: 900, height: 600 })} alt={`${property.title} — delivered Golden Visa property in ${property.location}, Greece`} className="h-full w-full object-cover" />
            {allPhotos.length > 1 &&
          <>
                <button
              onClick={() => setImgIdx((i) => (i - 1 + allPhotos.length) % allPhotos.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 backdrop-blur transition-colors hover:bg-background">

                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
              onClick={() => setImgIdx((i) => (i + 1) % allPhotos.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 backdrop-blur transition-colors hover:bg-background">

                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/70 px-3 py-1 text-xs backdrop-blur">
                  {imgIdx % allPhotos.length + 1} / {allPhotos.length}
                </div>
              </>
          }
            {/* Thumbnail strip */}
            {allPhotos.length > 1 &&
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-1.5">
                {allPhotos.map((src, i) =>
            <button
              key={i}
              onClick={() => setImgIdx(i)}
              className={`h-10 w-14 overflow-hidden rounded border-2 transition-all ${i === imgIdx % allPhotos.length ? "border-primary shadow-lg" : "border-transparent opacity-60 hover:opacity-100"}`}>

                    <img src={optimizeImage(src, { width: 120, height: 80 })} alt="" className="h-full w-full object-cover" />
                  </button>
            )}
              </div>
          }
          </div>
        }

        <div className="space-y-3 p-4">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-xl">{property.title}</DialogTitle>
              <button
                onClick={handleShare}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
                aria-label="Share property"
                title="Share property"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              onClick={() => window.open(mapsUrl, "_blank")}
              className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary">
              <MapPin className="h-4 w-4" /> {property.location}
              <ExternalLink className="h-3 w-3" />
            </button>
          </DialogHeader>

          {/* Tags */}
          {property.tags && property.tags.length > 0 &&
          <div className="flex flex-wrap items-center gap-2">
              <Tag className="h-4 w-4 text-secondary" />
              {property.tags.map((tag) =>
            <Badge key={tag} className="border-secondary/30 bg-secondary/15 text-secondary">
                  {tag}
                </Badge>
            )}
            </div>
          }

          <p className="text-sm text-muted-foreground">{property.description}</p>

          {/* Property Specs as pills */}
          <div className="flex flex-wrap gap-2">
            {property.price &&
            <Badge variant="outline" className="gap-1.5 rounded-full border-border px-3 py-1.5 text-sm">
                <span className="text-primary font-semibold">€{property.price.toLocaleString()}</span>
              </Badge>
            }
            {property.size &&
            <Badge variant="outline" className="gap-1.5 rounded-full border-border px-3 py-1.5 text-sm">
                <Maximize className="h-3.5 w-3.5 text-muted-foreground" /> {property.size} m²
              </Badge>
            }
            {property.bedrooms &&
            <Badge variant="outline" className="gap-1.5 rounded-full border-border px-3 py-1.5 text-sm">
                <Bed className="h-3.5 w-3.5 text-muted-foreground" /> {property.bedrooms} BR
              </Badge>
            }
            {property.floor &&
            <Badge variant="outline" className="gap-1.5 rounded-full border-border px-3 py-1.5 text-sm">
                <Building className="h-3.5 w-3.5 text-muted-foreground" /> Floor {property.floor}
              </Badge>
            }
            {property.construction_year &&
            <Badge variant="outline" className="gap-1.5 rounded-full border-border px-3 py-1.5 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Built {property.construction_year}
              </Badge>
            }
            {property.yield &&
            <Badge variant="outline" className="gap-1.5 rounded-full border-border px-3 py-1.5 text-sm">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" /> {property.yield}
              </Badge>
            }
          </div>

          {/* Before & After Slider */}
          {hasBeforeAfter &&
          <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Before & After</h4>
              <BeforeAfterSlider before={property.before_image!} after={property.after_image!} />
            </div>
          }

        </div>
      </DialogContent>
    </Dialog>);

};

/* ─── Before / After Slider ─── */
const BeforeAfterSlider = ({ before, after }: {before: string;after: string;}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition(x / rect.width * 100);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    updatePosition(e.clientX);
  }, [updatePosition]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-[240px] sm:h-[300px] w-full cursor-col-resize select-none overflow-hidden rounded-lg border border-border"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}>

      {/* After (full background) */}
      <img src={optimizeImage(after, { width: 800, height: 400 })} alt="After renovation — Golden Visa property investment result" className="absolute inset-0 h-full w-full object-cover" />

      {/* Before (clipped) */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <img src={optimizeImage(before, { width: 800, height: 400 })} alt="Before renovation — original property condition" className="h-full w-full object-cover grayscale-[40%]" style={{ width: containerRef.current?.offsetWidth ?? '100%' }} />
      </div>

      {/* Divider line + handle */}
      <div className="absolute top-0 bottom-0 z-10 w-0.5 bg-primary" style={{ left: `${position}%` }}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary bg-card shadow-lg">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-primary">
            <path d="M6 10L2 10M2 10L4.5 7.5M2 10L4.5 12.5M14 10L18 10M18 10L15.5 7.5M18 10L15.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <span className="absolute bottom-2 left-2 z-20 rounded-full bg-destructive/80 px-3 py-1 text-xs font-semibold text-destructive-foreground backdrop-blur">
        Before
      </span>
      <span className="absolute bottom-2 right-2 z-20 rounded-full bg-primary/80 px-3 py-1 text-xs font-semibold text-primary-foreground backdrop-blur">
        After
      </span>
    </div>);

};

export default DeliveredProjects;