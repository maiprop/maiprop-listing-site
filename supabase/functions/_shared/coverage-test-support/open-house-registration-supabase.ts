export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__openHouseRegistrationScenario;
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
        return { data: null, error: scenario.rpcError };
      }
      return {
        data: scenario.registration ??
          { id: "registration-1", status: "pending" },
        error: null,
      };
    },
  };
}
