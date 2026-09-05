import { describe, expect, it } from "vitest";
import { isExpectedNMinusOneCorsConsoleError } from "../e2e/helpers/stagingCatalogueConsolePolicy.ts";

const loopbackOrigin = "http://127.0.0.1:8788";
const corsMessage = (functionName) =>
  `Access to fetch at 'https://staging-project.supabase.co/functions/v1/${functionName}' from origin '${loopbackOrigin}' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: The 'Access-Control-Allow-Origin' header has a value 'https://maiprop.co' that is not equal to the supplied origin. Have the server send the header with a valid value.`;

describe("N-1 staging catalogue console policy", () => {
  it.each(["owner-pro-status", "record-listing-view"])(
    "accepts the expected %s loopback preflight rejection only in compatibility mode",
    (functionName) => {
      const observation = {
        text: corsMessage(functionName),
        sourceUrl: "",
        stagingBaseUrl: loopbackOrigin,
      };

      expect(isExpectedNMinusOneCorsConsoleError(observation, true)).toBe(true);
      expect(isExpectedNMinusOneCorsConsoleError(observation, false)).toBe(false);
      expect(isExpectedNMinusOneCorsConsoleError({
        ...observation,
        stagingBaseUrl: "https://maiprop-listing-site-staging.pages.dev",
      }, true)).toBe(false);
    },
  );

  it("accepts the paired Chromium resource error only when its source is an expected function", () => {
    const observation = {
      text: "Failed to load resource: net::ERR_FAILED",
      sourceUrl: "https://staging-project.supabase.co/functions/v1/owner-pro-status",
      stagingBaseUrl: loopbackOrigin,
    };

    expect(isExpectedNMinusOneCorsConsoleError(observation, true)).toBe(true);
    expect(isExpectedNMinusOneCorsConsoleError({
      ...observation,
      sourceUrl: "https://staging-project.supabase.co/functions/v1/another-function",
    }, true)).toBe(false);
    expect(isExpectedNMinusOneCorsConsoleError({
      ...observation,
      sourceUrl: "https://unrelated.example/functions/v1/owner-pro-status",
    }, true)).toBe(false);
  });

  it("rejects unrelated or materially different CORS failures", () => {
    expect(isExpectedNMinusOneCorsConsoleError({
      text: corsMessage("create-listing"),
      sourceUrl: "",
      stagingBaseUrl: loopbackOrigin,
    }, true)).toBe(false);
    expect(isExpectedNMinusOneCorsConsoleError({
      text: corsMessage("owner-pro-status").replace(
        "Response to preflight request doesn't pass access control check",
        "No 'Access-Control-Allow-Origin' header is present",
      ),
      sourceUrl: "",
      stagingBaseUrl: loopbackOrigin,
    }, true)).toBe(false);
  });
});
