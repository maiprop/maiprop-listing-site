import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageContent, parseMessageContent } from "@/lib/messageContent";
import { renderWithProviders } from "@/test/utils";

const PROPERTY_ID = "123e4567-e89b-12d3-a456-426614174000";
const OTHER_PROPERTY_ID = "123e4567-e89b-12d3-a456-426614174001";

describe("parseMessageContent", () => {
  it("returns no parts for empty or non-string-safe content", () => {
    expect(parseMessageContent("")).toEqual([]);
  });

  it("keeps plain text messages as text parts", () => {
    expect(parseMessageContent("Hello, can we arrange a viewing?")).toEqual([
      { type: "text", value: "Hello, can we arrange a viewing?" },
    ]);
  });

  it("turns absolute and relative property references into link parts", () => {
    expect(
      parseMessageContent(
        `See /property/${PROPERTY_ID} and property/${OTHER_PROPERTY_ID} today.`,
      ),
    ).toEqual([
      { type: "text", value: "See " },
      {
        type: "link",
        route: "property",
        id: PROPERTY_ID,
        match: `/property/${PROPERTY_ID}`,
      },
      { type: "text", value: " and " },
      {
        type: "link",
        route: "property",
        id: OTHER_PROPERTY_ID,
        match: `property/${OTHER_PROPERTY_ID}`,
      },
      { type: "text", value: " today." },
    ]);
  });

  it("turns every listing detail route into a link part", () => {
    expect(
      parseMessageContent(
        `Review /new-build/${PROPERTY_ID}, /auction/${OTHER_PROPERTY_ID}, and open-house/${PROPERTY_ID}.`,
      ),
    ).toEqual([
      { type: "text", value: "Review " },
      {
        type: "link",
        route: "new-build",
        id: PROPERTY_ID,
        match: `/new-build/${PROPERTY_ID}`,
      },
      { type: "text", value: ", " },
      {
        type: "link",
        route: "auction",
        id: OTHER_PROPERTY_ID,
        match: `/auction/${OTHER_PROPERTY_ID}`,
      },
      { type: "text", value: ", and " },
      {
        type: "link",
        route: "open-house",
        id: PROPERTY_ID,
        match: `open-house/${PROPERTY_ID}`,
      },
      { type: "text", value: "." },
    ]);
  });

  it("ignores invalid property identifiers instead of creating broken links", () => {
    expect(parseMessageContent("Bad /property/not-a-uuid link")).toEqual([
      { type: "text", value: "Bad /property/not-a-uuid link" },
    ]);
  });
});

describe("MessageContent", () => {
  it("renders property links that route to the canonical property page", () => {
    renderWithProviders(<MessageContent content={`Please review /property/${PROPERTY_ID}`} />);

    const link = screen.getByRole("link", { name: `/property/${PROPERTY_ID}` });
    expect(link).toHaveAttribute("href", `/property/${PROPERTY_ID}`);
  });

  it("renders new-build links to the route embedded in the message", () => {
    renderWithProviders(<MessageContent content={`Please review /new-build/${PROPERTY_ID}`} />);

    const link = screen.getByRole("link", { name: `/new-build/${PROPERTY_ID}` });
    expect(link).toHaveAttribute("href", `/new-build/${PROPERTY_ID}`);
  });
});
