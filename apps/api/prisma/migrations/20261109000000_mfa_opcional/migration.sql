BEGIN;
ALTER TABLE sessions ADD COLUMN mfa_verified_at timestamptz, ADD COLUMN mfa_revision integer;
CREATE TABLE user_mfa (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret text,
  revision integer NOT NULL DEFAULT 0,
  recovery_hashes text[] NOT NULL DEFAULT '{}',
  last_totp_step integer NOT NULL DEFAULT -1,
  pending_secret text,
  pending_expires_at timestamptz,
  pending_session_hash text,
  failed_attempts integer NOT NULL DEFAULT 0,
  blocked_until timestamptz
);
CREATE TABLE mfa_challenges (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  remember_me boolean NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  method text NOT NULL CHECK (method IN ('password', 'google'))
);
CREATE INDEX mfa_challenges_user_id_idx ON mfa_challenges(user_id);
CREATE INDEX mfa_challenges_expires_at_idx ON mfa_challenges(expires_at);
ALTER TABLE user_mfa ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mfa FORCE ROW LEVEL SECURITY;
ALTER TABLE mfa_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_challenges FORCE ROW LEVEL SECURITY;
REVOKE ALL ON user_mfa, mfa_challenges FROM PUBLIC, plugga_runtime, plugga_auth_runtime, plugga_jobs_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_mfa, mfa_challenges TO plugga_auth_runtime;
CREATE POLICY auth_runtime ON user_mfa FOR ALL TO plugga_auth_runtime USING (true) WITH CHECK (true);
CREATE POLICY auth_runtime ON mfa_challenges FOR ALL TO plugga_auth_runtime USING (true) WITH CHECK (true);
COMMIT;
