SET statement_timeout='10s';
 DO $barrier$ DECLARE deadline timestamptz:=clock_timestamp()+interval '8 seconds'; BEGIN
 LOOP
   PERFORM pg_stat_clear_snapshot();
   EXIT WHEN EXISTS(SELECT 1 FROM pg_stat_activity a JOIN pg_stat_activity b ON b.datname=a.datname
 WHERE a.datname=current_database() AND a.application_name='task23_fix1_accept_a' AND a.pid=483
 AND b.application_name='task23_fix1_accept_b' AND a.state='idle in transaction' AND b.state='active'
 AND b.wait_event_type='Lock' AND b.wait_event='advisory' AND a.pid=ANY(pg_blocking_pids(b.pid))
 AND b.query LIKE '%public.accept_open_house_offer%'
 AND EXISTS (SELECT 1 FROM pg_locks held JOIN pg_locks waiting
 ON held.locktype=waiting.locktype AND held.database=waiting.database AND held.classid=waiting.classid
 AND held.objid=waiting.objid AND held.objsubid=waiting.objsubid
 WHERE held.pid=a.pid AND waiting.pid=b.pid AND held.locktype='advisory'
 AND held.granted AND NOT waiting.granted AND held.mode='ExclusiveLock' AND waiting.mode='ExclusiveLock'));
   IF clock_timestamp()>=deadline THEN RAISE EXCEPTION 'contender_advisory_wait_not_observed'; END IF;
   PERFORM pg_sleep(0.05);
 END LOOP;
 END $barrier$;
 SELECT json_build_object('a_pid',a.pid,'b_pid',b.pid,'a_state',a.state,'b_state',b.state,
 'wait_event_type',b.wait_event_type,'wait_event',b.wait_event,'blocking_pids',pg_blocking_pids(b.pid),
 'a_xact_start',a.xact_start,'b_query_start',b.query_start,'observed_at',clock_timestamp(),
 'advisory_locks',(SELECT json_agg(json_build_object('pid',k.pid,'classid',k.classid,'objid',k.objid,'objsubid',k.objsubid,'mode',k.mode,'granted',k.granted)) FROM pg_locks k WHERE k.pid IN (a.pid,b.pid) AND k.locktype='advisory'))
 FROM pg_stat_activity a JOIN pg_stat_activity b ON b.datname=a.datname
 WHERE a.datname=current_database() AND a.application_name='task23_fix1_accept_a' AND a.pid=483
 AND b.application_name='task23_fix1_accept_b' AND a.state='idle in transaction' AND b.state='active'
 AND b.wait_event_type='Lock' AND b.wait_event='advisory' AND a.pid=ANY(pg_blocking_pids(b.pid))
 AND b.query LIKE '%public.accept_open_house_offer%'
 AND EXISTS (SELECT 1 FROM pg_locks held JOIN pg_locks waiting
 ON held.locktype=waiting.locktype AND held.database=waiting.database AND held.classid=waiting.classid
 AND held.objid=waiting.objid AND held.objsubid=waiting.objsubid
 WHERE held.pid=a.pid AND waiting.pid=b.pid AND held.locktype='advisory'
 AND held.granted AND NOT waiting.granted AND held.mode='ExclusiveLock' AND waiting.mode='ExclusiveLock');