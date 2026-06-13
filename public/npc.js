// NPC runtime + admin panel — opera em cima do mundo já carregado por app.js.
// Espera que app.js exponha em window: __scene (THREE.Scene), __player (objeto com .position {x,y,z}),
// __supabase, __isAdmin (bool), __THREE (módulo), __GLTFLoader (classe), __raycastGround (fn opcional).
// Se algo faltar, o módulo degrada graciosamente.

(function () {
  const SB = () => window.__supabase || window.supabase;
  const THREE = () => window.__THREE || window.THREE;
  const scene = () => window.__scene;
  const player = () => window.__player;

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

  // ============ RUNTIME ============
  const npcEntities = new Map(); // npc_id -> { group, mixer, actions, targetPos, targetRot, model, name, voice_id }
  const npcInstances = new Map();
  const npcModels = new Map();

  async function initNpcRuntime() {
    const sb = SB();
    const { data: models } = await sb.from("npc_models").select("*");
    (models || []).forEach((m) => npcModels.set(m.id, m));
    const { data: inst } = await sb.from("npc_instances").select("*").eq("active", true);
    (inst || []).forEach((i) => npcInstances.set(i.id, i));
    const { data: states } = await sb.from("npc_state").select("*");
    (states || []).forEach((s) => applyState(s));

    // realtime
    sb.channel("npc-state")
      .on("postgres_changes", { event: "*", schema: "public", table: "npc_state" }, (payload) => {
        if (payload.new) applyState(payload.new);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "npc_instances" }, async () => {
        const { data: inst } = await sb.from("npc_instances").select("*").eq("active", true);
        npcInstances.clear();
        (inst || []).forEach((i) => npcInstances.set(i.id, i));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "npc_models" }, async () => {
        const { data: models } = await sb.from("npc_models").select("*");
        npcModels.clear();
        (models || []).forEach((m) => npcModels.set(m.id, m));
      })
      .subscribe();

    // animation loop
    const clock = new (THREE().Clock)();
    function tick() {
      const dt = clock.getDelta();
      for (const ent of npcEntities.values()) {
        if (ent.mixer) ent.mixer.update(dt);
        if (ent.targetPos) {
          ent.group.position.lerp(ent.targetPos, Math.min(1, dt * 4));
        }
        if (typeof ent.targetRot === "number") {
          let diff = ent.targetRot - ent.group.rotation.y;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          ent.group.rotation.y += diff * Math.min(1, dt * 6);
        }
      }
      checkNpcProximity();
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  async function applyState(s) {
    const inst = npcInstances.get(s.npc_id);
    if (!inst) return;
    let ent = npcEntities.get(s.npc_id);
    if (!ent) {
      ent = await spawnNpc(inst);
      if (!ent) return;
      ent.group.position.set(s.x, s.y, s.z);
    }
    ent.targetPos = new (THREE().Vector3)(s.x, s.y, s.z);
    ent.targetRot = s.rot_y;
    setAnim(ent, s.anim);
  }

  async function spawnNpc(inst) {
    const model = npcModels.get(inst.model_id);
    if (!model || !model.model_url) return null;
    const T = THREE();
    const group = new T.Group();
    group.name = `npc:${inst.id}`;
    scene().add(group);

    const Loader = window.__GLTFLoader;
    const ent = { group, mixer: null, actions: {}, name: inst.display_name, voice_id: inst.voice_id || model.voice_id, persona: inst.persona };
    npcEntities.set(inst.id, ent);

    if (Loader) {
      try {
        const loader = new Loader();
        const gltf = await loader.loadAsync(model.model_url);
        const root = gltf.scene;
        const scale = model.scale_mul || 1;
        root.scale.setScalar(scale);
        group.add(root);
        if (gltf.animations && gltf.animations.length) {
          ent.mixer = new T.AnimationMixer(root);
          for (const clip of gltf.animations) {
            ent.actions[clip.name.toLowerCase()] = ent.mixer.clipAction(clip);
          }
        }
      } catch (e) {
        console.warn("[npc] load fail", e);
        // fallback: cube
        const m = new T.Mesh(new T.BoxGeometry(0.5, 1.7, 0.5), new T.MeshStandardMaterial({ color: 0x39c5bb }));
        m.position.y = 0.85;
        group.add(m);
      }
    } else {
      const m = new T.Mesh(new T.BoxGeometry(0.5, 1.7, 0.5), new T.MeshStandardMaterial({ color: 0x39c5bb }));
      m.position.y = 0.85;
      group.add(m);
    }

    // nameplate
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.font = "bold 28px system-ui"; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 4;
    ctx.textAlign = "center"; ctx.strokeText(inst.display_name, 128, 40); ctx.fillText(inst.display_name, 128, 40);
    const tex = new T.CanvasTexture(canvas);
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(1.6, 0.4, 1); sprite.position.y = 2.1;
    group.add(sprite);

    return ent;
  }

  function setAnim(ent, name) {
    if (!ent.actions) return;
    const target = ent.actions[name] || ent.actions["idle"] || Object.values(ent.actions)[0];
    if (!target || ent.currentAction === target) return;
    if (ent.currentAction) ent.currentAction.fadeOut(0.25);
    target.reset().fadeIn(0.25).play();
    ent.currentAction = target;
  }

  // ===== proximidade + prompt conversa =====
  let nearestNpc = null;
  let promptEl = null;
  function checkNpcProximity() {
    const p = player();
    if (!p) return;
    let best = null, bestD = 2.5;
    for (const [id, ent] of npcEntities) {
      const d = Math.hypot(ent.group.position.x - p.position.x, ent.group.position.z - p.position.z);
      if (d < bestD) { bestD = d; best = { id, ent }; }
    }
    nearestNpc = best;
    if (best && !promptEl) showPrompt();
    else if (!best && promptEl) hidePrompt();
  }
  function showPrompt() {
    if (promptEl) return;
    promptEl = document.createElement("div");
    promptEl.id = "npcPrompt";
    promptEl.style.cssText = "position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#fff;padding:10px 18px;border-radius:24px;font:600 14px system-ui;z-index:9999;pointer-events:none;border:1px solid #39c5bb";
    promptEl.textContent = "Pressione E para conversar";
    document.body.appendChild(promptEl);
  }
  function hidePrompt() { promptEl?.remove(); promptEl = null; }

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "e" && nearestNpc && !document.getElementById("npcChat")) {
      openChat(nearestNpc.id, nearestNpc.ent);
    }
  });

  // ============ CHAT MODAL ============
  let currentAudio = null;
  async function openChat(npcId, ent) {
    const wrap = document.createElement("div");
    wrap.id = "npcChat";
    wrap.style.cssText = "position:fixed;right:20px;bottom:20px;width:360px;max-height:60vh;background:#111c;backdrop-filter:blur(10px);border:1px solid #39c5bb;border-radius:14px;display:flex;flex-direction:column;z-index:10000;color:#fff;font:14px system-ui";
    wrap.innerHTML = `
      <div style="padding:10px 14px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center">
        <strong>${ent.name}</strong>
        <button id="npcChatClose" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">×</button>
      </div>
      <div id="npcChatLog" style="flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px"></div>
      <div style="display:flex;gap:6px;padding:8px;border-top:1px solid #333">
        <input id="npcChatInput" placeholder="Diga algo..." style="flex:1;background:#000;color:#fff;border:1px solid #444;border-radius:8px;padding:8px"/>
        <button id="npcChatSend" style="background:#39c5bb;border:none;color:#000;font-weight:700;padding:8px 14px;border-radius:8px;cursor:pointer">↑</button>
      </div>`;
    document.body.appendChild(wrap);
    document.getElementById("npcChatClose").onclick = () => { wrap.remove(); currentAudio?.pause(); currentAudio = null; };
    const input = document.getElementById("npcChatInput");
    const send = document.getElementById("npcChatSend");
    const log = document.getElementById("npcChatLog");
    function addBubble(role, text) {
      const div = document.createElement("div");
      div.style.cssText = `align-self:${role === "user" ? "flex-end" : "flex-start"};background:${role === "user" ? "#39c5bb" : "#222"};color:${role === "user" ? "#000" : "#fff"};padding:8px 12px;border-radius:14px;max-width:80%;white-space:pre-wrap`;
      div.textContent = text;
      log.appendChild(div); log.scrollTop = log.scrollHeight;
      return div;
    }
    async function doSend() {
      const t = input.value.trim();
      if (!t) return;
      input.value = "";
      addBubble("user", t);
      const thinking = addBubble("assistant", "…");
      try {
        const sb = SB();
        const { data, error } = await sb.functions.invoke("npc-chat", { body: { npc_id: npcId, text: t } });
        if (error) throw error;
        thinking.textContent = data.reply;
        // TTS
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
            currentAudio.play().catch(() => {});
          }
        } catch (e) { console.warn("tts fail", e); }
      } catch (e) {
        thinking.textContent = "(erro: " + (e?.message || e) + ")";
      }
    }
    send.onclick = doSend;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSend(); });
    input.focus();
  }

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
    const sb = SB();
    const panel = document.createElement("div");
    panel.id = "npcAdminPanel";
    panel.style.cssText = "position:fixed;top:60px;left:12px;width:380px;max-height:80vh;overflow-y:auto;background:#111e;backdrop-filter:blur(8px);border:1px solid #39c5bb;border-radius:12px;padding:14px;color:#fff;font:13px system-ui;z-index:9999";
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <strong>Painel NPCs</strong>
        <button id="npcAdminClose" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">×</button>
      </div>
      <div style="display:flex;gap:4px;margin-bottom:10px">
        <button data-tab="models" class="npc-tab" style="flex:1;padding:6px;background:#39c5bb;color:#000;border:none;border-radius:6px;cursor:pointer">Modelos</button>
        <button data-tab="routes" class="npc-tab" style="flex:1;padding:6px;background:#333;color:#fff;border:none;border-radius:6px;cursor:pointer">Rotas</button>
        <button data-tab="spawn" class="npc-tab" style="flex:1;padding:6px;background:#333;color:#fff;border:none;border-radius:6px;cursor:pointer">Spawn</button>
        <button data-tab="jobs" class="npc-tab" style="flex:1;padding:6px;background:#333;color:#fff;border:none;border-radius:6px;cursor:pointer">Empregos</button>
      </div>
      <div id="npcTabContent"></div>`;
    document.body.appendChild(panel);
    document.getElementById("npcAdminClose").onclick = () => panel.remove();
    panel.querySelectorAll(".npc-tab").forEach((b) => b.addEventListener("click", () => {
      panel.querySelectorAll(".npc-tab").forEach((x) => { x.style.background = "#333"; x.style.color = "#fff"; });
      b.style.background = "#39c5bb"; b.style.color = "#000";
      renderTab(b.dataset.tab);
    }));
    renderTab("models");
  }

  async function renderTab(name) {
    const sb = SB();
    const el = document.getElementById("npcTabContent");
    if (name === "models") {
      const { data: models } = await sb.from("npc_models").select("*").order("name");
      el.innerHTML = `
        <div style="margin-bottom:10px">
          <input type="file" id="npcGlbFile" accept=".glb,.fbx" multiple style="width:100%"/>
          <button id="npcUpload" style="margin-top:6px;width:100%;background:#39c5bb;color:#000;border:none;padding:8px;border-radius:6px;font-weight:700;cursor:pointer">Enviar modelos</button>
        </div>
        <div id="npcModelList"></div>`;
      const list = document.getElementById("npcModelList");
      (models || []).forEach((m) => {
        const row = document.createElement("div");
        row.style.cssText = "padding:6px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center";
        row.innerHTML = `<span>${m.name} <span style="opacity:.5">(${m.voice_id?.slice(0,8) || '—'})</span></span>
          <span><button data-id="${m.id}" class="npc-spawn-btn" style="background:#39c5bb;color:#000;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;margin-right:4px">+Spawn aqui</button>
          <button data-id="${m.id}" class="npc-del-btn" style="background:#c33;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer">×</button></span>`;
        list.appendChild(row);
      });
      list.querySelectorAll(".npc-del-btn").forEach((b) => b.onclick = async () => {
        if (!confirm("Excluir modelo?")) return;
        await sb.from("npc_models").delete().eq("id", b.dataset.id);
        renderTab("models");
      });
      list.querySelectorAll(".npc-spawn-btn").forEach((b) => b.onclick = async () => {
        const p = player(); if (!p) return alert("jogador não localizado");
        // cria rota com 1 waypoint na posição do jogador como spawn de teste
        const { data: route } = await sb.from("npc_routes").insert({ name: "Rota " + Date.now() }).select().single();
        await sb.from("npc_waypoints").insert([
          { route_id: route.id, seq: 0, x: p.position.x, z: p.position.z, y: p.position.y },
          { route_id: route.id, seq: 1, x: p.position.x + 8, z: p.position.z, y: p.position.y },
          { route_id: route.id, seq: 2, x: p.position.x + 8, z: p.position.z + 8, y: p.position.y },
          { route_id: route.id, seq: 3, x: p.position.x, z: p.position.z + 8, y: p.position.y },
        ]);
        await sb.from("npc_instances").insert({ model_id: b.dataset.id, route_id: route.id, display_name: "NPC " + Math.floor(Math.random()*999), active: true });
        alert("NPC criado! Pode levar 1-2s pra aparecer.");
      });
      document.getElementById("npcUpload").onclick = async () => {
        const files = document.getElementById("npcGlbFile").files;
        if (!files.length) return;
        for (const f of files) {
          const slug = f.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36);
          const path = `npcs/${slug}.${f.name.split(".").pop()}`;
          const { error: upErr } = await sb.storage.from("characters").upload(path, f, { upsert: true });
          if (upErr) { alert("upload erro: " + upErr.message); continue; }
          const { data: pub } = sb.storage.from("characters").getPublicUrl(path);
          await sb.from("npc_models").insert({ slug, name: f.name.replace(/\.[^.]+$/, ""), model_url: pub.publicUrl });
        }
        renderTab("models");
      };
    } else if (name === "routes") {
      const { data: routes } = await sb.from("npc_routes").select("*,npc_waypoints(count)").order("created_at", { ascending: false });
      el.innerHTML = `<p style="opacity:.7;margin:6px 0">Cada modelo recebe uma rota simples (quadrado) ao spawnar. Para editar pontos, use o SQL direto por enquanto. (Em breve: editor visual.)</p>
        <div>${(routes||[]).map(r => `<div style="padding:6px;border-bottom:1px solid #333;display:flex;justify-content:space-between">
          <span>${r.name} <span style="opacity:.5">(${r.npc_waypoints?.[0]?.count || 0} wps)</span></span>
          <button data-id="${r.id}" class="npc-route-del" style="background:#c33;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer">×</button>
        </div>`).join('')}</div>`;
      el.querySelectorAll(".npc-route-del").forEach((b) => b.onclick = async () => {
        if (!confirm("Excluir rota e NPCs ligados?")) return;
        await sb.from("npc_routes").delete().eq("id", b.dataset.id);
        renderTab("routes");
      });
    } else if (name === "spawn") {
      const { data: insts } = await sb.from("npc_instances").select("*,npc_models(name)").order("created_at", { ascending: false });
      el.innerHTML = `<p style="opacity:.7">NPCs ativos no mapa:</p>
        ${(insts||[]).map(i => `<div style="padding:6px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center">
          <span>${i.display_name} <small style="opacity:.6">(${i.npc_models?.name || '?'})</small></span>
          <span>
            <label style="margin-right:6px"><input type="checkbox" ${i.active?'checked':''} data-id="${i.id}" class="npc-act"/> ativo</label>
            <button data-id="${i.id}" class="npc-inst-del" style="background:#c33;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer">×</button>
          </span>
        </div>`).join('')}`;
      el.querySelectorAll(".npc-act").forEach((c) => c.onchange = async () => {
        await sb.from("npc_instances").update({ active: c.checked }).eq("id", c.dataset.id);
      });
      el.querySelectorAll(".npc-inst-del").forEach((b) => b.onclick = async () => {
        await sb.from("npc_instances").delete().eq("id", b.dataset.id);
        renderTab("spawn");
      });
    } else if (name === "jobs") {
      const { data: hubs } = await sb.from("delivery_hubs").select("*,delivery_destinations(count)").order("created_at", { ascending: false });
      el.innerHTML = `
        <button id="npcAddHub" style="width:100%;background:#39c5bb;color:#000;border:none;padding:8px;border-radius:6px;font-weight:700;cursor:pointer;margin-bottom:8px">+ Criar Hub na minha posição</button>
        ${(hubs||[]).map(h => `<div style="padding:6px;border-bottom:1px solid #333">
          <strong>${h.name}</strong> — ${h.delivery_destinations?.[0]?.count || 0} destinos<br/>
          <small style="opacity:.6">R$${(h.base_pay_cents/100).toFixed(2)} base + R$${(h.bonus_pay_cents/100).toFixed(2)} bônus</small><br/>
          <button data-id="${h.id}" class="npc-add-dest" style="background:#39c5bb;color:#000;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;margin-top:4px">+ Adicionar destino aqui</button>
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
  }
})();
