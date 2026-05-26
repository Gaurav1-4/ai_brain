-- Migration: create telegram_sync_state table
CREATE TABLE IF NOT EXISTS telegram_sync_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_update_id BIGINT NOT NULL DEFAULT 0,
  last_sync_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only one row exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_sync_state_id ON telegram_sync_state(id);
