import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => {
  const uploadMock = vi.fn();
  const getPublicUrlMock = vi.fn((path: string) => ({
    data: { publicUrl: `https://cdn.maiprop.test/${path}` },
  }));
  const fromMock = vi.fn(() => ({
    upload: uploadMock,
    getPublicUrl: getPublicUrlMock,
  }));
  return {
    fromMock,
    getPublicUrlMock,
    uploadMock,
    supabase: null as ReturnType<typeof import("@/test/utils").makeMockSupabase> | null,
  };
});

vi.mock("@/integrations/supabase/client", async () => {
  const { makeMockSupabase } = await vi.importActual<typeof import("@/test/utils")>("@/test/utils");
  storageMocks.supabase = makeMockSupabase();
  storageMocks.supabase.storage.from = storageMocks.fromMock;
  return { supabase: storageMocks.supabase };
});

import { uploadListingImage, uploadProjectMedia } from "@/lib/buildingListingUploads";

describe("building listing upload helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.uploadMock.mockResolvedValue({ error: null });
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "123e4567-e89b-12d3-a456-426614174000",
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates and uploads listing images to the user-owned listing bucket path", async () => {
    const file = new File(["image"], "front.webp", { type: "image/webp" });

    const result = await uploadListingImage(file, "user-1");

    expect(storageMocks.fromMock).toHaveBeenCalledWith("listing-images");
    expect(storageMocks.uploadMock).toHaveBeenCalledWith(
      "user-1/123e4567-e89b-12d3-a456-426614174000.webp",
      file,
      { upsert: false },
    );
    expect(storageMocks.getPublicUrlMock).toHaveBeenCalledWith(
      "user-1/123e4567-e89b-12d3-a456-426614174000.webp",
    );
    expect(result).toEqual({
      id: "123e4567-e89b-12d3-a456-426614174000",
      url: "https://cdn.maiprop.test/user-1/123e4567-e89b-12d3-a456-426614174000.webp",
    });
  });

  it("rejects non-image listing uploads before calling storage", async () => {
    const file = new File(["text"], "notes.txt", { type: "text/plain" });

    await expect(uploadListingImage(file, "user-1")).rejects.toThrow(
      /Unsupported image type/,
    );
    expect(storageMocks.uploadMock).not.toHaveBeenCalled();
  });

  it("uses the PDF-only allowlist for brochure media", async () => {
    const file = new File(["pdf"], "brochure.pdf", { type: "application/pdf" });

    const url = await uploadProjectMedia(file, "user-1", "project-1", "brochure_pdf");

    expect(storageMocks.fromMock).toHaveBeenCalledWith("project-media");
    expect(storageMocks.uploadMock).toHaveBeenCalledWith(
      "user-1/project-1/media-123e4567-e89b-12d3-a456-426614174000.pdf",
      file,
      { upsert: false },
    );
    expect(url).toBe(
      "https://cdn.maiprop.test/user-1/project-1/media-123e4567-e89b-12d3-a456-426614174000.pdf",
    );
  });

  it("rejects non-PDF brochure uploads and oversized project media", async () => {
    await expect(
      uploadProjectMedia(
        new File(["image"], "brochure.png", { type: "image/png" }),
        "user-1",
        "project-1",
        "brochure_pdf",
      ),
    ).rejects.toThrow(/Unsupported PDF brochure type/);

    const oversizedVideo = new File([new Uint8Array(50 * 1024 * 1024 + 1)], "tour.mp4", {
      type: "video/mp4",
    });
    await expect(
      uploadProjectMedia(oversizedVideo, "user-1", "project-1", "video"),
    ).rejects.toThrow(/exceeds the 50 MB limit/);
    expect(storageMocks.uploadMock).not.toHaveBeenCalled();
  });

  it("propagates storage failures so callers can surface a hard upload failure", async () => {
    const storageError = new Error("bucket unavailable");
    storageMocks.uploadMock.mockResolvedValueOnce({ error: storageError });

    await expect(
      uploadProjectMedia(
        new File(["image"], "rendering.jpg", { type: "image/jpeg" }),
        "user-1",
        "project-1",
        "rendering",
      ),
    ).rejects.toThrow(storageError);
  });
});
