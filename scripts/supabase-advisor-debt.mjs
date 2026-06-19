import { readFile } from "node:fs/promises";

const DEFAULT_POLICY_PATH = new URL("./supabase-advisor-debt-policy.json", import.meta.url);

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  const normalized = normalize(value);
  if (normalized === "true" || normalized === "t" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "f" || normalized === "no") return false;
  return false;
}

function matchesRule(lint, rule) {
  const match = rule?.match ?? {};
  if (match.name && normalize(lint.name) !== normalize(match.name)) return false;
  if (match.level && normalize(lint.level) !== normalize(match.level)) return false;
  if (match.cache_key_contains && !normalize(lint.cache_key).includes(normalize(match.cache_key_contains))) {
    return false;
  }
  return Boolean(match.name || match.level || match.cache_key_contains);
}

function extractIndexName(lint) {
  const metadata = lint?.metadata ?? {};
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const direct = metadata.index_name ?? metadata.indexrelname ?? metadata.index;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim().replace(/^"|"$/g, "");
  }

  const cacheKey = String(lint?.cache_key ?? "");
  const tableName = extractTableName(lint);
  const schemaName = typeof metadata.schema === "string" && metadata.schema.trim()
    ? metadata.schema.trim()
    : "public";
  if (cacheKey && tableName) {
    const prefix = `unused_index_${schemaName}_${tableName}_`;
    if (cacheKey.startsWith(prefix)) {
      return cacheKey.slice(prefix.length).trim() || null;
    }
  }

  return null;
}

function extractSchemaName(lint) {
  const metadata = lint?.metadata ?? {};
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return "public";
  }

  const direct = metadata.schema_name ?? metadata.schemaname ?? metadata.schema;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim().replace(/^"|"$/g, "");
  }

  const cacheKey = String(lint?.cache_key ?? "");
  if (cacheKey.startsWith("unused_index_")) {
    const [, schemaName] = cacheKey.match(/^unused_index_([^_]+)_/) ?? [];
    if (schemaName) return schemaName;
  }

  return "public";
}

function extractTableName(lint) {
  const metadata = lint?.metadata ?? {};
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const direct = metadata.table_name ?? metadata.relname ?? metadata.table ?? metadata.relation ?? metadata.name;
  return typeof direct === "string" && direct.trim() ? direct.trim().replace(/^"|"$/g, "") : null;
}

export async function loadAdvisorDebtPolicy(path = DEFAULT_POLICY_PATH) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

export function flattenAdvisorLints(results = []) {
  return results.flatMap((result) =>
    (result.lints ?? []).map((lint) => ({
      category: result.category,
      name: lint.name ?? "unnamed_lint",
      title: lint.title ?? lint.name ?? "Unnamed lint",
      level: lint.level ?? "UNKNOWN",
      cache_key: lint.cache_key ?? null,
      metadata: lint.metadata ?? null,
    })),
  );
}

export function classifyAdvisorDebt(summary, policy) {
  const acceptedRules = policy?.accepted ?? [];
  const reviewRules = policy?.review ?? [];
  const buckets = {
    accepted: [],
    review: [],
    unknown: [],
  };

  for (const lint of flattenAdvisorLints(summary?.results ?? [])) {
    const accepted = acceptedRules.find((rule) => matchesRule(lint, rule));
    if (accepted) {
      buckets.accepted.push({ ...lint, debt_status: "accepted", policy: accepted });
      continue;
    }

    const review = reviewRules.find((rule) => matchesRule(lint, rule));
    if (review) {
      buckets.review.push({ ...lint, debt_status: "review", policy: review });
      continue;
    }

    buckets.unknown.push({ ...lint, debt_status: "unknown" });
  }

  return {
    accepted_count: buckets.accepted.length,
    review_count: buckets.review.length,
    unknown_count: buckets.unknown.length,
    by_status: {
      accepted: buckets.accepted.length,
      review: buckets.review.length,
      unknown: buckets.unknown.length,
    },
    items: buckets,
  };
}

function missingPolicyFields(item) {
  const policy = item.policy ?? {};
  return ["owner", "reason", "next_action", "review_cadence"]
    .filter((field) => !String(policy[field] ?? "").trim());
}

export function assertAdvisorDebtIsActionable(debt, options = {}) {
  const {
    failOnUnknown = true,
    requirePolicyMetadata = true,
  } = options;
  const errors = [];

  if (failOnUnknown && debt?.unknown_count > 0) {
    const names = (debt.items?.unknown ?? [])
      .map((item) => `${item.name}${item.cache_key ? ` (${item.cache_key})` : ""}`)
      .join(", ");
    errors.push(`Unknown Supabase advisor lint(s) require classification: ${names}`);
  }

  if (requirePolicyMetadata) {
    for (const bucket of ["accepted", "review"]) {
      for (const item of debt.items?.[bucket] ?? []) {
        const missing = missingPolicyFields(item);
        if (missing.length > 0) {
          errors.push(
            `Advisor policy for ${item.name} is missing ${missing.join(", ")}.`,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}

export function buildUnusedIndexReview(summary, indexStatsRows = []) {
  const managedSchemas = new Set(["auth", "storage", "realtime", "pgmq", "cron", "supabase_migrations"]);
  const normalizeStatsRow = (row) => {
    const schemaName = row.schemaname ?? row.schema_name ?? row.schema ?? "public";
    const indexName = row.indexrelname ?? row.index_name ?? row.index ?? null;
    return {
      schema_name: schemaName,
      table_name: row.relname ?? row.table_name ?? row.table ?? null,
      index_name: indexName,
      idx_scan: numberOrNull(row.idx_scan),
      idx_tup_read: numberOrNull(row.idx_tup_read),
      idx_tup_fetch: numberOrNull(row.idx_tup_fetch),
      index_bytes: numberOrNull(row.index_bytes),
      table_writes: numberOrNull(row.table_writes),
      table_seq_scan: numberOrNull(row.table_seq_scan ?? row.seq_scan),
      table_live_rows: numberOrNull(row.table_live_rows ?? row.n_live_tup),
      is_primary: booleanValue(row.is_primary),
      is_unique: booleanValue(row.is_unique),
      is_exclusion: booleanValue(row.is_exclusion),
      has_constraint: booleanValue(row.has_constraint),
      constraint_type: row.constraint_type ?? null,
      indexdef: row.indexdef ?? null,
    };
  };

  const statsRows = indexStatsRows
    .filter((row) => row && typeof row === "object")
    .map(normalizeStatsRow)
    .filter((row) => row.index_name);

  const statsByQualifiedIndex = new Map(
    statsRows.map((row) => [
      `${normalize(row.schema_name)}.${normalize(row.index_name)}`,
      row,
    ]),
  );
  const statsByIndex = new Map();
  for (const row of statsRows) {
    const key = normalize(row.index_name);
    if (!statsByIndex.has(key)) statsByIndex.set(key, row);
  }

  const unusedIndexLints = flattenAdvisorLints(summary?.results ?? [])
    .filter((lint) => normalize(lint.name) === "unused_index");

  const items = unusedIndexLints.map((lint) => {
    const indexName = extractIndexName(lint);
    const tableName = extractTableName(lint);
    const lintSchemaName = extractSchemaName(lint);
    const stats = indexName
      ? statsByQualifiedIndex.get(`${normalize(lintSchemaName)}.${normalize(indexName)}`) ??
        statsByIndex.get(normalize(indexName)) ??
        null
      : null;
    const schemaName = stats?.schema_name ?? lintSchemaName;
    const idxScan = stats?.idx_scan ?? null;
    const isManagedSchema = managedSchemas.has(normalize(schemaName));
    const isProtectedIndex = Boolean(
      stats && (
        stats.is_primary ||
        stats.is_unique ||
        stats.is_exclusion ||
        stats.has_constraint ||
        stats.constraint_type
      ),
    );
    const tableWrites = stats?.table_writes ?? null;
    const writePathCandidate = Boolean(
      normalize(schemaName) === "public" &&
      !isProtectedIndex &&
      idxScan === 0 &&
      (tableWrites ?? 0) > 0
    );
    let reviewStatus = "needs_manual_mapping";

    if (indexName && !stats) {
      reviewStatus = "needs_pg_stat_user_indexes_snapshot";
    } else if (isManagedSchema) {
      reviewStatus = "managed_schema_do_not_drop_from_advisor_only";
    } else if (isProtectedIndex) {
      reviewStatus = "protected_index_do_not_drop";
    } else if (idxScan !== null && idxScan > 0) {
      reviewStatus = "keep_or_recheck_usage";
    } else if (idxScan === 0) {
      reviewStatus = "candidate_needs_pg_stat_statements_and_release_review";
    }

    return {
      category: lint.category,
      title: lint.title,
      level: lint.level,
      cache_key: lint.cache_key,
      schema_name: schemaName,
      index_name: indexName,
      table_name: tableName ?? stats?.table_name ?? null,
      idx_scan: idxScan,
      idx_tup_read: stats?.idx_tup_read ?? null,
      idx_tup_fetch: stats?.idx_tup_fetch ?? null,
      index_bytes: stats?.index_bytes ?? null,
      table_writes: tableWrites,
      table_seq_scan: stats?.table_seq_scan ?? null,
      table_live_rows: stats?.table_live_rows ?? null,
      is_managed_schema: isManagedSchema,
      is_protected_index: isProtectedIndex,
      is_primary: stats?.is_primary ?? false,
      is_unique: stats?.is_unique ?? false,
      is_exclusion: stats?.is_exclusion ?? false,
      has_constraint: stats?.has_constraint ?? false,
      constraint_type: stats?.constraint_type ?? null,
      write_path_candidate: writePathCandidate,
      requires_query_plan_review: reviewStatus === "candidate_needs_pg_stat_statements_and_release_review",
      minimum_observation_days: 30,
      drop_allowed: false,
      review_status: reviewStatus,
    };
  });

  const byReviewStatus = items.reduce((acc, item) => {
    acc[item.review_status] = (acc[item.review_status] ?? 0) + 1;
    return acc;
  }, {});
  const bySchema = items.reduce((acc, item) => {
    const schemaName = item.schema_name ?? "unknown";
    acc[schemaName] = (acc[schemaName] ?? 0) + 1;
    return acc;
  }, {});

  const totals = {
    unused_index_lints: items.length,
    mapped_to_stats: items.filter((item) => item.idx_scan !== null).length,
    with_scans: items.filter((item) => item.idx_scan !== null && item.idx_scan > 0).length,
    zero_scan_candidates: items.filter((item) =>
      item.review_status === "candidate_needs_pg_stat_statements_and_release_review"
    ).length,
    managed_schema_indexes: items.filter((item) => item.review_status === "managed_schema_do_not_drop_from_advisor_only").length,
    protected_indexes: items.filter((item) => item.review_status === "protected_index_do_not_drop").length,
    write_path_candidates: items.filter((item) => item.write_path_candidate).length,
    needs_stats_snapshot: items.filter((item) => item.review_status === "needs_pg_stat_user_indexes_snapshot").length,
    needs_manual_mapping: items.filter((item) => item.review_status === "needs_manual_mapping").length,
  };

  return { totals, by_review_status: byReviewStatus, by_schema: bySchema, items };
}
