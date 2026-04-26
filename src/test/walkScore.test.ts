import { describe, it, expect } from "vitest";
import { computeWalkScore, walkScoreLabel, walkScoreColour } from "@/lib/walkScore";
import type { POIForScore } from "@/lib/walkScore";

describe("computeWalkScore", () => {
  it("returns 0 for empty POI list", () => {
    expect(computeWalkScore([])).toBe(0);
  });

  it("returns 0 for null-like input (empty)", () => {
    expect(computeWalkScore([] as POIForScore[])).toBe(0);
  });

  it("returns a number between 0 and 100", () => {
    const pois: POIForScore[] = [
      { distanceKm: 0.1, category: "transit" },
      { distanceKm: 0.2, category: "shopping" },
      { distanceKm: 0.3, category: "cafe" },
    ];
    const score = computeWalkScore(pois);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns a high score when all POIs are very close", () => {
    const pois: POIForScore[] = [
      { distanceKm: 0.05, category: "transit" },
      { distanceKm: 0.05, category: "shopping" },
      { distanceKm: 0.05, category: "cafe" },
      { distanceKm: 0.05, category: "school" },
      { distanceKm: 0.05, category: "park" },
      { distanceKm: 0.05, category: "hospital" },
      { distanceKm: 0.05, category: "restaurant" },
    ];
    const score = computeWalkScore(pois);
    expect(score).toBeGreaterThan(80);
  });

  it("returns a low score when all POIs are far away", () => {
    const pois: POIForScore[] = [
      { distanceKm: 5, category: "transit" },
      { distanceKm: 5, category: "shopping" },
    ];
    const score = computeWalkScore(pois);
    expect(score).toBeLessThan(30);
  });

  it("uses the closest POI per category", () => {
    const nearTransit: POIForScore[] = [
      { distanceKm: 0.05, category: "transit" },
      { distanceKm: 2.0, category: "transit" },
    ];
    const farTransit: POIForScore[] = [
      { distanceKm: 2.0, category: "transit" },
    ];
    expect(computeWalkScore(nearTransit)).toBeGreaterThan(computeWalkScore(farTransit));
  });

  it("ignores unknown categories", () => {
    const known: POIForScore[] = [{ distanceKm: 0.1, category: "transit" }];
    const withUnknown: POIForScore[] = [
      { distanceKm: 0.1, category: "transit" },
      { distanceKm: 0.1, category: "zoo" },
    ];
    expect(computeWalkScore(withUnknown)).toBe(computeWalkScore(known));
  });

  it("is deterministic for the same input", () => {
    const pois: POIForScore[] = [
      { distanceKm: 0.3, category: "transit" },
      { distanceKm: 0.5, category: "cafe" },
    ];
    expect(computeWalkScore(pois)).toBe(computeWalkScore(pois));
  });
});

describe("walkScoreLabel", () => {
  it("returns Walker's Paradise for score >= 90", () => {
    expect(walkScoreLabel(90)).toBe("Walker's Paradise");
    expect(walkScoreLabel(100)).toBe("Walker's Paradise");
  });

  it("returns Very Walkable for 70-89", () => {
    expect(walkScoreLabel(70)).toBe("Very Walkable");
    expect(walkScoreLabel(89)).toBe("Very Walkable");
  });

  it("returns Walkable for 50-69", () => {
    expect(walkScoreLabel(50)).toBe("Walkable");
    expect(walkScoreLabel(69)).toBe("Walkable");
  });

  it("returns Some Errands for 25-49", () => {
    expect(walkScoreLabel(25)).toBe("Some Errands");
    expect(walkScoreLabel(49)).toBe("Some Errands");
  });

  it("returns Car Dependent for < 25", () => {
    expect(walkScoreLabel(0)).toBe("Car Dependent");
    expect(walkScoreLabel(24)).toBe("Car Dependent");
  });
});

describe("walkScoreColour", () => {
  it("returns green for score >= 80", () => {
    expect(walkScoreColour(80)).toBe("#22c55e");
    expect(walkScoreColour(100)).toBe("#22c55e");
  });

  it("returns lime for 60-79", () => {
    expect(walkScoreColour(60)).toBe("#84cc16");
    expect(walkScoreColour(79)).toBe("#84cc16");
  });

  it("returns yellow for 40-59", () => {
    expect(walkScoreColour(40)).toBe("#eab308");
    expect(walkScoreColour(59)).toBe("#eab308");
  });

  it("returns orange for 20-39", () => {
    expect(walkScoreColour(20)).toBe("#f97316");
    expect(walkScoreColour(39)).toBe("#f97316");
  });

  it("returns red for < 20", () => {
    expect(walkScoreColour(0)).toBe("#ef4444");
    expect(walkScoreColour(19)).toBe("#ef4444");
  });
});
