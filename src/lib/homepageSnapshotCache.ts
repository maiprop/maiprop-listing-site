const HOMEPAGE_SNAPSHOT_VERSION = 1;
const HOMEPAGE_SNAPSHOT_PREFIX = "maiprop_homepage_snapshot:";
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;
const BOOTSTRAP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const HOMEPAGE_FEATURED_SNAPSHOT_KEY = "featured";
export const HOMEPAGE_OPEN_HOUSES_SNAPSHOT_KEY = "open-houses";

type HomepageSnapshot<T> = {
  v: typeof HOMEPAGE_SNAPSHOT_VERSION;
  ts: number;
  data: T;
};

type HomepageInitialPayload = {
  version: typeof HOMEPAGE_SNAPSHOT_VERSION;
  generatedAt: string;
  featured?: unknown[];
  openHouses?: unknown[];
  saleListings?: InitialListingsPage<unknown>;
  rentListings?: InitialListingsPage<unknown>;
};

export type InitialListingsPage<T> = {
  data: T[];
  hasMore: boolean;
  nextCursor?: string | null;
  page: 1;
  pageSize: 12;
  offset: 0;
};

declare global {
  interface Window {
    __MAIPROP_HOMEPAGE_INITIAL__?: HomepageInitialPayload;
  }
}

const canUseStorage = (): boolean =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const storageKey = (key: string): string => `${HOMEPAGE_SNAPSHOT_PREFIX}${key}`;

const getBootstrapSection = (key: string): keyof Pick<HomepageInitialPayload, "featured" | "openHouses"> | null => {
  if (key === HOMEPAGE_FEATURED_SNAPSHOT_KEY) return "featured";
  if (key === HOMEPAGE_OPEN_HOUSES_SNAPSHOT_KEY) return "openHouses";
  return null;
};

function readEmbeddedHomepagePayload(): HomepageInitialPayload | undefined {
  const node = document.getElementById("maiprop-homepage-initial");
  if (!node?.textContent) return undefined;
  try {
    return JSON.parse(node.textContent) as HomepageInitialPayload;
  } catch {
    return undefined;
  }
}

function readFreshBootstrapPayload(): HomepageInitialPayload | undefined {
  if (typeof window === "undefined") return undefined;
  const payload = window.__MAIPROP_HOMEPAGE_INITIAL__ ?? readEmbeddedHomepagePayload();
  if (!payload || payload.version !== HOMEPAGE_SNAPSHOT_VERSION) return undefined;

  const generatedAt = Date.parse(payload.generatedAt);
  if (!Number.isFinite(generatedAt) || Date.now() - generatedAt > BOOTSTRAP_MAX_AGE_MS) return undefined;
  return payload;
}

function readHomepageBootstrapSnapshot<T>(key: string): T | undefined {
  const section = getBootstrapSection(key);
  if (!section) return undefined;

  const payload = readFreshBootstrapPayload();
  if (!payload) return undefined;

  const rows = payload[section];
  return Array.isArray(rows) ? rows as T : undefined;
}

export function readInitialListingsPage<T>(listingType: "sale" | "rent"): InitialListingsPage<T> | undefined {
  const payload = readFreshBootstrapPayload();
  if (!payload) return undefined;

  const page = listingType === "sale" ? payload.saleListings : payload.rentListings;
  if (!page || !Array.isArray(page.data)) return undefined;
  if (page.page !== 1 || page.pageSize !== 12 || page.offset !== 0 || typeof page.hasMore !== "boolean") {
    return undefined;
  }
  return page as InitialListingsPage<T>;
}

export function readHomepageSnapshot<T>(key: string, maxAgeMs = DEFAULT_MAX_AGE_MS): T | undefined {
  if (!canUseStorage()) return readHomepageBootstrapSnapshot<T>(key);
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return readHomepageBootstrapSnapshot<T>(key);
    const parsed = JSON.parse(raw) as Partial<HomepageSnapshot<T>>;
    if (parsed.v !== HOMEPAGE_SNAPSHOT_VERSION || typeof parsed.ts !== "number") return readHomepageBootstrapSnapshot<T>(key);
    if (Date.now() - parsed.ts > maxAgeMs) return readHomepageBootstrapSnapshot<T>(key);
    return parsed.data as T;
  } catch {
    return readHomepageBootstrapSnapshot<T>(key);
  }
}

export function writeHomepageSnapshot<T>(key: string, data: T): void {
  if (!canUseStorage()) return;
  try {
    const snapshot: HomepageSnapshot<T> = {
      v: HOMEPAGE_SNAPSHOT_VERSION,
      ts: Date.now(),
      data,
    };
    window.localStorage.setItem(storageKey(key), JSON.stringify(snapshot));
  } catch {
    // Snapshot caching is a paint optimization. Storage quota/private-mode
    // failures must never affect the live homepage query path.
  }
}
