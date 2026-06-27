import { createClient } from '@supabase/supabase-js';

// Service-role client — server-side ONLY (used inside API routes, never
// imported into anything that ships to the browser or the Android app).
// This bypasses Row Level Security entirely, which is fine here because
// every API route that uses it does its own auth check first (the shared
// device secret for Android, nothing public-facing for the dashboard yet).
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
