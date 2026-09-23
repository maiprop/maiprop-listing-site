// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__adminReviewInvitationScenario;
  return {
    auth: {
      getUser: async (token) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        return {
          data: {
            user: {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              email: "admin@test.local",
            },
          },
          error: null,
        };
      },
    },
    rpc: async (name, args) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      return scenario.rpcError
        ? { data: null, error: { message: scenario.rpcError } }
        : {
          data: scenario.rpcData ?? { subscription_status: "pending_payment" },
          error: null,
        };
    },
  };
}
