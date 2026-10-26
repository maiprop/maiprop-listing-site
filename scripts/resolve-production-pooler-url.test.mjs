import { describe, expect, it } from "vitest";
import {
  buildPoolerUrl,
  readApiRegion,
} from "./resolve-production-pooler-url.mjs";

describe("resolve-production-pooler-url", () => {
  it("reads the region from the Supabase project response", () => {
    expect(readApiRegion(JSON.stringify({ region: "eu-west-1" }))).toBe("eu-west-1");
  });

  it("rejects missing or malformed regions", () => {
    expect(() => readApiRegion("{}")).toThrow("Could not resolve");
    expect(() => readApiRegion("not json")).toThrow("not valid JSON");
    expect(() => readApiRegion(JSON.stringify({ region: "eu west 1" }))).toThrow(
      "Could not resolve",
    );
  });

  it("builds a pooler URL with a singly-encoded password", () => {
    const url = buildPoolerUrl({
      password: "p@ss:w/rd",
      hostname: "aws-0-eu-west-1.pooler.supabase.com",
      port: "5432",
    });

    expect(url).toBe(
      "postgresql://postgres.qvvicunqcrwpioqnvzxf:p%40ss%3Aw%2Frd" +
      "@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=5",
    );
    // Decoding once must recover the exact password (no double encoding).
    expect(decodeURIComponent(new URL(url).password)).toBe("p@ss:w/rd");
  });

  it("refuses unexpected pooler hosts and ports", () => {
    const base = {
      password: "secret",
      hostname: "aws-0-eu-west-1.pooler.supabase.com",
      port: "5432",
    };
    expect(() => buildPoolerUrl({ ...base, password: "" })).toThrow("password is empty");
    expect(() => buildPoolerUrl({ ...base, hostname: "db.qvvicunqcrwpioqnvzxf.supabase.co" }))
      .toThrow("unexpected pooler hostname");
    expect(() => buildPoolerUrl({ ...base, hostname: "evil.example.com" }))
      .toThrow("unexpected pooler hostname");
    expect(() => buildPoolerUrl({ ...base, port: "5433" })).toThrow("unexpected pooler port");
  });

  it("supports the transaction-mode pooler port", () => {
    const url = buildPoolerUrl({
      password: "secret",
      hostname: "aws-0-eu-central-1.pooler.supabase.com",
      port: "6543",
    });
    expect(url).toContain(":6543/postgres?");
  });
});
