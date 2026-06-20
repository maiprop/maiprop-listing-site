import { z, type ZodType } from "npm:zod@4.4.3";

export { z };

export type SchemaValidationIssue = {
  code: string;
  path: Array<string | number>;
  message: string;
};

export type SchemaValidationErrorOptions = {
  code?: string;
  issues?: SchemaValidationIssue[];
};

export class SchemaValidationError extends Error {
  code: string;
  issues: SchemaValidationIssue[];

  constructor(message = "Invalid request body", options: SchemaValidationErrorOptions = {}) {
    super(message);
    this.name = "SchemaValidationError";
    this.code = options.code ?? "validation_error";
    this.issues = options.issues ?? [{ code: this.code, path: [], message }];
  }
}

const invalidJsonIssue: SchemaValidationIssue = {
  code: "invalid_json",
  path: [],
  message: "Invalid JSON body",
};

function toSchemaIssue(issue: z.core.$ZodIssue): SchemaValidationIssue {
  return {
    code: issue.code,
    path: issue.path.map((segment) => typeof segment === "number" ? segment : String(segment)),
    message: issue.message,
  };
}

function strictObjectSchema<T>(schema: ZodType<T>): ZodType<T> {
  const maybeStrict = schema as ZodType<T> & { strict?: () => ZodType<T> };
  return typeof maybeStrict.strict === "function" ? maybeStrict.strict() : schema;
}

export async function parseJsonBody<T>(
  req: Request,
  schema: ZodType<T>,
  _fallback: unknown = {},
): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new SchemaValidationError("Invalid JSON body", {
      code: "invalid_json",
      issues: [invalidJsonIssue],
    });
  }

  const parsed = strictObjectSchema(schema).safeParse(body);
  if (parsed.success) return parsed.data;

  const issues = parsed.error.issues.map(toSchemaIssue);
  throw new SchemaValidationError(issues[0]?.message ?? "Invalid request body", {
    code: "validation_error",
    issues,
  });
}
