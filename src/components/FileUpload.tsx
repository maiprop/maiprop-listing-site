import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, FileText } from "lucide-react";

interface FileUploadProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  folder?: string;
  accept?: string;
}

const BUCKET = "property-images";

const FileUpload = ({ value, onChange, label, folder = "reports", accept = ".pdf" }: FileUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    const file = files[0];
    const ext = file.name.split(".").pop() || "pdf";
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) {
      if (import.meta.env.DEV) console.error("Upload failed:", error);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    onChange(urlData.publicUrl);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="grid gap-2">
      {label && <p className="text-sm font-medium">{label}</p>}

      {value && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <FileText className="h-4 w-4 text-primary" />
          <a href={value} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-sm text-primary underline">
            {value.split("/").pop()}
          </a>
          <button type="button" onClick={() => onChange("")} className="rounded-full p-0.5 text-destructive hover:bg-destructive/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {!value && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
        >
          {uploading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
          ) : (
            <><Upload className="h-4 w-4" /> Click to upload PDF</>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
    </div>
  );
};

export default FileUpload;
