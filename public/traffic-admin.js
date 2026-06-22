// traffic-admin.js — Painel admin de Trânsito. Botão 🚦 Trânsito.
// Abas: Rotas (traçar/editar), Semáforos, Veículos, Visualização.

(function () {
  const SB = () => window.__supabase || window.supabase;
  const THREE = () => window.__THREE || window.THREE;
  const scene = () => window.__scene;
  const camera = () => window.__camera;
  const renderer = () => window.__renderer;

  let overlay = null, currentTab = "routes";
  let editor = null; // { routeId, gizmos:Map, line:Line, deleteMarker, selectedWpId, raycaster, pointer, wps:[] }
  let deleteMarkerTexture = null;

  function getMapId() {
    return window.__currentMapId || localStorage.getItem("neon-tap-room-map") || "bar";
  }

  // ----- Overlay base (mesmo estilo de audio-admin) -----
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "users-admin-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="users-admin-panel" style="max-width:780px">
        <div class="users-admin-header">
          <div class="users-admin-title">🚦 Trânsito de carros</div>
          <button type="button" class="users-admin-close" id="trfClose">×</button>
        </div>
        <div class="users-admin-tabs" id="trfTabs">
          <button data-tab="routes" class="users-admin-tab is-active">Rotas</button>
          <button data-tab="signals" class="users-admin-tab">Semáforos</button>
          <button data-tab="vehicles" class="users-admin-tab">Veículos</button>
          <button data-tab="view" class="users-admin-tab">Visualização</button>
        </div>
        <div class="users-admin-body" id="trfBody" style="max-height:65vh;overflow:auto;padding:12px"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#trfClose").onclick = close;
    overlay.querySelectorAll(".users-admin-tab").forEach((b) => b.onclick = () => {
      currentTab = b.dataset.tab;
      overlay.querySelectorAll(".users-admin-tab").forEach((x) => x.classList.toggle("is-active", x === b));
      renderTab();
    });
    return overlay;
  }
  function open() { ensureOverlay(); overlay.hidden = false; renderTab(); }
  function close() { if (overlay) overlay.hidden = true; }

  async function renderTab() {
    const body = overlay.querySelector("#trfBody");
    if (currentTab === "routes") return renderRoutes(body);
    if (currentTab === "signals") return renderSignals(body);
    if (currentTab === "vehicles") return renderVehicles(body);
    if (currentTab === "view") return renderView(body);
  }

  // ============ ROTAS ============
  async function renderRoutes(body) {
    const sb = SB();
    const mapId = getMapId();
    const { data: rs, error: loadError } = await sb.from("traffic_routes").select("*").eq("map_id", mapId).order("created_at");
    body.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button id="trfNewRoute" style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer">+ Nova rota</button>
        <span style="opacity:.7;font-size:12px;align-self:center">Mapa atual: ${mapId || "(nenhum)"}</span>
      </div>
      <div id="trfStatus" style="display:${loadError ? 'block' : 'none'};margin-bottom:8px;color:#fca5a5;font-size:12px">${loadError ? escapeHtml(loadError.message) : ''}</div>
      <div id="trfRouteList" style="display:flex;flex-direction:column;gap:6px"></div>`;
    const list = body.querySelector("#trfRouteList");
    const status = body.querySelector("#trfStatus");
    list.innerHTML = (rs || []).map((r) => `
      <div style="border:1px solid #333;border-radius:8px;padding:8px;background:#0a0a14">
        <div style="display:flex;gap:8px;align-items:center">
          <input data-id="${r.id}" data-f="name" value="${escapeHtml(r.name)}" style="flex:1;background:#000;color:#fff;border:1px solid #333;border-radius:4px;padding:4px 6px"/>
          <select data-id="${r.id}" data-f="direction" style="background:#000;color:#fff;border:1px solid #333;border-radius:4px;padding:4px">
            <option value="forward" ${r.direction==='forward'?'selected':''}>Sentido →</option>
            <option value="backward" ${r.direction==='backward'?'selected':''}>Sentido ←</option>
          </select>
          <label style="font-size:11px">Faixa (m)<input data-id="${r.id}" data-f="lane_offset" type="number" step="0.2" value="${r.lane_offset || 0}" style="width:60px;background:#000;color:#fff;border:1px solid #333;border-radius:4px;padding:2px 4px;margin-left:4px"/></label>
          <label style="font-size:11px"><input data-id="${r.id}" data-f="loop" type="checkbox" ${r.loop?'checked':''}/> loop</label>
          <button data-edit="${r.id}" style="background:#3b82f6;color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer">${editor?.routeId===r.id?'Sair':'Traçar'}</button>
          <button data-del="${r.id}" style="background:#dc2626;color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer">×</button>
        </div>
      </div>`).join("") || `<div style="opacity:.6">Nenhuma rota. Clique em "+ Nova rota".</div>`;
    body.querySelector("#trfNewRoute").onclick = async () => {
      const activeMapId = getMapId();
      if (!activeMapId) { alert("Nenhum mapa ativo. Entre num mapa antes de criar rota."); return; }
      const btn = body.querySelector("#trfNewRoute");
      btn.disabled = true;
      status.style.display = "block";
      status.style.color = "#93c5fd";
      status.textContent = "Criando rota...";
      const { data: u, error: userError } = await sb.auth.getUser();
      if (userError) console.warn("[traffic] auth user unavailable:", userError);
      const payload = { map_id: activeMapId, name: "Rota " + ((rs?.length || 0) + 1) };
      if (u?.user?.id) payload.created_by = u.user.id;
      const { error } = await sb.from("traffic_routes").insert(payload);
      if (error) {
        console.error("[traffic] insert route failed:", error);
        btn.disabled = false;
        status.style.color = "#fca5a5";
        status.textContent = "Erro ao criar rota: " + error.message;
        alert("Erro ao criar rota: " + error.message);
        return;
      }
      renderRoutes(body);
    };
    list.querySelectorAll("input,select").forEach((el) => el.onchange = async () => {
      const id = el.dataset.id, f = el.dataset.f;
      const v = el.type === "checkbox" ? el.checked : (el.type === "number" ? parseFloat(el.value) : el.value);
      await sb.from("traffic_routes").update({ [f]: v }).eq("id", id);
    });
    list.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      if (!confirm("Apagar rota e todos os pontos/veículos?")) return;
      await sb.from("traffic_routes").delete().eq("id", b.dataset.del);
      renderRoutes(body);
    });
    list.querySelectorAll("[data-edit]").forEach((b) => b.onclick = async () => {
      if (editor?.routeId === b.dataset.edit) exitEditor();
      else await enterEditor(b.dataset.edit);
      renderRoutes(body);
    });
  }

  // -------- Editor de traçado (click no chão adiciona ponto conectado ao anterior) --------
  async function enterEditor(routeId) {
    exitEditor();
    const sb = SB(); const T = THREE();
    const { data: wps } = await sb.from("traffic_waypoints").select("*").eq("route_id", routeId).order("seq");
    editor = { routeId, gizmos: new Map(), line: null, deleteMarker: null, selectedWpId: null, raycaster: new T.Raycaster(), pointer: new T.Vector2(), wps: wps || [] };
    editor.raycaster.params.Sprite = { threshold: 0.2 };
    rebuildGizmos();
    bindEvents();
    showHud();
    editor.channel = sb.channel("traffic-route-" + routeId)
      .on("postgres_changes", { event: "*", schema: "public", table: "traffic_waypoints", filter: `route_id=eq.${routeId}` }, async () => {
        if (!editor) return;
        const { data } = await sb.from("traffic_waypoints").select("*").eq("route_id", routeId).order("seq");
        editor.wps = data || []; rebuildGizmos();
      }).subscribe();
  }
  function exitEditor() {
    if (!editor) return;
    const sb = SB();
    if (editor.channel) try { sb.removeChannel(editor.channel); } catch {}
    for (const m of editor.gizmos.values()) scene().remove(m);
    if (editor.deleteMarker) scene().remove(editor.deleteMarker);
    if (editor.line) scene().remove(editor.line);
    unbindEvents();
    document.getElementById("trfHud")?.remove();
    editor = null;
  }
  function rebuildGizmos() {
    const T = THREE();
    for (const m of editor.gizmos.values()) scene().remove(m);
    editor.gizmos.clear();
    if (editor.deleteMarker) { scene().remove(editor.deleteMarker); editor.deleteMarker = null; }
    if (editor.line) { scene().remove(editor.line); editor.line = null; }
    for (const wp of editor.wps) {
      const color = wp.is_stop ? 0xef4444 : (wp.is_yield ? 0xfacc15 : 0x22d3ee);
      const sph = new T.Mesh(
        new T.SphereGeometry(0.4, 14, 10),
        new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false })
      );
      sph.position.set(wp.x, (wp.y || 0) + 0.5, wp.z);
      sph.userData.wp = wp;
      sph.renderOrder = 9999;
      scene().add(sph);
      editor.gizmos.set(wp.id, sph);
    }
    updateDeleteMarker();
    if (editor.wps.length >= 2) {
      const pts = editor.wps.map((w) => new T.Vector3(w.x, (w.y || 0) + 0.5, w.z));
      const geo = new T.BufferGeometry().setFromPoints(pts);
      editor.line = new T.Line(geo, new T.LineBasicMaterial({ color: 0x22d3ee, depthTest: false }));
      editor.line.renderOrder = 9998;
      scene().add(editor.line);
    }
  }
  function getDeleteMarkerTexture() {
    const T = THREE();
    if (deleteMarkerTexture) return deleteMarkerTexture;
    const cnv = document.createElement("canvas");
    cnv.width = 128; cnv.height = 128;
    const ctx = cnv.getContext("2d");
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = "#dc2626";
    ctx.beginPath(); ctx.arc(64, 64, 48, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 14; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(44, 44); ctx.lineTo(84, 84); ctx.moveTo(84, 44); ctx.lineTo(44, 84); ctx.stroke();
    deleteMarkerTexture = new T.CanvasTexture(cnv);
    return deleteMarkerTexture;
  }
  function updateDeleteMarker() {
    if (!editor) return;
    const T = THREE();
    const selected = editor.selectedWpId ? editor.gizmos.get(editor.selectedWpId) : null;
    if (!selected) {
      if (editor.deleteMarker) { scene().remove(editor.deleteMarker); editor.deleteMarker = null; }
      return;
    }
    if (!editor.deleteMarker) {
      const mat = new T.SpriteMaterial({ map: getDeleteMarkerTexture(), transparent: true, depthTest: false, depthWrite: false });
      editor.deleteMarker = new T.Sprite(mat);
      editor.deleteMarker.name = "TrafficRouteDeleteX";
      editor.deleteMarker.scale.set(0.9, 0.9, 0.9);
      editor.deleteMarker.renderOrder = 10001;
      editor.deleteMarker.userData.isDeleteMarker = true;
      scene().add(editor.deleteMarker);
    }
    editor.deleteMarker.position.copy(selected.position).add(new T.Vector3(0, 0.95, 0));
  }
  function showHud() {
    const old = document.getElementById("trfHud"); if (old) old.remove();
    const hud = document.createElement("div");
    hud.id = "trfHud";
    hud.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#111d;border:1px solid #22d3ee;border-radius:10px;padding:8px 14px;color:#fff;font:13px system-ui;z-index:10000;display:flex;gap:8px;align-items:center;max-width:90vw;flex-wrap:wrap";
    hud.innerHTML = `
      <strong>🚦 Traçando rota</strong>
      <span style="opacity:.7;font-size:11px">Clique no chão pra adicionar ponto · Clique no ponto mostra X para apagar · Shift+click: parada · Alt+click: yield</span>
      <button id="trfCloseLoop" style="background:#16a34a;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer">Fechar laço</button>
      <button id="trfDelLast" style="background:#f59e0b;color:#111;border:none;padding:4px 10px;border-radius:4px;cursor:pointer">Apagar último</button>
      <button id="trfDelAll" style="background:#dc2626;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer">Apagar todos</button>
      <button id="trfExit" style="background:#c33;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer">Sair</button>`;
    document.body.appendChild(hud);
    hud.querySelector("#trfExit").onclick = () => { exitEditor(); renderTab(); };
    hud.querySelector("#trfCloseLoop").onclick = async () => {
      if (!editor?.wps?.length) return;
      const first = editor.wps[0];
      const sb = SB();
      const seq = (editor.wps[editor.wps.length - 1]?.seq || 0) + 1;
      await sb.from("traffic_waypoints").insert({ route_id: editor.routeId, seq, x: first.x, y: first.y, z: first.z });
    };
    hud.querySelector("#trfDelLast").onclick = async () => {
      if (!editor?.wps?.length) return;
      const last = editor.wps[editor.wps.length - 1];
      const sb = SB();
      await sb.from("traffic_waypoints").delete().eq("id", last.id);
    };
    hud.querySelector("#trfDelAll").onclick = async () => {
      if (!editor?.wps?.length) return;
      if (!confirm("Apagar TODOS os pontos desta rota?")) return;
      const sb = SB();
      await sb.from("traffic_waypoints").delete().eq("route_id", editor.routeId);
    };
  }
  let bound = false;
  function bindEvents() {
    if (bound) return; bound = true;
    const cv = renderer()?.domElement || window;
    cv.addEventListener("pointerdown", onDown, true);
    cv.addEventListener("contextmenu", onCtx, true);
  }
  function unbindEvents() {
    if (!bound) return; bound = false;
    const cv = renderer()?.domElement || window;
    cv.removeEventListener("pointerdown", onDown, true);
    cv.removeEventListener("contextmenu", onCtx, true);
  }
  function onCtx(e) { if (editor) { e.preventDefault(); e.stopPropagation(); } }
  function setPointerNDC(e) {
    const T = THREE();
    const rect = (renderer()?.domElement || document.body).getBoundingClientRect();
    editor.pointer = editor.pointer || new T.Vector2();
    editor.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    editor.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }
  function raycastGizmo() {
    if (!editor || !camera()) return null;
    editor.raycaster.setFromCamera(editor.pointer, camera());
    const hits = editor.raycaster.intersectObjects(Array.from(editor.gizmos.values()), false);
    return hits[0]?.object || null;
  }
  function raycastDeleteMarker() {
    if (!editor?.deleteMarker || !camera()) return null;
    editor.raycaster.setFromCamera(editor.pointer, camera());
    const hits = editor.raycaster.intersectObject(editor.deleteMarker, false);
    return hits[0]?.object || null;
  }
  async function deleteWaypointNow(wpId) {
    if (!editor || !wpId) return;
    const sb = SB();
    const gizmo = editor.gizmos.get(wpId);
    if (gizmo) { scene().remove(gizmo); editor.gizmos.delete(wpId); }
    if (editor.selectedWpId === wpId) editor.selectedWpId = null;
    editor.wps = editor.wps.filter((w) => w.id !== wpId);
    rebuildGizmos();
    const { error } = await sb.from("traffic_waypoints").delete().eq("id", wpId);
    if (error) console.warn("[traffic] delete waypoint failed", error);
  }
  function raycastGround() {
    if (!editor || !camera()) return null;
    const T = THREE();
    editor.raycaster.setFromCamera(editor.pointer, camera());
    const sc = scene();
    const objs = [];
    const giz = new Set(editor.gizmos.values());
    sc.traverse((o) => { if (o.isMesh && o.visible !== false && !giz.has(o)) objs.push(o); });
    const hits = editor.raycaster.intersectObjects(objs, false);
    if (hits[0]) return hits[0].point;
    const plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
    const hit = new T.Vector3();
    editor.raycaster.ray.intersectPlane(plane, hit);
    return hit;
  }
  async function onDown(e) {
    if (!editor) return;
    setPointerNDC(e);
    const sb = SB();
    // Right click: apagar gizmo
    if (e.button === 2) {
      const g = raycastGizmo();
      if (g) { e.preventDefault(); e.stopImmediatePropagation(); await deleteWaypointNow(g.userData.wp.id); }
      return;
    }
    if (e.button !== 0) return;
    const del = raycastDeleteMarker();
    if (del && editor.selectedWpId) {
      e.preventDefault(); e.stopImmediatePropagation();
      await deleteWaypointNow(editor.selectedWpId);
      return;
    }
    const g = raycastGizmo();
    if (g) {
      e.preventDefault(); e.stopImmediatePropagation();
      const wp = g.userData.wp;
      editor.selectedWpId = wp.id;
      updateDeleteMarker();
      if (e.shiftKey) await sb.from("traffic_waypoints").update({ is_stop: !wp.is_stop }).eq("id", wp.id);
      else if (e.altKey) await sb.from("traffic_waypoints").update({ is_yield: !wp.is_yield }).eq("id", wp.id);
      return;
    }
    const p = raycastGround();
    if (!p) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const seq = (editor.wps[editor.wps.length - 1]?.seq ?? -1) + 1;
    await sb.from("traffic_waypoints").insert({ route_id: editor.routeId, seq, x: p.x, y: p.y, z: p.z });
  }

  // ============ SEMÁFOROS ============
  async function renderSignals(body) {
    const sb = SB();
    const mapId = window.__currentMapId;
    const { data: rs } = await sb.from("traffic_routes").select("id,name").eq("map_id", mapId);
    const routeIds = (rs || []).map((r) => r.id);
    const wps = routeIds.length
      ? (await sb.from("traffic_waypoints").select("id,route_id,seq,is_stop").in("route_id", routeIds).order("seq")).data || []
      : [];
    const sigs = wps.length
      ? (await sb.from("traffic_signals").select("*").in("waypoint_id", wps.map((w) => w.id))).data || []
      : [];
    const sigByWp = {}; for (const s of sigs) sigByWp[s.waypoint_id] = s;
    const routeName = Object.fromEntries((rs || []).map((r) => [r.id, r.name]));
    body.innerHTML = `<div style="opacity:.7;font-size:12px;margin-bottom:8px">Liga semáforo num waypoint da rota. Veículos param em vermelho/amarelo.</div>
      <div style="display:flex;flex-direction:column;gap:6px">
      ${wps.map((w) => {
        const s = sigByWp[w.id];
        return `<div style="border:1px solid #333;border-radius:8px;padding:8px;background:#0a0a14;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="flex:1">${routeName[w.route_id] || w.route_id} · wp #${w.seq}</span>
          ${s ? `
            <label style="font-size:11px">verde(ms)<input data-id="${s.id}" data-f="cycle_green_ms" type="number" value="${s.cycle_green_ms}" style="width:70px;background:#000;color:#fff;border:1px solid #333;border-radius:4px;padding:2px"/></label>
            <label style="font-size:11px">amar(ms)<input data-id="${s.id}" data-f="cycle_yellow_ms" type="number" value="${s.cycle_yellow_ms}" style="width:70px;background:#000;color:#fff;border:1px solid #333;border-radius:4px;padding:2px"/></label>
            <label style="font-size:11px">verm(ms)<input data-id="${s.id}" data-f="cycle_red_ms" type="number" value="${s.cycle_red_ms}" style="width:70px;background:#000;color:#fff;border:1px solid #333;border-radius:4px;padding:2px"/></label>
            <label style="font-size:11px">offset<input data-id="${s.id}" data-f="phase_offset_ms" type="number" value="${s.phase_offset_ms}" style="width:70px;background:#000;color:#fff;border:1px solid #333;border-radius:4px;padding:2px"/></label>
            <button data-rmsig="${s.id}" style="background:#dc2626;color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer">Remover</button>
          ` : `<button data-addsig="${w.id}" style="background:#16a34a;color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer">+ Semáforo</button>`}
        </div>`;
      }).join("") || `<div style="opacity:.6">Sem waypoints ainda.</div>`}
      </div>`;
    body.querySelectorAll("[data-addsig]").forEach((b) => b.onclick = async () => {
      await sb.from("traffic_signals").insert({ waypoint_id: b.dataset.addsig });
      renderSignals(body);
    });
    body.querySelectorAll("[data-rmsig]").forEach((b) => b.onclick = async () => {
      await sb.from("traffic_signals").delete().eq("id", b.dataset.rmsig);
      renderSignals(body);
    });
    body.querySelectorAll("input").forEach((el) => el.onchange = async () => {
      await sb.from("traffic_signals").update({ [el.dataset.f]: parseInt(el.value) || 0 }).eq("id", el.dataset.id);
    });
  }

  // ============ VEÍCULOS ============
  async function renderVehicles(body) {
    const sb = SB();
    const mapId = window.__currentMapId;
    const { data: rs } = await sb.from("traffic_routes").select("id,name").eq("map_id", mapId);
    const { data: cars } = await sb.from("cars_catalog").select("id,name").order("name");
    const { data: vs } = await sb.from("traffic_vehicles").select("*").eq("map_id", mapId);
    body.innerHTML = `
      <div style="border:1px solid #333;border-radius:8px;padding:10px;background:#0a0a14;margin-bottom:10px">
        <strong style="display:block;margin-bottom:6px">+ Novo veículo</strong>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <select id="trfVNewRoute" style="background:#000;color:#fff;border:1px solid #333;border-radius:4px;padding:4px">
            ${(rs || []).map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("")}
          </select>
          <select id="trfVNewCar" style="background:#000;color:#fff;border:1px solid #333;border-radius:4px;padding:4px">
            <option value="">(carro do catálogo)</option>
            ${(cars || []).map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}
          </select>
          <input id="trfVNewColor" type="color" value="#4488ff" style="width:36px;height:30px;border:1px solid #333;border-radius:4px;background:#000"/>
          <label style="font-size:11px">vel máx<input id="trfVNewSpeed" type="number" value="10" step="0.5" style="width:60px;background:#000;color:#fff;border:1px solid #333;border-radius:4px;padding:2px;margin-left:4px"/></label>
          <button id="trfVAdd" style="background:#16a34a;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer">Adicionar</button>
        </div>
      </div>
      <div id="trfVList" style="display:flex;flex-direction:column;gap:6px">
        ${(vs || []).map((v) => {
          const car = (cars || []).find((c) => c.id === v.car_catalog_id);
          const r = (rs || []).find((x) => x.id === v.route_id);
          return `<div style="border:1px solid #333;border-radius:8px;padding:8px;background:#0a0a14;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span style="flex:1">${escapeHtml(r?.name || "?")} · ${escapeHtml(car?.name || "fallback")}</span>
            <input data-id="${v.id}" data-f="color_hex" type="color" value="${v.color_hex || '#4488ff'}" style="width:32px;height:26px;border:1px solid #333;border-radius:4px;background:#000"/>
            <label style="font-size:11px">vel<input data-id="${v.id}" data-f="max_speed_mps" type="number" step="0.5" value="${v.max_speed_mps}" style="width:60px;background:#000;color:#fff;border:1px solid #333;border-radius:4px;padding:2px;margin-left:4px"/></label>
            <label style="font-size:11px"><input data-id="${v.id}" data-f="active" type="checkbox" ${v.active?'checked':''}/> ativo</label>
            <button data-del="${v.id}" style="background:#dc2626;color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer">×</button>
          </div>`;
        }).join("") || `<div style="opacity:.6">Nenhum veículo. Adicione um acima.</div>`}
      </div>`;
    body.querySelector("#trfVAdd").onclick = async () => {
      const route_id = body.querySelector("#trfVNewRoute").value;
      if (!route_id) return alert("Crie uma rota antes.");
      const car_catalog_id = body.querySelector("#trfVNewCar").value || null;
      const color_hex = body.querySelector("#trfVNewColor").value;
      const max_speed_mps = parseFloat(body.querySelector("#trfVNewSpeed").value) || 10;
      await sb.from("traffic_vehicles").insert({ map_id: mapId, route_id, car_catalog_id, color_hex, max_speed_mps, active: true });
      renderVehicles(body);
      try { window.Traffic?.reload?.(); } catch {}
    };
    body.querySelectorAll("#trfVList input").forEach((el) => el.onchange = async () => {
      const v = el.type === "checkbox" ? el.checked : (el.type === "number" ? parseFloat(el.value) : el.value);
      await sb.from("traffic_vehicles").update({ [el.dataset.f]: v }).eq("id", el.dataset.id);
      try { window.Traffic?.reload?.(); } catch {}
    });
    body.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      await sb.from("traffic_vehicles").delete().eq("id", b.dataset.del);
      renderVehicles(body);
      try { window.Traffic?.reload?.(); } catch {}
    });
  }

  // ============ VISUALIZAÇÃO ============
  async function renderView(body) {
    const sb = SB();
    const keys = ["traffic_load_radius","traffic_hearing_radius","traffic_min_gap_m"];
    const { data } = await sb.from("game_settings").select("key,value").in("key", keys);
    const cur = {}; for (const r of data || []) cur[r.key] = Number(r.value);
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <label style="font-size:12px">Raio de carregamento dos carros (m): <strong id="lrV">${cur.traffic_load_radius ?? 60}</strong></label>
          <input id="lr" type="range" min="20" max="200" step="5" value="${cur.traffic_load_radius ?? 60}" style="width:100%"/>
        </div>
        <div>
          <label style="font-size:12px">Raio de audição do motor (m): <strong id="hrV">${cur.traffic_hearing_radius ?? 30}</strong></label>
          <input id="hr" type="range" min="10" max="120" step="2" value="${cur.traffic_hearing_radius ?? 30}" style="width:100%"/>
        </div>
        <div>
          <label style="font-size:12px">Distância mínima entre carros (m): <strong id="gpV">${cur.traffic_min_gap_m ?? 6}</strong></label>
          <input id="gp" type="range" min="2" max="20" step="0.5" value="${cur.traffic_min_gap_m ?? 6}" style="width:100%"/>
        </div>
        <div style="opacity:.7;font-size:11px">Salvo automaticamente para todos os usuários.</div>
      </div>`;
    const wire = (id, key) => {
      const r = body.querySelector("#" + id), lbl = body.querySelector("#" + id + "V");
      let saveT;
      r.oninput = () => { lbl.textContent = r.value; clearTimeout(saveT); saveT = setTimeout(async () => {
        await sb.from("game_settings").upsert({ key, value: parseFloat(r.value) }, { onConflict: "key" });
      }, 300); };
    };
    wire("lr", "traffic_load_radius");
    wire("hr", "traffic_hearing_radius");
    wire("gp", "traffic_min_gap_m");
  }

  function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

  // ----- Botão no topbar -----
  function ensureButton() {
    if (document.getElementById("trafficAdminToggle")) return;
    const btn = document.createElement("button");
    btn.id = "trafficAdminToggle";
    btn.className = "admin-only";
    btn.type = "button";
    btn.title = "Trânsito (admin)";
    btn.textContent = "🚦 Trânsito";
    btn.style.cssText = "position:fixed;top:12px;right:12px;z-index:9050;background:rgba(15,23,42,0.9);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:6px 10px;cursor:pointer;backdrop-filter:blur(6px);font:13px system-ui";
    btn.onclick = open;
    document.body.appendChild(btn);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureButton);
  else ensureButton();
  setInterval(ensureButton, 2000);

  window.TrafficAdmin = { open };
})();
