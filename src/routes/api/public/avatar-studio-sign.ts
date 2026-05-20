import { createFileRoute } from "@tanstack/react-router";
import { createHmac } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function sign(userId: string, secret: string) {
  return createHmac("sha256", secret).update(userId).digest("hex").slice(0, 32);
}

export const Route = createFileRoute("/api/public/avatar-studio-sign")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!token) {
          return new Response(JSON.stringify({ error: "missing token" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data.user) {
          return new Response(JSON.stringify({ error: "invalid token" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const secret = process.env.AVATAR_PROXY_SECRET;
        if (!secret) {
          return new Response(JSON.stringify({ error: "secret missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const userId = data.user.id;
        const sig = sign(userId, secret);
        const url = `/api/public/avatar-studio/create/proceed?u=${userId}&s=${sig}`;
        return new Response(JSON.stringify({ url }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS },
        });
      },
    },
  },
});
