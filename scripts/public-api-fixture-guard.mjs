export const PUBLIC_API_FIXTURE_MARKERS = [
  { name: "supervisor marker", pattern: /\bsupervisor-\d+\b/i },
  { name: "full publish E2E marker", pattern: /\bE2E-FULL-PUBLISH-[A-Z0-9-]*\b/i },
  { name: "full publish QA tag", pattern: /\bqa-full-publish\b/i },
  { name: "Devin test marker", pattern: /\bDevin Test\b/i },
  { name: "test free listing marker", pattern: /\bTest Free Listing\b/i },
];

const appendJsonPath = (path, key) => {
  if (typeof key === "number") return `${path}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
};

const previewValue = (value) => value.replace(/\s+/g, " ").trim().slice(0, 160);

export const findPublicApiFixtureMarker = (value, path = "$", seen = new WeakSet()) => {
  if (typeof value === "string") {
    const marker = PUBLIC_API_FIXTURE_MARKERS.find(({ pattern }) => pattern.test(value));
    return marker ? { marker: marker.name, path, value: previewValue(value) } : null;
  }

  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const result = findPublicApiFixtureMarker(item, appendJsonPath(path, index), seen);
      if (result) return result;
    }
    return null;
  }

  for (const [key, item] of Object.entries(value)) {
    const result = findPublicApiFixtureMarker(item, appendJsonPath(path, key), seen);
    if (result) return result;
  }

  return null;
};
