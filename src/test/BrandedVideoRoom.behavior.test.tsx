import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import BrandedVideoRoom from "@/pages/BrandedVideoRoom";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  professional: {
    id: "pro-1",
    display_name: "Ariadne Pro",
    avatar_url: "https://example.com/pro.png",
    title: "Architect",
    category: "Design",
    video_link: null as string | null,
  },
  queryError: null as Error | null,
  queryPending: false,
  getUserMedia: vi.fn(),
  writeText: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ professionalId: "pro-1" }),
    useNavigate: () => mocks.navigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { display_name: "K R" } }),
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        single: vi.fn(async () => {
          if (mocks.queryError) return { data: null, error: mocks.queryError };
          return { data: mocks.professional, error: null };
        }),
      };
      return query;
    }),
  },
}));

function renderRoom() {
  return renderWithProviders(<BrandedVideoRoom />);
}

describe("BrandedVideoRoom", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.professional = {
      id: "pro-1",
      display_name: "Ariadne Pro",
      avatar_url: "https://example.com/pro.png",
      title: "Architect",
      category: "Design",
      video_link: null,
    };
    mocks.queryError = null;
    mocks.getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
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

    expect(await screen.findByText(/maiProp video room/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Test camera/i }));
    await waitFor(() => expect(mocks.getUserMedia).toHaveBeenCalledWith({ video: true, audio: true }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Camera and microphone are working."));

    fireEvent.click(screen.getByRole("button", { name: /Copy link/i }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith("https://meet.jit.si/maiprop-pro-1"));

    fireEvent.click(screen.getByRole("button", { name: /Join now/i }));
    expect(await screen.findByTitle("Video consultation")).toHaveAttribute(
      "src",
      expect.stringContaining("userInfo.displayName=K%20R"),
    );

    fireEvent.click(screen.getByRole("button", { name: /End call/i }));
    expect(await screen.findByText("Call Summary")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Add consultation notes/i), { target: { value: "Send valuation pack" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Notes/i }));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Notes saved locally.");

    fireEvent.click(screen.getByRole("button", { name: /Download Summary/i }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:summary");

    fireEvent.click(screen.getByRole("button", { name: /Return to Profile/i }));
    expect(mocks.navigate).toHaveBeenCalledWith("/professionals/pro-1");
  });

  it("reports camera permission failures without joining", async () => {
    mocks.getUserMedia.mockRejectedValue(new Error("blocked"));
    renderRoom();

    await screen.findByRole("button", { name: /Test camera/i });
    fireEvent.click(screen.getByRole("button", { name: /Test camera/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Could not access camera or microphone. Please check your browser permissions."));
    expect(screen.queryByTitle("Video consultation")).not.toBeInTheDocument();
  });
});
