export const ACTIONS = ["SELECT", "INSERT", "UPDATE", "DELETE"];

const BROWSER_ROLES = new Set(["anon", "authenticated", "public"]);
const OK_STATUSES = new Set([
  "covered_by_policy",
  "rls_denies_by_default",
  "closed_by_grant",
]);

const normalize = (value) => String(value ?? "").trim().toLowerCase();
const upper = (value) => String(value ?? "").trim().toUpperCase();

function booleanValue(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  const normalized = normalize(value);
  return normalized === "true" || normalized === "t" || normalized === "yes";
}

function identifier(row, schemaKeys, tableKeys) {
  const schemaName = schemaKeys.map((key) => row?.[key]).find((value) => value !== undefined) ?? "public";
  const tableName = tableKeys.map((key) => row?.[key]).find((value) => value !== undefined);
  return {
    schema: normalize(schemaName),
    table: normalize(tableName),
  };
}

function parseRoles(value) {
  if (Array.isArray(value)) {
    return value.map(normalize).filter(Boolean);
  }

  const raw = String(value ?? "").trim();
  if (!raw) return [];
  if (raw.startsWith("{") && raw.endsWith("}")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((entry) => normalize(entry.replace(/^"|"$/g, "")))
      .filter(Boolean);
  }

  return raw.split(",").map(normalize).filter(Boolean);
}

function isBrowserRole(role) {
  return BROWSER_ROLES.has(normalize(role));
}

function policyCoversAction(policy, action) {
  const cmd = upper(policy?.cmd);
  return cmd === "ALL" || cmd === action;
}

function policyAppliesToBrowser(policy) {
  const roles = parseRoles(policy?.roles);
  return roles.some(isBrowserRole);
}

function grantCoversAction(grant, action) {
  return upper(grant?.privilege_type ?? grant?.privilege) === action;
}

function tableKey(schemaName, tableName) {
  return `${normalize(schemaName)}.${normalize(tableName)}`;
}

function groupByTable(rows, schemaKeys, tableKeys) {
  const grouped = new Map();
  for (const row of rows ?? []) {
    const id = identifier(row, schemaKeys, tableKeys);
    if (!id.table) continue;
    const key = tableKey(id.schema, id.table);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

function actionStatus({ rlsEnabled, browserGranted, matchingPolicies }) {
  if (!rlsEnabled) return "risk_rls_disabled";
  if (matchingPolicies.length > 0) return "covered_by_policy";
  if (browserGranted) return "rls_denies_by_default";
  return "closed_by_grant";
}

export function buildRlsCrudMatrix({ tables = [], policies = [], grants = [] } = {}) {
  const publicTables = (tables ?? [])
    .map((row) => {
      const id = identifier(row, ["schemaname", "table_schema", "schema"], ["tablename", "table_name", "table"]);
      return {
        raw: row,
        schema: id.schema || "public",
        name: id.table,
        rls_enabled: booleanValue(row.rowsecurity ?? row.rls_enabled),
        force_rls: booleanValue(row.forcerowsecurity ?? row.force_rls),
      };
    })
    .filter((table) => table.schema === "public" && table.name);

  const policiesByTable = groupByTable(
    policies,
    ["schemaname", "table_schema", "schema"],
    ["tablename", "table_name", "table"],
  );
  const grantsByTable = groupByTable(
    grants,
    ["table_schema", "schemaname", "schema"],
    ["table_name", "tablename", "table"],
  );

  const matrixTables = publicTables
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((table) => {
      const key = tableKey(table.schema, table.name);
      const tablePolicies = policiesByTable.get(key) ?? [];
      const tableGrants = grantsByTable.get(key) ?? [];

      const actions = ACTIONS.map((action) => {
        const browserGrantRoles = tableGrants
          .filter((grant) => grantCoversAction(grant, action))
          .map((grant) => normalize(grant.grantee ?? grant.role))
          .filter(isBrowserRole)
          .filter((role, index, roles) => roles.indexOf(role) === index)
          .sort();
        const matchingPolicies = tablePolicies
          .filter((policy) => policyCoversAction(policy, action) && policyAppliesToBrowser(policy));

        return {
          action,
          status: actionStatus({
            rlsEnabled: table.rls_enabled,
            browserGranted: browserGrantRoles.length > 0,
            matchingPolicies,
          }),
          browser_granted: browserGrantRoles.length > 0,
          browser_grant_roles: browserGrantRoles,
          policy_names: matchingPolicies.map((policy) => policy.policyname ?? policy.policy_name ?? "<unnamed>"),
          policy_roles: matchingPolicies.map((policy) => parseRoles(policy.roles)),
        };
      });

      return {
        schema: table.schema,
        name: table.name,
        table: key,
        rls_enabled: table.rls_enabled,
        force_rls: table.force_rls,
        policy_count: tablePolicies.length,
        browser_grant_count: tableGrants.filter((grant) => isBrowserRole(grant.grantee ?? grant.role)).length,
        actions,
      };
    });

  const statusCounts = {};
  for (const table of matrixTables) {
    for (const action of table.actions) {
      statusCounts[action.status] = (statusCounts[action.status] ?? 0) + 1;
    }
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    summary: {
      public_table_count: matrixTables.length,
      rls_disabled_table_count: matrixTables.filter((table) => !table.rls_enabled).length,
      action_status_counts: statusCounts,
    },
    tables: matrixTables,
  };
}

export function getRlsCrudMatrixFailures(matrix) {
  const failures = [];
  if (!matrix || typeof matrix !== "object") {
    return ["RLS CRUD matrix is missing or invalid"];
  }
  if (!Array.isArray(matrix.tables) || matrix.tables.length === 0) {
    failures.push("RLS CRUD matrix must include at least one public table");
    return failures;
  }

  for (const table of matrix.tables) {
    const label = table.table ?? tableKey(table.schema, table.name);
    if (!table.rls_enabled) {
      failures.push(`${label} has RLS disabled`);
    }

    const actions = new Map((table.actions ?? []).map((action) => [action.action, action]));
    for (const action of ACTIONS) {
      const entry = actions.get(action);
      if (!entry) {
        failures.push(`${label} is missing ${action} classification`);
        continue;
      }
      if (!OK_STATUSES.has(entry.status)) {
        failures.push(`${label} ${action} has unsafe or unknown status: ${entry.status}`);
      }
    }
  }

  return failures;
}

export function assertRlsCrudMatrix(matrix) {
  const failures = getRlsCrudMatrixFailures(matrix);
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
}
