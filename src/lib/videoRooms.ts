export type MaiPropVideoRoomKind = "consultation" | "professional" | "viewing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KNOWN_VIDEO_PROVIDERS = [
  { pattern: "zoom.us", name: "Zoom" },
  { pattern: "whereby.com", name: "Whereby" },
  { pattern: "meet.google.com", name: "Google Meet" },
  { pattern: "teams.microsoft.com", name: "Microsoft Teams" },
  { pattern: "webex.com", name: "Webex" },
];

export function normalizeVideoLink(videoLink: string | null | undefined) {
  const trimmed = videoLink?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch (_err: unknown) {
    return null;
  }
}

export function isExternalVideoLink(videoLink: string | null | undefined) {
  return Boolean(normalizeVideoLink(videoLink));
}

export function getVideoPlatformName(videoLink: string | null | undefined) {
  const normalized = normalizeVideoLink(videoLink);
  if (!normalized) return null;
  const provider = KNOWN_VIDEO_PROVIDERS.find(({ pattern }) => normalized.includes(pattern));
  return provider?.name ?? "external video link";
}

export function createMaiPropVideoRoomTopic(kind: MaiPropVideoRoomKind, id: string) {
  return `video:${kind}:${id}`;
}

export function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

export function createMaiPropVideoRoomDisplayName(kind: MaiPropVideoRoomKind, id: string) {
  const suffix = id.slice(0, 8);
  return `maiprop-${kind}-${suffix}`;
}

export function createProfessionalVideoRoomPath(professionalId: string, consultationId?: string | null) {
  return consultationId ? `/video-room/${professionalId}/${consultationId}` : `/video-room/${professionalId}`;
}

export function createViewingVideoRoomPath(viewingId: string) {
  return `/video-viewing/${viewingId}`;
}

export function createAbsoluteVideoRoomUrl(path: string) {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}
