import {
  parseBoundedJsonBody,
  SchemaValidationError,
  z,
} from "../_shared/schema.ts";

export const MAX_ROLE_SWITCH_REQUEST_BODY_BYTES = 8_192;
export const ROLE_SWITCH_REQUEST_BODY_TIMEOUT_MS = 2_000;

const participantType = z.enum([
  "buyer",
  "seller",
  "agent",
  "developer",
  "professional",
  "investor",
  "institutional",
]);

export type ParticipantType = z.infer<typeof participantType>;
export type RoleSwitchKind =
  | "same-tier"
  | "upgrade"
  | "downgrade"
  | "proonly"
  | "invite-only";

const participantTypes = new Set<ParticipantType>([
  "buyer",
  "seller",
  "agent",
  "developer",
  "professional",
  "investor",
  "institutional",
]);

const audienceByRole: Record<ParticipantType, string> = {
  buyer: "participant",
  seller: "participant",
  agent: "agent",
  developer: "developer",
  professional: "professional",
  investor: "investor",
  institutional: "institutional",
};

export type RolePrices = Partial<Record<ParticipantType, number>>;

export function canonicalRoleSwitchKind(
  fromType: ParticipantType,
  toType: ParticipantType | "",
  prices: RolePrices,
): RoleSwitchKind {
  if (toType === "" || audienceByRole[fromType] === audienceByRole[toType]) {
    return "same-tier";
  }
  if (toType === "investor" || toType === "institutional") {
    return "invite-only";
  }
  if (toType === "developer") return "proonly";
  if (fromType === "investor" || fromType === "institutional") {
    return "downgrade";
  }
  const fromPrice = prices[fromType];
  const toPrice = prices[toType];
  if (
    !Number.isFinite(fromPrice) || !Number.isFinite(toPrice) ||
    (fromPrice as number) < 0 || (toPrice as number) < 0
  ) {
    throw new SchemaValidationError(
      "Authoritative role pricing is unavailable",
      { code: "role_switch_pricing_unavailable" },
    );
  }
  return (toPrice as number) > (fromPrice as number) ? "upgrade" : "downgrade";
}

type RoleSwitchProfile = {
  role?: string | null;
  participant_type?: string | null;
  role_switch_in_progress_at?: string | null;
  role_switch_audit_id?: string | null;
};

function isParticipantType(value: unknown): value is ParticipantType {
  return typeof value === "string" &&
    participantTypes.has(value as ParticipantType);
}

const roleSwitchRequestSchema = z.object({
  operation_id: z.string().uuid(),
  from_type: participantType,
  to_type: z.union([participantType, z.literal("")]).default(""),
  cancel_subscription: z.literal(true),
}).strict();

export type RoleSwitchRequest = z.infer<typeof roleSwitchRequestSchema>;

export function resolveAuthoritativeRoleSwitch(
  request: RoleSwitchRequest,
  profile: RoleSwitchProfile,
  prices: RolePrices,
): {
  operationId: string;
  fromType: ParticipantType;
  toType: ParticipantType | "";
  switchKind: RoleSwitchKind;
} {
  const currentRole = isParticipantType(profile.participant_type)
    ? profile.participant_type
    : profile.role_switch_in_progress_at && isParticipantType(profile.role)
    ? profile.role
    : null;

  if (!currentRole) {
    throw new SchemaValidationError(
      "Authoritative role-switch source is unavailable",
      { code: "role_switch_state_unavailable" },
    );
  }
  if (request.from_type !== currentRole) {
    throw new SchemaValidationError(
      "Role-switch source does not match the authenticated profile",
      {
        code: "role_switch_source_mismatch",
        issues: [{
          code: "role_switch_source_mismatch",
          path: ["from_type"],
          message:
            "Role-switch source does not match the authenticated profile",
        }],
      },
    );
  }

  if (
    profile.role_switch_in_progress_at &&
    profile.role_switch_audit_id !== request.operation_id
  ) {
    throw new SchemaValidationError(
      "Role-switch audit does not match the active operation",
      {
        code: "role_switch_audit_mismatch",
        issues: [{
          code: "role_switch_audit_mismatch",
          path: ["operation_id"],
          message: "Role-switch audit does not match the active operation",
        }],
      },
    );
  }

  const switchKind = canonicalRoleSwitchKind(
    currentRole,
    request.to_type,
    prices,
  );

  return {
    operationId: request.operation_id,
    fromType: currentRole,
    toType: request.to_type,
    switchKind,
  };
}

export function parseRoleSwitchRequest(
  req: Request,
  options: { timeoutMs?: number } = {},
): Promise<RoleSwitchRequest> {
  return parseBoundedJsonBody(req, roleSwitchRequestSchema, {
    maxBytes: MAX_ROLE_SWITCH_REQUEST_BODY_BYTES,
    timeoutMs: options.timeoutMs ?? ROLE_SWITCH_REQUEST_BODY_TIMEOUT_MS,
  });
}
