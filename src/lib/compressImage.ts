/**
 * Client-side image compression before upload.
 * Uses Canvas API — no dependencies, works in all modern browsers.
 *
 * Strategy:
 *  - Resize to max 1920px on longest side (listing hero) or 400px (avatar)
 *  - Convert to WebP when browser supports it (falls back to JPEG)
 *  - Target quality 0.82 — good visual fidelity at ~60-80% size reduction
 */

export interface CompressOptions {
  /** Max width or height in px. Default: 1920 */
  maxDimension?: number;
  /** JPEG/WebP quality 0–1. Default: 0.82 */
  quality?: number;
  /** Preferred output mime type. Falls back to image/jpeg if unsupported. */
  mimeType?: "image/webp" | "image/jpeg";
}

/** Returns true if the browser can encode WebP via canvas */
function supportsWebP(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

const _webpSupported = typeof document !== "undefined" ? supportsWebP() : false;

/**
 * Compresses a File/Blob using an off-screen canvas.
 * Returns a new File with the compressed bytes and correct MIME type.
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = {}
): Promise<File> {
  const {
    maxDimension = 1920,
    quality = 0.82,
    mimeType = _webpSupported ? "image/webp" : "image/jpeg",
  } = opts;

  // Skip non-image files and already-small files (<150KB — not worth re-encoding)
  if (!file.type.startsWith("image/") || file.size < 150_000) return file;
  // Skip GIF (canvas strips animation)
  if (file.type === "image/gif") return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Calculate target dimensions maintaining aspect ratio
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file); // Fallback: upload original
        return;
      }

      // High-quality downsampling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          // Only use compressed version if it's actually smaller
          if (blob.size >= file.size) { resolve(file); return; }
          const ext = mimeType === "image/webp" ? "webp" : "jpg";
          const name = file.name.replace(/\.[^.]+$/, `.${ext}`);
          resolve(new File([blob], name, { type: mimeType }));
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // Fallback: upload original
    };

    img.src = objectUrl;
  });
}

/** Convenience preset for listing hero / gallery images */
export const compressListingImage = (file: File) =>
  compressImage(file, { maxDimension: 1920, quality: 0.82 });

/** Convenience preset for avatar / thumbnail images */
export const compressAvatar = (file: File) =>
  compressImage(file, { maxDimension: 400, quality: 0.85 });
