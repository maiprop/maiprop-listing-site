/**
 * Tests for the actual `compressImage` function (the existing
 * compressImage.test.ts file only re-implements the MIME guard).
 *
 * Strategy:
 *  - Drive the early-exit code paths directly (small file, disallowed MIME)
 *    using real File objects — no Image/Canvas needed.
 *  - For the canvas path, stub URL.createObjectURL, the global Image
 *    constructor, and HTMLCanvasElement.prototype.toBlob, since jsdom does
 *    not implement any of them.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  compressImage,
  compressListingImage,
  compressAvatar,
} from "@/lib/compressImage";

function makeFile(opts: { type: string; size: number; name?: string }): File {
  // Build a Uint8Array of the requested size so file.size matches what the
  // module checks against the 150 KB threshold.
  const bytes = new Uint8Array(opts.size);
  return new File([bytes], opts.name ?? "input.jpg", { type: opts.type });
}

describe("compressImage early-exit paths", () => {
  it("returns the original File for non-allowlisted MIME types", async () => {
    const f = makeFile({ type: "image/gif", size: 500_000 });
    const out = await compressImage(f);
    expect(out).toBe(f);
  });

  it("returns the original File for files under 150 KB", async () => {
    const f = makeFile({ type: "image/jpeg", size: 100_000 });
    const out = await compressImage(f);
    expect(out).toBe(f);
  });

  it("returns the original File for unsupported types like application/pdf", async () => {
    const f = makeFile({ type: "application/pdf", size: 500_000 });
    const out = await compressImage(f);
    expect(out).toBe(f);
  });
});

describe("compressImage canvas pipeline", () => {
  // jsdom does not implement URL.createObjectURL / revokeObjectURL. Install
  // no-op shims first so vi.spyOn() finds an existing property descriptor.
  if (typeof URL.createObjectURL !== "function") {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL =
      () => "blob:placeholder";
  }
  if (typeof URL.revokeObjectURL !== "function") {
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL =
      () => undefined;
  }

  let originalImage: typeof Image;
  let createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
  let revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  beforeEach(() => {
    originalImage = window.Image;
    createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    window.Image = originalImage;
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    vi.restoreAllMocks();
  });

  function stubImageWith({
    width,
    height,
    fail = false,
  }: {
    width: number;
    height: number;
    fail?: boolean;
  }) {
    class StubImage {
      width = width;
      height = height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = "";
      get src() { return this._src; }
      set src(v: string) {
        this._src = v;
        // Fire async to mimic real browser behaviour.
        queueMicrotask(() => {
          if (fail) this.onerror?.();
          else this.onload?.();
        });
      }
    }
    (window as unknown as { Image: typeof Image }).Image =
      StubImage as unknown as typeof Image;
  }

  function stubCanvasToBlob(blob: Blob | null) {
    HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) {
      cb(blob);
    } as HTMLCanvasElement["toBlob"];
  }

  // jsdom's canvas.getContext("2d") returns null without the optional `canvas`
  // npm package. The compressImage handler treats null as "fallback to original
  // file", which short-circuits every canvas-pipeline test. Provide a minimal
  // 2D-context stub so the success-path branches are reachable.
  function stubCanvasGetContext() {
    const ctx = {
      drawImage: () => {},
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    } as unknown as CanvasRenderingContext2D;
    HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  }

  it("falls back to the original file when the browser cannot create a 2D context", async () => {
    stubImageWith({ width: 4000, height: 3000 });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    try {
      const f = makeFile({ type: "image/jpeg", size: 200_000 });
      const out = await compressImage(f);
      expect(out).toBe(f);
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });

  it("falls back to the original file when canvas.toBlob yields null", async () => {
    stubImageWith({ width: 4000, height: 3000 });
    stubCanvasGetContext();
    stubCanvasToBlob(null);
    const f = makeFile({ type: "image/jpeg", size: 200_000 });
    const out = await compressImage(f);
    expect(out).toBe(f);
  });

  it("falls back to the original file when the compressed blob is not smaller", async () => {
    stubImageWith({ width: 4000, height: 3000 });
    stubCanvasGetContext();
    // Output blob is *bigger* than the input → module returns the original.
    stubCanvasToBlob(new Blob([new Uint8Array(300_000)], { type: "image/webp" }));
    const f = makeFile({ type: "image/jpeg", size: 200_000 });
    const out = await compressImage(f);
    expect(out).toBe(f);
  });

  it("returns a new File with the chosen MIME and the renamed extension when compression succeeds", async () => {
    stubImageWith({ width: 4000, height: 3000 });
    stubCanvasGetContext();
    stubCanvasToBlob(new Blob([new Uint8Array(50_000)], { type: "image/webp" }));
    const f = makeFile({ type: "image/jpeg", size: 200_000, name: "photo.jpeg" });
    const out = await compressImage(f, { mimeType: "image/webp" });
    expect(out).not.toBe(f);
    expect(out.type).toBe("image/webp");
    expect(out.name).toBe("photo.webp");
  });

  it("renames to .jpg when output mime is image/jpeg", async () => {
    stubImageWith({ width: 4000, height: 3000 });
    stubCanvasGetContext();
    stubCanvasToBlob(new Blob([new Uint8Array(50_000)], { type: "image/jpeg" }));
    const f = makeFile({ type: "image/png", size: 200_000, name: "shot.png" });
    const out = await compressImage(f, { mimeType: "image/jpeg" });
    expect(out.name).toBe("shot.jpg");
  });

  it("falls back to the original file when the image fails to decode (img.onerror)", async () => {
    stubImageWith({ width: 0, height: 0, fail: true });
    const f = makeFile({ type: "image/jpeg", size: 200_000 });
    const out = await compressImage(f);
    expect(out).toBe(f);
  });

  it("preserves aspect ratio when downscaling a portrait image", async () => {
    stubImageWith({ width: 3000, height: 4000 });
    let recordedWidth = 0;
    let recordedHeight = 0;
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
      recordedWidth = this.width;
      recordedHeight = this.height;
      return {
        drawImage: () => {},
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
      } as unknown as CanvasRenderingContext2D;
    } as never;
    try {
      stubCanvasToBlob(new Blob([new Uint8Array(50_000)], { type: "image/webp" }));
      const f = makeFile({ type: "image/jpeg", size: 200_000 });
      await compressImage(f, { maxDimension: 1600 });
      // Portrait: height was the larger axis, gets clamped to 1600,
      // width scales to 3000*1600/4000 = 1200.
      expect(recordedHeight).toBe(1600);
      expect(recordedWidth).toBe(1200);
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext;
    }
  });
});

describe("compressImage presets", () => {
  it("compressListingImage and compressAvatar are wired to compressImage", async () => {
    // We don't need to reach the canvas path; passing a small file exercises
    // the early exit and proves the preset wrappers forward arguments without
    // throwing.
    const small = new File([new Uint8Array(100)], "x.jpg", { type: "image/jpeg" });
    expect(await compressListingImage(small)).toBe(small);
    expect(await compressAvatar(small)).toBe(small);
  });
});
