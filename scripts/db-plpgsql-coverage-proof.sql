-- Isolated official plpgsql_check branch semantics: 0/4 -> 3/4 -> 4/4.
LOAD 'plpgsql_check';
SELECT plpgsql_check_profiler(true);
CREATE SCHEMA coverage_probe;
CREATE FUNCTION coverage_probe.branch_probe(value boolean) RETURNS integer LANGUAGE plpgsql AS $$ BEGIN IF value THEN RETURN 1; ELSE RETURN 2; END IF; END $$;
DO $assert$ BEGIN
  IF (SELECT count(*) FROM plpgsql_profiler_function_statements_tb('coverage_probe.branch_probe(boolean)'::regprocedure)) <> 4
  OR (SELECT count(*) FROM plpgsql_profiler_function_statements_tb('coverage_probe.branch_probe(boolean)'::regprocedure) WHERE exec_stmts > 0) <> 0
  THEN RAISE EXCEPTION 'official profiler zero-hit proof failed'; END IF;
END $assert$;
SELECT coverage_probe.branch_probe(true);
DO $assert$ BEGIN
  IF (SELECT count(*) FROM plpgsql_profiler_function_statements_tb('coverage_probe.branch_probe(boolean)'::regprocedure) WHERE exec_stmts > 0) <> 3
  THEN RAISE EXCEPTION 'official profiler partial-hit proof failed'; END IF;
END $assert$;
SELECT coverage_probe.branch_probe(false);
DO $assert$ BEGIN
  IF (SELECT count(*) FROM plpgsql_profiler_function_statements_tb('coverage_probe.branch_probe(boolean)'::regprocedure) WHERE exec_stmts > 0) <> 4
  THEN RAISE EXCEPTION 'official profiler full-hit proof failed'; END IF;
END $assert$;
DROP SCHEMA coverage_probe CASCADE;
