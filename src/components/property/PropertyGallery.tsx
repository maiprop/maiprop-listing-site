import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Heart, Share2, Eye, ChevronLeft, ChevronRight, Gavel, Maximize2, X } from "lucide-react";
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { isMaiPropLogoFallback, switchImageToNextFallback } from "@/lib/imageFallbacks";

interface PropertyGalleryProps {
  images: string[];
  listingType: string;
  isFavorited: boolean;
  onFavorite: () => void;
  onShare: () => void;
  viewsCount: number;
  title: string;
}

export default function PropertyGallery({
  images, listingType, isFavorited, onFavorite, onShare, viewsCount, title,
}: PropertyGalleryProps) {
  const [currentImage, setCurrentImage] = useState(0);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const currentSrc = images[currentImage] || images[0];
  const hasImages = images.length > 0;

  const showPreviousImage = () => {
    if (images.length <= 1) return;
    setCurrentImage((index) => (index - 1 + images.length) % images.length);
  };

  const showNextImage = () => {
    if (images.length <= 1) return;
    setCurrentImage((index) => (index + 1) % images.length);
  };

  return (
    <>
      {/* Main gallery image */}
      <div className="relative rounded-2xl overflow-hidden aspect-[16/9] bg-secondary group shadow-elevated">
        {hasImages ? (
          <button
            type="button"
            onClick={() => setIsFullscreenOpen(true)}
            aria-label="Open full-screen photo viewer"
            className="block h-full w-full cursor-zoom-in"
          >
            <img
              src={currentSrc}
              alt={title}
              data-image-fallback-index={String(currentImage)}
              className={`w-full h-full transition-opacity duration-300 ${
                isMaiPropLogoFallback(currentSrc) ? "object-contain p-8 bg-background" : "object-cover"
              }`}
              onError={(event) => switchImageToNextFallback(event.currentTarget, images)}
            />
          </button>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-secondary">
            <Gavel className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No photos available for this auction</p>
          </div>
        )}

        {/* Type badges */}
        <div className="absolute top-4 left-4 flex gap-2">
          {listingType === "auction" && (
            <span className="badge-auction text-xs font-bold px-3 py-1.5 rounded-full shadow">AUCTION</span>
          )}
          {listingType === "firesale" && (
            <span className="badge-firesale text-xs font-bold px-3 py-1.5 rounded-full shadow">Quick Sale™</span>
          )}
          {listingType === "rent" && (
            <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-full shadow">FOR RENT</span>
          )}
        </div>

        {/* Nav arrows */}
        {images.length > 1 && (
          <>
            <button
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 transition-all shadow-lg opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
              onClick={showPreviousImage}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              aria-label="Next photo"
              className="absolute right-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 transition-all shadow-lg opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
              onClick={showNextImage}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Top-right actions — 44px touch targets */}
        <div className="absolute top-4 right-4 flex gap-2">
          {hasImages && (
            <button
              type="button"
              onClick={() => setIsFullscreenOpen(true)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 shadow transition-all"
              aria-label="View photos fullscreen">
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
          <button
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full backdrop-blur-md shadow transition-all ${
              isFavorited ? "bg-destructive text-white" : "bg-background/70 hover:bg-background/90"
            }`}
            onClick={onFavorite}
            aria-label={isFavorited ? "Remove from saved" : "Save property"}>
            <Heart className={`w-4 h-4 ${isFavorited ? "fill-white" : ""}`} />
          </button>
          <button
            onClick={onShare}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-background/70 backdrop-blur-md hover:bg-background/90 shadow transition-all"
            aria-label="Share property">
            <Share2 className="w-4 h-4" />
          </button>
        </div>

        {/* Counter + views */}
        {images.length > 0 && (
          <>
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
            <div className="absolute bottom-3 right-4 bg-background/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs font-medium">
              {currentImage + 1} / {images.length}
            </div>
            <div className="absolute bottom-3 left-4 flex items-center gap-1.5 bg-background/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs">
              <Eye className="w-3 h-3 text-muted-foreground" />
              <span>{viewsCount} views</span>
            </div>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setCurrentImage(i)}
              aria-label={`View photo ${i + 1} of ${images.length}`}
              aria-current={currentImage === i ? "true" : undefined}
              className={`shrink-0 min-h-[44px] min-w-[44px] w-16 h-11 rounded-lg overflow-hidden transition-all duration-200 ${
                currentImage === i
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background opacity-100"
                  : "opacity-50 hover:opacity-80"
              }`}>
              <img
                src={img}
                alt=""
                data-image-fallback-index={String(i)}
                className={`w-full h-full ${isMaiPropLogoFallback(img) ? "object-contain p-2 bg-background" : "object-cover"}`}
                onError={(event) => switchImageToNextFallback(event.currentTarget, images)}
              />
            </button>
          ))}
        </div>
      )}

      <Dialog open={isFullscreenOpen && hasImages} onOpenChange={setIsFullscreenOpen}>
        <DialogPortal>
          <DialogOverlay className="z-[200] bg-black/95" />
          <DialogPrimitive.Content className="fixed inset-0 z-[201] grid h-[100dvh] w-screen grid-rows-[auto_minmax(0,1fr)_auto] gap-0 bg-black p-0 text-white outline-none">
            <div className="flex min-w-0 items-center justify-between gap-12 px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <DialogTitle className="truncate text-sm font-semibold text-white">
                  Full-screen photo viewer
                </DialogTitle>
                <p className="text-xs text-white/70">
                  {currentImage + 1} / {images.length}
                </p>
              </div>
              <DialogClose
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </DialogClose>
            </div>

            <div className="relative min-h-0 px-3 py-4 sm:px-6">
              <div className="flex h-full w-full items-center justify-center">
                <img
                  src={currentSrc}
                  alt={`${title} photo ${currentImage + 1} of ${images.length}`}
                  data-image-fallback-index={String(currentImage)}
                  className={`max-h-full max-w-full ${
                    isMaiPropLogoFallback(currentSrc) ? "object-contain p-8 bg-background" : "object-contain"
                  }`}
                  onError={(event) => switchImageToNextFallback(event.currentTarget, images)}
                />
              </div>

              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous full-screen photo"
                    className="absolute left-3 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6"
                    onClick={showPreviousImage}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next full-screen photo"
                    className="absolute right-3 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
                    onClick={showNextImage}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto px-4 pb-4 pt-2 sm:justify-center sm:px-6">
                {images.map((img, i) => (
                  <button
                    key={`${img}-${i}`}
                    type="button"
                    onClick={() => setCurrentImage(i)}
                    aria-label={`Open full-screen photo ${i + 1} of ${images.length}`}
                    aria-current={currentImage === i ? "true" : undefined}
                    className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border transition-opacity ${
                      currentImage === i ? "border-white opacity-100" : "border-white/30 opacity-60 hover:opacity-90"
                    }`}
                  >
                    <img
                      src={img}
                      alt=""
                      data-image-fallback-index={String(i)}
                      className={`h-full w-full ${isMaiPropLogoFallback(img) ? "object-contain p-2 bg-background" : "object-cover"}`}
                      onError={(event) => switchImageToNextFallback(event.currentTarget, images)}
                    />
                  </button>
                ))}
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </>
  );
}
