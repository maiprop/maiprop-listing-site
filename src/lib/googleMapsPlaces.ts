import { GOOGLE_MAPS_API_KEY } from "@/lib/config";

let googleMapsPlacesPromise: Promise<void> | null = null;

type GoogleMapsPlacesWindow = typeof window & {
  google?: { maps?: { importLibrary?: (library: "places") => Promise<unknown>; places?: unknown } };
  __maipropGoogleMapsPlacesReady?: () => void;
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
    let settled = false;

    const rejectLoad = (error: Error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      googleMapsPlacesPromise = null;
      delete (window as GoogleMapsPlacesWindow).__maipropGoogleMapsPlacesReady;
      reject(error);
    };

    const resolveWhenPlacesReady = async () => {
      if (settled) return;
      try {
        const googleMaps = (window as GoogleMapsPlacesWindow).google?.maps;
        if (!googleMaps?.places && googleMaps?.importLibrary) {
          await googleMaps.importLibrary("places");
        }
        if (!hasGooglePlaces()) {
          rejectLoad(new Error("Google Places failed to initialize"));
          return;
        }
        settled = true;
        if (timeoutId) window.clearTimeout(timeoutId);
        delete (window as GoogleMapsPlacesWindow).__maipropGoogleMapsPlacesReady;
        resolve();
      } catch (error) {
        rejectLoad(error instanceof Error ? error : new Error("Google Places failed to initialize"));
      }
    };

    const timeoutId = window.setTimeout(() => {
      rejectLoad(new Error("Google Maps failed to load"));
    }, 15_000);

    if (existingScript) {
      existingScript.addEventListener("load", () => void resolveWhenPlacesReady(), { once: true });
      existingScript.addEventListener("error", () => rejectLoad(new Error("Google Maps failed to load")), { once: true });
      window.setTimeout(() => void resolveWhenPlacesReady(), 0);
      return;
    }

    (window as GoogleMapsPlacesWindow).__maipropGoogleMapsPlacesReady = () => {
      void resolveWhenPlacesReady();
    };

    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      libraries: "places",
      loading: "async",
      callback: "__maipropGoogleMapsPlacesReady",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.dataset.maipropGooglePlaces = "true";
    script.onerror = () => {
      rejectLoad(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
  });

  return googleMapsPlacesPromise;
}

