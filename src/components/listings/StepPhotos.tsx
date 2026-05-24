import { Info, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ImageGallery } from "@/components/listings/ImageGallery";
import type { UploadedImage } from "@/types";
import { tFallback, tInterpolate } from "@/lib/i18nFallback";

interface Props {
  images: UploadedImage[];
  coverImageId: string | null;
  onFilesSelected: (files: FileList | null) => Promise<void>;
  onDrop: (e: React.DragEvent) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onSetCover: (id: string | null) => void;
}

export function StepPhotos({ images, coverImageId, onFilesSelected, onDrop, onReorder, onRemove, onSetCover }: Props) {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => tFallback(t, key, fallback);
  const trv = (key: string, fallback: string, values: Record<string, string | number>) => tInterpolate(t, key, fallback, values);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-semibold">{tr("createListing.photos.heading", "Property Photos")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {tr("createListing.photos.subtitle", "Upload up to 20 photos. Drag to reorder. Click \"Set as cover\" to choose the main photo.")}
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        className="relative border-2 border-dashed border-border rounded-2xl p-8 text-center hover:border-primary/50 transition-colors group"
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={e => onFilesSelected(e.target.files)}
        />
        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2 group-hover:text-primary transition-colors" />
        <p className="text-sm font-medium">{tr("createListing.photos.dropPrompt", "Drop photos here or click to upload")}</p>
        <p className="text-xs text-muted-foreground mt-1">{tr("createListing.photos.fileHint", "JPG, PNG, WEBP - up to 10MB each - max 20 photos")}</p>
      </div>

      {images.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium">{trv(images.length === 1 ? "createListing.photos.uploadedOne" : "createListing.photos.uploadedOther", images.length === 1 ? "{{count}} photo uploaded" : "{{count}} photos uploaded", { count: images.length })}</span>
            <span className="text-xs text-muted-foreground">{tr("createListing.photos.dragToReorder", "Drag to reorder")}</span>
          </div>
          <ImageGallery
            images={images}
            coverImageId={coverImageId}
            onSetCover={onSetCover}
            onRemove={onRemove}
            onReorder={onReorder}
          />
        </div>
      )}

      {coverImageId && images.find(img => img.id === coverImageId) && (
        <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
          <img
            src={images.find(img => img.id === coverImageId)?.url}
            alt={tr("createListing.photos.coverAlt", "Cover")}
            className="w-12 h-12 rounded-lg object-cover"
          />
          <div>
            <p className="text-xs font-semibold text-primary">{tr("createListing.photos.coverSelected", "Cover photo selected")}</p>
            <p className="text-xs text-muted-foreground">{tr("createListing.photos.coverHint", "This image will be the main thumbnail")}</p>
          </div>
        </div>
      )}

      {images.length === 0 && (
        <div className="flex items-start gap-2 bg-muted/40 border border-border rounded-xl p-3 text-xs text-muted-foreground">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{tr("createListing.photos.visibilityHint", "Adding photos increases listing visibility by up to 3x. You can still publish without photos.")}</span>
        </div>
      )}
    </div>
  );
}
