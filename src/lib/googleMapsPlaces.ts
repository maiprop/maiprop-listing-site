import { GOOGLE_MAPS_API_KEY } from "@/lib/config";

let googleMapsPlacesPromise: Promise<void> | null = null;

type GoogleMapsPlacesWindow = typeof window & {
  google?: { maps?: { places?: unknown } };
};

export function hasGooglePlaces(): boolean {
  return Boolean((window as GoogleMapsPlacesWindow).google?.maps?.places);
}

export function loadGoogleMapsPlaces(apiKey = GOOGLE_MAPS_API_KEY): Promise<void> {
  if (hasGooglePlaces()) return Promise.resolve();
  if (!apiKey) return Promise.reject(new Error("Google Maps API key is not configured"));

  const existingScript = document.head.querySelector<HTMLScriptElement>(
    'script[src*="maps.googleapis.com/maps/api/js"]',
  );
  if (googleMapsPlacesPromise && existingScript) return googleMapsPlacesPromise;

  googleMapsPlacesPromise = new Promise((resolve, reject) => {
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Google Maps failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    script.async = true;
    script.dataset.maipropGooglePlaces = "true";
    script.onload = () => resolve();
    script.onerror = () => {
      googleMapsPlacesPromise = null;
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
  });

  return googleMapsPlacesPromise;
}

