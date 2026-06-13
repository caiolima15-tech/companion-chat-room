// NPC tick — segue waypoints em ordem (seq 0 -> 1 -> 2 ... -> 0). Loop.
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
const GOODBYE_AFTER_MS = 25000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runOneTick() {
  const { data: npcs } = await admin
    .from("npc_instances")
    .select("id,map_id,route_id,active")
    .eq("active", true);
  if (!npcs || npcs.length === 0) return { ticked: 0 };

  // Fallback de rota para NPCs sem route_id (pega rota mais recente do mapa)
  const mapsNeedingRoute = [...new Set(npcs.filter((n: any) => !n.route_id && n.map_id).map((n: any) => n.map_id))];
  if (mapsNeedingRoute.length) {
    const { data: fallbackRoutes } = await admin
      .from("npc_routes")
      .select("id,map_id,created_at")
      .in("map_id", mapsNeedingRoute)
      .order("created_at", { ascending: false });
    const fallbackByMap: Record<string, string> = {};
    for (const r of fallbackRoutes || []) if (!fallbackByMap[r.map_id]) fallbackByMap[r.map_id] = r.id;
    for (const npc of npcs as any[]) if (!npc.route_id && npc.map_id && fallbackByMap[npc.map_id]) npc.route_id = fallbackByMap[npc.map_id];
  }

  const routeIds = [...new Set(npcs.map((n: any) => n.route_id).filter(Boolean))];
  const wpsByRoute: Record<string, any[]> = {};
  if (routeIds.length) {
    const { data: wps } = await admin
      .from("npc_waypoints")
      .select("route_id,id,seq,x,y,z,is_crosswalk,is_talk_spot,is_sit_spot,pause_ms,created_at")
      .in("route_id", routeIds)
      .order("seq", { ascending: true })
      .order("created_at", { ascending: true });
    for (const wp of wps || []) (wpsByRoute[wp.route_id] ||= []).push(wp);
    // Re-sequencia (0..n-1) para suportar rotas com seq desalinhados
    for (const routeId of Object.keys(wpsByRoute)) {
      wpsByRoute[routeId] = wpsByRoute[routeId].map((wp, idx) => ({ ...wp, seq: idx }));
    }
  }

  const { data: states } = await admin.from("npc_state").select("*").in("npc_id", npcs.map((n: any) => n.id));
  const stateMap: Record<string, any> = {};
  for (const s of states || []) stateMap[s.npc_id] = s;

  const now = Date.now();
  const updates: any[] = [];
  const inserts: any[] = [];

  // Auto-goodbye após silêncio do jogador
  const { data: convs } = await admin
    .from("npc_conversations")
    .select("npc_id,last_user_msg_at")
    .gte("created_at", new Date(now - 5 * 60 * 1000).toISOString());
  const lastByNpc: Record<string, number> = {};
  for (const c of convs || []) {
    const t = new Date(c.last_user_msg_at || 0).getTime();
    if (!lastByNpc[c.npc_id] || t > lastByNpc[c.npc_id]) lastByNpc[c.npc_id] = t;
  }

  // Hash determinístico por id (0..1) — dá "personalidade" estável ao NPC
  const hashId = (id: string) => {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return (h % 10000) / 10000;
  };

  for (const npc of npcs) {
    const wps = npc.route_id ? wpsByRoute[npc.route_id] : null;
    if (!wps || wps.length < 1) continue;

    let st = stateMap[npc.id];
    const personality = hashId(npc.id);
    // direção preferida: alguns andam ao contrário
    const dir = personality < 0.5 ? 1 : -1;

    // Sem state ainda: spawn em ponto aleatório, mira em um vizinho
    if (!st) {
      const startIdx = Math.floor(personality * wps.length) % wps.length;
      const first = wps[startIdx];
      const nextIdx = (startIdx + dir + wps.length) % wps.length;
      const next = wps[nextIdx] || first;
      inserts.push({
        npc_id: npc.id, x: first.x, y: first.y || 0, z: first.z, rot_y: 0,
        anim: "walk", status: "walking", target_wp_seq: next.seq,
        next_decision_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      });
      continue;
    }

    // Conversa com jogador — npc.js cuida do lookAt+anim
    if (st.status === "talking_player") {
      const lt = lastByNpc[npc.id] || 0;
      if (now - lt > GOODBYE_AFTER_MS) {
        st.status = "walking"; st.anim = "wave";
      } else {
        continue;
      }
    }

    // Pausa/sit/talk: espera terminar e segue
    if (st.status === "sit" || st.status === "talking" || st.status === "paused") {
      if (new Date(st.next_decision_at).getTime() > now) continue;
      st.status = "walking"; st.anim = "walk";
    }

    // Garante target válido em ordem
    let target = wps.find((w: any) => w.seq === st.target_wp_seq);
    if (!target) target = wps[0];

    const isCross = !!target.is_crosswalk;
    const speed = isCross ? SPEED_CROSS : SPEED_WALK;
    const dx = target.x - st.x;
    const dz = target.z - st.z;
    const d = Math.hypot(dx, dz);
    const step = (speed * TICK_MS) / 1000;

    let newX = st.x, newZ = st.z, newRot = st.rot_y;
    let newAnim = "walk", newStatus = "walking", newTarget = st.target_wp_seq;
    let nextDecision = new Date(now).toISOString();

    if (d <= step) {
      // Chegou no ponto
      newX = target.x; newZ = target.z;
      newRot = Math.atan2(dx, dz);

      if (target.is_sit_spot) {
        newAnim = "sit"; newStatus = "sit";
        nextDecision = new Date(now + 8000 + Math.random() * 6000).toISOString();
      } else if (target.is_talk_spot) {
        newAnim = "idle"; newStatus = "talking";
        nextDecision = new Date(now + 4000 + Math.random() * 4000).toISOString();
      } else if ((target.pause_ms || 0) > 0) {
        newAnim = "idle"; newStatus = "paused";
        nextDecision = new Date(now + Math.min(5000, target.pause_ms)).toISOString();
      }
      // Próximo ponto: a maioria das vezes segue a sequência (direção da personalidade),
      // mas ~30% das vezes "pula" para um ponto mais distante (1..floor(n/2) à frente),
      // criando dispersão e evitando enfileiramento.
      const n = wps.length;
      let jump = 1;
      if (n > 2 && Math.random() < 0.3) {
        jump = 1 + Math.floor(Math.random() * Math.max(1, Math.floor(n / 2)));
      }
      // pequeno desvio aleatório por NPC para que cheguem em momentos diferentes
      if (n > 3 && Math.random() < 0.1) jump += 1;
      const nextSeq = ((target.seq + dir * jump) % n + n) % n;
      newTarget = nextSeq;
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
    return new Response(JSON.stringify({ iterations: results.length, last: results[results.length - 1] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
