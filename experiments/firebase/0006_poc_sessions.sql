-- Isolated POC database ONLY. Never apply this file to genuine staging.
CREATE TABLE poc_sessions(token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,auth_time INTEGER NOT NULL);
CREATE TABLE poc_revocations(issuer TEXT NOT NULL,subject TEXT NOT NULL,revoked_before INTEGER NOT NULL,PRIMARY KEY(issuer,subject));
CREATE TABLE poc_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT INTO poc_metadata VALUES('isolation','randomtools-firebase-poc-v1');
