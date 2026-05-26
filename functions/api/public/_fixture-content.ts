type PublicFixtureListing = Record<string, unknown> & {
  title?: unknown;
  address?: unknown;
  tags?: unknown;
};

const PUBLIC_FIXTURE_PATTERNS = [
  /\bsupervisor-\d+\b/i,
  /\bE2E-FULL-PUBLISH-[A-Z0-9-]*\b/i,
  /\bqa-full-publish\b/i,
  /\bDevin Test\b/i,
  /\bTest Free Listing\b/i,
];

function hasPublicFixtureMarker(value: unknown): boolean {
  if (typeof value === "string") {
    return PUBLIC_FIXTURE_PATTERNS.some((pattern) => pattern.test(value));
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasPublicFixtureMarker(item));
  }

  return false;
}

export function isPublicFixtureListing(row: PublicFixtureListing): boolean {
  return [row.title, row.address, row.tags].some((value) => hasPublicFixtureMarker(value));
}

export function publicListingRows<T extends PublicFixtureListing>(rows: T[], limit?: number): T[] {
  const cleanRows = rows.filter((row) => !isPublicFixtureListing(row));
  return typeof limit === "number" ? cleanRows.slice(0, limit) : cleanRows;
}
