import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { PropertyPopup } from "@/components/map/PropertyPopup";
import type { MapListing } from "@/components/map/mapConfig";

function RouteStateProbe() {
  const location = useLocation();
  return (
    <>
      <span data-testid="route-path">{location.pathname}</span>
      <span data-testid="route-state">{JSON.stringify(location.state)}</span>
    </>
  );
}

const routeCases = [
  { listingType: "sale", path: "/property/map-listing-sale", publicationId: 1001 },
  { listingType: "open_house", path: "/open-house/map-listing-open-house", publicationId: 1002 },
  { listingType: "new_build", path: "/new-build/map-listing-new-build", publicationId: 1003 },
] as const;

describe("PropertyPopup route state", () => {
  it.each(routeCases)(
    "preserves publication state for $listingType map links",
    ({ listingType, path, publicationId }) => {
      const listing: MapListing = {
        id: `map-listing-${listingType.replace("_", "-")}`,
        title: "Mapped property",
        price: 350_000,
        sqm: 95,
        latitude: 37.98,
        longitude: 23.73,
        images: [],
        listingType,
        city: "Athens",
        _raw: {
          publicationId,
          address: "Solonos 1",
        },
      };

      render(
        <MemoryRouter
          initialEntries={["/map"]}
          future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        >
          <Routes>
            <Route
              path="/map"
              element={<PropertyPopup listing={listing} onClose={() => undefined} />}
            />
            <Route path="*" element={<RouteStateProbe />} />
          </Routes>
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole("link", { name: /view property/i }));

      expect(screen.getByTestId("route-path")).toHaveTextContent(path);
      expect(JSON.parse(screen.getByTestId("route-state").textContent ?? "{}")).toEqual({
        listing: expect.objectContaining({
          id: listing.id,
          listing_type: listingType,
          publicationId,
        }),
      });
    },
  );
});
