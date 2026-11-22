CREATE TABLE planner_days (
  day DATE PRIMARY KEY,
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE google_connections (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  email TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE external_tasks (
  source TEXT NOT NULL CHECK (source IN ('google', 'gmail')),
  external_id TEXT NOT NULL,
  task_list_id TEXT,
  title TEXT NOT NULL,
  due_date DATE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  email_from TEXT,
  email_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source, external_id)
);

CREATE INDEX external_tasks_due_date_idx
  ON external_tasks (due_date) WHERE NOT is_deleted;

CREATE TABLE point_ledger (
  id BIGSERIAL PRIMARY KEY,
  amount INTEGER NOT NULL CHECK (amount <> 0),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('earn', 'spend')),
  task_key TEXT,
  task_date DATE,
  reward_id TEXT,
  reward_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (entry_type = 'earn' AND amount > 0 AND task_key IS NOT NULL)
    OR (entry_type = 'spend' AND amount < 0 AND reward_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX point_ledger_task_award_idx
  ON point_ledger (task_key) WHERE entry_type = 'earn';
