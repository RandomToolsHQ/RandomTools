-- Isolated synthetic-data proof of concept. Never apply to Cloudflare.
BEGIN;
CREATE SCHEMA rt_poc;
REVOKE ALL ON SCHEMA rt_poc FROM PUBLIC, anon, authenticated;
SET LOCAL search_path = rt_poc, pg_catalog;

CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'free' CHECK(role IN ('free','admin')),verified BIGINT NOT NULL DEFAULT 0,disabled BIGINT NOT NULL DEFAULT 0,created_at BIGINT NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at BIGINT NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE email_verification_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at BIGINT NOT NULL);
CREATE TABLE password_reset_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at BIGINT NOT NULL);
CREATE TABLE subscriptions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,event_id TEXT UNIQUE,paid_through BIGINT NOT NULL,source TEXT NOT NULL,created_at BIGINT NOT NULL);
CREATE INDEX subscriptions_user_expiry ON subscriptions(user_id,paid_through);
CREATE TABLE payment_events(id TEXT PRIMARY KEY,transaction_id TEXT NOT NULL UNIQUE,event_type TEXT NOT NULL,amount TEXT NOT NULL,currency TEXT NOT NULL,member BIGINT NOT NULL,received_at BIGINT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',user_id TEXT REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE membership_claims(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,transaction_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at BIGINT NOT NULL,UNIQUE(user_id,transaction_id));
CREATE TABLE user_preferences(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,data TEXT NOT NULL DEFAULT '{}',retention_days BIGINT NOT NULL DEFAULT 30 CHECK(retention_days IN (0,7,30,90)));
CREATE TABLE saved_presets(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('preset','workflow')),name TEXT NOT NULL,data TEXT NOT NULL,created_at BIGINT NOT NULL);
CREATE INDEX presets_user ON saved_presets(user_id);
CREATE TABLE tool_history(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,tool TEXT NOT NULL,data TEXT NOT NULL,created_at BIGINT NOT NULL);
CREATE INDEX history_user_date ON tool_history(user_id,created_at);
CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT NOT NULL,target_id TEXT,created_at BIGINT NOT NULL);
CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count BIGINT NOT NULL,expires_at BIGINT NOT NULL);
CREATE TABLE tool_availability(tool TEXT PRIMARY KEY,enabled BIGINT NOT NULL DEFAULT 1);
CREATE TABLE usage_daily(day TEXT NOT NULL,tool TEXT NOT NULL,count BIGINT NOT NULL DEFAULT 0,PRIMARY KEY(day,tool));

CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX verification_user ON email_verification_tokens(user_id);
CREATE INDEX verification_expiry ON email_verification_tokens(expires_at);
CREATE INDEX reset_user ON password_reset_tokens(user_id);
CREATE INDEX reset_expiry ON password_reset_tokens(expires_at);
CREATE INDEX payment_user_date ON payment_events(user_id,received_at);
CREATE INDEX claims_user_date ON membership_claims(user_id,created_at);
CREATE INDEX audit_date ON audit_logs(created_at);
CREATE INDEX rate_expiry ON rate_limits(expires_at);

CREATE TABLE auth_identities ( issuer TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL, state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','deleting','deleted')), created_at BIGINT NOT NULL, PRIMARY KEY(issuer,subject) );

DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='rt_poc' LOOP
  EXECUTE format('ALTER TABLE rt_poc.%I ENABLE ROW LEVEL SECURITY',t.tablename);
  EXECUTE format('REVOKE ALL ON TABLE rt_poc.%I FROM PUBLIC, anon, authenticated',t.tablename);
 END LOOP;
END $$;
COMMIT;
