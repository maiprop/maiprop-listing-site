/**
 * Tests for the Cloudflare Pages Function `sitemap-dynamic.xml.ts`.
 *
 * The function:
 *   - Falls back to the static /sitemap.xml when SUPABASE_PROJECT_ID is unset.
 *   - Proxies https://<projectId>.supabase.co/functions/v1/sitemap when set.
 *   - Re-emits the upstream body with explicit XML headers + cache-control.
 *   - Falls back to /sitemap.xml on upstream failure (non-2xx or thrown).
 *
 * We drive it purely via the global `fetch` stub.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onRequestGet } from "./sitemap-dynamic.xml";

type Ctx = Parameters<typeof onRequestGet>[0];

const realFetch = globalThis.fetch;

function makeCtx(projectId: string | undefined, url = "https://portal.maiprop.co/sitemap-dynamic.xml"): Ctx {
  return {
    request: new Request(url),
    env: { SUPABASE_PROJECT_ID: projectId },
  } as unknown as Ctx;
}

beforeEach(() => {
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("sitemap-dynamic.xml Pages Function", () => {
  it("falls back to /sitemap.xml when SUPABASE_PROJECT_ID is undefined", async () => {
    const fallback = new Response("<urlset/>", { status: 200, headers: { "Content-Type": "application/xml" } });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(fallback);
    const res = await onRequestGet(makeCtx(undefined));
    expect(res.status).toBe(200);
    const calledWith = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(String(calledWith)).toContain("/sitemap.xml");
  });

  it("proxies https://<projectId>.supabase.co/functions/v1/sitemap when project id is set", async () => {
    const upstreamBody = "<urlset><url><loc>https://portal.maiprop.co/listings/1</loc></url></urlset>";
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(upstreamBody, { status: 200 }),
    );
    const res = await onRequestGet(makeCtx("abcdefghijklmnop"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600, s-maxage=600");
    const text = await res.text();
    expect(text).toContain("<urlset>");
    const calledWith = String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledWith).toBe("https://abcdefghijklmnop.supabase.co/functions/v1/sitemap");
  });

  it("forwards X-Forwarded-Host and Accept headers and asks for the CF cache", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("<urlset/>", { status: 200 }),
    );
    await onRequestGet(makeCtx("xyz1234567890"));
    const init = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit & {
      cf?: { cacheTtl?: number; cacheEverything?: boolean };
    };
    expect(init.headers).toMatchObject({
      "X-Forwarded-Host": "maiprop.co",
      Accept: expect.stringContaining("application/xml"),
    });
    expect(init.cf).toEqual({ cacheTtl: 600, cacheEverything: true });
  });

  it("falls back to /sitemap.xml when the upstream returns a non-2xx status", async () => {
    let call = 0;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve(new Response("Bad Gateway", { status: 502 }));
      return Promise.resolve(new Response("<urlset/>", { status: 200 }));
    });
    const res = await onRequestGet(makeCtx("xyz1234567890"));
    expect(res.status).toBe(200);
    expect(call).toBe(2);
    const fallbackUrl = String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0]);
    expect(fallbackUrl).toContain("/sitemap.xml");
  });

  it("falls back to /sitemap.xml when the upstream fetch throws", async () => {
    let call = 0;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      call++;
      if (call === 1) return Promise.reject(new Error("DNS failure"));
      return Promise.resolve(new Response("<urlset/>", { status: 200 }));
    });
    const res = await onRequestGet(makeCtx("xyz1234567890"));
    expect(res.status).toBe(200);
    expect(call).toBe(2);
  });

  it("uses an abortable upstream sitemap fetch before falling back", async () => {
    let call = 0;
    let observedSignal: AbortSignal | undefined;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      call++;
      if (call === 1) {
        observedSignal = init?.signal ?? undefined;
        return Promise.reject(new DOMException("Timeout", "AbortError"));
      }
      return Promise.resolve(new Response("<urlset/>", { status: 200 }));
    });

    const res = await onRequestGet(makeCtx("xyz1234567890"));
    expect(res.status).toBe(200);
    expect(call).toBe(2);
    expect(observedSignal).toBeInstanceOf(AbortSignal);
  });
});
