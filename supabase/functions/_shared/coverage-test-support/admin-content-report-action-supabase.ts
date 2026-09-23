export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__adminContentReportScenario;
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
            user: scenario.user ?? { id: "admin-1", email: "admin@test.local" },
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
        data: scenario.rpcData ?? { id: "report-1", status: "resolved" },
        error: null,
      };
    },
  };
}
