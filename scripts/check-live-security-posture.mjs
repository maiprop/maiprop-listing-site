#!/usr/bin/env node

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  process.env.RELEASE_SAFETY_SUPABASE_PROJECT_REF ||
  process.env.STAGING_SUPABASE_PROJECT_ID ||
  process.env.VITE_SUPABASE_PROJECT_ID;

const fail = (message, detail) => {
  console.error(`[live-security] ${message}`);
  if (detail) console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
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
)
SELECT
  bucket_checks.buckets,
  COALESCE(rls_disabled.tables, '[]'::jsonb) AS rls_disabled_tables,
  function_grants.grants
FROM bucket_checks, rls_disabled, function_grants;
`;

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
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
if (!res.ok) fail(`Supabase Management API returned ${res.status}.`, text.slice(0, 500));

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
