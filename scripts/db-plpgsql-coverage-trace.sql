-- Local migration event capture. Never deployed; disabled before test execution.
CREATE SCHEMA remediation_ddl_trace;
REVOKE ALL ON SCHEMA remediation_ddl_trace FROM PUBLIC;
CREATE TABLE remediation_ddl_trace.events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  migration text NOT NULL, event text NOT NULL, command_tag text,
  object_type text, schema_name text, object_identity text,
  classid oid, objid oid, objsubid integer
);
CREATE FUNCTION remediation_ddl_trace.record_ddl() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $trace$
BEGIN
  INSERT INTO remediation_ddl_trace.events
    (migration,event,command_tag,object_type,schema_name,object_identity,classid,objid,objsubid)
  SELECT current_setting('remediation_trace.migration'),tg_event,
    c.command_tag,c.object_type,c.schema_name,c.object_identity,c.classid,c.objid,c.objsubid
  FROM pg_catalog.pg_event_trigger_ddl_commands() c
  WHERE c.schema_name IS DISTINCT FROM 'remediation_ddl_trace';
END
$trace$;
CREATE FUNCTION remediation_ddl_trace.record_drop() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $trace$
BEGIN
  INSERT INTO remediation_ddl_trace.events
    (migration,event,command_tag,object_type,schema_name,object_identity,classid,objid,objsubid)
  SELECT current_setting('remediation_trace.migration'),tg_event,tg_tag,
    c.object_type,c.schema_name,c.object_identity,c.classid,c.objid,c.objsubid
  FROM pg_catalog.pg_event_trigger_dropped_objects() c
  WHERE c.schema_name IS DISTINCT FROM 'remediation_ddl_trace';
END
$trace$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA remediation_ddl_trace FROM PUBLIC;
SELECT set_config('remediation_trace.migration','local-instrumentation',false);
CREATE EVENT TRIGGER remediation_capture_ddl ON ddl_command_end EXECUTE FUNCTION remediation_ddl_trace.record_ddl();
CREATE EVENT TRIGGER remediation_capture_drop ON sql_drop EXECUTE FUNCTION remediation_ddl_trace.record_drop();
