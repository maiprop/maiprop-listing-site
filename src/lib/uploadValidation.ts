/**
 * Centralised allowlists + a guard helper for client-side upload validation.
 *
 * The HTML `accept` attribute on `<input type="file">` is a UX hint, not a
 * security boundary — users can drop arbitrary files into a drag-target, and
 * scripted callers can pass arbitrary `File` objects. RLS on the storage
 * bucket protects the destination path, but does NOT validate MIME types.
 *
 * Use these allowlists at every `supabase.storage.from(...).upload(...)`
 * site so the client refuses unsupported types before they hit the bucket.
 *
 * Note: `file.type` is browser-supplied and is therefore advisory, not
 * authoritative. For full server-side enforcement, add a storage policy
 * that checks `metadata->>mimetype` or move the upload through an edge
 * function that re-sniffs the bytes. This module is the client-side half.
 */

/** Image types we'll accept anywhere we accept "an image". */
export const IMAGE_MIME_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
]);

/** Video types we'll accept for project media (renderings, walkthroughs). */
export const VIDEO_MIME_TYPES = new Set<string>([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
]);

/** Image + video combined — used by project media uploads. */
export const IMAGE_AND_VIDEO_MIME_TYPES = new Set<string>([
  ...IMAGE_MIME_TYPES,
  ...VIDEO_MIME_TYPES,
]);

/** Captured project-media bucket contract; unrelated upload allowlists stay independent. */
export const PROJECT_MEDIA_MAX_BYTES = 20 * 1024 * 1024;
export const PROJECT_MEDIA_MIME_TYPES = new Set<string>([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf", "video/mp4", "video/webm",
]);

/** Document attachments (PDFs, Word). */
export const DOCUMENT_MIME_TYPES = new Set<string>([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/** PDF only — used by the brochure_pdf project-media slot. */
export const PDF_MIME_TYPES = new Set<string>(["application/pdf"]);

/** Image + document — used by message attachments. */
export const MESSAGE_ATTACHMENT_MIME_TYPES = new Set<string>([
  ...IMAGE_MIME_TYPES,
  ...DOCUMENT_MIME_TYPES,
]);

export interface UploadValidationOptions {
  /** Maximum byte size. Defaults to 10 MiB. */
  maxBytes?: number;
  /** Human-readable label for error messages, e.g. "image", "attachment". */
  label?: string;
}

/**
 * Throws an Error with a user-friendly message if `file` doesn't match
 * `allowedMimeTypes` or is bigger than `maxBytes`. Otherwise returns silently.
 */
export function assertAllowedUpload(
  file: File,
  allowedMimeTypes: ReadonlySet<string>,
  options: UploadValidationOptions = {},
): void {
  const { maxBytes = 10 * 1024 * 1024, label = "file" } = options;

  if (!allowedMimeTypes.has(file.type)) {
    const allowed = [...allowedMimeTypes]
      .map((m) => m.split("/")[1])
      .join(", ");
    throw new Error(
      `Unsupported ${label} type "${file.type || "unknown"}". Allowed: ${allowed}.`,
    );
  }

  if (file.size > maxBytes) {
    const limit =
      maxBytes < 1024 * 1024
        ? `${Math.round(maxBytes / 1024)} KB`
        : `${(maxBytes / (1024 * 1024)).toFixed(0)} MB`;
    throw new Error(`"${file.name}" exceeds the ${limit} limit.`);
  }
}
