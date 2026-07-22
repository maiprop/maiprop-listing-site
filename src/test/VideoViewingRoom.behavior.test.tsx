import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import VideoViewingRoom from "@/pages/VideoViewingRoom";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  viewing: {
    id: "11111111-1111-4111-8111-111111111111",
    listing_id: "listing-1",
    owner_id: "owner-1",
    requester_id: "buyer-1",
    viewing_type: "video",
    status: "confirmed",
    scheduled_at: "2026-06-01T10:30:00.000Z",
    video_link: null as string | null,
    note: null,
    created_at: "2026-05-20T10:00:00.000Z",
    updated_at: "2026-05-20T10:00:00.000Z",
    listings: {
      title: "Sample Flat",
      city: "Athens",
      cover_image_url: "https://example.com/flat.jpg",
      address: "1 Demo Street",
    },
  },
  queryError: null as Error | null,
  roomProps: null as Record<string, unknown> | null,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ viewingId: "11111111-1111-4111-8111-111111111111" }),
    useNavigate: () => mocks.navigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "buyer-1", email: "buyer@example.com" },
    profile: { display_name: "Buyer One" },
  }),
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/video/MaiPropVideoRoom", () => ({
  MaiPropVideoRoom: (props: Record<string, unknown>) => {
    mocks.roomProps = props;
    const subject = props.subject as { title?: string; subtitle?: string } | undefined;
    return (
      <section data-testid="maiprop-video-room">
        <p>{String(props.contextLabel)}</p>
        <p>{String(subject?.title ?? "")}</p>
        <p>{String(props.roomTopic)}</p>
      </section>
    );
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn((fn: string) => {
      if (fn !== "get_listing_reference_catalogue") {
        throw new Error(`Unexpected RPC: ${fn}`);
      }
      return {
        select: vi.fn(() => ({
          in: vi.fn(async () => ({
            data: mocks.viewing.listings
              ? [{ id: mocks.viewing.listing_id, ...mocks.viewing.listings }]
              : [],
            error: null,
          })),
        })),
      };
    }),
    from: vi.fn((_table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        single: vi.fn(async () => {
          if (mocks.queryError) return { data: null, error: mocks.queryError };
          const { listings: _listing, ...viewingRow } = mocks.viewing;
          return { data: viewingRow, error: null };
        }),
      };
      return query;
    }),
  },
}));

describe("VideoViewingRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryError = null;
    mocks.roomProps = null;
    mocks.viewing = {
      id: "11111111-1111-4111-8111-111111111111",
      listing_id: "listing-1",
      owner_id: "owner-1",
      requester_id: "buyer-1",
      viewing_type: "video",
      status: "confirmed",
      scheduled_at: "2026-06-01T10:30:00.000Z",
      video_link: null,
      note: null,
      created_at: "2026-05-20T10:00:00.000Z",
      updated_at: "2026-05-20T10:00:00.000Z",
      listings: {
        title: "Sample Flat",
        city: "Athens",
        cover_image_url: "https://example.com/flat.jpg",
        address: "1 Demo Street",
      },
    };
  });

  it("hands confirmed video viewings with host links to the external provider", async () => {
    mocks.viewing.video_link = "https://zoom.us/j/123456789";

    renderWithProviders(<VideoViewingRoom />);

    expect(await screen.findByText(/Video viewing for Sample Flat/i)).toBeInTheDocument();
    expect(screen.getByText(/The host set Zoom/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Zoom/i })).toHaveAttribute("href", "https://zoom.us/j/123456789");
    expect(screen.queryByTestId("maiprop-video-room")).not.toBeInTheDocument();
  });

  it("falls back to the in-app mAI Prop room when no external link is set", async () => {
    renderWithProviders(<VideoViewingRoom />);

    const room = await screen.findByTestId("maiprop-video-room");
    expect(room).toBeInTheDocument();
    expect(screen.getByText("Property video viewing")).toBeInTheDocument();
    expect(within(room).getByText("Sample Flat")).toBeInTheDocument();
    expect(screen.getByText("video:viewing:11111111-1111-4111-8111-111111111111")).toBeInTheDocument();
    expect(mocks.roomProps).toMatchObject({
      roomTopic: "video:viewing:11111111-1111-4111-8111-111111111111",
      roomDisplayName: "maiprop-viewing-11111111",
      backHref: "/dashboard?tab=viewings",
      notesStorageKey: "viewing-call-notes-11111111-1111-4111-8111-111111111111",
    });
    expect(String(mocks.roomProps?.roomUrl)).toMatch(/\/video-viewing\/11111111-1111-4111-8111-111111111111$/);
  });

  it("rejects non-video viewings before exposing a room", async () => {
    mocks.viewing.viewing_type = "in_person";

    renderWithProviders(<VideoViewingRoom />);

    expect(await screen.findByText("Video viewing not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Viewings/i })).toHaveAttribute("href", "/dashboard?tab=viewings");
    expect(screen.queryByTestId("maiprop-video-room")).not.toBeInTheDocument();
  });

  it("rejects unconfirmed video viewings before exposing links or rooms", async () => {
    mocks.viewing.status = "pending";
    mocks.viewing.video_link = "https://zoom.us/j/123456789";

    renderWithProviders(<VideoViewingRoom />);

    expect(await screen.findByText("Video viewing is not ready yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Viewings/i })).toHaveAttribute("href", "/dashboard?tab=viewings");
    expect(screen.queryByRole("link", { name: /Open Zoom/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("maiprop-video-room")).not.toBeInTheDocument();
  });
});
