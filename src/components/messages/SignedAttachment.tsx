import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Renders a message attachment by fetching a short-lived signed URL from the
 * private `message-attachments` Supabase Storage bucket. Images are inlined
 * (clickable to open full-size); everything else falls back to a download link.
 *
 * The signed URL is requested on mount with a 1h TTL. While it is being
 * resolved the filename is shown as a placeholder so the layout doesn't shift.
 */
export function SignedAttachment({
  path,
  filename,
  mimeType,
}: {
  path: string;
  filename: string;
  mimeType: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.storage
      .from("message-attachments")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!url) {
    return <span className="text-xs text-muted-foreground">{filename}</span>;
  }

  const isImage = /^image\//.test(mimeType);
  return isImage ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img src={url} alt={filename} className="max-w-full max-h-48 rounded-lg object-cover" />
    </a>
  ) : (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary/80 underline text-xs block truncate"
    >
      {filename}
    </a>
  );
}
