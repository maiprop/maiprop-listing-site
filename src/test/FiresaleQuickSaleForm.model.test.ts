import { describe, expect, it } from "vitest";
import {
  buildInitialForm,
  buildMetaLines,
  getLocalEstimate,
  syncContactFields,
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

  it("keeps validation, local estimate, and submission metadata behavior stable", () => {
    expect(validateStep1Form(validForm(), 5)).toEqual({});
    expect(validateStep1Form(validForm(), 4)).toHaveProperty("photos");
    expect(validateStep2Form(validForm({ contactEmail: "bad-email" }))).toHaveProperty(
      "contactEmail",
    );
    expect(getLocalEstimate(validForm({ sqm: "100" }))).toBe(184000);
    expect(buildMetaLines(validForm(), 8)).toEqual([
      "Construction year: 2010",
      "Photo condition grade (1-10): 9",
      "KAEK: 050240601001/0/1",
      "Quick sale needed within 30 days.",
    ]);
  });
});
