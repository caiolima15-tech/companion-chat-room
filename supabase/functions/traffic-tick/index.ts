// Traffic tick — avança veículos NPC ao longo de waypoints, com paradas, semáforos e anti-colisão.
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

const TICK_MS = 1000;
const DEFAULT_MIN_GAP = 6;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function signalIsGreenAt(sig: any, nowMs: number): boolean {
  const r = sig.cycle_red_ms || 8000;
  const g = sig.cycle_green_ms || 10000;
  const y = sig.cycle_yellow_ms || 2000;
  const off = sig.phase_offset_ms || 0;
  const total = r + g + y;
  const t = ((nowMs - off) % total + total) % total;
  return t < g; // green first, then yellow (stop), then red (stop)
}

async function runOneTick(minGap: number) {
  const { data: vehicles } = await admin
    .from("traffic_vehicles")
    .select("id,map_id,route_id,max_speed_mps,active")
    .eq("active", true);
  if (!vehicles?.length) return { ticked: 0 };

  const routeIds = [...new Set(vehicles.map((v: any) => v.route_id).filter(Boolean))];
  if (!routeIds.length) return { ticked: 0 };

  const { data: routes } = await admin
    .from("traffic_routes").select("id,loop,lane_offset,direction").in("id", routeIds);
  const routeMap: Record<string, any> = {};
  for (const r of routes || []) routeMap[r.id] = r;

  const { data: wps } = await admin
    .from("traffic_waypoints")
    .select("id,route_id,seq,x,y,z,speed_mps,is_stop,stop_duration_ms,is_yield")
    .in("route_id", routeIds)
    .order("seq", { ascending: true });
  const wpsByRoute: Record<string, any[]> = {};
  for (const w of wps || []) (wpsByRoute[w.route_id] ||= []).push(w);

  const wpIds = (wps || []).map((w: any) => w.id);
  const { data: signals } = wpIds.length
    ? await admin.from("traffic_signals").select("*").in("waypoint_id", wpIds)
    : { data: [] };
  const sigByWp: Record<string, any> = {};
  for (const s of signals || []) sigByWp[s.waypoint_id] = s;

  const { data: states } = await admin
    .from("traffic_state").select("*").in("vehicle_id", vehicles.map((v: any) => v.id));
  const stateMap: Record<string, any> = {};
  for (const s of states || []) stateMap[s.vehicle_id] = s;

  const now = Date.now();
  const inserts: any[] = [];
  const updates: any[] = [];

  // pré-cálculo da posição "lógica" de cada veículo na rota (seg+t) para anti-colisão
  type PosInfo = { seg: number; t: number; total: number };
  const posByVehicle: Record<string, PosInfo> = {};
  for (const v of vehicles as any[]) {
    const st = stateMap[v.id];
    if (st) posByVehicle[v.id] = { seg: st.segment_index || 0, t: st.t || 0, total: (st.segment_index || 0) + (st.t || 0) };
  }

  for (const v of vehicles as any[]) {
    const route = routeMap[v.route_id];
    const wpList = wpsByRoute[v.route_id];
    if (!route || !wpList || wpList.length < 2) continue;

    let st = stateMap[v.id];
    if (!st) {
      // spawn no primeiro waypoint
      const startSeg = Math.floor(Math.random() * Math.max(1, wpList.length - 1));
      const first = wpList[startSeg];
      inserts.push({
        vehicle_id: v.id, x: first.x, y: first.y || 0, z: first.z,
        rot_y: 0, speed: 0, segment_index: startSeg, t: 0,
        stopped_until: null, updated_at: new Date(now).toISOString(),
      });
      continue;
    }

    if (st.stopped_until && new Date(st.stopped_until).getTime() > now) {
      // ainda parado — só garante posição
      continue;
    }

    let seg = st.segment_index || 0;
    let t = st.t || 0;
    const N = wpList.length;
    let wpA = wpList[seg % N];
    let wpB = wpList[(seg + 1) % N];
    if (!wpA || !wpB) continue;

    const dx = wpB.x - wpA.x, dz = wpB.z - wpA.z;
    const segLen = Math.hypot(dx, dz) || 1;
    const speedLimit = Math.min(v.max_speed_mps || 10, wpA.speed_mps || 8);

    // semáforo no próximo wp (wpB): se vermelho/amarelo e estamos perto, para
    let desiredSpeed = speedLimit;
    const sig = sigByWp[wpB.id];
    if (sig && !signalIsGreenAt(sig, now)) {
      const remainM = segLen * (1 - t);
      if (remainM < 4) desiredSpeed = 0;
      else if (remainM < 8) desiredSpeed = Math.min(desiredSpeed, 2);
    }

    // anti-colisão: outro veículo na mesma rota à frente
    const myTotal = seg + t;
    let minAhead = Infinity;
    for (const other of vehicles as any[]) {
      if (other.id === v.id || other.route_id !== v.route_id) continue;
      const op = posByVehicle[other.id];
      if (!op) continue;
      let delta = op.total - myTotal;
      if (route.loop && delta < -N / 2) delta += N;
      if (delta > 0 && delta < minAhead) minAhead = delta;
    }
    // distância aproximada em metros (média do segLen)
    const aheadMeters = minAhead * segLen;
    if (aheadMeters < minGap) desiredSpeed = 0;
    else if (aheadMeters < minGap * 2) desiredSpeed = Math.min(desiredSpeed, 2.5);

    const step = (desiredSpeed * TICK_MS) / 1000;
    t += step / segLen;

    let newSpeed = desiredSpeed;
    let stoppedUntil: string | null = null;

    while (t >= 1) {
      // chegou no wpB; mantém o excesso de movimento em vez de voltar para o wp anterior
      t -= 1;
      seg = seg + 1;
      if (seg >= N) {
        if (route.loop) seg = 0;
        else { seg = N - 1; t = 1; newSpeed = 0; }
      }
      const arrived = wpList[seg % N];
      if (arrived?.is_stop) {
        stoppedUntil = new Date(now + (arrived.stop_duration_ms || 3000)).toISOString();
        newSpeed = 0;
      }
      if (newSpeed === 0 || t >= 1 === false) break;
    }

    wpA = wpList[seg % N];
    wpB = wpList[(seg + 1) % N];
    if (!wpA || !wpB) continue;

    const ndx = wpB.x - wpA.x, ndz = wpB.z - wpA.z;
    const nSegLen = Math.hypot(ndx, ndz) || 1;

    // posição interpolada + offset lateral pra faixa
    const ix = wpA.x + ndx * t;
    const iz = wpA.z + ndz * t;
    const iy = (wpA.y || 0) + ((wpB.y || 0) - (wpA.y || 0)) * t;
    const perpX = -ndz / nSegLen;
    const perpZ = ndx / nSegLen;
    const lane = route.lane_offset || 0;
    const rot = Math.atan2(ndx, ndz);

    updates.push({
      vehicle_id: v.id,
      x: ix + perpX * lane, y: iy, z: iz + perpZ * lane,
      rot_y: rot, speed: newSpeed,
      segment_index: seg, t,
      stopped_until: stoppedUntil,
      updated_at: new Date(now).toISOString(),
    });
  }

  if (inserts.length) await admin.from("traffic_state").insert(inserts);
  if (updates.length) await admin.from("traffic_state").upsert(updates, { onConflict: "vehicle_id" });
  return { ticked: vehicles.length, updated: updates.length, inserted: inserts.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const iterations = Math.min(55, Math.max(1, Number(url.searchParams.get("iter") || "50")));

    // pega min_gap das settings (uma vez por invocação)
    let minGap = DEFAULT_MIN_GAP;
    try {
      const { data } = await admin.from("game_settings").select("value").eq("key", "traffic_min_gap_m").maybeSingle();
      if (data?.value != null) minGap = Number(data.value) || DEFAULT_MIN_GAP;
    } catch {}

    const start = Date.now();
    const results: any[] = [];
    for (let i = 0; i < iterations; i++) {
      if (Date.now() - start > 55000) break;
      results.push(await runOneTick(minGap));
      await sleep(TICK_MS);
    }
    return new Response(JSON.stringify({ iterations: results.length, last: results[results.length - 1] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
