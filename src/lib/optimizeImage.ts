/**
 * Optimizes Supabase Storage image URLs by using the render/image endpoint
 * with width, height, and format parameters for on-the-fly resizing.
 */
export function optimizeImage(
  url: string,
  options: { width?: number; height?: number; quality?: number } = {}
): string {
  if (!url) return url;

  const { width, height, quality = 75 } = options;

  // Only transform Supabase storage URLs
  const supabaseStoragePattern = /\/storage\/v1\/object\/public\//;
  if (!supabaseStoragePattern.test(url)) return url;

  // Replace /object/public/ with /render/image/public/ for transformation
  const transformedUrl = url.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/'
  );

  const params = new URLSearchParams();
  if (width) params.set('width', String(width));
  if (height) params.set('height', String(height));
  params.set('resize', 'cover');
  params.set('format', 'origin');
  params.set('quality', String(quality));

  return `${transformedUrl}?${params.toString()}`;
}
