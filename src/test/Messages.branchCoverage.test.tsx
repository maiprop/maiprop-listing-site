import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useAuth: vi.fn(),
  useConversations: vi.fn(),
  useMessages: vi.fn(),
  sendMessage: { mutate: vi.fn(), isPending: false },
  markRead: { mutate: vi.fn(), isPending: false },
  channel: {
    on: vi.fn(),
    subscribe: vi.fn(),
    track: vi.fn(),
    presenceState: vi.fn(),
  },
  removeChannel: vi.fn(),
  storageUpload: vi.fn(),
  assertAllowedUpload: vi.fn(),
  getListingDetailPath: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mocks.navigate };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.useAuth() }));
vi.mock("@/hooks/useMessages", () => ({
  useConversations: () => mocks.useConversations(),
  useMessages: (...args: unknown[]) => mocks.useMessages(...args),
  useSendMessage: () => mocks.sendMessage,
  useMarkMessagesRead: () => mocks.markRead,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => mocks.channel),
    removeChannel: mocks.removeChannel,
    storage: { from: vi.fn(() => ({ upload: mocks.storageUpload })) },
  },
}));
vi.mock("@/lib/uploadValidation", () => ({
  MESSAGE_ATTACHMENT_MIME_TYPES: ["application/pdf", "image/png"],
  assertAllowedUpload: (...args: unknown[]) => mocks.assertAllowedUpload(...args),
}));
vi.mock("@/lib/listingRoutes", () => ({
  getListingDetailPath: (...args: unknown[]) => mocks.getListingDetailPath(...args),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav /> }));
vi.mock("@/lib/messageContent", () => ({
  MessageContent: ({ content }: { content: string }) => <span>{content}</span>,
}));
vi.mock("@/components/messages/SignedAttachment", () => ({
  SignedAttachment: ({ filename, mimeType }: { filename: string; mimeType: string }) => <span>{filename}:{mimeType || "unknown"}</span>,
}));

import Messages from "@/pages/Messages";

const me = { id: "me-id" };
const conversation = (overrides: Record<string, unknown> = {}) => ({
  id: "conversation-1",
  participant_a: "me-id",
  participant_b: "other-id",
  listing_id: "listing-1",
  last_message_at: "2026-07-13T09:00:00.000Z",
  profile_a: { user_id: "me-id", display_name: "Me", avatar_url: null },
  profile_b: { user_id: "other-id", display_name: "Alex Agent", avatar_url: null },
  listings: {
    id: "listing-1",
    title: "Athens Home",
    city: "Athens",
    listing_type: "sale",
    is_pre_sale: false,
  },
  messages: [],
  ...overrides,
});

const renderMessages = (entry: string | { pathname: string; search?: string; state?: unknown } = "/messages") => render(
  <MemoryRouter
    initialEntries={[entry]}
    future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
  >
    <Messages />
  </MemoryRouter>,
);

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ user: me });
  mocks.useConversations.mockReturnValue({ data: [conversation()], isLoading: false });
  mocks.useMessages.mockReturnValue({ data: [], isLoading: false });
  mocks.sendMessage.isPending = false;
  mocks.markRead.isPending = false;
  mocks.channel.on.mockReturnValue(mocks.channel);
  mocks.channel.subscribe.mockReturnValue(mocks.channel);
  mocks.channel.track.mockResolvedValue({});
  mocks.channel.presenceState.mockReturnValue({});
  mocks.storageUpload.mockResolvedValue({ error: null });
  mocks.getListingDetailPath.mockReturnValue("/property/listing-1");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("Messages business branches", () => {
  it("opens a state-provided conversation, enters mobile chat, and consumes navigation state", async () => {
    const second = conversation({
      id: "conversation-2",
      participant_b: "second-id",
      profile_b: { user_id: "second-id", display_name: "Second Agent", avatar_url: null },
    });
    mocks.useConversations.mockReturnValue({ data: [second, conversation()], isLoading: false });

    const view = renderMessages({ pathname: "/messages", state: { openConversationId: "conversation-2" } });

    await waitFor(() => expect(mocks.useMessages).toHaveBeenCalledWith("conversation-2"));
    expect(mocks.navigate).toHaveBeenCalledWith("/messages", { replace: true, state: {} });
    const listPane = view.container.querySelector("div.md\\:w-72") as HTMLElement;
    expect(listPane.className).toContain("hidden");
    expect(screen.getAllByText("Second Agent").length).toBeGreaterThanOrEqual(2);
  });

  it("opens query deep links without clearing router state and ignores non-string state IDs", async () => {
    const queryView = renderMessages({ pathname: "/messages", search: "?conversation=conversation-1" });
    await waitFor(() => expect(mocks.useMessages).toHaveBeenCalledWith("conversation-1"));
    expect(mocks.navigate).not.toHaveBeenCalled();
    queryView.unmount();

    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: me });
    mocks.useConversations.mockReturnValue({ data: [conversation()], isLoading: false });
    mocks.useMessages.mockReturnValue({ data: [], isLoading: false });
    mocks.channel.on.mockReturnValue(mocks.channel);
    mocks.channel.subscribe.mockReturnValue(mocks.channel);
    mocks.channel.track.mockResolvedValue({});
    renderMessages({ pathname: "/messages", state: { openConversationId: 42 } });

    await waitFor(() => expect(mocks.useMessages).toHaveBeenCalledWith("conversation-1"));
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("publishes typing state, identifies another participant, and clears stale typing timers", async () => {
    renderMessages();
    await waitFor(() => expect(mocks.channel.on).toHaveBeenCalledWith("presence", { event: "sync" }, expect.any(Function)));

    const input = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(input, { target: { value: "H" } });
    fireEvent.change(input, { target: { value: "Hello" } });
    expect(mocks.channel.track).toHaveBeenCalledWith({ typing: true });

    const syncPresence = mocks.channel.on.mock.calls.find(([event]) => event === "presence")?.[2] as () => void;
    mocks.channel.presenceState.mockReturnValue({
      "me-id": [{ typing: true }],
      "other-id": [{ typing: false }, { typing: true }],
    });
    act(() => syncPresence());
    expect(screen.getByText("Alex Agent is typing...")).toBeInTheDocument();

    mocks.channel.presenceState.mockReturnValue({ "me-id": [{ typing: true }], "other-id": [{ typing: false }] });
    act(() => syncPresence());
    expect(screen.queryByText(/is typing/i)).not.toBeInTheDocument();
  });

  it("keeps anonymous typing and attachment attempts local to the browser", async () => {
    mocks.useAuth.mockReturnValue({ user: null });
    renderMessages();
    await waitFor(() => expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Type a message..."), { target: { value: "Draft" } });
    const pdf = new File(["pdf"], "anonymous.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput(), "files", { value: [pdf], configurable: true });
    fireEvent.change(fileInput());

    expect(mocks.channel.track).not.toHaveBeenCalled();
    expect(mocks.storageUpload).not.toHaveBeenCalled();
  });

  it("handles an empty file picker and a non-Error validation rejection", async () => {
    renderMessages();
    await waitFor(() => expect(fileInput()).toBeInTheDocument());

    Object.defineProperty(fileInput(), "files", { value: [], configurable: true });
    fireEvent.change(fileInput());
    expect(mocks.assertAllowedUpload).not.toHaveBeenCalled();

    mocks.assertAllowedUpload.mockImplementationOnce(() => { throw "unsupported payload"; });
    const executable = new File(["bad"], "payload.exe", { type: "application/octet-stream" });
    Object.defineProperty(fileInput(), "files", { value: [executable], configurable: true });
    fireEvent.change(fileInput());
    expect(mocks.toast.error).toHaveBeenCalledWith("Unsupported file");
    expect(mocks.storageUpload).not.toHaveBeenCalled();
  });

  it("uses a binary extension fallback and a generic message for structured storage failures", async () => {
    mocks.storageUpload.mockResolvedValue({ error: { code: "storage_unavailable" } });
    renderMessages();
    await waitFor(() => expect(fileInput()).toBeInTheDocument());
    const unnamed = new File(["content"], "", { type: "application/pdf" });
    Object.defineProperty(fileInput(), "files", { value: [unnamed], configurable: true });
    fireEvent.change(fileInput());

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Upload failed"));
    expect(mocks.storageUpload.mock.calls[0][0]).toMatch(/\.bin$/);
  });

  it("defaults incomplete listing metadata and appends a fallback property link to draft text", async () => {
    mocks.useConversations.mockReturnValue({ data: [conversation({ listings: null })], isLoading: false });
    mocks.getListingDetailPath.mockReturnValue(null);
    renderMessages();
    await waitFor(() => expect(screen.getByLabelText("Share property link")).toBeInTheDocument());

    expect(mocks.getListingDetailPath).toHaveBeenCalledWith({
      id: "listing-1",
      listing_type: "sale",
      is_pre_sale: false,
    });
    const input = screen.getByPlaceholderText("Type a message...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Please review" } });
    fireEvent.click(screen.getByLabelText("Share property link"));
    expect(input.value).toBe("Please review /property/listing-1");
  });

  it("surfaces clipboard denial without claiming a conversation link was copied", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("permission denied")) },
    });
    renderMessages();
    fireEvent.pointerDown(screen.getByLabelText("Conversation options"), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByText("Copy conversation link"));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Could not copy conversation link"));
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("renders sparse contacts and attachment records with safe user-facing fallbacks", async () => {
    mocks.useConversations.mockReturnValue({
      data: [conversation({ profile_b: null, listings: null, messages: [{ sender_id: "other-id", content: "" }] })],
      isLoading: false,
    });
    mocks.useMessages.mockReturnValue({
      data: [
        {
          id: "message-1",
          conversation_id: "conversation-1",
          sender_id: "other-id",
          content: "",
          status: "sent",
          created_at: "2026-07-13T09:00:00.000Z",
          profiles: { user_id: "other-id", display_name: "", avatar_url: "https://cdn.example/sender.jpg" },
        },
        {
          id: "message-2",
          conversation_id: "conversation-1",
          sender_id: "other-id",
          content: "Attachment follows",
          status: "read",
          created_at: "2026-07-13T09:01:00.000Z",
          profiles: null,
          message_attachments: [{ storage_path: "path/report", filename: "report.bin", mime_type: null }],
        },
      ],
      isLoading: false,
    });

    renderMessages();
    await waitFor(() => expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0));
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(document.querySelector('img[src="https://cdn.example/sender.jpg"]')).toBeInTheDocument();
    expect(screen.getByText("report.bin:unknown")).toBeInTheDocument();
    expect(mocks.markRead.mutate).toHaveBeenCalled();
  });

  it("shows send progress without accepting a duplicate send", async () => {
    mocks.sendMessage.isPending = true;
    const { container } = renderMessages();
    await waitFor(() => expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("Type a message..."), { target: { value: "Ready" } });

    const sendButton = within(container).getAllByRole("button").find((button) => button.querySelector(".lucide-send, .animate-spin")) as HTMLButtonElement;
    expect(sendButton).toBeDisabled();
    expect(sendButton.querySelector(".animate-spin")).toBeInTheDocument();
    fireEvent.click(sendButton);
    expect(mocks.sendMessage.mutate).not.toHaveBeenCalled();
  });
});
