import { z } from "zod";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

const requiredString = (label: string, maxLength: number) =>
  z.string()
    .trim()
    .min(1, `Invalid ${label}`)
    .max(maxLength, `Invalid ${label}`);

const optionalString = (label: string, maxLength: number) =>
  z.preprocess(
    (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    },
    z.string().max(maxLength, `Invalid ${label}`).nullable(),
  );

const optionalEmail = (label: string) =>
  z.preprocess(
    (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim().toLowerCase();
      return trimmed.length === 0 ? null : trimmed;
    },
    z.string().email(`Invalid ${label}`).max(320, `Invalid ${label}`).nullable(),
  );

const optionalNumber = (label: string, options: { min?: number; max?: number } = {}) => {
  let schema = z.number(`Invalid ${label}`).finite(`Invalid ${label}`);
  if (options.min !== undefined) schema = schema.min(options.min, `Invalid ${label}`);
  if (options.max !== undefined) schema = schema.max(options.max, `Invalid ${label}`);
  return z.preprocess(
    (value) => value === "" || value === null || value === undefined ? null : value,
    schema.nullable(),
  );
};

const optionalDateTime = (label: string) =>
  z.preprocess(
    (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    },
    z.string().max(80, `Invalid ${label}`).nullable(),
  );

const enterpriseSsoDomainSchema = z.preprocess(
  (value) => typeof value === "string" ? value.trim().toLowerCase() : value,
  z.string()
    .min(3, "Invalid enterprise SSO")
    .max(253, "Invalid enterprise SSO")
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z-]{0,61}[a-z])$/i, "Invalid enterprise SSO"),
);

export const uuidSchema = (label: string) => z.string().uuid(`Invalid ${label}`);
export const rowIdSchema = (label: string) =>
  z.string().trim().min(1, `Invalid ${label}`).max(120, `Invalid ${label}`);

const propertyTypeSchema = z.enum([
  "apartment",
  "house",
  "villa",
  "land",
  "commercial",
  "office",
  "studio",
  "maisonette",
  "warehouse",
  "hotel",
  "mixed_use",
  "parking",
  "storage",
]);

const listingTypeSchema = z.enum(["sale", "rent", "auction", "firesale", "open_house", "new_build"]);

export function parseMutationInput<T>(
  schema: z.ZodType<T>,
  input: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const firstMessage = parsed.error.issues[0]?.message;
  throw new Error(firstMessage?.startsWith("Invalid ") ? firstMessage : `Invalid ${label}`);
}

export const savedSearchCreateSchema = z.object({
  name: requiredString("saved search", 120),
  filters: z.record(z.string(), z.unknown()),
  emailAlerts: z.boolean(),
}).strict();

export const savedSearchIdSchema = uuidSchema("saved search id");

export const savedSearchAlertToggleSchema = z.object({
  id: savedSearchIdSchema,
  emailAlerts: z.boolean(),
}).strict();

export const contactSubmissionInputSchema = z.object({
  type: z.enum(["contact", "document_share", "enterprise"]),
  name: requiredString("contact submission", 160),
  email: z.string().trim().email("Invalid contact submission").max(320, "Invalid contact submission"),
  company: optionalString("contact submission", 200),
  message: requiredString("contact submission", 2000),
}).strict() satisfies z.ZodType<Pick<
  TablesInsert<"contact_submissions">,
  "type" | "name" | "email" | "company" | "message"
>>;

export const enterpriseSsoSignInSchema = z.object({
  domain: enterpriseSsoDomainSchema.optional(),
  providerId: z.string().uuid("Invalid enterprise SSO provider").optional(),
  redirectTo: z.string().trim().url("Invalid enterprise SSO").max(2048, "Invalid enterprise SSO").optional(),
}).strict().superRefine((value, ctx) => {
  const hasDomain = Boolean(value.domain);
  const hasProviderId = Boolean(value.providerId);
  if (hasDomain === hasProviderId) {
    ctx.addIssue({
      code: "custom",
      message: "Invalid enterprise SSO",
      path: ["domain"],
    });
  }
});

export type EnterpriseSsoSignInInput = z.input<typeof enterpriseSsoSignInSchema>;
export type EnterpriseSsoSignIn = z.infer<typeof enterpriseSsoSignInSchema>;

export const documentShareSubmissionSchema = z.object({
  type: z.literal("document_share"),
  email: z.string().trim().toLowerCase().email("Invalid document share email").max(320, "Invalid document share email"),
  document_type: requiredString("document type", 120),
  listing_title: requiredString("listing title", 180),
  share_to_email: z.string().trim().toLowerCase().email("Invalid document share recipient").max(320, "Invalid document share recipient"),
  message: requiredString("document share message", 1000),
}).strict() satisfies z.ZodType<Pick<
  TablesInsert<"contact_submissions">,
  "type" | "email" | "document_type" | "listing_title" | "share_to_email" | "message"
>>;

export const favoriteToggleSchema = z.object({
  listing_id: rowIdSchema("listing id"),
  isFavorited: z.boolean(),
  priceAlert: z.boolean().optional(),
  price: optionalNumber("favorite price", { min: 0 }).optional(),
}).strict();

export const auctionAlertPayloadSchema = z.object({
  city: optionalString("auction alert city", 120).optional(),
  court_name: optionalString("auction alert court", 160).optional(),
  property_type: propertyTypeSchema.nullable().optional(),
  min_price: optionalNumber("auction alert minimum price", { min: 0 }).optional(),
  max_price: optionalNumber("auction alert maximum price", { min: 0 }).optional(),
  email_notify: z.boolean().optional(),
}).strict().superRefine((payload, ctx) => {
  if (
    payload.min_price !== null &&
    payload.min_price !== undefined &&
    payload.max_price !== null &&
    payload.max_price !== undefined &&
    payload.min_price > payload.max_price
  ) {
    ctx.addIssue({ code: "custom", message: "Invalid auction alert price range", path: ["max_price"] });
  }
});

export const auctionAlertUpdateSchema = auctionAlertPayloadSchema.extend({
  active: z.boolean().optional(),
}).strict();

export const auctionAlertMutationSchema = z.object({
  id: rowIdSchema("auction alert id"),
  updates: auctionAlertUpdateSchema,
}).strict();

export const consultationRequestSchema = z.object({
  professional_id: rowIdSchema("professional id"),
  requester_name: requiredString("consultation name", 160),
  requester_email: z.string().trim().toLowerCase().email("Invalid consultation email").max(320, "Invalid consultation email"),
  requester_phone: optionalString("consultation phone", 60).optional(),
  request_type: z.enum(["consultation", "callback", "message"]),
  meeting_type: z.enum(["in_person", "video"]).optional(),
  service: optionalString("consultation service", 160).optional(),
  preferred_date: optionalDateTime("consultation date").optional(),
  preferred_time: optionalDateTime("consultation time").optional(),
  callback_time: optionalDateTime("callback time").optional(),
  message: optionalString("consultation message", 2000).optional(),
}).strict();

export const consultationUpdateMutationSchema = z.object({
  id: rowIdSchema("consultation id"),
  updates: z.object({
    status: requiredString("consultation status", 80).optional(),
    notes: optionalString("consultation notes", 2000).optional(),
    lead_status: optionalString("consultation lead status", 80).optional(),
  }).strict(),
}).strict();

export const leadStatusSchema = z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]);
export const leadSourceSchema = z.enum(["manual", "listing_inquiry", "consultation", "callback", "project_inquiry", "viewing", "message"]);

export const leadCreateSchema = z.object({
  name: requiredString("lead name", 160),
  email: optionalEmail("lead email").optional(),
  phone: optionalString("lead phone", 60).optional(),
  message: optionalString("lead message", 2000).optional(),
  source: leadSourceSchema.optional(),
  status: leadStatusSchema.optional(),
  notes: optionalString("lead notes", 4000).optional(),
  follow_up_at: optionalDateTime("lead follow-up").optional(),
  listing_id: rowIdSchema("listing id").nullable().optional(),
  professional_id: rowIdSchema("professional id").nullable().optional(),
  project_id: rowIdSchema("project id").nullable().optional(),
}).strict();

export const leadUpdateMutationSchema = z.object({
  id: rowIdSchema("lead id"),
  updates: z.object({
    name: requiredString("lead name", 160).optional(),
    email: optionalEmail("lead email").optional(),
    phone: optionalString("lead phone", 60).optional(),
    message: optionalString("lead message", 2000).optional(),
    source: leadSourceSchema.optional(),
    status: leadStatusSchema.optional(),
    notes: optionalString("lead notes", 4000).optional(),
    follow_up_at: optionalDateTime("lead follow-up").optional(),
    listing_id: rowIdSchema("listing id").nullable().optional(),
    professional_id: rowIdSchema("professional id").nullable().optional(),
    project_id: rowIdSchema("project id").nullable().optional(),
  }).strict(),
}).strict();

export const leadIdSchema = rowIdSchema("lead id");

export const contactStageSchema = z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]);

export const contactCreateSchema = z.object({
  name: requiredString("contact name", 160),
  email: optionalEmail("contact email").optional(),
  phone: optionalString("contact phone", 60).optional(),
  source: optionalString("contact source", 120).optional(),
  notes: optionalString("contact notes", 4000).optional(),
  deal_stage: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    contactStageSchema.optional(),
  ),
  follow_up_at: optionalDateTime("contact follow-up").optional(),
  listing_id: rowIdSchema("listing id").nullable().optional(),
}).strict();

export const contactUpdateMutationSchema = z.object({
  id: rowIdSchema("contact id"),
  updates: z.object({
    name: requiredString("contact name", 160).optional(),
    email: optionalEmail("contact email").optional(),
    phone: optionalString("contact phone", 60).optional(),
    source: optionalString("contact source", 120).optional(),
    notes: optionalString("contact notes", 4000).optional(),
    deal_stage: contactStageSchema.optional(),
    follow_up_at: optionalDateTime("contact follow-up").optional(),
    listing_id: rowIdSchema("listing id").nullable().optional(),
  }).strict(),
}).strict();

export const contactIdSchema = rowIdSchema("contact id");

export const contactTaskCreateSchema = z.object({
  contactId: rowIdSchema("contact id"),
  title: requiredString("task title", 160),
  dueAt: optionalDateTime("task due date").optional(),
  notes: optionalString("task notes", 2000).optional(),
}).strict();

export const contactTaskUpdateMutationSchema = z.object({
  id: rowIdSchema("task id"),
  updates: z.object({
    title: requiredString("task title", 160).optional(),
    due_at: optionalDateTime("task due date").optional(),
    completed_at: optionalDateTime("task completion").optional(),
    notes: optionalString("task notes", 2000).optional(),
  }).strict(),
}).strict();

export const portfolioNameSchema = requiredString("portfolio name", 120);

export const portfolioUpdateMutationSchema = z.object({
  id: rowIdSchema("portfolio id"),
  updates: z.object({
    name: requiredString("portfolio name", 120).optional(),
    listing_ids: z.array(rowIdSchema("listing id")).max(250, "Invalid portfolio listings").optional(),
  }).strict(),
}).strict();

export const portfolioIdSchema = rowIdSchema("portfolio id");

export const privateOwnerAdAlertToggleSchema = z.boolean();

export const professionalReviewSubmissionSchema = z.object({
  rating: z.number().int("Invalid review rating").min(1, "Invalid review rating").max(5, "Invalid review rating"),
  title: requiredString("review title", 160),
  body: requiredString("review body", 4000),
  service_type: requiredString("review service", 120),
  property_city: requiredString("review city", 120),
  transaction_year: z.number().int("Invalid review year").min(1990, "Invalid review year").max(2100, "Invalid review year"),
  recommended: z.boolean(),
}).strict();

export const professionalIdSchema = rowIdSchema("professional id");

export const professionalServiceRowsSchema = z.array(z.object({
  professional_id: rowIdSchema("professional id"),
  service_key: requiredString("service key", 120),
  service_name: requiredString("service name", 180),
  description: optionalString("service description", 1000).optional(),
  category: requiredString("service category", 120),
  pricing_model: requiredString("pricing model", 80),
  rate_amount: optionalNumber("service rate", { min: 0 }).optional(),
  currency: requiredString("service currency", 12),
  estimated_hours: optionalNumber("estimated hours", { min: 0 }).optional(),
  video_enabled: z.boolean(),
  is_premium: z.boolean(),
  is_active: z.boolean(),
}).strict()).min(1, "Invalid professional services").max(100, "Invalid professional services");

export const professionalAvailabilityRowsSchema = z.array(z.object({
  professional_id: rowIdSchema("professional id"),
  day_of_week: z.number().int("Invalid availability day").min(0, "Invalid availability day").max(6, "Invalid availability day"),
  start_time: requiredString("availability start time", 20),
  end_time: requiredString("availability end time", 20),
  is_active: z.boolean(),
}).strict()).max(14, "Invalid professional availability");

export const professionalVideoSettingsMutationSchema = z.object({
  professionalId: rowIdSchema("professional id"),
  userId: rowIdSchema("user id"),
  video_link: optionalString("video link", 500),
  calendar_notes: optionalString("calendar notes", 2000),
}).strict();

export const listingReportSchema = z.object({
  entity_type: z.enum(["listing", "firesale_request"]),
  entity_id: rowIdSchema("reported listing id"),
  reporter_id: rowIdSchema("reporter id"),
}).strict() satisfies z.ZodType<TablesInsert<"listing_reports">>;

export const adminContentReportActionSchema = z.object({
  action: z.enum(["resolve", "suspend_listing", "ban_owner"]),
  reportId: rowIdSchema("report id"),
  reason: optionalString("moderation reason", 1000).optional(),
}).strict();

export const adminBroadcastBodySchema = z.object({
  segment: z.enum(["all", "investors", "sellers", "agents", "professionals", "developers"]),
  title: requiredString("broadcast title", 120),
  body: requiredString("broadcast message", 1000),
  link: optionalString("broadcast link", 500).optional(),
}).strict();

export const invitationRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid invitation email").max(320, "Invalid invitation email"),
  full_name: optionalString("invitation name", 160),
  phone: optionalString("invitation phone", 60),
  company: optionalString("invitation company", 200),
  job_title: optionalString("invitation job title", 160),
  company_website: optionalString("company website", 300),
  linkedin_url: optionalString("LinkedIn URL", 300),
  investment_focus: optionalString("investment focus", 80),
  deal_size_range: optionalString("deal size", 80),
  geographic_focus: optionalString("geographic focus", 200),
  investment_vehicle: optionalString("investment vehicle", 80),
  years_experience: optionalString("years experience", 80),
  aum_range: optionalString("AUM range", 80),
  source: optionalString("invitation source", 80),
  message: optionalString("invitation message", 2000),
  terms_accepted: z.literal(true, "Invalid invitation terms"),
  user_id: rowIdSchema("user id").nullable(),
}).strict() satisfies z.ZodType<Pick<
  TablesInsert<"invitation_requests">,
  | "email"
  | "full_name"
  | "phone"
  | "company"
  | "job_title"
  | "company_website"
  | "linkedin_url"
  | "investment_focus"
  | "deal_size_range"
  | "geographic_focus"
  | "investment_vehicle"
  | "years_experience"
  | "aum_range"
  | "source"
  | "message"
  | "terms_accepted"
  | "user_id"
>>;

export const firesaleRequestSchema = z.object({
  address: requiredString("quick sale address", 240),
  city: requiredString("quick sale city", 160),
  property_type: propertyTypeSchema,
  sqm: z.number().finite("Invalid quick sale sqm").positive("Invalid quick sale sqm").max(100_000, "Invalid quick sale sqm"),
  condition: z.null(),
  asking_price: z.number().finite("Invalid quick sale asking price").positive("Invalid quick sale asking price"),
  contact_email: z.string().trim().toLowerCase().email("Invalid quick sale email").max(320, "Invalid quick sale email"),
  contact_phone: optionalString("quick sale phone", 60),
  notes: optionalString("quick sale notes", 4000),
  ai_estimate: z.number().finite("Invalid quick sale estimate").min(0, "Invalid quick sale estimate"),
  user_id: rowIdSchema("user id"),
  status: z.literal("pending"),
}).strict() satisfies z.ZodType<Pick<
  TablesInsert<"firesale_requests">,
  | "address"
  | "city"
  | "property_type"
  | "sqm"
  | "condition"
  | "asking_price"
  | "contact_email"
  | "contact_phone"
  | "notes"
  | "ai_estimate"
  | "user_id"
  | "status"
>>;

export const firesaleRollbackSchema = z.object({
  requestId: rowIdSchema("quick sale request id"),
  userId: rowIdSchema("user id"),
}).strict();

const firesaleInterestStatusSchema = z.enum([
  "interested",
  "prioritized",
  "reserved",
  "engaged",
  "won",
  "passed",
  "expired",
]);

export const adminFiresaleActionBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_pipeline_deal"),
    dealId: rowIdSchema("deal id"),
    status: requiredString("deal status", 80),
    adminNotes: z.string().max(4000, "Invalid admin notes"),
    offerPrice: z.number().finite("Invalid offer price").min(0, "Invalid offer price").optional(),
    sellerResponse: optionalString("seller response", 80).optional(),
    sellerResponsePrice: z.number().finite("Invalid seller response price").min(0, "Invalid seller response price").optional(),
  }).strict(),
  z.object({
    action: z.literal("set_investor_publication"),
    dealId: rowIdSchema("deal id"),
    published: z.boolean(),
  }).strict(),
  z.object({
    action: z.literal("update_interest_workflow"),
    interestId: rowIdSchema("interest id"),
    status: firesaleInterestStatusSchema,
    reservationHours: z.number().int("Invalid reservation hours").min(1, "Invalid reservation hours").max(24 * 30, "Invalid reservation hours").optional(),
    verifyProof: z.boolean(),
    adminNote: optionalString("admin note", 2000).optional(),
    proofAmount: z.number().finite("Invalid proof amount").min(0, "Invalid proof amount").optional(),
  }).strict(),
]);

export const submitFiresaleInterestBodySchema = z.object({
  dealId: rowIdSchema("deal id"),
  message: optionalString("interest message", 2000).optional(),
  proofAmount: z.number().finite("Invalid proof amount").min(0, "Invalid proof amount").optional(),
  proofOfFundsUrl: optionalString("proof of funds URL", 1000).optional(),
}).strict();

export const newBuildingProjectWriteSchema = z.object({
  name: requiredString("project name", 180),
  building_permit_number: requiredString("building permit", 120),
  city: requiredString("project city", 120),
  owner_id: rowIdSchema("owner id"),
}).passthrough();

export const projectUnitWriteSchema = z.object({
  project_id: rowIdSchema("project id"),
  availability_status: requiredString("unit status", 80).optional(),
  internal_sqm: z.number().finite("Invalid unit size").min(0, "Invalid unit size").optional(),
  price: z.number().finite("Invalid unit price").min(0, "Invalid unit price").optional(),
  bedrooms: z.number().int("Invalid unit bedrooms").min(0, "Invalid unit bedrooms").max(50, "Invalid unit bedrooms").optional(),
  bathrooms: z.number().int("Invalid unit bathrooms").min(0, "Invalid unit bathrooms").max(50, "Invalid unit bathrooms").optional(),
}).passthrough();

export const projectUnitListingLinkSchema = z.object({
  unitId: rowIdSchema("unit id"),
  projectId: rowIdSchema("project id"),
  listingId: rowIdSchema("listing id"),
}).strict();

export const ownedRowDeleteSchema = z.object({
  id: rowIdSchema("row id"),
  ownerId: rowIdSchema("owner id"),
}).strict();

const updateRecordSchema = z.record(z.string(), z.unknown());

export const rowUpdateMutationSchema = z.object({
  id: rowIdSchema("row id"),
  updates: updateRecordSchema,
}).strict();

export const scopedRowUpdateMutationSchema = z.object({
  id: rowIdSchema("row id"),
  scopeId: rowIdSchema("scope id"),
  updates: updateRecordSchema,
}).strict();

export const scopedRowDeleteMutationSchema = z.object({
  id: rowIdSchema("row id"),
  scopeId: rowIdSchema("scope id"),
}).strict();

export const scopedRowIdsMutationSchema = z.object({
  scopeId: rowIdSchema("scope id"),
  ids: z.array(rowIdSchema("row id")).min(1, "Invalid row ids").max(500, "Invalid row ids"),
}).strict();

export const rowIdOnlyMutationSchema = z.object({
  id: rowIdSchema("row id"),
}).strict();

export const profileUpdateMutationSchema = z.object({
  userId: rowIdSchema("user id"),
  updates: z.object({
    display_name: optionalString("display name", 160).optional(),
    bio: optionalString("bio", 2000).optional(),
    avatar_url: optionalString("avatar URL", 1000).optional(),
    phone: optionalString("phone", 60).optional(),
    city: optionalString("city", 120).optional(),
    first_name: optionalString("first name", 120).optional(),
    last_name: optionalString("last name", 120).optional(),
    country: optionalString("country", 120).optional(),
    video_link: optionalString("video link", 500).optional(),
    website_url: optionalString("website URL", 500).optional(),
  }).strict().refine((value) => Object.keys(value).length > 0, "Invalid profile update"),
}).strict();

export const signUpProfileUpdateMutationSchema = z.object({
  userId: rowIdSchema("user id"),
  updates: z.object({
    phone: optionalString("phone", 60).optional(),
  }).strict().refine((value) => Object.keys(value).length > 0, "Invalid profile update"),
}).strict();

export const dealChecklistUpsertSchema = z.object({
  user_id: rowIdSchema("user id"),
  entity_type: z.enum(["listing", "firesale_request"]),
  entity_id: rowIdSchema("entity id"),
  title: requiredString("checklist title", 160),
  items: z.array(z.object({
    label: requiredString("checklist item", 240),
    done: z.boolean(),
  }).strict()).max(200, "Invalid checklist items"),
  status: requiredString("checklist status", 80),
}).strict();

export const projectLeadCreateSchema = z.object({
  project_id: rowIdSchema("project id"),
  name: requiredString("project lead name", 160),
  email: optionalEmail("project lead email").optional(),
  phone: optionalString("project lead phone", 60).optional(),
  source: optionalString("project lead source", 120).optional(),
  unit_id: rowIdSchema("unit id").optional(),
  status: z.enum(["new", "contacted", "qualified", "converted", "lost"]).optional(),
  notes: optionalString("project lead notes", 4000).optional(),
}).strict();

export const projectLeadUpdateMutationSchema = z.object({
  id: rowIdSchema("project lead id"),
  projectId: rowIdSchema("project id"),
  updates: projectLeadCreateSchema.omit({ project_id: true }).partial().strict()
    .refine((value) => Object.keys(value).length > 0, "Invalid project lead update"),
}).strict();

export const projectMediaCreateSchema = z.object({
  project_id: rowIdSchema("project id"),
  url: requiredString("project media URL", 2048),
  media_type: requiredString("project media type", 80),
  title: optionalString("project media title", 180).optional(),
  sort_order: z.number().int("Invalid project media order").min(0, "Invalid project media order").max(500, "Invalid project media order").optional(),
}).strict();

export const projectUpdateMutationSchema = z.object({
  id: rowIdSchema("project id"),
  updates: updateRecordSchema,
}).strict();

export const projectUnitCreateSchema = projectUnitWriteSchema;

export const projectUnitUpdateMutationSchema = z.object({
  id: rowIdSchema("unit id"),
  projectId: rowIdSchema("project id"),
  updates: updateRecordSchema,
}).strict();

export const projectUnitBulkPriceMutationSchema = z.object({
  projectId: rowIdSchema("project id"),
  percentage: z.number().finite("Invalid price change").min(-100, "Invalid price change").max(1000, "Invalid price change"),
  units: z.array(z.object({
    id: rowIdSchema("unit id"),
    project_id: rowIdSchema("project id"),
    internal_sqm: z.number().finite("Invalid unit size").nullable(),
    price: z.number().finite("Invalid unit price").nullable(),
  }).passthrough()).max(500, "Invalid units"),
}).strict();

export const projectViewCreateSchema = z.object({
  project_id: rowIdSchema("project id"),
  viewer_id: rowIdSchema("viewer id").nullable(),
}).strict();

export const viewingCreateSchema = z.object({
  listing_id: rowIdSchema("listing id"),
  owner_id: rowIdSchema("owner id"),
  viewing_type: z.enum(["in_person", "video"]),
  scheduled_at: requiredString("viewing schedule", 80),
  note: optionalString("viewing note", 2000).optional(),
  requester_id: rowIdSchema("requester id"),
}).strict();

export const viewingStatusMutationSchema = z.object({
  id: rowIdSchema("viewing id"),
  status: z.enum(["confirmed", "cancelled", "completed"]),
}).strict();

export const viewingUpdateMutationSchema = z.object({
  id: rowIdSchema("viewing id"),
  updates: updateRecordSchema,
}).strict();

export const notificationReadSchema = z.object({
  id: rowIdSchema("notification id"),
}).strict();

export const notificationReadAllSchema = z.object({
  userId: rowIdSchema("user id"),
}).strict();

export const pricingConfigRowsSchema = z.array(z.object({
  id: rowIdSchema("pricing config id"),
  key: requiredString("pricing key", 120),
  label: requiredString("pricing label", 180),
  description: optionalString("pricing description", 1000).optional(),
  audience: requiredString("pricing audience", 80),
  module: requiredString("pricing module", 120),
  unit: requiredString("pricing unit", 80),
  currency: requiredString("pricing currency", 12),
  amount: z.number().finite("Invalid pricing amount").min(0, "Invalid pricing amount").max(1_000_000, "Invalid pricing amount"),
  is_active: z.boolean(),
  sort_order: z.number().int("Invalid pricing sort order").min(0, "Invalid pricing sort order").max(10_000, "Invalid pricing sort order"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: optionalDateTime("pricing created date").optional(),
  updated_at: optionalDateTime("pricing updated date").optional(),
}).strict()).min(1, "Invalid pricing configuration").max(500, "Invalid pricing configuration");

export const pricingConfigIdSchema = rowIdSchema("pricing config id");

export const emptyFunctionBodySchema = z.object({}).strict();

const agentDataInputPayloadSchema = z.object({
  property_address: requiredString("property address", 240),
  city: optionalString("property city", 160).optional(),
  postal_code: optionalString("postal code", 40).optional(),
  kaek: optionalString("KAEK", 80).optional(),
  property_type: z.enum(["apartment", "house", "commercial", "land", "other"]),
  transaction_type: z.enum(["sale", "rental"]),
  agent_side: z.enum(["buyer", "seller", "both"]),
  sale_price: z.number().finite("Invalid sale price").positive("Invalid sale price"),
  closing_date: requiredString("closing date", 40),
  buyer_name: optionalString("buyer name", 160).optional(),
  seller_name: optionalString("seller name", 160).optional(),
  notes: optionalString("data input notes", 4000).optional(),
}).strict();

export const agentDataInputActionBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }).strict(),
  z.object({ action: z.literal("list") }).strict(),
  z.object({
    action: z.literal("submit"),
    payload: agentDataInputPayloadSchema,
  }).strict(),
]);

export const stripePriceCreateBodySchema = z.object({
  config_id: rowIdSchema("pricing config id"),
}).strict();

const aiMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: requiredString("AI message", 8000),
}).strict();

export const aiSearchBodySchema = z.object({
  query: requiredString("AI search query", 500),
}).strict();

export const aiChatBodySchema = z.object({
  messages: z.array(aiMessageSchema).min(1, "Invalid AI messages").max(30, "Invalid AI messages"),
  propertyContext: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const proAiToolsBodySchema = z.object({
  messages: z.array(aiMessageSchema).min(1, "Invalid AI messages").max(30, "Invalid AI messages"),
  groupId: requiredString("AI tool group", 80),
}).strict();

export const propertyValuationBodySchema = z.object({
  city: requiredString("valuation city", 120),
  price: z.number().finite("Invalid valuation price").positive("Invalid valuation price"),
  sqm: z.number().finite("Invalid valuation size").positive("Invalid valuation size"),
}).passthrough();

export const neighbourhoodReportBodySchema = z.object({
  city: requiredString("neighbourhood city", 120),
  address: optionalString("neighbourhood address", 240).optional(),
  lat: optionalNumber("neighbourhood latitude", { min: -90, max: 90 }).optional(),
  lng: optionalNumber("neighbourhood longitude", { min: -180, max: 180 }).optional(),
  propertyType: optionalString("neighbourhood property type", 80).optional(),
  listingId: rowIdSchema("listing id").optional(),
}).strict();

export const listingWriteSchema = z.object({
  title: requiredString("listing title", 180),
  city: requiredString("listing city", 120),
  price: z.number().finite("Invalid listing price").min(0, "Invalid listing price"),
  sqm: z.number().finite("Invalid listing size").min(0, "Invalid listing size"),
  property_type: propertyTypeSchema,
  listing_type: listingTypeSchema,
  owner_id: rowIdSchema("owner id"),
  status: optionalString("listing status", 80).optional(),
}).passthrough();

export const listingUpdateMutationSchema = z.object({
  id: rowIdSchema("listing id"),
  updates: z.object({
    title: requiredString("listing title", 180).optional(),
    city: requiredString("listing city", 120).optional(),
    price: z.number().finite("Invalid listing price").min(0, "Invalid listing price").optional(),
    sqm: z.number().finite("Invalid listing size").min(0, "Invalid listing size").optional(),
    property_type: propertyTypeSchema.optional(),
    listing_type: listingTypeSchema.optional(),
    owner_id: rowIdSchema("owner id").optional(),
    status: optionalString("listing status", 80).optional(),
  }).passthrough(),
}).strict();

export const listingIdSchema = rowIdSchema("listing id");

export const listingImageRowsSchema = z.array(z.object({
  listing_id: rowIdSchema("listing id"),
  url: z.string().trim().min(1, "Invalid listing image").max(2048, "Invalid listing image"),
  sort_order: z.number().int("Invalid listing image order").min(0, "Invalid listing image order").max(500, "Invalid listing image order"),
}).strict()).max(250, "Invalid listing image count");

export const listingImageSortUpdateSchema = z.object({
  listingId: rowIdSchema("listing id"),
  url: z.string().trim().min(1, "Invalid listing image").max(2048, "Invalid listing image"),
  sortOrder: z.number().int("Invalid listing image order").min(0, "Invalid listing image order").max(500, "Invalid listing image order"),
}).strict();

export const listingImageDeleteSchema = z.object({
  listingId: rowIdSchema("listing id"),
  url: z.string().trim().min(1, "Invalid listing image").max(2048, "Invalid listing image"),
}).strict();

export const messageCreateSchema = z.object({
  conversation_id: rowIdSchema("conversation id"),
  content: z.string().trim().max(4000, "Invalid message"),
  attachmentPaths: z.array(z.object({
    path: requiredString("attachment path", 1024),
    filename: requiredString("attachment filename", 240),
    mime_type: optionalString("attachment type", 160).optional(),
  }).strict()).max(10, "Invalid attachments").optional(),
}).strict().superRefine((payload, ctx) => {
  if (!payload.content && !payload.attachmentPaths?.length) {
    ctx.addIssue({ code: "custom", message: "Invalid message", path: ["content"] });
  }
});

export const messageAttachmentRowsSchema = z.array(z.object({
  message_id: rowIdSchema("message id"),
  storage_path: requiredString("attachment path", 1024),
  filename: requiredString("attachment filename", 240),
  mime_type: optionalString("attachment type", 160).optional(),
}).strict()).max(10, "Invalid attachments");

export const conversationTimestampUpdateSchema = z.object({
  conversationId: rowIdSchema("conversation id"),
  lastMessageAt: requiredString("conversation timestamp", 80),
}).strict();

export const conversationCreateSchema = z.object({
  currentUserId: rowIdSchema("current user id"),
  otherUserId: rowIdSchema("other user id"),
  targetListingId: rowIdSchema("listing id").nullable(),
}).strict();

export const markMessagesReadSchema = z.object({
  conversationId: rowIdSchema("conversation id"),
  messageIds: z.array(rowIdSchema("message id")).min(1, "Invalid message ids").max(250, "Invalid message ids"),
}).strict();

export const newBuildLeadSchema = z.object({
  new_building_id: rowIdSchema("new building id"),
  user_id: rowIdSchema("user id"),
  email: z.string().trim().toLowerCase().email("Invalid new build lead email").max(320, "Invalid new build lead email"),
  full_name: requiredString("new build lead name", 160),
  phone: optionalString("new build lead phone", 60),
  investment_budget: z.number().finite("Invalid new build lead budget").min(0, "Invalid new build lead budget"),
  notes: z.string().trim().max(2000, "Invalid new build lead notes"),
  utm_source: requiredString("new build lead source", 120),
}).strict() satisfies z.ZodType<Pick<
  TablesInsert<"new_building_leads">,
  | "new_building_id"
  | "user_id"
  | "email"
  | "full_name"
  | "phone"
  | "investment_budget"
  | "notes"
  | "utm_source"
>>;

export type LeadUpdateInput = z.input<typeof leadUpdateMutationSchema>["updates"] & TablesUpdate<"leads">;
export type ContactUpdateInput = z.input<typeof contactUpdateMutationSchema>["updates"] & TablesUpdate<"contacts">;
