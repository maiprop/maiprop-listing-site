import { describe, it, expect } from "vitest";
import { walkScoreLabel, walkScoreColour } from "@/lib/walkScore";

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
