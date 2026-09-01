import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  assertAdvisorDebtIsActionable,
  buildUnusedIndexReview,
  classifyAdvisorDebt,
  flattenAdvisorLints,
  loadAdvisorDebtPolicy,
} from "./supabase-advisor-debt.mjs";
import {
  isPerformanceAdvisorInternalSyntaxFailure,
  isTransientAdvisorFailure,
} from "./supabase-advisor-http.mjs";

const policy = {
  accepted: [
    {
      match: { name: "auth_leaked_password_protection" },
      owner: "platform/security",
      reason: "Plan gated",
      next_action: "Upgrade Supabase plan",
    },
  ],
  review: [
    {
      match: { name: "unused_index" },
      owner: "data/platform",
      reason: "Needs telemetry",
      next_action: "Review pg_stat_user_indexes",
    },
  ],
};

describe("supabase advisor debt classification", () => {
  it("classifies the constrained professional projection and service-only RLS tables", async () => {
    const repositoryPolicy = await loadAdvisorDebtPolicy(
      resolve(process.cwd(), "scripts/supabase-advisor-debt-policy.json"),
    );
    const debt = classifyAdvisorDebt(
      {
        results: [
          {
            category: "security",
            lints: [
              {
                name: "anon_security_definer_function_executable",
                level: "WARN",
                cache_key:
                  "anon_security_definer_function_executable_public_get_public_professionals",
              },
              {
                name: "authenticated_security_definer_function_executable",
                level: "WARN",
                cache_key:
                  "authenticated_security_definer_function_executable_public_get_public_professionals",
              },
              {
                name: "rls_enabled_no_policy",
                level: "INFO",
                cache_key:
                  "rls_enabled_no_policy_public_storage_cleanup_jobs",
              },
              {
                name: "rls_enabled_no_policy",
                level: "INFO",
                cache_key:
                  "rls_enabled_no_policy_public_storage_cleanup_invocations",
              },
            ],
          },
        ],
      },
      repositoryPolicy,
    );

    expect(debt.unknown_count).toBe(0);
    expect(debt.review_count + debt.accepted_count).toBe(4);
    expect(() => assertAdvisorDebtIsActionable(debt)).not.toThrow();
  });

  it("classifies the constrained public profile summary RPC for both browser roles", async () => {
    const repositoryPolicy = await loadAdvisorDebtPolicy(
      resolve(process.cwd(), "scripts/supabase-advisor-debt-policy.json"),
    );
    const debt = classifyAdvisorDebt(
      {
        results: [
          {
            category: "security",
            lints: [
              {
                name: "anon_security_definer_function_executable",
                level: "WARN",
                cache_key: "anon_security_definer_function_executable_public_get_public_profile_summaries_p_user_ids uuid[]",
              },
              {
                name: "authenticated_security_definer_function_executable",
                level: "WARN",
                cache_key: "authenticated_security_definer_function_executable_public_get_public_profile_summaries_p_user_ids uuid[]",
              },
            ],
          },
        ],
      },
      repositoryPolicy,
    );

    expect(debt.unknown_count).toBe(0);
    expect(debt.review_count).toBe(2);
    expect(() => assertAdvisorDebtIsActionable(debt)).not.toThrow();
  });

  it("classifies the verified catalogue, auction, and authenticated workflow surfaces", async () => {
    const repositoryPolicy = await loadAdvisorDebtPolicy(
      resolve(process.cwd(), "scripts/supabase-advisor-debt-policy.json"),
    );
    const lints = [
      "rls_enabled_no_policy_private_os_auction_invalid_identity_quarantine",
      "rls_enabled_no_policy_private_public_catalogue_current",
      "rls_enabled_no_policy_private_public_catalogue_publications",
      "rls_enabled_no_policy_private_public_catalogue_versions",
      "anon_security_definer_function_executable_public_get_public_catalogue_homepage_p_publication_id bigint",
      "authenticated_security_definer_function_executable_public_get_public_catalogue_listing_p_publication_id bigint",
      "anon_security_definer_function_executable_public_query_public_catalogue_p_publication_id bigint",
      "authenticated_security_definer_function_executable_public_query_public_catalogue_p_publication_id bigint",
      "anon_security_definer_function_executable_public_get_visible_auction_candidate_envelope_p_limit integer",
      "authenticated_security_definer_function_executable_public_get_visible_auction_candidates_p_limit integer",
      "authenticated_security_definer_function_executable_public_activate_listing_promotion_p_listing_id uuid",
      "authenticated_security_definer_function_executable_public_deactivate_listing_promotion_p_listing_id uuid",
      "authenticated_security_definer_function_executable_public_can_access_video_room_p_topic text",
      "authenticated_security_definer_function_executable_public_get_current_auction_listing_visible_limit_",
      "authenticated_security_definer_function_executable_public_get_manageable_listing_catalogue_page_p_limit integer",
      "authenticated_security_definer_function_executable_public_register_new_building_storage_upload_p_project_id uuid",
    ].map((cacheKey) => ({
      name: cacheKey.startsWith("rls_enabled_no_policy")
        ? "rls_enabled_no_policy"
        : cacheKey.startsWith("anon_")
          ? "anon_security_definer_function_executable"
          : "authenticated_security_definer_function_executable",
      level: cacheKey.startsWith("rls_enabled_no_policy") ? "INFO" : "WARN",
      cache_key: cacheKey,
    }));

    const debt = classifyAdvisorDebt(
      { results: [{ category: "security", lints }] },
      repositoryPolicy,
    );

    expect(debt.unknown_count).toBe(0);
    expect(debt.accepted_count + debt.review_count).toBe(lints.length);
    expect(() => assertAdvisorDebtIsActionable(debt)).not.toThrow();
  });

  it("treats Supabase performance advisor parser crashes as unavailable evidence only for performance", () => {
    const detail = "Failed to run project advisor lints: ERROR: 42601: syntax error at or near storage.buckets";

    expect(isPerformanceAdvisorInternalSyntaxFailure(400, detail, "performance")).toBe(true);
    expect(isPerformanceAdvisorInternalSyntaxFailure(400, detail, "security")).toBe(false);
    expect(isPerformanceAdvisorInternalSyntaxFailure(400, "auth failed", "performance")).toBe(false);
    expect(isTransientAdvisorFailure(400, detail)).toBe(false);
  });

  it("keeps existing transient Supabase advisor transport handling narrow", () => {
    expect(isTransientAdvisorFailure(544, "gateway timeout")).toBe(true);
    expect(isTransientAdvisorFailure(0, "fetch failed (ETIMEDOUT)")).toBe(true);
    expect(isTransientAdvisorFailure(400, "Failed to run project advisor lints")).toBe(false);
  });

  it("flattens advisor lints with category context", () => {
    const lints = flattenAdvisorLints([
      {
        category: "security",
        lints: [{ name: "auth_leaked_password_protection", title: "Leaked Password Protection Disabled", level: "WARN" }],
      },
    ]);

    expect(lints).toEqual([
      expect.objectContaining({
        category: "security",
        name: "auth_leaked_password_protection",
        level: "WARN",
      }),
    ]);
  });

  it("classifies accepted, review, and unknown advisor warnings", () => {
    const debt = classifyAdvisorDebt(
      {
        results: [
          {
            category: "security",
            lints: [{ name: "auth_leaked_password_protection", title: "Leaked Password Protection Disabled", level: "WARN" }],
          },
          {
            category: "performance",
            lints: [
              { name: "unused_index", title: "Unused Index", level: "INFO" },
              { name: "surprising_new_lint", title: "New Advisor", level: "WARN" },
            ],
          },
        ],
      },
      policy,
    );

    expect(debt.by_status).toEqual({ accepted: 1, review: 1, unknown: 1 });
    expect(debt.items.accepted[0].policy.next_action).toContain("Upgrade");
    expect(debt.items.review[0].policy.reason).toBe("Needs telemetry");
    expect(debt.items.unknown[0].name).toBe("surprising_new_lint");
  });

  it("fails actionable debt validation when advisor output contains unknown lints", () => {
    const debt = classifyAdvisorDebt(
      {
        results: [
          {
            category: "performance",
            lints: [{ name: "surprising_new_lint", title: "New Advisor", level: "WARN" }],
          },
        ],
      },
      policy,
    );

    expect(() => assertAdvisorDebtIsActionable(debt)).toThrow(/surprising_new_lint/);
  });

  it("accepts classified debt only when policy records ownership and cadence", () => {
    const debt = classifyAdvisorDebt(
      {
        results: [
          {
            category: "security",
            lints: [{ name: "auth_leaked_password_protection", title: "Leaked Password Protection Disabled", level: "WARN" }],
          },
          {
            category: "performance",
            lints: [{ name: "unused_index", title: "Unused Index", level: "INFO" }],
          },
        ],
      },
      {
        accepted: [
          {
            match: { name: "auth_leaked_password_protection" },
            owner: "platform/security",
            reason: "Plan gated",
            next_action: "Upgrade Supabase plan",
            review_cadence: "monthly",
          },
        ],
        review: [
          {
            match: { name: "unused_index" },
            owner: "data/platform",
            reason: "Needs telemetry",
            next_action: "Review pg_stat_user_indexes",
            review_cadence: "weekly",
          },
        ],
      },
    );

    expect(() => assertAdvisorDebtIsActionable(debt)).not.toThrow();
  });
});

describe("unused index telemetry review", () => {
  it("marks advisor-only unused indexes as requiring a pg_stat_user_indexes snapshot", () => {
    const review = buildUnusedIndexReview({
      results: [
        {
          category: "performance",
          lints: [
            {
              name: "unused_index",
              title: "Unused Index",
              level: "INFO",
              metadata: { index_name: "idx_listings_owner_id", table_name: "listings" },
            },
          ],
        },
      ],
    });

    expect(review.totals).toEqual({
      unused_index_lints: 1,
      mapped_to_stats: 0,
      with_scans: 0,
      zero_scan_candidates: 0,
      managed_schema_indexes: 0,
      protected_indexes: 0,
      write_path_candidates: 0,
      needs_stats_snapshot: 1,
      needs_manual_mapping: 0,
    });
    expect(review.items[0]).toMatchObject({
      index_name: "idx_listings_owner_id",
      review_status: "needs_pg_stat_user_indexes_snapshot",
    });
  });

  it("keeps scanned indexes and requires extra review before dropping zero-scan indexes", () => {
    const review = buildUnusedIndexReview(
      {
        results: [
          {
            category: "performance",
            lints: [
              {
                name: "unused_index",
                title: "Unused Index",
                level: "INFO",
                metadata: { index_name: "idx_recently_used", table_name: "listings" },
              },
              {
                name: "unused_index",
                title: "Unused Index",
                level: "INFO",
                metadata: { index_name: "idx_zero_scan", table_name: "messages" },
              },
            ],
          },
        ],
      },
      [
        { indexrelname: "idx_recently_used", relname: "listings", idx_scan: 42 },
        { indexrelname: "idx_zero_scan", relname: "messages", idx_scan: 0 },
      ],
    );

    expect(review.totals).toMatchObject({
      mapped_to_stats: 2,
      with_scans: 1,
      zero_scan_candidates: 1,
    });
    expect(review.items.map((item) => item.review_status)).toEqual([
      "keep_or_recheck_usage",
      "candidate_needs_pg_stat_statements_and_release_review",
    ]);
  });

  it("extracts the index name from Supabase unused-index cache keys when metadata only names the table", () => {
    const review = buildUnusedIndexReview(
      {
        results: [
          {
            category: "performance",
            lints: [
              {
                name: "unused_index",
                title: "Unused Index",
                level: "INFO",
                cache_key: "unused_index_public_listings_idx_listings_property_type",
                metadata: { name: "listings", type: "table", schema: "public" },
              },
            ],
          },
        ],
      },
      [
        {
          indexrelname: "idx_listings_property_type",
          relname: "listings",
          idx_scan: 0,
        },
      ],
    );

    expect(review.totals).toMatchObject({
      mapped_to_stats: 1,
      zero_scan_candidates: 1,
      needs_stats_snapshot: 0,
      needs_manual_mapping: 0,
    });
    expect(review.items[0]).toMatchObject({
      table_name: "listings",
      index_name: "idx_listings_property_type",
      review_status: "candidate_needs_pg_stat_statements_and_release_review",
    });
  });

  it("never promotes managed-schema or constraint-backed indexes to drop candidates", () => {
    const review = buildUnusedIndexReview(
      {
        results: [
          {
            category: "performance",
            lints: [
              {
                name: "unused_index",
                title: "Unused Index",
                level: "INFO",
                metadata: { schema: "auth", table_name: "users", index_name: "users_pkey" },
              },
              {
                name: "unused_index",
                title: "Unused Index",
                level: "INFO",
                metadata: { schema: "public", table_name: "listings", index_name: "listings_slug_key" },
              },
            ],
          },
        ],
      },
      [
        {
          schemaname: "auth",
          relname: "users",
          indexrelname: "users_pkey",
          idx_scan: 0,
          is_primary: true,
          is_unique: true,
          has_constraint: true,
        },
        {
          schemaname: "public",
          relname: "listings",
          indexrelname: "listings_slug_key",
          idx_scan: 0,
          is_unique: true,
          has_constraint: true,
        },
      ],
    );

    expect(review.totals).toMatchObject({
      managed_schema_indexes: 1,
      protected_indexes: 1,
      zero_scan_candidates: 0,
    });
    expect(review.by_review_status).toMatchObject({
      managed_schema_do_not_drop_from_advisor_only: 1,
      protected_index_do_not_drop: 1,
    });
    expect(review.items.every((item) => item.drop_allowed === false)).toBe(true);
  });

  it("flags public zero-scan indexes on write paths for query-plan review and observation", () => {
    const review = buildUnusedIndexReview(
      {
        results: [
          {
            category: "performance",
            lints: [
              {
                name: "unused_index",
                title: "Unused Index",
                level: "INFO",
                metadata: { schema: "public", table_name: "listings", index_name: "idx_listings_price" },
              },
            ],
          },
        ],
      },
      [
        {
          schemaname: "public",
          relname: "listings",
          indexrelname: "idx_listings_price",
          idx_scan: 0,
          idx_tup_read: 0,
          idx_tup_fetch: 0,
          index_bytes: 270336,
          table_writes: 1250,
          is_primary: false,
          is_unique: false,
          has_constraint: false,
        },
      ],
    );

    expect(review.totals).toMatchObject({
      zero_scan_candidates: 1,
      write_path_candidates: 1,
    });
    expect(review.by_schema).toMatchObject({ public: 1 });
    expect(review.items[0]).toMatchObject({
      review_status: "candidate_needs_pg_stat_statements_and_release_review",
      write_path_candidate: true,
      requires_query_plan_review: true,
      minimum_observation_days: 30,
      drop_allowed: false,
    });
  });
});
