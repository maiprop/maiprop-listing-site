import { useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Heart, Share2 } from "lucide-react";

export function PropertyGallery({
  images,
  isFavorited,
  onFavorite,
  onShare,
}: {
  images: string[];
  isFavorited: boolean;
  onFavorite: () => void;
  onShare: () => void;
}) {
  const [idx, setIdx] = useState(0);
  if (!images.length) {
    return (
      <div className="aspect-[16/9] bg-muted rounded-2xl flex items-center justify-center">
        <Building2 className="w-16 h-16 text-muted-foreground/40" />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="relative rounded-2xl overflow-hidden aspect-[16/9] bg-muted group shadow-elevated">
        <img src={images[idx]} alt="" className="w-full h-full object-cover transition-opacity duration-300" />
        <div className="absolute top-4 left-4">
          <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-full">
            <Building2 className="w-3.5 h-3.5" /> New Build
          </span>
        </div>
        {images.length > 1 && (
          <>
            <button
              onClick={() => setIdx(i => (i - 1 + images.length) % images.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 transition-all shadow-lg opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
              aria-label="Previous photo"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIdx(i => (i + 1) % images.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 transition-all shadow-lg opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
              aria-label="Next photo"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full backdrop-blur-md shadow transition-all ${isFavorited ? "bg-destructive text-white" : "bg-background/70 hover:bg-background/90"}`}
            onClick={onFavorite}
            aria-label={isFavorited ? "Remove from saved" : "Save property"}
          >
            <Heart className={`w-4 h-4 ${isFavorited ? "fill-white" : ""}`} />
          </button>
          <button
            onClick={onShare}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 shadow transition-all"
            aria-label="Share property"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
        {images.length > 1 && (
          <>
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
            <div className="absolute bottom-3 right-4 bg-background/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs font-medium">
              {idx + 1} / {images.length}
            </div>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`View photo ${i + 1} of ${images.length}`}
              aria-current={idx === i ? "true" : undefined}
              className={`shrink-0 min-h-[44px] min-w-[44px] w-16 h-11 rounded-lg overflow-hidden transition-all duration-200 ${
                idx === i ? "ring-2 ring-primary ring-offset-2 ring-offset-background opacity-100" : "opacity-50 hover:opacity-80"
              }`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
