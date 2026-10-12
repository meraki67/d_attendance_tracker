import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function strongPassword(value: string) {
  return value.length >= 8 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeDays(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  )];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ error: "Supabase function environment is incomplete" }, 500);
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return response({ error: "Authentication required" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    const callerId = authData.user?.id;
    if (authError || !callerId) return response({ error: "Invalid or expired session" }, 401);

    const { data: caller, error: callerError } = await adminClient
      .from("profiles")
      .select("user_id,role")
      .eq("user_id", callerId)
      .maybeSingle();

    if (callerError || !caller || !["admin", "super_admin"].includes(caller.role)) {
      return response({ error: "Admin access required" }, 403);
    }

    const body = await req.json();
    const action = String(body.action || "");

    // ---------- CREATE ----------
    if (action === "create") {
      const name = String(body.name || "").trim();
      const position = String(body.position || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const role = body.role === "admin" ? "admin" : "user";
      const shiftType = body.shiftType === "night" ? "night" : "day";
      const shiftStart = String(body.shiftStart || (shiftType === "night" ? "18:00" : "06:00")).slice(0, 5);
      const shiftEnd = String(body.shiftEnd || (shiftType === "night" ? "03:00" : "15:00")).slice(0, 5);
      const dayOffs = normalizeDays(body.dayOffs);

      if (!name || !position || !email || !password) return response({ error: "Complete all required fields" }, 400);
      if (!validEmail(email)) return response({ error: "Enter a valid email address" }, 400);
      if (!strongPassword(password)) return response({ error: "Password does not meet the security requirements" }, 400);

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, position },
      });
      if (createError) return response({ error: createError.message }, 400);
      if (!created.user) return response({ error: "User could not be created" }, 500);

      const userId = created.user.id;
      const { error: profileError } = await adminClient.from("profiles").upsert({
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
      }, { onConflict: "user_id" });

      if (profileError) {
        await adminClient.auth.admin.deleteUser(userId);
        return response({ error: profileError.message }, 500);
      }
      return response({ ok: true, action, userId });
    }

    // update/delete require a target
    const userId = String(body.userId || "");
    if (!userId) return response({ error: "Target user is required" }, 400);

    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("user_id,role,email")
      .eq("user_id", userId)
      .maybeSingle();

    if (targetError || !target) return response({ error: "Target profile not found" }, 404);

    // Root account is internally super_admin but displays as Admin in the app.
    if (target.role === "super_admin" && caller.role !== "super_admin") {
      return response({ error: "Protected Admin account cannot be managed by another Admin" }, 403);
    }

    // ---------- UPDATE ----------
    if (action === "update") {
      const name = String(body.name || "").trim();
      const position = String(body.position || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const requestedRole = body.role === "admin" ? "admin" : "user";
      const shiftType = body.shiftType === "night" ? "night" : "day";
      const shiftStart = String(body.shiftStart || "").slice(0, 5);
      const shiftEnd = String(body.shiftEnd || "").slice(0, 5);
      const dayOffs = normalizeDays(body.dayOffs);
      const newPassword = String(body.newPassword || "");

      if (!name || !position || !email || !shiftStart || !shiftEnd) return response({ error: "Complete all required fields" }, 400);
      if (!validEmail(email)) return response({ error: "Enter a valid email address" }, 400);
      if (newPassword && !strongPassword(newPassword)) return response({ error: "New password does not meet the security requirements" }, 400);

      const authUpdates: Record<string, unknown> = {
        email,
        user_metadata: { name, position },
      };
      if (newPassword) authUpdates.password = newPassword;

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, authUpdates);
      if (authUpdateError) return response({ error: authUpdateError.message }, 400);

      const resultingRole = target.role === "super_admin" ? "super_admin" : requestedRole;
      const { error: profileUpdateError } = await adminClient
        .from("profiles")
        .update({
          name,
          position,
          email,
          role: resultingRole,
          shift_type: shiftType,
          shift_start: shiftStart,
          shift_end: shiftEnd,
          day_offs: dayOffs,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (profileUpdateError) return response({ error: profileUpdateError.message }, 500);
      return response({ ok: true, action, userId });
    }

    // ---------- DELETE ----------
    if (action === "delete") {
      if (userId === callerId) return response({ error: "You cannot delete your own active Admin account" }, 400);
      if (target.role === "super_admin") return response({ error: "Protected Admin account cannot be deleted" }, 403);

      // Remove app data first. If Auth deletion fails, login is still blocked because profile is gone.
      const { error: attendanceError } = await adminClient.from("attendance").delete().eq("user_id", userId);
      if (attendanceError) return response({ error: attendanceError.message }, 500);

      const { error: profileDeleteError } = await adminClient.from("profiles").delete().eq("user_id", userId);
      if (profileDeleteError) return response({ error: profileDeleteError.message }, 500);

      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);
      if (authDeleteError) return response({
        error: `Profile was removed but Auth deletion failed: ${authDeleteError.message}`
      }, 500);

      return response({ ok: true, action, userId });
    }

    return response({ error: "Unsupported action" }, 400);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
