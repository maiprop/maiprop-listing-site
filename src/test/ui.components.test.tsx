/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for key UI components:
 * - ConfirmDialog: accessible delete-confirmation dialog replacing window.confirm()
 * - ErrorBoundary: renders fallback and logs on unhandled component errors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Module mocks ──────────────────────────────────────────────────────────
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, onOpenChange, children }: any) =>
    open ? <div data-testid="alert-dialog" onClick={() => onOpenChange?.(false)}>{children}</div> : null,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children, onClick }: any) => (
    <button data-testid="cancel-btn" onClick={onClick}>{children}</button>
  ),
  AlertDialogAction: ({ children, onClick, className }: any) => (
    <button data-testid="confirm-btn" onClick={onClick} className={className}>{children}</button>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ── ConfirmDialog ─────────────────────────────────────────────────────────
describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ConfirmDialog open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title and description when open", () => {
    render(
      <ConfirmDialog
        open
        title="Delete record?"
        description="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Delete record?")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="Delete?" onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByTestId("confirm-btn"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Delete?" onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("cancel-btn"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("uses custom button labels", () => {
    render(
      <ConfirmDialog
        open
        confirmLabel="Yes, remove"
        cancelLabel="Keep it"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Yes, remove")).toBeInTheDocument();
    expect(screen.getByText("Keep it")).toBeInTheDocument();
  });

  it("applies destructive class when destructive=true", () => {
    render(<ConfirmDialog open destructive onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const btn = screen.getByTestId("confirm-btn");
    expect(btn.className).toMatch(/destructive/);
  });

  it("does not apply destructive class when destructive=false", () => {
    render(<ConfirmDialog open destructive={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const btn = screen.getByTestId("confirm-btn");
    expect(btn.className || "").not.toMatch(/destructive/);
  });
});

// ── ErrorBoundary ─────────────────────────────────────────────────────────
describe("ErrorBoundary", () => {
  // Suppress console.error noise from React during error boundary tests
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  function Bomb(): never {
    throw new Error("Test explosion");
  }

  it("renders children normally when no error", () => {
    render(
      <ErrorBoundary>
        <span>Safe content</span>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Safe content")).toBeInTheDocument();
  });

  it("renders default fallback UI on error", () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText("Test explosion")).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<p>Custom error UI</p>}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Custom error UI")).toBeInTheDocument();
  });

  it("logs the error via console.error", () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    // logger.critical calls console.error("[CRITICAL] <label>", err)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ErrorBoundary]"),
      expect.objectContaining({ message: "Test explosion" }),
    );
  });
});
