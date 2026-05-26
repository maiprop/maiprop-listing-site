import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileEditor } from "@/components/dashboard/ProfileEditor";
import { ProfessionalProfileEditor } from "@/components/dashboard/ProfessionalProfileEditor";
import type { Profile } from "@/contexts/AuthContext";

const mocks = vi.hoisted(() => ({
  professional: {
    id: "pro-1",
    title: "Licensed Architect",
    bio: "",
    city: "",
    hourly_rate: null,
    license_number: null,
    experience_years: null,
    website_url: null,
    specialties: [],
    languages: [],
    rating: 0,
    reviews_count: 0,
  },
  updateProfessional: { isPending: false, mutateAsync: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/useProfessionalServices", () => ({
  useMyProfessional: () => ({ data: mocks.professional, isLoading: false }),
  useUpdateProfessional: () => mocks.updateProfessional,
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.professional.city = "";
  mocks.updateProfessional.isPending = false;
  mocks.updateProfessional.mutateAsync.mockResolvedValue(undefined);
});

describe("profile location inputs", () => {
  it("wires the basic profile city field to location suggestions", async () => {
    const onUpdate = vi.fn().mockResolvedValue({ error: null });
    render(
      <ProfileEditor
        profile={{ id: "user-1", city: "", display_name: "", first_name: "", last_name: "", phone: "" } as Partial<Profile> as Profile}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.focus(screen.getByLabelText("City"));
    fireEvent.click(screen.getByRole("option", { name: "Athens" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ city: "Athens" })));
  });

  it("wires the professional profile city field to location suggestions", async () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <ProfessionalProfileEditor />
      </MemoryRouter>,
    );

    fireEvent.focus(screen.getByLabelText("City"));
    fireEvent.click(screen.getByRole("option", { name: "Athens" }));
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(mocks.updateProfessional.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      id: "pro-1",
      updates: expect.objectContaining({ city: "Athens" }),
    })));
  });
});
