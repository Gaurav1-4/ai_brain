import { SourceType } from "../types.js";
import { fromBuffer as fileTypeFromBuffer } from "file-type";

/**
 * Detects the content type of a Telegram payload.
 * Supports rule‑based URL detection for Instagram, YouTube, GitHub, Google Docs, Notion, and generic websites.
 * Also performs basic file extension detection for documents (e.g., PDF).
 *
 * @param payload - The incoming Telegram update payload.
 * @returns An object describing the detected source.
 */
export async function detectContent(payload: {
  text: string;
  chatId: string;
  fromUser: string;
  message: any;
}): Promise<{
  sourceType: SourceType;
  url?: string;
  textExcerpt?: string;
  fileBuffer?: Buffer;
  fileName?: string;
}> {
  const { text, message } = payload;
  const trimmed = (text || "").trim();

  // Helper to extract first URL in the text.
  const urlMatch = trimmed.match(/https?:\/\/[^\s]+/i);
  const url = urlMatch ? urlMatch[0] : undefined;

  // Simple file detection based on Telegram document metadata.
  if (message?.document?.file_name) {
    const fileName: string = message.document.file_name as string;
    const ext = fileName.split('.').pop()?.toLowerCase();
    let sourceType: SourceType = "note";
    if (ext === "pdf") sourceType = "pdf";
    // Could add more extensions (e.g., docx -> note) as needed.
    return {
      sourceType,
      fileName,
      // Buffer handling will be performed elsewhere (e.g., via Telegram file API).
    };
  }

  // URL based detection – order matters (specific before generic).
  if (url) {
    // Instagram (posts, reels, tv)
    const instagramRegex = /https?:\/\/([^\/]+\.)?instagram\.com\/(p|reel|tv)\/[^\s/]+/i;
    if (instagramRegex.test(url)) {
      return { sourceType: "instagram", url, textExcerpt: trimmed };
    }

    // YouTube (watch or short links)
    const youtubeRegex = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/i;
    if (youtubeRegex.test(url)) {
      return { sourceType: "youtube", url, textExcerpt: trimmed };
    }

    // GitHub repository (owner/repo)
    const githubRepoRegex = /https?:\/\/(?:www\.)?github\.com\/[^\/\s]+\/[^\/\s]+(?:\.git)?/i;
    if (githubRepoRegex.test(url)) {
      return { sourceType: "github", url, textExcerpt: trimmed };
    }

    // Google Docs
    const googleDocsRegex = /https?:\/\/docs\.google\.com\/document\/d\/[^\s/]+/i;
    if (googleDocsRegex.test(url)) {
      return { sourceType: "article", url, textExcerpt: trimmed };
    }

    // Notion pages
    const notionRegex = /https?:\/\/[^\s]*?notion\.so\/[^
\s]*/i;
    if (notionRegex.test(url)) {
      return { sourceType: "note", url, textExcerpt: trimmed };
    }

    // Fallback generic website
    return { sourceType: "website", url, textExcerpt: trimmed };
  }

  // No URL and no file – treat as a plain note.
  return { sourceType: "note", textExcerpt: trimmed };
}
