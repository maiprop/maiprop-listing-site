import { describe, expect, it } from "vitest";
import { parseTapProof } from "./parse-tap-proof.mjs";

describe("TAP proof parser", () => {
  it("derives the plan from a complete proof when no fixed plan is supplied", () => {
    expect(parseTapProof(
      ["ok 1 - reader works", "ok 2 - writer denied", "1..2", ""].join("\n"),
    )).toMatchObject({ status: "passed", plan: 2, okCount: 2 });
  });

  it("accepts one complete numbered plan", () => {
    expect(parseTapProof(
      ["TAP version 13", "ok 1 - reader works", "ok 2 - writer denied", "1..2", ""].join("\n"),
      { expectedPlan: 2 },
    )).toMatchObject({ status: "passed", plan: 2, okCount: 2 });
  });

  it.each([
    ["bailout", "ok 1 - first\nBail out! database disconnected\n1..1\n", /bailout/i],
    ["failed result", "ok 1 - first\nnot ok 2 - second\n1..2\n", /not ok/i],
    ["missing result", "ok 1 - first\n1..2\n", /truncated/i],
    ["duplicate result", "ok 1 - first\nok 1 - repeated\n1..1\n", /duplicate/i],
    ["missing plan", "ok 1 - first\n", /exactly one plan/i],
    ["duplicate plan", "1..1\nok 1 - first\n1..1\n", /exactly one plan/i],
    ["wrong plan", "ok 1 - first\n1..1\n", /expected plan/i],
  ])("rejects %s", (_label, text, error) => {
    const expectedPlan = _label === "wrong plan" ? 2 : undefined;
    expect(() => parseTapProof(text, { expectedPlan })).toThrow(error);
  });
});
