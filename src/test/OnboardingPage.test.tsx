import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useAuthMock,
  invokeMock,
  fromMock,
  toastMock,
  navigateMock,
  trackMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  invokeMock: vi.fn(),
  fromMock: vi.fn(),
  toastMock: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  navigateMock: vi.fn(),
  trackMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock }, from: fromMock },
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/analytics", () => ({ trackAnalyticsEvent: trackMock }));
vi.mock("@/hooks/usePricingConfigs", () => ({
  PRICING_KEYS: { professional_basic: "professional_basic" },
  formatPrice: () => "EUR 49/mo",
  usePricingConfigs: () => ({ data: {} }),
}));
vi.mock("@/components/RoleSwitchModal", () => ({
  RoleSwitchModal: ({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) => (
    <div data-testid="role-switch-modal">
      <button onClick={onConfirm}>confirm switch</button>
      <button onClick={onCancel}>cancel switch</button>
    </div>
  ),
}));
vi.mock("@/components/onboarding/OnboardingShell", () => ({
  OnboardingShell: ({ children, onBack, step }: { children: React.ReactNode; onBack?: () => void; step: string }) => (
    <section data-step={step}>
      {onBack && <button onClick={onBack}>Back</button>}
      {children}
    </section>
  ),
}));
vi.mock("@/components/onboarding/DoneScreen", () => ({
  DoneScreen: ({
    actions,
    onUpgradeToPro,
  }: {
    actions: { primary: { href: string; label: string }; subtitle: string };
    onUpgradeToPro?: () => void;
  }) => (
    <div>
      <p>done-screen</p>
      <p>{actions.subtitle}</p>
      <p>{actions.primary.href}</p>
      {onUpgradeToPro && <button onClick={onUpgradeToPro}>upgrade professional pro</button>}
    </div>
  ),
}));
vi.mock("@/components/onboarding/PickTypeStep", () => ({
  PickTypeStep: ({
    onConfirm,
    onDeveloperImmediate,
    onProfessionalImmediate,
  }: {
    onConfirm: (id: string) => void;
    onDeveloperImmediate: () => void;
    onProfessionalImmediate: () => void;
  }) => (
    <div>
      <button onClick={() => onConfirm("buyer")}>buyer role</button>
      <button onClick={() => onConfirm("seller")}>seller role</button>
      <button onClick={() => onConfirm("agent")}>agent role</button>
      <button onClick={onDeveloperImmediate}>developer role</button>
      <button onClick={onProfessionalImmediate}>professional role</button>
    </div>
  ),
}));
vi.mock("@/components/onboarding/DeveloperSetupStep", () => ({
  DeveloperSetupStep: ({
    form,
    errors,
    onFieldChange,
    onSubmit,
  }: {
    form: { companyName: string; city: string };
    errors: Record<string, string>;
    onFieldChange: (key: "companyName" | "city" | "devType", value: string) => void;
    onSubmit: () => void;
  }) => (
    <div>
      <input aria-label="company" value={form.companyName} onChange={(e) => onFieldChange("companyName", e.target.value)} />
      <input aria-label="city" value={form.city} onChange={(e) => onFieldChange("city", e.target.value)} />
      <button onClick={() => onFieldChange("devType", "residential")}>residential</button>
      <button onClick={onSubmit}>submit developer</button>
      {Object.values(errors).filter(Boolean).map((error) => <p key={error}>{error}</p>)}
    </div>
  ),
}));
vi.mock("@/components/onboarding/ProCategoryStep", () => ({
  ProCategoryStep: ({ proCategory, onChange, onNext }: { proCategory: string; onChange: (v: string) => void; onNext: () => void }) => (
    <div>
      <p>category:{proCategory || "none"}</p>
      <button onClick={() => onChange("architect")}>architect</button>
      <button onClick={onNext}>category next</button>
    </div>
  ),
}));
vi.mock("@/components/onboarding/ProVerifyStep", () => ({
  ProVerifyStep: ({
    form,
    errors,
    onFieldChange,
    onSubmit,
  }: {
    form: { businessName: string; taxId: string; phone: string };
    errors: Record<string, string>;
    onFieldChange: (key: "businessName" | "taxId" | "phone", value: string) => void;
    onSubmit: () => void;
  }) => (
    <div>
      <input aria-label="business" value={form.businessName} onChange={(e) => onFieldChange("businessName", e.target.value)} />
      <input aria-label="tax" value={form.taxId} onChange={(e) => onFieldChange("taxId", e.target.value)} />
      <input aria-label="phone" value={form.phone} onChange={(e) => onFieldChange("phone", e.target.value)} />
      <button onClick={onSubmit}>verify pro</button>
      {Object.values(errors).filter(Boolean).map((error) => <p key={error}>{error}</p>)}
    </div>
  ),
}));
vi.mock("@/components/onboarding/ProServicesStep", () => ({
  ProServicesStep: ({ onChange, onSave }: { onChange: (v: Record<string, unknown>) => void; onSave: () => void }) => (
    <div>
      <button onClick={() => onChange({
        consult: {
          template: { key: "consult", name: "Consultation", description: "Advice", isPremiumFeature: false },
          pricingModel: "hourly",
          rate: "",
          videoEnabled: false,
        },
      })}>select service</button>
      <button onClick={onSave}>save services</button>
    </div>
  ),
}));
vi.mock("@/components/onboarding/ProAvailabilityStep", () => ({
  ProAvailabilityStep: ({ onSave, onSkip }: { onSave: () => void; onSkip: () => void }) => (
    <div>
      <button onClick={onSave}>save availability</button>
      <button onClick={onSkip}>skip availability</button>
    </div>
  ),
}));
vi.mock("@/components/onboarding/ProVideoStep", () => ({
  ProVideoStep: ({ onSave, onSkip }: { onSave: () => void; onSkip: () => void }) => (
    <div>
      <button onClick={onSave}>save video</button>
      <button onClick={onSkip}>skip video</button>
    </div>
  ),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import Onboarding from "@/pages/Onboarding";

const authState = (overrides: Record<string, unknown> = {}) => ({
  user: { id: "u-1", user_metadata: { full_name: "A Pro" } },
  profile: { role: null, participant_type: null },
  refreshProfile: vi.fn(),
  loading: false,
  ...overrides,
});

const renderOnboarding = () => render(<Onboarding />);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  useAuthMock.mockReturnValue(authState());
  invokeMock.mockImplementation((functionName: string, options?: { body?: Record<string, unknown> }) => {
    if (
      functionName === "complete-onboarding-role" &&
      options?.body?.role === "professional"
    ) {
      return Promise.resolve({ data: { professionalId: "pro-1" }, error: null });
    }
    return Promise.resolve({ data: {}, error: null });
  });
  fromMock.mockImplementation((table: string) => {
    if (table === "professionals") {
      return {
        upsert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: "pro-1" }, error: null }) }) }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
      };
    }
    return {
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
  });
});

describe("Onboarding page handlers", () => {
  it("saves a simple buyer role and reaches the done screen", async () => {
    renderOnboarding();

    fireEvent.click(screen.getByRole("button", { name: /buyer role/i }));

    await waitFor(() => expect(screen.getByText("done-screen")).toBeInTheDocument());
    expect(invokeMock).toHaveBeenCalledWith("complete-onboarding-role", {
      body: expect.objectContaining({ role: "buyer", participantType: "buyer" }),
    });
  });

  it("redirects unauthenticated role picks to login after saving the intended role", () => {
    useAuthMock.mockReturnValue(authState({ user: null }));
    renderOnboarding();

    fireEvent.click(screen.getByRole("button", { name: /buyer role/i }));

    expect(sessionStorage.getItem("signup_participant_type")).toBe("buyer");
    expect(navigateMock).toHaveBeenCalledWith("/login", { state: { from: { pathname: "/onboarding" } } });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("validates and then saves the developer setup step", async () => {
    renderOnboarding();

    fireEvent.click(screen.getByRole("button", { name: /developer role/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit developer/i }));

    expect(await screen.findByText("Company name is required")).toBeInTheDocument();
    expect(screen.getByText("City is required")).toBeInTheDocument();
    expect(screen.getByText("Please select development type")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("company"), { target: { value: "Acme Builds" } });
    fireEvent.change(screen.getByLabelText("city"), { target: { value: "Athens" } });
    fireEvent.click(screen.getByRole("button", { name: /residential/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit developer/i }));

    await waitFor(() => expect(screen.getByText("done-screen")).toBeInTheDocument());
    expect(invokeMock).toHaveBeenLastCalledWith("complete-onboarding-role", {
      body: expect.objectContaining({
        role: "developer",
        participantType: "developer",
        displayName: "Acme Builds",
        city: "Athens",
      }),
    });
  });

  it("covers professional category validation, back, verify, services, availability, and video skip branches", async () => {
    renderOnboarding();

    fireEvent.click(screen.getByRole("button", { name: /professional role/i }));
    fireEvent.click(screen.getByRole("button", { name: /category next/i }));
    expect(toastMock.error).toHaveBeenCalledWith("Please select your professional category");

    fireEvent.click(screen.getByRole("button", { name: /architect/i }));
    fireEvent.click(screen.getByRole("button", { name: /category next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Back/i }));
    expect(screen.getByText("category:architect")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /category next/i }));

    fireEvent.click(screen.getByRole("button", { name: /verify pro/i }));
    expect(await screen.findByText("Business name is required")).toBeInTheDocument();
    expect(screen.getByText("Phone number is required")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid 9-digit AFM")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("business"), { target: { value: "Pro Studio" } });
    fireEvent.change(screen.getByLabelText("tax"), { target: { value: "123456789" } });
    fireEvent.change(screen.getByLabelText("phone"), { target: { value: "+306900000000" } });
    fireEvent.click(screen.getByRole("button", { name: /verify pro/i }));

    await screen.findByRole("button", { name: /save services/i });
    expect(invokeMock).toHaveBeenCalledWith("complete-onboarding-role", {
      body: expect.objectContaining({
        role: "professional",
        participantType: "professional",
        phone: "+306900000000",
        professionalProfile: expect.objectContaining({
          title: "Pro Studio",
          category: "architect",
          displayName: "A Pro",
          licenseNumber: "123456789",
        }),
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: /save services/i }));
    expect(toastMock.error).toHaveBeenCalledWith("Please select at least one service you offer");

    fireEvent.click(screen.getByRole("button", { name: /select service/i }));
    fireEvent.click(screen.getByRole("button", { name: /save services/i }));
    await screen.findByRole("button", { name: /skip availability/i });

    fireEvent.click(screen.getByRole("button", { name: /skip availability/i }));
    fireEvent.click(await screen.findByRole("button", { name: /skip video/i }));

    expect(await screen.findByText("done-screen")).toBeInTheDocument();
  });

  it("starts professional Pro checkout from onboarding with relative redirect paths", async () => {
    invokeMock.mockImplementation((functionName: string, options?: { body?: Record<string, unknown> }) => {
      if (
        functionName === "complete-onboarding-role" &&
        options?.body?.role === "professional"
      ) {
        return Promise.resolve({ data: { professionalId: "pro-1" }, error: null });
      }
      if (functionName === "create-checkout") {
        return Promise.resolve({ data: { url: "#stripe-checkout" }, error: null });
      }
      return Promise.resolve({ data: {}, error: null });
    });
    renderOnboarding();

    fireEvent.click(screen.getByRole("button", { name: /professional role/i }));
    fireEvent.click(screen.getByRole("button", { name: /architect/i }));
    fireEvent.click(screen.getByRole("button", { name: /category next/i }));
    fireEvent.change(screen.getByLabelText("business"), { target: { value: "Pro Studio" } });
    fireEvent.change(screen.getByLabelText("tax"), { target: { value: "123456789" } });
    fireEvent.change(screen.getByLabelText("phone"), { target: { value: "+306900000000" } });
    fireEvent.click(screen.getByRole("button", { name: /verify pro/i }));

    fireEvent.click(await screen.findByRole("button", { name: /select service/i }));
    fireEvent.click(screen.getByRole("button", { name: /save services/i }));
    fireEvent.click(await screen.findByRole("button", { name: /skip availability/i }));
    fireEvent.click(await screen.findByRole("button", { name: /skip video/i }));
    fireEvent.click(await screen.findByRole("button", { name: /upgrade professional pro/i }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("create-checkout", {
        body: {
          plan: "professional_basic",
          billing_cycle: "monthly",
          success_url: "/dashboard?pro=success",
          cancel_url: "/pricing",
        },
      }),
    );
    expect(window.location.hash).toBe("#stripe-checkout");
  });

  it("keeps role-switch confirmation cancellable before proceeding", async () => {
    sessionStorage.setItem("role_switch_ctx", JSON.stringify({ fromType: "agent", hadActiveSub: true }));
    renderOnboarding();

    fireEvent.click(screen.getByRole("button", { name: /seller role/i }));
    expect(screen.getByTestId("role-switch-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel switch/i }));
    expect(screen.queryByTestId("role-switch-modal")).not.toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith("log-role-switch", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: /seller role/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm switch/i }));

    await waitFor(() => expect(screen.getByText("done-screen")).toBeInTheDocument());
    expect(invokeMock).toHaveBeenCalledWith("log-role-switch", {
      body: expect.objectContaining({ from_type: "agent", to_type: "seller", had_active_sub: true }),
    });
  });

  it("routes paid role-switch upgrades to the target pricing audience", async () => {
    sessionStorage.setItem("role_switch_ctx", JSON.stringify({ fromType: "buyer", hadActiveSub: true }));
    renderOnboarding();

    fireEvent.click(screen.getByRole("button", { name: /agent role/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm switch/i }));

    await waitFor(() => expect(screen.getByText("done-screen")).toBeInTheDocument());
    expect(screen.getByText("/pricing?audience=agent")).toBeInTheDocument();
    expect(screen.getByText(/Activate your Agent Pro/i)).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("log-role-switch", {
      body: expect.objectContaining({
        from_type: "buyer",
        to_type: "agent",
        switch_kind: "upgrade",
        had_active_sub: true,
        cancel_subscription: true,
      }),
    });
  });
});
