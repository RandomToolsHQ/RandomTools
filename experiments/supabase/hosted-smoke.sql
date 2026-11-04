-- ONLY rt11 in the approved isolated project. No Firebase account is created.
-- Trusted-server SQL tests, NOT proof of hosted JWT authentication. Fixtures roll back.
BEGIN;
DO $$
DECLARE issued bigint:=floor(extract(epoch FROM clock_timestamp()))-10;
 a text:='phase11-db-admin'; m text:='phase11-db-member'; o text:='phase11-db-other';
 ha text:=repeat('a',64); hm text:=repeat('b',64); ho text:=repeat('c',64);
 v jsonb; saved text; duration text; exp bigint;
BEGIN
 IF (SELECT value FROM rt11.metadata WHERE key='isolation') IS DISTINCT FROM 'randomtools-phase11-v1'
 OR EXISTS(SELECT FROM rt11.users) THEN RAISE EXCEPTION 'Requires empty isolated rt11 database'; END IF;
 INSERT INTO rt11.users(id,subject,email,name,role) VALUES
 (a,a,'phase11-00000000-admin@example.com','Synthetic admin','admin'),
 (m,m,'phase11-00000000-member@example.com','Synthetic member','free'),
 (o,o,'phase11-00000000-other@example.com','Synthetic other','free');
 PERFORM public.rt11_request(a,issued,ha,'session','{}');
 PERFORM public.rt11_request(m,issued,hm,'session','{}');
 PERFORM public.rt11_request(o,issued,ho,'session','{}');
 EXECUTE 'SET LOCAL ROLE anon';
 BEGIN PERFORM public.rt11_request(m,issued,hm,'me','{}'); RAISE EXCEPTION 'Anon RPC unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 EXECUTE 'RESET ROLE';
 EXECUTE 'SET LOCAL ROLE authenticated';
 BEGIN PERFORM public.rt11_request(m,issued,hm,'me','{}'); RAISE EXCEPTION 'Client RPC unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 EXECUTE 'RESET ROLE';
 EXECUTE 'SET LOCAL ROLE service_role';
 BEGIN PERFORM 1 FROM rt11.users; RAISE EXCEPTION 'Runtime direct table access unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 v:=public.rt11_request(m,issued,hm,'me','{}');
 IF v->>'pro'<>'false' OR v->'user'->>'id'<>m THEN RAISE EXCEPTION 'Member profile mismatch'; END IF;
 BEGIN PERFORM public.rt11_request(m,issued,hm,'admin','{}'); RAISE EXCEPTION 'Member admin escalation';
 EXCEPTION WHEN SQLSTATE 'RT403' THEN NULL; END;
 BEGIN PERFORM public.rt11_request(m,issued,hm,'grant',jsonb_build_object('userId',m,'duration','permanent')); RAISE EXCEPTION 'Member self grant';
 EXCEPTION WHEN SQLSTATE 'RT403' THEN NULL; END;
 BEGIN PERFORM public.rt11_request(m,issued,hm,'profile','{"name":"Injected","role":"admin"}'); RAISE EXCEPTION 'Role injection accepted';
 EXCEPTION WHEN SQLSTATE 'RT400' THEN NULL; END;
 v:=public.rt11_request(a,issued,ha,'admin','{}');
 IF (v->>'users')::int<>3 THEN RAISE EXCEPTION 'Admin summary mismatch'; END IF;
 FOREACH duration IN ARRAY ARRAY['7d','30d','permanent'] LOOP
  PERFORM public.rt11_request(a,issued,ha,'grant',jsonb_build_object('userId',m,'duration',duration));
  IF public.rt11_request(m,issued,hm,'me','{}')->>'pro'<>'true' THEN RAISE EXCEPTION 'Grant not effective'; END IF;
 END LOOP;
 EXECUTE 'RESET ROLE';
 SELECT expires_at INTO exp FROM rt11.grants WHERE user_id=m;
 IF exp IS NOT NULL THEN RAISE EXCEPTION 'Permanent grant expires'; END IF;
 UPDATE rt11.users SET disabled=true WHERE id=m;
 BEGIN PERFORM public.rt11_request(a,issued,ha,'grant',jsonb_build_object('userId',m,'duration','7d')); RAISE EXCEPTION 'Disabled grant accepted';
 EXCEPTION WHEN SQLSTATE 'RT403' THEN NULL; END;
 PERFORM public.rt11_request(a,issued,ha,'revoke',jsonb_build_object('userId',m));
 UPDATE rt11.users SET disabled=false WHERE id=m;
 IF public.rt11_request(m,issued,hm,'me','{}')->>'pro'<>'false' THEN RAISE EXCEPTION 'Revoked grant resurrected'; END IF;
 PERFORM public.rt11_request(a,issued,ha,'grant',jsonb_build_object('userId',m,'duration','7d'));
 UPDATE rt11.grants SET expires_at=issued-1 WHERE user_id=m;
 BEGIN PERFORM public.rt11_request(m,issued,hm,'workspace','{}'); RAISE EXCEPTION 'Expired Pro accepted';
 EXCEPTION WHEN SQLSTATE 'RT403' THEN NULL; END;
 PERFORM public.rt11_request(a,issued,ha,'grant',jsonb_build_object('userId',m,'duration','permanent'));
 PERFORM public.rt11_request(a,issued,ha,'grant',jsonb_build_object('userId',o,'duration','permanent'));
 v:=public.rt11_request(m,issued,hm,'save','{"name":"Rollback fixture","data":"synthetic"}');saved:=v->>'id';
 IF saved IS NULL THEN RAISE EXCEPTION 'Preset missing'; END IF;
 IF jsonb_array_length(public.rt11_request(m,issued,hm,'workspace','{}')->'presets')<>1
 OR jsonb_array_length(public.rt11_request(o,issued,ho,'workspace','{}')->'presets')<>0 THEN RAISE EXCEPTION 'Ownership leak'; END IF;
 BEGIN PERFORM public.rt11_request(o,issued,ho,'delete',jsonb_build_object('id',saved)); RAISE EXCEPTION 'Cross-owner delete';
 EXCEPTION WHEN SQLSTATE 'RT404' THEN NULL; END;
 IF jsonb_array_length(public.rt11_request(m,issued,hm,'export','{}')->'presets')<>1 THEN RAISE EXCEPTION 'Export mismatch'; END IF;
 BEGIN PERFORM public.rt11_request(m,issued,ho,'me','{}'); RAISE EXCEPTION 'Cross-owner session';
 EXCEPTION WHEN SQLSTATE 'RT401' THEN NULL; END;
 PERFORM public.rt11_request(m,issued,hm,'profile','{"name":"Updated synthetic"}');
 PERFORM public.rt11_request(m,issued,hm,'delete',jsonb_build_object('id',saved));
 PERFORM public.rt11_request(m,issued,hm,'logout','{}');
 BEGIN PERFORM public.rt11_request(m,issued,hm,'me','{}'); RAISE EXCEPTION 'Logout failed';
 EXCEPTION WHEN SQLSTATE 'RT401' THEN NULL; END;
 BEGIN PERFORM public.rt11_request(m,issued,hm,'session','{}'); RAISE EXCEPTION 'Old authentication revived';
 EXCEPTION WHEN SQLSTATE 'RT401' THEN NULL; END;
 BEGIN PERFORM public.rt11_request(a,issued,ha,'delete-begin','{}'); RAISE EXCEPTION 'Admin deletion accepted';
 EXCEPTION WHEN SQLSTATE 'RT403' THEN NULL; END;
 PERFORM public.rt11_request(o,issued,ho,'delete-begin','{}');
 BEGIN PERFORM public.rt11_request(o,issued,ho,'me','{}'); RAISE EXCEPTION 'Tombstone ignored';
 EXCEPTION WHEN SQLSTATE 'RT401' THEN NULL; END;
 IF NOT EXISTS(SELECT FROM rt11.audit WHERE action='pro.grant:7d')
 OR NOT EXISTS(SELECT FROM rt11.audit WHERE action='pro.grant:30d')
 OR NOT EXISTS(SELECT FROM rt11.audit WHERE action='pro.grant:permanent')
 OR NOT EXISTS(SELECT FROM rt11.audit WHERE action='pro.revoke')
 OR NOT EXISTS(SELECT FROM rt11.audit WHERE action='preset.create')
 OR NOT EXISTS(SELECT FROM rt11.audit WHERE action='account.delete-pending-provider') THEN RAISE EXCEPTION 'Audit coverage missing'; END IF;
END $$;
ROLLBACK;
SELECT 'rollback-only database smoke completed' AS result,
 (SELECT count(*) FROM rt11.users) AS users,
 (SELECT count(*) FROM rt11.sessions) AS sessions,
 (SELECT count(*) FROM rt11.grants) AS grants,
 (SELECT count(*) FROM rt11.presets) AS presets,
 (SELECT count(*) FROM rt11.audit) AS audit_rows;
