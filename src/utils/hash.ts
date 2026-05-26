// src/utils/hash.ts
import { createHash } from "crypto";

/**
 * Compute SHA-256 hash of a given string and return hex representation.
 * @param input - The string to hash.
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
