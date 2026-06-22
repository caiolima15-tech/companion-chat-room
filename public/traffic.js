// traffic.js — Runtime de veículos NPC com áudio 3D, render por proximidade e colisão.
// Depende de window.__scene, __camera, __player, __THREE, __GLTFLoader, supabase, GameAudio.

(function () {
  const SB = () => window.__supabase || window.supabase;
  const THREE = () => window.__THREE || window.THREE;
  const scene = () => window.__scene;
  const camera = () => window.__camera;
  const player = () => window.__player;

  let booted = false;
  function tryBoot() {
    if (!SB() || !THREE() || !scene()) return setTimeout(tryBoot, 800);
    if (booted) return;
    booted = true;
    init();
  }
  setTimeout(tryBoot, 1800);

  // ----- Estado -----
  const vehicles = new Map();   // id -> row (definição)
  const states = new Map();     // id -> { x,y,z,rot_y,speed, target:{x,y,z,rot,t} }
  const entities = new Map();   // id -> { group, loading, audioId, lastPos }
  const carCatalog = new Map(); // id -> row
  const routes = new Map();     // route_id -> row
  const waypointsByRoute = new Map(); // route_id -> waypoints ordenados
  let _loadRadius = 60, _hearRadius = 30, _minGap = 6;
  let _channel = null;
  let _mapChannel = null;
  const DEFAULT_WHEEL_OFFSETS = {
    fl: { x: -0.78, y: 0.1, z: 1.25 }, fr: { x: 0.75, y: 0.1, z: 1.25 },
    rl: { x: -0.78, y: 0.1, z: -1.25 }, rr: { x: 0.75, y: 0.1, z: -1.25 },
    scale: 1,
  };

  async function init() {
    const sb = SB();
    try {
      const { data } = await sb.from("game_settings").select("key,value")
        .in("key", ["traffic_load_radius","traffic_hearing_radius","traffic_min_gap_m"]);
      for (const r of data || []) {
        const v = Number(r.value);
        if (!isFinite(v)) continue;
        if (r.key === "traffic_load_radius") _loadRadius = v;
        if (r.key === "traffic_hearing_radius") _hearRadius = v;
        if (r.key === "traffic_min_gap_m") _minGap = v;
      }
    } catch {}

    try {
      const { data } = await sb.from("cars_catalog").select("*");
      for (const c of data || []) carCatalog.set(c.id, c);
    } catch {}

    await reloadForMap();
    window.addEventListener("map-changed", () => reloadForMap());

    // realtime do estado (global — filtramos por map ao aplicar)
    _channel = sb.channel("traffic-state")
      .on("postgres_changes", { event: "*", schema: "public", table: "traffic_state" }, (payload) => {
        const row = payload.new || payload.old;
        if (!row) return;
        if (payload.eventType === "DELETE") { removeVehicle(row.vehicle_id); return; }
        if (!vehicles.has(row.vehicle_id)) return; // outro mapa
        applyState(row);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "traffic_vehicles" }, () => reloadForMap())
      .on("postgres_changes", { event: "*", schema: "public", table: "game_settings" }, (p) => {
        const r = p.new; if (!r) return;
        const v = Number(r.value);
        if (r.key === "traffic_load_radius" && v > 0) _loadRadius = v;
        if (r.key === "traffic_hearing_radius" && v > 0) _hearRadius = v;
        if (r.key === "traffic_min_gap_m" && v > 0) _minGap = v;
      })
      .subscribe();

    startRenderLoop();
    // apenas inicializa estados faltantes; o movimento visual roda localmente, como os NPCs.
    pokeTick(2);
  }

  async function pokeTick(iter = 2) {
    try {
      const sb = SB();
      const url = (sb?.supabaseUrl || sb?.rest?.url || "").replace(/\/rest\/v1\/?$/, "");
      if (!url) return;
      // Não bloquear o cliente. Evita loops longos concorrentes vindos de vários jogadores.
      fetch(url + "/functions/v1/traffic-tick?iter=" + Math.max(1, Math.min(5, Number(iter) || 2)), {
        method: "POST",
        headers: { Authorization: "Bearer " + (sb?.supabaseKey || ""), apikey: sb?.supabaseKey || "" },
      }).catch(() => {});
    } catch {}
  }

  async function reloadForMap() {
    const sb = SB();
    const mapId = window.__currentMapId;
    // limpa
    for (const id of Array.from(entities.keys())) removeVehicle(id);
    vehicles.clear(); states.clear(); routes.clear(); waypointsByRoute.clear();
    if (!mapId) return;

    const { data: v } = await sb.from("traffic_vehicles").select("*").eq("map_id", mapId).eq("active", true);
    for (const row of v || []) vehicles.set(row.id, row);

    const routeIds = [...new Set((v || []).map((row) => row.route_id).filter(Boolean))];
    if (routeIds.length) {
      try {
        const { data: rs } = await sb.from("traffic_routes").select("id,loop,lane_offset,direction").in("id", routeIds);
        for (const r of rs || []) routes.set(r.id, r);
      } catch {}
      try {
        const { data: wps } = await sb.from("traffic_waypoints")
          .select("id,route_id,seq,x,y,z,speed_mps,is_stop,stop_duration_ms,is_yield")
          .in("route_id", routeIds)
          .order("seq", { ascending: true });
        for (const w of wps || []) {
          const list = waypointsByRoute.get(w.route_id) || [];
          list.push(w);
          waypointsByRoute.set(w.route_id, list);
        }
      } catch {}
    }

    if (vehicles.size) {
      const ids = [...vehicles.keys()];
      const { data: st } = await sb.from("traffic_state").select("*").in("vehicle_id", ids);
      for (const s of st || []) applyState(s);
    }
  }

  function applyState(row) {
    const cur = states.get(row.vehicle_id);
    const now = performance.now();
    const target = {
      x: row.x, y: row.y, z: row.z, rot: row.rot_y, speed: row.speed || 0,
      seg: row.segment_index || 0, pathT: row.t || 0, receivedAt: now,
    };
    const def = vehicles.get(row.vehicle_id);
    const routeId = def?.route_id || null;
    if (!cur) {
      states.set(row.vehicle_id, {
        x: row.x, y: row.y, z: row.z, rot: row.rot_y, speed: row.speed || 0,
        target, routeId, localSeg: target.seg, localT: target.pathT, driveSpeed: Math.max(0, target.speed || 0),
        lastTarget: { ...target }, lastUpdate: now, interval: 1.0,
      });
    } else {
      const dt = Math.max(0.05, (now - cur.lastUpdate) / 1000);
      cur.interval = cur.interval ? cur.interval * 0.7 + dt * 0.3 : dt;
      cur.lastUpdate = now;
      cur.lastTarget = { x: cur.x, y: cur.y, z: cur.z, rot: cur.rot, speed: cur.speed || 0, t: now };
      cur.target = target;
      // Só realinha no servidor em reset/troca de rota. Durante o jogo, o visual anda localmente
      // para não perseguir pacotes atrasados de realtime e parecer que teleportou.
      const routeChanged = cur.routeId !== routeId;
      const hardGap = Math.hypot((cur.x || 0) - row.x, (cur.z || 0) - row.z) > 80;
      cur.routeId = routeId;
      if (routeChanged || hardGap || cur.localSeg == null || cur.localT == null) {
        cur.x = row.x; cur.y = row.y; cur.z = row.z; cur.rot = row.rot_y;
        cur.localSeg = target.seg;
        cur.localT = target.pathT;
        cur.driveSpeed = Math.max(0, target.speed || 0);
      }
    }
  }

  function removeVehicle(id) {
    const ent = entities.get(id);
    if (ent) {
      try { scene().remove(ent.group); } catch {}
      try { window.GameAudio?.stopLoop?.(ent.audioId); } catch {}
      entities.delete(id);
    }
    states.delete(id);
  }

  async function spawnEntity(id) {
    const def = vehicles.get(id);
    if (!def || entities.has(id)) return;
    const T = THREE();
    const group = new T.Group();
    group.name = "TrafficCar:" + id;
    const placeholder = { group, loading: true, audioId: "trafficCar:" + id, wheels: {}, wheelSpin: 0, wheelRadius: 0.35 };
    entities.set(id, placeholder);
    scene().add(group);

    const cat = def.car_catalog_id ? carCatalog.get(def.car_catalog_id) : null;
    try {
      if (cat?.chassis_url && window.__GLTFLoader) {
        const loader = new window.__GLTFLoader();
        const gltf = await new Promise((res, rej) => loader.load(cat.chassis_url, res, undefined, rej));
        const m = gltf.scene || gltf.scenes?.[0];
        if (m) {
          m.scale.setScalar(cat.chassis_scale || 1);
          m.position.y = cat.chassis_offset_y || 0;
          m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          group.add(m);
        }
      } else {
        // fallback
        const mesh = new T.Mesh(
          new T.BoxGeometry(1.8, 0.9, 4),
          new T.MeshStandardMaterial({ color: 0x4488ff })
        );
        mesh.position.y = 0.5;
        group.add(mesh);
      }
    } catch (e) {
      console.warn("[traffic] glb load fail", e);
      const mesh = new T.Mesh(new T.BoxGeometry(1.8, 0.9, 4), new T.MeshStandardMaterial({ color: 0xaa3333 }));
      mesh.position.y = 0.5;
      group.add(mesh);
    }
    try { await addWheelSet(placeholder, cat); } catch (e) { console.warn("[traffic] wheel setup fail", e); }
    placeholder.loading = false;

    // posiciona já com o estado atual
    const st = states.get(id);
    if (st) { group.position.set(st.x, st.y, st.z); group.rotation.y = st.rot; }

    // áudio: loop de motor 3D usando clipe do car_catalog (ou padrão)
    try {
      const url = await resolveEngineClipUrl(cat);
      if (window.GameAudio?.startLoop) {
        window.GameAudio.startLoop(placeholder.audioId, {
          url: url || undefined,
          key: url ? undefined : "car_accel_loop",
          volume: 0.3,
          category: "engine",
          position: { x: group.position.x, y: group.position.y + 0.5, z: group.position.z },
          refDistance: 4,
          maxDistance: _hearRadius,
          rolloff: 1.8,
          follow: () => ({ x: group.position.x, y: group.position.y + 0.5, z: group.position.z }),
        });
      }
    } catch {}
  }

  async function resolveEngineClipUrl(cat) {
    if (!cat) return null;
    const sb = SB();
    if (cat.accel_clip_id) {
      try {
        const { data } = await sb.from("audio_clips").select("url").eq("id", cat.accel_clip_id).maybeSingle();
        if (data?.url) return data.url;
      } catch {}
    }
    return null; // GameAudio.startLoop sem url cai no padrão "car_accel_loop"
  }

  function makeWheelFallback(radius) {
    const T = THREE();
    const wheel = new T.Group();
    const tire = new T.Mesh(
      new T.CylinderGeometry(radius, radius, radius * 0.55, 20),
      new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.75, metalness: 0.15 })
    );
    tire.geometry.rotateZ(Math.PI / 2);
    const hub = new T.Mesh(
      new T.CylinderGeometry(radius * 0.48, radius * 0.48, radius * 0.6, 16),
      new T.MeshStandardMaterial({ color: 0xb8c2cc, roughness: 0.35, metalness: 0.7 })
    );
    hub.geometry.rotateZ(Math.PI / 2);
    wheel.add(tire, hub);
    return wheel;
  }

  async function makeWheelTemplate(cat, radius) {
    if (cat?.wheel_url && window.__GLTFLoader) {
      try {
        const loader = new window.__GLTFLoader();
        const gltf = await new Promise((res, rej) => loader.load(cat.wheel_url, res, undefined, rej));
        const raw = gltf.scene || gltf.scenes?.[0];
        if (raw) {
          raw.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          return raw;
        }
      } catch (e) { console.warn("[traffic] wheel glb load fail", e); }
    }
    return makeWheelFallback(radius);
  }

  async function addWheelSet(ent, cat) {
    const T = THREE();
    const offsets = cat?.wheel_offsets || DEFAULT_WHEEL_OFFSETS;
    const radius = cat?.wheel_radius || 0.35;
    ent.wheelRadius = radius;
    const scale = offsets.scale ?? 1;
    const rotY = ((offsets.rotY ?? 0) * Math.PI) / 180;
    const mirror = offsets.mirror || "xz";
    const template = await makeWheelTemplate(cat, radius);
    ent.wheels = {};
    for (const k of ["fl", "fr", "rl", "rr"]) {
      const off = offsets[k] || DEFAULT_WHEEL_OFFSETS[k];
      const node = new T.Group();
      node.position.set(off.x, off.y, off.z);
      const spin = new T.Group();
      spin.scale.setScalar(scale);
      let visual = template.clone(true);
      const isRight = k === "fr" || k === "rr";
      const sx = (isRight && (mirror === "x" || mirror === "xz")) ? -1 : 1;
      const sz = (isRight && (mirror === "z" || mirror === "xz")) ? -1 : 1;
      visual.scale.set(sx, 1, sz);
      visual.rotation.y = rotY;
      spin.add(visual);
      node.add(spin);
      node.userData.spin = spin;
      ent.group.add(node);
      ent.wheels[k] = node;
    }
  }

  function normSeg(seg, n) {
    return ((seg % n) + n) % n;
  }

  function advancePath(route, wpList, seg, t, meters) {
    const N = wpList.length;
    if (N < 2) return { seg: 0, t: 0 };
    seg = Math.max(0, Math.min(N - 1, Math.floor(seg || 0)));
    t = Math.max(0, Math.min(1, Number(t) || 0));
    let guard = 0;
    if (meters < 0) {
      while (meters < -0.0001 && guard++ < N + 4) {
        const a = wpList[normSeg(seg, N)];
        const b = wpList[route.loop ? normSeg(seg + 1, N) : seg + 1];
        if (!a || !b) return { seg: 0, t: 0 };
        const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const back = t * len;
        if (-meters < back) {
          t += meters / len;
          meters = 0;
        } else {
          meters += back;
          seg -= 1;
          t = 1;
          if (!route.loop && seg < 0) return { seg: 0, t: 0 };
          if (route.loop && seg < 0) seg = N - 1;
        }
      }
      return { seg, t };
    }
    while (meters > 0.0001 && guard++ < N + 4) {
      const a = wpList[normSeg(seg, N)];
      const b = wpList[route.loop ? normSeg(seg + 1, N) : seg + 1];
      if (!a || !b) return { seg: Math.max(0, N - 2), t: 1 };
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const left = (1 - t) * len;
      if (meters < left) {
        t += meters / len;
        meters = 0;
      } else {
        meters -= left;
        seg += 1;
        t = 0;
        if (!route.loop && seg >= N - 1) return { seg: N - 2, t: 1 };
        if (route.loop && seg >= N) seg = 0;
      }
    }
    return { seg, t };
  }

  function pathDelta(fromSeg, fromT, toSeg, toT, n, loop) {
    let d = (toSeg + toT) - (fromSeg + fromT);
    if (loop) {
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
    }
    return d;
  }

  function poseOnRoute(route, wpList, seg, t) {
    const N = wpList.length;
    if (N < 2) return null;
    if (!route.loop) seg = Math.max(0, Math.min(N - 2, seg));
    const a = wpList[normSeg(seg, N)];
    const b = wpList[route.loop ? normSeg(seg + 1, N) : seg + 1];
    if (!a || !b) return null;
    t = Math.max(0, Math.min(1, t));
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const lane = route.lane_offset || 0;
    const perpX = -dz / len;
    const perpZ = dx / len;
    return {
      x: a.x + dx * t + perpX * lane,
      y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * t,
      z: a.z + dz * t + perpZ * lane,
      rot: Math.atan2(dx, dz),
    };
  }

  function stepLocalTraffic(id, st, dt, now) {
    const def = vehicles.get(id);
    const route = def?.route_id ? routes.get(def.route_id) : null;
    const wpList = def?.route_id ? waypointsByRoute.get(def.route_id) : null;
    if (!route || !wpList || wpList.length < 2) return null;
    if (st.localSeg == null || st.localT == null) {
      st.localSeg = st.target?.seg || 0;
      st.localT = st.target?.pathT || 0;
    }

    const curWp = wpList[normSeg(st.localSeg, wpList.length)] || wpList[0];
    const desiredSpeed = Math.max(0, Math.min(def.max_speed_mps || 10, curWp?.speed_mps || 8));
    const accelK = desiredSpeed > (st.driveSpeed || 0) ? 1.8 : 3.5;
    st.driveSpeed = (st.driveSpeed || 0) + (desiredSpeed - (st.driveSpeed || 0)) * (1 - Math.exp(-dt * accelK));

    const next = advancePath(route, wpList, st.localSeg, st.localT, st.driveSpeed * dt);

    st.localSeg = next.seg;
    st.localT = next.t;
    return poseOnRoute(route, wpList, st.localSeg, st.localT);
  }

  // ----- Render loop -----
  let _lastCrash = 0;
  function startRenderLoop() {
    let last = performance.now();
    function tick() {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const p = player()?.position;
      const lr = _loadRadius;
      const lr2 = lr * lr;
      const despawn2 = (lr * 1.25) * (lr * 1.25);


      for (const [id, st] of states) {
        const prevX = st.x, prevZ = st.z;
        const routePose = stepLocalTraffic(id, st, dt, now);
        const tgtSpeed = st.target?.speed || 0;
        const fallbackPose = st.target ? { x: st.target.x, y: st.target.y, z: st.target.z, rot: st.target.rot } : null;
        const pose = routePose || fallbackPose;
        if (!pose) continue;
        // O visual anda localmente a cada frame; updates atrasados só corrigem devagar.
        const kPos = routePose ? 1 : (1 - Math.exp(-dt * 3.0));
        st.x += (pose.x - st.x) * kPos;
        st.y += (pose.y - st.y) * kPos;
        st.z += (pose.z - st.z) * kPos;
        let dr = pose.rot - st.rot;
        while (dr > Math.PI) dr -= 2 * Math.PI;
        while (dr < -Math.PI) dr += 2 * Math.PI;
        st.rot += dr * (1 - Math.exp(-dt * 10.0));
        const moved = Math.hypot(st.x - prevX, st.z - prevZ);
        st.speed = dt > 0 ? moved / dt : tgtSpeed;

        const distance2 = p ? (st.x - p.x) ** 2 + (st.z - p.z) ** 2 : 0;
        const ent = entities.get(id);

        if (p && distance2 < lr2 && !ent) {
          spawnEntity(id);
        } else if (ent && p && distance2 > despawn2) {
          try { scene().remove(ent.group); } catch {}
          try { window.GameAudio?.stopLoop?.(ent.audioId); } catch {}
          entities.delete(id);
        } else if (ent && !ent.loading) {
          ent.group.position.set(st.x, st.y, st.z);
          ent.group.rotation.y = st.rot;
          const wr = ent.wheelRadius || 0.35;
          // gira para frente quando o carro anda para frente (+Z local)
          ent.wheelSpin -= (st.speed * dt) / wr;
          for (const k of ["fl", "fr", "rl", "rr"]) {
            const w = ent.wheels?.[k];
            const spin = w?.userData?.spin;
            if (spin) spin.rotation.x = ent.wheelSpin;
          }
          // motor: modula taxa pela velocidade
          try {
            const r = Math.min(1, Math.abs(st.speed) / 12);
            const audioId = ent.audioId;
            window.GameAudio?.setLoopRate?.(audioId, 0.8 + 0.9 * r);
            window.GameAudio?.setLoopVolume?.(audioId, 0.15 + 0.45 * r);
          } catch {}
          // colisão com player
          if (p && distance2 < 6.25 && now - _lastCrash > 1500) {
            const dxp = p.x - st.x, dzp = p.z - st.z;
            const len = Math.hypot(dxp, dzp) || 1;
            try { window.GameAudio?.playOnce?.("car_crash", { volume: 0.7, position: { x: st.x, y: st.y + 0.5, z: st.z } }); } catch {}
            try {
              p.x += (dxp / len) * 1.2;
              p.z += (dzp / len) * 1.2;
            } catch {}
            _lastCrash = now;
          }
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Expor método pequeno pra o admin poder forçar reload
  window.Traffic = {
    reload: reloadForMap,
    pokeTick,
    getVehicles: () => vehicles,
    getEntities: () => entities,
  };

  // setLoopRate/Volume não estão exportados em audio.js — adiciona shim seguro
  if (!window.GameAudio?.setLoopRate) {
    const tryShim = () => {
      if (!window.GameAudio) return setTimeout(tryShim, 500);
      if (!window.GameAudio.setLoopRate) {
        window.GameAudio.setLoopRate = function () {};
        window.GameAudio.setLoopVolume = window.GameAudio.setLoopVolume || function () {};
      }
    };
    tryShim();
  }
})();
