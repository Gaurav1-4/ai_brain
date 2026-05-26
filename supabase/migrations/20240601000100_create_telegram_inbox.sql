-- Migration: create telegram_inbox table
CREATE TABLE IF NOT EXISTS telegram_inbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_message_id BIGINT NOT NULL,
  telegram_update_id BIGINT NOT NULL,
  source_type TEXT NOT NULL,
  url TEXT,
  file_url TEXT,
  raw_content TEXT,
  metadata JSONB,
  content_hash TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  failed BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT,
  duplicate_count INTEGER NOT NULL DEFAULT 0
);

-- Indexes for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_inbox_content_hash_unique ON telegram_inbox(content_hash);
CREATE INDEX IF NOT EXISTS idx_telegram_inbox_update_id ON telegram_inbox(telegram_update_id);
CREATE INDEX IF NOT EXISTS idx_telegram_inbox_processed ON telegram_inbox(processed);
CREATE INDEX IF NOT EXISTS idx_telegram_inbox_received_at ON telegram_inbox(received_at);
