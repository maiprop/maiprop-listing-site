// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
const chain = (table, scenario, extra = {}) => ({
  eq: (column, value) => {
    scenario.calls.push({ name: "eq", args: { table, column, value } });
    return chain(table, scenario, extra);
  },
  not: (column, operator, value) => {
    scenario.calls.push({
      name: "not",
      args: { table, column, operator, value },
    });
    return chain(table, scenario, extra);
  },
  maybeSingle: async () =>
    scenario.profileFound === false
      ? { data: null, error: null }
      : { data: { id: "22222222-2222-4222-8222-222222222222" }, error: null },
  ...extra,
});

export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__saveProfessionalOnboardingScenario;
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
      select: (columns) => {
        scenario.calls.push({ name: "select", args: { table, columns } });
        return chain(table, scenario);
      },
      update: (payload) => {
        scenario.calls.push({ name: "update", args: { table, payload } });
        return chain(table, scenario, {
          select: (columns) => {
            scenario.calls.push({ name: "select", args: { table, columns } });
            return chain(table, scenario);
          },
        });
      },
      upsert: (rows, options) => {
        scenario.calls.push({ name: "upsert", args: { table, rows, options } });
        return Promise.resolve(
          scenario.operationError
            ? { data: null, error: { message: scenario.operationError } }
            : { data: null, error: null },
        );
      },
      delete: () => {
        scenario.calls.push({ name: "delete", args: { table } });
        return chain(table, scenario, {
          then: (resolve) =>
            resolve(
              scenario.operationError
                ? { data: null, error: { message: scenario.operationError } }
                : { data: null, error: null },
            ),
        });
      },
      insert: (rows) => {
        scenario.calls.push({ name: "insert", args: { table, rows } });
        return Promise.resolve(
          scenario.operationError
            ? { data: null, error: { message: scenario.operationError } }
            : { data: null, error: null },
        );
      },
    }),
  };
}
