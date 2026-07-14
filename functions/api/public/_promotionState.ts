type PromotionStateRow = {
  is_featured?: unknown;
  featured_until?: unknown;
  priority_placement?: unknown;
  priority_until?: unknown;
};

function isFutureTimestamp(value: unknown, nowMs: number): boolean {
  if (typeof value !== "string") return false;
  const expiresAt = Date.parse(value);
  return Number.isFinite(expiresAt) && expiresAt > nowMs;
}

export function hasActivePriority(row: PromotionStateRow, nowMs: number): boolean {
  return Number(row.priority_placement ?? 0) > 0 && isFutureTimestamp(row.priority_until, nowMs);
}

export function hasActiveSpotlight(row: PromotionStateRow, nowMs: number): boolean {
  return row.is_featured === true && isFutureTimestamp(row.featured_until, nowMs);
}

export function normalizePublicPromotionState<T extends PromotionStateRow>(
  row: T,
  nowMs: number,
): T & { is_featured: boolean; priority_placement: number } {
  return {
    ...row,
    is_featured: hasActiveSpotlight(row, nowMs),
    priority_placement: hasActivePriority(row, nowMs) ? 1 : 0,
  };
}
