import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import PropertyGallery from "@/components/property/PropertyGallery";

describe("PropertyGallery behavior", () => {
  it("falls through broken gallery images before showing the mAI prop logo", () => {
    renderWithProviders(
      <PropertyGallery
        images={["https://example.test/street.jpg", "https://example.test/cover.jpg"]}
        listingType="auction"
        isFavorited={false}
        onFavorite={vi.fn()}
        onShare={vi.fn()}
        viewsCount={0}
        title="Auction gallery"
      />,
    );

    const image = screen.getByAltText("Auction gallery") as HTMLImageElement;
    fireEvent.error(image);
    expect(image.src).toBe("https://example.test/cover.jpg");

    fireEvent.error(image);
    expect(image.src).toContain("/images/maiprop-logo.webp");
    expect(image.style.objectFit).toBe("contain");
  });
});
