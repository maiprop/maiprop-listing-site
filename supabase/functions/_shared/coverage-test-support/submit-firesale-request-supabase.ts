export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__submitFiresaleRequestScenario;
  return {
    auth: {
      getUser: async (token) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        if (scenario.authError) {
          return {
            data: { user: null },
            error: { message: scenario.authError },
          };
        }
        return {
          data: {
            user: scenario.user ??
              { id: "seller-1", email: "seller@test.local" },
          },
          error: null,
        };
      },
    },
    from: (table) => ({
      select: (columns) => ({
        eq: (_column, value) => ({
          maybeSingle: async () => {
            scenario.tableCalls.push({
              table,
              operation: "select",
              payload: columns,
              filters: [["user_id", value]],
            });
            return {
              data: {
                role: scenario.role ?? "seller",
                role_switch_in_progress_at: scenario.roleSwitchInProgress
                  ? "2026-06-01T00:00:00Z"
                  : null,
              },
              error: null,
            };
          },
        }),
      }),
      insert: (payload) => ({
        select: (columns) => ({
          single: async () => {
            scenario.tableCalls.push({
              table,
              operation: "insert",
              payload: { payload, columns },
            });
            if (scenario.insertError) {
              return { data: null, error: { message: scenario.insertError } };
            }
            return { data: { id: "fire-1" }, error: null };
          },
        }),
      }),
      delete: () => ({
        eq: (firstColumn, firstValue) => ({
          eq: async (secondColumn, secondValue) => {
            scenario.tableCalls.push({
              table,
              operation: "delete",
              filters: [[firstColumn, firstValue], [secondColumn, secondValue]],
            });
            if (scenario.deleteError) {
              return { error: { message: scenario.deleteError } };
            }
            return { error: null };
          },
        }),
      }),
    }),
  };
}
