function filteredResult(table, operation, payload, result) {
  const filters = [];
  const chain = {
    eq: (column, value) => {
      filters.push([column, value]);
      return chain;
    },
    select: (columns) => ({
      single: async () => {
        globalThis.__projectManagementScenario.calls.push({
          name: operation,
          args: { table, payload, filters, columns },
        });
        return result;
      },
    }),
    then: (resolve) => {
      globalThis.__projectManagementScenario.calls.push({
        name: operation,
        args: { table, payload, filters },
      });
      resolve({ error: null });
    },
  };
  return chain;
}

export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__projectManagementScenario;
  return {
    auth: {
      getUser: async (token) => {
        scenario.calls.push({ name: "getUser", args: { token } });
        return {
          data: {
            user: scenario.user ??
              {
                id: "11111111-1111-4111-8111-111111111111",
                email: "dev@test.local",
              },
          },
          error: null,
        };
      },
    },
    rpc: async (name, args) => {
      scenario.calls.push({ name: "rpc", args: { name, args } });
      if (name === "get_project_management_context_for_service") {
        return {
          data: scenario.projectAuthorized === false ? [] : [{
            id: args.p_project_id,
            owner_id: scenario.projectOwnerId ??
              "11111111-1111-4111-8111-111111111111",
            organization_id: scenario.projectOrganizationId ?? null,
          }],
          error: null,
        };
      }
      if (name === "delete_project_for_service") {
        return {
          data: scenario.deleteProjectError ? null : true,
          error: scenario.deleteProjectError
            ? { message: scenario.deleteProjectError }
            : null,
        };
      }
      if (name === "attach_project_media_for_service") {
        return {
          data: {
            id: "22222222-2222-4222-8222-222222222222",
            project_id: args.p_project_id,
            ...args.p_media,
          },
          error: null,
        };
      }
      if (name === "update_listing_cover_with_storage_for_service") {
        return {
          data: {
            id: args.p_listing_id,
            project_id: args.p_project_id,
            cover_image_url: args.p_cover_image_url,
          },
          error: null,
        };
      }
      if (
        name === "stage_storage_cleanup_jobs_for_service" ||
        name === "settle_storage_cleanup_jobs_for_service"
      ) {
        const lifecycleCallNumber = scenario.calls.filter((call) =>
          call.name === "rpc" &&
          [
            "stage_storage_cleanup_jobs_for_service",
            "settle_storage_cleanup_jobs_for_service",
          ].includes(call.args?.name)
        ).length;
        const errorMessage =
          scenario.storageCleanupUpsertErrors?.[lifecycleCallNumber - 1] ??
            null;
        return {
          data: errorMessage ? null : args.p_objects.length,
          error: errorMessage ? { message: errorMessage } : null,
        };
      }
      return { data: null, error: { message: "unexpected_rpc" } };
    },
    from: (table) => ({
      select: (columns) => ({
        eq: (column, value) => {
          const result = table === "project_media"
            ? {
              data: (scenario.projectMediaUrls ?? []).map((url) => ({ url })),
              error: scenario.projectMediaLookupError
                ? { message: scenario.projectMediaLookupError }
                : null,
            }
            : null;
          return {
            then: (resolve) => {
              if (result) {
                scenario.calls.push({
                  name: "select",
                  args: { table, columns, filters: [[column, value]] },
                });
                resolve(result);
                return;
              }
              resolve({ data: [], error: null });
            },
            maybeSingle: async () => {
              scenario.calls.push({
                name: "select",
                args: { table, columns, filters: [[column, value]] },
              });
              if (table === "profiles") {
                return {
                  data: {
                    role: scenario.profileRole ?? "developer",
                    role_switch_in_progress_at: scenario.roleSwitchInProgress
                      ? "2026-06-01T00:00:00Z"
                      : null,
                  },
                  error: null,
                };
              }
              if (table === "project_units") {
                return {
                  data: scenario.existingUnit === null
                    ? null
                    : scenario.existingUnit ?? {
                      id: value,
                      project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                      price: 250000,
                      internal_sqm: 100,
                      price_per_sqm: 2500,
                    },
                  error: null,
                };
              }
              if (table === "projects") {
                return {
                  data: scenario.projectExistsAfterDeleteError === false
                    ? null
                    : { id: value },
                  error: scenario.projectReconciliationError
                    ? { message: scenario.projectReconciliationError }
                    : null,
                };
              }
              return { data: null, error: null };
            },
          };
        },
      }),
      upsert: async (payload, options) => {
        const previousUpserts =
          scenario.calls.filter((call) =>
            call.name === "upsert" &&
            (call.args as { table?: string } | undefined)?.table === table
          ).length;
        scenario.calls.push({
          name: "upsert",
          args: { table, payload, options },
        });
        const errorMessage =
          scenario.storageCleanupUpsertErrors?.[previousUpserts] ?? null;
        return {
          data: null,
          error: errorMessage ? { message: errorMessage } : null,
        };
      },
      insert: (payload) => ({
        select: (columns) => ({
          single: async () => {
            scenario.calls.push({
              name: "insert",
              args: { table, payload, columns },
            });
            return {
              data: { id: "22222222-2222-4222-8222-222222222222", ...payload },
              error: null,
            };
          },
        }),
      }),
      update: (payload) =>
        filteredResult(table, "update", payload, {
          data: { id: "33333333-3333-4333-8333-333333333333", ...payload },
          error: null,
        }),
      delete: () => filteredResult(table, "delete", null, { error: null }),
    }),
  };
}
