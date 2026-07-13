// Runtime de mecânicas — executa gatilhos/condições/ações configurados no painel admin.
(function () {
  const SB = () => window.__supabase || window.supabase;
  let booted = false, userId = null, mapId = null;
  let mechanics = [];
  let realtimeChan = null;
  const lastFire = new Map(); // mechanic_id -> ts (local debounce)
  const zoneInside = new Map(); // mechanic_id -> boolean
  const proxInside = new Map();
  const sessionFlags = new Set(); // 'mid' or 'mid:once' style
  const intervalTimers = new Map();

  function tryBoot() {
    if (booted) return;
    if (!SB()) return setTimeout(tryBoot, 800);
    booted = true; init();
  }
  setTimeout(tryBoot, 2200);

  async function init() {
    const sb = SB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return setTimeout(init, 2000);
    userId = user.id;
    window.addEventListener("map-changed", loadForMap);
    window.addEventListener("keydown", onKey);
    window.addEventListener("vehicle-entered", onVehicleEvent("vehicle_enter"));
    window.addEventListener("vehicle-exited", onVehicleEvent("vehicle_exit"));
    window.addEventListener("player-emote", onEmote);
    window.addEventListener("weapon-shot", (ev) => fireByKind("on_weapon_shot", ev?.detail || {}));
    window.addEventListener("weapon-reload", (ev) => fireByKind("on_reload", ev?.detail || {}));
    window.addEventListener("npc-killed", (ev) => fireByKind("on_npc_killed", ev?.detail || {}));
    setInterval(tick, 350);
    await loadForMap();
  }

  function fireByKind(kind, ctx) {
    for (const m of mechanics) {
      if (m.trigger?.kind !== kind) continue;
      const p = m.trigger.params || {};
      if (p.slug && ctx.slug && p.slug !== ctx.slug) continue;
      fire(m, ctx);
    }
  }

  function onEmote(ev) {
    const slot = ev?.detail?.slot;
    for (const m of mechanics) {
      if (m.trigger?.kind !== "on_emote") continue;
      const want = m.trigger.params?.slot;
      if (want && want !== slot) continue;
      const rad = Number(m.trigger.params?.npc_radius || 0);
      if (rad > 0 && !findNearestNpc(rad)) continue;
      fire(m, { slot, npc_id: findNearestNpc(rad || 3)?.id });
    }
  }

  function findNearestNpc(radius) {
    const p = window.__player; if (!p) return null;
    const ents = window.__npcEntities; if (!ents) return null;
    let best = null, bestD = Infinity;
    for (const [id, e] of ents) {
      const pos = e?.group?.position; if (!pos) continue;
      const d = Math.hypot(pos.x - p.position.x, pos.z - p.position.z);
      if (d <= radius && d < bestD) { bestD = d; best = { id, ent: e, d }; }
    }
    return best;
  }


  async function loadForMap() {
    mapId = window.__currentMapId;
    if (!mapId) { mechanics = []; return; }
    const sb = SB();
    const { data } = await sb.from("mechanics").select("*").eq("map_id", mapId).eq("active", true);
    mechanics = data || [];
    zoneInside.clear(); proxInside.clear();
    for (const t of intervalTimers.values()) clearInterval(t); intervalTimers.clear();
    setupIntervals();
    if (realtimeChan) try { sb.removeChannel(realtimeChan); } catch {}
    realtimeChan = sb.channel("mechanics:" + mapId)
      .on("postgres_changes", { event: "*", schema: "public", table: "mechanics", filter: "map_id=eq." + mapId }, () => loadForMap())
      .subscribe();
    // fire join triggers
    for (const m of mechanics) if (m.trigger?.kind === "on_join_map") fire(m, {});
    window.dispatchEvent(new Event("mechanics-loaded"));
  }

  function setupIntervals() {
    for (const m of mechanics) {
      if (m.trigger?.kind === "interval") {
        const sec = Math.max(1, parseInt(m.trigger.params?.seconds || 30, 10));
        intervalTimers.set(m.id, setInterval(() => fire(m, {}), sec * 1000));
      }
    }
  }

  function onKey(e) {
    if (e.repeat) return;
    const key = (e.key || "").toLowerCase();
    for (const m of mechanics) {
      if (m.trigger?.kind !== "key_press") continue;
      const wanted = (m.trigger.params?.key || "").toLowerCase();
      if (wanted !== key) continue;
      const prox = m.trigger.params?.proximity;
      if (prox) {
        const p = window.__player; if (!p) continue;
        const dx = p.position.x - prox.x, dz = p.position.z - prox.z;
        if (Math.hypot(dx, dz) > (prox.r || 3)) continue;
      }
      fire(m, {});
    }
  }

  function onVehicleEvent(kind) { return (ev) => {
    for (const m of mechanics) {
      if (m.trigger?.kind !== kind) continue;
      const carId = m.trigger.params?.car_id;
      if (carId && ev?.detail?.car_id && carId !== ev.detail.car_id) continue;
      fire(m, ev?.detail || {});
    }
  };}

  function tick() {
    const p = window.__player; if (!p) return;
    for (const m of mechanics) {
      const t = m.trigger; if (!t) continue;
      if (t.kind === "zone_enter" || t.kind === "zone_exit") {
        const z = t.params || {};
        const dx = p.position.x - (z.x||0), dz = p.position.z - (z.z||0);
        const inside = Math.hypot(dx, dz) <= (z.radius || 3);
        const was = zoneInside.get(m.id) || false;
        if (inside !== was) {
          zoneInside.set(m.id, inside);
          if ((t.kind === "zone_enter" && inside) || (t.kind === "zone_exit" && !inside)) fire(m, {});
        }
      } else if (t.kind === "proximity_to_npc" || t.kind === "proximity_to_asset") {
        // best-effort: only zone-style fallback if x,y,z provided
        const z = t.params || {};
        if (z.x == null) continue;
        const dx = p.position.x - z.x, dz = p.position.z - z.z;
        const inside = Math.hypot(dx, dz) <= (z.radius || 3);
        const was = proxInside.get(m.id) || false;
        if (inside !== was) { proxInside.set(m.id, inside); if (inside) fire(m, {}); }
      }
    }
  }

  // ============ Fire ============
  async function fire(m, ctx) {
    const now = Date.now();
    const lf = lastFire.get(m.id) || 0;
    if (now - lf < 250) return;
    lastFire.set(m.id, now);
    if (m.cooldown_seconds > 0) {
      const sb = SB();
      const { data: cd } = await sb.from("mechanic_cooldowns").select("available_at").eq("mechanic_id", m.id).eq("user_id", userId).maybeSingle();
      if (cd && new Date(cd.available_at).getTime() > now) return;
    }
    for (const cond of (m.conditions || [])) if (!(await checkCondition(cond))) return;
    if (m.cooldown_seconds > 0) {
      const next = new Date(Date.now() + m.cooldown_seconds * 1000).toISOString();
      SB().from("mechanic_cooldowns").upsert({ mechanic_id: m.id, user_id: userId, available_at: next }).then(() => {});
    }
    for (const act of (m.actions || [])) {
      try { if (act.delay_ms) await sleep(act.delay_ms); await runAction(act, ctx); }
      catch (e) { console.warn("[mechanics] action erro", act, e); }
    }
  }

  async function checkCondition(c) {
    const sb = SB();
    const p = c.params || {};
    switch (c.kind) {
      case "has_money": {
        const { data } = await sb.from("profiles").select("balance_cents").eq("id", userId).single();
        return (data?.balance_cents || 0) >= (p.cents || 0);
      }
      case "is_admin": {
        const { data } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
        return !!data;
      }
      case "inside_vehicle": return !!window.__inVehicle;
      case "variable_equals": {
        const v = await getVar(p.key); return JSON.stringify(v) === JSON.stringify(p.value);
      }
      case "variable_gte": {
        const v = Number(await getVar(p.key)) || 0; return v >= (p.value || 0);
      }
      case "time_of_day": {
        const d = new Date(); const m = d.getHours()*60 + d.getMinutes();
        const [h1,m1] = (p.from||"00:00").split(":").map(Number);
        const [h2,m2] = (p.to||"23:59").split(":").map(Number);
        const a = h1*60+m1, b = h2*60+m2;
        return a <= b ? (m >= a && m <= b) : (m >= a || m <= b);
      }
      case "has_item": {
        // best-effort: check map_item_instances held by user
        try {
          const { data } = await sb.from("map_item_instances").select("id").eq("held_by", userId).limit(1);
          return (data?.length || 0) > 0;
        } catch { return false; }
      }
      case "near_npc": {
        const near = findNearestNpc(Number(p.radius || 3));
        if (!near) return false;
        if (p.npc_id && near.id !== p.npc_id) return false;
        return true;
      }
      default: return true;
    }
  }

  async function runAction(a, ctx) {
    const sb = SB();
    const p = a.params || {};
    switch (a.kind) {
      case "show_message":
        LV_toast(p.text || "", p.kind || "ok");
        break;
      case "play_sound":
        if (window.GameAudio?.playClipById) window.GameAudio.playClipById(p.clip_id, { volume: p.volume });
        break;
      case "play_animation":
        if (window.playPlayerAnimation) window.playPlayerAnimation(p.slug, p.duration_ms || 3000);
        break;
      case "give_item":
        if (window.giveItemToPlayer) window.giveItemToPlayer(p.item_slug);
        break;
      case "remove_item":
        if (window.removeItemFromPlayer) window.removeItemFromPlayer(p.item_slug);
        break;
      case "add_money": case "remove_money": {
        const delta = (a.kind === "remove_money" ? -1 : 1) * (p.cents || 0);
        const { data: pr } = await sb.from("profiles").select("balance_cents").eq("id", userId).single();
        const newBal = Math.max(0, (pr?.balance_cents || 0) + delta);
        await sb.from("profiles").update({ balance_cents: newBal }).eq("id", userId);
        await sb.from("wallet_transactions").insert({ user_id: userId, amount_cents: delta, reason: "mechanic" });
        break;
      }
      case "teleport_player":
        if (window.teleportPlayer) window.teleportPlayer(p.x, p.y, p.z, p.map_id);
        else if (window.__player) window.__player.position.set(p.x, p.y, p.z);
        break;
      case "spawn_npc":
        if (window.spawnNpcAt) await window.spawnNpcAt({ model_id: p.model_id, x: p.x, y: p.y, z: p.z, walk_to: p.walk_to, lifetime_ms: p.lifetime_ms });
        break;
      case "spawn_vehicle":
        if (window.spawnVehicleAt) await window.spawnVehicleAt({ car_id: p.car_id, x: p.x, y: p.y, z: p.z });
        break;
      case "set_variable":
        await setVar(p.key, p.value);
        break;
      case "inc_variable": {
        const cur = Number(await getVar(p.key)) || 0;
        await setVar(p.key, cur + (p.by || 1));
        break;
      }
      case "trigger_mechanic": {
        const target = mechanics.find(x => x.id === p.mechanic_id);
        if (target) fire(target, ctx);
        break;
      }
      case "wait": await sleep(p.ms || 1000); break;
      case "start_job":
        if (window.startJob) window.startJob(p.job_id);
        break;
      case "npc_play_animation": {
        const target = p.npc_id
          ? { id: p.npc_id, ent: window.__npcEntities?.get(p.npc_id) }
          : findNearestNpc(Number(p.radius || 3));
        if (!target?.id) break;
        try { window.__setNpcFacePlayer?.(target.id, true); } catch {}
        try { window.__setNpcAnim?.(target.id, p.anim || "talk"); } catch {}
        if (p.duration_ms) setTimeout(() => {
          try { window.__setNpcAnim?.(target.id, "idle"); window.__setNpcFacePlayer?.(target.id, false); } catch {}
        }, p.duration_ms);
        break;
      }
    }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function LV_toast(t, kind) { if (window.LV?.toast) window.LV.toast(t, kind); else console.log("[mechanic]", t); }

  async function getVar(key) {
    const { data } = await SB().from("player_state").select("value").eq("user_id", userId).eq("map_id", mapId || "").eq("key", key).maybeSingle();
    return data?.value;
  }
  async function setVar(key, value) {
    await SB().from("player_state").upsert({ user_id: userId, map_id: mapId || "", key, value }, { onConflict: "user_id,map_id,key" });
  }

  // Public API for admin "Testar"
  window.Mechanics = { fire, list: () => mechanics, reload: loadForMap };
})();
