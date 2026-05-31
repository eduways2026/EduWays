-- migrations/0002_user_accounts.sql
-- EduWays — User Accounts, Sessions, Profiles, Pathways, Email Log
-- Run: psql $DATABASE_URL -f migrations/0002_user_accounts.sql

-- ENUMS
DO $$ BEGIN CREATE TYPE degree_level   AS ENUM ('certificate','associate','bachelor','master','doctoral'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE class_mode     AS ENUM ('in_person','online','hybrid','no_preference');           EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE schedule_type  AS ENUM ('full_time','part_time','accelerated','flexible');        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE gpa_range      AS ENUM ('below_2','2_to_2_5','2_5_to_3','3_to_3_5','3_5_to_4'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE residency      AS ENUM ('in_state','out_of_state','international');               EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE email_status   AS ENUM ('pending','sent','failed','bounced');                     EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  email_verified  BOOLEAN DEFAULT FALSE,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_login_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token  TEXT NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ip_address     TEXT,
  user_agent     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- STUDENT PROFILES
CREATE TABLE IF NOT EXISTS student_profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name           TEXT NOT NULL,
  last_name            TEXT NOT NULL,
  home_state           CHAR(2) NOT NULL,
  residency            residency NOT NULL DEFAULT 'in_state',
  residency_state      CHAR(2),
  career_title         TEXT NOT NULL,
  career_soc_code      TEXT,
  gpa_range            gpa_range,
  transfer_credits     INTEGER DEFAULT 0,
  budget_cents         INTEGER NOT NULL DEFAULT 1500000,
  degree_level         degree_level DEFAULT 'bachelor',
  class_mode           class_mode DEFAULT 'no_preference',
  schedule_type        schedule_type DEFAULT 'full_time',
  weight_debt          INTEGER DEFAULT 90,
  weight_speed         INTEGER DEFAULT 60,
  weight_transfer      INTEGER DEFAULT 85,
  weight_roi           INTEGER DEFAULT 70,
  onboarding_complete  BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profiles_user      ON student_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_state     ON student_profiles(home_state);
CREATE INDEX IF NOT EXISTS idx_profiles_residency ON student_profiles(residency);

-- SAVED PATHWAYS
CREATE TABLE IF NOT EXISTS saved_pathways (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id              UUID NOT NULL REFERENCES student_profiles(id),
  pathway_rank            INTEGER NOT NULL,
  pathway_name            TEXT NOT NULL,
  institution_from        TEXT,
  institution_to          TEXT,
  institution_from_url    TEXT,
  institution_to_url      TEXT,
  total_cost_cents        INTEGER,
  duration_semesters      INTEGER,
  pathly_score            REAL,
  roi_grade               TEXT,
  licensing_met           BOOLEAN DEFAULT FALSE,
  description             TEXT,
  key_facts               TEXT[] DEFAULT '{}',
  instate_annual_cost     INTEGER,
  outofstate_annual_cost  INTEGER,
  user_annual_cost        INTEGER,
  is_recommended          BOOLEAN DEFAULT FALSE,
  created_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pathways_user    ON saved_pathways(user_id);
CREATE INDEX IF NOT EXISTS idx_pathways_profile ON saved_pathways(profile_id);

-- EMAIL LOG
CREATE TABLE IF NOT EXISTS email_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  to_email       TEXT NOT NULL,
  subject        TEXT NOT NULL,
  template       TEXT NOT NULL,
  status         email_status DEFAULT 'pending',
  provider_id    TEXT,
  error_message  TEXT,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_user   ON email_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_status ON email_log(status);

-- VERIFICATION TOKENS
CREATE TABLE IF NOT EXISTS verification_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vtokens_token ON verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_vtokens_user  ON verification_tokens(user_id);

-- Cleanup expired sessions automatically (optional: add pg_cron job)
-- DELETE FROM sessions WHERE expires_at < NOW();
