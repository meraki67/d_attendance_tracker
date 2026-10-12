import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid or expired session" }, 401);

    const { data: caller, error: callerError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (callerError || !caller || !["admin", "super_admin"].includes(caller.role)) {
      return json({ error: "Admin access required" }, 403);
    }

    const body = await req.json();
    const name = String(body.name || "").trim();
    const position = String(body.position || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const role = body.role === "admin" ? "admin" : "user";
    const shiftType = body.shiftType === "night" ? "night" : "day";
    const shiftStart = String(body.shiftStart || (shiftType === "night" ? "18:00" : "06:00")).slice(0, 5);
    const shiftEnd = String(body.shiftEnd || (shiftType === "night" ? "03:00" : "15:00")).slice(0, 5);
    const dayOffs = Array.isArray(body.dayOffs)
      ? body.dayOffs.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6)
      : [];

    if (!name || !position || !email || !password) return json({ error: "Complete all required fields" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address" }, 400);
    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) return json({ error: "Password does not meet the security requirements" }, 400);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, position },
    });
    if (createError) return json({ error: createError.message }, 400);
    if (!created.user) return json({ error: "User could not be created" }, 500);

    const userId = created.user.id;

    const profilePayload = {
      user_id: userId,
      name,
      position,
      email,
      role,
      shift_type: shiftType,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      day_offs: dayOffs,
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await adminClient.from("profiles").upsert(profilePayload, { onConflict: "user_id" });
    if (profileError) {
      await adminClient.auth.admin.deleteUser(userId);
      return json({ error: profileError.message }, 500);
    }

    return json({ ok: true, user: { id: userId, email, role } });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
