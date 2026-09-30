export const getCheckoutErrorMessage = async (
  data: unknown,
  error: unknown,
  fallback: string,
): Promise<string> => {
  const dataError = (data as { error?: unknown } | null)?.error;
  if (typeof dataError === "string" && dataError.trim()) return dataError;

  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim()) return body.error;
    } catch {
      // Supabase function errors do not always include a JSON response body.
    }
  }
  return fallback;
};
