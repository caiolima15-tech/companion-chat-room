// Sistema de empregos / missões — runtime do jogador
// Detecta NPCs dadores, executa etapas, mostra balões e HUD.
(function () {
  const SB = () => window.__supabase || window.supabase;
  const player = () => window.__player;
  const scene = () => window.__scene;
  const THREE = () => window.__THREE;

  let booted = false;
  let userId = null;
  let templates = [];          // job_templates ativos do mapa atual
  let stepsByJob = {};         // { job_id: [steps] }
  let transitionsByStep = {};  // { from_step_id: [transitions] }
  let currentProgress = null;  // job_progress ativo
  let currentJob = null;
  let currentStep = null;
  let currentMarker = null;
  let pickupMesh = null;
  let pickupItemKey = null;    // chave do item carregado pelo player
  let hudEl = null;
  let promptEl = null;
  let nearGiver = null;
  let bubbles = new Map();     // npcId -> el
  let cooldowns = {};          // { job_id: available_at_ms }
  let mapId = null;

  function tryBoot() {
    if (booted) return;
    if (!SB()) return setTimeout(tryBoot, 600);
    booted = true; init();
  }
  setTimeout(tryBoot, 1800);

  async function init() {
    const sb = SB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return setTimeout(init, 2000);
    userId = user.id;

    window.addEventListener("map-changed", () => loadForMap());
    await loadForMap();

    setInterval(loop, 600);
    window.addEventListener("keydown", onKey);
  }

  async function loadForMap() {
    mapId = window.__currentMapId;
    templates = []; stepsByJob = {}; transitionsByStep = {};
    cancelLocalProgress();
    if (!mapId) return;
    const sb = SB();
    const { data: t } = await sb.from("job_templates").select("*").eq("map_id", mapId).eq("active", true);
    templates = t || [];
    if (!templates.length) return;

    const jobIds = templates.map(x => x.id);
    const { data: steps } = await sb.from("job_steps").select("*").in("job_id", jobIds);
    for (const s of steps || []) (stepsByJob[s.job_id] ||= []).push(s);

    const stepIds = (steps || []).map(s => s.id);
    if (stepIds.length) {
      const { data: trs } = await sb.from("job_step_transitions").select("*").in("from_step_id", stepIds).order("order_idx");
      for (const tr of trs || []) (transitionsByStep[tr.from_step_id] ||= []).push(tr);
    }

    // carrega cooldowns
    const { data: cds } = await sb.from("job_cooldowns").select("*").eq("user_id", userId).in("job_id", jobIds);
    cooldowns = {};
    for (const c of cds || []) cooldowns[c.job_id] = new Date(c.available_at).getTime();

    // procura progresso ativo
    const { data: prog } = await sb.from("job_progress").select("*").eq("user_id", userId).eq("status", "active").in("job_id", jobIds).maybeSingle();
    if (prog) {
      currentProgress = prog;
      currentJob = templates.find(t => t.id === prog.job_id);
      currentStep = (stepsByJob[prog.job_id] || []).find(s => s.id === prog.current_step_id);
      if (currentStep) enterStep(currentStep, true);
    }

    renderGiverMarkers();
  }

  function renderGiverMarkers() {
    const T = THREE(), sc = scene(); if (!T || !sc) return;
    sc.children.filter(c => c.userData?.isJobGiverMarker).forEach(c => sc.remove(c));
    // marcador depende da posição do NPC; o npc.js mantém __npcMeshes
    for (const tpl of templates) {
      if (!tpl.giver_npc_id) continue;
      const mesh = makeMarker(0x33dd66, "💼");
      mesh.userData = { isJobGiverMarker: true, jobId: tpl.id, npcId: tpl.giver_npc_id };
      sc.add(mesh);
    }
  }

  function makeMarker(color, _emoji) {
    const T = THREE();
    const g = new T.ConeGeometry(0.5, 1.3, 6);
    const m = new T.MeshBasicMaterial({ color });
    const mesh = new T.Mesh(g, m);
    mesh.rotation.x = Math.PI;
    return mesh;
  }

  function npcPos(npcId) {
    // tenta achar a malha do NPC
    const map = window.__npcMeshes || window.__npcs;
    if (!map) return null;
    const e = map.get ? map.get(npcId) : map[npcId];
    if (!e) return null;
    return e.position || e.group?.position || e.mesh?.position || null;
  }

  function loop() {
    const T = THREE(), sc = scene(), p = player(); if (!T || !sc || !p) return;

    // posiciona marcadores dos NPCs dadores
    sc.children.filter(c => c.userData?.isJobGiverMarker).forEach(c => {
      const pos = npcPos(c.userData.npcId);
      if (pos) c.position.set(pos.x, (pos.y || 0) + 2.6, pos.z);
    });

    if (currentProgress) return tickStep();

    // procura giver próximo
    let best = null, bestD = 3.5;
    for (const tpl of templates) {
      if (cooldowns[tpl.id] && cooldowns[tpl.id] > Date.now()) continue;
      const pos = npcPos(tpl.giver_npc_id);
      if (!pos) continue;
      const d = Math.hypot(pos.x - p.position.x, pos.z - p.position.z);
      if (d < bestD) { bestD = d; best = tpl; }
    }
    nearGiver = best;
    syncGiverPrompt();
  }

  function syncGiverPrompt() {
    if (nearGiver && !promptEl) {
      promptEl = document.createElement("div");
      promptEl.className = "job-prompt";
      promptEl.onclick = () => acceptJob(nearGiver);
      document.body.appendChild(promptEl);
    }
    if (!nearGiver && promptEl) { promptEl.remove(); promptEl = null; }
    if (nearGiver && promptEl) promptEl.textContent = `💼 [J] ${nearGiver.title}`;
  }

  function onKey(e) {
    const tag = (e.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    const k = e.key.toLowerCase();
    if (k === "j" && nearGiver && !currentProgress) acceptJob(nearGiver);
    if (k === "e" && currentStep) tryInteract();
    if (k === "x" && currentProgress) cancelCurrent();
  }

  async function acceptJob(tpl) {
    const sb = SB();
    const startId = tpl.start_step_id;
    if (!startId) return toast({ ok: false, error: "Emprego sem etapa inicial" });
    const { data: prog, error } = await sb.from("job_progress").insert({
      user_id: userId, job_id: tpl.id, current_step_id: startId, state: {},
    }).select().single();
    if (error) return toast({ ok: false, error: error.message });
    currentProgress = prog;
    currentJob = tpl;
    currentStep = (stepsByJob[tpl.id] || []).find(s => s.id === startId);
    promptEl?.remove(); promptEl = null;
    enterStep(currentStep, false);
  }

  function enterStep(step, resume) {
    cleanupStepArtifacts();
    currentStep = step;
    if (!step) return finishJob();
    renderHud();
    speak(stepNpcId(step), step.dialogue?.on_enter);
    if (step.kind === "complete") return finishJob();
    if (step.kind === "fail") return cancelCurrent("Missão falhou");
    if (step.kind === "pickup_item") spawnPickup(step);
    if (step.kind === "goto_point" || step.kind === "deliver_item" || step.kind === "drive_to") spawnDestMarker(step.config);
  }

  function stepNpcId(step) {
    if (!step) return null;
    if (step.kind === "talk_to_giver") return currentJob?.giver_npc_id;
    return step.config?.target_npc_id || null;
  }

  function spawnDestMarker(cfg) {
    const T = THREE(), sc = scene(); if (!T || !sc || !cfg || cfg.x == null) return;
    const g = new T.ConeGeometry(0.7, 2, 6);
    const m = new T.MeshBasicMaterial({ color: 0x00ff88 });
    const mesh = new T.Mesh(g, m);
    mesh.position.set(cfg.x, (cfg.y || 0) + 3, cfg.z);
    mesh.rotation.x = Math.PI;
    mesh.userData.isJobDest = true;
    sc.add(mesh);
    currentMarker = mesh;
  }

  function spawnPickup(step) {
    const T = THREE(), sc = scene(); if (!T || !sc) return;
    const cfg = step.config || {};
    const x = cfg.spawn_x ?? cfg.x ?? 0, y = cfg.spawn_y ?? cfg.y ?? 0, z = cfg.spawn_z ?? cfg.z ?? 0;
    const g = new T.BoxGeometry(0.6, 0.6, 0.6);
    const m = new T.MeshStandardMaterial({ color: 0xaa6633 });
    const mesh = new T.Mesh(g, m);
    mesh.position.set(x, y + 0.3, z);
    mesh.userData.isJobPickup = true;
    sc.add(mesh);
    pickupMesh = mesh;
  }

  function tickStep() {
    const p = player(); if (!p || !currentStep) return;
    const cfg = currentStep.config || {};
    const kind = currentStep.kind;

    if (kind === "talk_to_giver" || kind === "talk_to_npc") {
      const pos = npcPos(stepNpcId(currentStep));
      if (!pos) return;
      const d = Math.hypot(pos.x - p.position.x, pos.z - p.position.z);
      if (d < (cfg.radius || 2.5)) showContinue();
    } else if (kind === "pickup_item") {
      if (!pickupMesh) return;
      const d = Math.hypot(pickupMesh.position.x - p.position.x, pickupMesh.position.z - p.position.z);
      if (d < (cfg.radius || 2)) showPrompt("[E] Pegar");
      else hidePrompt();
    } else if (kind === "deliver_item" || kind === "goto_point" || kind === "drive_to") {
      if (cfg.x == null) return;
      const d = Math.hypot(cfg.x - p.position.x, cfg.z - p.position.z);
      if (d < (cfg.radius || 3)) {
        if (kind === "drive_to" && !window.__playerInVehicle) return;
        advance("on_success");
      }
    } else if (kind === "enter_vehicle") {
      if (window.__playerInVehicle) advance("on_success");
    } else if (kind === "play_animation") {
      if (!currentStep._animStartedAt) {
        currentStep._animStartedAt = Date.now();
        window.dispatchEvent(new CustomEvent("play-player-animation", { detail: { key: cfg.animation_key, duration: cfg.duration_ms } }));
      }
      if (Date.now() - currentStep._animStartedAt > (cfg.duration_ms || 2000)) advance("on_success");
    }
  }

  function showContinue() {
    if (promptEl?.dataset?.kind === "continue") return;
    hidePrompt();
    promptEl = document.createElement("div");
    promptEl.className = "job-prompt";
    promptEl.dataset.kind = "continue";
    promptEl.textContent = "▶ Continuar";
    promptEl.onclick = () => advance("on_success");
    document.body.appendChild(promptEl);
  }

  function showPrompt(text) {
    if (promptEl?.textContent === text) return;
    hidePrompt();
    promptEl = document.createElement("div");
    promptEl.className = "job-prompt";
    promptEl.textContent = text;
    document.body.appendChild(promptEl);
  }
  function hidePrompt() { promptEl?.remove(); promptEl = null; }

  function tryInteract() {
    if (!currentStep) return;
    const kind = currentStep.kind;
    if (kind === "pickup_item" && pickupMesh) {
      const p = player();
      const d = Math.hypot(pickupMesh.position.x - p.position.x, pickupMesh.position.z - p.position.z);
      if (d > (currentStep.config?.radius || 2)) return;
      pickupItemKey = currentStep.config?.item_slug || "carry";
      const sb = SB();
      sb.from("job_progress").update({ state: { ...(currentProgress.state || {}), carrying: pickupItemKey } }).eq("id", currentProgress.id).then(() => {});
      currentProgress.state = { ...(currentProgress.state || {}), carrying: pickupItemKey };
      scene()?.remove(pickupMesh); pickupMesh = null;
      hidePrompt();
      advance("on_success");
    }
  }

  async function advance(condition) {
    const trs = transitionsByStep[currentStep.id] || [];
    const next = trs.find(t => t.condition === condition) || trs[0];
    if (!next) return finishJob();
    const nextStep = (stepsByJob[currentJob.id] || []).find(s => s.id === next.to_step_id);
    const sb = SB();
    await sb.from("job_progress").update({ current_step_id: nextStep?.id || null, state: currentProgress.state || {} }).eq("id", currentProgress.id);
    currentProgress.current_step_id = nextStep?.id || null;
    enterStep(nextStep, false);
  }

  async function finishJob() {
    const sb = SB();
    try {
      const { data, error } = await sb.rpc("complete_job", { _progress_id: currentProgress.id });
      if (error) throw error;
      toast({ ok: true, ...data });
      cooldowns[currentJob.id] = Date.now() + (currentJob.cooldown_seconds || 0) * 1000;
    } catch (e) {
      toast({ ok: false, error: e.message || String(e) });
    }
    cancelLocalProgress();
  }

  async function cancelCurrent(msg) {
    const sb = SB();
    if (currentProgress) await sb.from("job_progress").update({ status: "cancelled" }).eq("id", currentProgress.id);
    if (msg) toast({ ok: false, error: msg });
    cancelLocalProgress();
  }

  function cancelLocalProgress() {
    cleanupStepArtifacts();
    currentProgress = null; currentJob = null; currentStep = null; pickupItemKey = null;
    hudEl?.remove(); hudEl = null;
  }

  function cleanupStepArtifacts() {
    const sc = scene();
    if (currentMarker && sc) { sc.remove(currentMarker); currentMarker = null; }
    if (pickupMesh && sc) { sc.remove(pickupMesh); pickupMesh = null; }
    hidePrompt();
    for (const [, el] of bubbles) el.remove();
    bubbles.clear();
  }

  function renderHud() {
    if (!hudEl) {
      hudEl = document.createElement("div");
      hudEl.id = "jobHud";
      document.body.appendChild(hudEl);
    }
    const stepLabel = currentStep?.label || stepKindLabel(currentStep?.kind);
    hudEl.innerHTML = `<div class="job-hud-title">💼 ${escapeHtml(currentJob?.title || "")}</div>
      <div class="job-hud-step">${escapeHtml(stepLabel)}</div>
      <div class="job-hud-foot">[X] cancelar</div>`;
  }

  function stepKindLabel(k) {
    return ({
      talk_to_giver: "Fale com o NPC",
      pickup_item: "Pegue o item",
      deliver_item: "Entregue no destino",
      goto_point: "Vá até o ponto",
      interact_asset: "Interaja no local",
      talk_to_npc: "Fale com o NPC",
      enter_vehicle: "Entre no veículo",
      drive_to: "Dirija até o destino",
      play_animation: "Realizando ação…",
    })[k] || k || "";
  }

  function speak(npcId, lines) {
    if (!npcId || !lines || !lines.length) return;
    const line = lines[Math.floor(Math.random() * lines.length)];
    showBubble(npcId, line);
  }

  function showBubble(npcId, text) {
    let el = bubbles.get(npcId);
    if (!el) {
      el = document.createElement("div");
      el.className = "npc-bubble";
      document.body.appendChild(el);
      bubbles.set(npcId, el);
    }
    el.textContent = text;
    el.style.opacity = "1";
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = "0"; setTimeout(() => { el.remove(); bubbles.delete(npcId); }, 600); }, 5000);

    if (!el._raf) {
      const tick = () => {
        const T = THREE(), sc = scene();
        const pos = npcPos(npcId);
        const cam = window.__camera;
        if (T && sc && pos && cam && el.isConnected) {
          const v = new T.Vector3(pos.x, (pos.y || 0) + 2.4, pos.z).project(cam);
          const x = (v.x * 0.5 + 0.5) * window.innerWidth;
          const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
          el.style.transform = `translate(-50%,-100%) translate(${x}px, ${y}px)`;
        }
        if (el.isConnected) el._raf = requestAnimationFrame(tick);
      };
      tick();
    }
  }

  function toast(data) {
    const t = document.createElement("div");
    const ok = data.ok !== false;
    t.style.cssText = `position:fixed;top:25%;left:50%;transform:translateX(-50%);background:${ok?'#1d6':'#a22'};color:#fff;padding:18px 28px;border-radius:14px;font:700 18px system-ui;z-index:10001;box-shadow:0 8px 24px #000a`;
    if (ok) t.innerHTML = `✅ Missão concluída<br/><span style="font-size:14px;opacity:.9">+R$ ${((data.payout_cents||0)/100).toFixed(2).replace('.',',')}</span>`;
    else t.textContent = "❌ " + (data.error || "Falhou");
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }
})();
