import { useRef } from "react";
import { Star, GripVertical, X, Loader2 } from "lucide-react";
import type { UploadedImage } from "@/types";

export function ImageGallery({
  images,
  coverImageId,
  onSetCover,
  onRemove,
  onReorder,
}: {
  images: UploadedImage[];
  coverImageId: string | null;
  onSetCover: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const dragIdx = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);

  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragOverIdx.current = idx;
  };
  const handleDrop = () => {
    if (dragIdx.current !== null && dragOverIdx.current !== null && dragIdx.current !== dragOverIdx.current) {
      onReorder(dragIdx.current, dragOverIdx.current);
    }
    dragIdx.current = null;
    dragOverIdx.current = null;
  };

  if (images.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
      {images.map((img, idx) => {
        const isCover = img.id === coverImageId;
        return (
          <div
            key={img.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={e => handleDragOver(e, idx)}
            onDrop={handleDrop}
            className={`relative group rounded-xl overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing ${
              isCover ? "border-primary shadow-lg shadow-primary/20" : "border-border hover:border-primary/40"
            }`}
          >
            <div className="aspect-[4/3] bg-secondary">
              {img.uploading ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : img.error ? (
                <div className="w-full h-full flex items-center justify-center text-destructive text-xs p-2 text-center">
                  Upload failed
                </div>
              ) : (
                <img src={img.url} alt="" className="w-full h-full object-cover" />
              )}
            </div>

            {isCover && (
              <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-primary text-primary-foreground rounded-full text-xs font-bold">
                <Star className="w-3 h-3 fill-current" /> Cover
              </div>
            )}

            <div className="absolute top-2 right-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-1 rounded bg-background/80">
              <GripVertical className="w-3 h-3 text-muted-foreground" />
            </div>

            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => onRemove(img.id)}
              className="absolute top-2 right-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 rounded-full bg-destructive text-destructive-foreground"
            >
              <X className="w-3 h-3" />
            </button>

            {!isCover && !img.uploading && !img.error && (
              <button
                type="button"
                onClick={() => onSetCover(img.id)}
                className="absolute bottom-0 inset-x-0 py-1.5 bg-background/85 backdrop-blur-sm text-xs text-foreground font-medium opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-primary/20 hover:text-primary"
              >
                Set as cover
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
