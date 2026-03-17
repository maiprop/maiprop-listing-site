import { Property } from "@/data/properties";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, MessageCircle, ExternalLink, Share2 } from "lucide-react";
import { useLeadBot } from "@/components/LeadBotProvider";
import { optimizeImage } from "@/lib/optimizeImage";
import { Link } from "react-router-dom";
import { toast } from "sonner";

interface Props {
  property: Property;
  onClick: () => void;
}

const statusColors: Record<string, string> = {
  available: "bg-primary/20 text-primary border-primary/30",
  booked: "bg-secondary/20 text-secondary border-secondary/30",
  sold: "bg-destructive/20 text-destructive border-destructive/30",
  "under-construction": "bg-muted/30 text-muted-foreground border-muted-foreground/30",
};

const PropertyCard = ({ property, onClick }: Props) => {
  const { openWithLocation } = useLeadBot();

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/property/${property.id}`;
    const shareData = {
      title: property.title,
      text: `${property.title} — Golden Visa property in ${property.location}, Greece${property.price ? ` · €${property.price.toLocaleString()}` : ""}`,
      url: shareUrl,
    };
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
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/60 bg-card text-left transition-all duration-500 hover:border-primary/50 hover:shadow-[0_0_40px_hsl(179_90%_63%/0.15),0_0_80px_hsl(179_90%_63%/0.05)] hover:-translate-y-1">
      <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <button onClick={onClick} className="w-full text-left">
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={optimizeImage(property.images[0] || "/placeholder.svg", { width: 600, height: 450 })}
            alt={`${property.title} — Golden Visa property in ${property.location}`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
          {property.status && (
            <Badge className={`absolute right-3 top-3 border ${statusColors[property.status] || ""}`}>
              {property.status.replace("-", " ")}
            </Badge>
          )}
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5">
            {property.size && (
              <Badge variant="outline" className="border-background/30 bg-background/70 px-2 py-0.5 text-xs backdrop-blur">
                {property.size} m²
              </Badge>
            )}
            {property.bedrooms && (
              <Badge variant="outline" className="border-background/30 bg-background/70 px-2 py-0.5 text-xs backdrop-blur">
                {property.bedrooms} BR
              </Badge>
            )}
            {property.floor && (
              <Badge variant="outline" className="border-background/30 bg-background/70 px-2 py-0.5 text-xs backdrop-blur">
                Floor {property.floor}
              </Badge>
            )}
            {property.construction_year && (
              <Badge variant="outline" className="border-background/30 bg-background/70 px-2 py-0.5 text-xs backdrop-blur">
                {property.construction_year}
              </Badge>
            )}
          </div>
        </div>
        <div className="p-5">
          <Link
            to={`/property/${property.id}`}
            onClick={(e) => e.stopPropagation()}
            className="hover:text-primary transition-colors"
          >
            <h3 className="text-lg font-semibold">{property.title}</h3>
          </Link>
          <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {property.location}
          </div>
          <div className="mt-3 flex items-end justify-between">
            <p className="text-xl font-bold text-primary">
              {property.price ? `€${property.price.toLocaleString()}` : "Price TBD"}
            </p>
          </div>
        </div>
      </button>
      <div className="flex gap-2 px-5 pb-4">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 gap-2 rounded-full border-primary/30 text-primary hover:bg-primary/10"
          onClick={(e) => {
            e.stopPropagation();
            openWithLocation(property.location);
          }}
        >
          <MessageCircle className="h-4 w-4" /> Inquire
        </Button>
        <Link
          to={`/property/${property.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
          aria-label="View property page"
          title="View full property page"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        <button
          onClick={handleShare}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
          aria-label="Share property"
          title="Share this property"
        >
          <Share2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default PropertyCard;
