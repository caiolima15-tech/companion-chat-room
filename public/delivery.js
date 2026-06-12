// Saldo R$ HUD + sistema de entregas
(function () {
  const SB = () => window.__supabase || window.supabase;
  const player = () => window.__player;

  let booted = false, balance = 0, currentJob = null, jobTimerEl = null;
  function tryBoot() {
    if (booted) return;
    if (!SB()) return setTimeout(tryBoot, 600);
    booted = true; init();
  }
  setTimeout(tryBoot, 1500);

  async function init() {
    const sb = SB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return setTimeout(init, 2000);

    // HUD
    const hud = document.createElement("div");
    hud.id = "moneyHud";
    hud.style.cssText = "position:fixed;top:12px;right:12px;background:rgba(0,0,0,.78);color:#7be37b;border:1px solid #7be37b;padding:8px 14px;border-radius:10px;font:700 18px 'Courier New',monospace;z-index:9998;box-shadow:0 2px 8px #000";
    hud.textContent = "R$ 0,00";
    document.body.appendChild(hud);

    // initial balance
    const { data: prof } = await sb.from("profiles").select("balance_cents").eq("id", user.id).maybeSingle();
    balance = prof?.balance_cents || 0;
    updateHud();

    // realtime saldo
    sb.channel(`profile-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, (p) => {
        balance = p.new.balance_cents || 0; updateHud();
      })
      .subscribe();

    // delivery hubs render + loop
    await renderHubs();
    setInterval(checkHubProximity, 800);
  }

  function updateHud() {
    const el = document.getElementById("moneyHud");
    if (el) el.textContent = `R$ ${(balance / 100).toFixed(2).replace(".", ",")}`;
  }

  let hubs = [], destinations = {};
  async function renderHubs() {
    const sb = SB();
    const { data: h } = await sb.from("delivery_hubs").select("*").eq("active", true);
    hubs = h || [];
    const { data: d } = await sb.from("delivery_destinations").select("*");
    destinations = {};
    (d || []).forEach((x) => { (destinations[x.hub_id] ||= []).push(x); });

    // marker visual (sprite no mapa)
    const T = window.__THREE, scene = window.__scene;
    if (!T || !scene) return;
    // limpa antigos
    scene.children.filter((c) => c.userData?.isHubMarker).forEach((c) => scene.remove(c));
    for (const hub of hubs) {
      const geom = new T.ConeGeometry(0.6, 1.6, 6);
      const mat = new T.MeshBasicMaterial({ color: 0xffaa00 });
      const mesh = new T.Mesh(geom, mat);
      mesh.position.set(hub.pickup_x, (hub.pickup_y || 0) + 2.5, hub.pickup_z);
      mesh.rotation.x = Math.PI;
      mesh.userData = { isHubMarker: true, hub };
      scene.add(mesh);
    }
  }

  let nearHub = null, hubPromptEl = null;
  function checkHubProximity() {
    const p = player(); if (!p) return;
    if (currentJob) return checkDeliveryProgress();
    let best = null, bestD = 3.5;
    for (const hub of hubs) {
      const d = Math.hypot(hub.pickup_x - p.position.x, hub.pickup_z - p.position.z);
      if (d < bestD) { bestD = d; best = hub; }
    }
    nearHub = best;
    if (best && !hubPromptEl) {
      hubPromptEl = document.createElement("div");
      hubPromptEl.style.cssText = "position:fixed;bottom:160px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#ffaa00;padding:10px 20px;border-radius:24px;font:700 14px system-ui;z-index:9999;border:1px solid #ffaa00;cursor:pointer";
      hubPromptEl.textContent = `📦 [J] Pegar entrega em "${best.name}"`;
      hubPromptEl.onclick = () => acceptJob(best);
      document.body.appendChild(hubPromptEl);
    } else if (!best && hubPromptEl) {
      hubPromptEl.remove(); hubPromptEl = null;
    } else if (best && hubPromptEl) {
      hubPromptEl.textContent = `📦 [J] Pegar entrega em "${best.name}"`;
      hubPromptEl.onclick = () => acceptJob(best);
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "j" && nearHub && !currentJob) acceptJob(nearHub);
  });

  async function acceptJob(hub) {
    const sb = SB();
    const dests = destinations[hub.id] || [];
    if (!dests.length) return alert("Esse hub não tem destinos cadastrados.");
    const dest = dests[Math.floor(Math.random() * dests.length)];
    const distance = Math.hypot(dest.x - hub.pickup_x, dest.z - hub.pickup_z);
    const timeLimit = hub.base_time_ms + Math.ceil(distance / 100 * hub.time_per_100m_ms);

    const { data: { user } } = await sb.auth.getUser();
    const { data: job, error } = await sb.from("delivery_jobs").insert({
      user_id: user.id, hub_id: hub.id, destination_id: dest.id,
      time_limit_ms: timeLimit, distance_m: distance,
    }).select().single();
    if (error) return alert("erro: " + error.message);

    currentJob = { ...job, dest, hub };
    hubPromptEl?.remove(); hubPromptEl = null;

    // Marker destino
    const T = window.__THREE, scene = window.__scene;
    if (T && scene) {
      const g = new T.ConeGeometry(0.7, 2, 6);
      const m = new T.MeshBasicMaterial({ color: 0x00ff88 });
      const mesh = new T.Mesh(g, m);
      mesh.position.set(dest.x, (dest.y || 0) + 3, dest.z);
      mesh.rotation.x = Math.PI;
      mesh.userData.isDestMarker = true;
      scene.add(mesh);
      currentJob.marker = mesh;
    }

    // Timer HUD
    jobTimerEl = document.createElement("div");
    jobTimerEl.id = "jobTimer";
    jobTimerEl.style.cssText = "position:fixed;top:60px;right:12px;background:rgba(0,0,0,.85);color:#fff;border:1px solid #00ff88;padding:8px 14px;border-radius:10px;font:600 14px system-ui;z-index:9998;min-width:200px";
    document.body.appendChild(jobTimerEl);
    currentJob.startedAt = Date.now();
  }

  function checkDeliveryProgress() {
    if (!currentJob) return;
    const p = player(); if (!p) return;
    const elapsed = Date.now() - currentJob.startedAt;
    const remaining = Math.max(0, currentJob.time_limit_ms - elapsed);
    const dToDest = Math.hypot(currentJob.dest.x - p.position.x, currentJob.dest.z - p.position.z);
    if (jobTimerEl) {
      const sec = Math.ceil(remaining / 1000);
      jobTimerEl.innerHTML = `📦 Entrega: <strong>${currentJob.dest.label}</strong><br/>
        ⏱ ${sec}s · 📍 ${dToDest.toFixed(0)}m`;
      jobTimerEl.style.borderColor = remaining < 15000 ? "#ff4444" : "#00ff88";
    }
    if (dToDest < 4) finishDelivery(p);
    else if (elapsed > currentJob.time_limit_ms + 60000) cancelDelivery("⚠ Entrega expirou");
  }

  async function finishDelivery(p) {
    const sb = SB();
    const job = currentJob; currentJob = null;
    try {
      const { data, error } = await sb.rpc("complete_delivery", {
        _job_id: job.id, _player_x: p.position.x, _player_z: p.position.z,
      });
      if (error) throw error;
      showToast(data);
    } catch (e) {
      showToast({ ok: false, error: e?.message || e });
    }
    job.marker && window.__scene?.remove(job.marker);
    jobTimerEl?.remove(); jobTimerEl = null;
  }

  function cancelDelivery(msg) {
    const job = currentJob; currentJob = null;
    job?.marker && window.__scene?.remove(job.marker);
    jobTimerEl?.remove(); jobTimerEl = null;
    showToast({ ok: false, error: msg });
  }

  function showToast(data) {
    const t = document.createElement("div");
    const ok = data.ok !== false;
    t.style.cssText = `position:fixed;top:30%;left:50%;transform:translateX(-50%);background:${ok?'#1d6':'#a22'};color:#fff;padding:18px 28px;border-radius:14px;font:700 18px system-ui;z-index:10001;box-shadow:0 8px 24px #000a;animation:fadeInOut 4s ease`;
    if (ok) {
      t.innerHTML = `✅ Entrega concluída<br/><span style="font-size:14px;opacity:.9">+R$ ${(data.payout_cents/100).toFixed(2).replace('.',',')} · +${data.xp_gained} XP${data.on_time?'':' (atrasado)'}</span>`;
    } else {
      t.textContent = "❌ " + (data.error || "Falhou");
    }
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3800);
  }

  // refresh on hub changes
  setInterval(renderHubs, 30000);
})();

// CSS keyframe
const _s = document.createElement("style");
_s.textContent = `@keyframes fadeInOut { 0%{opacity:0;transform:translateX(-50%) translateY(-20px)} 15%,85%{opacity:1;transform:translateX(-50%) translateY(0)} 100%{opacity:0;transform:translateX(-50%) translateY(-20px)} }`;
document.head.appendChild(_s);
