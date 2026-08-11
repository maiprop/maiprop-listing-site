// Minimal immutable snapshot of the provider's AuctionFilterRequest enums.
// Any enum update must also advance snapshotVersion and refresh the payload hash.
export const AUCTION_FILTER_REQUEST_OPENAPI_SNAPSHOT = {
  metadata: {
    snapshotVersion: 2,
    capturedAt: "2026-08-05",
    sourceDocument: "https://app.os.maiprop.co/v3/api-docs",
    sourceEndpointVersion: "v3",
    schemaPath: "#/components/schemas/AuctionFilterRequest",
    enumPayloadSha256:
      "a231c27efce2504ad30918f98c01c2be188570a80b5f1564411b09b89c786738",
  },
  enums: {
    propertyCategories: [
      "RESIDENCE",
      "OTHER_BUSINESS_SPACE",
      "STORE",
      "OFFICE",
      "PARKING",
      "STOREROOM",
      "INDUSTRIAL",
      "LAND",
      "LAND_WITH_BUILDING",
      "PLOT",
      "PLOT_WITH_BUILDING",
      "HOTEL",
    ],
    auctionStatuses: [
      "POSTED",
      "OPEN",
      "READY_TO_CONDUCT",
      "CANCELED",
      "COMPLETED",
      "COMPLETED_NO_BIDDERS",
      "FINALIZED_PARTICIPANT_LIST",
      "SUSPENDED",
    ],
    sortBy: [
      "AUCTION_ID",
      "AUCTION_DATE",
      "AUCTION_FIRST_PRICE_OFFER",
      "AUCTION_REGISTRATION_AMOUNT",
      "AUCTION_DATE_QUARTER",
    ],
    order: ["ASC", "DESC"],
  },
} as const;
