import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Service role key bypasses row-level security — this client must ONLY
// ever be used on the backend, never sent to or used in the frontend.
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "complaint-photos";
