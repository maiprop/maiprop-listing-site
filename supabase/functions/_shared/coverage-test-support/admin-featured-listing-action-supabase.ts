export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__adminFeaturedListingScenario;
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
            user: scenario.user ??
              { id: "admin-user", email: "admin@test.local" },
          },
          error: null,
        };
      },
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (scenario.rpcError) {
        return { data: null, error: { message: scenario.rpcError } };
      }
      return { data: null, error: null };
    },
    from: (table: string) => {
      scenario.calls.push({ name: "from", args: { table } });
      if (table === "profiles") {
        return {
          select: (columns: string) => {
            scenario.calls.push({ name: "profileSelect", args: { columns } });
            return {
              eq: (column: string, value: string) => {
                scenario.calls.push({
                  name: "profileEq",
                  args: { column, value },
                });
                return {
                  single: async () => {
                    scenario.calls.push({ name: "profileSingle" });
                    if (scenario.profileError) {
                      return {
                        data: null,
                        error: { message: scenario.profileError },
                      };
                    }
                    return {
                      data: scenario.profile ??
                        { role: "admin", is_platform_admin: false },
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error("Unexpected table " + table);
    },
  };
}
