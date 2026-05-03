import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Renders a message attachment by fetching a short-lived signed URL from the
 * private `message-attachments` Supabase Storage bucket. Images are inlined
 * (clickable to open full-size); everything else falls back to a download link.
 *
 * The signed URL is re-requested on demand if the rendered <img> errors out
 * (e.g. the user opens an old conversation after the URL has expired). The
 * fallback path is to show the filename as a plain link rather than a broken
 * image — never a silent black box.
 */
const SIGNED_URL_TTL_SECONDS = 3600;

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
  const [errored, setErrored] = useState(false);

  const refresh = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.storage
      .from("message-attachments")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return data?.signedUrl ?? null;
  }, [path]);

  useEffect(() => {
    let cancelled = false;
    refresh().then((next) => {
      if (!cancelled && next) setUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const handleImageError = useCallback(async () => {
    // The most common failure mode is the signed URL expiring after an hour.
    // Try once to refresh; if that also fails, show the filename fallback.
    const next = await refresh();
    if (next && next !== url) {
      setErrored(false);
      setUrl(next);
    } else {
      setErrored(true);
    }
  }, [refresh, url]);

  if (!url) {
    return <span className="text-xs text-muted-foreground">{filename}</span>;
  }

  const isImage = /^image\//.test(mimeType);

  if (errored) {
    return (
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

  return isImage ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={url}
        alt={filename}
        className="max-w-full max-h-48 rounded-lg object-cover"
        onError={handleImageError}
      />
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
