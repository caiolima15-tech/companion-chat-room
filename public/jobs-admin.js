// Painel admin de empregos — abre via botão do escudo de admin.
(function () {
  const SB = () => window.__supabase || window.supabase;

  function openPanel() {
    if (document.getElementById("jobsAdminOverlay")) {
      document.getElementById("jobsAdminOverlay").hidden = false;
      return refreshList();
    }
    const ov = document.createElement("div");
    ov.id = "jobsAdminOverlay";
    ov.className = "users-admin-overlay";
    ov.innerHTML = `
      <div class="users-admin-modal" role="dialog" aria-label="Painel de empregos" style="max-width:980px">
        <div class="users-admin-head">
          <div class="users-admin-title">💼 Empregos / Missões</div>
          <button type="button" id="jobsAdminClose" class="users-admin-close">✕</button>
        </div>
        <div class="users-admin-toolbar">
          <button type="button" id="jobsCreateNew">+ Novo emprego</button>
          <button type="button" id="jobsRefresh">↻ Atualizar</button>
        </div>
        <div id="jobsAdminBody" class="users-admin-list" style="display:flex;gap:12px;flex-direction:column"></div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector("#jobsAdminClose").onclick = () => ov.hidden = true;
    ov.querySelector("#jobsRefresh").onclick = refreshList;
    ov.querySelector("#jobsCreateNew").onclick = createJob;
    refreshList();
  }

  async function refreshList() {
    const body = document.getElementById("jobsAdminBody");
    if (!body) return;
    body.innerHTML = "Carregando…";
    const sb = SB();
    if (!sb) { body.innerHTML = "<div class='users-admin-empty'>Backend ainda inicializando. Tente novamente em 2s.</div>"; return; }
    const mapId = window.__currentMapId;
    if (!mapId) { body.innerHTML = "<div class='users-admin-empty'>Entre numa sala primeiro para gerenciar empregos.</div>"; return; }
    try {
      const { data: jobs, error } = await sb.from("job_templates").select("*").eq("map_id", mapId).order("created_at", { ascending: false });
      if (error) throw error;
      if (!jobs?.length) { body.innerHTML = "<div class='users-admin-empty'>Nenhum emprego neste mapa. Clique em + Novo emprego.</div>"; return; }
      body.innerHTML = "";
      for (const j of jobs) body.appendChild(renderJobCard(j));
    } catch (e) {
      body.innerHTML = `<div class='users-admin-empty'>Erro ao carregar: ${escapeHtml(e?.message || String(e))}</div>`;
    }
  }

  function renderJobCard(j) {
    const card = document.createElement("div");
    card.className = "job-card";
    card.innerHTML = `
      <div class="job-card-head">
        <strong>${escapeHtml(j.title)}</strong>
        <span class="job-pill ${j.active?'on':'off'}">${j.active?'Ativo':'Inativo'}</span>
      </div>
      <div class="job-card-meta">R$ ${(j.payout_cents/100).toFixed(2).replace('.',',')} · cooldown ${j.cooldown_seconds}s</div>
      <div class="job-card-actions">
        <button data-act="edit">Editar</button>
        <button data-act="steps">Etapas</button>
        <button data-act="toggle">${j.active?'Desativar':'Ativar'}</button>
        <button data-act="delete" class="danger">Excluir</button>
      </div>`;
    card.querySelector('[data-act="edit"]').onclick = () => editJob(j);
    card.querySelector('[data-act="steps"]').onclick = () => openStepsEditor(j);
    card.querySelector('[data-act="toggle"]').onclick = async () => {
      await SB().from("job_templates").update({ active: !j.active }).eq("id", j.id);
      refreshList();
    };
    card.querySelector('[data-act="delete"]').onclick = async () => {
      if (!confirm("Excluir esse emprego e todas as etapas?")) return;
      await SB().from("job_templates").delete().eq("id", j.id);
      refreshList();
    };
    return card;
  }

  async function createJob() {
    const sb = SB();
    const title = prompt("Título do emprego:"); if (!title) return;
    const description = prompt("Mensagem do balão (ex: Olá! Posso te ajudar?):", "Olá! Posso te ajudar?") || "";
    const { data: { user } } = await sb.auth.getUser();
    const npcs = await loadGivers();
    const giverId = npcs.length ? promptSelect("Escolha o NPC dador:", npcs) : null;
    const anims = await loadAnims();
    let idleAnim = "idle";
    if (anims.length) {
      const chosen = promptSelect("Animação ociosa do NPC (idle, sit, lean…):", anims);
      if (chosen) idleAnim = chosen;
    }
    const { data, error } = await sb.from("job_templates").insert({
      map_id: window.__currentMapId, title, description, giver_npc_id: giverId,
      idle_animation: idleAnim, face_player_radius: 4,
      payout_cents: 500, xp_reward: 20, cooldown_seconds: 60, created_by: user.id,
    }).select().single();
    if (error) return alert(error.message);
    refreshList();
    openStepsEditor(data);
  }

  async function loadGivers() {
    const sb = SB();
    const { data: npcs } = await sb.from("npc_instances").select("id,name,model_id").eq("map_id", window.__currentMapId).eq("active", true);
    return (npcs || []).map(n => ({ id: n.id, label: n.name || n.id.slice(0, 8) }));
  }

  async function loadAnims() {
    const sb = SB();
    const { data } = await sb.from("npc_animations").select("slug,name").order("slug");
    const seen = new Set();
    const out = [];
    for (const a of data || []) {
      if (seen.has(a.slug)) continue;
      seen.add(a.slug);
      out.push({ id: a.slug, label: `${a.slug}${a.name ? ' — ' + a.name : ''}` });
    }
    return out;
  }

  function promptSelect(msg, opts) {
    const lines = opts.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
    const choice = parseInt(prompt(`${msg}\n${lines}\n\nDigite o número:`), 10);
    return opts[choice - 1]?.id || null;
  }

  async function editJob(j) {
    const title = prompt("Título:", j.title); if (title == null) return;
    const description = prompt("Mensagem do balão do NPC:", j.description || "") || "";
    const payout = parseInt(prompt("Pagamento (R$):", (j.payout_cents / 100).toFixed(2)) || "0", 10) * 100;
    const cooldown = parseInt(prompt("Cooldown (segundos):", String(j.cooldown_seconds)) || "0", 10);
    const xp = parseInt(prompt("XP de recompensa:", String(j.xp_reward)) || "0", 10);
    const npcs = await loadGivers();
    let giverId = j.giver_npc_id;
    if (npcs.length && confirm("Trocar NPC dador?")) giverId = promptSelect("NPC dador:", npcs);
    let idleAnim = j.idle_animation || "idle";
    if (confirm("Trocar animação ociosa do NPC?")) {
      const anims = await loadAnims();
      if (anims.length) {
        const chosen = promptSelect("Animação ociosa (idle, sit, lean…):", anims);
        if (chosen) idleAnim = chosen;
      } else {
        const v = prompt("Slug da animação:", idleAnim);
        if (v) idleAnim = v;
      }
    }
    await SB().from("job_templates").update({
      title, description, payout_cents: payout, cooldown_seconds: cooldown,
      xp_reward: xp, giver_npc_id: giverId, idle_animation: idleAnim,
    }).eq("id", j.id);
    refreshList();
  }

  async function openStepsEditor(j) {
    const sb = SB();
    const { data: steps } = await sb.from("job_steps").select("*").eq("job_id", j.id).order("created_at");
    const stepIds = (steps || []).map(s => s.id);
    let trs = [];
    if (stepIds.length) {
      const { data } = await sb.from("job_step_transitions").select("*").in("from_step_id", stepIds);
      trs = data || [];
    }

    let modal = document.getElementById("jobsStepsModal");
    if (modal) modal.remove();
    modal = document.createElement("div");
    modal.id = "jobsStepsModal";
    modal.className = "users-admin-overlay";
    modal.innerHTML = `
      <div class="users-admin-modal" style="max-width:760px">
        <div class="users-admin-head">
          <div class="users-admin-title">🧩 Etapas — ${escapeHtml(j.title)}</div>
          <button type="button" class="users-admin-close" id="stepsClose">✕</button>
        </div>
        <div class="users-admin-toolbar" style="flex-wrap:wrap;gap:6px">
          <button data-add="talk_to_giver">+ Falar com dador</button>
          <button data-add="pickup_item">+ Pegar item</button>
          <button data-add="deliver_item">+ Entregar</button>
          <button data-add="goto_point">+ Ir até ponto</button>
          <button data-add="talk_to_npc">+ Falar com NPC</button>
          <button data-add="interact_asset">+ Interagir asset</button>
          <button data-add="enter_vehicle">+ Entrar veículo</button>
          <button data-add="drive_to">+ Dirigir até</button>
          <button data-add="play_animation">+ Animação</button>
          <button data-add="complete">+ Concluir</button>
          <button data-add="fail">+ Falhar</button>
        </div>
        <div id="stepsList" class="users-admin-list" style="flex-direction:column;gap:8px"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector("#stepsClose").onclick = () => modal.remove();
    modal.querySelectorAll("[data-add]").forEach(b => {
      b.onclick = async () => {
        const kind = b.dataset.add;
        const { data: ns, error } = await sb.from("job_steps").insert({
          job_id: j.id, kind, label: stepLabel(kind), config: {}, dialogue: {},
        }).select().single();
        if (error) return alert(error.message);
        if (!j.start_step_id) {
          await sb.from("job_templates").update({ start_step_id: ns.id }).eq("id", j.id);
          j.start_step_id = ns.id;
        }
        openStepsEditor(j);
      };
    });

    const list = modal.querySelector("#stepsList");
    if (!steps?.length) {
      list.innerHTML = "<div class='users-admin-empty'>Adicione etapas usando os botões acima.</div>";
    } else {
      for (const s of steps) list.appendChild(renderStepRow(j, s, steps, trs));
    }
  }

  function stepLabel(k) {
    return ({
      talk_to_giver: "Falar com dador",
      pickup_item: "Pegar item",
      deliver_item: "Entregar no destino",
      goto_point: "Ir até o ponto",
      interact_asset: "Interagir com asset",
      talk_to_npc: "Falar com NPC",
      enter_vehicle: "Entrar no veículo",
      drive_to: "Dirigir até",
      play_animation: "Animação",
      complete: "✅ Concluir",
      fail: "❌ Falhar",
    })[k] || k;
  }

  function renderStepRow(j, s, allSteps, allTrs) {
    const row = document.createElement("div");
    row.className = "job-step-row";
    const isStart = j.start_step_id === s.id;
    const cfg = s.config || {};
    const cfgPreview = Object.keys(cfg).length ? JSON.stringify(cfg) : "(sem config)";
    const outgoing = allTrs.filter(t => t.from_step_id === s.id);

    row.innerHTML = `
      <div class="job-step-head">
        <strong>${isStart ? "▶ " : ""}${escapeHtml(s.label || stepLabel(s.kind))}</strong>
        <span class="job-step-kind">${s.kind}</span>
      </div>
      <div class="job-step-cfg">${escapeHtml(cfgPreview)}</div>
      <div class="job-step-transitions">${outgoing.map(t => {
        const tgt = allSteps.find(x => x.id === t.to_step_id);
        return `<span>${t.condition} → ${escapeHtml(tgt?.label || tgt?.kind || "?")}</span>`;
      }).join("") || "<span style='opacity:.5'>sem saídas</span>"}</div>
      <div class="job-step-actions">
        <button data-a="rename">Renomear</button>
        <button data-a="config">Configurar</button>
        <button data-a="dialogue">Falas</button>
        <button data-a="connect">+ Conexão</button>
        ${!isStart ? '<button data-a="start">Marcar início</button>' : ""}
        <button data-a="capture" title="Capturar posição do player">📍 Capturar pos</button>
        <button data-a="delete" class="danger">Excluir</button>
      </div>`;

    row.querySelector('[data-a="rename"]').onclick = async () => {
      const v = prompt("Rótulo:", s.label || ""); if (v == null) return;
      await SB().from("job_steps").update({ label: v }).eq("id", s.id);
      openStepsEditor(j);
    };
    row.querySelector('[data-a="config"]').onclick = () => editConfig(j, s);
    row.querySelector('[data-a="dialogue"]').onclick = () => editDialogue(j, s);
    row.querySelector('[data-a="connect"]').onclick = () => addTransition(j, s, allSteps);
    row.querySelector('[data-a="capture"]').onclick = () => captureCurrentPos(j, s);
    row.querySelector('[data-a="delete"]').onclick = async () => {
      if (!confirm("Excluir etapa?")) return;
      await SB().from("job_steps").delete().eq("id", s.id);
      openStepsEditor(j);
    };
    const startBtn = row.querySelector('[data-a="start"]');
    if (startBtn) startBtn.onclick = async () => {
      await SB().from("job_templates").update({ start_step_id: s.id }).eq("id", j.id);
      j.start_step_id = s.id;
      openStepsEditor(j);
    };
    return row;
  }

  async function editConfig(j, s) {
    const tips = ({
      pickup_item: "{ item_slug, spawn_x, spawn_y, spawn_z, radius }",
      deliver_item: "{ x, y, z, radius, item_slug }",
      goto_point: "{ x, y, z, radius, prompt_text }",
      drive_to: "{ x, y, z, radius }",
      enter_vehicle: "{ car_id }",
      interact_asset: "{ asset_interaction_id, animation_key }",
      talk_to_npc: "{ target_npc_id, radius }",
      play_animation: "{ animation_key, duration_ms }",
    })[s.kind] || "{}";
    const v = prompt(`Config JSON — ${tips}`, JSON.stringify(s.config || {}, null, 0));
    if (v == null) return;
    try {
      const parsed = JSON.parse(v);
      await SB().from("job_steps").update({ config: parsed }).eq("id", s.id);
      openStepsEditor(j);
    } catch (e) { alert("JSON inválido: " + e.message); }
  }

  async function editDialogue(j, s) {
    const cur = s.dialogue || {};
    const enter = prompt("Falas ao entrar (1 por linha):", (cur.on_enter || []).join("\n")) || "";
    const progress = prompt("Falas de progresso:", (cur.on_progress || []).join("\n")) || "";
    const complete = prompt("Falas ao concluir:", (cur.on_complete || []).join("\n")) || "";
    const newDlg = {
      on_enter: enter.split("\n").filter(Boolean),
      on_progress: progress.split("\n").filter(Boolean),
      on_complete: complete.split("\n").filter(Boolean),
    };
    await SB().from("job_steps").update({ dialogue: newDlg }).eq("id", s.id);
    openStepsEditor(j);
  }

  async function addTransition(j, s, allSteps) {
    const opts = allSteps.filter(x => x.id !== s.id).map(x => ({ id: x.id, label: `${x.label || x.kind}` }));
    if (!opts.length) return alert("Crie outra etapa primeiro.");
    const toId = promptSelect("Etapa destino:", opts);
    if (!toId) return;
    const condition = prompt("Condição (on_success, on_fail, on_choice:nome):", "on_success") || "on_success";
    await SB().from("job_step_transitions").insert({ from_step_id: s.id, to_step_id: toId, condition });
    openStepsEditor(j);
  }

  async function captureCurrentPos(j, s) {
    const p = window.__player;
    if (!p) return alert("Sem posição do player.");
    const cfg = { ...(s.config || {}) };
    if (s.kind === "pickup_item") {
      cfg.spawn_x = p.position.x; cfg.spawn_y = p.position.y; cfg.spawn_z = p.position.z;
    } else {
      cfg.x = p.position.x; cfg.y = p.position.y; cfg.z = p.position.z;
    }
    cfg.radius = cfg.radius || 3;
    await SB().from("job_steps").update({ config: cfg }).eq("id", s.id);
    openStepsEditor(j);
  }

  function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }

  // Expor globalmente p/ qualquer ponto do app abrir o painel
  window.openJobsAdmin = openPanel;

  // Delegação global: funciona mesmo se o botão for re-renderizado depois
  document.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.("#adminDockJobs");
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    try { openPanel(); }
    catch (e) { console.error("[jobs-admin] erro ao abrir painel:", e); alert("Erro ao abrir painel de empregos: " + (e?.message || e)); }
  }, true); // capture phase — roda antes do handler do #adminDock
})();
