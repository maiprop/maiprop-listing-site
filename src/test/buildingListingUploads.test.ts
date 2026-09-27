import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => {
  const uploadMock = vi.fn();
  const removeMock = vi.fn();
  const getPublicUrlMock = vi.fn((path: string) => ({
    data: { publicUrl: `https://cdn.maiprop.test/${path}` },
  }));
  const fromMock = vi.fn(() => ({
    upload: uploadMock,
    getPublicUrl: getPublicUrlMock,
    remove: removeMock,
  }));
  return {
    fromMock,
    getPublicUrlMock,
    removeMock,
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

import {
  deleteProjectMediaUrls,
  uploadListingImage,
  uploadNewBuildingListingImage,
  uploadProjectMedia,
} from "@/lib/buildingListingUploads";

describe("building listing upload helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.uploadMock.mockResolvedValue({ error: null });
    storageMocks.removeMock.mockResolvedValue({ error: null });
    storageMocks.supabase!.rpc.mockResolvedValue({ data: null, error: null });
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

  it("nests new-building creation images under the stable project creation namespace", async () => {
    const file = new File(["image"], "front.webp", { type: "image/webp" });

    await uploadNewBuildingListingImage(file, "user-1", "project-1");

    expect(storageMocks.supabase!.rpc).toHaveBeenCalledWith(
      "register_new_building_storage_upload",
      {
        p_project_id: "project-1",
        p_bucket: "listing-images",
        p_object_path:
          "user-1/project-1/create/123e4567-e89b-12d3-a456-426614174000.webp",
        p_object_url:
          "https://cdn.maiprop.test/user-1/project-1/create/123e4567-e89b-12d3-a456-426614174000.webp",
      },
    );
    expect(storageMocks.supabase!.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      storageMocks.uploadMock.mock.invocationCallOrder[0],
    );
    expect(storageMocks.uploadMock).toHaveBeenCalledWith(
      "user-1/project-1/create/123e4567-e89b-12d3-a456-426614174000.webp",
      file,
      { upsert: false },
    );
  });

  it("rejects non-image listing uploads before calling storage", async () => {
    const file = new File(["text"], "notes.txt", { type: "text/plain" });

    await expect(uploadListingImage(file, "user-1")).rejects.toThrow(
      /Unsupported listing image type/,
    );
    expect(storageMocks.uploadMock).not.toHaveBeenCalled();
  });

  it("matches the listing-images bucket MIME and size limits before upload", async () => {
    await expect(
      uploadListingImage(new File(["image"], "ios.heic", { type: "image/heic" }), "user-1"),
    ).rejects.toThrow(/Unsupported listing image type/);

    await expect(
      uploadListingImage(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" }),
        "user-1",
      ),
    ).rejects.toThrow(/exceeds the 5 MB limit/);

    expect(storageMocks.uploadMock).not.toHaveBeenCalled();
  });

  it("uses the PDF-only allowlist for brochure media", async () => {
    const file = new File(["pdf"], "brochure.pdf", { type: "application/pdf" });

    const url = await uploadProjectMedia(file, "user-1", "project-1", "brochure_pdf");

    expect(storageMocks.supabase!.rpc).toHaveBeenCalledWith(
      "register_new_building_storage_upload",
      {
        p_project_id: "project-1",
        p_bucket: "project-media",
        p_object_path:
          "user-1/project-1/create/media-123e4567-e89b-12d3-a456-426614174000.pdf",
        p_object_url:
          "https://cdn.maiprop.test/user-1/project-1/create/media-123e4567-e89b-12d3-a456-426614174000.pdf",
      },
    );
    expect(storageMocks.supabase!.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      storageMocks.uploadMock.mock.invocationCallOrder[0],
    );
    expect(storageMocks.fromMock).toHaveBeenCalledWith("project-media");
    expect(storageMocks.uploadMock).toHaveBeenCalledWith(
      "user-1/project-1/create/media-123e4567-e89b-12d3-a456-426614174000.pdf",
      file,
      { upsert: false },
    );
    expect(url).toBe(
      "https://cdn.maiprop.test/user-1/project-1/create/media-123e4567-e89b-12d3-a456-426614174000.pdf",
    );
  });

  it("accepts project media exactly at the 20 MiB bucket limit", async () => {
    const file = new File([new Uint8Array(0)], "tour.mp4", {
      type: "video/mp4",
    });

    Object.defineProperty(file, "size", { value: 20 * 1024 * 1024 });
    const url = await uploadProjectMedia(file, "user-1", "project-1", "video");

    expect(storageMocks.fromMock).toHaveBeenCalledWith("project-media");
    expect(storageMocks.uploadMock).toHaveBeenCalledWith(
      "user-1/project-1/create/media-123e4567-e89b-12d3-a456-426614174000.mp4",
      file,
      { upsert: false },
    );
    expect(url).toBe(
      "https://cdn.maiprop.test/user-1/project-1/create/media-123e4567-e89b-12d3-a456-426614174000.mp4",
    );
  });

  it("rejects non-PDF brochure uploads and project media outside bucket constraints", async () => {
    await expect(
      uploadProjectMedia(
        new File(["image"], "brochure.png", { type: "image/png" }),
        "user-1",
        "project-1",
        "brochure_pdf",
      ),
    ).rejects.toThrow(/Unsupported PDF brochure type/);

    await expect(
      uploadProjectMedia(
        new File(["video"], "tour.mov", { type: "video/quicktime" }),
        "user-1",
        "project-1",
        "video",
      ),
    ).rejects.toThrow(/Unsupported media file type/);

    const oversizedVideo = new File([new Uint8Array(0)], "tour.mp4", {
      type: "video/mp4",
    });
    Object.defineProperty(oversizedVideo, "size", { value: 20 * 1024 * 1024 + 1 });
    await expect(
      uploadProjectMedia(oversizedVideo, "user-1", "project-1", "video"),
    ).rejects.toThrow(/exceeds the 20 MB limit/);
    expect(storageMocks.uploadMock).not.toHaveBeenCalled();
    expect(storageMocks.supabase!.rpc).not.toHaveBeenCalled();
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

  it("deletes only canonical project-media URLs during partial-upload cleanup", async () => {
    await deleteProjectMediaUrls([
      "https://project.supabase.co/storage/v1/object/public/project-media/user-1/project-1/render.jpg",
      "https://project.supabase.co/storage/v1/object/public/listing-images/user-1/cover.jpg",
      "not-a-url",
    ]);

    expect(storageMocks.fromMock).toHaveBeenCalledWith("project-media");
    expect(storageMocks.removeMock).toHaveBeenCalledWith([
      "user-1/project-1/render.jpg",
    ]);
  });
});
