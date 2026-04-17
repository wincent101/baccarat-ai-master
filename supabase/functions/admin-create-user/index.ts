// Admin endpoint to create access-key based users (and reset PINs).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const KEY_DOMAIN = "key.baccarat.local";

function randomKey(len = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (!caller) return json({ error: "Invalid session" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Verify caller is admin
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden — admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "create_user") {
      const displayName = (body.display_name ?? "").toString().trim().slice(0, 80) || null;
      const accessKey = randomKey();
      const password = accessKey; // password == access key
      const email = `${accessKey.toLowerCase().replace(/-/g, "")}@${KEY_DOMAIN}`;

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          access_key: accessKey,
          display_name: displayName,
          created_by: caller.id,
        },
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, access_key: accessKey, user_id: data.user?.id });
    }

    if (action === "delete_user") {
      const userId = body.user_id as string;
      if (!userId) return json({ error: "user_id required" }, 400);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "set_active") {
      const userId = body.user_id as string;
      const isActive = !!body.is_active;
      const { error } = await admin
        .from("profiles")
        .update({ is_active: isActive })
        .eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      // Optional: ban via auth admin
      await admin.auth.admin.updateUserById(userId, {
        ban_duration: isActive ? "none" : "876000h",
      });
      return json({ ok: true });
    }

    if (action === "reset_pins") {
      const userId = body.user_id as string;
      const { error } = await admin.from("device_pins").delete().eq("user_id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "promote_admin") {
      const userId = body.user_id as string;
      const { error } = await admin
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });
      if (error && !error.message.includes("duplicate")) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
