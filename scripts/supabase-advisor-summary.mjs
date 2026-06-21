export function computeAdvisorActionability({ failingLintCount = 0, advisorDebt = {} } = {}) {
  const unknownCount = Number(advisorDebt.unknown_count ?? 0);
  const failingCount = Number(failingLintCount ?? 0);
  const acceptedCount = Number(advisorDebt.accepted_count ?? 0);
  const reviewCount = Number(advisorDebt.review_count ?? 0);

  return {
    actionable_lint_count: failingCount + unknownCount,
    known_debt_count: acceptedCount + reviewCount,
  };
}

export function buildAdvisorStepSummary({
  projectRef,
  results = [],
  failingLintCount = 0,
  advisorDebt = {},
  unusedIndexReview = { totals: {} },
  transientAdvisorUnavailable = [],
} = {}) {
  const actionability = computeAdvisorActionability({ failingLintCount, advisorDebt });
  const rows = results
    .map((result) => {
      const status = result.unavailable ? " (transient unavailable)" : "";
      return `| ${result.category}${status} | ${result.lint_count} |`;
    })
    .join("\n");
  const unavailableRows = transientAdvisorUnavailable
    .map((result) => `| ${result.category} | ${result.http_status} | ${result.reason} |`)
    .join("\n");
  const releaseGateLine = actionability.actionable_lint_count === 0
    ? "The release gate is clear: remaining Advisor output is classified as accepted or review-only debt."
    : "The release gate is blocked or requires owner triage before release.";
  const totals = unusedIndexReview.totals ?? {};

  return [
    "## Supabase Advisor",
    "",
    `Project: \`${projectRef}\``,
    "",
    "| Category | Lints |",
    "|---|---:|",
    rows,
    "",
    `Failing severity lints: ${failingLintCount}`,
    `Actionable advisor items: ${actionability.actionable_lint_count}`,
    `Known review/accepted advisor debt: ${actionability.known_debt_count}`,
    "",
    releaseGateLine,
    "",
    "### Advisor Debt",
    "",
    "| Status | Count |",
    "|---|---:|",
    `| Accepted | ${advisorDebt.accepted_count ?? 0} |`,
    `| Needs review | ${advisorDebt.review_count ?? 0} |`,
    `| Unknown | ${advisorDebt.unknown_count ?? 0} |`,
    "",
    "### Unused Index Review",
    "",
    "| Status | Count |",
    "|---|---:|",
    `| Advisor lints | ${totals.unused_index_lints ?? 0} |`,
    `| Mapped to pg_stat_user_indexes | ${totals.mapped_to_stats ?? 0} |`,
    `| With scans | ${totals.with_scans ?? 0} |`,
    `| Zero-scan candidates needing extra review | ${totals.zero_scan_candidates ?? 0} |`,
    `| Managed-schema indexes, do not drop from advisor alone | ${totals.managed_schema_indexes ?? 0} |`,
    `| Protected constraint/unique indexes, do not drop | ${totals.protected_indexes ?? 0} |`,
    `| Public write-path candidates needing query-plan review | ${totals.write_path_candidates ?? 0} |`,
    `| Needs stats snapshot | ${totals.needs_stats_snapshot ?? 0} |`,
    `| Needs manual mapping | ${totals.needs_manual_mapping ?? 0} |`,
    "",
    ...(transientAdvisorUnavailable.length
      ? [
          "### Transient Advisor Unavailability",
          "",
          "Supabase Management API advisor checks timed out. This is recorded as release evidence and does not suppress real advisor findings when the API responds.",
          "",
          "| Category | HTTP status | Reason |",
          "|---|---:|---|",
          unavailableRows,
          "",
        ]
      : []),
  ].join("\n");
}
