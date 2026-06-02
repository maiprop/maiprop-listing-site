export type ProfilePlanRow = {
  role?: string | null;
  participant_type?: string | null;
  subscription_product_id?: string | null;
  force_pro_access?: boolean | null;
};

export type PricingConfigPlanRow = {
  key?: string | null;
  audience?: string | null;
  metadata?: {
    stripe_product_id?: string | null;
  } | null;
};

// OS DTO type (same subset as poll-os-auctions)
export type OsAuction = {
  auctionListingId?: string | number;
  propertyCategory?: string;
  propertyMunicipalityName?: string;
  propertyPrefectureName?: string;
  propertyAddress?: string;
  propertyPostalCode?: string;
  propertyLatitude?: number | string;
  propertyLongitude?: number | string;
  propertySquareMeters?: number | string;
  propertyFloor?: number | string;
  propertyFullKaek?: string;
  numberOfFloors?: number | string;
  constructionYear?: number | string;
  pricePerSquareMeter?: number | string;
  firstPriceOffer?: number | string;
  auctionDate?: string;
  auctionStatus?: string;
  currentRound?: number | string;
  ownershipStatus?: string;
  ownershipPercentage?: number | string;
  url?: string;
  auctionUrl?: string;
  listingUrl?: string;
  eAuctionUrl?: string;
};

// Shape returned to the frontend - matches AuctionListingRow in useAuctionListings
export type MappedAuction = {
  id: string;
  title: string;
  city: string;
  address: string | null;
  price: number;
  auction_starting_bid: number;
  auction_date: string | null;
  auction_court: string | null;
  property_type: string;
  cover_image_url: string | null;
  sqm: number;
  bedrooms: null;
  bathrooms: null;
  floor: number | null;
  total_floors: number | null;
  latitude: number | null;
  longitude: number | null;
  tags: string[];
  year_built: number | null;
  construction_status: null;
  website_url: string | null;
  region: string | null;
  is_featured: false;
  priority_placement: 0;
};

export type OsResponse = {
  data?: OsAuction[];
  responseMetadata?: { pagination?: { totalElements?: number } };
};

export type OsConfig = {
  url: string;
  email: string;
  password: string;
};

export type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

export type RuntimeConfig = {
  osConfig: OsConfig;
  supabaseConfig: SupabaseConfig;
};

export type OsApiFailure = {
  kind: "os-api";
  status: number;
  detail: string;
};

export type AuctionResponsePayload = {
  data: MappedAuction[];
  total: number;
  page: number;
  planCap: number;
};

export type AuctionCacheEntry = {
  expiresAt: number;
  payload: AuctionResponsePayload;
};
