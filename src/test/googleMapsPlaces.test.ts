import { beforeEach, describe, expect, it, vi } from "vitest";

function removeGoogleMapsScripts() {
  document.head
    .querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]')
    .forEach((script) => script.remove());
}

function markPlacesReady() {
  (
    window as typeof window & {
      google?: unknown;
      __maipropGoogleMapsPlacesReady?: () => void;
    }
  ).google = { maps: { places: {} } };
  (window as typeof window & { __maipropGoogleMapsPlacesReady?: () => void })
    .__maipropGoogleMapsPlacesReady?.();
}

async function loadModule() {
  vi.resetModules();
  return import("@/lib/googleMapsPlaces");
}

describe("googleMapsPlaces loader", () => {
  beforeEach(() => {
    removeGoogleMapsScripts();
    delete (window as typeof window & { google?: unknown }).google;
    delete (window as typeof window & { __maipropGoogleMapsPlacesReady?: unknown })
      .__maipropGoogleMapsPlacesReady;
    delete (window as typeof window & { gm_authFailure?: unknown }).gm_authFailure;
  });

  it("detects an already-loaded Google Places namespace", async () => {
    const { hasGooglePlaces, loadGoogleMapsPlaces } = await loadModule();

    expect(hasGooglePlaces()).toBe(false);

    (window as typeof window & { google?: unknown }).google = { maps: { places: {} } };

    expect(hasGooglePlaces()).toBe(true);
    await expect(loadGoogleMapsPlaces("unused-key")).resolves.toBeUndefined();
    expect(document.head.querySelectorAll("script").length).toBe(0);
  });

  it("rejects immediately when no API key is available", async () => {
    const { loadGoogleMapsPlaces } = await loadModule();

    await expect(loadGoogleMapsPlaces("")).rejects.toThrow("Google Maps API key is not configured");
    expect(document.head.querySelector('script[src*="maps.googleapis.com"]')).toBeNull();
  });

  it("appends the Google Places script and reuses the pending promise", async () => {
    const { loadGoogleMapsPlaces } = await loadModule();

    const firstLoad = loadGoogleMapsPlaces("maps-key-1");
    const secondLoad = loadGoogleMapsPlaces("maps-key-1");
    const scripts = document.head.querySelectorAll<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]',
    );

    expect(firstLoad).toBe(secondLoad);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toContain("key=maps-key-1");
    expect(scripts[0].src).toContain("libraries=places");
    expect(scripts[0].src).toContain("loading=async");
    expect(scripts[0].src).toContain("callback=__maipropGoogleMapsPlacesReady");
    expect(scripts[0].async).toBe(true);
    expect(scripts[0].dataset.maipropGooglePlaces).toBe("true");

    markPlacesReady();
    await expect(firstLoad).resolves.toBeUndefined();
  });

  it("wires load and error listeners onto an existing script tag", async () => {
    const existing = document.createElement("script");
    existing.src = "https://maps.googleapis.com/maps/api/js?key=existing&libraries=places";
    document.head.appendChild(existing);
    const { loadGoogleMapsPlaces } = await loadModule();

    const load = loadGoogleMapsPlaces("maps-key-2");
    expect(document.head.querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]')).toHaveLength(1);

    (window as typeof window & { google?: unknown }).google = { maps: { places: {} } };
    existing.dispatchEvent(new Event("load"));
    await expect(load).resolves.toBeUndefined();
  });

  it("rejects when the script callback fires without the Places namespace", async () => {
    const { loadGoogleMapsPlaces } = await loadModule();

    const load = loadGoogleMapsPlaces("maps-key-without-places");
    (window as typeof window & { google?: unknown }).google = { maps: {} };
    (window as typeof window & { __maipropGoogleMapsPlacesReady?: () => void })
      .__maipropGoogleMapsPlacesReady?.();

    await expect(load).rejects.toThrow("Google Places failed to initialize");
  });

  it("rejects when Google reports an auth or API activation failure", async () => {
    const { loadGoogleMapsPlaces } = await loadModule();

    const load = loadGoogleMapsPlaces("maps-key-not-activated");
    (window as typeof window & { gm_authFailure?: () => void }).gm_authFailure?.();

    await expect(load).rejects.toThrow("Google Maps authentication failed");
    expect((window as typeof window & { gm_authFailure?: unknown }).gm_authFailure).toBeUndefined();
  });

  it("clears the cached promise after script load failure so callers can retry", async () => {
    const { loadGoogleMapsPlaces } = await loadModule();

    const failedLoad = loadGoogleMapsPlaces("bad-key");
    const failedScript = document.head.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]',
    );
    expect(failedScript).not.toBeNull();

    failedScript?.dispatchEvent(new Event("error"));
    await expect(failedLoad).rejects.toThrow("Google Maps failed to load");

    failedScript?.remove();
    const retryLoad = loadGoogleMapsPlaces("good-key");
    const retryScript = document.head.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]',
    );
    expect(retryScript?.src).toContain("key=good-key");

    markPlacesReady();
    await expect(retryLoad).resolves.toBeUndefined();
  });
});
