export type CustomerPortalAction =
  | "manage"
  | "payment_method_update"
  | "subscription_cancel"
  | "subscription_update"
  | "resume_subscription";

export type PortalActionRequest = {
  action: CustomerPortalAction;
  subscriptionId: string | null;
};

export class PortalActionValidationError extends Error {
  status = 400;
}

type PortalSessionParams = {
  customer: string;
  return_url: string;
  configuration?: string;
  flow_data?: Record<string, unknown>;
};

const PORTAL_ACTIONS = new Set<CustomerPortalAction>([
  "manage",
  "payment_method_update",
  "subscription_cancel",
  "subscription_update",
  "resume_subscription",
]);

const SUBSCRIPTION_ID_RE = /^sub_[A-Za-z0-9_]+$/;

export function parsePortalActionRequest(body: unknown): PortalActionRequest {
  const input = body && typeof body === "object"
    ? body as Record<string, unknown>
    : {};
  const action = typeof input.action === "string" && PORTAL_ACTIONS.has(input.action as CustomerPortalAction)
    ? input.action as CustomerPortalAction
    : "manage";
  const rawSubscriptionId = input.subscription_id ?? input.subscriptionId;
  const subscriptionId = typeof rawSubscriptionId === "string" &&
      rawSubscriptionId.trim()
    ? rawSubscriptionId.trim()
    : null;

  if (subscriptionId && !SUBSCRIPTION_ID_RE.test(subscriptionId)) {
    throw new PortalActionValidationError("Invalid subscription_id");
  }

  if (
    (action === "subscription_cancel" ||
      action === "subscription_update" ||
    action === "resume_subscription") &&
    !subscriptionId
  ) {
    throw new PortalActionValidationError("subscription_id is required for this portal action");
  }

  return { action, subscriptionId };
}

function afterCompletion(returnUrl: string) {
  return {
    type: "redirect",
    redirect: { return_url: returnUrl },
  };
}

export function buildPortalSessionParams(
  customerId: string,
  returnUrl: string,
  action: CustomerPortalAction,
  subscriptionId: string | null,
  configurationId?: string | null,
): PortalSessionParams {
  const params: PortalSessionParams = {
    customer: customerId,
    return_url: returnUrl,
  };
  if (configurationId) params.configuration = configurationId;

  if (action === "payment_method_update") {
    params.flow_data = {
      type: "payment_method_update",
      after_completion: afterCompletion(returnUrl),
    };
  }
  if (action === "subscription_cancel") {
    params.flow_data = {
      type: "subscription_cancel",
      subscription_cancel: { subscription: subscriptionId },
      after_completion: afterCompletion(returnUrl),
    };
  }
  if (action === "subscription_update") {
    params.flow_data = {
      type: "subscription_update",
      subscription_update: { subscription: subscriptionId },
      after_completion: afterCompletion(returnUrl),
    };
  }

  return params;
}
