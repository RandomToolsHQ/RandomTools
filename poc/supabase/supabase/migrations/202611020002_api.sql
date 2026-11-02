BEGIN;
-- This surface is accessible only to the Edge Function's server-held service key.
-- Verified Clerk identity is supplied by that function, never taken from JSON input.
CREATE FUNCTION public.rt_poc_rate() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, rt_poc AS $$
DECLARE n bigint; ts bigint := floor(extract(epoch FROM clock_timestamp()));
BEGIN
  INSERT INTO rt_poc.rate_limits(key,count,expires_at)
    VALUES('poc-global',1,ts+10)
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN rt_poc.rate_limits.expires_at<=ts THEN 1 ELSE rt_poc.rate_limits.count+1 END,
      expires_at=CASE WHEN rt_poc.rate_limits.expires_at<=ts THEN ts+10 ELSE rt_poc.rate_limits.expires_at END
    RETURNING count INTO n;
  RETURN n<=20;
END $$;

CREATE FUNCTION public.rt_poc_request(p_issuer text,p_subject text,p_operation text,p_body jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, rt_poc AS $$
DECLARE
  u rt_poc.users%ROWTYPE;
  pro boolean;
  ts bigint := floor(extract(epoch FROM clock_timestamp()));
  new_id text;
  changed bigint;
BEGIN
  -- Lock account authorization for this transaction, including entitlement reads/writes.
  SELECT users.* INTO u FROM rt_poc.auth_identities a
    JOIN rt_poc.users users ON users.id=a.user_id
    WHERE a.issuer=p_issuer AND a.subject=p_subject AND a.state='active'
    FOR UPDATE OF users, a;
  IF u.id IS NULL OR u.disabled<>0 OR u.verified<>1 THEN
    RAISE EXCEPTION 'Denied' USING ERRCODE='RT403';
  END IF;
  IF jsonb_typeof(p_body)<>'object' THEN RAISE EXCEPTION 'Invalid body' USING ERRCODE='RT400'; END IF;
  pro := u.role='admin' OR EXISTS(SELECT 1 FROM rt_poc.subscriptions s WHERE s.user_id=u.id AND s.paid_through>ts);
  IF p_operation='me' THEN
    RETURN jsonb_build_object('id',u.id,'role',u.role,'pro',pro);
  ELSIF p_operation='admin' THEN
    IF u.role<>'admin' THEN RAISE EXCEPTION 'Denied' USING ERRCODE='RT403'; END IF;
    INSERT INTO rt_poc.audit_logs VALUES(gen_random_uuid()::text,u.id,'poc.admin.read',NULL,ts);
    RETURN jsonb_build_object('users',(SELECT count(*) FROM rt_poc.users));
  END IF;
  IF NOT pro THEN RAISE EXCEPTION 'Denied' USING ERRCODE='RT403'; END IF;
  IF p_operation='workspace' THEN
    RETURN jsonb_build_object(
      'presets',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM
        (SELECT id,kind,name,data,created_at FROM rt_poc.saved_presets WHERE user_id=u.id ORDER BY created_at DESC,id LIMIT 100) p),'[]'::jsonb),
      'history',coalesce((SELECT jsonb_agg(to_jsonb(h)) FROM
        (SELECT id,tool,data,created_at FROM rt_poc.tool_history WHERE user_id=u.id ORDER BY created_at DESC,id LIMIT 100) h),'[]'::jsonb),
      'preferences',(SELECT to_jsonb(p)-'user_id' FROM rt_poc.user_preferences p WHERE user_id=u.id));
  ELSIF p_operation='save' THEN
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_body) k WHERE k NOT IN ('name','data')) OR
      jsonb_typeof(p_body->'name') IS DISTINCT FROM 'string' OR
      jsonb_typeof(p_body->'data') IS DISTINCT FROM 'string' OR
      length(p_body->>'name') NOT BETWEEN 1 AND 80 OR
      octet_length(p_body->>'data')>4096 THEN
      RAISE EXCEPTION 'Invalid body' USING ERRCODE='RT400';
    END IF;
    IF (SELECT count(*) FROM rt_poc.saved_presets WHERE user_id=u.id)>=100 THEN
      RAISE EXCEPTION 'Quota' USING ERRCODE='RT403';
    END IF;
    new_id:=gen_random_uuid()::text;
    INSERT INTO rt_poc.saved_presets VALUES(new_id,u.id,'preset',p_body->>'name',p_body->>'data',ts);
    INSERT INTO rt_poc.audit_logs VALUES(gen_random_uuid()::text,u.id,'poc.preset.create',new_id,ts);
    RETURN jsonb_build_object('id',new_id);
  ELSIF p_operation='delete' THEN
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_body) k WHERE k<>'id') OR
      jsonb_typeof(p_body->'id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Invalid body' USING ERRCODE='RT400';
    END IF;
    DELETE FROM rt_poc.saved_presets WHERE saved_presets.id=p_body->>'id' AND user_id=u.id;
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>1 THEN RAISE EXCEPTION 'Not found' USING ERRCODE='RT404'; END IF;
    INSERT INTO rt_poc.audit_logs VALUES(gen_random_uuid()::text,u.id,'poc.preset.delete',p_body->>'id',ts);
    RETURN jsonb_build_object('deleted',true);
  END IF;
  RAISE EXCEPTION 'Invalid operation' USING ERRCODE='RT400';
END $$;

REVOKE ALL ON FUNCTION public.rt_poc_rate() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rt_poc_request(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rt_poc_rate() TO service_role;
GRANT EXECUTE ON FUNCTION public.rt_poc_request(text,text,text,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
