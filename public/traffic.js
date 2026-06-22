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
    // dispara o tick no servidor pra garantir que está rodando
    pokeTick();
    setInterval(pokeTick, 60000);
  }

  async function pokeTick() {
    try {
      const sb = SB();
      const url = (sb?.supabaseUrl || sb?.rest?.url || "").replace(/\/rest\/v1\/?$/, "");
      if (!url) return;
      // Não bloquear o cliente
      fetch(url + "/functions/v1/traffic-tick?iter=50", {
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
    vehicles.clear(); states.clear();
    if (!mapId) return;

    const { data: v } = await sb.from("traffic_vehicles").select("*").eq("map_id", mapId).eq("active", true);
    for (const row of v || []) vehicles.set(row.id, row);

    if (vehicles.size) {
      const ids = [...vehicles.keys()];
      const { data: st } = await sb.from("traffic_state").select("*").in("vehicle_id", ids);
      for (const s of st || []) applyState(s);
    }
  }

  function applyState(row) {
    const cur = states.get(row.vehicle_id);
    const now = performance.now();
    const target = { x: row.x, y: row.y, z: row.z, rot: row.rot_y, speed: row.speed || 0, t: now };
    if (!cur) {
      states.set(row.vehicle_id, {
        x: row.x, y: row.y, z: row.z, rot: row.rot_y, speed: row.speed || 0,
        target, lastTarget: { ...target }, lastUpdate: now, interval: 1.0,
      });
    } else {
      // estima intervalo entre updates do servidor para extrapolar com confiança
      const dt = Math.max(0.05, (now - cur.lastUpdate) / 1000);
      cur.interval = cur.interval ? cur.interval * 0.7 + dt * 0.3 : dt;
      cur.lastUpdate = now;
      cur.lastTarget = { x: cur.x, y: cur.y, z: cur.z, rot: cur.rot, speed: cur.speed || 0, t: now };
      cur.target = target;
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
          if (def.color_hex) {
            m.traverse((o) => {
              if (o.isMesh && o.material && o.material.color && /body|chass|paint/i.test(o.name || o.material.name || "")) {
                try { o.material = o.material.clone(); o.material.color.set(def.color_hex); } catch {}
              }
            });
          }
          group.add(m);
        }
      } else {
        // fallback
        const mesh = new T.Mesh(
          new T.BoxGeometry(1.8, 0.9, 4),
          new T.MeshStandardMaterial({ color: def.color_hex || 0x4488ff })
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
      if (url && window.GameAudio?.startLoop) {
        window.GameAudio.startLoop(placeholder.audioId, {
          url,
          volume: 0.35,
          category: "engine",
          position: { x: group.position.x, y: group.position.y + 0.5, z: group.position.z },
          refDistance: 3,
          maxDistance: _hearRadius,
          rolloff: 1.6,
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
        const interval = Math.max(0.18, st.interval || 1.0);
        const ageSec = Math.max(0, (now - st.target.t) / 1000);
        const u = Math.min(1, ageSec / interval);
        const ease = u * u * (3 - 2 * u);
        const base = st.lastTarget || st.target;
        st.x = base.x + (st.target.x - base.x) * ease;
        st.y = base.y + (st.target.y - base.y) * ease;
        st.z = base.z + (st.target.z - base.z) * ease;
        if (ageSec > interval && st.target.speed > 0.05) {
          const extra = Math.min(0.18, ageSec - interval);
          st.x += Math.sin(st.target.rot) * st.target.speed * extra;
          st.z += Math.cos(st.target.rot) * st.target.speed * extra;
        }
        let dr = st.target.rot - (base.rot ?? st.rot);
        while (dr > Math.PI) dr -= 2 * Math.PI;
        while (dr < -Math.PI) dr += 2 * Math.PI;
        st.rot = (base.rot ?? st.rot) + dr * ease;
        st.speed = dt > 0 ? Math.hypot(st.x - prevX, st.z - prevZ) / dt : (st.target.speed || 0);

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
