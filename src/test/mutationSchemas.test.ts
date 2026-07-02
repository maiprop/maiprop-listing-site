import { describe, expect, it } from "vitest";
import {
  aiChatBodySchema,
  aiSearchBodySchema,
  contactCreateSchema,
  favoriteToggleSchema,
  firesaleRequestSchema,
  leadCreateSchema,
  listingUpdateMutationSchema,
  listingWriteSchema,
  neighbourhoodReportBodySchema,
  parseMutationInput,
  pricingConfigRowsSchema,
  proAiToolsBodySchema,
  professionalAvailabilityRowsSchema,
  professionalServiceRowsSchema,
  professionalVideoSettingsMutationSchema,
  propertyValuationBodySchema,
  projectMediaCreateSchema,
  projectUnitWriteSchema,
  newBuildingProjectWriteSchema,
} from "@/lib/mutationSchemas";

describe("mutation schema parsing", () => {
  it("normalizes valid user-facing mutation input", () => {
    expect(parseMutationInput(favoriteToggleSchema, {
      listing_id: "listing-1",
      isFavorited: false,
      priceAlert: true,
      price: 120000,
    }, "favorite")).toMatchObject({
      listing_id: "listing-1",
      isFavorited: false,
      priceAlert: true,
      price: 120000,
    });

    expect(parseMutationInput(leadCreateSchema, {
      name: "  Ada Buyer ",
      email: "ADA@EXAMPLE.COM",
      source: "manual",
    }, "lead")).toMatchObject({
      name: "Ada Buyer",
      email: "ada@example.com",
      source: "manual",
    });
  });

  it("rejects malformed CRM and contact payloads before Supabase", () => {
    expect(() => parseMutationInput(leadCreateSchema, {
      name: "",
      email: "not-an-email",
    }, "lead")).toThrow("Invalid lead name");

    expect(() => parseMutationInput(contactCreateSchema, {
      name: "Contact",
      email: "not-an-email",
    }, "contact")).toThrow("Invalid contact email");
  });

  it("enforces required listing, pricing, and AI request fields", () => {
    expect(() => parseMutationInput(listingWriteSchema, {
      title: "Bad",
      city: "Athens",
      price: -1,
      sqm: 80,
      property_type: "apartment",
      listing_type: "sale",
      owner_id: "user-1",
    }, "listing")).toThrow("Invalid listing price");

    expect(() => parseMutationInput(pricingConfigRowsSchema, [{
      id: "price-1",
      key: "pro",
      label: "Pro",
      audience: "participant",
      module: "user_subscription",
      unit: "monthly",
      currency: "EUR",
      amount: -10,
      is_active: true,
      sort_order: 1,
      metadata: {},
    }], "pricing")).toThrow("Invalid pricing amount");

    expect(() => parseMutationInput(aiSearchBodySchema, { query: "" }, "AI search"))
      .toThrow("Invalid AI search query");

    expect(() => parseMutationInput(propertyValuationBodySchema, {
      city: "Athens",
      price: 100000,
      sqm: 0,
    }, "valuation")).toThrow("Invalid valuation size");
  });

  it("rejects invalid listing updates before owner-scoped persistence", () => {
    expect(() => parseMutationInput(listingUpdateMutationSchema, {
      id: "listing-1",
      updates: { price: -100 },
    }, "listing update")).toThrow("Invalid listing price");

    expect(() => parseMutationInput(listingUpdateMutationSchema, {
      id: "listing-1",
      updates: { listing_type: "lease" },
    }, "listing update")).toThrow("Invalid listing update");
  });

  it("rejects invalid new-build project, unit, and media payloads", () => {
    expect(parseMutationInput(newBuildingProjectWriteSchema, {
      name: "Glyfada GV",
      city: "Athens",
      owner_id: "developer-1",
    }, "new building project")).toMatchObject({
      name: "Glyfada GV",
      city: "Athens",
    });
    expect(() => parseMutationInput(newBuildingProjectWriteSchema, {
      name: "",
      city: "Athens",
      owner_id: "developer-1",
    }, "new building project")).toThrow("Invalid project name");

    expect(() => parseMutationInput(projectUnitWriteSchema, {
      project_id: "project-1",
      internal_sqm: -1,
      bedrooms: 1,
    }, "project unit")).toThrow("Invalid unit size");

    expect(() => parseMutationInput(projectMediaCreateSchema, {
      project_id: "project-1",
      url: "https://cdn.example/project.jpg",
      media_type: "rendering",
      sort_order: -1,
    }, "project media")).toThrow("Invalid project media order");
  });

  it("rejects invalid quick-sale seller request payloads", () => {
    expect(() => parseMutationInput(firesaleRequestSchema, {
      address: "Kolonaki 1",
      city: "Athens",
      property_type: "apartment",
      sqm: 80,
      condition: null,
      asking_price: 250000,
      contact_email: "not-an-email",
      contact_phone: null,
      notes: null,
      ai_estimate: 220000,
      user_id: "seller-1",
      status: "pending",
    }, "quick sale request")).toThrow("Invalid quick sale email");
  });

  it("rejects invalid professional service, availability, and video settings payloads", () => {
    expect(() => parseMutationInput(professionalServiceRowsSchema, [{
      professional_id: "professional-1",
      service_key: "",
      service_name: "Valuation",
      category: "valuation",
      pricing_model: "fixed",
      currency: "EUR",
      video_enabled: true,
      is_premium: false,
      is_active: true,
    }], "professional services")).toThrow("Invalid service key");

    expect(() => parseMutationInput(professionalAvailabilityRowsSchema, [{
      professional_id: "professional-1",
      day_of_week: 7,
      start_time: "09:00",
      end_time: "17:00",
      is_active: true,
    }], "professional availability")).toThrow("Invalid availability day");

    expect(() => parseMutationInput(professionalVideoSettingsMutationSchema, {
      professionalId: "professional-1",
      userId: "user-1",
      video_link: "x".repeat(501),
      calendar_notes: null,
    }, "professional video settings")).toThrow("Invalid video link");
  });

  it("rejects malformed AI chat, tools, valuation, and neighbourhood payloads", () => {
    expect(() => parseMutationInput(aiChatBodySchema, {
      messages: [],
    }, "AI chat")).toThrow("Invalid AI messages");

    expect(() => parseMutationInput(proAiToolsBodySchema, {
      messages: [{ role: "user", content: "Hello" }],
      groupId: "",
    }, "AI tools")).toThrow("Invalid AI tool group");

    expect(() => parseMutationInput(neighbourhoodReportBodySchema, {
      city: "Athens",
      lat: 91,
    }, "neighbourhood report")).toThrow("Invalid neighbourhood latitude");
  });
});
