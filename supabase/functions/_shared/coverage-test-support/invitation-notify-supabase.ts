export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__invitationNotifyScenario;
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
              { id: "admin-user", email: "admin@test.local" },
          },
          error: null,
        };
      },
    },
    from: (table) => {
      scenario.calls.push({ name: "from", args: { table } });
      if (table !== "profiles") throw new Error("Unexpected table " + table);
      return {
        select: (columns) => {
          scenario.calls.push({ name: "profileSelect", args: { columns } });
          return {
            eq: (column, value) => {
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
    },
  };
}
