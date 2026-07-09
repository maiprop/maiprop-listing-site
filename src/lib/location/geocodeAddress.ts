import { loadGoogleMapsPlaces } from "@/lib/googleMapsPlaces";

type GeocodeInput = {
  address?: string | null;
  city?: string | null;
  municipality?: string | null;
  region?: string | null;
  postalCode?: string | null;
};

type GeocodeCoordinates = {
  latitude: string;
  longitude: string;
};

type GoogleGeocoderResult = {
  geometry?: {
    location?: {
      lat?: () => number;
      lng?: () => number;
    };
  };
};

type GoogleMapsWindow = typeof window & {
  google?: {
    maps?: {
      Geocoder?: new () => {
        geocode: (
          request: { address: string; region?: string },
          callback: (results: GoogleGeocoderResult[] | null, status: string) => void,
        ) => void;
      };
    };
  };
};

const GEOCODE_TIMEOUT_MS = 2_500;

function cleanPart(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function buildGeocodeQuery(input: GeocodeInput) {
  const parts = [
    cleanPart(input.address),
    cleanPart(input.city),
    cleanPart(input.municipality),
    cleanPart(input.region),
    cleanPart(input.postalCode),
    "Greece",
  ];
  return [...new Set(parts.filter(Boolean))].join(", ");
}

export function hasCompleteCoordinates(latitude: unknown, longitude: unknown) {
  const rawLat = String(latitude ?? "").trim();
  const rawLng = String(longitude ?? "").trim();
  if (!rawLat || !rawLng) return false;
  const lat = typeof latitude === "number" ? latitude : Number(rawLat);
  const lng = typeof longitude === "number" ? longitude : Number(rawLng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

export async function geocodeAddressText(input: GeocodeInput): Promise<GeocodeCoordinates | null> {
  if (typeof window === "undefined") return null;
  const address = buildGeocodeQuery(input);
  if (!address) return null;

  try {
    await loadGoogleMapsPlaces();
  } catch {
    return null;
  }

  const Geocoder = (window as GoogleMapsWindow).google?.maps?.Geocoder;
  if (!Geocoder) return null;

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(null), GEOCODE_TIMEOUT_MS);
    const settle = (value: GeocodeCoordinates | null) => {
      window.clearTimeout(timeout);
      resolve(value);
    };

    try {
      new Geocoder().geocode({ address, region: "gr" }, (results, status) => {
        if (status !== "OK") {
          settle(null);
          return;
        }
        const location = results?.[0]?.geometry?.location;
        const latitude = location?.lat?.();
        const longitude = location?.lng?.();
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          settle(null);
          return;
        }
        settle({ latitude: String(latitude), longitude: String(longitude) });
      });
    } catch {
      settle(null);
    }
  });
}
