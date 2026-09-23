// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__completeOnboardingScenario;
  return {
    auth: {
      getUser: async (token) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        return {
          data: {
            user: {
              id: "11111111-1111-4111-8111-111111111111",
              email: "user@test.local",
            },
          },
          error: null,
        };
      },
    },
    from: (table) => ({
      upsert: (row, options) => {
        scenario.calls.push({ name: "upsert", args: { table, row, options } });
        return {
          select: (columns) => {
            scenario.calls.push({ name: "select", args: { table, columns } });
            return {
              single: async () =>
                scenario.professionalUpsertError
                  ? {
                    data: null,
                    error: { message: scenario.professionalUpsertError },
                  }
                  : {
                    data: { id: "22222222-2222-4222-8222-222222222222" },
                    error: null,
                  },
            };
          },
        };
      },
    }),
    rpc: async (name, args) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      return scenario.rpcError
        ? { data: null, error: { message: scenario.rpcError } }
        : { data: null, error: null };
    },
  };
}
