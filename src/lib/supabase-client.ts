import { createClient } from "@supabase/supabase-js";

const OMAFIT_SUPABASE_URL_FALLBACK = "https://lhkgnirolvbmomeduoaj.supabase.co";
const OMAFIT_SUPABASE_ANON_KEY_FALLBACK =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxoa2duaXJvbHZibW9tZWR1b2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NjE2NDYsImV4cCI6MjA2MzMzNzY0Nn0.aSBMJMT8TiAqvdO_Z9D_oINLaQrFMZIK5IEQJG6KaOI";

const supabaseUrl = String(
	(typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) || "",
).trim() || OMAFIT_SUPABASE_URL_FALLBACK;

const supabaseAnonKey = String(
	(typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) || "",
).trim() || OMAFIT_SUPABASE_ANON_KEY_FALLBACK;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
