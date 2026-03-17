import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, GripVertical } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

interface ImageUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  label?: string;
  folder?: string;
}

const BUCKET = "property-images";

const ImageUpload = ({ value, onChange, max, label, folder = "gallery" }: ImageUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (error) {
        if (import.meta.env.DEV) console.error("Upload failed:", error);
        continue;
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      newUrls.push(urlData.publicUrl);
    }

    const updated = [...value, ...newUrls];
    onChange(max ? updated.slice(0, max) : updated);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(value);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    onChange(items);
  };

  const atMax = max ? value.length >= max : false;

  return (
    <div className="grid gap-2">
      {label && <p className="text-sm font-medium">{label}</p>}

      {value.length > 0 && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="images" direction="horizontal">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-wrap gap-2">
                {value.map((url, i) => (
                  <Draggable key={`${url}-${i}`} draggableId={`img-${i}`} index={i}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`group relative h-20 w-20 overflow-hidden rounded-lg border border-border ${snapshot.isDragging ? "ring-2 ring-primary shadow-lg" : ""}`}
                      >
                        <div
                          {...provided.dragHandleProps}
                          className="absolute left-0 top-0 z-10 flex h-full w-5 items-center justify-center bg-background/60 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <GripVertical className="h-3 w-3 text-foreground" />
                        </div>
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => remove(i)}
                          className="absolute right-1 top-1 rounded-full bg-destructive/80 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <X className="h-3 w-3 text-destructive-foreground" />
                        </button>
                        {i === 0 && (
                          <span className="absolute bottom-0.5 left-0.5 rounded bg-primary/80 px-1 py-0.5 text-[10px] font-semibold text-primary-foreground">
                            Cover
                          </span>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {!atMax && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
        >
          {uploading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
          ) : (
            <><Upload className="h-4 w-4" /> Click to upload {max === 1 ? "image" : "images"}</>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={max !== 1}
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
    </div>
  );
};

export default ImageUpload;
