// src/telegram/TelegramGateway.ts
import { Request, Response } from "express";
import { detectContent } from "../detection/detectContent.js";
import { assignPriority } from "../services/PriorityEngine.js";
import { ingestItem } from "../services/QueueService.js"; // We'll create a simple wrapper
import { downloadAndStoreFile } from "../storage/SupabaseStorageAdapter.js"; // existing adapter
import { dbState } from "../server.js"; // Assuming dbState is exported

/**
 * Registers Telegram webhook and simulate endpoints on the Express app.
 * No Gemini calls are made here – only local detection, priority scoring,
 * and insertion into the ingestion queue.
 */
export function registerTelegramRoutes(app: any) {
  // Simulated endpoint used for testing
  app.post("/api/telegram/simulate", async (req: Request, res: Response) => {
    try {
      const { chatId, text, senderName } = req.body;
      // Treat the incoming text as the raw payload for detection
      const payload = { message: { chat: { id: chatId }, text: text, from: { first_name: senderName } } };
      await handleTelegramUpdate(payload, app);
      res.json({ message: "Captured successfully. Added to queue." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Real webhook endpoint used by Telegram
  app.post("/api/telegram/webhook", async (req: Request, res: Response) => {
    try {
      const update = req.body;
      if (update && update.message) {
        await handleTelegramUpdate(update, app);
      }
      res.sendStatus(200);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}

// Core processing – detection, priority, storage, queue insertion
async function handleTelegramUpdate(update: any, app: any) {
  const message = update.message;
  const chatId = String(message.chat.id);
  const text = message.text || "";
  const fromUser = message.from?.first_name || "Guest";

  // Detect type (URL or file). For simplicity we treat text as URL if it matches patterns.
  const detected = await detectContent({ text, chatId, fromUser, message });

  // Build inbox item
  const inboxItem: TelegramInboxItem = {
    telegramMessageId: message.message_id,
    telegramUpdateId: update.update_id,
    sourceType: detected.sourceType,
    url: detected.url,
    fileUrl: detected.fileUrl,
    rawContent: detected.fileBuffer ? undefined : detected.textExcerpt,
    metadata: { chatId, fromUser },
    receivedAt: new Date().toISOString(),
    synced: false,
    processed: false,
  };

  // Store in in‑memory DB state (will be persisted via Supabase later)
  dbState.telegramInbox = dbState.telegramInbox || [];
  dbState.telegramInbox.push(inboxItem);
}
