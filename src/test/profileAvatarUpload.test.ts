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

vi.mock("@/lib/compressImage", () => ({
  compressAvatar: vi.fn(async (file: File) =>
    new File([file], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" }),
  ),
}));

import { uploadProfileAvatar } from "@/lib/profileAvatarUpload";

describe("profile avatar upload helper", () => {
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

  it("compresses and uploads avatars to the user-owned avatars bucket path", async () => {
    const file = new File(["image"], "headshot.jpg", { type: "image/jpeg" });

    const result = await uploadProfileAvatar(file, "user-1");

    expect(storageMocks.fromMock).toHaveBeenCalledWith("avatars");
    expect(storageMocks.uploadMock).toHaveBeenCalledWith(
      "user-1/avatar-123e4567-e89b-12d3-a456-426614174000.webp",
      expect.any(File),
      { upsert: false, contentType: "image/webp" },
    );
    expect(storageMocks.getPublicUrlMock).toHaveBeenCalledWith(
      "user-1/avatar-123e4567-e89b-12d3-a456-426614174000.webp",
    );
    expect(result).toEqual({
      path: "user-1/avatar-123e4567-e89b-12d3-a456-426614174000.webp",
      url: "https://cdn.maiprop.test/user-1/avatar-123e4567-e89b-12d3-a456-426614174000.webp",
    });
  });

  it("rejects unsupported avatar source files before touching storage", async () => {
    await expect(
      uploadProfileAvatar(new File(["svg"], "avatar.svg", { type: "image/svg+xml" }), "user-1"),
    ).rejects.toThrow(/Unsupported avatar image type/);
    expect(storageMocks.uploadMock).not.toHaveBeenCalled();
  });

  it("propagates storage failures to the caller", async () => {
    storageMocks.uploadMock.mockResolvedValueOnce({ error: new Error("avatar bucket failed") });

    await expect(
      uploadProfileAvatar(new File(["image"], "headshot.jpg", { type: "image/jpeg" }), "user-1"),
    ).rejects.toThrow("avatar bucket failed");
  });
});
