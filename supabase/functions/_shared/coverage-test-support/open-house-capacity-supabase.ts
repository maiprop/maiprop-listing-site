export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__openHouseCapacityScenario;
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
    rpc: async (name: string, args: unknown) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (scenario.rpcError) {
        return { data: null, error: { message: scenario.rpcError } };
      }
      return {
        data: scenario.capacity ?? [{
          listing_id: "listing-1",
          active_total: 1,
          max_total_visitors: 4,
          slot_counts: [],
        }],
        error: null,
      };
    },
  };
}
