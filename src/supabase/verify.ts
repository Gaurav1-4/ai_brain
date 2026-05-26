// src/supabase/verify.ts
import { supabase } from "./client.js";
import { saveInboxItem, getInboxItem, getUnprocessedInboxItems, loadSyncState, saveSyncState, computeContentHash } from "./TelegramPersistence.js";
import { TelegramInboxItem } from "../types.js";

async function main() {
  console.log("--- Verification Start ---");

  // 1. Insert a test inbox item
  const testItem: TelegramInboxItem = {
    telegramMessageId: Date.now(),
    telegramUpdateId: Date.now(),
    sourceType: "url",
    url: "https://example.com",
    fileUrl: undefined,
    rawContent: undefined,
    metadata: { chatId: "123", fromUser: "tester" },
    receivedAt: new Date().toISOString(),
    synced: false,
    processed: false,
    // optional fields for persistence
    contentHash: undefined,
    processedAt: undefined,
    failed: false,
    errorMessage: null,
  };

  const inserted = await saveInboxItem(testItem);
  console.log("Inserted / existing record:", inserted);

  // 2. Load the same item by id
  const loaded = await getInboxItem(inserted.id);
  console.log("Loaded by id:", loaded);

  // 3. Clear runtime cache – we just re‑instantiate supabase client (no cache here)
  // Simulate by creating a fresh client instance
  const { createClient } = await import("@supabase/supabase-js");
  const fresh = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  // Use fresh client for subsequent query
  const { data: freshLoaded, error } = await fresh
    .from("telegram_inbox")
    .select("*")
    .eq("id", inserted.id)
    .single();
  if (error) throw error;
  console.log("Reloaded with fresh client:", freshLoaded);

  // 4. Verify deduplication – try to insert same item again
  const duplicate = await saveInboxItem(testItem);
  console.log("Duplicate insert result (should be same as first):", duplicate);

  // 5. Sync state test
  const currentState = await loadSyncState();
  console.log("Current sync state:", currentState);
  await saveSyncState(testItem.telegramUpdateId);
  const newState = await loadSyncState();
  console.log("New sync state after save:", newState);

  console.log("--- Verification End ---");
}

main().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
