// Sistema de empregos / missões — runtime do jogador
(function () {
  const SB = () => window.__supabase || window.supabase;
  const player = () => window.__player;
  const scene = () => window.__scene;
  const THREE = () => window.__THREE;

  let booted = false;
  let userId = null;
  let templates = [];
  let stepsByJob = {};
  let transitionsByStep = {};
  let currentProgress = null;
  let currentJob = null;
  let currentStep = null;
  let currentMarker = null;
  let pickupMesh = null;
  let pickupItemKey = null;
  let hudEl = null;
  let promptEl = null;
  let nearGiver = null;          // template
  let giverDialogEl = null;      // bubble interativa com "Pedir / Cancelar"
  let scriptedDialogEl = null;   // bubble com Próximo/Iniciar
  let dialogueActive = false;    // bloqueia lógica do step enquanto fala
  let bubbles = new Map();
  let cooldowns = {};
  let mapId = null;
  // markers vivos no mundo: {mesh, anchor:()=>({x,y,z}), offsetY, kind}
  let liveMarkers = [];
  let lockedGiverNpcId = null;

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
    setInterval(loop, 400);
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
    const { data: cds } = await sb.from("job_cooldowns").select("*").eq("user_id", userId).in("job_id", jobIds);
    cooldowns = {};
    for (const c of cds || []) cooldowns[c.job_id] = new Date(c.available_at).getTime();
    const { data: prog } = await sb.from("job_progress").select("*").eq("user_id", userId).eq("status", "active").in("job_id", jobIds).maybeSingle();
    if (prog) {
      currentProgress = prog;
      currentJob = templates.find(t => t.id === prog.job_id);
      currentStep = (stepsByJob[prog.job_id] || []).find(s => s.id === prog.current_step_id);
      if (currentStep) enterStep(currentStep, true);
    }
    applyIdleAnimations();
  }

  // Aplica animação ociosa dos givers (e re-aplica quando NPC entra no LOD)
  function applyIdleAnimations() {
    for (const tpl of templates) {
      if (tpl.giver_npc_id && tpl.idle_animation) {
        try { window.__setNpcAnim?.(tpl.giver_npc_id, tpl.idle_animation); } catch {}
      }
    }
  }

  function npcPos(npcId) {
    return window.__getNpcPos?.(npcId) || null;
  }

  function loop() {
    const T = THREE(), sc = scene(), p = player(); if (!T || !sc || !p) return;

    // re-aplica animação ociosa periodicamente (NPCs podem ser despawn/spawn pelo LOD)
    applyIdleAnimations();

    if (currentProgress) return tickStep();

    let best = null, bestD = 4;
    for (const tpl of templates) {
      if (cooldowns[tpl.id] && cooldowns[tpl.id] > Date.now()) continue;
      if (!tpl.giver_npc_id) continue;
      const pos = npcPos(tpl.giver_npc_id);
      if (!pos) continue;
      const d = Math.hypot(pos.x - p.position.x, pos.z - p.position.z);
      const facer = tpl.face_player_radius || 4;
      const r = Math.max(facer, bestD);
      if (d < r && d < bestD + 0.0001) { bestD = d; best = tpl; }
    }

    // gerencia face-player: trava no giver mais próximo
    const wantLockId = best?.giver_npc_id || null;
    if (wantLockId !== lockedGiverNpcId) {
      if (lockedGiverNpcId) window.__setNpcFacePlayer?.(lockedGiverNpcId, false);
      if (wantLockId) window.__setNpcFacePlayer?.(wantLockId, true);
      lockedGiverNpcId = wantLockId;
    }

    nearGiver = best;
    syncGiverDialog();
  }

  // ============ DIÁLOGO INTERATIVO DO DADOR ============
  function syncGiverDialog() {
    if (!nearGiver) { closeGiverDialog(); return; }
    if (giverDialogEl && giverDialogEl.dataset.jobId === nearGiver.id) return;
    closeGiverDialog();
    giverDialogEl = makeBubble(nearGiver.giver_npc_id, "interactive");
    giverDialogEl.dataset.jobId = nearGiver.id;
    giverDialogEl.innerHTML = `
      <div class="npc-bubble-text">${escapeHtml(nearGiver.description || "Posso te ajudar com algo?")}</div>
      <div class="npc-bubble-actions">
        <button type="button" class="npc-bubble-btn primary" data-act="accept">💼 Pedir emprego</button>
        <button type="button" class="npc-bubble-btn" data-act="cancel">Cancelar</button>
      </div>`;
    giverDialogEl.querySelector('[data-act="accept"]').onclick = () => acceptJob(nearGiver);
    giverDialogEl.querySelector('[data-act="cancel"]').onclick = () => { nearGiver = null; closeGiverDialog(); };
  }

  function closeGiverDialog() {
    if (giverDialogEl) { giverDialogEl._dispose?.(); giverDialogEl.remove(); giverDialogEl = null; }
  }

  function onKey(e) {
    const tag = (e.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    const k = e.key.toLowerCase();
    if (k === "j" && nearGiver && !currentProgress) acceptJob(nearGiver);
    if (k === "e" && currentStep && !dialogueActive) tryInteract();
    if (k === "x" && currentProgress) cancelCurrent();
  }

  async function acceptJob(tpl) {
    const sb = SB();
    const startId = tpl.start_step_id;
    if (!startId) return toast({ ok: false, error: "Emprego sem etapa inicial" });
    closeGiverDialog();
    const { data: prog, error } = await sb.from("job_progress").insert({
      user_id: userId, job_id: tpl.id, current_step_id: startId, state: {},
    }).select().single();
    if (error) return toast({ ok: false, error: error.message });
    currentProgress = prog;
    currentJob = tpl;
    currentStep = (stepsByJob[tpl.id] || []).find(s => s.id === startId);
    enterStep(currentStep, false);
  }

  // ============ STEP ENTER + SCRIPTED DIALOGUE ============
  function enterStep(step, resume) {
    cleanupStepArtifacts();
    currentStep = step;
    if (!step) return finishJob();
    renderHud();
    const npcId = stepNpcId(step);
    const lines = step.dialogue?.on_enter || [];
    if (lines.length && npcId) {
      runScriptedDialogue(npcId, lines, () => kickoffStepLogic(step));
    } else {
      kickoffStepLogic(step);
    }
  }

  function kickoffStepLogic(step) {
    dialogueActive = false;
    if (step.kind === "complete") return finishJob();
    if (step.kind === "fail") return cancelCurrent("Missão falhou");
    if (step.kind === "pickup_item") spawnPickup(step);
    if (step.kind === "goto_point" || step.kind === "deliver_item" || step.kind === "drive_to") spawnDestMarker(step.config);
  }

  function runScriptedDialogue(npcId, lines, onDone) {
    dialogueActive = true;
    let i = 0;
    const total = lines.length;
    const el = makeBubble(npcId, "interactive");
    scriptedDialogEl = el;

    function render() {
      const isLast = i === total - 1;
      const labelNext = isLast ? "▶ Iniciar" : "Próximo →";
      el.innerHTML = `
        <div class="npc-bubble-text">${escapeHtml(lines[i] || "")}</div>
        <div class="npc-bubble-meta">${i + 1}/${total}</div>
        <div class="npc-bubble-actions">
          <button type="button" class="npc-bubble-btn primary" data-act="next">${labelNext}</button>
          <button type="button" class="npc-bubble-btn" data-act="skip">Pular</button>
        </div>`;
      el.querySelector('[data-act="next"]').onclick = () => {
        if (i < total - 1) { i++; render(); }
        else { closeScriptedDialog(); onDone?.(); }
      };
      el.querySelector('[data-act="skip"]').onclick = () => { closeScriptedDialog(); onDone?.(); };
    }
    render();
  }

  function closeScriptedDialog() {
    if (scriptedDialogEl) { scriptedDialogEl._dispose?.(); scriptedDialogEl.remove(); scriptedDialogEl = null; }
  }

  function stepNpcId(step) {
    if (!step) return null;
    if (step.kind === "talk_to_giver") return currentJob?.giver_npc_id;
    return step.config?.target_npc_id || currentJob?.giver_npc_id || null;
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
    if (dialogueActive) return;
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
    if (currentStep.kind === "pickup_item" && pickupMesh) {
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
    closeScriptedDialog();
    closeGiverDialog();
    dialogueActive = false;
    currentProgress = null; currentJob = null; currentStep = null; pickupItemKey = null;
    hudEl?.remove(); hudEl = null;
    if (lockedGiverNpcId) { window.__setNpcFacePlayer?.(lockedGiverNpcId, false); lockedGiverNpcId = null; }
  }

  function cleanupStepArtifacts() {
    const sc = scene();
    if (currentMarker && sc) { sc.remove(currentMarker); currentMarker = null; }
    if (pickupMesh && sc) { sc.remove(pickupMesh); pickupMesh = null; }
    hidePrompt();
    closeScriptedDialog();
    for (const [, el] of bubbles) { el._dispose?.(); el.remove(); }
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

  // ============ BUBBLE PROJEÇÃO 3D → 2D ============
  function makeBubble(npcId, variant) {
    const el = document.createElement("div");
    el.className = "npc-bubble" + (variant === "interactive" ? " interactive" : "");
    document.body.appendChild(el);
    const tick = () => {
      const T = THREE(), sc = scene(), cam = window.__camera;
      const pos = npcPos(npcId);
      if (T && sc && pos && cam && el.isConnected) {
        const v = new T.Vector3(pos.x, (pos.y || 0) + 2.4, pos.z).project(cam);
        const x = (v.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
        el.style.transform = `translate(-50%,-100%) translate(${x}px, ${y}px)`;
        el.style.display = (v.z > 1) ? "none" : "";
      }
      if (el.isConnected) el._raf = requestAnimationFrame(tick);
    };
    el._dispose = () => { try { cancelAnimationFrame(el._raf); } catch {} };
    tick();
    return el;
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
