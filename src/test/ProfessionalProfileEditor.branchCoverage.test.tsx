import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useMyProfessional: vi.fn(),
  updateProfessional: { mutateAsync: vi.fn(), isPending: false },
  uploadAvatar: vi.fn(),
  toast: { error: vi.fn() },
}));

vi.mock("@/hooks/useProfessionalServices", () => ({
  useMyProfessional: () => mocks.useMyProfessional(),
  useUpdateProfessional: () => mocks.updateProfessional,
}));
vi.mock("@/lib/profileAvatarUpload", () => ({
  uploadProfileAvatar: (...args: unknown[]) => mocks.uploadAvatar(...args),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/components/location/LocationAutocompleteInput", () => ({
  LocationAutocompleteInput: ({ value, onChange, ...props }: { value: string; onChange: (value: string) => void; [key: string]: unknown }) => (
    <input {...props} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

import { ProfessionalProfileEditor } from "@/components/dashboard/ProfessionalProfileEditor";

const profile = (overrides: Record<string, unknown> = {}) => ({
  id: "professional-1",
  user_id: "user-1",
  display_name: "Maria Architect",
  title: "Licensed Architect",
  bio: "Design and permitting",
  city: "Athens",
  hourly_rate: 95,
  license_number: "TEE-100",
  experience_years: 12,
  website_url: "https://architect.example",
  specialties: ["Renovation", "Permits"],
  languages: ["Greek", "English"],
  avatar_url: null,
  rating: 4.4,
  reviews_count: 1,
  ...overrides,
});

const renderEditor = (onSwitchToSettings?: () => void) => render(
  <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
    <ProfessionalProfileEditor onSwitchToSettings={onSwitchToSettings} />
  </MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateProfessional.isPending = false;
  mocks.updateProfessional.mutateAsync.mockResolvedValue(undefined);
  mocks.uploadAvatar.mockResolvedValue({ url: "https://cdn.example/new-avatar.jpg" });
  mocks.useMyProfessional.mockReturnValue({ data: profile(), isLoading: false });
});

describe("ProfessionalProfileEditor business branches", () => {
  it("keeps both loading and unavailable professional states non-editable", () => {
    mocks.useMyProfessional.mockReturnValueOnce({ data: null, isLoading: true });
    const loading = renderEditor();
    expect(loading.container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
    loading.unmount();

    mocks.useMyProfessional.mockReturnValue({ data: null, isLoading: false });
    const unavailable = renderEditor();
    expect(unavailable.container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(mocks.updateProfessional.mutateAsync).not.toHaveBeenCalled();
  });

  it("loads a complete portfolio, saves typed business values, and opens participant settings", async () => {
    const onSwitchToSettings = vi.fn();
    renderEditor(onSwitchToSettings);

    expect(screen.getByPlaceholderText("e.g. Licensed Architect")).toHaveValue("Licensed Architect");
    expect(screen.getByLabelText("City")).toHaveValue("Athens");
    expect(screen.getByText("4.4")).toBeInTheDocument();
    expect(screen.getByText("1 review")).toBeInTheDocument();
    expect(screen.getByText("Client reviews from completed consultations appear here.")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("e.g. Licensed Architect"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Thessaloniki" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 80"), { target: { value: "125.50" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 10"), { target: { value: "15" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Renovation, Permits"), { target: { value: "Renovation, , Surveying" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. English, Greek"), { target: { value: "Greek, French" } });
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(onSwitchToSettings).toHaveBeenCalledOnce();
    await waitFor(() => expect(mocks.updateProfessional.mutateAsync).toHaveBeenCalledWith({
      id: "professional-1",
      updates: expect.objectContaining({
        title: "Licensed Architect",
        city: "Thessaloniki",
        hourly_rate: 125.5,
        experience_years: 15,
        specialties: ["Renovation", "Surveying"],
        languages: ["Greek", "French"],
      }),
    }));
  });

  it("persists explicit nulls for optional fields on a new empty portfolio", async () => {
    mocks.useMyProfessional.mockReturnValue({
      data: profile({
        display_name: "",
        title: "",
        bio: null,
        city: null,
        hourly_rate: null,
        license_number: null,
        experience_years: null,
        website_url: null,
        specialties: null,
        languages: "not-an-array",
        rating: 0,
        reviews_count: 0,
      }),
      isLoading: false,
    });
    renderEditor();

    expect(screen.getByText("P")).toBeInTheDocument();
    expect(screen.getByText("0 reviews")).toBeInTheDocument();
    expect(screen.getByText("Reviews from clients will appear here once you complete consultations.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(mocks.updateProfessional.mutateAsync).toHaveBeenCalledWith({
      id: "professional-1",
      updates: {
        title: "",
        bio: null,
        city: null,
        hourly_rate: null,
        license_number: null,
        experience_years: null,
        website_url: null,
        specialties: null,
        languages: null,
      },
    }));
  });

  it.each([
    [new Error("Professional update rejected"), "Professional update rejected"],
    [{ message: "Profile row is locked" }, "Profile row is locked"],
    [{ message: "   " }, "Could not save profile."],
    ["unexpected failure", "Could not save profile."],
  ])("surfaces normalized save errors for %o", async (error, expectedMessage) => {
    mocks.updateProfessional.mutateAsync.mockRejectedValue(error);
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(expectedMessage));
  });

  it("renders the stored avatar and does nothing when the picker closes without a file", () => {
    mocks.useMyProfessional.mockReturnValue({
      data: profile({ avatar_url: "https://cdn.example/current-avatar.jpg" }),
      isLoading: false,
    });
    renderEditor();

    expect(document.querySelector('img[src="https://cdn.example/current-avatar.jpg"]')).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [], configurable: true });
    fireEvent.change(input);
    expect(mocks.uploadAvatar).not.toHaveBeenCalled();
  });

  it("shows avatar upload progress and persists the uploaded URL", async () => {
    let finishUpload!: (value: { url: string }) => void;
    mocks.uploadAvatar.mockReturnValue(new Promise((resolve) => { finishUpload = resolve; }));
    renderEditor();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const avatar = new File(["image"], "portrait.webp", { type: "image/webp" });
    Object.defineProperty(input, "files", { value: [avatar], configurable: true });

    fireEvent.change(input);
    await waitFor(() => expect(screen.getByRole("button", { name: /upload photo/i })).toBeDisabled());
    expect(mocks.uploadAvatar).toHaveBeenCalledWith(avatar, "user-1");

    await act(async () => finishUpload({ url: "https://cdn.example/finished.jpg" }));
    await waitFor(() => expect(mocks.updateProfessional.mutateAsync).toHaveBeenCalledWith({
      id: "professional-1",
      updates: { avatar_url: "https://cdn.example/finished.jpg" },
    }));
    expect(screen.getByRole("button", { name: /upload photo/i })).not.toBeDisabled();
  });

  it("reports upload failures but avoids a misleading upload error after storage succeeds", async () => {
    mocks.uploadAvatar.mockRejectedValueOnce({ message: "Image type rejected" });
    const first = renderEditor();
    const firstInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(firstInput, "files", {
      value: [new File(["bad"], "avatar.gif", { type: "image/gif" })],
      configurable: true,
    });
    fireEvent.change(firstInput);
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Image type rejected"));
    first.unmount();

    vi.clearAllMocks();
    mocks.useMyProfessional.mockReturnValue({ data: profile(), isLoading: false });
    mocks.uploadAvatar.mockResolvedValue({ url: "https://cdn.example/stored.jpg" });
    mocks.updateProfessional.mutateAsync.mockRejectedValue(new Error("profile update failed"));
    renderEditor();
    const secondInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(secondInput, "files", {
      value: [new File(["ok"], "avatar.png", { type: "image/png" })],
      configurable: true,
    });
    fireEvent.change(secondInput);

    await waitFor(() => expect(mocks.updateProfessional.mutateAsync).toHaveBeenCalled());
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("disables saves while the update mutation is pending", () => {
    mocks.updateProfessional.isPending = true;
    const { container } = renderEditor();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload photo/i })).toBeDisabled();
  });
});
