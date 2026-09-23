export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__projectUnitPricesScenario;
  return {
    auth: {
      getUser: async (token: string) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        if (scenario.authError) {
          return {
            data: { user: null },
            error: { message: scenario.authError },
          };
        }
        return {
          data: {
            user: scenario.user ?? { id: "user-1", email: "user@test.local" },
          },
          error: null,
        };
      },
    },
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            scenario.calls.push({
              name: "select",
              args: { table, columns, filters: [[column, value]] },
            });
            return {
              data: {
                role: scenario.profileRole ?? "developer",
                role_switch_in_progress_at: scenario.roleSwitchInProgress
                  ? "2026-06-01T00:00:00Z"
                  : null,
              },
              error: null,
            };
          },
        }),
      }),
    }),
    rpc: async (name: string, args: unknown) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (scenario.rpcError) {
        return { data: null, error: { message: scenario.rpcError } };
      }
      return { data: scenario.updatedCount ?? 3, error: null };
    },
  };
}

export type SupabaseClient = ReturnType<typeof createClient>;
