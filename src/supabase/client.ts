// src/supabase/client.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("Environment variable SUPABASE_URL is required but not set.");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Environment variable SUPABASE_SERVICE_ROLE_KEY is required but not set.");
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
