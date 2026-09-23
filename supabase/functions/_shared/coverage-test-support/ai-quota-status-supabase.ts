export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__aiQuotaStatusScenario;
  return {
    rpc: async (name: string, args: unknown) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (scenario.rpcError) {
        return { data: null, error: { message: scenario.rpcError } };
      }
      const buckets = typeof args === "object" && args &&
          Array.isArray((args as Record<string, unknown>).p_buckets)
        ? (args as Record<string, unknown>).p_buckets as string[]
        : [];
      return {
        data: Object.fromEntries(buckets.map((bucket) => [
          bucket,
          scenario.quotas?.[bucket] ?? scenario.quota ??
            { allowed: true, reason: null, used: 1, limit: 5 },
        ])),
        error: null,
      };
    },
  };
}
