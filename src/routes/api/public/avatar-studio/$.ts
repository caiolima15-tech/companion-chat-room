import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const UPSTREAM = "https://hub.avaturn.me";
const PROXY_PREFIX = "/api/public/avatar-studio";
const USER_COOKIE = "avstudio_uid";

function sign(userId: string, secret: string) {
  return createHmac("sha256", secret).update(userId).digest("hex").slice(0, 32);
}

function verifyUid(userId: string, sig: string, secret: string): boolean {
  try {
    const expected = sign(userId, secret);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

// Rewrites a Set-Cookie header from upstream so the browser scopes it to our path.
function rewriteSetCookie(raw: string): string {
  return raw
    .split(/,(?=[^;]+?=)/) // split multi-cookie headers
    .map((c) => {
      let s = c.trim();
      s = s.replace(/;\s*Domain=[^;]+/gi, "");
      s = s.replace(/;\s*Path=[^;]*/gi, "");
      s = s.replace(/;\s*SameSite=[^;]+/gi, "");
      s += `; Path=${PROXY_PREFIX}; SameSite=None; Secure`;
      return s;
    })
    .join(", ");
}

async function proxy(request: Request, splat: string): Promise<Response> {
  const url = new URL(request.url);
  const secret = process.env.AVATAR_PROXY_SECRET;
  if (!secret) return new Response("proxy not configured", { status: 500 });

  // Determine user id from query (?u=&s=) or cookie.
  const cookies = parseCookies(request.headers.get("cookie"));
  let userId: string | null = null;
  const qu = url.searchParams.get("u");
  const qs = url.searchParams.get("s");
  if (qu && qs && verifyUid(qu, qs, secret)) {
    userId = qu;
  } else if (cookies[USER_COOKIE]) {
    const [cu, cs] = cookies[USER_COOKIE].split(".");
    if (cu && cs && verifyUid(cu, cs, secret)) userId = cu;
  }

  // Strip our own ?u/?s before forwarding to upstream
  const upstreamSearch = new URLSearchParams(url.searchParams);
  upstreamSearch.delete("u");
  upstreamSearch.delete("s");
  const qs2 = upstreamSearch.toString();
  const upstreamUrl = `${UPSTREAM}/${splat}${qs2 ? `?${qs2}` : ""}`;

  // Build upstream cookie header from our cookies (strip our own marker)
  const upstreamCookieParts: string[] = [];
  for (const [k, v] of Object.entries(cookies)) {
    if (k === USER_COOKIE) continue;
    upstreamCookieParts.push(`${k}=${v}`);
  }

  const upstreamHeaders = new Headers();
  // Copy a subset of safe headers
  const passthrough = ["accept", "accept-language", "content-type", "user-agent", "referer"];
  for (const h of passthrough) {
    const v = request.headers.get(h);
    if (v) upstreamHeaders.set(h, v);
  }
  if (upstreamCookieParts.length) upstreamHeaders.set("cookie", upstreamCookieParts.join("; "));
  upstreamHeaders.set("host", new URL(UPSTREAM).host);

  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body,
      redirect: "manual",
    });
  } catch (err) {
    console.error("[avatar-studio proxy] upstream fetch failed", err);
    return new Response(`proxy upstream error: ${(err as Error).message}`, { status: 502 });
  }

  // Build response headers
  const respHeaders = new Headers();
  // Strip framing/CSP/CORP headers so iframe can embed
  const stripped = new Set([
    "x-frame-options",
    "content-security-policy",
    "content-security-policy-report-only",
    "cross-origin-opener-policy",
    "cross-origin-embedder-policy",
    "cross-origin-resource-policy",
    "content-length",
    "content-encoding",
    "transfer-encoding",
  ]);
  upstream.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (stripped.has(lk)) return;
    if (lk === "set-cookie") {
      respHeaders.append("set-cookie", rewriteSetCookie(v));
      return;
    }
    if (lk === "location") {
      // Rewrite redirects pointing at upstream back to the proxy
      respHeaders.set("location", rewriteUrlString(v));
      return;
    }
    respHeaders.set(k, v);
  });

  // If first authenticated request, persist user id as our cookie
  if (userId && qu && qs) {
    respHeaders.append(
      "set-cookie",
      `${USER_COOKIE}=${userId}.${sign(userId, secret)}; Path=${PROXY_PREFIX}; SameSite=None; Secure; HttpOnly; Max-Age=86400`,
    );
  }

  const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
  const contentDisp = upstream.headers.get("content-disposition") || "";
  const looksLikeGlb =
    contentType.includes("gltf-binary") ||
    contentType === "model/gltf-binary" ||
    /filename=.*\.glb/i.test(contentDisp) ||
    /\.glb(\?|$)/i.test(upstreamUrl);

  // GLB capture
  if (looksLikeGlb && upstream.ok) {
    const buf = new Uint8Array(await upstream.arrayBuffer());
    if (userId) {
      // Fire-and-forget save; do not block the download
      (async () => {
        try {
          const path = `user-avatars/${userId}/${Date.now()}-avaturn.glb`;
          const { error: upErr } = await supabaseAdmin.storage
            .from("characters")
            .upload(path, buf, { cacheControl: "31536000", contentType: "model/gltf-binary", upsert: false });
          if (upErr) throw upErr;
          const { data: pub } = supabaseAdmin.storage.from("characters").getPublicUrl(path);
          const { error: dbErr } = await supabaseAdmin
            .from("user_avatars")
            .insert({ user_id: userId, name: "Avatar Avaturn", base_url: pub.publicUrl });
          if (dbErr) throw dbErr;
          console.log("[avatar-studio] saved glb for", userId);
        } catch (e) {
          console.error("[avatar-studio] failed to save glb", e);
        }
      })();
    } else {
      console.warn("[avatar-studio] glb passing through without user id");
    }
    return new Response(buf, { status: upstream.status, headers: respHeaders });
  }

  // Rewrite text bodies (HTML/JS/CSS/JSON) so URLs point to our proxy
  if (
    contentType.includes("text/html") ||
    contentType.includes("javascript") ||
    contentType.includes("text/css") ||
    contentType.includes("application/json")
  ) {
    let text = await upstream.text();
    text = rewriteUrlString(text);
    return new Response(text, { status: upstream.status, headers: respHeaders });
  }

  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
}

function rewriteUrlString(s: string): string {
  return s
    .replaceAll("https://hub.avaturn.me", PROXY_PREFIX)
    .replaceAll("http://hub.avaturn.me", PROXY_PREFIX)
    .replaceAll("//hub.avaturn.me", PROXY_PREFIX);
}

export const Route = createFileRoute("/api/public/avatar-studio/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => proxy(request, params._splat || ""),
      POST: async ({ request, params }) => proxy(request, params._splat || ""),
      PUT: async ({ request, params }) => proxy(request, params._splat || ""),
      DELETE: async ({ request, params }) => proxy(request, params._splat || ""),
      PATCH: async ({ request, params }) => proxy(request, params._splat || ""),
      OPTIONS: async ({ request, params }) => proxy(request, params._splat || ""),
    },
  },
});
