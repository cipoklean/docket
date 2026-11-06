import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "hackathons-criteria-tasks",
      sql: `CREATE TABLE IF NOT EXISTS hackathons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  deadline_at TEXT NOT NULL,
  summary TEXT,
  deliverables TEXT NOT NULL DEFAULT '[]',
  submission_draft TEXT,
  demo_script TEXT,
  created_at TEXT NOT NULL DEFAULT (now()),
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
);
CREATE TABLE IF NOT EXISTS hackathon_shares (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (now()),
  notified_at TEXT
);
CREATE TABLE IF NOT EXISTS criteria (
  id TEXT PRIMARY KEY,
  hackathon_id TEXT NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight INTEGER NOT NULL CHECK (weight >= 0 AND weight <= 100),
  description TEXT,
  score INTEGER CHECK (score IS NULL OR (score >= 0 AND score <= 10)),
  rationale TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  owner_email TEXT NOT NULL,
  org_id TEXT
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  hackathon_id TEXT NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  criterion_id TEXT,
  verdict TEXT CHECK (verdict IS NULL OR verdict IN ('ship', 'cut', 'fake')),
  court_argument TEXT,
  recommended_verdict TEXT CHECK (recommended_verdict IS NULL OR recommended_verdict IN ('ship', 'cut', 'fake')),
  position INTEGER NOT NULL DEFAULT 0,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS hackathons_owner_org_deadline_idx ON hackathons (owner_email, org_id, deadline_at);
CREATE INDEX IF NOT EXISTS hackathon_shares_resource_idx ON hackathon_shares (resource_id, principal_type, principal_id);
CREATE INDEX IF NOT EXISTS criteria_hackathon_idx ON criteria (hackathon_id, position);
CREATE INDEX IF NOT EXISTS tasks_hackathon_idx ON tasks (hackathon_id, position)`,
    },
    {
      version: 2,
      name: "submission-checks",
      sql: `ALTER TABLE hackathons ADD COLUMN IF NOT EXISTS repo_url TEXT;
ALTER TABLE hackathons ADD COLUMN IF NOT EXISTS demo_url TEXT;
CREATE TABLE IF NOT EXISTS checks (
  id TEXT PRIMARY KEY,
  hackathon_id TEXT NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('repo_public', 'readme', 'license', 'uses_tech', 'demo_live', 'video_length', 'manual')),
  param TEXT,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'pass', 'fail')),
  evidence TEXT,
  checked_at TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  owner_email TEXT NOT NULL,
  org_id TEXT
);
CREATE INDEX IF NOT EXISTS checks_hackathon_idx ON checks (hackathon_id, position)`,
    },
    {
      version: 3,
      name: "judge-fixes",
      sql: `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS points INTEGER`,
    },
    {
      version: 4,
      name: "judge-guard",
      sql: `ALTER TABLE hackathons ADD COLUMN IF NOT EXISTS judged_fingerprint TEXT`,
    },
    {
      version: 5,
      name: "radar-prize",
      sql: `ALTER TABLE hackathons ADD COLUMN IF NOT EXISTS prize_usd INTEGER`,
    },
    {
      version: 6,
      name: "rate-limits",
      sql: `CREATE TABLE IF NOT EXISTS rate_hits (
  subject TEXT NOT NULL,
  bucket TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, bucket, window_start)
)`,
    },
    {
      version: 7,
      name: "submitted",
      sql: `ALTER TABLE hackathons ADD COLUMN IF NOT EXISTS submitted_at TEXT`,
    },
  ],
  { table: "ship_court_migrations" },
);
