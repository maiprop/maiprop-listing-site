export type PublicCollectionWindow<T> = {
  data: T[];
  hasMore: boolean;
  nextCursor: string | null;
  limit: number;
};

type PublicCollectionEnvelope<T> = {
  data?: T[];
  hasMore?: boolean;
  nextCursor?: string | null;
  limit?: number;
};

export function normalizePublicCollectionWindow<T>(
  payload: T[] | PublicCollectionEnvelope<T> | null | undefined,
  requestedLimit: number,
): PublicCollectionWindow<T> {
  if (Array.isArray(payload)) {
    return {
      data: payload,
      hasMore: false,
      nextCursor: null,
      limit: requestedLimit,
    };
  }

  if (!payload || !Array.isArray(payload.data)) {
    throw new Error("Public catalogue API returned an invalid payload");
  }

  const nextCursor = typeof payload.nextCursor === "string" && payload.nextCursor
    ? payload.nextCursor
    : null;
  const limit = Number.isFinite(payload.limit) && Number(payload.limit) > 0
    ? Math.trunc(Number(payload.limit))
    : requestedLimit;

  return {
    data: payload.data,
    hasMore: payload.hasMore === true && nextCursor !== null,
    nextCursor,
    limit,
  };
}
