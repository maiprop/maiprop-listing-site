import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAIPROP_PRODUCTION_SUPABASE_PROJECT_REF =
  "qvvicunqcrwpioqnvzxf";
export const MAIPROP_STAGING_SUPABASE_PROJECT_REF = "xsiehskfgeoqyazcgauv";
export const MAIPROP_STAGING_MUTATION_ACKNOWLEDGEMENT =
  "MUTATE_STAGING_xsiehskfgeoqyazcgauv";

function databaseProjectRef(databaseUrl) {
  if (!databaseUrl) return null;

  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Staging database URL must use postgres or postgresql");
  }

  const username = decodeURIComponent(parsed.username);
  const hostname = parsed.hostname.toLowerCase();
  const directMatch = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(hostname);
  const poolerHost = /^(?:[a-z0-9-]+\.)+pooler\.supabase\.com$/.test(
    hostname,
  );

  let projectRef = null;
  if (directMatch) {
    if (username !== "postgres") {
      throw new Error("Direct staging database URL must use the postgres user");
    }
    projectRef = directMatch[1];
  } else if (poolerHost) {
    const poolerUser = /^postgres\.([a-z0-9]{20})$/.exec(username);
    if (!poolerUser) {
      throw new Error(
        "Staging pooler URL must use the postgres.<project-ref> user",
      );
    }
    projectRef = poolerUser[1];
  } else {
    throw new Error(
      "Staging database URL must use a Supabase direct or pooler hostname",
    );
  }

  if (parsed.pathname !== "/postgres") {
    throw new Error("Staging database URL must target the postgres database");
  }
  if (parsed.port && !["5432", "6543"].includes(parsed.port)) {
    throw new Error("Staging database URL uses an unsupported port");
  }
  if (parsed.searchParams.get("sslmode") !== "require") {
    throw new Error("Staging database URL must require TLS with sslmode=require");
  }

  return projectRef;
}

export function assertStagingMutationTarget({
  projectRef,
  databaseUrl = null,
  acknowledgement,
}) {
  if (projectRef === MAIPROP_PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("Refusing to mutate the MaiProp production Supabase project");
  }
  if (projectRef !== MAIPROP_STAGING_SUPABASE_PROJECT_REF) {
    throw new Error(
      `Staging mutation target must be ${MAIPROP_STAGING_SUPABASE_PROJECT_REF}`,
    );
  }
  if (acknowledgement !== MAIPROP_STAGING_MUTATION_ACKNOWLEDGEMENT) {
    throw new Error(
      `Staging mutation acknowledgement must be ${MAIPROP_STAGING_MUTATION_ACKNOWLEDGEMENT}`,
    );
  }

  const databaseRef = databaseProjectRef(databaseUrl);
  if (databaseUrl && databaseRef !== projectRef) {
    throw new Error(
      `Database target ${databaseRef ?? "unknown"} does not match staging ${projectRef}`,
    );
  }

  return {
    projectRef,
    databaseProjectRef: databaseRef,
  };
}

function readFlag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main() {
  const result = assertStagingMutationTarget({
    projectRef:
      readFlag("--project-ref") ?? process.env.STAGING_SUPABASE_PROJECT_ID,
    databaseUrl:
      readFlag("--database-url") ??
      process.env.SUPABASE_STAGING_EFFECTIVE_DB_URL ??
      null,
    acknowledgement:
      readFlag("--acknowledgement") ??
      process.env.STAGING_MUTATION_ACKNOWLEDGEMENT,
  });
  process.stdout.write(
    `Verified isolated staging mutation target: ${result.projectRef}\n`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
