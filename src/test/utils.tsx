/* eslint-disable react-refresh/only-export-components */
/**
 * Shared test utilities.
 *
 * Usage:
 *   import { renderWithProviders } from "@/test/utils";
 *   const { getByText } = renderWithProviders(<MyComponent />);
 */

import React, { type ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

/**
 * Builds a fresh QueryClient configured for tests:
 * - No retries (fail fast so tests don't wait 3× retry on expected errors)
 * - GC time 0 so stale queries don't bleed between tests
 */
// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface WrapperProps {
  children: React.ReactNode;
  initialPath?: string;
  queryClient?: QueryClient;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function AllProviders({ children, initialPath = "/", queryClient = createTestQueryClient() }: WrapperProps) {
  return (
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialPath]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </MemoryRouter>
    </HelmetProvider>
  );
}

/**
 * Renders a component wrapped with all required providers:
 * - MemoryRouter (for useNavigate / useParams / Link)
 * - QueryClientProvider (for useQuery / useMutation hooks)
 *
 * Does NOT include AuthProvider — mock `useAuth` separately per test when needed.
 */
// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper"> & { initialPath?: string; queryClient?: QueryClient }
) {
  const { initialPath, queryClient, ...rest } = options ?? {};
  return render(ui, {
    wrapper: ({ children }) => (
      <AllProviders initialPath={initialPath} queryClient={queryClient}>{children}</AllProviders>
    ),
    ...rest,
  });
}

/**
 * Factory for a minimal mock Supabase client.
 * Override individual methods per test as needed:
 *
 *   const sb = makeMockSupabase();
 *   sb.from.mockReturnValueOnce({ select: vi.fn().mockReturnValue({ data: [...], error: null }) });
 */
// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function makeMockSupabase() {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://example.com/test.jpg" } }),
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  };
}
