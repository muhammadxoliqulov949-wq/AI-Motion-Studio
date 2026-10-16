import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client. Cloud features (accounts, projects, media storage) switch on
 * only when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseEnabled = !!url && !!anonKey;

let client: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!supabaseEnabled) return null;
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    });
  }
  return client;
};

/** Server-side: verifies a user's access token (Authorization: Bearer …). */
export const getUserFromRequest = async (req: Request) => {
  if (!supabaseEnabled) return null;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const server = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await server.auth.getUser(token);
  return error ? null : data.user;
};
