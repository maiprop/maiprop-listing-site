export const MAIPROP_LOGO_FALLBACK_URL = "/images/maiprop-logo.webp";

export const isMaiPropLogoFallback = (src?: string | null): boolean =>
  Boolean(src?.includes("maiprop-logo"));

export const applyLogoFallbackImageStyle = (img: HTMLImageElement) => {
  img.removeAttribute("srcset");
  img.style.objectFit = "contain";
  img.style.padding = "2rem";
  img.style.backgroundColor = "hsl(var(--background))";
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
