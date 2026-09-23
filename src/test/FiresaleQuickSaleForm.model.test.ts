import { describe, expect, it } from "vitest";
import {
  buildInitialForm,
  buildMetaLines,
  canSubmitQuickSaleRequest,
  getPhotoGrade,
  getPhotoSelectionText,
  getQuickSaleNumericFields,
  getRequiredPropertyType,
  propertyTypeLabel,
  syncContactFields,
  validateSubmissionForm,
  validateStep1Form,
  validateStep2Form,
  type QuickSaleFormValues,
} from "@/components/firesale/quickSaleFormModel";

const validForm = (overrides: Partial<QuickSaleFormValues> = {}): QuickSaleFormValues => ({
  address: "Kolonaki 12, Athens",
  city: "Athens",
  kaek: "050240601001/0/1",
  propertyType: "apartment",
  sqm: "95",
  askingPrice: "350000",
  constructionYear: "2010",
  contactName: "Alice Seller",
  contactEmail: "alice@example.com",
  contactPhone: "+306900000000",
  notes: "Quick sale needed within 30 days.",
  ...overrides,
});

describe("quick sale form model helpers", () => {
  it("builds and syncs profile contact fields without overwriting user-entered values", () => {
    expect(
      buildInitialForm(
        { display_name: "Alice Seller", first_name: "Alice", phone: "+30" },
        "alice@example.com",
      ),
    ).toMatchObject({
      contactName: "Alice Seller",
      contactEmail: "alice@example.com",
      contactPhone: "+30",
    });

    expect(
      syncContactFields(
        validForm({ contactName: "Typed Name", contactEmail: "", contactPhone: "" }),
        { display_name: "Profile Name", first_name: "Profile", phone: "+30123" },
        "profile@example.com",
      ),
    ).toMatchObject({
      contactName: "Typed Name",
      contactEmail: "profile@example.com",
      contactPhone: "+30123",
    });
  });

  it("keeps validation and submission metadata behavior stable without local valuation synthesis", () => {
    expect(validateStep1Form(validForm(), 5)).toEqual({});
    expect(validateStep1Form(validForm(), 4)).toHaveProperty("photos");
    expect(validateStep2Form(validForm({ contactEmail: "bad-email" }))).toHaveProperty(
      "contactEmail",
    );
    expect(buildMetaLines(validForm(), 8)).toEqual([
      "Construction year: 2010",
      "Photo condition grade (1-10): 9",
      "KAEK: 050240601001/0/1",
      "Quick sale needed within 30 days.",
    ]);
  });

  it("covers submission validation, role gates, and photo labels", () => {
    expect(validateSubmissionForm(validForm(), 5)).toEqual({});
    expect(validateSubmissionForm(validForm({ contactName: "", contactPhone: "abc" }), 2)).toMatchObject({
      contactName: expect.any(String),
      contactPhone: expect.any(String),
      photos: expect.any(String),
    });

    expect(canSubmitQuickSaleRequest({ id: "user-1" }, { role: "seller" }, false)).toBe(true);
    expect(canSubmitQuickSaleRequest(null, { role: "seller" }, false)).toBe(false);
    expect(canSubmitQuickSaleRequest({ id: "user-1" }, null, false)).toBe(false);
    expect(canSubmitQuickSaleRequest({ id: "user-1" }, { role: "buyer" }, false)).toBe(false);
    expect(canSubmitQuickSaleRequest({ id: "user-1" }, { role: "seller" }, true)).toBe(false);

    expect(getRequiredPropertyType("commercial_shop")).toBe("commercial");
    expect(() => getRequiredPropertyType("garage")).toThrow("Property type is invalid");

    expect(getPhotoGrade(8)).toBe(9);
    expect(getPhotoGrade(5)).toBe(7);
    expect(getPhotoGrade(3)).toBe(5);
    expect(getPhotoGrade(1)).toBe(3);
    expect(getPhotoSelectionText(1)).toBe("1 photo selected");
    expect(getPhotoSelectionText(2)).toBe("2 photos selected");
    expect(propertyTypeLabel("apartment", "Apartment")).toBe("Apartment");
  });

  it("normalizes quick-sale numeric payload fields before API submission", () => {
    expect(getQuickSaleNumericFields(validForm({
      askingPrice: "425000",
      sqm: "110",
      constructionYear: "2015",
    }))).toEqual({
      askingPrice: 425000,
      sqm: 110,
      constructionYear: 2015,
    });

    expect(getQuickSaleNumericFields(validForm({
      askingPrice: "NaN",
      sqm: "-10",
      constructionYear: "unknown",
    }))).toEqual({
      askingPrice: 0,
      sqm: 0,
      constructionYear: undefined,
    });
  });
});
