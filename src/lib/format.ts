/**
 * Canonical formatting utilities for prices, dates, and times.
 * Import from here — do not define local formatPrice/formatDate/fmtDate in components.
 *
 * Date helpers are locale-aware: they use the active i18next language (el → el-GR, en → en-GB).
 */

import i18n from "i18next";

function activeBcp47(): string {
  return i18n.language?.startsWith("el") ? "el-GR" : "en-GB";
}

/**
 * Format a numeric price as a Euro string, e.g. 150000 → "€150,000".
 * Returns "—" for null/undefined/non-finite values.
 */
export function formatPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `€${Number(n).toLocaleString("el-GR")}`;
}

/**
 * Format an ISO date string as a short human-readable date, e.g. "12 Apr 2026" / "12 Απρ 2026".
 * Returns "—" for null/undefined/empty values.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(activeBcp47(), {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch (_err: unknown) {
    return String(iso);
  }
}

/**
 * Format an ISO date string as a short date with weekday, e.g. "Sat, 12 Apr" / "Σαβ 12 Απρ".
 * Used for open house and auction scheduling displays.
 */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(activeBcp47(), {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Format an ISO datetime string as a short date + time, e.g. "12 Apr 2026, 14:30".
 * Used in admin panels where both date and time context matter.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(activeBcp47(), {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_err: unknown) {
    return String(iso);
  }
}

/**
 * Format an ISO datetime string as HH:MM, e.g. "14:30".
 */
export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(activeBcp47(), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format an ISO datetime string as a relative human-readable string.
 * Uses i18n translations for "just now", "Xm ago", "Xh ago", "Xd ago".
 * Falls back to English strings when i18n is not yet initialised.
 */
export function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);

  function tr(key: string, fallback: string, n?: number): string {
    const result = i18n.t(key, { defaultValue: fallback, n }) as string | undefined;
    if (result && result !== key) return result;
    return n !== undefined ? fallback.replace("{{n}}", String(n)) : fallback;
  }

  if (m < 1) return tr("timeAgo.justNow", "just now");
  if (m < 60) return tr("timeAgo.minutesAgo", "{{n}}m ago", m);
  const h = Math.floor(m / 60);
  if (h < 24) return tr("timeAgo.hoursAgo", "{{n}}h ago", h);
  return tr("timeAgo.daysAgo", "{{n}}d ago", Math.floor(h / 24));
}
