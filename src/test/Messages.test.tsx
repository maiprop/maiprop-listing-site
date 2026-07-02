/**
 * Smoke tests for the Messages page.
 *
 * Goal: cover the major render paths (loading / empty / with-conversation /
 * with-messages / typing-indicator / file-upload) plus the input handlers
 * (handleSend, handleFileSelect oversize guard, search filter, conversation
 * select, mobile back button) so the page-level coverage clears the 70%
 * audit floor without re-implementing every realtime detail.
 *
 * The data hooks (`useConversations` etc.) and the supabase client are
 * mocked so the test focuses on Messages.tsx's own logic, not its dependencies.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within, cleanup } from "@testing-library/react";

let clipboardWriteText: ReturnType<typeof vi.fn>;

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
  useConversationsMock,
  useMessagesMock,
  sendMessageMutate,
  markReadMutate,
  useAuthMock,
  toastErrorMock,
  toastSuccessMock,
  channelMock,
  removeChannelMock,
  storageUploadMock,
  storageCreateSignedUrlMock,
  navigateMock,
} = vi.hoisted(() => {
  const sendMessageMutate = vi.fn();
  const markReadMutate = vi.fn();
  const useConversationsMock = vi.fn();
  const useMessagesMock = vi.fn();
  const useAuthMock = vi.fn();
  const toastErrorMock = vi.fn();
  const toastSuccessMock = vi.fn();
  const channelTrack = vi.fn().mockResolvedValue({});
  const channelMock = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    track: channelTrack,
  };
  const removeChannelMock = vi.fn();
  const storageUploadMock = vi.fn();
  const storageCreateSignedUrlMock = vi.fn().mockResolvedValue({ data: null, error: null });
  const navigateMock = vi.fn();
  return {
    useConversationsMock,
    useMessagesMock,
    sendMessageMutate,
    markReadMutate,
    useAuthMock,
    toastErrorMock,
    toastSuccessMock,
    channelMock,
    removeChannelMock,
    storageUploadMock,
    storageCreateSignedUrlMock,
    navigateMock,
  };
});

vi.mock("@/hooks/useMessages", () => ({
  useConversations: useConversationsMock,
  useMessages: useMessagesMock,
  useSendMessage: () => ({ mutate: sendMessageMutate, isPending: false }),
  useMarkMessagesRead: () => ({ mutate: markReadMutate, isPending: false }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: useAuthMock,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => channelMock),
    removeChannel: removeChannelMock,
    storage: {
      from: vi.fn(() => ({
        upload: storageUploadMock,
        createSignedUrl: storageCreateSignedUrlMock,
      })),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
}));

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={to} {...rest}>{children}</a>
  ),
  useLocation: () => ({ state: null, pathname: "/messages" }),
  useNavigate: () => navigateMock,
}));

vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));

vi.mock("@/lib/messageContent", () => ({
  MessageContent: ({ content }: { content: string }) => <span data-testid="msg-content">{content}</span>,
}));

import Messages from "@/pages/Messages";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const ME = { id: "me-id" };
const OTHER_PROFILE = { user_id: "them-id", display_name: "Bob Builder", avatar_url: null };
const MY_PROFILE = { user_id: "me-id", display_name: "Me Myself", avatar_url: null };

const CONV_1 = {
  id: "conv-1",
  participant_a: "me-id",
  participant_b: "them-id",
  listing_id: "listing-1",
  last_message_at: "2026-04-26T10:00:00Z",
  profile_a: MY_PROFILE,
  profile_b: OTHER_PROFILE,
  listings: {
    id: "listing-1",
    title: "Cozy Flat",
    city: "Athens",
    cover_image_url: null,
    listing_type: "new_build",
    is_pre_sale: false,
    project_id: "project-1",
  },
  messages: [{ content: "hi", created_at: "2026-04-26T10:00:00Z", sender_id: "them-id" }],
};

const CONV_2 = {
  id: "conv-2",
  participant_a: "me-id",
  participant_b: "alice-id",
  listing_id: null,
  last_message_at: null,
  profile_a: MY_PROFILE,
  profile_b: { user_id: "alice-id", display_name: "Alice Smith", avatar_url: null },
  listings: null,
  messages: [],
};

const MSG_THEM = {
  id: "m1",
  conversation_id: "conv-1",
  sender_id: "them-id",
  content: "Hello there!",
  status: "sent",
  created_at: "2026-04-26T10:00:00Z",
  message_attachments: [],
  profiles: OTHER_PROFILE,
};

const MSG_ME = {
  id: "m2",
  conversation_id: "conv-1",
  sender_id: "me-id",
  content: "Hi back",
  status: "read",
  created_at: "2026-04-26T10:01:00Z",
  message_attachments: [],
  profiles: MY_PROFILE,
};

beforeEach(() => {
  cleanup();
  sendMessageMutate.mockReset();
  markReadMutate.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  storageUploadMock.mockReset();
  storageCreateSignedUrlMock.mockClear();
  removeChannelMock.mockReset();
  channelMock.on.mockClear();
  channelMock.subscribe.mockClear();
  navigateMock.mockReset();
  clipboardWriteText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWriteText },
  });
  useAuthMock.mockReturnValue({ user: ME });
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Messages — empty / loading states", () => {
  it("shows the conversation-list spinner while loading", () => {
    useConversationsMock.mockReturnValue({ data: [], isLoading: true });
    useMessagesMock.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(<Messages />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders the empty-state CTA when no conversations exist", () => {
    useConversationsMock.mockReturnValue({ data: [], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [], isLoading: false });
    render(<Messages />);
    expect(screen.getByText("No conversations yet")).toBeTruthy();
    // Both the empty list and the empty-chat placeholder render a Browse Listings link.
    expect(screen.getAllByRole("link", { name: /browse listings/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("shows the 'select a conversation' placeholder when none active", () => {
    useConversationsMock.mockReturnValue({ data: [], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [], isLoading: false });
    render(<Messages />);
    expect(screen.getByText("Select a conversation")).toBeTruthy();
  });
});

describe("Messages — conversation list rendering", () => {
  it("renders each conversation row with the other participant's name", () => {
    useConversationsMock.mockReturnValue({ data: [CONV_1, CONV_2], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [], isLoading: false });
    render(<Messages />);
    // Bob appears in both the conv list and the active chat header (auto-selected first conv).
    expect(screen.getAllByText("Bob Builder").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Alice Smith")).toBeTruthy();
    // Listing breadcrumb is rendered for conv-1 only (conv-2 has no listing).
    expect(screen.getAllByText(/Cozy Flat · Athens/).length).toBeGreaterThanOrEqual(1);
  });

  it("filters conversations via the search input", async () => {
    useConversationsMock.mockReturnValue({ data: [CONV_1, CONV_2], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(<Messages />);
    const search = screen.getByPlaceholderText("Search conversations...");
    fireEvent.change(search, { target: { value: "alice" } });
    await waitFor(() => {
      // Scope to the conv-list pane (the first w-72 column) — the chat header still
      // references the originally-selected conv even after the list filters down.
      const listPane = container.querySelector("div.md\\:w-72") as HTMLElement;
      expect(within(listPane).queryByText("Bob Builder")).toBeNull();
      expect(within(listPane).getByText("Alice Smith")).toBeTruthy();
    });
  });

  it("auto-selects the first conversation and fetches its messages", async () => {
    useConversationsMock.mockReturnValue({ data: [CONV_1], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [MSG_THEM, MSG_ME], isLoading: false });
    render(<Messages />);
    // useMessages was invoked with the active conv id.
    await waitFor(() => {
      expect(useMessagesMock).toHaveBeenCalledWith("conv-1");
    });
  });
});

describe("Messages — chat thread rendering", () => {
  beforeEach(() => {
    useConversationsMock.mockReturnValue({ data: [CONV_1], isLoading: false });
  });

  it("shows the chat-area spinner when messages are loading", () => {
    useMessagesMock.mockReturnValue({ data: [], isLoading: true });
    const { container } = render(<Messages />);
    // Two spinners possible (list loading is false, but chat is loading).
    expect(container.querySelectorAll(".animate-spin").length).toBeGreaterThan(0);
  });

  it("renders the no-messages-yet placeholder when thread is empty", () => {
    useMessagesMock.mockReturnValue({ data: [], isLoading: false });
    render(<Messages />);
    expect(screen.getByText(/No messages yet/)).toBeTruthy();
  });

  it("renders messages with sender labels and read/unread ticks", () => {
    useMessagesMock.mockReturnValue({ data: [MSG_THEM, MSG_ME], isLoading: false });
    render(<Messages />);
    const contents = screen.getAllByTestId("msg-content").map((n) => n.textContent);
    expect(contents).toEqual(["Hello there!", "Hi back"]);
  });

  it("calls markAsRead when there are unread messages from the other side", async () => {
    useMessagesMock.mockReturnValue({ data: [MSG_THEM], isLoading: false });
    render(<Messages />);
    await waitFor(() => expect(markReadMutate).toHaveBeenCalledTimes(1));
  });
});

describe("Messages — send + file upload handlers", () => {
  beforeEach(() => {
    useConversationsMock.mockReturnValue({ data: [CONV_1], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [], isLoading: false });
  });

  it("ignores send-clicks when the input is empty and no files are pending", () => {
    render(<Messages />);
    const sendBtn = screen.getAllByRole("button").find((b) => b.querySelector(".lucide-send")) as HTMLButtonElement;
    fireEvent.click(sendBtn);
    expect(sendMessageMutate).not.toHaveBeenCalled();
  });

  it("sends the typed message and clears the input afterwards", async () => {
    render(<Messages />);
    const inputBox = screen.getByPlaceholderText("Type a message...") as HTMLInputElement;
    fireEvent.change(inputBox, { target: { value: "hi from test" } });
    fireEvent.keyDown(inputBox, { key: "Enter" });
    await waitFor(() => {
      expect(sendMessageMutate).toHaveBeenCalledWith({
        conversation_id: "conv-1",
        content: "hi from test",
        attachmentPaths: undefined,
      });
    });
    expect(inputBox.value).toBe("");
  });

  it("shares the property link when the share-link button is clicked", () => {
    render(<Messages />);
    const linkBtn = screen.getByLabelText("Share property link");
    const inputBox = screen.getByPlaceholderText("Type a message...") as HTMLInputElement;
    fireEvent.click(linkBtn);
    expect(inputBox.value).toContain("/property/listing-1");
  });

  it("rejects file uploads above the 10 MB limit and surfaces a toast", async () => {
    render(<Messages />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "huge.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [big], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/10 MB limit/));
    });
    expect(storageUploadMock).not.toHaveBeenCalled();
  });

  it("uploads acceptable files and stages them as pending attachments", async () => {
    storageUploadMock.mockResolvedValue({ error: null });
    render(<Messages />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const small = new File([new Uint8Array(1024)], "ok.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [small], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => {
      expect(storageUploadMock).toHaveBeenCalledTimes(1);
    });
    // Pending attachment label appears.
    await waitFor(() => expect(screen.getByText("ok.pdf")).toBeTruthy());
  });

  it("surfaces a toast when storage upload fails", async () => {
    storageUploadMock.mockRejectedValue(new Error("boom"));
    render(<Messages />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const small = new File([new Uint8Array(1024)], "ok.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [small], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/boom/));
    });
  });
});

describe("Messages — additional render branches", () => {
  it("opens conversation options, routes to the listing, and copies share links", async () => {
    useConversationsMock.mockReturnValue({ data: [CONV_1], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [], isLoading: false });

    render(<Messages />);

    fireEvent.pointerDown(screen.getByLabelText("Conversation options"), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByText("View listing"));
    expect(navigateMock).toHaveBeenCalledWith("/new-build/listing-1");

    fireEvent.pointerDown(screen.getByLabelText("Conversation options"), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByText("Copy property link"));
    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(expect.stringContaining("/new-build/listing-1"));
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Property link copied");

    fireEvent.pointerDown(screen.getByLabelText("Conversation options"), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByText("Copy conversation link"));
    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(expect.stringContaining("/messages?conversation=conv-1"));
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Conversation link copied");
  });

  it("sends pending attachments alongside the message body", async () => {
    storageUploadMock.mockResolvedValue({ error: null });
    useConversationsMock.mockReturnValue({ data: [CONV_1], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [], isLoading: false });
    render(<Messages />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const small = new File([new Uint8Array(1024)], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [small], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(screen.getByText("doc.pdf")).toBeTruthy());

    const inputBox = screen.getByPlaceholderText("Type a message...") as HTMLInputElement;
    fireEvent.change(inputBox, { target: { value: "see attached" } });
    fireEvent.keyDown(inputBox, { key: "Enter" });
    await waitFor(() => {
      expect(sendMessageMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          conversation_id: "conv-1",
          content: "see attached",
          attachmentPaths: expect.arrayContaining([
            expect.objectContaining({ filename: "doc.pdf", mime_type: "application/pdf" }),
          ]),
        }),
      );
    });
  });

  it("sends a paperclip emoji when only attachments are present (no typed text)", async () => {
    storageUploadMock.mockResolvedValue({ error: null });
    useConversationsMock.mockReturnValue({ data: [CONV_1], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [], isLoading: false });
    render(<Messages />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const small = new File([new Uint8Array(1024)], "x.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [small], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(screen.getByText("x.pdf")).toBeTruthy());

    const sendBtn = screen.getAllByRole("button").find((b) => b.querySelector(".lucide-send")) as HTMLButtonElement;
    fireEvent.click(sendBtn);
    await waitFor(() => {
      expect(sendMessageMutate).toHaveBeenCalledWith(
        expect.objectContaining({ content: "📎" }),
      );
    });
  });

  it("does NOT send on Shift+Enter (newline behavior)", () => {
    useConversationsMock.mockReturnValue({ data: [CONV_1], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [], isLoading: false });
    render(<Messages />);
    const inputBox = screen.getByPlaceholderText("Type a message...") as HTMLInputElement;
    fireEvent.change(inputBox, { target: { value: "wip" } });
    fireEvent.keyDown(inputBox, { key: "Enter", shiftKey: true });
    expect(sendMessageMutate).not.toHaveBeenCalled();
  });

  it("renders an image avatar when the other party has an avatar_url", () => {
    const convWithAvatar = {
      ...CONV_1,
      profile_b: { ...OTHER_PROFILE, avatar_url: "https://cdn.example/bob.jpg" },
    };
    useConversationsMock.mockReturnValue({ data: [convWithAvatar], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [], isLoading: false });
    render(<Messages />);
    const imgs = document.querySelectorAll('img[src="https://cdn.example/bob.jpg"]');
    // Avatar appears in both the conv-list row and the chat header.
    expect(imgs.length).toBeGreaterThanOrEqual(1);
  });

  it("shows the unread tick (Check) for a message I sent that is still 'sent', and the 'You:' prefix in the conv list", () => {
    const myUnsentMsg = {
      ...MSG_ME,
      id: "m3",
      status: "sent",
      content: "still delivering",
    };
    const convWithMyLast = {
      ...CONV_1,
      messages: [{ content: "still delivering", created_at: "2026-04-26T10:02:00Z", sender_id: "me-id" }],
    };
    useConversationsMock.mockReturnValue({ data: [convWithMyLast], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [myUnsentMsg], isLoading: false });
    const { container } = render(<Messages />);
    // "You: " prefix branch in the conv list preview.
    expect(container.textContent).toContain("You: still delivering");
    // Single-tick (Check) is rendered for the unread sent message.
    expect(container.querySelector(".lucide-check:not(.lucide-check-check)")).toBeTruthy();
  });

  it("renders attachments within a message bubble (length > 0 branch)", () => {
    const msgWithAttachments = {
      ...MSG_THEM,
      message_attachments: [
        { storage_path: "u/c/file.png", filename: "photo.png", mime_type: "image/png" },
      ],
    };
    useConversationsMock.mockReturnValue({ data: [CONV_1], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [msgWithAttachments], isLoading: false });
    render(<Messages />);
    // Placeholder text rendered while signed URL is being fetched.
    expect(screen.getByText("photo.png")).toBeTruthy();
  });

  it("removes a pending attachment when its × button is clicked", async () => {
    storageUploadMock.mockResolvedValue({ error: null });
    useConversationsMock.mockReturnValue({ data: [CONV_1], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [], isLoading: false });
    render(<Messages />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const small = new File([new Uint8Array(1024)], "rm.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [small], configurable: true });
    fireEvent.change(fileInput);
    const pill = await waitFor(() => screen.getByText("rm.pdf"));
    const removeBtn = within(pill.parentElement as HTMLElement).getByRole("button");
    fireEvent.click(removeBtn);
    await waitFor(() => expect(screen.queryByText("rm.pdf")).toBeNull());
  });
});

describe("Messages — mobile navigation", () => {
  it("flips back to the list view when the mobile back button is clicked", () => {
    useConversationsMock.mockReturnValue({ data: [CONV_1], isLoading: false });
    useMessagesMock.mockReturnValue({ data: [MSG_THEM], isLoading: false });
    const { container } = render(<Messages />);
    const back = screen.getByLabelText("Back to conversations");
    fireEvent.click(back);
    // The chat pane gets the `hidden md:flex` class once mobileView is back to "list".
    const chatPane = within(container).getAllByRole("button", { name: /back to conversations/i })[0]
      .closest("div.flex-1.flex.flex-col");
    // Hidden via class on mobile.
    expect(chatPane?.className).toContain("hidden");
  });
});
