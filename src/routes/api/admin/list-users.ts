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

export const Route = createFileRoute("/api/admin/list-users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = await requireAdmin(request);
        if (gate.error) return gate.error;

        const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        if (error) return new Response(error.message, { status: 500 });

        const ids = list.users.map((u) => u.id);
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, nickname, avatar_url")
          .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
        const { data: rolesRows } = await supabaseAdmin
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

        const pMap = new Map((profiles || []).map((p: any) => [p.id, p]));
        const rMap = new Map<string, string[]>();
        (rolesRows || []).forEach((r: any) => {
          const arr = rMap.get(r.user_id) || [];
          arr.push(r.role);
          rMap.set(r.user_id, arr);
        });

        const users = list.users.map((u) => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          nickname: pMap.get(u.id)?.nickname || null,
          avatar_url: pMap.get(u.id)?.avatar_url || null,
          roles: rMap.get(u.id) || [],
        }));

        return new Response(JSON.stringify({ users }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
