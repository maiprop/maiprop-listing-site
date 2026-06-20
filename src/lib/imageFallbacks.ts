export const MAIPROP_LOGO_FALLBACK_URL = "/images/maiprop-logo.webp";

export const isMaiPropLogoFallback = (src?: string | null): boolean =>
  Boolean(src?.includes("maiprop-logo"));

export const getImageFallbackChain = (
  images: readonly (string | null | undefined)[] = [],
): string[] => {
  const seen = new Set<string>();
  return images
    .map((image) => image?.trim() ?? "")
    .filter((image) => {
      if (!image || seen.has(image)) return false;
      seen.add(image);
      return true;
    });
};

export const applyLogoFallbackImageStyle = (img: HTMLImageElement) => {
  img.removeAttribute("srcset");
  img.style.objectFit = "contain";
  img.style.padding = "2rem";
  img.style.backgroundColor = "hsl(var(--background))";
};

const applyCoverFallbackImageStyle = (img: HTMLImageElement) => {
  img.removeAttribute("srcset");
  img.style.objectFit = "cover";
  img.style.padding = "";
  img.style.backgroundColor = "";
};

export const switchImageToLogoFallback = (img: HTMLImageElement): boolean => {
  if (isMaiPropLogoFallback(img.currentSrc || img.src)) {
    img.style.display = "none";
    return false;
  }
  img.src = MAIPROP_LOGO_FALLBACK_URL;
  applyLogoFallbackImageStyle(img);
  return true;
};

export const switchImageToNextFallback = (
  img: HTMLImageElement,
  images: readonly (string | null | undefined)[],
): boolean => {
  const chain = getImageFallbackChain(images);
  const currentIndex = Number.parseInt(img.dataset.imageFallbackIndex ?? "0", 10);
  const nextIndex = chain.findIndex((_image, index) => index > currentIndex);

  if (nextIndex === -1) return switchImageToLogoFallback(img);

  const nextImage = chain[nextIndex];
  img.dataset.imageFallbackIndex = String(nextIndex);
  img.src = nextImage;

  if (isMaiPropLogoFallback(nextImage)) {
    applyLogoFallbackImageStyle(img);
  } else {
    applyCoverFallbackImageStyle(img);
  }

  return true;
};

export const switchImageToNextFallbackIfEmpty = (
  img: HTMLImageElement,
  images: readonly (string | null | undefined)[],
): boolean => {
  const currentSrc = img.currentSrc || img.src;
  if (isMaiPropLogoFallback(currentSrc)) return false;
  if (img.naturalWidth > 0 && img.naturalHeight > 0) return false;

  return switchImageToNextFallback(img, images);
};
