const REDIRECT_STATUS_MIN = 300;
const REDIRECT_STATUS_MAX = 399;

export async function fetchReleaseResource(
  url,
  {
    fetchImpl = globalThis.fetch,
    expectedOrigin,
    ...requestOptions
  } = {},
) {
  const target = new URL(url);
  const trustedOrigin = new URL(expectedOrigin ?? target.origin).origin;
  if (target.origin !== trustedOrigin) {
    throw new Error(
      `Release request origin ${target.origin} does not match ${trustedOrigin}.`,
    );
  }

  const response = await fetchImpl(target, {
    ...requestOptions,
    redirect: "manual",
  });
  const location = response.headers?.get?.("location") ?? "";
  if (
    response.redirected === true ||
    (response.status >= REDIRECT_STATUS_MIN &&
      response.status <= REDIRECT_STATUS_MAX)
  ) {
    throw new Error(
      `${target} refused redirect${location ? ` to ${location}` : ""}.`,
    );
  }

  const responseUrl = String(response.url ?? "").trim();
  if (responseUrl) {
    let responseOrigin;
    try {
      responseOrigin = new URL(responseUrl).origin;
    } catch {
      throw new Error(`${target} returned an invalid response URL.`);
    }
    if (responseOrigin !== trustedOrigin) {
      throw new Error(
        `${target} returned an unexpected response origin ${responseOrigin}.`,
      );
    }
  }

  return response;
}
