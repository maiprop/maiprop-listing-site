import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: { id: "A" },
  conversationsLoading: false,
  useMessages: vi.fn(),
  send: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  toastError: vi.fn(),
  channel: { on: vi.fn(), subscribe: vi.fn(), send: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.actor, session: null }),
}));
vi.mock("@/hooks/useMessages", () => ({
  useConversations: () => ({
    data: mocks.conversationsLoading ? [] : mocks.actor.id === "A" ? [conversation("A", "B", "a-conv")] : [conversation("C", "D", "c-conv")],
    isLoading: mocks.conversationsLoading,
  }),
  useMessages: (id: string) => mocks.useMessages(mocks.actor.id, id),
  useSendMessage: () => ({ mutateAsync: mocks.send, isPending: false }),
  useMarkMessagesRead: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => mocks.channel,
    removeChannel: vi.fn(),
    realtime: { setAuth: vi.fn() },
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  },
}));
vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav /> }));
vi.mock("@/lib/messageContent", () => ({ MessageContent: ({ content }: { content: string }) => <span>{content}</span> }));
vi.mock("@/components/messages/SignedAttachment", () => ({ SignedAttachment: () => <span>signed attachment</span> }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

import Messages from "@/pages/Messages";

function conversation(a: string, b: string, id: string) {
  return {
    id, participant_a: a, participant_b: b, listing_id: null, last_message_at: null,
    profile_a: { user_id: a, display_name: a, avatar_url: null },
    profile_b: { user_id: b, display_name: b, avatar_url: null },
    listings: null, messages: [],
  };
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
};

beforeEach(() => {
  mocks.actor = { id: "A" };
  mocks.conversationsLoading = false;
  vi.clearAllMocks();
  // Any unexpected transport is a hard failure. Only upload is deliberately intercepted.
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("external fetch forbidden"); }));
  mocks.useMessages.mockImplementation((actor: string, id: string) => ({
    data: actor === "A" && id === "a-conv" ? [{
      id: "a-message", sender_id: "A", content: "A committed text", status: "read",
      created_at: "2026-09-30T10:00:00Z", message_attachments: [{
        storage_path: "A/a-conv/committed.pdf", filename: "committed.pdf", mime_type: "application/pdf",
      }],
    }] : [],
    isLoading: false,
  }));
  mocks.send.mockResolvedValue({ id: "synthetic-message" });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.channel.on.mockReturnValue(mocks.channel);
  mocks.channel.subscribe.mockReturnValue(mocks.channel);
  mocks.channel.send.mockResolvedValue("ok");
});

it("resets A selection, draft, and attachment before C's first message lookup", async () => {
  const view = render(<MemoryRouter initialEntries={["/messages"]}><Messages /></MemoryRouter>);
  const composer = await screen.findByPlaceholderText("Type a message...") as HTMLInputElement;
  expect(screen.getByText("signed attachment")).toBeInTheDocument();
  fireEvent.change(composer, { target: { value: "A private draft" } });
  const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(fileInput, "files", {
    configurable: true,
    value: [new File(["synthetic"], "a-private.pdf", { type: "application/pdf" })],
  });
  fireEvent.change(fileInput);
  await waitFor(() => expect(screen.getByText("a-private.pdf")).toBeInTheDocument());
  expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(/^A\/a-conv\//), expect.any(File), expect.any(Object));

  mocks.useMessages.mockClear();
  mocks.actor = { id: "C" };
  view.rerender(<MemoryRouter initialEntries={["/messages"]}><Messages /></MemoryRouter>);

  expect(mocks.useMessages.mock.calls.filter(([actor]) => actor === "C")[0]).toEqual(["C", ""]);
  expect(mocks.useMessages).not.toHaveBeenCalledWith("C", "a-conv");
  expect(screen.queryByText("a-private.pdf")).not.toBeInTheDocument();
  expect(screen.queryByText("signed attachment")).not.toBeInTheDocument();
  await waitFor(() => expect(mocks.useMessages).toHaveBeenCalledWith("C", "c-conv"));
  const cComposer = screen.getByPlaceholderText("Type a message...") as HTMLInputElement;
  expect(cComposer.value).toBe("");
  expect(screen.queryByText("a-private.pdf")).not.toBeInTheDocument();
  expect(mocks.send).not.toHaveBeenCalled();
  fireEvent.change(cComposer, { target: { value: "C says hello" } });
  fireEvent.keyDown(cComposer, { key: "Enter" });
  await waitFor(() => expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
    conversation_id: "c-conv", content: "C says hello",
  })));
});

it("does not start a second A upload after switching to C", async () => {
  const firstUpload = deferred<{ error: Error | null }>();
  mocks.upload.mockReturnValueOnce(firstUpload.promise);
  const view = render(<MemoryRouter initialEntries={["/messages"]}><Messages /></MemoryRouter>);
  await screen.findByPlaceholderText("Type a message...");
  const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(fileInput, "files", {
    configurable: true,
    value: [
      new File(["one"], "a-one.pdf", { type: "application/pdf" }),
      new File(["two"], "a-two.pdf", { type: "application/pdf" }),
    ],
  });
  fireEvent.change(fileInput);
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
  mocks.actor = { id: "C" };
  view.rerender(<MemoryRouter initialEntries={["/messages"]}><Messages /></MemoryRouter>);
  await screen.findByPlaceholderText("Type a message...");
  await act(async () => { firstUpload.resolve({ error: null }); });
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.toastError).not.toHaveBeenCalled();
  expect(screen.queryByText("a-one.pdf")).not.toBeInTheDocument();
});

it("does not show an A upload failure in C's view", async () => {
  const firstUpload = deferred<{ error: Error | null }>();
  mocks.upload.mockReturnValueOnce(firstUpload.promise);
  const view = render(<MemoryRouter initialEntries={["/messages"]}><Messages /></MemoryRouter>);
  await screen.findByPlaceholderText("Type a message...");
  const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(fileInput, "files", {
    configurable: true,
    value: [new File(["one"], "a-one.pdf", { type: "application/pdf" })],
  });
  fireEvent.change(fileInput);
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
  mocks.actor = { id: "C" };
  view.rerender(<MemoryRouter initialEntries={["/messages"]}><Messages /></MemoryRouter>);
  await screen.findByPlaceholderText("Type a message...");
  await act(async () => { firstUpload.resolve({ error: new Error("A upload failed") }); });
  expect(mocks.toastError).not.toHaveBeenCalled();
});

it("does not let a completed A send change C's composer", async () => {
  const delivery = deferred<{ id: string }>();
  mocks.send.mockReturnValueOnce(delivery.promise);
  const view = render(<MemoryRouter initialEntries={["/messages"]}><Messages /></MemoryRouter>);
  const aComposer = await screen.findByPlaceholderText("Type a message...") as HTMLInputElement;
  fireEvent.change(aComposer, { target: { value: "A pending send" } });
  fireEvent.keyDown(aComposer, { key: "Enter" });
  await waitFor(() => expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
    conversation_id: "a-conv", content: "A pending send",
  })));
  mocks.actor = { id: "C" };
  view.rerender(<MemoryRouter initialEntries={["/messages"]}><Messages /></MemoryRouter>);
  const cComposer = await screen.findByPlaceholderText("Type a message...") as HTMLInputElement;
  fireEvent.change(cComposer, { target: { value: "C unsent draft" } });
  await act(async () => { delivery.resolve({ id: "a-sent" }); });
  expect(cComposer.value).toBe("C unsent draft");
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.toastError).not.toHaveBeenCalled();
});

it("ignores a retained A query deep link when C's fetched list excludes it", async () => {
  const view = render(<MemoryRouter initialEntries={["/messages?conversation=a-conv"]}><Messages /></MemoryRouter>);
  await screen.findByPlaceholderText("Type a message...");
  mocks.useMessages.mockClear();
  mocks.actor = { id: "C" };
  view.rerender(<MemoryRouter initialEntries={["/messages?conversation=a-conv"]}><Messages /></MemoryRouter>);
  await waitFor(() => expect(mocks.useMessages).toHaveBeenCalledWith("C", "c-conv"));
  expect(mocks.useMessages).not.toHaveBeenCalledWith("C", "a-conv");
});

it("ignores a retained A navigation state request when C's fetched list excludes it", async () => {
  mocks.conversationsLoading = true;
  const entry = { pathname: "/messages", state: { openConversationId: "a-conv" } };
  const view = render(<MemoryRouter initialEntries={[entry]}><Messages /></MemoryRouter>);
  expect(mocks.useMessages).toHaveBeenCalledWith("A", "");
  mocks.actor = { id: "C" };
  mocks.conversationsLoading = false;
  mocks.useMessages.mockClear();
  view.rerender(<MemoryRouter initialEntries={[entry]}><Messages /></MemoryRouter>);
  await waitFor(() => expect(mocks.useMessages).toHaveBeenCalledWith("C", "c-conv"));
  expect(mocks.useMessages).not.toHaveBeenCalledWith("C", "a-conv");
});

it("waits for C's list, then honors a C conversation deep link", async () => {
  mocks.actor = { id: "C" };
  mocks.conversationsLoading = true;
  const view = render(<MemoryRouter initialEntries={["/messages?conversation=c-conv"]}><Messages /></MemoryRouter>);
  expect(mocks.useMessages).toHaveBeenCalledWith("C", "");
  expect(mocks.useMessages).not.toHaveBeenCalledWith("C", "c-conv");
  mocks.conversationsLoading = false;
  view.rerender(<MemoryRouter initialEntries={["/messages?conversation=c-conv"]}><Messages /></MemoryRouter>);
  await waitFor(() => expect(mocks.useMessages).toHaveBeenCalledWith("C", "c-conv"));
  expect(mocks.useMessages).not.toHaveBeenCalledWith("C", "a-conv");
});
