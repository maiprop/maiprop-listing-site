const RELOAD_STORAGE_KEY = "maiprop:last-chunk-reload";
const RECOVERY_WINDOW_MS = 5 * 60_000;
const SAME_CHUNK_COOLDOWN_MS = 10_000;
const MAX_RELOAD_ATTEMPTS = 3;

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
type ChunkRecoveryState = {
  attempts: number;
  windowStartedAt: number;
  lastReloadAt: number;
  lastChunkKey: string;
};

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

const chunkKeyFrom = (error: unknown): string => {
  const message = messageFrom(error);
  const assetMatch = message.match(/\/assets\/[^\s)'"]+/);
  return assetMatch?.[0] ?? message.slice(0, 160);
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

const emptyState = (nowMs: number): ChunkRecoveryState => ({
  attempts: 0,
  windowStartedAt: nowMs,
  lastReloadAt: 0,
  lastChunkKey: "",
});

const finiteNumber = (value: unknown): number | null => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const legacyRecoveryState = (raw: string): ChunkRecoveryState | null => {
  const legacyTimestamp = finiteNumber(raw);
  return legacyTimestamp === null
    ? null
    : {
        attempts: 1,
        windowStartedAt: legacyTimestamp,
        lastReloadAt: legacyTimestamp,
        lastChunkKey: "",
      };
};

const parseRecoveryJson = (raw: string): Partial<ChunkRecoveryState> | null => {
  try {
    return JSON.parse(raw) as Partial<ChunkRecoveryState>;
  } catch {
    return null;
  }
};

// skipcq: JS-R1005 - Stored JSON normalization validates each persisted field before trusting recovery state.
const normalizedRecoveryState = (
  parsed: Partial<ChunkRecoveryState>,
  nowMs: number,
): ChunkRecoveryState | null => {
  const attempts = finiteNumber(parsed.attempts ?? 0);
  const windowStartedAt = finiteNumber(parsed.windowStartedAt ?? nowMs);
  const lastReloadAt = finiteNumber(parsed.lastReloadAt ?? 0);
  if (attempts === null || windowStartedAt === null || lastReloadAt === null) return null;

  return {
    attempts,
    windowStartedAt,
    lastReloadAt,
    lastChunkKey: typeof parsed.lastChunkKey === "string" ? parsed.lastChunkKey : "",
  };
};

const parsedRecoveryState = (raw: string, nowMs: number): ChunkRecoveryState | null => {
  const parsed = parseRecoveryJson(raw);
  return parsed ? normalizedRecoveryState(parsed, nowMs) : null;
};

const readRecoveryState = (storage: ReloadStorage, nowMs: number): ChunkRecoveryState => {
  const raw = storage.getItem(RELOAD_STORAGE_KEY);
  if (!raw) return emptyState(nowMs);

  return legacyRecoveryState(raw) ?? parsedRecoveryState(raw, nowMs) ?? emptyState(nowMs);
};

const resetExpiredWindow = (state: ChunkRecoveryState, nowMs: number): ChunkRecoveryState =>
  nowMs - state.windowStartedAt > RECOVERY_WINDOW_MS ? emptyState(nowMs) : state;

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

const isSameChunkCooldownActive = (state: ChunkRecoveryState, nowMs: number, chunkKey: string): boolean =>
  state.lastChunkKey === chunkKey && nowMs - state.lastReloadAt < SAME_CHUNK_COOLDOWN_MS;

const isReloadAllowed = (state: ChunkRecoveryState, nowMs: number, chunkKey: string): boolean =>
  state.attempts < MAX_RELOAD_ATTEMPTS && !isSameChunkCooldownActive(state, nowMs, chunkKey);

const writeRecoveryState = (storage: ReloadStorage, state: ChunkRecoveryState, nowMs: number, chunkKey: string): void => {
  storage.setItem(RELOAD_STORAGE_KEY, JSON.stringify({
    attempts: state.attempts + 1,
    windowStartedAt: state.windowStartedAt,
    lastReloadAt: nowMs,
    lastChunkKey: chunkKey,
  }));
};

const persistReloadAttempt = (storage: ReloadStorage, nowMs: number, chunkKey: string): boolean => {
  try {
    const state = resetExpiredWindow(readRecoveryState(storage, nowMs), nowMs);
    if (!isReloadAllowed(state, nowMs, chunkKey)) return false;
    writeRecoveryState(storage, state, nowMs, chunkKey);
    return true;
  } catch {
    return false;
  }
};

const canReload = (storage: ReloadStorage | undefined, nowMs: number, chunkKey: string): boolean =>
  storage ? persistReloadAttempt(storage, nowMs, chunkKey) : false;

// skipcq: JS-R1005 - Recovery must classify the error, guard storage, throttle, and invoke reload safely.
export const recoverFromChunkLoadError = (error: unknown, options: RecoveryOptions = {}): boolean => {
  if (!isChunkLoadError(error)) return false;

  const win = currentWindow();
  const nowMs = options.now?.() ?? Date.now();
  const chunkKey = chunkKeyFrom(error);
  const storage = options.storage ?? storageForWindow(win);
  const reload = options.reload ?? reloadForWindow(win);

  if (!reload || !canReload(storage, nowMs, chunkKey)) return false;

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

  win.addEventListener("error", (event: ErrorEvent) => {
    if (recoverFromChunkLoadError(event.error ?? event.message ?? event, options)) {
      event.preventDefault();
    }
  }, true);
};
