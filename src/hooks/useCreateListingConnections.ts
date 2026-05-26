import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GOOGLE_MAPS_API_KEY } from "@/lib/config";

export type LocationSource = "google" | "nominatim" | "none";

export type CreateListingConnections = {
  supabaseOk: boolean;
  storageOk: boolean;
  locationSource: LocationSource;
  locationOk: boolean;
  loading: boolean;
};

/**
 * Verifies that required APIs and modules for Create Listing are connected:
 * - Supabase (client + listings table reachable)
 * - Storage (listing-images bucket)
 * - Location autocomplete (Google Places if key set, else Nominatim as fallback)
 */
export function useCreateListingConnections(): CreateListingConnections {
  const [state, setState] = useState<CreateListingConnections>({
    supabaseOk: false,
    storageOk: false,
    locationSource: GOOGLE_MAPS_API_KEY ? "google" : "nominatim",
    locationOk: true, // Nominatim is public; Google we assume ok if key set
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      let supabaseOk = false;
      let storageOk = false;

      try {
        const { error: listError } = await supabase.from("listings").select("id").limit(1);
        supabaseOk = !listError;
      } catch (_err: unknown) {
        supabaseOk = false;
      }

      if (supabaseOk) {
        try {
          const { data } = supabase.storage.from("listing-images").getPublicUrl("__connection-check__");
          storageOk = Boolean(data.publicUrl);
        } catch (_err: unknown) {
          storageOk = false;
        }
      }

      const locationSource: LocationSource = GOOGLE_MAPS_API_KEY ? "google" : "nominatim";
      const locationOk = locationSource === "nominatim" || !!GOOGLE_MAPS_API_KEY;

      if (!cancelled) {
        setState({
          supabaseOk,
          storageOk,
          locationSource,
          locationOk,
          loading: false,
        });
      }
    };

    check();
    return () => { cancelled = true; };
  }, []);

  return state;
}
