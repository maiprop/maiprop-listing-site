import { act, renderHook } from "@testing-library/react";
import type { ChangeEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMessageAttachments } from "@/hooks/useMessageAttachments";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), from: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: mocks.from } },
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));

const user = { id: "actor-A" } as User;
const pdf = (name = "plan.pdf") => new File(["local PDF"], name, { type: "application/pdf" });
const selection = (files: File[]) => ({ target: { files, value: "selected" } }) as unknown as ChangeEvent<HTMLInputElement>;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const setup = () => {
  let mounted = true;
  const committed = vi.fn();
  const guard = () => mounted;
  const view = renderHook(({ conversation, actor, onUploaded, isMounted }) =>
    useMessageAttachments(conversation, actor, isMounted, onUploaded), {
    initialProps: { conversation: "conv-A", actor: user as User | null, onUploaded: committed, isMounted: guard },
  });
  return { ...view, committed, guard, deactivate: () => { mounted = false; } };
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockReturnValue({ upload: mocks.upload, remove: mocks.remove });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
});

describe("useMessageAttachments", () => {
  it("leaves empty selections and missing actor/conversation untouched", async () => {
    const view = setup();
    const empty = selection([]);
    await act(async () => { await view.result.current.handleFileSelect(empty); });
    expect(empty.target.value).toBe("selected");
    for (const props of [{ conversation: "", actor: user }, { conversation: "conv-A", actor: null }]) {
      view.rerender({ ...props, onUploaded: view.committed, isMounted: view.guard });
      const event = selection([pdf()]);
      await act(async () => { await view.result.current.handleFileSelect(event); });
      expect(event.target.value).toBe("selected");
    }
    expect(view.result.current.uploading).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(view.committed).not.toHaveBeenCalled();
  });

  it("validates every file before writing and rejects a later invalid or oversized file", async () => {
    const view = setup();
    const oversized = pdf("large.pdf");
    Object.defineProperty(oversized, "size", { value: 10 * 1024 * 1024 + 1 });
    for (const invalid of [new File(["bad"], "bad.exe", { type: "application/octet-stream" }), oversized]) {
      const event = selection([pdf(), invalid]);
      await act(async () => { await view.result.current.handleFileSelect(event); });
      expect(event.target.value).toBe("");
    }
    expect(mocks.error.mock.calls).toEqual([
      [expect.stringContaining("Unsupported attachment type")], [expect.stringContaining("10 MB limit")],
    ]);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(view.result.current.uploading).toBe(false);
    expect(view.committed).not.toHaveBeenCalled();
  });

  it("uploads serially with initiating actor, conversation, callback and guard after rerender", async () => {
    const first = deferred<{ error: null }>();
    const second = deferred<{ error: null }>();
    mocks.upload.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = setup();
    const files = [pdf("PLAN.PDF"), pdf("trailing.")];
    const event = selection(files);
    let completion!: Promise<void>;
    act(() => { completion = view.result.current.handleFileSelect(event); });
    expect(view.result.current.uploading).toBe(true);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const replacement = vi.fn();
    view.rerender({ conversation: "conv-B", actor: { id: "actor-B" } as User,
      onUploaded: replacement, isMounted: () => false });
    await act(async () => { first.resolve({ error: null }); await first.promise; });
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    const paths = mocks.upload.mock.calls.map(([path]) => path as string);
    expect(paths[0]).toMatch(/^actor-A\/conv-A\/[0-9a-f-]+\.pdf$/);
    expect(paths[1]).toMatch(/^actor-A\/conv-A\/[0-9a-f-]+\.bin$/);
    expect(paths[0]).not.toBe(paths[1]);
    files.forEach((file, i) => expect(mocks.upload).toHaveBeenNthCalledWith(i + 1, paths[i], file, { contentType: file.type }));
    expect(view.committed).not.toHaveBeenCalled();
    await act(async () => { second.resolve({ error: null }); await completion; });
    expect(view.committed).toHaveBeenCalledExactlyOnceWith("conv-A", files.map((file, i) => ({
      path: paths[i], filename: file.name, mime_type: file.type,
    })));
    expect(replacement).not.toHaveBeenCalled();
    expect(mocks.from.mock.calls.every(([bucket]) => bucket === "message-attachments")).toBe(true);
    expect(view.result.current.uploading).toBe(false);
    expect(event.target.value).toBe("");
  });

  it("checks the existing guard before the first transfer without adding an early validation guard", async () => {
    const view = setup();
    view.deactivate();
    const invalid = selection([new File(["bad"], "bad.exe", { type: "application/octet-stream" })]);
    await act(async () => { await view.result.current.handleFileSelect(invalid); });
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(invalid.target.value).toBe("");
    const valid = selection([pdf()]);
    await act(async () => { await view.result.current.handleFileSelect(valid); });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(view.committed).not.toHaveBeenCalled();
    expect(valid.target.value).toBe("selected");
  });

  it.each([null, new Error("late failure")])("ignores an in-flight result after owner inactivity (%s)", async (error) => {
    const transfer = deferred<{ error: Error | null }>();
    mocks.upload.mockReturnValueOnce(transfer.promise);
    const view = setup();
    const event = selection([pdf(), pdf("second.pdf")]);
    let completion!: Promise<void>;
    act(() => { completion = view.result.current.handleFileSelect(event); });
    view.deactivate();
    view.unmount();
    await act(async () => { transfer.resolve({ error }); await completion; });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(view.committed).not.toHaveBeenCalled();
    expect(event.target.value).toBe("selected");
  });

  it("awaits rollback of only this batch's successful paths before reporting failure and resetting", async () => {
    const cleanup = deferred<{ error: Error }>();
    mocks.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error("second failed") });
    mocks.remove.mockReturnValueOnce(cleanup.promise);
    const view = setup();
    const event = selection([pdf("new.pdf"), pdf("failed.pdf")]);
    let completion!: Promise<void>;
    await act(async () => { completion = view.result.current.handleFileSelect(event); await Promise.resolve(); });
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([mocks.upload.mock.calls[0][0]]);
    expect(view.result.current.uploading).toBe(true);
    expect(event.target.value).toBe("selected");
    expect(mocks.error).not.toHaveBeenCalled();
    await act(async () => { cleanup.resolve({ error: new Error("returned cleanup error stays ignored") }); await completion; });
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("second failed");
    expect(view.committed).not.toHaveBeenCalled();
    expect(event.target.value).toBe("");
    expect(view.result.current.uploading).toBe(false);
  });

  it("retains the cleanup rejection and still runs mounted finally", async () => {
    const cleanupError = new Error("cleanup rejected");
    mocks.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error("upload failed") });
    mocks.remove.mockRejectedValueOnce(cleanupError);
    const view = setup();
    const event = selection([pdf(), pdf("second.pdf")]);
    await act(async () => { await expect(view.result.current.handleFileSelect(event)).rejects.toBe(cleanupError); });
    expect(mocks.error).not.toHaveBeenCalled();
    expect(view.result.current.uploading).toBe(false);
    expect(event.target.value).toBe("");
  });

  it("suppresses toast and finally reset if the owner becomes inactive during rollback", async () => {
    const cleanup = deferred<{ error: null }>();
    mocks.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error("failed") });
    mocks.remove.mockReturnValueOnce(cleanup.promise);
    const view = setup();
    const event = selection([pdf(), pdf("second.pdf")]);
    let completion!: Promise<void>;
    await act(async () => { completion = view.result.current.handleFileSelect(event); await Promise.resolve(); });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    view.deactivate();
    await act(async () => { cleanup.resolve({ error: null }); await completion; });
    expect(mocks.error).not.toHaveBeenCalled();
    expect(event.target.value).toBe("selected");
  });

  it("rolls back a synchronous success callback failure in the original try block", async () => {
    const view = setup();
    view.committed.mockImplementationOnce(() => { throw new Error("draft commit failed"); });
    await act(async () => { await view.result.current.handleFileSelect(selection([pdf()])); });
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([mocks.upload.mock.calls[0][0]]);
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("draft commit failed");
  });

  it("uses the original fallback for a non-Error storage failure without deleting unsuccessful objects", async () => {
    mocks.upload.mockResolvedValueOnce({ error: { message: "provider object" } });
    const view = setup();
    await act(async () => { await view.result.current.handleFileSelect(selection([pdf()])); });
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("Upload failed");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
