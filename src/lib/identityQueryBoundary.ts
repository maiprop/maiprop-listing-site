import type { QueryClient, QueryKey } from "@tanstack/react-query";

const PUBLIC_QUERY_ROOTS = new Set([
  "auction-count-today",
  "auction-listing-by-id",
  "auction-listings",
  "auction_bid_history",
  "homepage-featured",
  "homepage-open-houses",
  "homepage-popular-locations",
  "new-build-listing",
  "open-houses",
  "price-index",
  "pricing-configs-public",
  "professional",
  "professional-reviews",
  "professional_availability",
  "professional_services",
  "professionals",
  "similar-listings",
]);

const SCOPED_PUBLIC_QUERY_ROOTS = new Set([
  "listing",
  "listings",
  "listings-paginated",
]);

let activeIdentitySubject: string | null = null;
let activeAuthorizationKey: string | null = null;
let identityEpoch = 0;

const normalizedIdentitySubject = (userId: string | null | undefined) =>
  userId ?? "anonymous";

const hasPublicScope = (queryKey: QueryKey) =>
  queryKey.some((part) => (
    typeof part === "object" &&
    part !== null &&
    "publicScope" in part &&
    (part as { publicScope?: unknown }).publicScope === true
  ));

export const isPublicQueryKey = (queryKey: QueryKey): boolean => {
  const root = queryKey[0];
  if (root === "public") return true;
  if (typeof root !== "string") return false;
  if (PUBLIC_QUERY_ROOTS.has(root)) return true;
  return SCOPED_PUBLIC_QUERY_ROOTS.has(root) && hasPublicScope(queryKey);
};

export const publicQueryKey = (
  resource: string,
  ...parts: readonly unknown[]
) => ["public", resource, ...parts] as const;

export const accountQueryKey = (
  userId: string | null | undefined,
  resource: string,
  ...parts: readonly unknown[]
) => ["account", normalizedIdentitySubject(userId), resource, ...parts] as const;

export const authorizationQueryKey = (
  userId: string | null | undefined,
  authorizationVersion: string,
  resource: string,
  ...parts: readonly unknown[]
) => [
  "authorization",
  normalizedIdentitySubject(userId),
  authorizationVersion,
  resource,
  ...parts,
] as const;

export const organizationQueryKey = (
  userId: string | null | undefined,
  organizationId: string | null | undefined,
  resource: string,
  ...parts: readonly unknown[]
) => [
  "organization",
  normalizedIdentitySubject(userId),
  organizationId ?? "personal",
  resource,
  ...parts,
] as const;

export const captureIdentityEpoch = () => identityEpoch;

export const isCurrentIdentityEpoch = (epoch: number) =>
  epoch === identityEpoch;

const purgePrivateQueryState = (queryClient: QueryClient) => {
  const isPrivate = (query: { queryKey: QueryKey }) =>
    !isPublicQueryKey(query.queryKey);

  void queryClient.cancelQueries({ predicate: isPrivate });
  queryClient.removeQueries({ predicate: isPrivate });
  queryClient.getMutationCache().clear();
};

export const transitionQueryIdentity = (
  queryClient: QueryClient,
  userId: string | null | undefined,
) => {
  const nextSubject = normalizedIdentitySubject(userId);
  if (activeIdentitySubject === nextSubject) return identityEpoch;

  activeIdentitySubject = nextSubject;
  activeAuthorizationKey = null;
  identityEpoch += 1;
  purgePrivateQueryState(queryClient);
  return identityEpoch;
};

export const transitionQueryAuthorization = (
  queryClient: QueryClient,
  userId: string | null | undefined,
  authorizationFingerprint: string,
) => {
  const nextSubject = normalizedIdentitySubject(userId);
  if (activeIdentitySubject !== nextSubject) {
    transitionQueryIdentity(queryClient, userId);
  }

  const nextAuthorizationKey = `${nextSubject}:${authorizationFingerprint}`;
  if (activeAuthorizationKey === nextAuthorizationKey) return identityEpoch;

  activeAuthorizationKey = nextAuthorizationKey;
  identityEpoch += 1;
  purgePrivateQueryState(queryClient);
  return identityEpoch;
};

export const resetIdentityQueryStateForTests = () => {
  activeIdentitySubject = null;
  activeAuthorizationKey = null;
  identityEpoch = 0;
};
