function resolved(value) {
  return { then: (resolve) => resolve(value) };
}

function filterResult(table, operation, payload, result) {
  const filters = [];
  const chain = {
    eq: (column, value) => {
      filters.push([column, value]);
      return chain;
    },
    in: (column, values) => {
      filters.push([column, values]);
      return chain;
    },
    neq: (column, value) => {
      filters.push([column, { neq: value }]);
      return chain;
    },
    then: (resolve) => {
      globalThis.__createNewBuildingScenario.calls.push({
        name: operation,
        args: { table, payload, filters },
      });
      return Promise.resolve(resolve(result));
    },
  };
  return chain;
}

export function createClient(..._args: unknown[]) {
  const scenario = globalThis.__createNewBuildingScenario;
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
      if (name === "stage_storage_cleanup_jobs_for_service") {
        return {
          data: scenario.cleanupStageError ? null : args.p_objects.length,
          error: scenario.cleanupStageError
            ? { message: scenario.cleanupStageError }
            : null,
        };
      }
      if (name !== "create_new_building_listing_with_storage_for_service") {
        return { data: null, error: { message: "unexpected_rpc" } };
      }
      const rpcCallNumber =
        scenario.calls.filter((call) =>
          call.name === "rpc" &&
          call.args?.name ===
            "create_new_building_listing_with_storage_for_service"
        ).length;
      const failure = scenario.rpcFailures?.[rpcCallNumber - 1];
      if (failure?.type === "throw") {
        throw new TypeError(failure.message);
      }
      if (failure?.type === "error") {
        return {
          data: null,
          error: {
            message: failure.message,
            code: failure.code ?? "",
            status: failure.status ?? 0,
          },
        };
      }
      return scenario.rpcError
        ? { data: null, error: { message: scenario.rpcError, code: "22023" } }
        : {
          data: {
            listingId: "33333333-3333-4333-8333-333333333333",
            projectId: args.p_project.id,
            idempotent: scenario.rpcIdempotent === true ||
              scenario.rpcIdempotentOnCall === rpcCallNumber,
          },
          error: null,
        };
    },
    storage: {
      from: (bucket) => ({
        getPublicUrl: (path) => ({
          data: {
            publicUrl:
              `https://test-project.supabase.co/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
        list: async (folder, options) => {
          const fileName = options?.search;
          const path = folder ? `${folder}/${fileName}` : fileName;
          scenario.calls.push({
            name: "storageList",
            args: { bucket, folder, options },
          });
          return {
            data: scenario.missingStoragePaths?.includes(path)
              ? []
              : [{ name: fileName }],
            error: null,
          };
        },
        remove: async (paths) => {
          scenario.calls.push({
            name: "storageRemove",
            args: { bucket, paths },
          });
          scenario.removedStorage?.push({ bucket, paths });
          return {
            data: null,
            error: scenario.storageRemoveError
              ? { message: scenario.storageRemoveError }
              : null,
          };
        },
      }),
    },
    from: (table) => ({
      upsert: async (payload, options) => {
        scenario.calls.push({
          name: "upsert",
          args: { table, payload, options },
        });
        return { data: null, error: null };
      },
      select: (columns) => ({
        eq: (column, value) => {
          if (table === "project_media") {
            scenario.calls.push({
              name: "select",
              args: { table, columns, filters: [[column, value]] },
            });
            return Promise.resolve({
              data: (scenario.committedProjectMediaUrls ?? []).map((url) => ({
                url,
              })),
              error: scenario.projectMediaLookupError
                ? { message: scenario.projectMediaLookupError }
                : null,
            });
          }
          if (table === "listing_images") {
            scenario.calls.push({
              name: "select",
              args: { table, columns, filters: [[column, value]] },
            });
            return Promise.resolve({
              data: (scenario.committedListingImageUrls ?? []).map((url) => ({
                url,
              })),
              error: scenario.listingImagesLookupError
                ? { message: scenario.listingImagesLookupError }
                : null,
            });
          }
          return {
            maybeSingle: async () => {
              scenario.calls.push({
                name: "select",
                args: { table, columns, filters: [[column, value]] },
              });
              if (table === "listings") {
                return {
                  data: scenario.committedListing ?? null,
                  error: scenario.listingLookupError
                    ? { message: scenario.listingLookupError }
                    : null,
                };
              }
              return {
                data: {
                  role: scenario.profileRole ?? "developer",
                  role_switch_in_progress_at: scenario.roleSwitchInProgress
                    ? "2026-06-01T00:00:00Z"
                    : null,
                },
                error: null,
              };
            },
          };
        },
      }),
      insert: (payload) => {
        if (table === "project_units") {
          return {
            select: (columns) => ({
              single: async () => {
                scenario.calls.push({
                  name: "insert",
                  args: { table, payload, columns },
                });
                return {
                  data: { id: "22222222-2222-4222-8222-222222222222" },
                  error: null,
                };
              },
            }),
          };
        }
        if (table === "listings") {
          return {
            select: (columns) => ({
              single: async () => {
                scenario.calls.push({
                  name: "insert",
                  args: { table, payload, columns },
                });
                return {
                  data: { id: "33333333-3333-4333-8333-333333333333" },
                  error: null,
                };
              },
            }),
          };
        }
        scenario.calls.push({ name: "insert", args: { table, payload } });
        return resolved({ error: null });
      },
      update: (payload) =>
        filterResult(table, "update", payload, { error: null }),
      delete: () => filterResult(table, "delete", null, { error: null }),
    }),
  };
}

export type SupabaseClient = ReturnType<typeof createClient>;
