import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function requireAdmin(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: new Response("Unauthorized", { status: 401 }) };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { error: new Response("Unauthorized", { status: 401 }) };
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roles) return { error: new Response("Forbidden", { status: 403 }) };
  return { userId: data.user.id };
}

async function purgeBucket(bucket: string, prefix: string) {
  try {
    const { data: list } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: 1000 });
    if (!list || !list.length) return;
    const paths = list.map((f) => `${prefix}/${f.name}`);
    await supabaseAdmin.storage.from(bucket).remove(paths);
  } catch (e) {
    console.error(`purge ${bucket}/${prefix}`, e);
  }
}

export const Route = createFileRoute("/api/admin/delete-user")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireAdmin(request);
        if (gate.error) return gate.error;

        let body: any;
        try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
        const targetId = String(body?.userId || "");
        if (!targetId) return new Response("Missing userId", { status: 400 });
        if (targetId === gate.userId) {
          return new Response("Você não pode excluir sua própria conta de admin.", { status: 400 });
        }

        // Cleanup related rows (best-effort, ignore errors).
        const tables: Array<{ table: string; col: string }> = [
          { table: "profile_photos", col: "user_id" },
          { table: "user_avatars", col: "user_id" },
          { table: "user_roles", col: "user_id" },
          { table: "follows", col: "follower_id" },
          { table: "follows", col: "following_id" },
          { table: "chat_messages", col: "user_id" },
          { table: "direct_messages", col: "from_user" },
          { table: "direct_messages", col: "to_user" },
          { table: "profiles", col: "id" },
        ];
        for (const t of tables) {
          try {
            await (supabaseAdmin.from(t.table as any) as any).delete().eq(t.col, targetId);
          } catch (e) {
            console.error("cleanup", t, e);
          }
        }

        // Cleanup storage folders named with userId.
        await purgeBucket("avatars", targetId);
        await purgeBucket("profile-photos", targetId);
        await purgeBucket("characters", targetId);

        const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(targetId);
        if (delErr) return new Response(delErr.message, { status: 500 });

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
