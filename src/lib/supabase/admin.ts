import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS — only use server-side, never expose to the browser.
 * Used for operations like fetching files for the agent regardless of caller auth.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
