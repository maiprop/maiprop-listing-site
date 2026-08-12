export const MAIPROP_PRODUCTION_STRIPE_ACCOUNT_ID =
  "acct_1TnuLTGfOEgBOxtl";

function paymentMethodEnabled(configuration, method) {
  const value = configuration?.[method];
  return value?.available === true &&
    value?.display_preference?.value === "on";
}

export function assessPaymentMethodConfigurations(configurations) {
  const rows = Array.isArray(configurations) ? configurations : [];
  const direct = rows.find((configuration) =>
    configuration?.active === true &&
    configuration?.livemode === true &&
    configuration?.is_default === true &&
    configuration?.application == null &&
    configuration?.parent == null &&
    paymentMethodEnabled(configuration, "card")
  );
  if (!direct) {
    return {
      ok: false,
      configuration_id: null,
      enabled_payment_methods: [],
      issue:
        "The live direct default Payment Method Configuration is missing or does not have card enabled.",
    };
  }
  const enabled = Object.entries(direct)
    .filter(([name]) => ![
      "id",
      "object",
      "active",
      "application",
      "customer",
      "livemode",
      "name",
      "parent",
    ].includes(name))
    .filter(([, value]) =>
      value?.available === true && value?.display_preference?.value === "on"
    )
    .map(([name]) => name)
    .sort();
  return {
    ok: true,
    configuration_id: direct.id,
    is_default: true,
    enabled_payment_methods: enabled,
    issue: null,
  };
}

export function assertRestrictedKeyWriteDenied({ status, body }) {
  if (status !== 403) {
    throw new Error(
      `Stripe readiness key has write permission or returned an ambiguous response (${status}); expected an explicit 403 permission denial.`,
    );
  }
  const errorType = String(body?.error?.type ?? "");
  if (errorType && errorType !== "invalid_request_error") {
    throw new Error(
      `Stripe readiness write probe returned unexpected error type ${errorType}.`,
    );
  }
  return { denied: true, status };
}
