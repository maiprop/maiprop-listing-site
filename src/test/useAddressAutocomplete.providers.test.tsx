import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAddressAutocomplete } from "@/hooks/useAddressAutocomplete";
import type { AddressPrediction } from "@/lib/location/addressFormat";

const providerMocks = vi.hoisted(() => ({
  googleEnabled: true,
  fetchGoogle: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  GOOGLE_MAPS_API_KEY: "maps-key",
  get GOOGLE_PLACES_AUTOCOMPLETE_ENABLED() {
    return providerMocks.googleEnabled;
  },
}));

vi.mock("@/lib/location/googlePlacePredictions", () => ({
  fetchGooglePlacePredictions: providerMocks.fetchGoogle,
}));

const googlePrediction: AddressPrediction = {
  id: "google:voukourestiou-14",
  provider: "google",
  value: "Voukourestiou 14",
  title: "Voukourestiou 14",
  addressLine: "Voukourestiou 14",
  city: "Athens",
  municipality: "Municipality of Athens",
  region: "Attica",
  fullAddress: "Voukourestiou 14, Athens 10671, Greece",
};

const nominatimResponse = () => new Response(JSON.stringify([{
  display_name: "14 Voukourestiou, Athens, Attica, Greece",
  lat: "37.9779",
  lon: "23.7354",
  address: {
    house_number: "14",
    road: "Voukourestiou",
    city: "Athens",
    municipality: "Municipality of Athens",
    state: "Attica",
    postcode: "10671",
  },
}]));

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useAddressAutocomplete provider sequencing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    providerMocks.googleEnabled = true;
    providerMocks.fetchGoogle.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does not invoke a fallback provider when Google returns a usable result", async () => {
    providerMocks.fetchGoogle.mockResolvedValue([googlePrediction]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAddressAutocomplete("Voukourestiou 14", {
      mode: "address",
      includePopular: false,
    }));

    await advance(300);

    expect(providerMocks.fetchGoogle).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.predictions[0]).toEqual(expect.objectContaining({
      id: googlePrediction.id,
      provider: "google",
    }));
  });

  it("waits for Google to fail before invoking one fallback provider", async () => {
    let resolveGoogle!: (predictions: AddressPrediction[]) => void;
    providerMocks.fetchGoogle.mockImplementation(() => new Promise((resolve) => {
      resolveGoogle = resolve;
    }));
    const fetchMock = vi.fn().mockResolvedValue(nominatimResponse());
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAddressAutocomplete("Voukourestiou 14", {
      mode: "address",
      includePopular: false,
    }));

    await advance(300);
    expect(fetchMock).not.toHaveBeenCalled();

    resolveGoogle([]);
    await advance(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("nominatim.openstreetmap.org");
    expect(result.current.predictions[0]).toEqual(expect.objectContaining({
      provider: "nominatim",
      addressLine: "14 Voukourestiou",
    }));
  });

  it("starts one fallback after the Google budget expires and aborts the primary signal", async () => {
    let googleSignal: AbortSignal | undefined;
    providerMocks.fetchGoogle.mockImplementation((_query, _mode, signal) => {
      googleSignal = signal;
      return new Promise(() => undefined);
    });
    const fetchMock = vi.fn().mockResolvedValue(nominatimResponse());
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useAddressAutocomplete("Voukourestiou 14", {
      mode: "address",
      includePopular: false,
    }));

    await advance(300);
    await advance(799);
    expect(fetchMock).not.toHaveBeenCalled();

    await advance(1);
    expect(googleSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not fan out from an empty Mapbox fallback to Nominatim", async () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("VITE_MAPBOX_TOKEN", "mapbox-token");
    providerMocks.fetchGoogle.mockResolvedValue([]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: [] })));
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useAddressAutocomplete("Voukourestiou 14", {
      mode: "address",
      includePopular: false,
    }));

    await advance(300);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.mapbox.com");
  });

  it("bounds and aborts a fallback provider that does not settle", async () => {
    providerMocks.fetchGoogle.mockResolvedValue([]);
    let fallbackSignal: AbortSignal | null | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      fallbackSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        fallbackSignal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAddressAutocomplete("Voukourestiou 14", {
      mode: "address",
      includePopular: false,
    }));

    await advance(300);
    expect(result.current.loading).toBe(true);

    await advance(5_000);

    expect(fallbackSignal?.aborted).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
