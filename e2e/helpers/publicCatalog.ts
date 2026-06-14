import { expect, type Page } from "@playwright/test";

type PublicApiState = {
  healthy: boolean;
  status: number | null;
  contentType: string;
  error?: string;
};

const isLocalBrowserOrigin = (url: string): boolean => {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
};

async function getPublicApiState(page: Page, path: string): Promise<PublicApiState> {
  try {
    const response = await page.request.get(path, {
      headers: { Accept: "application/json" },
      timeout: 8_000,
    });
    const contentType = response.headers()["content-type"] ?? "";
    const isJson = /application\/json/i.test(contentType);
    let hasApiError = false;

    if (isJson) {
      const body = await response.json().catch(() => null);
      hasApiError = Boolean(body && typeof body === "object" && "error" in body);
    }

    return {
      healthy: response.ok() && isJson && !hasApiError,
      status: response.status(),
      contentType,
      error: hasApiError ? "API response contains an error field" : undefined,
    };
  } catch (error) {
    return {
      healthy: false,
      status: null,
      contentType: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function expectPublicCatalogContent(
  page: Page,
  {
    apiPath,
    cardTestId,
    emptyText,
    errorText,
    loadingSelector,
    label,
  }: {
    apiPath: string;
    cardTestId: string;
    emptyText: string;
    errorText: string;
    loadingSelector: string;
    label: string;
  },
) {
  const state = await getPublicApiState(page, apiPath);
  const requireHealthyPublicApi = state.healthy || !isLocalBrowserOrigin(page.url());
  const cards = page.getByTestId(cardTestId);
  const emptyState = page.getByText(emptyText);
  const errorState = page.getByText(errorText);
  const loadingState = page.locator(loadingSelector);

  await expect(page.locator("main, #main-content, body").first()).toBeVisible();

  if (requireHealthyPublicApi) {
    expect(
      state.healthy,
      `${label} public API must be healthy when testing a Pages/live origin; status=${state.status ?? "n/a"} content-type=${state.contentType || "n/a"}${state.error ? ` error=${state.error}` : ""}`,
    ).toBe(true);
    await expect(errorState).toBeHidden({ timeout: 20_000 });
    await expect(cards.or(emptyState).first()).toBeVisible({ timeout: 20_000 });
    return;
  }

  await expect(cards.or(emptyState).or(errorState).or(loadingState).first()).toBeVisible({
    timeout: 20_000,
  });
}

