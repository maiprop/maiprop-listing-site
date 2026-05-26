export type SupabaseDbError = { message: string };

export type SupabaseQueryResponse<T = unknown> = {
  data: T;
  error: SupabaseDbError | null;
};

export type SupabaseQuery<T = unknown> = PromiseLike<SupabaseQueryResponse<T>> & {
  contains(column: string, value: unknown): SupabaseQuery<T>;
  eq(column: string, value: unknown): SupabaseQuery<T>;
  insert(value: Record<string, unknown> | Record<string, unknown>[]): SupabaseQuery<T>;
  maybeSingle(): Promise<SupabaseQueryResponse<T | null>>;
  select(columns: string): SupabaseQuery<T>;
  single(): Promise<SupabaseQueryResponse<T>>;
  update(value: Record<string, unknown>): SupabaseQuery<T>;
};

export type LooseSupabaseClient = {
  from(table: string): SupabaseQuery;
};

export type SupabaseAuthAdminClient = LooseSupabaseClient & {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
};

export type AdminProfile = {
  role?: string | null;
};

export function asLooseSupabaseClient(client: unknown): LooseSupabaseClient {
  return client as LooseSupabaseClient;
}

export function asSupabaseAuthAdminClient(client: unknown): SupabaseAuthAdminClient {
  return client as SupabaseAuthAdminClient;
}
