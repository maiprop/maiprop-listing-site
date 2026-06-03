/**
 * Storage upload helpers for the new-building listing wizard.
 *
 * Both helpers wrap `supabase.storage.upload()` with explicit allowlist
 * checks via `assertAllowedUpload()` — never trust the `<input accept="...">`
 * attribute, which is only a UX hint.
 *
 * Each returns the public URL (or, for listing images, an `{ id, url }`
 * pair tracked by the wizard's local image state).
 */

import { supabase } from "@/integrations/supabase/client";
import {
  IMAGE_MIME_TYPES,
  IMAGE_AND_VIDEO_MIME_TYPES,
  PDF_MIME_TYPES,
  assertAllowedUpload,
} from "@/lib/uploadValidation";
import type { ProjectMediaType } from "@/hooks/useProjectMedia";

/** Per-upload type returned by `uploadListingImage`. */
export interface UploadedListingImage {
  /** Stable id used as the React key in the wizard's image grid. */
  id: string;
  /** Public CDN URL for `<img src>` and persistence. */
  url: string;
}

/**
 * Validates the file as an image, uploads it to the `listing-images`
 * bucket under `${userId}/${uuid}.${ext}`, and returns its public URL.
 *
 * Throws on MIME-allowlist failure (via `assertAllowedUpload`) or on
 * the underlying storage error — caller is expected to surface the
 * message via toast.
 */
export async function uploadListingImage(
  file: File,
  userId: string,
): Promise<UploadedListingImage> {
  // Reject anything that isn't a recognised image MIME type before it
  // hits the bucket — the <input accept="..."> attribute is only a UX hint.
  assertAllowedUpload(file, IMAGE_MIME_TYPES, { label: "image" });
  const ext = file.name.split(".").pop();
  const id = crypto.randomUUID();
  const path = `${userId}/${id}.${ext}`;
  const { error } = await supabase.storage.from("listing-images").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
  return { id, url: data.publicUrl };
}

/**
 * Validates and uploads project-level media (renderings, floor plans,
 * brochures, video, etc.) to `project-media`. PDFs go through the PDF
 * allowlist; everything else allows images and video, with a 50 MB cap.
 */
export async function uploadProjectMedia(
  file: File,
  userId: string,
  projectId: string,
  mediaType: ProjectMediaType,
): Promise<string> {
  const allowed = mediaType === "brochure_pdf" ? PDF_MIME_TYPES : IMAGE_AND_VIDEO_MIME_TYPES;
  assertAllowedUpload(file, allowed, {
    label: mediaType === "brochure_pdf" ? "PDF brochure" : "media file",
    maxBytes: 50 * 1024 * 1024, // 50 MB — videos/brochures can be larger than photos
  });
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/${projectId}/media-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("project-media").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("project-media").getPublicUrl(path);
  return data.publicUrl;
}
