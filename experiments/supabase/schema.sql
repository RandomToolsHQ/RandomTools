-- Phase 11 ONLY. New namespace; abort on collision. Never apply to D1.
BEGIN;
CREATE SCHEMA rt11;
REVOKE ALL ON SCHEMA rt11 FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE rt11.metadata(key text PRIMARY KEY,value text NOT NULL);
INSERT INTO rt11.metadata VALUES('isolation','randomtools-phase11-v1');
CREATE TABLE rt11.users(
 id text PRIMARY KEY,subject text NOT NULL UNIQUE,email text NOT NULL UNIQUE,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 role text NOT NULL DEFAULT 'free' CHECK(role IN ('free','admin')),
 disabled boolean NOT NULL DEFAULT false,deleted boolean NOT NULL DEFAULT false,
 revoked_before bigint NOT NULL DEFAULT 0,delete_nonce text,
 CHECK(email ~ '^phase11-[a-f0-9-]+-(admin|member|other)@example\.com$')
);
CREATE TABLE rt11.sessions(hash text PRIMARY KEY,user_id text NOT NULL REFERENCES rt11.users(id) ON DELETE CASCADE,
 auth_time bigint NOT NULL,expires_at bigint NOT NULL);
CREATE INDEX ON rt11.sessions(user_id);
CREATE TABLE rt11.grants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL REFERENCES rt11.users(id) ON DELETE CASCADE,
 expires_at bigint,revoked_at bigint,created_by text NOT NULL REFERENCES rt11.users(id));
CREATE INDEX ON rt11.grants(user_id);
CREATE TABLE rt11.presets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL REFERENCES rt11.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),data text NOT NULL CHECK(octet_length(data)<=4096),created_at bigint NOT NULL);
CREATE INDEX ON rt11.presets(user_id);
CREATE TABLE rt11.audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor text,action text NOT NULL,target text,at bigint NOT NULL);
CREATE TABLE rt11.rate(key text PRIMARY KEY,n bigint NOT NULL,expires_at bigint NOT NULL);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['metadata','users','sessions','grants','presets','audit','rate'] LOOP
  EXECUTE format('ALTER TABLE rt11.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE rt11.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON rt11.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;

-- All identity/session parameters come from the independently verified Edge handler.
-- No browser/direct anon RPC access. Fixed search path; no user-controlled SQL.
CREATE FUNCTION public.rt11_rate(p_key text,p_limit integer,p_window integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,rt11 AS $$
DECLARE c bigint; ts bigint:=floor(extract(epoch FROM clock_timestamp()));
BEGIN
 IF p_limit NOT BETWEEN 1 AND 100 OR p_window NOT BETWEEN 1 AND 60 OR length(p_key)>128 THEN
  RAISE EXCEPTION 'Invalid' USING ERRCODE='RT400'; END IF;
 INSERT INTO rt11.rate VALUES(p_key,1,ts+p_window) ON CONFLICT(key) DO UPDATE SET
 n=CASE WHEN rate.expires_at<=ts THEN 1 ELSE rate.n+1 END,
 expires_at=CASE WHEN rate.expires_at<=ts THEN ts+p_window ELSE rate.expires_at END RETURNING n INTO c;
 RETURN c<=p_limit;
END $$;

CREATE FUNCTION public.rt11_request(p_subject text,p_auth_time bigint,p_session text,p_operation text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,rt11 AS $$
DECLARE u rt11.users%ROWTYPE; target_user rt11.users%ROWTYPE;
 ts bigint:=floor(extract(epoch FROM clock_timestamp())); pro boolean; result jsonb; new_id uuid; exp bigint;
BEGIN
 IF (SELECT value FROM rt11.metadata WHERE key='isolation') IS DISTINCT FROM 'randomtools-phase11-v1' THEN
  RAISE EXCEPTION 'Isolation' USING ERRCODE='RT503'; END IF;
 IF p_body IS NULL OR jsonb_typeof(p_body)<>'object' OR p_session !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'Invalid' USING ERRCODE='RT400'; END IF;
 -- Serialize mutations against a fresh account row. Roles never come from JWT/body.
 SELECT * INTO u FROM rt11.users WHERE subject=p_subject FOR UPDATE;
 IF u.id IS NULL OR u.disabled OR u.deleted OR p_auth_time<=u.revoked_before THEN
  RAISE EXCEPTION 'Inactive' USING ERRCODE='RT401'; END IF;
 IF p_operation='session' THEN
  IF p_body<>'{}' OR ts-p_auth_time NOT BETWEEN 0 AND 299 THEN RAISE EXCEPTION 'Recent sign-in' USING ERRCODE='RT403'; END IF;
  DELETE FROM rt11.sessions WHERE user_id=u.id AND expires_at<=ts;
  IF (SELECT count(*) FROM rt11.sessions WHERE user_id=u.id)>=10 THEN RAISE EXCEPTION 'Sessions' USING ERRCODE='RT429'; END IF;
  INSERT INTO rt11.sessions VALUES(p_session,u.id,p_auth_time,ts+1800);
  INSERT INTO rt11.audit(actor,action,target,at) VALUES(u.id,'session.start',u.id,ts);
  RETURN jsonb_build_object('started',true);
 END IF;
 IF NOT EXISTS(SELECT FROM rt11.sessions WHERE hash=p_session AND user_id=u.id AND auth_time=p_auth_time AND expires_at>ts) THEN
  RAISE EXCEPTION 'Session' USING ERRCODE='RT401'; END IF;
 pro:=u.role='admin' OR EXISTS(SELECT FROM rt11.grants WHERE user_id=u.id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>ts));
 IF p_operation IN ('me','workspace','export','logout','admin','delete-begin') AND p_body<>'{}' THEN
  RAISE EXCEPTION 'Invalid' USING ERRCODE='RT400'; END IF;
 IF p_operation='me' THEN RETURN jsonb_build_object('user',jsonb_build_object('id',u.id,'name',u.name,'role',u.role),'pro',pro,'paymentsEnabled',false);
 ELSIF p_operation='logout' THEN
  UPDATE rt11.users SET revoked_before=ts WHERE id=u.id;
  DELETE FROM rt11.sessions WHERE user_id=u.id;
  INSERT INTO rt11.audit(actor,action,target,at) VALUES(u.id,'session.revoke-all',u.id,ts);
  RETURN jsonb_build_object('revoked',true);
 ELSIF p_operation='profile' THEN
  IF p_body-ARRAY['name']<>'{}' OR jsonb_typeof(p_body->'name') IS DISTINCT FROM 'string' OR length(btrim(p_body->>'name')) NOT BETWEEN 1 AND 80 THEN
   RAISE EXCEPTION 'Invalid' USING ERRCODE='RT400'; END IF;
  UPDATE rt11.users SET name=btrim(p_body->>'name') WHERE id=u.id;
  INSERT INTO rt11.audit(actor,action,target,at) VALUES(u.id,'profile.update',u.id,ts);
  RETURN jsonb_build_object('updated',true);
 ELSIF p_operation='export' THEN
  RETURN jsonb_build_object('user',to_jsonb(u)-ARRAY['subject','revoked_before','delete_nonce'],
   'presets',coalesce((SELECT jsonb_agg(to_jsonb(p)-'user_id') FROM rt11.presets p WHERE user_id=u.id),'[]'),
   'grants',coalesce((SELECT jsonb_agg(to_jsonb(g)-'created_by') FROM rt11.grants g WHERE user_id=u.id),'[]'));
 ELSIF p_operation='admin' THEN
  IF u.role<>'admin' THEN RAISE EXCEPTION 'Denied' USING ERRCODE='RT403'; END IF;
  INSERT INTO rt11.audit(actor,action,target,at) VALUES(u.id,'admin.read',NULL,ts);
  RETURN jsonb_build_object('users',(SELECT count(*) FROM rt11.users WHERE NOT deleted));
 ELSIF p_operation IN ('grant','revoke') THEN
  IF u.role<>'admin' THEN RAISE EXCEPTION 'Denied' USING ERRCODE='RT403'; END IF;
  IF p_body-ARRAY['userId','duration']<>'{}' OR jsonb_typeof(p_body->'userId') IS DISTINCT FROM 'string' THEN
   RAISE EXCEPTION 'Invalid' USING ERRCODE='RT400'; END IF;
  SELECT * INTO target_user FROM rt11.users WHERE id=p_body->>'userId' AND NOT deleted FOR UPDATE;
  IF target_user.id IS NULL THEN RAISE EXCEPTION 'Missing' USING ERRCODE='RT404'; END IF;
  IF p_operation='grant' THEN
   IF target_user.disabled THEN RAISE EXCEPTION 'Disabled' USING ERRCODE='RT403'; END IF;
   IF p_body->>'duration' NOT IN ('7d','30d','permanent') OR p_body->>'duration' IS NULL THEN RAISE EXCEPTION 'Invalid' USING ERRCODE='RT400'; END IF;
   -- Cap retained grant rows; superseded grants are represented in the audit log.
   DELETE FROM rt11.grants WHERE user_id=target_user.id;
   exp:=CASE p_body->>'duration' WHEN '7d' THEN ts+604800 WHEN '30d' THEN ts+2592000 ELSE NULL END;
   INSERT INTO rt11.grants(user_id,expires_at,created_by) VALUES(target_user.id,exp,u.id);
  ELSE
   IF p_body ? 'duration' THEN RAISE EXCEPTION 'Invalid' USING ERRCODE='RT400'; END IF;
   UPDATE rt11.grants SET revoked_at=ts WHERE user_id=target_user.id AND revoked_at IS NULL;
  END IF;
  INSERT INTO rt11.audit(actor,action,target,at) VALUES(u.id,'pro.'||p_operation||coalesce(':'||(p_body->>'duration'),''),target_user.id,ts);
  RETURN jsonb_build_object('updated',true);
 ELSIF p_operation='delete-begin' THEN
  IF u.role='admin' OR ts-p_auth_time NOT BETWEEN 0 AND 299 THEN RAISE EXCEPTION 'Recent nonadmin sign-in required' USING ERRCODE='RT403'; END IF;
  -- Fail closed before external provider deletion; no cross-provider atomicity claim.
  UPDATE rt11.users SET disabled=true,deleted=true,revoked_before=ts,delete_nonce=p_session WHERE id=u.id;
  DELETE FROM rt11.sessions WHERE user_id=u.id;
  DELETE FROM rt11.presets WHERE user_id=u.id;
  DELETE FROM rt11.grants WHERE user_id=u.id;
  UPDATE rt11.users SET email='phase11-'||md5(u.id)||'-member@example.com',name='Deleted synthetic account' WHERE id=u.id;
  INSERT INTO rt11.audit(actor,action,target,at) VALUES(u.id,'account.delete-pending-provider',u.id,ts);
  RETURN jsonb_build_object('pendingProvider',true);
 END IF;
 IF NOT pro THEN RAISE EXCEPTION 'Pro' USING ERRCODE='RT403'; END IF;
 IF p_operation='workspace' THEN
  RETURN jsonb_build_object('presets',coalesce((SELECT jsonb_agg(to_jsonb(p)-'user_id') FROM
   (SELECT * FROM rt11.presets WHERE user_id=u.id ORDER BY created_at DESC,id LIMIT 100) p),'[]'));
 ELSIF p_operation='save' THEN
  IF p_body-ARRAY['name','data']<>'{}' OR jsonb_typeof(p_body->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(p_body->'data') IS DISTINCT FROM 'string'
   OR length(btrim(p_body->>'name')) NOT BETWEEN 1 AND 80 OR octet_length(p_body->>'data')>4096 THEN RAISE EXCEPTION 'Invalid' USING ERRCODE='RT400'; END IF;
  IF (SELECT count(*) FROM rt11.presets WHERE user_id=u.id)>=100 THEN RAISE EXCEPTION 'Quota' USING ERRCODE='RT409'; END IF;
  INSERT INTO rt11.presets(user_id,name,data,created_at) VALUES(u.id,btrim(p_body->>'name'),p_body->>'data',ts) RETURNING id INTO new_id;
  INSERT INTO rt11.audit(actor,action,target,at) VALUES(u.id,'preset.create',new_id::text,ts);
  RETURN jsonb_build_object('id',new_id);
 ELSIF p_operation='delete' THEN
  IF p_body-ARRAY['id']<>'{}' OR jsonb_typeof(p_body->'id') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid' USING ERRCODE='RT400'; END IF;
  DELETE FROM rt11.presets WHERE id::text=p_body->>'id' AND user_id=u.id RETURNING id INTO new_id;
  IF new_id IS NULL THEN RAISE EXCEPTION 'Missing' USING ERRCODE='RT404'; END IF;
  INSERT INTO rt11.audit(actor,action,target,at) VALUES(u.id,'preset.delete',new_id::text,ts);
  RETURN jsonb_build_object('deleted',true);
 END IF;
 RAISE EXCEPTION 'Invalid operation' USING ERRCODE='RT400';
END $$;
CREATE FUNCTION public.rt11_finish_delete(p_subject text,p_nonce text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,rt11 AS $$
DECLARE uid text;
BEGIN
 UPDATE rt11.users SET delete_nonce=NULL WHERE subject=p_subject AND deleted AND delete_nonce=p_nonce RETURNING id INTO uid;
 IF uid IS NULL THEN RAISE EXCEPTION 'Denied' USING ERRCODE='RT403'; END IF;
 INSERT INTO rt11.audit(actor,action,target,at) VALUES(uid,'account.delete-provider-confirmed',uid,floor(extract(epoch FROM clock_timestamp())));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.rt11_rate(text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rt11_request(text,bigint,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rt11_rate(text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rt11_request(text,bigint,text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.rt11_finish_delete(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rt11_finish_delete(text,text) TO service_role;
COMMIT;
