import { describe, expect, it } from "vitest";
import { onRequestGet } from "./api/release";

const marker = {
  schema_version: 1,
  release_sha: "0123456789abcdef0123456789abcdef01234567",
  source_tree: "89abcdef0123456789abcdef0123456789abcdef",
  source_run_id: "123",
  source_run_attempt: "2",
  payload_sha256:
    "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
};

describe("Pages release marker", () => {
  it("returns the exact immutable marker from the deployed artifact", async () => {
    const response = await onRequestGet({
      request: new Request("https://staging.portal.maiprop.co/api/release"),
      env: {
        ASSETS: {
          fetch: async () =>
            new Response(JSON.stringify(marker), {
              headers: { "Content-Type": "application/json" },
            }),
        },
      },
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(marker);
  });

  it("fails closed when the deployed marker is missing or malformed", async () => {
    const response = await onRequestGet({
      request: new Request("https://staging.portal.maiprop.co/api/release"),
      env: {
        ASSETS: {
          fetch: async () => new Response("{}", { status: 200 }),
        },
      },
    } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "release_marker_unavailable",
    });
  });
});
