// Supabase Edge Function: send-push
// Envia uma Web Push notification para um conjunto de usuários (push_subscriptions).
// Espera body: { user_ids: string[], title: string, body: string, url?: string, tag?: string }
// Usa npm:web-push para suportar VAPID no Deno.
// deno-lint-ignore-file no-explicit-any
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VAPID_PUBLIC =
  "BJDMd4x3FV-pgiH6mk2Sy93qw3vdGXMkZd0Q89yeKS_zvXXlobv3aZ_Tzd0v9jwvoBiiOn27fBMb7zlo080Rp1M";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@virtualife.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const payload = await req.json();
    const userIds: string[] = Array.isArray(payload?.user_ids) ? payload.user_ids : [];
    const title = String(payload?.title || "Virtualife").slice(0, 120);
    const body = String(payload?.body || "").slice(0, 240);
    const url = String(payload?.url || "/").slice(0, 500);
    const tag = payload?.tag ? String(payload.tag).slice(0, 60) : undefined;

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth,user_id")
      .in("user_id", userIds);

    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = JSON.stringify({ title, body, url, tag });
    let sent = 0;
    const expired: string[] = [];
    await Promise.all(
      subs.map(async (s: any) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            message
          );
          sent++;
        } catch (err: any) {
          const status = err?.statusCode;
          if (status === 404 || status === 410) expired.push(s.id);
        }
      })
    );
    if (expired.length) {
      await supabase.from("push_subscriptions").delete().in("id", expired);
    }

    return new Response(JSON.stringify({ ok: true, sent, expired: expired.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-push error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
