/**
 * Optimizes Supabase Storage image URLs by using the render/image endpoint
 * with width, height, and format parameters for on-the-fly resizing.
 *
 * Supabase image transformations are plan/config dependent. Keep this helper
 * safe-by-default so free projects or disabled transform settings never emit
 * URLs that can return 403.
 */
type OptimizeImageOptions = {
  width?: number;
  height?: number;
  quality?: number;
  transformsEnabled?: boolean;
};

const clampInteger = (value: number | undefined, min: number, max: number): number | undefined => {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
};

export function optimizeImage(
  url: string,
  options: OptimizeImageOptions = {}
): string {
  if (!url) return url;
  if (!options.transformsEnabled) return url;

  const { width, height, quality = 75 } = options;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return url;
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) return url;
  if (!parsedUrl.hostname.endsWith(".supabase.co") && parsedUrl.hostname !== "supabase.co") return url;
  if (!parsedUrl.pathname.includes("/storage/v1/object/public/")) return url;

  // Replace /object/public/ with /render/image/public/ for transformation
  const transformedUrl = url.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/'
  );

  const params = new URLSearchParams();
  const safeWidth = clampInteger(width, 1, 2500);
  const safeHeight = clampInteger(height, 1, 2500);
  const safeQuality = clampInteger(quality, 20, 100) ?? 75;
  if (safeWidth) params.set('width', String(safeWidth));
  if (safeHeight) params.set('height', String(safeHeight));
  params.set('resize', 'cover');
  params.set('format', 'origin');
  params.set('quality', String(safeQuality));

  return `${transformedUrl}?${params.toString()}`;
}
