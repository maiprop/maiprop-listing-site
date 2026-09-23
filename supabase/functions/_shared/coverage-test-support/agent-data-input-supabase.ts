type Scenario = typeof globalThis.__agentDataInputScenario;

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function thenable<T>(value: T) {
  return {
    then: (
      resolve: (value: T) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(value).then(resolve, reject),
  };
}

class QueryBuilder {
  constructor(private table: string, private scenario: Scenario) {}

  select(columns: string) {
    this.scenario.calls.push({
      name: "select",
      args: { table: this.table, columns },
    });
    return this;
  }

  eq(column: string, value: unknown) {
    this.scenario.calls.push({
      name: "eq",
      args: { table: this.table, column, value },
    });
    return this;
  }

  order(column: string, options: unknown) {
    this.scenario.calls.push({
      name: "order",
      args: { table: this.table, column, options },
    });
    return this;
  }

  limit(count: number) {
    this.scenario.calls.push({
      name: "limit",
      args: { table: this.table, count },
    });
    return thenable({ data: this.scenario.entriesData ?? [], error: null });
  }

  insert(row: unknown) {
    this.scenario.calls.push({
      name: "insert",
      args: { table: this.table, row },
    });
    return {
      select: (columns: string) => {
        this.scenario.calls.push({
          name: "insert_select",
          args: { table: this.table, columns },
        });
        return {
          single: async () => {
            if (this.scenario.submitError) {
              return {
                data: null,
                error: { message: this.scenario.submitError },
              };
            }
            if ("submitData" in this.scenario) {
              return { data: this.scenario.submitData, error: null };
            }
            return {
              data: {
                id: "input-1",
                status: "pending",
                ...(row as Record<string, unknown>),
              },
              error: null,
            };
          },
        };
      },
    };
  }

  maybeSingle() {
    this.scenario.calls.push({
      name: "maybeSingle",
      args: { table: this.table },
    });
    return Promise.resolve({
      data: this.scenario.profileRole == null
        ? null
        : { role: this.scenario.profileRole },
      error: null,
    });
  }
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__agentDataInputScenario;
  return {
    auth: {
      getUser: async (token: string) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        return {
          data: { user: scenario.user ?? { id: "user-1" } },
          error: null,
        };
      },
    },
    rpc: async (name: string, args: unknown) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (name === "get_agent_data_input_status") {
        return { data: scenario.statusData ?? [], error: null };
      }
      return { data: { id: "input-1", status: "verified" }, error: null };
    },
    from: (table: string) => {
      scenario.calls.push({ name: "from", args: { table } });
      return new QueryBuilder(table, scenario);
    },
  };
}
