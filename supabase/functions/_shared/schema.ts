import { z, type ZodType } from "npm:zod@4.4.3";

export { z };

export class SchemaValidationError extends Error {
  constructor(message = "Invalid request body") {
    super(message);
    this.name = "SchemaValidationError";
  }
}

export async function parseJsonBody<T>(
  req: Request,
  schema: ZodType<T>,
  fallback: unknown = {},
): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = fallback;
  }

  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;

  const firstMessage = parsed.error.issues[0]?.message;
  throw new SchemaValidationError(
    firstMessage?.startsWith("Invalid ") ? firstMessage : "Invalid request body",
  );
}
