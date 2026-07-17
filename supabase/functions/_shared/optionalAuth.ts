type OptionalAuthResult = {
  data?: { user?: { id?: string | null } | null } | null;
  error?: unknown;
};

type OptionalAuthLookup = (token: string) => Promise<OptionalAuthResult>;

export async function resolveOptionalUserId(
  token: string | null | undefined,
  lookup: OptionalAuthLookup,
  timeoutMs = 1_500,
): Promise<string | null> {
  if (!token) return null;

  let timeoutId: number | undefined;
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    const result = await Promise.race([
      lookup(token)
        .then(({ data, error }) => error ? null : data?.user?.id ?? null)
        .catch(() => null),
      timeout,
    ]);
    return typeof result === "string" && result.length > 0 ? result : null;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
