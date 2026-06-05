import { supabase } from "@/integrations/supabase/client";
import { compressAvatar } from "@/lib/compressImage";
import { assertAllowedUpload } from "@/lib/uploadValidation";

const AVATAR_MIME_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export interface UploadedProfileAvatar {
  path: string;
  url: string;
}

export async function uploadProfileAvatar(
  file: File,
  userId: string,
): Promise<UploadedProfileAvatar> {
  assertAllowedUpload(file, AVATAR_MIME_TYPES, {
    label: "avatar image",
    maxBytes: AVATAR_MAX_BYTES,
  });

  const compressed = await compressAvatar(file);
  assertAllowedUpload(compressed, AVATAR_MIME_TYPES, {
    label: "avatar image",
    maxBytes: AVATAR_MAX_BYTES,
  });

  const ext = MIME_TO_EXT[compressed.type] ?? "jpg";
  const path = `${userId}/avatar-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, compressed, { upsert: false, contentType: compressed.type });
  if (error) throw error;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return { path, url: data.publicUrl };
}
