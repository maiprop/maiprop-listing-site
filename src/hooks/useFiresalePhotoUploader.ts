import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { IMAGE_MIME_TYPES, assertAllowedUpload } from "@/lib/uploadValidation";

const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Firesale-form-specific allowlist: the canonical `IMAGE_MIME_TYPES` set
 * (jpeg/png/webp/heic/heif/avif) PLUS `image/gif` — the original inline
 * `ALLOWED_MIME` set in `FiresaleQuickSaleForm.tsx` accepted GIFs and we
 * preserve that behaviour here. Property photos are very rarely GIFs but
 * users have historically been allowed to upload them, so we don't silently
 * regress.
 */
const FIRESALE_PHOTO_MIME_TYPES: ReadonlySet<string> = new Set([
  ...IMAGE_MIME_TYPES,
  "image/gif",
]);

/**
 * Extension fallback for image MIME types. Used when picking the storage
 * object's path suffix — we never trust raw `file.name` here. Includes the
 * iPhone-native HEIC/HEIF/AVIF formats supported by `IMAGE_MIME_TYPES`.
 */
const SAFE_PHOTO_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif"]);
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
};

/**
 * Lightweight canvas-based image compression preserving the firesale form's
 * historical defaults (max 1600 px, quality 0.75, JPEG fallback). Kept inside
 * this hook to avoid changing the bytes uploaded by the existing flow when
 * pulling logic out of `FiresaleQuickSaleForm`.
 *
 * NOTE: This is a *processing* helper, not a security check. The actual MIME
 * allowlist enforcement is `assertAllowedUpload(file, FIRESALE_PHOTO_MIME_TYPES, ...)`
 * called at the upload site (see `upload()` below).
 */
const compress = (file: File, maxDim = 1600, quality = 0.75): Promise<Blob> =>
  new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") { resolve(file); return; }
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          let { width, height } = img;
          if (width > height && width > maxDim) { height = (height * maxDim) / width; width = maxDim; }
          else if (height > maxDim) { width = (width * maxDim) / height; height = maxDim; }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(file); return; }
          ctx.drawImage(img, 0, 0, width, height);
          const CANVAS_ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
          const type = file.type && CANVAS_ALLOWED.has(file.type) ? file.type : "image/jpeg";
          canvas.toBlob((blob) => { if (blob) resolve(blob); else resolve(file); }, type, quality);
        } catch (_err: unknown) { resolve(file); }
      };
      img.onerror = () => resolve(file);
      img.src = reader.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });

export interface UseFiresalePhotoUploaderResult {
  /** Currently selected files (≤10). */
  files: File[];
  /** Object URLs aligned 1:1 with `files` (for `<img src>`). */
  previews: string[];
  /** True while `upload()` is running. */
  uploading: boolean;
  /** Ref to wire onto a `<input type="file" hidden>` for click-to-select. */
  fileInputRef: React.RefObject<HTMLInputElement>;
  /** Validates MIME + size, dedupes against the existing list, caps at 10. */
  addFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Removes the photo at `idx` from both `files` and `previews`. */
  removeAt: (idx: number) => void;
  /** Clears all selected photos (used after submit). */
  reset: () => void;
  /**
   * Compresses + uploads the current `files` to the `firesale-photos`
   * bucket under the given request id, and returns the public URLs.
   * Failures per-file emit a toast warning and are skipped so the form
   * still records the request.
   */
  upload: (requestId: string) => Promise<string[]>;
}

/**
 * Encapsulates the photo selection / preview / compression / upload pipeline
 * for the firesale Quick Sale™ form. Pulled out of
 * `FiresaleQuickSaleForm.tsx` so the page component focuses on form layout
 * and validation, not on image plumbing.
 */
export function useFiresalePhotoUploader(): UseFiresalePhotoUploaderResult {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track every blob URL we hand out via `URL.createObjectURL` so we can
  // revoke them on unmount, removal, or wholesale replacement — leaking
  // these on a long form session keeps raw image bytes alive for the page
  // lifetime. Pattern mirrors `useListingForm.ts:84-93`.
  const blobUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  const trackBlobUrl = (url: string): string => {
    blobUrlsRef.current.add(url);
    return url;
  };
  const revokeBlobUrl = (url: string) => {
    if (blobUrlsRef.current.delete(url)) {
      URL.revokeObjectURL(url);
    }
  };

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || []);
    const valid = incoming.filter((f) => FIRESALE_PHOTO_MIME_TYPES.has(f.type) && f.size < MAX_PHOTO_BYTES);
    if (valid.length < incoming.length) {
      toast.warning("Some files were skipped (must be images under 10MB).");
    }
    // Compute next state and perform blob-URL side effects *outside* the
    // React state setters — setters must be pure. Mirrors the pattern in
    // `useListingForm.ts:167-186`. addFiles is only invoked from user-driven
    // file-input change events, so the closure-captured `files`/`previews`
    // are guaranteed to be the latest committed state.
    const next = [...files, ...valid].slice(0, MAX_PHOTOS);
    previews.forEach(revokeBlobUrl);
    const nextPreviews = next.map((f) => trackBlobUrl(URL.createObjectURL(f)));
    setFiles(next);
    setPreviews(nextPreviews);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAt = (idx: number) => {
    // Side effect (revoke) outside the setter; pure update inside.
    const removed = previews[idx];
    if (removed) revokeBlobUrl(removed);
    setFiles((f) => f.filter((_, i) => i !== idx));
    setPreviews((p) => p.filter((_, i) => i !== idx));
  };

  const reset = () => {
    previews.forEach(revokeBlobUrl);
    setFiles([]);
    setPreviews([]);
  };

  const upload = async (requestId: string): Promise<string[]> => {
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files) {
        // Mandatory client-side validation per CLAUDE.md — must run
        // immediately before each `supabase.storage.from(...).upload(...)`.
        // The pre-filter in `addFiles()` is a UX hint, not a security boundary.
        try {
          assertAllowedUpload(file, FIRESALE_PHOTO_MIME_TYPES, {
            label: "photo",
            maxBytes: MAX_PHOTO_BYTES,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Invalid photo";
          logger.warn("[Firesale] photo rejected:", msg);
          toast.warning(`One photo was rejected: ${msg}`);
          continue;
        }
        const compressed = await compress(file);
        // Validate extension against an allowlist — never trust raw `file.name`.
        // The compressed blob's type is the source of truth; `file.name` is
        // only consulted as a fallback when MIME is missing/unknown.
        const fromMime = MIME_TO_EXT[compressed.type];
        const fromName = (file.name.split(".").pop() ?? "").toLowerCase();
        const ext = fromMime ?? (SAFE_PHOTO_EXTS.has(fromName) ? fromName : "jpg");
        const path = `${requestId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("firesale-photos").upload(path, compressed);
        if (error) {
          logger.warn("[Firesale] photo upload failed:", error.message);
          toast.warning("One photo could not be uploaded and was skipped.");
        } else {
          const { data } = supabase.storage.from("firesale-photos").getPublicUrl(path);
          urls.push(data.publicUrl);
        }
      }
      return urls;
    } finally {
      setUploading(false);
    }
  };

  return { files, previews, uploading, fileInputRef, addFiles, removeAt, reset, upload };
}
