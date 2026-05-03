# Image Optimization Strategy

## Current State

- Property images stored in **Supabase Storage** (S3-compatible)
- `loading="lazy"` on all below-fold images ✅
- Fallback to Unsplash placeholder on error ✅
- Client-side compression via `compressImage.ts` before upload ✅

## Recommended: Supabase Image Transformation

Supabase Storage supports [image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations) via URL parameters:

```typescript
// Instead of raw URL:
const url = supabase.storage.from("images").getPublicUrl(path);

// Use transformed URL with width/quality:
const url = supabase.storage.from("images").getPublicUrl(path, {
  transform: { width: 400, height: 300, quality: 80 },
});
```

### Recommended Sizes

| Context | Width | Quality | Format |
|---------|-------|---------|--------|
| Thumbnail (card) | 400px | 75 | WebP |
| Gallery preview | 800px | 80 | WebP |
| Full-screen gallery | 1600px | 85 | WebP |
| Map popup | 200px | 70 | WebP |
| OG meta image | 1200px | 80 | JPEG |

### Implementation

1. Create `src/lib/imageUrl.ts` helper:
   ```typescript
   export function optimizedUrl(path: string, width: number, quality = 80) {
     return supabase.storage.from("images").getPublicUrl(path, {
       transform: { width, quality, format: "origin" },
     }).data.publicUrl;
   }
   ```

2. Update `PropertyCard`, `ImageGallery`, `PropertyPopup` to use sized variants

3. Add `<link rel="preload">` for hero images on landing pages

### Estimated Impact

- **LCP improvement:** 30-50% faster on property detail pages
- **Bandwidth reduction:** ~60% for card thumbnails (400px vs full-size)
- **CLS reduction:** Specify explicit `width`/`height` attributes

## CDN Caching

Supabase Storage serves through their CDN with `Cache-Control: public, max-age=3600`. For immutable uploads (UUID-named files), we can extend this via Cloudflare Page Rules to `max-age=31536000, immutable`.
