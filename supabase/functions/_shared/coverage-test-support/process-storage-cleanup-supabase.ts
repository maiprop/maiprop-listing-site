export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__storageCleanupScenario;
  return {
    rpc: async (name, args) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (name === "claim_storage_cleanup_jobs") {
        return { data: scenario.jobs, error: null };
      }
      if (name === "prepare_storage_cleanup_delete") {
        return {
          data: scenario.prepareResults?.[args.p_job_id] ?? "delete",
          error: null,
        };
      }
      return { data: null, error: { message: "unexpected rpc" } };
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          scenario.calls.push({ name: "remove", args: { bucket, paths } });
          if (scenario.providerRemove) {
            return { data: null, error: await scenario.providerRemove(bucket, paths) };
          }
          const failed = paths.some((path) =>
            scenario.removeFailurePaths?.includes(path)
          );
          return {
            data: null,
            error: failed ? { message: "storage unavailable" } : null,
          };
        },
      }),
    },
    from: (table) => ({
      update: (payload) => {
        const filters = [];
        const builder = {
          eq: (column, value) => {
            filters.push({ column, value });
            return builder;
          },
          then: (resolve) => {
            scenario.calls.push({
              name: "update",
              args: { table, payload, filters },
            });
            return Promise.resolve(resolve({ data: null, error: null }));
          },
          select: (_columns) => {
            scenario.calls.push({
              name: "update",
              args: { table, payload, filters },
            });
            const jobId = filters.find((filter) => filter.column === "id")
              ?.value;
            return Promise.resolve({
              data: scenario.lostLeaseJobIds?.includes(jobId)
                ? []
                : [{ id: jobId }],
              error: null,
            });
          },
        };
        return builder;
      },
    }),
  };
}
