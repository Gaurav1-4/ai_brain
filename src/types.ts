// Updated TelegramInboxItem with additional fields for Supabase persistence
export interface TelegramInboxItem {
  telegramMessageId: number;
  telegramUpdateId: number;
  sourceType: SourceType;
  url?: string;
  fileUrl?: string;
  rawContent?: string;
  metadata?: Record<string, any>;
  receivedAt: string;
  synced: boolean;
  processed: boolean;
  // New fields
  contentHash?: string;
  processedAt?: string | null;
  failed?: boolean;
  errorMessage?: string | null;
}
