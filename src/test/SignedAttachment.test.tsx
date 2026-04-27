/**
 * Tests for the SignedAttachment component.
 *
 * Covers all four render branches:
 *   1. Pre-resolution placeholder (no URL yet)
 *   2. Image attachment (mime starts with image/) — anchor wraps an <img>
 *   3. Non-image attachment — anchor renders the filename text
 *   4. Signed URL request fails / returns nothing — placeholder stays
 *
 * Closes audit FINDING-A's coverage gap on the new signed-attachment code path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

const { createSignedUrl, supabaseMock } = vi.hoisted(() => {
  const createSignedUrl = vi.fn();
  const supabaseMock = {
    storage: {
      from: vi.fn(() => ({ createSignedUrl })),
    },
  };
  return { createSignedUrl, supabaseMock };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));

import { SignedAttachment } from "@/components/messages/SignedAttachment";

beforeEach(() => {
  cleanup();
  createSignedUrl.mockReset();
  supabaseMock.storage.from.mockClear();
});

describe("SignedAttachment", () => {
  it("renders the filename placeholder before the signed URL resolves", () => {
    // Return a never-resolving promise so the component sticks in its loading branch.
    createSignedUrl.mockImplementation(() => new Promise(() => {}));
    render(<SignedAttachment path="u1/c1/file.png" filename="file.png" mimeType="image/png" />);
    expect(screen.getByText("file.png")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(supabaseMock.storage.from).toHaveBeenCalledWith("message-attachments");
    expect(createSignedUrl).toHaveBeenCalledWith("u1/c1/file.png", 3600);
  });

  it("renders an inline <img> wrapped in an anchor for image mime types", async () => {
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example/foo.png" },
      error: null,
    });
    render(<SignedAttachment path="u1/c1/foo.png" filename="foo.png" mimeType="image/png" />);
    const img = await waitFor(() => screen.getByRole("img"));
    expect(img.getAttribute("src")).toBe("https://signed.example/foo.png");
    expect(img.getAttribute("alt")).toBe("foo.png");
    const anchor = img.closest("a");
    expect(anchor?.getAttribute("href")).toBe("https://signed.example/foo.png");
    expect(anchor?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(anchor?.getAttribute("target")).toBe("_blank");
  });

  it("renders a download link for non-image mime types", async () => {
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example/report.pdf" },
      error: null,
    });
    render(
      <SignedAttachment path="u1/c1/report.pdf" filename="report.pdf" mimeType="application/pdf" />,
    );
    const anchor = await waitFor(() => screen.getByRole("link", { name: "report.pdf" }));
    expect(anchor.getAttribute("href")).toBe("https://signed.example/report.pdf");
    expect(anchor.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("stays on the placeholder when the signed URL request returns no URL", async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "boom" } });
    render(<SignedAttachment path="u1/c1/x.bin" filename="x.bin" mimeType="application/octet-stream" />);
    // Placeholder text persists.
    await waitFor(() => expect(screen.getByText("x.bin")).toBeTruthy());
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("ignores a late signed URL response after the component unmounts", async () => {
    let resolve!: (value: { data: { signedUrl: string } | null; error: unknown }) => void;
    createSignedUrl.mockImplementation(
      () => new Promise((r) => {
        resolve = r;
      }),
    );
    const { unmount } = render(
      <SignedAttachment path="u1/c1/late.png" filename="late.png" mimeType="image/png" />,
    );
    unmount();
    // No throw / state-update warning when the promise resolves post-unmount.
    resolve({ data: { signedUrl: "https://signed.example/late.png" }, error: null });
    await new Promise((r) => setTimeout(r, 0));
  });
});
