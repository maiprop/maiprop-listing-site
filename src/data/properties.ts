// Property type matching the database schema (snake_case)
export interface Property {
  id: string;
  title: string;
  description: string;
  images: string[];
  before_image: string;
  after_image: string;
  price: number | null;
  size: number | null;
  bedrooms: number | null;
  floor_plan: string;
  location: string;
  poi: string[];
  tags: string[];
  status: "available" | "booked" | "sold" | "under-construction" | "";
  project_type: "new" | "delivered";
  yield: string;
  date_added: string;
  floor: string;
  construction_year: string;
  sort_order: number;
  market_report: string;
}
