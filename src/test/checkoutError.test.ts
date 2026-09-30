import { describe, expect, it } from "vitest";
import { getCheckoutErrorMessage } from "@/lib/checkoutError";

describe("Checkout error extraction", () => {
  it("reads the server prose from a clone without consuming the response", async () => {
    const context = new Response(JSON.stringify({ code: "trial_checkout_pending", error: "Your trial checkout is still pending." }), { status: 409 });
    expect(await getCheckoutErrorMessage(null, { context }, "fallback")).toBe("Your trial checkout is still pending.");
    expect(context.bodyUsed).toBe(false);
    expect(await getCheckoutErrorMessage({ error: "Direct error" }, { context }, "fallback")).toBe("Direct error");
  });
  it.each(["not JSON", "null", "{}", '{"error":5}', '{"error":" "}'])("keeps the fallback for %s", async (body) => {
    expect(await getCheckoutErrorMessage(null, { context: new Response(body, { status: 500 }) }, "Try again")).toBe("Try again");
  });
});
