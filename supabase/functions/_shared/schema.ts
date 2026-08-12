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
  status?: number;
};

export class SchemaValidationError extends Error {
  code: string;
  issues: SchemaValidationIssue[];
  status: number;

  constructor(
    message = "Invalid request body",
    options: SchemaValidationErrorOptions = {},
  ) {
    super(message);
    this.name = "SchemaValidationError";
    this.code = options.code ?? "validation_error";
    this.issues = options.issues ?? [{ code: this.code, path: [], message }];
    this.status = options.status ?? 400;
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
    path: issue.path.map((segment) =>
      typeof segment === "number" ? segment : String(segment)
    ),
    message: issue.message,
  };
}

function strictObjectSchema<T>(schema: ZodType<T>): ZodType<T> {
  const maybeStrict = schema as ZodType<T> & { strict?: () => ZodType<T> };
  return typeof maybeStrict.strict === "function"
    ? maybeStrict.strict()
    : schema;
}

function parseJsonValue<T>(body: unknown, schema: ZodType<T>): T {
  const parsed = strictObjectSchema(schema).safeParse(body);
  if (parsed.success) return parsed.data;

  const issues = parsed.error.issues.map(toSchemaIssue);
  throw new SchemaValidationError(
    issues[0]?.message ?? "Invalid request body",
    {
      code: "validation_error",
      issues,
    },
  );
}

export type BoundedJsonBodyOptions = {
  maxBytes: number;
  timeoutMs: number;
};

function bodyBoundaryError(
  message: string,
  code: "payload_too_large" | "request_timeout",
  status: 408 | 413,
): SchemaValidationError {
  return new SchemaValidationError(message, {
    code,
    status,
    issues: [{ code, path: [], message }],
  });
}

async function readBoundedBody(
  req: Request,
  options: BoundedJsonBodyOptions,
): Promise<Uint8Array> {
  if (
    !Number.isFinite(options.maxBytes) || options.maxBytes < 1 ||
    !Number.isFinite(options.timeoutMs) || options.timeoutMs < 1
  ) {
    throw new Error("Invalid bounded JSON body configuration");
  }

  const contentLength = req.headers.get("content-length");
  const declaredLength = contentLength === null ? NaN : Number(contentLength);
  if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
    throw bodyBoundaryError(
      "Request body too large",
      "payload_too_large",
      413,
    );
  }
  if (!req.body) return new Uint8Array();

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const cancelWithoutBlocking = (reason: string): void => {
    try {
      void reader.cancel(reason).catch(() => undefined);
    } catch {
      // Preserve the boundary error if cancellation fails synchronously.
    }
  };
  const timeoutError = bodyBoundaryError(
    "Request body timed out",
    "request_timeout",
    408,
  );
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(timeoutError);
      cancelWithoutBlocking("request body timeout");
    }, options.timeoutMs);
  });

  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > options.maxBytes) {
        cancelWithoutBlocking("request body too large");
        throw bodyBoundaryError(
          "Request body too large",
          "payload_too_large",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    try {
      reader.releaseLock();
    } catch {
      // A non-cooperative producer may keep its pending read after cancellation.
    }
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function parseBoundedJsonBody<T>(
  req: Request,
  schema: ZodType<T>,
  options: BoundedJsonBodyOptions,
): Promise<T> {
  const bytes = await readBoundedBody(req, options);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SchemaValidationError("Invalid JSON body", {
      code: "invalid_json",
      issues: [invalidJsonIssue],
    });
  }
  return parseJsonValue(body, schema);
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

  return parseJsonValue(body, schema);
}
