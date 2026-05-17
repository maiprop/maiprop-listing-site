const RELOAD_STORAGE_KEY = "maiprop:last-chunk-reload";
const RELOAD_COOLDOWN_MS = 60_000;

const CHUNK_LOAD_PATTERNS = [
  /ChunkLoadError/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /dynamically imported module/i,
  /Loading chunk \d+ failed/i,
  /module script.*MIME type/i,
];

type ReloadAction = () => unknown;
type ReloadStorage = Pick<Storage, "getItem" | "setItem">;

interface RecoveryOptions {
  now?: () => number;
  reload?: ReloadAction;
  storage?: ReloadStorage;
}

type VitePreloadErrorEvent = Event & { payload?: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringField = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  return typeof value === "string" ? value : "";
};

const messageFrom = (error: unknown): string => {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "string") return error;
  if (!isRecord(error)) return "";

  return `${stringField(error, "name")} ${stringField(error, "message")}`.trim();
};

export const isChunkLoadError = (error: unknown): boolean => {
  const message = messageFrom(error);
  return CHUNK_LOAD_PATTERNS.some((pattern) => pattern.test(message));
};

const safeSessionStorage = (win: Window): ReloadStorage | undefined => {
  try {
    return win.sessionStorage;
  } catch {
    return undefined;
  }
};

const safeReload = (win: Window): ReloadAction => {
  return () => {
    win.location.reload();
    return true;
  };
};

const currentWindow = (): Window | undefined =>
  typeof window === "undefined" ? undefined : window;

const readLastReload = (storage: ReloadStorage): number | null => {
  const storedAt = storage.getItem(RELOAD_STORAGE_KEY);
  const parsed = storedAt === null ? NaN : Number(storedAt);
  return Number.isFinite(parsed) ? parsed : null;
};

const isWithinCooldown = (lastReload: number | null, nowMs: number): boolean =>
  lastReload !== null && nowMs - lastReload < RELOAD_COOLDOWN_MS;

const storageForWindow = (win: Window | undefined): ReloadStorage | undefined =>
  win ? safeSessionStorage(win) : undefined;

const reloadForWindow = (win: Window | undefined): ReloadAction | undefined =>
  win ? safeReload(win) : undefined;

const invokeReload = (reload: ReloadAction): boolean => {
  try {
    return reload() !== false;
  } catch {
    return false;
  }
};

const canReload = (storage: ReloadStorage | undefined, nowMs: number): boolean => {
  if (!storage) return false;

  try {
    if (isWithinCooldown(readLastReload(storage), nowMs)) {
      return false;
    }
    storage.setItem(RELOAD_STORAGE_KEY, String(nowMs));
  } catch {
    return false;
  }

  return true;
};

// skipcq: JS-R1005 - Recovery must classify the error, guard storage, throttle, and invoke reload safely.
export const recoverFromChunkLoadError = (error: unknown, options: RecoveryOptions = {}): boolean => {
  if (!isChunkLoadError(error)) return false;

  const win = currentWindow();
  const nowMs = options.now?.() ?? Date.now();
  const storage = options.storage ?? storageForWindow(win);
  const reload = options.reload ?? reloadForWindow(win);

  if (!reload || !canReload(storage, nowMs)) return false;

  return invokeReload(reload);
};

export const installChunkLoadRecovery = (win: Window = window): void => {
  const reload = safeReload(win);
  const options = { reload, storage: safeSessionStorage(win) };

  win.addEventListener("vite:preloadError", (event: VitePreloadErrorEvent) => {
    if (recoverFromChunkLoadError(event.payload ?? event, options)) {
      event.preventDefault();
    }
  });

  win.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    if (recoverFromChunkLoadError(event.reason, options)) {
      event.preventDefault();
    }
  });
};
