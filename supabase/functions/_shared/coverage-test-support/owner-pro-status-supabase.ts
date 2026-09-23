type Scenario = typeof globalThis.__ownerProStatusScenario;

class QueryBuilder {
  private filters: Array<{ column: string; value: unknown }> = [];

  constructor(private table: string, private scenario: Scenario) {}

  select(columns: string) {
    this.scenario.calls.push({
      name: "select",
      args: { table: this.table, columns },
    });
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    this.scenario.calls.push({
      name: "eq",
      args: { table: this.table, column, value },
    });
    return this;
  }

  async maybeSingle() {
    this.scenario.calls.push({
      name: "maybeSingle",
      args: { table: this.table, filters: this.filters },
    });
    if (this.table !== "listings") return { data: null, error: null };

    const listing = this.scenario.listing ?? null;
    if (!listing) return { data: null, error: null };

    const matches = this.filters.every(({ column, value }) =>
      listing[column as keyof typeof listing] === value
    );
    return {
      data: matches ? { owner_id: listing.owner_id } : null,
      error: null,
    };
  }
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__ownerProStatusScenario;
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
              { id: "caller-user", email: "caller@test.local" },
          },
          error: null,
        };
      },
    },
    from: (table: string) => {
      scenario.calls.push({ name: "from", args: { table } });
      return new QueryBuilder(table, scenario);
    },
    rpc: async (name: string, args: unknown) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      return { data: scenario.ownerIsPro === true, error: null };
    },
  };
}
