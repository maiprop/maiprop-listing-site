/**
 * Tests for shared AI answer safety prompt rules.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildVettedAnswerRules, getCurrentDateIso } from "./aiSafety.ts";

Deno.test("getCurrentDateIso returns a stable YYYY-MM-DD date", () => {
  assertEquals(getCurrentDateIso(new Date("2026-06-11T12:34:56Z")), "2026-06-11");
});

Deno.test("buildVettedAnswerRules includes currentness, cross-checking, and no-fabrication rules", () => {
  const rules = buildVettedAnswerRules({
    currentDate: "2026-06-11",
    scope: "test assistant",
    timeSensitiveTopics: ["school catchments"],
  });

  assertEquals(rules.includes("TRUST, RECENCY, AND SAFETY RULES for test assistant"), true);
  assertEquals(rules.includes("Current date: 2026-06-11"), true);
  assertEquals(rules.includes("school catchments"), true);
  assertEquals(rules.includes("Cross-check internally before answering"), true);
  assertEquals(rules.includes("Do not invent comparable sales"), true);
  assertEquals(rules.includes("Never cite, imply, or fabricate sources you have not actually used"), true);
  assertEquals(rules.includes("include a short due-diligence step"), true);
});
