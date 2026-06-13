// NPC tick — simulação server-side. Avança NPCs ao longo dos waypoints.
// Chamado periodicamente (pg_cron). Sem auth (cron).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const SPEED_WALK = 1.4;
const SPEED_CROSS = 2.2;
const TICK_MS = 1000;
const SOCIAL_RADIUS = 2.0;
const SOCIAL_CHANCE = 0.12;
const GOODBYE_AFTER_MS = 25000;

function dist2(a: any, b: any) { return Math.hypot(a.x - b.x, a.z - b.z); }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runOneTick() {
    const { data: npcs } = await admin
      .from("npc_instances")
      .select("id,route_id,active")
      .eq("active", true);

    if (!npcs || npcs.length === 0) return { ticked: 0 };

    const routeIds = [...new Set(npcs.map((n: any) => n.route_id).filter(Boolean))];
    const wpsByRoute: Record<string, any[]> = {};
    if (routeIds.length) {
      const { data: wps } = await admin
        .from("npc_waypoints")
        .select("route_id,seq,x,y,z,is_crosswalk,is_talk_spot,is_sit_spot,pause_ms")
        .in("route_id", routeIds)
        .order("seq", { ascending: true });
      for (const wp of wps || []) (wpsByRoute[wp.route_id] ||= []).push(wp);
    }

    const { data: states } = await admin.from("npc_state").select("*").in("npc_id", npcs.map((n: any) => n.id));
    const stateMap: Record<string, any> = {};
    for (const s of states || []) stateMap[s.npc_id] = s;

    const now = Date.now();
    const updates: any[] = [];
    const inserts: any[] = [];

    // ---- SOCIAL NPC<->NPC pair detection ----
    const walkingIds = npcs.filter((n: any) => stateMap[n.id]?.status === "walking").map((n: any) => n.id);
    const usedSocial = new Set<string>();
    const socialPairs: Array<[any, any]> = [];
    for (let i = 0; i < walkingIds.length; i++) {
      const aId = walkingIds[i]; if (usedSocial.has(aId)) continue;
      const a = stateMap[aId];
      for (let j = i + 1; j < walkingIds.length; j++) {
        const bId = walkingIds[j]; if (usedSocial.has(bId)) continue;
        const b = stateMap[bId];
        if (dist2(a, b) < SOCIAL_RADIUS && Math.random() < SOCIAL_CHANCE) {
          socialPairs.push([aId, bId]);
          usedSocial.add(aId); usedSocial.add(bId);
          break;
        }
      }
    }
    for (const [aId, bId] of socialPairs) {
      const a = stateMap[aId], b = stateMap[bId];
      const angleAB = Math.atan2(b.x - a.x, b.z - a.z);
      const angleBA = Math.atan2(a.x - b.x, a.z - b.z);
      const ends = new Date(now + 60000 + Math.random() * 120000).toISOString();
      updates.push({ npc_id: aId, x: a.x, y: a.y, z: a.z, rot_y: angleAB, anim: "social_a", status: "socializing", target_wp_seq: a.target_wp_seq, next_decision_at: ends, updated_at: new Date(now).toISOString() });
      updates.push({ npc_id: bId, x: b.x, y: b.y, z: b.z, rot_y: angleBA, anim: "social_b", status: "socializing", target_wp_seq: b.target_wp_seq, next_decision_at: ends, updated_at: new Date(now).toISOString() });
    }

    // ---- AUTO-GOODBYE (player idle) ----
    const { data: convs } = await admin
      .from("npc_conversations")
      .select("npc_id,last_user_msg_at,role")
      .gte("created_at", new Date(now - 5 * 60 * 1000).toISOString());
    const lastByNpc: Record<string, number> = {};
    for (const c of convs || []) {
      const t = new Date(c.last_user_msg_at || 0).getTime();
      if (!lastByNpc[c.npc_id] || t > lastByNpc[c.npc_id]) lastByNpc[c.npc_id] = t;
    }
    for (const npc of npcs) {
      const st = stateMap[npc.id]; if (!st) continue;
      if (st.status === "talking_player") {
        const lt = lastByNpc[npc.id] || 0;
        if (now - lt > GOODBYE_AFTER_MS) {
          st.status = "walking"; st.anim = "wave";
        }
      }
    }

    for (const npc of npcs) {
      if (usedSocial.has(npc.id)) continue;
      const wps = npc.route_id ? wpsByRoute[npc.route_id] : null;
      if (!wps || wps.length < 2) continue;

      let st = stateMap[npc.id];
      if (!st) {
        const first = wps[0];
        inserts.push({
          npc_id: npc.id, x: first.x, y: first.y, z: first.z, rot_y: 0,
          anim: "walk", status: "walking", target_wp_seq: 1,
          next_decision_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString(),
        });
        continue;
      }

      // Player conversa: NPC fica parado virado pro player; npc.js cuida do lookAt+anim
      if (st.status === "talking_player") {
        continue;
      }

      if (st.status === "sit" || st.status === "talking" || st.status === "paused" || st.status === "socializing") {
        if (new Date(st.next_decision_at).getTime() > now) continue;
        st.status = "walking"; st.anim = "walk";
        st.target_wp_seq = (st.target_wp_seq + 1) % wps.length;
      }

      const target = wps.find((w: any) => w.seq === st.target_wp_seq) || wps[0];
      const isCross = target.is_crosswalk;
      const speed = isCross ? SPEED_CROSS : SPEED_WALK;
      const dx = target.x - st.x, dz = target.z - st.z;
      const d = Math.hypot(dx, dz);
      const step = (speed * TICK_MS) / 1000;

      let newX = st.x, newZ = st.z, newRot = st.rot_y;
      let newAnim = "walk", newStatus = "walking", newTarget = st.target_wp_seq;
      let nextDecision = new Date(now).toISOString();

      if (d <= step) {
        newX = target.x; newZ = target.z;
        newRot = Math.atan2(dx, dz);

        if (target.is_sit_spot) {
          newAnim = "sit"; newStatus = "sit";
          nextDecision = new Date(now + 12000 + Math.random() * 18000).toISOString();
        } else if (target.is_talk_spot && Math.random() < 0.6) {
          newAnim = "idle"; newStatus = "talking";
          nextDecision = new Date(now + 10000 + Math.random() * 20000).toISOString();
        } else if ((target.pause_ms || 0) > 0) {
          newAnim = "idle"; newStatus = "paused";
          nextDecision = new Date(now + target.pause_ms).toISOString();
        } else {
          newTarget = (st.target_wp_seq + 1) % wps.length;
        }
      } else {
        newRot = Math.atan2(dx, dz);
        newX = st.x + (dx / d) * step;
        newZ = st.z + (dz / d) * step;
      }

      updates.push({
        npc_id: npc.id, x: newX, y: target.y || 0, z: newZ, rot_y: newRot,
        anim: newAnim, status: newStatus, target_wp_seq: newTarget,
        next_decision_at: nextDecision,
        updated_at: new Date(now).toISOString(),
      });
    }

    if (inserts.length) await admin.from("npc_state").insert(inserts);
    if (updates.length) await admin.from("npc_state").upsert(updates, { onConflict: "npc_id" });
    return { ticked: npcs.length, updated: updates.length, inserted: inserts.length, social: socialPairs.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const iterations = Math.min(55, Math.max(1, Number(url.searchParams.get("iter") || "50")));
    const results: any[] = [];
    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      if (Date.now() - start > 55000) break;
      const r = await runOneTick();
      results.push(r);
      await sleep(1000);
    }
    return new Response(JSON.stringify({ iterations: results.length, last: results[results.length-1] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
