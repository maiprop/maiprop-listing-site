import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import BrandedVideoRoom from "@/pages/BrandedVideoRoom";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  professional: {
    id: "22222222-2222-4222-8222-222222222222",
    user_id: "owner-1",
    display_name: "Ariadne Pro",
    avatar_url: "https://example.com/pro.png",
    title: "Architect",
    category: "Design",
    video_link: null as string | null,
  },
  consultationId: null as string | null,
  consultation: {
    id: "33333333-3333-4333-8333-333333333333",
    professional_id: "22222222-2222-4222-8222-222222222222",
    requester_id: "buyer-1",
    requester_name: "Buyer One",
    requester_email: "buyer@example.com",
    service: "Feasibility review",
    preferred_date: "2026-06-01",
    preferred_time: "10:00",
    request_type: "consultation",
    status: "confirmed",
    meeting_type: "video",
  },
  currentUserId: "owner-1",
  consultationAuthorized: false,
  queryError: null as Error | null,
  queryPending: false,
  getUserMedia: vi.fn(),
  getSession: vi.fn(),
  writeText: vi.fn(),
  setRealtimeAuth: vi.fn(),
  removeChannel: vi.fn(),
  channel: null as ReturnType<typeof createChannelMock> | null,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ professionalId: "22222222-2222-4222-8222-222222222222", consultationId: mocks.consultationId ?? undefined }),
    useNavigate: () => mocks.navigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: mocks.currentUserId, email: "kr@example.com" }, profile: { display_name: "K R" } }),
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => {
          if (table === "professionals") {
            if (mocks.queryError) return { data: null, error: mocks.queryError };
            return { data: mocks.professional, error: null };
          }
          return {
            data: mocks.consultationAuthorized && mocks.consultation.meeting_type === "video" ? mocks.consultation : null,
            error: null,
          };
        }),
      };
      return query;
    }),
    channel: vi.fn(() => {
      mocks.channel = createChannelMock();
      return mocks.channel;
    }),
    auth: {
      getSession: mocks.getSession,
    },
    realtime: {
      setAuth: mocks.setRealtimeAuth,
    },
    removeChannel: mocks.removeChannel,
  },
}));

function createMediaStreamMock() {
  const audioTrack = { enabled: true, stop: vi.fn() };
  const videoTrack = { enabled: true, stop: vi.fn() };
  return {
    getTracks: () => [audioTrack, videoTrack],
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => [videoTrack],
  } as unknown as MediaStream;
}

function createChannelMock() {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn((callback?: (status: string) => void | Promise<void>) => {
      void callback?.("SUBSCRIBED");
      return channel;
    }),
    track: vi.fn().mockResolvedValue("ok"),
    untrack: vi.fn().mockResolvedValue("ok"),
    send: vi.fn().mockResolvedValue("ok"),
    presenceState: vi.fn(() => ({})),
  };
  return channel;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function renderRoom() {
  return renderWithProviders(<BrandedVideoRoom />);
}

describe("BrandedVideoRoom", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.professional = {
      id: "22222222-2222-4222-8222-222222222222",
      user_id: "owner-1",
      display_name: "Ariadne Pro",
      avatar_url: "https://example.com/pro.png",
      title: "Architect",
      category: "Design",
      video_link: null,
    };
    mocks.consultationId = null;
    mocks.consultation = {
      id: "33333333-3333-4333-8333-333333333333",
      professional_id: "22222222-2222-4222-8222-222222222222",
      requester_id: "buyer-1",
      requester_name: "Buyer One",
      requester_email: "buyer@example.com",
      service: "Feasibility review",
      preferred_date: "2026-06-01",
      preferred_time: "10:00",
      request_type: "consultation",
      status: "confirmed",
      meeting_type: "video",
    };
    mocks.currentUserId = "owner-1";
    mocks.consultationAuthorized = false;
    mocks.queryError = null;
    mocks.channel = null;
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } } });
    mocks.setRealtimeAuth.mockResolvedValue(undefined);
    mocks.getUserMedia.mockResolvedValue(createMediaStreamMock());
    mocks.writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: mocks.getUserMedia },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  it("shows a not-found state without leaking query details", async () => {
    mocks.queryError = new Error("permission denied");
    renderRoom();

    expect(await screen.findByText("Professional not found.")).toBeInTheDocument();
    expect(screen.queryByText("permission denied")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to professionals/i })).toHaveAttribute("href", "/professionals");
  });

  it("blocks non-participants from professional rooms", async () => {
    mocks.currentUserId = "buyer-without-confirmed-request";
    mocks.consultationAuthorized = false;
    renderRoom();

    expect(await screen.findByText("Professional not found.")).toBeInTheDocument();
    expect(screen.queryByText(/mAI prop video room/i)).not.toBeInTheDocument();
  });

  it("blocks buyers from the legacy professional-wide room even with another confirmed consultation", async () => {
    mocks.currentUserId = "buyer-1";
    mocks.consultationAuthorized = true;
    renderRoom();

    expect(await screen.findByText("Professional not found.")).toBeInTheDocument();
    expect(screen.queryByText(/mAI prop video room/i)).not.toBeInTheDocument();
  });

  it("scopes buyer access and signaling to a confirmed video consultation", async () => {
    mocks.currentUserId = "buyer-1";
    mocks.consultationId = "33333333-3333-4333-8333-333333333333";
    mocks.consultationAuthorized = true;
    renderRoom();

    expect(await screen.findByText(/mAI prop video room/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Feasibility review - 2026-06-01 10:00/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Copy link/i }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(expect.stringMatching(/\/video-room\/22222222-2222-4222-8222-222222222222\/33333333-3333-4333-8333-333333333333$/)));

    fireEvent.click(screen.getByRole("button", { name: /Join now/i }));
    await screen.findByText(/Waiting for the other participant/i);
    const { supabase } = await import("@/integrations/supabase/client");
    expect(supabase.channel).toHaveBeenCalledWith("video:consultation:33333333-3333-4333-8333-333333333333", expect.objectContaining({
      config: expect.objectContaining({ private: true }),
    }));
  });

  it("rejects scoped in-person consultations before exposing the room", async () => {
    mocks.currentUserId = "buyer-1";
    mocks.consultationId = "33333333-3333-4333-8333-333333333333";
    mocks.consultationAuthorized = true;
    mocks.consultation.meeting_type = "in_person";

    renderRoom();

    expect(await screen.findByText("Professional not found.")).toBeInTheDocument();
    expect(screen.queryByText(/mAI prop video room/i)).not.toBeInTheDocument();
  });

  it("routes known external provider links through a clear handoff screen", async () => {
    mocks.professional.video_link = "https://meet.google.com/abc-defg-hij";
    renderRoom();

    expect(await screen.findByText(/Video consultation with Ariadne Pro/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Google Meet/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Open Google Meet/i })).toHaveAttribute("href", mocks.professional.video_link);
  });

  it("checks device permissions, copies the fallback room link, joins, ends, saves notes, downloads, and returns", async () => {
    const createObjectURL = vi.fn(() => "blob:summary");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    renderRoom();

    expect(await screen.findByText(/mAI prop video room/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Test camera/i }));
    await waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalledWith({ video: true, audio: true }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Camera and microphone are working."));

    fireEvent.click(screen.getByRole("button", { name: /Copy link/i }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(expect.stringMatching(/\/video-room\/22222222-2222-4222-8222-222222222222$/)));

    fireEvent.click(screen.getByRole("button", { name: /Join now/i }));
    expect(await screen.findByText(/Waiting for the other participant/i)).toBeInTheDocument();
    expect(mocks.setRealtimeAuth).toHaveBeenCalledWith("test-token");
    expect(mocks.channel).not.toBeNull();
    const { supabase } = await import("@/integrations/supabase/client");
    expect(supabase.channel).toHaveBeenCalledWith("video:professional:22222222-2222-4222-8222-222222222222", expect.objectContaining({
      config: expect.objectContaining({ private: true }),
    }));
    expect(mocks.channel?.track).toHaveBeenCalledWith(expect.objectContaining({ displayName: "K R" }));

    fireEvent.click(screen.getByRole("button", { name: /End call/i }));
    expect(await screen.findByText("Call Summary")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Add consultation notes/i), { target: { value: "Send valuation pack" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Notes/i }));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Notes saved locally.");

    fireEvent.click(screen.getByRole("button", { name: /Download Summary/i }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:summary");

    fireEvent.click(screen.getByRole("button", { name: /Return to Profile/i }));
    expect(mocks.navigate).toHaveBeenCalledWith("/professionals/22222222-2222-4222-8222-222222222222");
  });

  it("reports camera permission failures without joining", async () => {
    mocks.getUserMedia.mockRejectedValue(new Error("blocked"));
    renderRoom();

    await screen.findByRole("button", { name: /Test camera/i });
    fireEvent.click(screen.getByRole("button", { name: /Test camera/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Could not access camera or microphone. Please check your browser permissions."));
    expect(screen.queryByText(/Waiting for the other participant/i)).not.toBeInTheDocument();
  });
});
