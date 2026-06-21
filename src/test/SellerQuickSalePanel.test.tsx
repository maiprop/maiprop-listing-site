import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  SellerQuickSalePanel,
  type SellerQuickSaleRequest,
} from "@/components/dashboard/SellerQuickSalePanel";

const request = (overrides: Partial<SellerQuickSaleRequest>): SellerQuickSaleRequest => ({
  id: overrides.id ?? "request-1",
  address: overrides.address ?? "12 Demo Street",
  city: overrides.city ?? "Athens",
  property_type: overrides.property_type ?? "apartment",
  asking_price: overrides.asking_price ?? 300000,
  offer_price: overrides.offer_price ?? null,
  status: overrides.status ?? "pending",
  seller_response: overrides.seller_response ?? null,
  seller_response_price: overrides.seller_response_price ?? null,
  seller_responded_at: overrides.seller_responded_at ?? null,
  created_at: overrides.created_at ?? "2026-06-01T10:00:00.000Z",
});

const renderPanel = (requests: SellerQuickSaleRequest[]) =>
  render(
    <MemoryRouter>
      <SellerQuickSalePanel requests={requests} />
    </MemoryRouter>,
  );

describe("SellerQuickSalePanel", () => {
  it("shows the empty state and links to the quick sale request flow", () => {
    renderPanel([]);

    expect(screen.getByRole("heading", { name: /quick sale requests/i })).toBeInTheDocument();
    expect(screen.getByText("No Quick Sale requests yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new request/i })).toHaveAttribute("href", "/firesale");
  });

  it("renders the latest four requests with status, seller response, and offer pricing", () => {
    renderPanel([
      request({ id: "request-1", address: "One", status: "reviewed", seller_response: "accepted", offer_price: 275000 }),
      request({ id: "request-2", address: "Two", status: "offer_sent", seller_response: "counter_offer", offer_price: 250000 }),
      request({ id: "request-3", address: "Three", status: "closed", asking_price: 220000 }),
      request({ id: "request-4", address: "Four", status: "pending", asking_price: 210000 }),
      request({ id: "request-5", address: "Five", status: "pending", asking_price: 200000 }),
    ]);

    expect(screen.getByText("Reviewed")).toBeInTheDocument();
    expect(screen.getByText("Offer Sent")).toBeInTheDocument();
    expect(screen.getByText("Seller accepted")).toBeInTheDocument();
    expect(screen.getByText("Seller counter offer")).toBeInTheDocument();
    expect(screen.getByText("€275,000")).toBeInTheDocument();
    expect(screen.getByText("€250,000")).toBeInTheDocument();
    expect(screen.queryByText(/Five,/)).not.toBeInTheDocument();
  });
});
