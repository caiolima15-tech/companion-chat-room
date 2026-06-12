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

const SPEED_WALK = 1.4;       // m/s
const SPEED_CROSS = 2.2;      // m/s
const TICK_MS = 1000;

function dist(a: any, b: any) { return Math.hypot(a.x - b.x, a.z - b.z); }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runOneTick() {
    const { data: npcs } = await admin
      .from("npc_instances")
      .select("id,route_id,active")
      .eq("active", true);

    if (!npcs || npcs.length === 0) return { ticked: 0 };

    // pega waypoints de todas as rotas envolvidas
    const routeIds = [...new Set(npcs.map((n: any) => n.route_id).filter(Boolean))];
    const wpsByRoute: Record<string, any[]> = {};
    if (routeIds.length) {
      const { data: wps } = await admin
        .from("npc_waypoints")
        .select("route_id,seq,x,y,z,is_crosswalk,is_talk_spot,is_sit_spot,pause_ms")
        .in("route_id", routeIds)
        .order("seq", { ascending: true });
      for (const wp of wps || []) {
        (wpsByRoute[wp.route_id] ||= []).push(wp);
      }
    }

    const { data: states } = await admin.from("npc_state").select("*").in("npc_id", npcs.map((n: any) => n.id));
    const stateMap: Record<string, any> = {};
    for (const s of states || []) stateMap[s.npc_id] = s;

    const now = Date.now();
    const updates: any[] = [];
    const inserts: any[] = [];

    for (const npc of npcs) {
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

      // Se está pausado (sit/talk), checa se já pode seguir
      if (st.status === "sit" || st.status === "talking" || st.status === "paused") {
        if (new Date(st.next_decision_at).getTime() > now) {
          // ainda esperando — pula
          continue;
        }
        // Liberar — avança pro próximo waypoint
        st.status = "walking";
        st.anim = "walk";
        st.target_wp_seq = (st.target_wp_seq + 1) % wps.length;
      }

      const target = wps.find((w: any) => w.seq === st.target_wp_seq) || wps[0];
      const isCross = target.is_crosswalk;
      const speed = isCross ? SPEED_CROSS : SPEED_WALK;
      const dx = target.x - st.x;
      const dz = target.z - st.z;
      const d = Math.hypot(dx, dz);
      const step = (speed * TICK_MS) / 1000;

      let newX = st.x, newZ = st.z, newRot = st.rot_y;
      let newAnim = "walk", newStatus = "walking", newTarget = st.target_wp_seq;
      let nextDecision = new Date(now).toISOString();

      if (d <= step) {
        // chegou no waypoint
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
        // anda em direção
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
    return { ticked: npcs.length, updated: updates.length, inserted: inserts.length };
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
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
