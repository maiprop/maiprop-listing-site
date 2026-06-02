import { readFile } from "node:fs/promises";

const DEFAULT_POLICY_PATH = new URL("./supabase-advisor-debt-policy.json", import.meta.url);

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
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
