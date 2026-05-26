import { describe, expect, it } from "vitest";
import {
  findPublicApiFixtureMarker,
  PUBLIC_API_FIXTURE_MARKERS,
} from "./public-api-fixture-guard.mjs";

describe("production deploy public API fixture guard", () => {
  it("documents the production-blocked fixture markers", () => {
    expect(PUBLIC_API_FIXTURE_MARKERS.map((marker) => marker.name)).toEqual([
      "supervisor marker",
      "full publish E2E marker",
      "full publish QA tag",
      "Devin test marker",
      "test free listing marker",
    ]);
  });

  it("finds nested supervisor fixtures and reports their JSON path", () => {
    const result = findPublicApiFixtureMarker({
      data: [
        {
          id: "listing-1",
          title: "supervisor-1779128352056 pro agent maisonette",
        },
      ],
    });

    expect(result).toEqual({
      marker: "supervisor marker",
      path: "$.data[0].title",
      value: "supervisor-1779128352056 pro agent maisonette",
    });
  });

  it("flags E2E publishing records, QA tags, and historical test listing names", () => {
    expect(findPublicApiFixtureMarker({ title: "E2E-FULL-PUBLISH-20260526T161856Z maisonette" })?.marker)
      .toBe("full publish E2E marker");
    expect(findPublicApiFixtureMarker({ tags: ["qa-full-publish"] })?.marker)
      .toBe("full publish QA tag");
    expect(findPublicApiFixtureMarker({ agent: "Devin Test" })?.marker)
      .toBe("Devin test marker");
    expect(findPublicApiFixtureMarker({ title: "Test Free Listing" })?.marker)
      .toBe("test free listing marker");
  });

  it("allows clean production-shaped public API payloads", () => {
    expect(findPublicApiFixtureMarker({
      data: [
        {
          title: "Renovated apartment in Koukaki",
          tags: ["featured", "city-view"],
          agent: { name: "MaiProp Partner" },
        },
      ],
    })).toBeNull();
  });
});
