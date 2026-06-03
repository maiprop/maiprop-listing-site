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

  const direct = metadata.index_name ?? metadata.indexrelname ?? metadata.index ?? metadata.name;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim().replace(/^"|"$/g, "");
  }

  return null;
}

function extractTableName(lint) {
  const metadata = lint?.metadata ?? {};
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const direct = metadata.table_name ?? metadata.relname ?? metadata.table ?? metadata.relation;
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

export function buildUnusedIndexReview(summary, indexStatsRows = []) {
  const statsByIndex = new Map(
    indexStatsRows
      .filter((row) => row && typeof row === "object")
      .map((row) => [
        normalize(row.indexrelname ?? row.index_name ?? row.index),
        {
          table_name: row.relname ?? row.table_name ?? row.table ?? null,
          index_name: row.indexrelname ?? row.index_name ?? row.index ?? null,
          idx_scan: numberOrNull(row.idx_scan),
          idx_tup_read: numberOrNull(row.idx_tup_read),
          idx_tup_fetch: numberOrNull(row.idx_tup_fetch),
        },
      ]),
  );

  const unusedIndexLints = flattenAdvisorLints(summary?.results ?? [])
    .filter((lint) => normalize(lint.name) === "unused_index");

  const items = unusedIndexLints.map((lint) => {
    const indexName = extractIndexName(lint);
    const tableName = extractTableName(lint);
    const stats = indexName ? statsByIndex.get(normalize(indexName)) ?? null : null;
    const idxScan = stats?.idx_scan ?? null;
    let reviewStatus = "needs_manual_mapping";

    if (indexName && !stats) {
      reviewStatus = "needs_pg_stat_user_indexes_snapshot";
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
      index_name: indexName,
      table_name: tableName ?? stats?.table_name ?? null,
      idx_scan: idxScan,
      idx_tup_read: stats?.idx_tup_read ?? null,
      idx_tup_fetch: stats?.idx_tup_fetch ?? null,
      review_status: reviewStatus,
    };
  });

  const totals = {
    unused_index_lints: items.length,
    mapped_to_stats: items.filter((item) => item.idx_scan !== null).length,
    with_scans: items.filter((item) => item.idx_scan !== null && item.idx_scan > 0).length,
    zero_scan_candidates: items.filter((item) => item.idx_scan === 0).length,
    needs_stats_snapshot: items.filter((item) => item.review_status === "needs_pg_stat_user_indexes_snapshot").length,
    needs_manual_mapping: items.filter((item) => item.review_status === "needs_manual_mapping").length,
  };

  return { totals, items };
}
