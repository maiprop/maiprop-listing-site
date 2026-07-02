#!/usr/bin/env node
import localEnvLoader from "./_load-local-env.cjs";

localEnvLoader.loadLocalEnv();

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  process.env.RELEASE_SAFETY_SUPABASE_PROJECT_REF ||
  process.env.STAGING_SUPABASE_PROJECT_ID ||
  process.env.VITE_SUPABASE_PROJECT_ID;
const allowTransientUnavailable = process.argv.includes("--allow-transient-unavailable");
const apiBase = process.env.SUPABASE_MANAGEMENT_API_BASE || "https://api.supabase.com/v1";

const fail = (message, detail) => {
  console.error(`[live-security] ${message}`);
  if (detail) console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retryableStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504, 520, 522, 524, 544]);

const isTransientManagementFailure = (status, detail = "") =>
  retryableStatuses.has(status) &&
  /timeout|timed out|connection terminated|temporarily unavailable|cloudflare|edge function/i.test(
    String(detail),
  );

const isTransientRequestError = (error) =>
  /timeout|timed out|econnreset|etimedout|fetch failed|network/i.test(
    `${error?.name ?? ""} ${error?.message ?? ""} ${error?.cause?.code ?? ""} ${
      error?.cause?.message ?? ""
    }`,
  );

const exitTransient = (message, detail) => {
  console.warn(`[live-security] posture check was transiently unavailable; ${message}`);
  if (detail) console.warn(String(detail).slice(0, 500));
  process.exit(0);
};

const querySupabase = async () => {
  const maxAttempts = 4;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(
        `${apiBase}/projects/${projectRef}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
        },
      );
      const text = await res.text();

      if (res.ok) return text;
      if (allowTransientUnavailable && isTransientManagementFailure(res.status, text)) {
        exitTransient(`Supabase Management API returned ${res.status}.`, text);
      }
      if (!retryableStatuses.has(res.status) || attempt === maxAttempts) {
        fail(`Supabase Management API returned ${res.status}.`, text.slice(0, 500));
      }

      lastError = new Error(`Supabase Management API returned ${res.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) throw error;
    }

    const delayMs = 1000 * attempt ** 2;
    console.warn(
      `[live-security] Supabase Management API attempt ${attempt} failed; retrying in ${delayMs}ms.`,
    );
    await sleep(delayMs);
  }

  throw lastError;
};

if (!accessToken) fail("Missing SUPABASE_ACCESS_TOKEN.");
if (!projectRef) fail("Missing Supabase project ref.");

const query = `
WITH bucket_checks AS (
  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'public', public,
    'file_size_limit', file_size_limit,
    'allowed_mime_types', allowed_mime_types
  ) ORDER BY id) AS buckets
  FROM storage.buckets
  WHERE id IN (
    'email-assets',
    'firesale-photos',
    'message-attachments',
    'property-images'
  )
),
rls_disabled AS (
  SELECT jsonb_agg(format('%I.%I', schemaname, tablename) ORDER BY schemaname, tablename) AS tables
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = false
),
function_grants AS (
  SELECT jsonb_agg(jsonb_build_object(
    'signature', p.oid::regprocedure::text,
    'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
    'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    'service_role', has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) ORDER BY p.oid::regprocedure::text) AS grants
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'authoritative_role',
      'check_listing_quota',
      'has_platform_admin',
      'has_role',
      'release_expired_firesale_reservations'
    )
),
future_default_grants AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'grantor_role', grantor_role,
    'object_type', object_type,
    'grantee', grantee,
    'privileges', privileges
  ) ORDER BY grantor_role, object_type, grantee), '[]'::jsonb) AS grants
  FROM (
    SELECT
      pg_get_userbyid(d.defaclrole) AS grantor_role,
      CASE d.defaclobjtype
        WHEN 'r' THEN 'TABLES'
        WHEN 'S' THEN 'SEQUENCES'
        WHEN 'f' THEN 'FUNCTIONS'
        ELSE d.defaclobjtype::text
      END AS object_type,
      COALESCE(r.rolname, 'PUBLIC') AS grantee,
      array_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) AS privileges
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'public'
      AND pg_get_userbyid(d.defaclrole) = 'postgres'
      AND (
        (
          d.defaclobjtype IN ('r', 'S')
          AND COALESCE(r.rolname, 'PUBLIC') IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
        )
        OR (
          d.defaclobjtype = 'f'
          AND COALESCE(r.rolname, 'PUBLIC') IN ('anon', 'authenticated', 'PUBLIC')
        )
      )
    GROUP BY d.defaclrole, d.defaclobjtype, COALESCE(r.rolname, 'PUBLIC')
  ) default_grant_rows
),
project_authenticated_select_policies AS (
  SELECT COALESCE(jsonb_agg(policyname ORDER BY policyname), '[]'::jsonb) AS policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'projects'
    AND cmd = 'SELECT'
    AND permissive = 'PERMISSIVE'
    AND (
      'authenticated' = ANY(roles)
      OR 'public' = ANY(roles)
    )
)
SELECT
  bucket_checks.buckets,
  COALESCE(rls_disabled.tables, '[]'::jsonb) AS rls_disabled_tables,
  function_grants.grants,
  future_default_grants.grants AS future_default_grants,
  project_authenticated_select_policies.policies AS project_authenticated_select_policies
FROM bucket_checks, rls_disabled, function_grants, future_default_grants, project_authenticated_select_policies;
`;

const text = await querySupabase().catch((error) => {
  if (allowTransientUnavailable && isTransientRequestError(error)) {
    exitTransient("Supabase Management API request failed after retries.", error?.message);
  }
  fail("Supabase Management API request failed after retries.", {
    name: error?.name,
    message: error?.message,
    cause: error?.cause?.code ?? error?.cause?.message,
  });
});

const [row] = JSON.parse(text);
const buckets = new Map((row?.buckets ?? []).map((bucket) => [bucket.id, bucket]));
const grants = new Map((row?.grants ?? []).map((grant) => [grant.signature, grant]));
const failures = [];

const requireBucket = (id, predicate, message) => {
  const bucket = buckets.get(id);
  if (!bucket || !predicate(bucket)) failures.push({ id, message, bucket: bucket ?? null });
};

requireBucket("message-attachments", (bucket) =>
  bucket.public === false &&
  bucket.file_size_limit === 10485760 &&
  Array.isArray(bucket.allowed_mime_types) &&
  bucket.allowed_mime_types.includes("application/pdf"),
"message attachments must be private and MIME/size constrained");

for (const id of ["email-assets", "firesale-photos", "property-images"]) {
  requireBucket(id, (bucket) =>
    bucket.public === true &&
    typeof bucket.file_size_limit === "number" &&
    Array.isArray(bucket.allowed_mime_types) &&
    bucket.allowed_mime_types.length > 0,
  "public asset bucket must have explicit MIME and size limits");
}

if ((row?.rls_disabled_tables ?? []).length > 0) {
  failures.push({
    message: "public tables with RLS disabled",
    tables: row.rls_disabled_tables,
  });
}

if ((row?.future_default_grants ?? []).length > 0) {
  failures.push({
    message: "future public-schema default grants must be revoked; use explicit grants in migrations",
    grants: row.future_default_grants,
  });
}

if ((row?.project_authenticated_select_policies ?? []).length > 1) {
  failures.push({
    message: "project SELECT policies overlap for authenticated users",
    policies: row.project_authenticated_select_policies,
  });
}

const releaseGrant = grants.get("release_expired_firesale_reservations(uuid)");
if (!releaseGrant || releaseGrant.anon || releaseGrant.authenticated || !releaseGrant.service_role) {
  failures.push({
    message: "release_expired_firesale_reservations must be service-role only",
    grant: releaseGrant ?? null,
  });
}

for (const signature of [
  "authoritative_role()",
  "authoritative_role(uuid)",
  "check_listing_quota()",
  "has_platform_admin(uuid)",
  "has_role(uuid,app_role)",
  "has_role(uuid,user_role)",
]) {
  const grant = grants.get(signature);
  if (!grant || grant.anon || grant.authenticated || !grant.service_role) {
    failures.push({
      message: "role helper must be service-role only",
      signature,
      grant: grant ?? null,
    });
  }
}

if (failures.length > 0) fail("posture check failed", failures);

console.log("[live-security] posture checks passed");
