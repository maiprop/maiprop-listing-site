import { z } from "../_shared/schema.ts";

export type CustomerPortalAction =
  | "manage"
  | "payment_method_update"
  | "subscription_cancel"
  | "subscription_update"
  | "resume_subscription";

export type PortalActionRequest = {
  action: CustomerPortalAction;
  subscriptionId: string | null;
  operationId: string | null;
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

const PORTAL_ACTIONS = [
  "manage",
  "payment_method_update",
  "subscription_cancel",
  "subscription_update",
  "resume_subscription",
] as const;

const subscriptionIdSchema = z.string()
  .trim()
  .min(5, "Invalid subscription_id")
  .max(255, "Invalid subscription_id")
  .regex(/^sub_[A-Za-z0-9_]+$/, "Invalid subscription_id");

const operationIdSchema = z.string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Invalid operation_id",
  );

export const portalActionRequestSchema = z.object({
  action: z.enum(PORTAL_ACTIONS, { error: "Invalid action" }).optional().default("manage"),
  subscription_id: subscriptionIdSchema.optional(),
  subscriptionId: subscriptionIdSchema.optional(),
  operation_id: operationIdSchema.optional(),
}).strict().superRefine((input, ctx) => {
  if (
    input.subscription_id && input.subscriptionId &&
    input.subscription_id !== input.subscriptionId
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["subscription_id"],
      message: "Conflicting subscription_id values",
    });
  }

  const subscriptionId = input.subscription_id ?? input.subscriptionId ?? null;
  if (
    (input.action === "subscription_cancel" ||
      input.action === "subscription_update" ||
      input.action === "resume_subscription") &&
    !subscriptionId
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["subscription_id"],
      message: "subscription_id is required for this portal action",
    });
  }
  if (input.action === "resume_subscription" && !input.operation_id) {
    ctx.addIssue({
      code: "custom",
      path: ["operation_id"],
      message: "operation_id is required for subscription resume",
    });
  }
}).transform((input): PortalActionRequest => ({
  action: input.action,
  subscriptionId: input.subscription_id ?? input.subscriptionId ?? null,
  operationId: input.operation_id ?? null,
}));

export function parsePortalActionRequest(body: unknown): PortalActionRequest {
  const parsed = portalActionRequestSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  throw new PortalActionValidationError(
    parsed.error.issues[0]?.message ?? "Invalid portal action request",
  );
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
