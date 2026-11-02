-- ONLY apply inside the isolated POC project after both schema migrations.
-- Replace synthetic issuer/subjects with a DEDICATED Clerk development instance
-- and dedicated synthetic accounts. Never use the existing staging instance/key.
-- This file contains no genuine identity or entitlement data.
BEGIN;
SET LOCAL search_path=rt_poc,pg_catalog;
INSERT INTO users VALUES
 ('poc_alice','alice+clerk_test@example.com','Synthetic Alice','CLERK_ONLY','free',1,0,0),
 ('poc_bob','bob+clerk_test@example.com','Synthetic Bob','CLERK_ONLY','free',1,0,0),
 ('poc_admin','admin+clerk_test@example.com','Synthetic Admin','CLERK_ONLY','admin',1,0,0);
INSERT INTO auth_identities VALUES
 ('https://REPLACE.clerk.accounts.dev','user_REPLACEALICE','poc_alice','active',0),
 ('https://REPLACE.clerk.accounts.dev','user_REPLACEBOB','poc_bob','active',0),
 ('https://REPLACE.clerk.accounts.dev','user_REPLACEADMIN','poc_admin','active',0);
INSERT INTO subscriptions VALUES
 ('poc_sub_alice','poc_alice',NULL,floor(extract(epoch FROM now()))+3600,'poc-synthetic',0),
 ('poc_sub_bob','poc_bob',NULL,floor(extract(epoch FROM now()))+3600,'poc-synthetic',0);
INSERT INTO saved_presets
 SELECT 'poc_preset_'||i,'poc_alice','preset','POC synthetic '||i,repeat('x',2048),i FROM generate_series(1,10) i;
INSERT INTO tool_history
 SELECT 'poc_history_'||i,'poc_alice','json',repeat('y',1024),i FROM generate_series(1,10) i;
INSERT INTO saved_presets VALUES('poc_bob_only','poc_bob','preset','Other synthetic owner','private synthetic fixture',0);
INSERT INTO user_preferences VALUES('poc_alice','{"theme":"dark","favourites":["json"]}',30);
COMMIT;
