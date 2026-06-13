// NPC runtime + admin panel.
// Depende de window: __scene, __player, __camera, __renderer, __supabase, __isAdmin, __THREE, __GLTFLoader.

(function () {
  const SB = () => window.__supabase || window.supabase;
  const THREE = () => window.__THREE || window.THREE;
  const scene = () => window.__scene;
  const player = () => window.__player;
  const camera = () => window.__camera;
  const renderer = () => window.__renderer;

  let booted = false, adminBtnAdded = false;
  function tryBoot() {
    if (!booted) {
      if (!SB() || !THREE() || !scene()) { return setTimeout(tryBoot, 600); }
      booted = true;
      initNpcRuntime();
    }
    if (!adminBtnAdded && window.__isAdmin) {
      adminBtnAdded = true;
      initNpcAdminButton();
    }
    if (!adminBtnAdded) setTimeout(tryBoot, 1000);
  }
  setTimeout(tryBoot, 1500);

  // ============ ANIMATION LIBRARY ============
  // key (`${slug}` ou `${slug}:${gender}`) -> THREE.AnimationClip
  const animLib = new Map();
  const animLibLoading = new Map();
  async function loadAnimationLibrary() {
    const sb = SB();
    const { data: anims } = await sb.from("npc_animations").select("*");
    const GLTF = window.__GLTFLoader;
    const FBX = window.__FBXLoader;
    if (!GLTF && !FBX) return;
    const gLoader = GLTF ? new GLTF() : null;
    const fLoader = FBX ? new FBX() : null;
    const pending = [];
    for (const a of anims || []) {
      const key = a.gender && a.gender !== "any" ? `${a.slug}:${a.gender}` : a.slug;
      if (animLib.has(key) || animLibLoading.has(key)) continue;
      const isFbx = /\.fbx(\?|$)/i.test(a.model_url);
      const loader = isFbx ? fLoader : gLoader;
      if (!loader) { console.warn("[npc-anim] sem loader pra", a.model_url); continue; }
      const p = loader.loadAsync(a.model_url).then((asset) => {
        const clip = asset?.animations?.[0];
        if (clip) {
          clip.name = a.slug;
          animLib.set(key, clip);
          console.log("[npc-anim] carregado:", key);
        } else {
          console.warn("[npc-anim] sem clip em", a.model_url);
        }
      }).catch((e) => console.warn("[npc-anim] load fail", key, e));
      animLibLoading.set(key, p);
      pending.push(p);
    }
    if (pending.length) await Promise.allSettled(pending);
    for (const ent of npcEntities.values()) setAnim(ent, ent.currentAnimName || (ent.status === "walking" ? "walk" : "idle"));
  }

  // Retarget de tracks: normaliza prefixos Mixamo e descarta tracks cujo bone não existe no destino.
  const MIXAMO_RE = /^mixamorig\d*/i;
  function retargetClipForEnt(ent, clip) {
    const cloned = clip.clone();
    const destPrefix = ent.bonePrefix || "";
    const boneSet = ent.boneNames; // Set<string> com nomes válidos
    const kept = [];
    for (const tr of cloned.tracks) {
      const dot = tr.name.indexOf(".");
      const bone = dot >= 0 ? tr.name.slice(0, dot) : tr.name;
      const prop = dot >= 0 ? tr.name.slice(dot) : "";
      const m = bone.match(MIXAMO_RE);
      let newBone = bone;
      if (m) {
        const rest = bone.slice(m[0].length);
        if (destPrefix) newBone = destPrefix + rest;
        else newBone = rest.charAt(0).toLowerCase() + rest.slice(1);
      } else if (destPrefix && !bone.startsWith(destPrefix)) {
        newBone = destPrefix + bone.charAt(0).toUpperCase() + bone.slice(1);
      }
      // Descarta tracks cujo bone não existe no modelo destino — evita T-pose por bind falho
      if (boneSet && boneSet.size && !boneSet.has(newBone)) continue;
      tr.name = newBone + prop;
      kept.push(tr);
    }
    cloned.tracks = kept;
    return cloned;
  }


  // ============ RUNTIME ============
  const npcEntities = new Map();   // id -> ent (loaded visual)
  const npcInstances = new Map();  // id -> instance row (filtered by current map)
  const npcStateCache = new Map(); // id -> latest state row (lightweight, kept for all NPCs in map)
  const npcModels = new Map();
  const npcLoading = new Set();    // ids currently loading GLB

  function getCurrentMapId() { return window.__currentMapId || localStorage.getItem("neon-tap-room-map") || "bar"; }
  function getLoadRadius() { return Number(localStorage.getItem("npcLoadRadius")) || 25; }
  function getDespawnRadius() { return getLoadRadius() * 1.25; }

  async function reloadForMap() {
    const sb = SB();
    const mapId = getCurrentMapId();
    // despawn everything
    for (const [id, ent] of npcEntities) {
      try { scene().remove(ent.group); } catch {}
      try { ent.bubble?.remove(); } catch {}
    }
    npcEntities.clear();
    npcInstances.clear();
    npcStateCache.clear();
    npcLoading.clear();

    const { data: inst } = await sb.from("npc_instances").select("*").eq("active", true).eq("map_id", mapId);
    (inst || []).forEach((i) => npcInstances.set(i.id, i));
    if (npcInstances.size) {
      const ids = [...npcInstances.keys()];
      const { data: states } = await sb.from("npc_state").select("*").in("npc_id", ids);
      (states || []).forEach((s) => { npcStateCache.set(s.npc_id, s); });
    }
  }

  async function initNpcRuntime() {
    const sb = SB();
    const { data: models } = await sb.from("npc_models").select("*");
    (models || []).forEach((m) => npcModels.set(m.id, m));

    await reloadForMap();

    loadAnimationLibrary();

    window.addEventListener("map-changed", () => { reloadForMap(); });

    sb.channel("npc-state")
      .on("postgres_changes", { event: "*", schema: "public", table: "npc_state" }, (payload) => {
        if (payload.new) handleStateUpdate(payload.new);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "npc_instances" }, (payload) => {
        const inst = payload.new;
        if (!inst || inst.map_id !== getCurrentMapId() || !inst.active) return;
        npcInstances.set(inst.id, inst);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "npc_instances" }, (payload) => {
        const inst = payload.new;
        if (!inst) return;
        const inMap = inst.map_id === getCurrentMapId();
        if (inMap && inst.active) {
          npcInstances.set(inst.id, inst);
        } else {
          npcInstances.delete(inst.id);
          const ent = npcEntities.get(inst.id);
          if (ent) { try { scene().remove(ent.group); } catch {} try { ent.bubble?.remove(); } catch {} npcEntities.delete(inst.id); }
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "npc_instances" }, (payload) => {
        const id = payload.old?.id;
        if (!id) return;
        npcInstances.delete(id);
        npcStateCache.delete(id);
        const ent = npcEntities.get(id);
        if (ent) { try { scene().remove(ent.group); } catch {} try { ent.bubble?.remove(); } catch {} npcEntities.delete(id); }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "npc_models" }, async () => {
        const { data: models } = await sb.from("npc_models").select("*");
        npcModels.clear();
        (models || []).forEach((m) => npcModels.set(m.id, m));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "npc_animations" }, () => loadAnimationLibrary())
      .subscribe();

    const clock = new (THREE().Clock)();
    function tick() {
      const dt = clock.getDelta();
      for (const ent of npcEntities.values()) {
        if (ent.mixer) ent.mixer.update(dt);
        if (ent.targetPos) {
          // Aterra o alvo no chão real do mapa (segue rampas, escadas, plataformas)
          if (window.__groundHeightAt) {
            const gy = window.__groundHeightAt(ent.targetPos, ent.targetPos.y);
            if (typeof gy === "number") ent.targetPos.y = gy;
          }
          ent.group.position.lerp(ent.targetPos, Math.min(1, dt * 8));
        }
        let desiredRot = ent.targetRot;
        if (ent.lockToPlayer && player()) {
          const p = player().position;
          desiredRot = Math.atan2(p.x - ent.group.position.x, p.z - ent.group.position.z);
        }
        if (typeof desiredRot === "number") {
          let diff = desiredRot - ent.group.rotation.y;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          ent.group.rotation.y += diff * Math.min(1, dt * 6);
        }
      }
      checkLOD();
      checkNpcProximity();
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Despawn far NPCs and spawn close ones (LOD)
  let lodCheckT = 0;
  function checkLOD() {
    const now = performance.now();
    if (now - lodCheckT < 500) return; // 2 Hz
    lodCheckT = now;
    const p = player(); if (!p) return;
    const loadR = getLoadRadius();
    const despawnR = getDespawnRadius();
    for (const [id, inst] of npcInstances) {
      let st = npcStateCache.get(id);
      if (!st) {
        // Sem state ainda (NPC recém-criado, npc-tick ainda não rodou):
        // usa posição do player como fallback pra spawnar imediatamente
        st = { x: p.position.x, y: p.position.y, z: p.position.z, rot_y: 0, anim: "idle" };
        npcStateCache.set(id, st);
      }
      const d = Math.hypot(st.x - p.position.x, st.z - p.position.z);
      const ent = npcEntities.get(id);
      if (!ent && !npcLoading.has(id) && d < loadR) {
        npcLoading.add(id);
        spawnNpc(inst).then((e) => {
          npcLoading.delete(id);
          if (!e) return;
          const cur = npcStateCache.get(id) || st;
          e.group.position.set(cur.x, cur.y, cur.z);
          e.targetPos = new (THREE().Vector3)(cur.x, cur.y, cur.z);
          e.targetRot = cur.rot_y || 0;
          setAnim(e, cur.anim || "idle");
        });
      } else if (ent && d > despawnR) {
        try { scene().remove(ent.group); } catch {}
        try { ent.bubble?.remove(); } catch {}
        npcEntities.delete(id);
      }
    }
  }

  function handleStateUpdate(s) {
    // Cache the state regardless of whether the entity is loaded
    npcStateCache.set(s.npc_id, s);
    if (!npcInstances.has(s.npc_id)) return; // not in current map
    const ent = npcEntities.get(s.npc_id);
    if (!ent) return; // LOD: not loaded
    ent.targetPos = new (THREE().Vector3)(s.x, s.y, s.z);
    if (!ent.lockToPlayer) {
      ent.targetRot = s.rot_y;
      setAnim(ent, s.anim);
    }
    ent.status = s.status;
  }


  function pickAnimClip(ent, name) {
    // 1) clip do próprio modelo
    if (ent.actions && ent.actions[name]) return ent.actions[name];
    if (!ent.mixer) return null;
    // 2) lib externa: gênero específico primeiro, depois genérico
    const T = THREE();
    const candidates = [`${name}:${ent.gender}`, name];
    for (const k of candidates) {
      const raw = animLib.get(k);
      if (!raw) continue;
      const retargeted = retargetClipForEnt(ent, raw);
      const action = ent.mixer.clipAction(retargeted);
      action.setLoop(T.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      ent.actions[name] = action;
      return action;
    }
    // 3) fallback idle
    return ent.actions?.["idle"] || (ent.actions ? Object.values(ent.actions)[0] : null);
  }

  function setAnim(ent, name) {
    ent.currentAnimName = name || ent.currentAnimName || "idle";
    if (!ent.mixer) return;
    const target = pickAnimClip(ent, name);
    if (!target || ent.currentAction === target) return;
    if (ent.currentAction) ent.currentAction.fadeOut(0.25);
    target.reset().fadeIn(0.25).play();
    ent.currentAction = target;
  }

  async function spawnNpc(inst) {
    const model = npcModels.get(inst.model_id);
    if (!model || !model.model_url) return null;
    const T = THREE();
    const group = new T.Group();
    group.name = `npc:${inst.id}`;
    scene().add(group);

    const Loader = window.__GLTFLoader;
    const ent = {
      group, mixer: null, actions: {},
      name: inst.display_name,
      voice_id: inst.voice_id || model.voice_id,
      gender: model.gender || "neutral",
      persona: inst.persona,
      lockToPlayer: false,
      status: "walking",
    };
    npcEntities.set(inst.id, ent);

    if (Loader) {
      try {
        const loader = new Loader();
        const gltf = await loader.loadAsync(model.model_url);
        const root = gltf.scene;
        const scale = model.scale_mul || 1;
        root.scale.setScalar(scale);
        group.add(root);
        ent.mixer = new T.AnimationMixer(root);
        // Detecta prefixo Mixamo e coleta nomes de bones do destino (pra retarget e filtragem)
        ent.bonePrefix = "";
        ent.boneNames = new Set();
        root.traverse((o) => {
          if (!o.isBone || !o.name) return;
          ent.boneNames.add(o.name);
          if (!ent.bonePrefix) {
            const m = o.name.match(MIXAMO_RE);
            if (m) ent.bonePrefix = m[0];
          }
        });
        if (gltf.animations && gltf.animations.length) {
          for (const clip of gltf.animations) {
            const key = clip.name.toLowerCase().replace(/[\s.-]+/g, "_");
            ent.actions[key] = ent.mixer.clipAction(clip);
            // detectar slug por keywords
            const synonyms = {
              idle: ["idle", "breath", "stand"],
              walk: ["walk", "walking", "run", "locomotion"],
              talk: ["talk", "talking", "speak", "speaking", "gesture"],
              sit: ["sit", "sitting"],
              wave: ["wave", "waving"],
              social_a: ["social_a"], social_b: ["social_b"], social_c: ["social_c"]
            };
            for (const [slug, words] of Object.entries(synonyms)) {
              if (words.some((w) => key.includes(w)) && !ent.actions[slug]) ent.actions[slug] = ent.mixer.clipAction(clip);
            }
          }
        }
        setAnim(ent, ent.currentAnimName || "idle");
      } catch (e) {
        console.warn("[npc] load fail", e);
        const m = new T.Mesh(new T.BoxGeometry(0.5, 1.7, 0.5), new T.MeshStandardMaterial({ color: 0x39c5bb }));
        m.position.y = 0.85;
        group.add(m);
      }
    }
    return ent;
  }

  // ===== proximidade + prompt (E) interagir =====
  let nearestNpc = null;
  let engagedNpc = null; // { id, ent }
  let promptEl = null;
  const PROXIMITY = 1.6;
  const DISENGAGE_DIST = 2.8;
  function checkNpcProximity() {
    const p = player();
    if (!p) return;
    let best = null, bestD = PROXIMITY;
    for (const [id, ent] of npcEntities) {
      const d = Math.hypot(ent.group.position.x - p.position.x, ent.group.position.z - p.position.z);
      if (d < bestD) { bestD = d; best = { id, ent }; }
    }
    nearestNpc = best;
    if (best && !promptEl && !engagedNpc) showPrompt();
    else if ((!best || engagedNpc) && promptEl) hidePrompt();

    // Se está engajado e jogador se afastou, encerra
    if (engagedNpc) {
      const e = engagedNpc.ent;
      const d = Math.hypot(e.group.position.x - p.position.x, e.group.position.z - p.position.z);
      if (d > DISENGAGE_DIST) disengageNpc();
    }
    // Update bubbles
    for (const ent of npcEntities.values()) updateBubble(ent);
  }
  function showPrompt() {
    if (promptEl) return;
    promptEl = document.createElement("div");
    promptEl.id = "npcPrompt";
    promptEl.style.cssText = "position:fixed;bottom:140px;left:50%;transform:translateX(-50%);color:#bbb;font:500 12px system-ui;opacity:0;transition:opacity .15s;z-index:9999;pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,.8)";
    promptEl.textContent = "(E) interagir  ·  segure V pra falar";
    document.body.appendChild(promptEl);
    requestAnimationFrame(() => { if (promptEl) promptEl.style.opacity = "0.85"; });
  }
  function hidePrompt() {
    if (!promptEl) return;
    const el = promptEl; promptEl = null;
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 200);
  }

  // ===== Engajamento (sem modal — usa o chat principal) =====
  function engageNpc(id, ent) {
    if (engagedNpc) return;
    engagedNpc = { id, ent };
    ent.lockToPlayer = true;
    setAnim(ent, "idle");
    window.__npcChatActive = true;
    const input = document.getElementById("chatInput");
    if (input) {
      input.dataset._oldPh = input.placeholder || "";
      input.placeholder = `Falando com ${ent.name || "NPC"} · Esc pra sair`;
    }
    window.__addSystemLine?.(`💬 Conversando com ${ent.name || "NPC"} (Esc para sair)`);
  }
  function disengageNpc() {
    if (!engagedNpc) return;
    const ent = engagedNpc.ent;
    ent.lockToPlayer = false;
    setAnim(ent, ent.status === "walking" ? "walk" : "idle");
    hideBubble(ent);
    try { currentAudio?.pause(); } catch {}
    currentAudio = null;
    window.__npcChatActive = false;
    const input = document.getElementById("chatInput");
    if (input && input.dataset._oldPh != null) {
      input.placeholder = input.dataset._oldPh;
      delete input.dataset._oldPh;
    }
    window.__addSystemLine?.(`👋 Saiu da conversa.`);
    engagedNpc = null;
  }
  window.__disengageNpc = disengageNpc;

  window.addEventListener("keydown", (e) => {
    const target = e.target;
    const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
    if (e.key === "Escape" && engagedNpc) { e.preventDefault(); disengageNpc(); return; }
    if (isInput) return;
    if (e.key.toLowerCase() === "e" && nearestNpc && !engagedNpc) {
      engageNpc(nearestNpc.id, nearestNpc.ent);
    }
    if (e.key.toLowerCase() === "v" && nearestNpc && !e.repeat) {
      if (!engagedNpc) engageNpc(nearestNpc.id, nearestNpc.ent);
      startPushToTalk(engagedNpc.id, engagedNpc.ent);
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key.toLowerCase() === "v") stopPushToTalk();
  });

  // ===== Speech bubble acima da cabeça do NPC (somente texto) =====
  function ensureBubble(ent) {
    if (ent.bubble) return ent.bubble;
    const b = document.createElement("div");
    b.style.cssText = "position:fixed;top:0;left:0;max-width:260px;background:rgba(255,255,255,.95);color:#111;padding:8px 12px;border-radius:14px;border-bottom-left-radius:4px;font:500 13px system-ui;box-shadow:0 4px 18px rgba(0,0,0,.35);pointer-events:none;z-index:9998;display:none;white-space:pre-wrap";
    document.body.appendChild(b);
    ent.bubble = b;
    ent.bubbleTimer = null;
    return b;
  }
  function showBubble(ent, text, ms = 7000) {
    const b = ensureBubble(ent);
    b.textContent = text;
    b.style.display = "block";
    if (ent.bubbleTimer) clearTimeout(ent.bubbleTimer);
    ent.bubbleTimer = setTimeout(() => hideBubble(ent), ms);
  }
  function hideBubble(ent) {
    if (ent.bubble) ent.bubble.style.display = "none";
    if (ent.bubbleTimer) { clearTimeout(ent.bubbleTimer); ent.bubbleTimer = null; }
  }
  function updateBubble(ent) {
    if (!ent.bubble || ent.bubble.style.display === "none") return;
    const cam = camera(); const r = renderer();
    if (!cam || !r) return;
    const T = THREE();
    const v = new T.Vector3(ent.group.position.x, ent.group.position.y + 2.1, ent.group.position.z);
    v.project(cam);
    if (v.z > 1) { ent.bubble.style.display = "none"; return; }
    const rect = r.domElement.getBoundingClientRect();
    const x = (v.x * 0.5 + 0.5) * rect.width + rect.left;
    const y = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
    ent.bubble.style.transform = `translate(-50%,-100%) translate(${x}px,${y - 8}px)`;
  }

  // ============ PUSH-TO-TALK (ElevenLabs Scribe Realtime via WebSocket) ============
  let pttState = null;
  async function startPushToTalk(npcId, ent) {
    if (pttState) return;
    pttState = { npcId, ent, stop: () => {} };
    showTalkIndicator("ouvindo…");
    try {
      const sb = SB();
      const { data, error } = await sb.functions.invoke("npc-stt-token", { body: {} });
      if (error || !data?.token) throw new Error(error?.message || "token fail");
      const token = data.token;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } });
      const ac = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const source = ac.createMediaStreamSource(stream);
      const proc = ac.createScriptProcessor(4096, 1, 1);
      source.connect(proc); proc.connect(ac.destination);

      const ws = new WebSocket(`wss://api.elevenlabs.io/v1/realtime?model_id=scribe_v2_realtime&authorization=${encodeURIComponent(token)}`);
      ws.binaryType = "arraybuffer";

      let transcripts = [];
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "session.update", session: { audio_format: "pcm_16000", commit_strategy: "vad" } }));
      };
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "partial_transcript" && m.text) updateTalkIndicator(m.text);
          else if (m.type === "committed_transcript" && m.text) transcripts.push(m.text);
        } catch {}
      };
      ws.onerror = (e) => console.warn("[stt] ws error", e);

      proc.onaudioprocess = (e) => {
        if (ws.readyState !== 1) return;
        const f32 = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(f32.length);
        for (let i = 0; i < f32.length; i++) pcm[i] = Math.max(-1, Math.min(1, f32[i])) * 0x7FFF;
        const u8 = new Uint8Array(pcm.buffer);
        let bin = ""; for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
        ws.send(JSON.stringify({ type: "audio", audio: btoa(bin) }));
      };

      pttState.stop = () => {
        try { proc.disconnect(); source.disconnect(); ac.close(); } catch {}
        stream.getTracks().forEach(t => t.stop());
        try { ws.send(JSON.stringify({ type: "commit" })); } catch {}
        setTimeout(() => { try { ws.close(); } catch {} }, 400);
        hideTalkIndicator();
        const finalText = transcripts.join(" ").trim();
        if (finalText) sendNpcText(npcId, ent, finalText, "voice");
      };
    } catch (e) {
      console.warn("[ptt] fail", e);
      hideTalkIndicator();
      pttState = null;
    }
  }
  function stopPushToTalk() {
    if (!pttState) return;
    const s = pttState; pttState = null;
    try { s.stop(); } catch {}
  }
  let talkIndEl = null;
  function showTalkIndicator(txt) {
    if (!talkIndEl) {
      talkIndEl = document.createElement("div");
      talkIndEl.style.cssText = "position:fixed;bottom:180px;left:50%;transform:translateX(-50%);background:#c33d;color:#fff;padding:8px 16px;border-radius:20px;font:600 13px system-ui;z-index:9999;pointer-events:none";
      document.body.appendChild(talkIndEl);
    }
    talkIndEl.textContent = "🎤 " + (txt || "");
  }
  function updateTalkIndicator(txt) { if (talkIndEl) talkIndEl.textContent = "🎤 " + (txt || ""); }
  function hideTalkIndicator() { talkIndEl?.remove(); talkIndEl = null; }

  // ============ enviar texto (do chat principal ou do STT) ============
  let currentAudio = null;
  async function sendNpcText(npcId, ent, text, mode = "text") {
    const sb = SB();
    ent.lockToPlayer = true;
    setAnim(ent, "idle");

    // Eco da mensagem do usuário no chat principal (apenas para o próprio usuário)
    if (mode === "text") {
      window.__addNpcLine?.("Você", text, true);
    } else {
      window.__addSystemLine?.(`🎤 Você: "${text}"`);
    }

    try {
      const { data, error } = await sb.functions.invoke("npc-chat", { body: { npc_id: npcId, text } });
      if (error) throw error;

      // Atualiza nome do NPC se backstory acabou de ser gerada
      if (data.name && ent.name !== data.name) {
        ent.name = data.name;
        const input = document.getElementById("chatInput");
        if (input && engagedNpc && engagedNpc.ent === ent) {
          input.placeholder = `Falando com ${ent.name} · Esc pra sair`;
        }
      }

      if (mode === "text") {
        // Resposta em TEXTO: balão na cabeça + linha no chat. Sem áudio.
        window.__addNpcLine?.(ent.name || "NPC", data.reply, false);
        showBubble(ent, data.reply);
        // toca animação de "talk" por uma duração proporcional ao texto
        if (ent._talkTimer) clearTimeout(ent._talkTimer);
        setAnim(ent, "talk");
        const dur = Math.max(1500, Math.min(6000, (data.reply || "").length * 60));
        ent._talkTimer = setTimeout(() => { setAnim(ent, "idle"); ent._talkTimer = null; }, dur);
      } else {

        // Resposta em ÁUDIO: só toca o som, sem texto em lugar nenhum
        try {
          const { data: { session } } = await sb.auth.getSession();
          const res = await fetch(`https://ajphaszjpizepjmnjxtm.supabase.co/functions/v1/npc-tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}`, apikey: sb.supabaseKey || "" },
            body: JSON.stringify({ text: data.reply, voice_id: data.voice_id }),
          });
          if (res.ok) {
            const blob = await res.blob();
            currentAudio?.pause();
            currentAudio = new Audio(URL.createObjectURL(blob));
            setAnim(ent, "talk");
            currentAudio.onended = () => setAnim(ent, "idle");
            currentAudio.play().catch(() => setAnim(ent, "idle"));
          } else {
            // Fallback: se TTS falhou, mostra balão pra não perder a resposta
            window.__addSystemLine?.("(áudio indisponível, exibindo texto)");
            showBubble(ent, data.reply);
          }
        } catch (e) {
          console.warn("tts fail", e);
          showBubble(ent, data.reply);
        }
      }
    } catch (e) {
      console.warn("npc-chat fail", e);
      window.__addSystemLine?.("NPC não conseguiu responder.");
    }
  }
  window.__sendNpcText = (text, mode) => {
    if (!engagedNpc) return;
    sendNpcText(engagedNpc.id, engagedNpc.ent, text, mode || "text");
  };



  // ============ ADMIN ============
  function initNpcAdminButton() {
    const btn = document.createElement("button");
    btn.textContent = "🧍 NPCs";
    btn.style.cssText = "position:fixed;top:12px;left:12px;z-index:9998;background:#111;color:#39c5bb;border:1px solid #39c5bb;padding:8px 14px;border-radius:8px;font-weight:700;cursor:pointer";
    btn.onclick = openNpcAdmin;
    document.body.appendChild(btn);
  }

  async function openNpcAdmin() {
    if (document.getElementById("npcAdminPanel")) return;
    const panel = document.createElement("div");
    panel.id = "npcAdminPanel";
    panel.style.cssText = "position:fixed;top:60px;left:12px;width:400px;max-height:80vh;overflow-y:auto;background:#111e;backdrop-filter:blur(8px);border:1px solid #39c5bb;border-radius:12px;padding:14px;color:#fff;font:13px system-ui;z-index:9999";
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <strong>Painel NPCs</strong>
        <button id="npcAdminClose" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">×</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;padding:6px;background:#0008;border-radius:6px;font-size:11px">
        <label style="flex:1">🎯 Raio de carregamento (m):
          <input id="npcLoadRadius" type="number" min="5" max="200" value="${getLoadRadius()}" style="width:60px;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:2px"/>
        </label>
        <span style="opacity:.6">NPCs além disso ficam invisíveis pra economizar.</span>
      </div>
      <div style="display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap">
        <button data-tab="models" class="npc-tab" style="flex:1;padding:6px;background:#39c5bb;color:#000;border:none;border-radius:6px;cursor:pointer">Modelos</button>
        <button data-tab="anims" class="npc-tab" style="flex:1;padding:6px;background:#333;color:#fff;border:none;border-radius:6px;cursor:pointer">Animações</button>
        <button data-tab="routes" class="npc-tab" style="flex:1;padding:6px;background:#333;color:#fff;border:none;border-radius:6px;cursor:pointer">Rotas</button>
        <button data-tab="spawn" class="npc-tab" style="flex:1;padding:6px;background:#333;color:#fff;border:none;border-radius:6px;cursor:pointer">Spawn</button>
        <button data-tab="jobs" class="npc-tab" style="flex:1;padding:6px;background:#333;color:#fff;border:none;border-radius:6px;cursor:pointer">Empregos</button>
      </div>
      <div id="npcTabContent"></div>`;
    document.body.appendChild(panel);
    document.getElementById("npcLoadRadius").onchange = (e) => {
      const v = Math.max(5, Math.min(200, Number(e.target.value) || 25));
      localStorage.setItem("npcLoadRadius", String(v));
      e.target.value = v;
    };
    document.getElementById("npcAdminClose").onclick = () => { panel.remove(); exitRouteEditor(); };
    panel.querySelectorAll(".npc-tab").forEach((b) => b.addEventListener("click", () => {
      panel.querySelectorAll(".npc-tab").forEach((x) => { x.style.background = "#333"; x.style.color = "#fff"; });
      b.style.background = "#39c5bb"; b.style.color = "#000";
      if (b.dataset.tab !== "routes") exitRouteEditor();
      renderTab(b.dataset.tab);
    }));
    renderTab("models");
  }

  async function renderTab(name) {
    const sb = SB();
    const el = document.getElementById("npcTabContent");
    if (!el) return;
    if (name === "models") return renderModelsTab(el, sb);
    if (name === "anims")  return renderAnimsTab(el, sb);
    if (name === "routes") return renderRoutesTab(el, sb);
    if (name === "spawn")  return renderSpawnTab(el, sb);
    if (name === "jobs")   return renderJobsTab(el, sb);
  }

  async function renderModelsTab(el, sb) {
    const { data: models } = await sb.from("npc_models").select("*").order("name");
    el.innerHTML = `
      <div style="margin-bottom:10px;padding:8px;background:#0008;border-radius:6px">
        <input type="file" id="npcGlbFile" accept=".glb,.fbx" multiple style="width:100%"/>
        <div style="display:flex;gap:6px;margin-top:6px">
          <select id="npcGender" style="flex:1;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px">
            <option value="male">Masculino</option>
            <option value="female">Feminino</option>
            <option value="neutral">Neutro</option>
          </select>
          <button id="npcUpload" style="flex:1;background:#39c5bb;color:#000;border:none;padding:6px;border-radius:4px;font-weight:700;cursor:pointer">Enviar</button>
        </div>
      </div>
      <div id="npcModelList"></div>`;
    const list = document.getElementById("npcModelList");
    (models || []).forEach((m) => {
      const icon = m.gender === "male" ? "♂" : m.gender === "female" ? "♀" : "·";
      const row = document.createElement("div");
      row.style.cssText = "padding:6px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;gap:4px;flex-wrap:wrap";
      row.innerHTML = `
        <span style="flex:1;min-width:120px">${icon} ${m.name}</span>
        <select data-id="${m.id}" class="npc-gen-sel" style="background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:2px;font-size:11px">
          <option value="male" ${m.gender==='male'?'selected':''}>♂</option>
          <option value="female" ${m.gender==='female'?'selected':''}>♀</option>
          <option value="neutral" ${m.gender==='neutral'?'selected':''}>·</option>
        </select>
        <label style="font-size:11px;display:flex;align-items:center;gap:3px">Tam:
          <input type="number" data-id="${m.id}" class="npc-scale-inp" min="0.1" max="5" step="0.05" value="${m.scale_mul || 1}" style="width:55px;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:2px;font-size:11px"/>
        </label>
        <button data-id="${m.id}" class="npc-spawn-btn" style="background:#39c5bb;color:#000;border:none;padding:3px 8px;border-radius:4px;cursor:pointer">+Spawn</button>
        <button data-id="${m.id}" class="npc-del-btn" style="background:#c33;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer">×</button>`;
      list.appendChild(row);
    });
    list.querySelectorAll(".npc-gen-sel").forEach((s) => s.onchange = async () => {
      await sb.from("npc_models").update({ gender: s.value }).eq("id", s.dataset.id);
    });
    list.querySelectorAll(".npc-scale-inp").forEach((inp) => inp.onchange = async () => {
      const v = Math.max(0.1, Math.min(5, Number(inp.value) || 1));
      inp.value = v;
      const modelId = inp.dataset.id;
      await sb.from("npc_models").update({ scale_mul: v }).eq("id", modelId);
      const m = npcModels.get(modelId); if (m) m.scale_mul = v;
      // re-escala NPCs já carregados que usam esse modelo
      for (const [npcId, ent] of npcEntities) {
        const inst = npcInstances.get(npcId);
        if (inst && inst.model_id === modelId && ent.group?.children?.[0]) {
          ent.group.children[0].scale.setScalar(v);
        }
      }
    });

    list.querySelectorAll(".npc-del-btn").forEach((b) => b.onclick = async () => {
      if (!confirm("Excluir modelo?")) return;
      await sb.from("npc_models").delete().eq("id", b.dataset.id);
      renderTab("models");
    });
    list.querySelectorAll(".npc-spawn-btn").forEach((b) => b.onclick = async () => {
      const p = player(); if (!p) return alert("jogador não localizado");
      const mapId = getCurrentMapId();
      const { data: route } = await sb.from("npc_routes").insert({ name: "Rota " + Date.now(), map_id: mapId }).select().single();
      await sb.from("npc_waypoints").insert([
        { route_id: route.id, seq: 0, x: p.position.x, z: p.position.z, y: p.position.y },
        { route_id: route.id, seq: 1, x: p.position.x + 8, z: p.position.z, y: p.position.y },
        { route_id: route.id, seq: 2, x: p.position.x + 8, z: p.position.z + 8, y: p.position.y },
        { route_id: route.id, seq: 3, x: p.position.x, z: p.position.z + 8, y: p.position.y },
      ]);
      await sb.from("npc_instances").insert({ model_id: b.dataset.id, route_id: route.id, map_id: mapId, display_name: "NPC " + Math.floor(Math.random()*999), active: true });
      alert("NPC criado neste mapa!");
    });
    document.getElementById("npcUpload").onclick = async () => {
      const files = document.getElementById("npcGlbFile").files;
      const gender = document.getElementById("npcGender").value;
      if (!files.length) return;
      for (const f of files) {
        const slug = f.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36);
        const path = `npcs/${slug}.${f.name.split(".").pop()}`;
        const { error: upErr } = await sb.storage.from("characters").upload(path, f, { upsert: true });
        if (upErr) { alert("upload erro: " + upErr.message); continue; }
        const { data: pub } = sb.storage.from("characters").getPublicUrl(path);
        await sb.from("npc_models").insert({ slug, name: f.name.replace(/\.[^.]+$/, ""), model_url: pub.publicUrl, gender });
      }
      renderTab("models");
    };
  }

  async function renderAnimsTab(el, sb) {
    const { data: anims } = await sb.from("npc_animations").select("*").order("slug");
    el.innerHTML = `
      <div style="padding:8px;background:#0008;border-radius:6px;margin-bottom:10px">
        <p style="margin:0 0 6px;font-size:11px;opacity:.7">Slugs aceitos: idle, walk, talk, sit, wave, social_a, social_b, social_c</p>
        <input type="file" id="npcAnimFile" accept=".glb,.fbx" style="width:100%"/>
        <div style="display:flex;gap:6px;margin-top:6px">
          <select id="npcAnimSlug" style="flex:1;background:#000;color:#fff;border:1px solid #444;padding:4px">
            ${["idle","walk","talk","sit","wave","social_a","social_b","social_c"].map(s => `<option>${s}</option>`).join("")}
          </select>
          <select id="npcAnimGender" style="background:#000;color:#fff;border:1px solid #444;padding:4px">
            <option value="any">Qualquer</option>
            <option value="male">♂</option>
            <option value="female">♀</option>
          </select>
          <button id="npcAnimUpload" style="background:#39c5bb;color:#000;border:none;padding:4px 10px;border-radius:4px;font-weight:700;cursor:pointer">Enviar</button>
        </div>
      </div>
      <div id="npcAnimList"></div>`;
    const list = document.getElementById("npcAnimList");
    (anims || []).forEach((a) => {
      const row = document.createElement("div");
      row.style.cssText = "padding:6px;border-bottom:1px solid #333;display:flex;justify-content:space-between";
      row.innerHTML = `<span>${a.slug} <small style="opacity:.6">(${a.gender})</small> — ${a.name}</span>
        <button data-id="${a.id}" class="npc-anim-del" style="background:#c33;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer">×</button>`;
      list.appendChild(row);
    });
    list.querySelectorAll(".npc-anim-del").forEach((b) => b.onclick = async () => {
      await sb.from("npc_animations").delete().eq("id", b.dataset.id);
      renderTab("anims");
    });
    document.getElementById("npcAnimUpload").onclick = async () => {
      const f = document.getElementById("npcAnimFile").files[0]; if (!f) return;
      const slug = document.getElementById("npcAnimSlug").value;
      const gender = document.getElementById("npcAnimGender").value;
      const path = `npcs/anims/${slug}-${gender}-${Date.now().toString(36)}.${f.name.split(".").pop()}`;
      const { error: upErr } = await sb.storage.from("characters").upload(path, f, { upsert: true });
      if (upErr) { alert("upload erro: " + upErr.message); return; }
      const { data: pub } = sb.storage.from("characters").getPublicUrl(path);
      await sb.from("npc_animations").insert({ slug, gender, name: f.name, model_url: pub.publicUrl });
      renderTab("anims");
    };
  }

  // ============ ROUTE EDITOR (visual) ============
  let routeEditor = null; // { routeId, gizmos: Map<wp_id, mesh>, lines, dragWp, ... }

  async function renderRoutesTab(el, sb) {
    const mapId = getCurrentMapId();
    const { data: routes } = await sb.from("npc_routes").select("*,npc_waypoints(count)").eq("map_id", mapId).order("created_at", { ascending: false });
    const cur = routeEditor?.routeId || "";
    el.innerHTML = `
      <button id="npcNewRoute" style="width:100%;background:#39c5bb;color:#000;border:none;padding:8px;border-radius:6px;font-weight:700;cursor:pointer;margin-bottom:8px">+ Nova rota neste mapa</button>
      <p style="font-size:11px;opacity:.7;margin:4px 0">Mapa atual: <b>${mapId}</b>. Clique "Editar" e depois clique no chão pra adicionar pontos. Arraste pra mover. Os NPCs caminham do ponto atual até o mais próximo.</p>
      <div id="npcRoutesList"></div>
      <div id="npcRouteHud"></div>`;
    document.getElementById("npcNewRoute").onclick = async () => {
      const name = prompt("Nome da rota:", "Rota " + Date.now());
      if (!name) return;
      await sb.from("npc_routes").insert({ name, map_id: mapId });
      renderTab("routes");
    };
    const list = document.getElementById("npcRoutesList");
    (routes || []).forEach((r) => {
      const isEditing = cur === r.id;
      const row = document.createElement("div");
      row.style.cssText = "padding:6px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;gap:4px";
      row.innerHTML = `
        <span style="flex:1">${r.name} <small style="opacity:.5">(${r.npc_waypoints?.[0]?.count || 0} wps)</small></span>
        <button data-id="${r.id}" class="npc-route-edit" style="background:${isEditing?'#c33':'#39c5bb'};color:${isEditing?'#fff':'#000'};border:none;padding:3px 10px;border-radius:4px;cursor:pointer;font-weight:700">${isEditing?'Sair':'Editar'}</button>
        <button data-id="${r.id}" class="npc-route-del" style="background:#c33;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer">×</button>`;
      list.appendChild(row);
    });
    list.querySelectorAll(".npc-route-del").forEach((b) => b.onclick = async () => {
      if (!confirm("Excluir rota?")) return;
      if (routeEditor?.routeId === b.dataset.id) exitRouteEditor();
      await sb.from("npc_routes").delete().eq("id", b.dataset.id);
      renderTab("routes");
    });
    list.querySelectorAll(".npc-route-edit").forEach((b) => b.onclick = async () => {
      if (routeEditor?.routeId === b.dataset.id) exitRouteEditor();
      else await enterRouteEditor(b.dataset.id);
      renderTab("routes");
    });
  }

  async function enterRouteEditor(routeId) {
    exitRouteEditor();
    const sb = SB(); const T = THREE();
    const { data: wps } = await sb.from("npc_waypoints").select("*").eq("route_id", routeId).order("seq");
    routeEditor = { routeId, gizmos: new Map(), lines: null, raycaster: new T.Raycaster(), pointer: new T.Vector2(), dragWp: null, selWp: null };
    rebuildRouteGizmos(wps || []);
    bindEditorEvents();
    showRouteEditorHud();
    // realtime
    routeEditor.channel = sb.channel(`route-${routeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "npc_waypoints", filter: `route_id=eq.${routeId}` }, async () => {
        if (!routeEditor) return;
        const { data: wps } = await sb.from("npc_waypoints").select("*").eq("route_id", routeId).order("seq");
        rebuildRouteGizmos(wps || []);
      }).subscribe();
  }
  function exitRouteEditor() {
    if (!routeEditor) return;
    const sb = SB();
    if (routeEditor.channel) sb.removeChannel(routeEditor.channel);
    for (const m of routeEditor.gizmos.values()) scene().remove(m);
    if (routeEditor.lines) scene().remove(routeEditor.lines);
    unbindEditorEvents();
    document.getElementById("npcRouteHudFixed")?.remove();
    routeEditor = null;
  }
  function wpColor(wp) {
    if (wp.is_sit_spot) return 0x4ade80;
    if (wp.is_talk_spot) return 0x3b82f6;
    if (wp.is_crosswalk) return 0xfacc15;
    return 0xbbbbbb;
  }
  function rebuildRouteGizmos(wps) {
    if (!routeEditor) return;
    const T = THREE();
    for (const m of routeEditor.gizmos.values()) scene().remove(m);
    routeEditor.gizmos.clear();
    if (routeEditor.lines) { scene().remove(routeEditor.lines); routeEditor.lines = null; }
    routeEditor.wps = wps;
    for (const wp of wps) {
      const geo = new T.SphereGeometry(0.35, 16, 12);
      const mat = new T.MeshBasicMaterial({ color: wpColor(wp), transparent: true, opacity: 0.85, depthTest: false });
      const sph = new T.Mesh(geo, mat);
      sph.position.set(wp.x, (wp.y || 0) + 0.5, wp.z);
      sph.userData.wp = wp;
      sph.renderOrder = 9999;
      scene().add(sph);
      routeEditor.gizmos.set(wp.id, sph);
    }
    // Sem linhas conectando: NPCs escolhem o ponto mais próximo dinamicamente.

  }
  function showRouteEditorHud() {
    const old = document.getElementById("npcRouteHudFixed"); if (old) old.remove();
    const hud = document.createElement("div");
    hud.id = "npcRouteHudFixed";
    hud.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#111d;border:1px solid #39c5bb;border-radius:10px;padding:8px 14px;color:#fff;font:13px system-ui;z-index:10000;display:flex;gap:8px;align-items:center";
    hud.innerHTML = `
      <strong>✏️ Editor de rota</strong>
      <span style="opacity:.7;font-size:11px">Clique no chão pra adicionar ponto · Arraste bolinhas pra mover · Click numa bolinha pra editar · NPCs caminham do ponto atual até o mais próximo</span>

      <button id="npcRouteExit" style="background:#c33;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer">Sair</button>`;
    document.body.appendChild(hud);
    document.getElementById("npcRouteExit").onclick = () => { exitRouteEditor(); renderTab("routes"); };
  }

  let editorBound = false;
  function bindEditorEvents() {
    if (editorBound) return; editorBound = true;
    const cv = renderer()?.domElement || window;
    // capture phase + stopImmediatePropagation so app camera/movement não engole
    cv.addEventListener("pointerdown", onEditorDown, true);
    cv.addEventListener("pointermove", onEditorMove, true);
    cv.addEventListener("pointerup", onEditorUp, true);
    cv.addEventListener("contextmenu", onEditorCtx, true);
  }
  function unbindEditorEvents() {
    if (!editorBound) return; editorBound = false;
    const cv = renderer()?.domElement || window;
    cv.removeEventListener("pointerdown", onEditorDown, true);
    cv.removeEventListener("pointermove", onEditorMove, true);
    cv.removeEventListener("pointerup", onEditorUp, true);
    cv.removeEventListener("contextmenu", onEditorCtx, true);
  }
  function onEditorCtx(e) { if (routeEditor) { e.preventDefault(); e.stopPropagation(); } }
  function setPointerNDC(e) {
    if (!routeEditor) return;
    const T = THREE();
    const rect = (renderer()?.domElement || document.body).getBoundingClientRect();
    routeEditor.pointer = routeEditor.pointer || new T.Vector2();
    routeEditor.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    routeEditor.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }
  function raycastGround() {
    if (!routeEditor || !camera()) return null;
    const T = THREE();
    routeEditor.raycaster.setFromCamera(routeEditor.pointer, camera());
    // 1) tenta bater nos meshes caminháveis reais (chão/escadas/objetos do mapa)
    const sc = scene();
    const walkables = [];
    sc?.traverse?.((o) => { if (o.isMesh && o.visible !== false) walkables.push(o); });
    const hits = routeEditor.raycaster.intersectObjects(walkables, false);
    // ignora as próprias bolinhas do editor
    const gizSet = new Set(routeEditor.gizmos.values());
    const real = hits.find((h) => !gizSet.has(h.object));
    if (real) return real.point;
    // 2) fallback plano y=0
    const plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
    const hit = new T.Vector3();
    routeEditor.raycaster.ray.intersectPlane(plane, hit);
    return hit;
  }
  function raycastGizmo() {
    if (!routeEditor || !camera()) return null;
    routeEditor.raycaster.setFromCamera(routeEditor.pointer, camera());
    const meshes = Array.from(routeEditor.gizmos.values());
    const hits = routeEditor.raycaster.intersectObjects(meshes, false);
    return hits[0]?.object || null;
  }
  let downTime = 0, downPos = null;
  async function onEditorDown(e) {
    if (!routeEditor) return;
    if (e.button !== 0) return;
    setPointerNDC(e);
    const giz = raycastGizmo();
    downTime = Date.now();
    downPos = { x: e.clientX, y: e.clientY };
    if (giz) {
      routeEditor.dragWp = giz.userData.wp;
      routeEditor.dragStartX = giz.position.x; routeEditor.dragStartZ = giz.position.z;
      e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault();
    } else {
      routeEditor.dragWp = null;
    }
  }
  let dragDebounceT = null;
  function onEditorMove(e) {
    if (!routeEditor) return;
    setPointerNDC(e);
    if (routeEditor.dragWp) {
      const hit = raycastGround(); if (!hit) return;
      const giz = routeEditor.gizmos.get(routeEditor.dragWp.id);
      if (giz) giz.position.set(hit.x, (hit.y || 0) + 0.5, hit.z);
      if (dragDebounceT) clearTimeout(dragDebounceT);
      dragDebounceT = setTimeout(async () => {
        const sb = SB();
        await sb.from("npc_waypoints").update({ x: hit.x, y: hit.y || 0, z: hit.z }).eq("id", routeEditor.dragWp.id);
      }, 200);
      e.stopPropagation(); e.stopImmediatePropagation();
    }
  }
  async function onEditorUp(e) {
    if (!routeEditor) return;
    if (e.button !== 0) return;
    setPointerNDC(e);
    const moved = downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5;
    const clickedWp = routeEditor.dragWp;
    routeEditor.dragWp = null;
    if (clickedWp) {
      e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault();
      if (!moved) openWpHud(clickedWp);
      return;
    }
    if (moved) return;
    if (Date.now() - downTime > 700) return;
    const justAdded = routeEditor.lastAddAt && Date.now() - routeEditor.lastAddAt < 250;
    if (routeEditor.addingPoint || justAdded) { e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault(); return; }
    const hit = raycastGround();
    if (!hit) { editorToast("✗ clique fora do chão"); return; }
    e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault();
    const sb = SB();
    routeEditor.addingPoint = true;
    const nextSeq = ((routeEditor.wps || []).reduce((max, wp) => Math.max(max, Number(wp.seq) || 0), -1) + 1);
    const wpId = crypto.randomUUID?.() || "10000000-1000-4000-8000-" + Math.floor(Math.random() * 1e12).toString().padStart(12, "0");
    const wp = { id: wpId, route_id: routeEditor.routeId, seq: nextSeq, x: hit.x, z: hit.z, y: hit.y || 0, is_crosswalk: false, is_talk_spot: false, is_sit_spot: false, pause_ms: 0 };
    const { error } = await sb.from("npc_waypoints").insert(wp);
    routeEditor.addingPoint = false;
    routeEditor.lastAddAt = Date.now();
    if (error) editorToast("✗ erro: " + error.message);
    else {
      const wps = [...(routeEditor.wps || []), wp].sort((a, b) => (a.seq || 0) - (b.seq || 0));
      rebuildRouteGizmos(wps);
      editorToast(`✔ ponto #${nextSeq} criado`);
    }
  }
  let toastT = null;
  function editorToast(msg) {
    let t = document.getElementById("npcEditorToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "npcEditorToast";
      t.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#111d;color:#39c5bb;border:1px solid #39c5bb;border-radius:6px;padding:6px 12px;font:600 12px system-ui;z-index:10002;pointer-events:none";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(() => { t.style.opacity = "0"; }, 1500);
  }

  function openWpHud(wp) {
    const old = document.getElementById("npcWpHud"); if (old) old.remove();
    const hud = document.createElement("div");
    hud.id = "npcWpHud";
    hud.style.cssText = "position:fixed;top:90px;right:20px;background:#111d;border:1px solid #39c5bb;border-radius:10px;padding:10px;color:#fff;font:13px system-ui;z-index:10001;width:240px";
    hud.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><strong>Waypoint #${wp.seq}</strong><button id="wpClose" style="background:none;border:none;color:#fff;cursor:pointer">×</button></div>
      <label style="display:block;margin:4px 0"><input type="checkbox" id="wpCross" ${wp.is_crosswalk?'checked':''}/> 🚸 Travessia</label>
      <label style="display:block;margin:4px 0"><input type="checkbox" id="wpTalk" ${wp.is_talk_spot?'checked':''}/> 💬 Ponto de conversa</label>
      <label style="display:block;margin:4px 0"><input type="checkbox" id="wpSit" ${wp.is_sit_spot?'checked':''}/> 🪑 Sentar</label>
      <label style="display:block;margin:4px 0">⏱ Pausa (ms): <input type="number" id="wpPause" value="${wp.pause_ms||0}" style="width:80px;background:#000;color:#fff;border:1px solid #444"/></label>
      <button id="wpSave" style="width:100%;background:#39c5bb;color:#000;border:none;padding:6px;border-radius:4px;font-weight:700;cursor:pointer;margin-top:6px">Salvar</button>
      <button id="wpDel" style="width:100%;background:#c33;color:#fff;border:none;padding:6px;border-radius:4px;font-weight:700;cursor:pointer;margin-top:4px">Excluir</button>`;
    document.body.appendChild(hud);
    document.getElementById("wpClose").onclick = () => hud.remove();
    document.getElementById("wpSave").onclick = async () => {
      const sb = SB();
      await sb.from("npc_waypoints").update({
        is_crosswalk: document.getElementById("wpCross").checked,
        is_talk_spot: document.getElementById("wpTalk").checked,
        is_sit_spot: document.getElementById("wpSit").checked,
        pause_ms: Number(document.getElementById("wpPause").value) || 0,
      }).eq("id", wp.id);
      hud.remove();
    };
    document.getElementById("wpDel").onclick = async () => {
      if (!confirm("Excluir waypoint?")) return;
      const sb = SB();
      await sb.from("npc_waypoints").delete().eq("id", wp.id);
      hud.remove();
    };
  }

  async function renderSpawnTab(el, sb) {
    const mapId = window.__currentMapId || "bar";
    const [{ data: insts }, { data: routes }] = await Promise.all([
      sb.from("npc_instances").select("*,npc_models(name,gender),npc_routes(name)").eq("map_id", mapId).order("created_at", { ascending: false }),
      sb.from("npc_routes").select("id,name").eq("map_id", mapId).order("name"),
    ]);
    const routeOpts = (routes || []).map(r => `<option value="${r.id}">${r.name}</option>`).join("");
    const esc = (s) => String(s||"").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    el.innerHTML = `<p style="opacity:.7">NPCs nesta sala (${mapId}):</p>` +
      ((insts||[]).length ? (insts||[]).map(i => `<div style="padding:6px;border-bottom:1px solid #333;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:4px" data-row="${i.id}">
        <span style="flex:1;min-width:140px">${esc(i.display_name)} <small style="opacity:.6">(${esc(i.npc_models?.name || '?')})</small>${!i.route_id?' <span style="color:#fc3;font-size:10px">⚠ sem rota</span>':''}</span>
        <select data-id="${i.id}" class="npc-route-sel" style="background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:2px;font-size:11px;max-width:140px">
          <option value="">— sem rota —</option>
          ${routeOpts.replace(`value="${i.route_id}"`, `value="${i.route_id}" selected`)}
        </select>
        <label style="font-size:11px"><input type="checkbox" ${i.active?'checked':''} data-id="${i.id}" class="npc-act"/> ativo</label>
        <button data-id="${i.id}" class="npc-bs-toggle" style="background:#444;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px">📖 História</button>
        <button data-id="${i.id}" class="npc-inst-del" style="background:#c33;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer">×</button>
        <div class="npc-bs-panel" data-id="${i.id}" style="display:none;width:100%;margin-top:6px">
          <textarea class="npc-bs-text" data-id="${i.id}" maxlength="2000" placeholder="Base da história deste NPC (até 2000 chars). Ex.: nome, idade, profissão, gostos, segredos, lugar onde mora..." style="width:100%;min-height:90px;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:12px;font-family:inherit;resize:vertical">${esc(i.backstory||'')}</textarea>
          <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
            <label style="background:#39c5bb;color:#000;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px;font-weight:700">📄 Subir .txt<input type="file" class="npc-bs-file" data-id="${i.id}" accept=".txt,text/plain" style="display:none"/></label>
            <button class="npc-bs-save" data-id="${i.id}" style="background:#3a3;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700">Salvar história</button>
            <button class="npc-bs-clear" data-id="${i.id}" style="background:#666;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px">Limpar (auto-gerar)</button>
            <span class="npc-bs-status" data-id="${i.id}" style="font-size:11px;opacity:.7;align-self:center"></span>
          </div>
        </div>
      </div>`).join('') : `<p style="opacity:.5;font-size:12px">Nenhum NPC nesta sala. Use a aba Modelos pra spawnar.</p>`);
    el.querySelectorAll(".npc-act").forEach((c) => c.onchange = async () => {
      await sb.from("npc_instances").update({ active: c.checked }).eq("id", c.dataset.id);
    });
    el.querySelectorAll(".npc-route-sel").forEach((s) => s.onchange = async () => {
      const npcId = s.dataset.id;
      const newRoute = s.value || null;
      await sb.from("npc_instances").update({ route_id: newRoute }).eq("id", npcId);
      await sb.from("npc_state").delete().eq("npc_id", npcId);
    });
    el.querySelectorAll(".npc-bs-toggle").forEach((b) => b.onclick = () => {
      const panel = el.querySelector(`.npc-bs-panel[data-id="${b.dataset.id}"]`);
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    });
    el.querySelectorAll(".npc-bs-file").forEach((inp) => inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return;
      const txt = (await f.text()).slice(0, 2000);
      const ta = el.querySelector(`.npc-bs-text[data-id="${inp.dataset.id}"]`);
      if (ta) ta.value = txt;
      inp.value = "";
    });
    el.querySelectorAll(".npc-bs-save").forEach((b) => b.onclick = async () => {
      const id = b.dataset.id;
      const ta = el.querySelector(`.npc-bs-text[data-id="${id}"]`);
      const status = el.querySelector(`.npc-bs-status[data-id="${id}"]`);
      const val = (ta?.value || "").trim().slice(0, 2000);
      if (status) status.textContent = "salvando...";
      const { error } = await sb.from("npc_instances").update({ backstory: val || null }).eq("id", id);
      if (status) status.textContent = error ? "✗ erro" : "✔ salvo";
      setTimeout(() => { if (status) status.textContent = ""; }, 2000);
    });
    el.querySelectorAll(".npc-bs-clear").forEach((b) => b.onclick = async () => {
      const id = b.dataset.id;
      const ta = el.querySelector(`.npc-bs-text[data-id="${id}"]`);
      if (ta) ta.value = "";
      await sb.from("npc_instances").update({ backstory: null }).eq("id", id);
    });
    el.querySelectorAll(".npc-inst-del").forEach((b) => b.onclick = async () => {
      await sb.from("npc_instances").delete().eq("id", b.dataset.id);
      renderTab("spawn");
    });
  }


  async function renderJobsTab(el, sb) {
    const { data: hubs } = await sb.from("delivery_hubs").select("*,delivery_destinations(count)").order("created_at", { ascending: false });
    el.innerHTML = `
      <button id="npcAddHub" style="width:100%;background:#39c5bb;color:#000;border:none;padding:8px;border-radius:6px;font-weight:700;cursor:pointer;margin-bottom:8px">+ Criar Hub na minha posição</button>
      ${(hubs||[]).map(h => `<div style="padding:6px;border-bottom:1px solid #333">
        <strong>${h.name}</strong> — ${h.delivery_destinations?.[0]?.count || 0} destinos<br/>
        <small style="opacity:.6">R$${(h.base_pay_cents/100).toFixed(2)} base + R$${(h.bonus_pay_cents/100).toFixed(2)} bônus</small><br/>
        <button data-id="${h.id}" class="npc-add-dest" style="background:#39c5bb;color:#000;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;margin-top:4px">+ Destino aqui</button>
        <button data-id="${h.id}" class="npc-hub-del" style="background:#c33;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer">×</button>
      </div>`).join('')}`;
    document.getElementById("npcAddHub").onclick = async () => {
      const p = player(); if (!p) return alert("jogador?");
      const name = prompt("Nome do hub:", "Posto de Entrega") || "Posto";
      await sb.from("delivery_hubs").insert({ name, pickup_x: p.position.x, pickup_y: p.position.y, pickup_z: p.position.z });
      renderTab("jobs");
    };
    el.querySelectorAll(".npc-add-dest").forEach((b) => b.onclick = async () => {
      const p = player(); if (!p) return;
      const label = prompt("Endereço:", "Casa") || "Casa";
      await sb.from("delivery_destinations").insert({ hub_id: b.dataset.id, label, x: p.position.x, y: p.position.y, z: p.position.z });
      renderTab("jobs");
    });
    el.querySelectorAll(".npc-hub-del").forEach((b) => b.onclick = async () => {
      if (!confirm("Excluir hub?")) return;
      await sb.from("delivery_hubs").delete().eq("id", b.dataset.id);
      renderTab("jobs");
    });
  }
})();
