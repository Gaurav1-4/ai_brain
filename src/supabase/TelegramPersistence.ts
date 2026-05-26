// src/supabase/TelegramPersistence.ts
import { supabase } from "./client.js";
import { TelegramInboxItem } from "../types.js";
import crypto from "crypto";

function computeContentHash(item: TelegramInboxItem): string {
  // Prioritize URL, then fileUrl, then rawContent for deduplication
  const hashSource = item.url ?? item.fileUrl ?? item.rawContent ?? "";
  return crypto.createHash("sha256").update(hashSource).digest("hex");
}

/** Find an inbox row by its content hash. */
export async function findInboxByHash(hash: string) {
  const { data, error } = await supabase
    .from("telegram_inbox")
    .select("id, content_hash")
    .eq("content_hash", hash)
    .single();
  if (error && error.code !== "PGRST116") {
    // PGRST116 = No rows found – treat as not existent.
    throw error;
  }
  return data ?? null;
}

/** Save a TelegramInboxItem if it is not a duplicate.
 * Returns the inserted row (or the existing one if duplicate).
 */
export async function saveInboxItem(item: TelegramInboxItem) {
  const contentHash = computeContentHash(item);
  // Deduplication – check first.
  const existing = await findInboxByHash(contentHash);
  if (existing) {
    // Already persisted – return existing record.
    return existing;
  }

  const { data, error } = await supabase.from("telegram_inbox").insert({
    telegram_message_id: item.telegramMessageId,
    telegram_update_id: item.telegramUpdateId,
    source_type: item.sourceType,
    url: item.url ?? null,
    file_url: item.fileUrl ?? null,
    raw_content: item.rawContent ?? null,
    metadata: item.metadata ?? null,
    content_hash: contentHash,
    received_at: item.receivedAt,
    processed: item.processed ?? false,
    failed: item.failed ?? false,
    error_message: item.errorMessage ?? null,
  }).select().single();
  if (error) {
    throw error;
  }
  return data;
}

/** Retrieve a single inbox item by its UUID primary key. */
export async function getInboxItem(id: string) {
  const { data, error } = await supabase
    .from("telegram_inbox")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    throw error;
  }
  return data;
}

/** Retrieve all inbox items that have not yet been processed. */
export async function getUnprocessedInboxItems() {
  const { data, error } = await supabase
    .from("telegram_inbox")
    .select("*")
    .eq("processed", false)
    .order("received_at", { ascending: true });
  if (error) {
    throw error;
  }
  return data;
}

/** Load the current sync state (last processed Telegram update_id). */
export async function loadSyncState() {
  const { data, error } = await supabase
    .from("telegram_sync_state")
    .select("last_update_id")
    .eq("id", 1)
    .single();
  if (error && error.code !== "PGRST116") {
    throw error;
  }
  return data?.last_update_id ?? 0;
}

/** Persist the latest processed Telegram update_id. */
export async function saveSyncState(updateId: number) {
  // Migration: create telegram_sync_state table
  // CREATE TABLE IF NOT EXISTS telegram_sync_state (
  //   id INTEGER PRIMARY KEY DEFAULT 1,
  //   last_update_id BIGINT NOT NULL DEFAULT 0,
  //   last_sync_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  //   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  // );
  //
  // -- Ensure only one row exists
  // CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_sync_state_id ON telegram_sync_state(id);

  const { error } = await supabase
    .from("telegram_sync_state")
    .upsert({ id: 1, last_update_id: updateId, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) {
    throw error;
  }
}

export { computeContentHash };
