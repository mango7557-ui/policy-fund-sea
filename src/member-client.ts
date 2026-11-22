import { createClient } from "@supabase/supabase-js";
export const memberClient = createClient(
  "https://wmzszltshcrywplytzcg.supabase.co",
  "sb_publishable_uCga538UocpxdkjT7x93vw_5z8n9ygf",
  { auth: { storageKey: "bareunfund-member-session", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
