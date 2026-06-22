import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  assertRlsCrudMatrix,
  buildRlsCrudMatrix,
} from "./rls-crud-matrix.mjs";

describe("RLS CRUD matrix", () => {
  it("classifies all CRUD actions for every public table", () => {
    const matrix = buildRlsCrudMatrix({
      tables: [
        { schemaname: "public", tablename: "listings", rowsecurity: true },
      ],
      policies: [
        {
          schemaname: "public",
          tablename: "listings",
          policyname: "active listings public read",
          cmd: "SELECT",
          roles: ["public"],
          qual: "status = 'active'",
        },
        {
          schemaname: "public",
          tablename: "listings",
          policyname: "owners manage listings",
          cmd: "ALL",
          roles: ["authenticated"],
          qual: "user_id = auth.uid()",
          with_check: "user_id = auth.uid()",
        },
      ],
      grants: [
        { table_schema: "public", table_name: "listings", grantee: "anon", privilege_type: "SELECT" },
        { table_schema: "public", table_name: "listings", grantee: "authenticated", privilege_type: "SELECT" },
        { table_schema: "public", table_name: "listings", grantee: "authenticated", privilege_type: "INSERT" },
        { table_schema: "public", table_name: "listings", grantee: "authenticated", privilege_type: "UPDATE" },
        { table_schema: "public", table_name: "listings", grantee: "authenticated", privilege_type: "DELETE" },
      ],
    });

    const table = matrix.tables.find((entry) => entry.table === "public.listings");

    expect(table.actions.map((action) => action.action)).toEqual(ACTIONS);
    expect(table.actions.find((action) => action.action === "SELECT")).toMatchObject({
      status: "covered_by_policy",
      browser_granted: true,
    });
    expect(table.actions.find((action) => action.action === "DELETE")).toMatchObject({
      status: "covered_by_policy",
      policy_names: ["owners manage listings"],
    });
    expect(() => assertRlsCrudMatrix(matrix)).not.toThrow();
  });

  it("marks granted browser actions without a matching policy as denied by default", () => {
    const matrix = buildRlsCrudMatrix({
      tables: [
        { schemaname: "public", tablename: "project_leads", rowsecurity: true },
      ],
      policies: [
        {
          schemaname: "public",
          tablename: "project_leads",
          policyname: "owners read leads",
          cmd: "SELECT",
          roles: ["authenticated"],
          qual: "owner_id = auth.uid()",
        },
      ],
      grants: [
        { table_schema: "public", table_name: "project_leads", grantee: "authenticated", privilege_type: "SELECT" },
        { table_schema: "public", table_name: "project_leads", grantee: "authenticated", privilege_type: "INSERT" },
      ],
    });

    expect(matrix.tables[0].actions.find((action) => action.action === "INSERT")).toMatchObject({
      status: "rls_denies_by_default",
      browser_granted: true,
      policy_names: [],
    });
    expect(() => assertRlsCrudMatrix(matrix)).not.toThrow();
  });

  it("allows service-only tables when RLS is enabled and browser roles have no table grant", () => {
    const matrix = buildRlsCrudMatrix({
      tables: [
        { schemaname: "public", tablename: "organization_audit_ledger", rowsecurity: true },
      ],
      policies: [],
      grants: [
        { table_schema: "public", table_name: "organization_audit_ledger", grantee: "service_role", privilege_type: "SELECT" },
      ],
    });

    expect(matrix.tables[0].actions.every((action) => action.status === "closed_by_grant")).toBe(true);
    expect(() => assertRlsCrudMatrix(matrix)).not.toThrow();
  });

  it("fails validation when a public table is not protected by RLS", () => {
    const matrix = buildRlsCrudMatrix({
      tables: [
        { schemaname: "public", tablename: "unsafe_table", rowsecurity: false },
      ],
      policies: [],
      grants: [
        { table_schema: "public", table_name: "unsafe_table", grantee: "anon", privilege_type: "SELECT" },
      ],
    });

    expect(() => assertRlsCrudMatrix(matrix)).toThrow(/public\.unsafe_table has RLS disabled/);
  });
});
