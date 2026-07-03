import { describe, expect, it } from "vitest";

import { buildSentryEvidence, redactSentryText, validateSentryEnv } from "./capture-sentry-live-evidence.mjs";

describe("Sentry live evidence capture", () => {
  it("reports missing read-only Sentry credentials without throwing", async () => {
    const evidence = await buildSentryEvidence({
      env: {},
      fetchImpl: async () => {
        throw new Error("fetch must not run without credentials");
      },
      now: () => new Date("2026-06-22T12:00:00.000Z"),
    });

    expect(evidence).toMatchObject({
      provider: "sentry",
      status: "unconfigured",
      queriedAt: "2026-06-22T12:00:00.000Z",
      missingEnv: ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"],
    });
  });

  it("redacts common PII from issue titles and tag values", async () => {
    const requests = [];
    const evidence = await buildSentryEvidence({
      env: {
        SENTRY_AUTH_TOKEN: "sntrys_very_secret",
        SENTRY_ORG: "maiprop",
        SENTRY_PROJECT: "portal",
        SENTRY_ENVIRONMENT: "production",
      },
      fetchImpl: async (url, options) => {
        requests.push({ url: String(url), authorization: options.headers.Authorization });
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "123",
              shortId: "PORTAL-1",
              title: "Crash for user kr@example.com from 203.0.113.10",
              status: "unresolved",
              count: "7",
              firstSeen: "2026-06-22T10:00:00Z",
              lastSeen: "2026-06-22T11:00:00Z",
              permalink: "https://sentry.example/issues/123",
              tags: [
                { key: "url", value: "https://portal.maiprop.co/account?email=kr@example.com" },
                { key: "environment", value: "production" },
              ],
            },
          ],
        };
      },
      now: () => new Date("2026-06-22T12:00:00.000Z"),
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].authorization).toBe("Bearer sntrys_very_secret");
    expect(evidence.status).toBe("captured");
    expect(evidence.querySucceeded).toBe(true);
    expect(evidence.environment).toBe("production");
    expect(evidence.timeRange).toBe("24h");
    expect(evidence.issueCount).toBe(1);
    expect(evidence.issues[0].title).toBe("Crash for user [redacted-email] from [redacted-ip]");
    expect(evidence.issues[0].tags.url).toBe("https://portal.maiprop.co/account?email=[redacted-email]");
  });

  it("validates exact required environment names", () => {
    expect(validateSentryEnv({ SENTRY_AUTH_TOKEN: "x", SENTRY_ORG: "o", SENTRY_PROJECT: "p" })).toEqual([]);
    expect(validateSentryEnv({ SENTRY_AUTH_TOKEN: "x" })).toEqual(["SENTRY_ORG", "SENTRY_PROJECT"]);
  });

  it("redacts standalone text", () => {
    expect(redactSentryText("ip 198.51.100.44 and email user@example.com")).toBe(
      "ip [redacted-ip] and email [redacted-email]",
    );
  });
});
