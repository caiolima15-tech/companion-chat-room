// Painel admin de empregos — modais reais, sem prompt/alert, com formulários por etapa.
(function () {
  const SB = () => window.__supabase || window.supabase;
  const LV = () => window.LV;

  // ============ STEP KINDS metadata ============
  const STEP_KINDS = {
    talk_to_giver:           { label: "Falar com dador",        icon: "💬" },
    pickup_item:             { label: "Pegar item",             icon: "📦" },
    deliver_item:            { label: "Entregar no destino",    icon: "🎯" },
    goto_point:              { label: "Ir até ponto",           icon: "📍" },
    talk_to_npc:             { label: "Falar com NPC",          icon: "🧍" },
    interact_asset:          { label: "Interagir asset",        icon: "🎮" },
    enter_vehicle:           { label: "Entrar no veículo",      icon: "🚗" },
    drive_to:                { label: "Dirigir até",            icon: "🛣️" },
    park_vehicle:            { label: "Estacionar veículo",     icon: "🅿️" },
    deliver_to_spawned_npc:  { label: "Entregar a NPC (spawn)", icon: "🤝" },
    play_animation:          { label: "Animação",               icon: "🎬" },
    complete:                { label: "✅ Concluir",            icon: "✅" },
    fail:                    { label: "❌ Falhar",              icon: "❌" },
  };

  // ============ Boot — open via #adminDockJobs ============
  document.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.("#adminDockJobs");
    if (!btn) return;
    ev.preventDefault(); ev.stopPropagation();
    try { openPanel(); } catch (e) { console.error("[jobs-admin]", e); LV().toast("Erro: " + (e?.message || e), "error"); }
  }, true);
  window.openJobsAdmin = openPanel;

  // ============ Main panel ============
  async function openPanel() {
    const mapId = window.__currentMapId;
    if (!mapId) return LV().toast("Entre numa sala primeiro.", "error");
    const sb = SB();
    if (!sb) return LV().toast("Backend ainda iniciando…", "error");

    const m = LV().modal({
      title: "💼 Empregos / Missões",
      large: true,
      foot: [
        { label: "+ Novo emprego", primary: true, onClick: () => createJob(refresh) },
        { label: "📦 Itens (GLB)", onClick: () => openItemsModal() },
        { label: "Fechar", ghost: true, onClick: () => m.close() },
      ],
    });
    const body = m.body;
    async function refresh() {
      body.innerHTML = "<div class='lv-empty'>Carregando…</div>";
      try {
        const { data: jobs, error } = await sb.from("job_templates").select("*").eq("map_id", mapId).order("created_at", { ascending: false });
        if (error) throw error;
        if (!jobs?.length) { body.innerHTML = "<div class='lv-empty'>Nenhum emprego. Clique em <b>+ Novo emprego</b>.</div>"; return; }
        body.innerHTML = "";
        for (const j of jobs) body.appendChild(jobCard(j, refresh));
      } catch (e) {
        body.innerHTML = `<div class='lv-empty'>Erro: ${LV().esc(e?.message || e)}</div>`;
      }
    }
    refresh();
  }

  function jobCard(j, refresh) {
    const c = document.createElement("div");
    c.className = "lv-card";
    c.innerHTML = `
      <div class="lv-card-head">
        <div><strong>${LV().esc(j.title)}</strong> <span class="lv-pill ${j.active?'on':'off'}">${j.active?'Ativo':'Inativo'}</span></div>
        <div style="opacity:.7;font-size:11px">R$ ${(j.payout_cents/100).toFixed(2).replace('.',',')} · cooldown ${j.cooldown_seconds}s · XP ${j.xp_reward}</div>
      </div>
      <div class="lv-row">
        <button class="lv-btn" data-a="edit">✏️ Editar</button>
        <button class="lv-btn primary" data-a="steps">🧩 Etapas</button>
        <button class="lv-btn" data-a="toggle">${j.active?'Desativar':'Ativar'}</button>
        <button class="lv-btn danger" data-a="del">Excluir</button>
      </div>`;
    c.querySelector('[data-a="edit"]').onclick = () => editJob(j, refresh);
    c.querySelector('[data-a="steps"]').onclick = () => openSteps(j);
    c.querySelector('[data-a="toggle"]').onclick = async () => { await SB().from("job_templates").update({ active: !j.active }).eq("id", j.id); refresh(); };
    c.querySelector('[data-a="del"]').onclick = async () => {
      LV().confirm("Excluir esse emprego e todas as etapas?", async () => {
        await SB().from("job_templates").delete().eq("id", j.id); refresh();
      });
    };
    return c;
  }

  // ============ Create / Edit job form ============
  async function createJob(after) { openJobForm(null, after); }
  async function editJob(j, after) { openJobForm(j, after); }

  async function openJobForm(j, after) {
    const sb = SB();
    const isNew = !j;
    const [{ data: npcs }, { data: anims }] = await Promise.all([
      sb.from("npc_instances").select("id,name").eq("map_id", window.__currentMapId).eq("active", true),
      sb.from("npc_animations").select("slug,name"),
    ]);
    const seen = new Set();
    const animOpts = (anims || []).filter(a => seen.has(a.slug) ? false : (seen.add(a.slug), true));

    const m = LV().modal({
      title: isNew ? "+ Novo emprego" : "✏️ Editar emprego",
      foot: [
        { label: "Cancelar", ghost: true, onClick: () => m.close() },
        { label: "Salvar", primary: true, onClick: save },
      ],
    });

    const cur = j || { title: "", description: "Olá! Posso te ajudar?", giver_npc_id: null, idle_animation: "idle", payout_cents: 500, cooldown_seconds: 60, xp_reward: 20 };
    m.body.innerHTML = `
      <div class="lv-field"><label>Título</label><input type="text" id="jf-title" value="${LV().esc(cur.title)}"/></div>
      <div class="lv-field"><label>Mensagem do balão</label><textarea id="jf-desc">${LV().esc(cur.description||"")}</textarea></div>
      <div class="lv-row">
        <div class="lv-field">
          <label>NPC dador (no mapa)</label>
          <select id="jf-npc">
            <option value="">— Nenhum (auto ao aproximar) —</option>
            ${(npcs||[]).map(n => `<option value="${n.id}" ${n.id===cur.giver_npc_id?'selected':''}>${LV().esc(n.name || n.id.slice(0,8))}</option>`).join("")}
          </select>
        </div>
        <div class="lv-field">
          <label>Animação ociosa</label>
          <select id="jf-anim">
            ${animOpts.map(a => `<option value="${a.slug}" ${a.slug===cur.idle_animation?'selected':''}>${LV().esc(a.slug)}${a.name?' — '+LV().esc(a.name):''}</option>`).join("") || `<option value="idle">idle</option>`}
          </select>
        </div>
      </div>
      <div class="lv-row">
        <div class="lv-field"><label>Pagamento (R$)</label><input type="number" id="jf-pay" step="0.01" value="${(cur.payout_cents/100).toFixed(2)}"/></div>
        <div class="lv-field"><label>Cooldown (s)</label><input type="number" id="jf-cd" value="${cur.cooldown_seconds}"/></div>
        <div class="lv-field"><label>XP</label><input type="number" id="jf-xp" value="${cur.xp_reward}"/></div>
      </div>
      ${(npcs||[]).length === 0 ? `<div class='lv-empty'>⚠ Nenhum NPC ativo neste mapa. Crie um no painel <b>🧍 NPCs</b> e volte aqui.</div>` : ""}
    `;

    async function save() {
      const title = m.body.querySelector("#jf-title").value.trim();
      if (!title) return LV().toast("Informe o título.", "error");
      const payload = {
        title,
        description: m.body.querySelector("#jf-desc").value,
        giver_npc_id: m.body.querySelector("#jf-npc").value || null,
        idle_animation: m.body.querySelector("#jf-anim").value,
        payout_cents: Math.round(parseFloat(m.body.querySelector("#jf-pay").value || "0") * 100),
        cooldown_seconds: parseInt(m.body.querySelector("#jf-cd").value || "0", 10),
        xp_reward: parseInt(m.body.querySelector("#jf-xp").value || "0", 10),
      };
      try {
        if (isNew) {
          const { data: { user } } = await sb.auth.getUser();
          payload.map_id = window.__currentMapId;
          payload.created_by = user.id;
          const { data, error } = await sb.from("job_templates").insert(payload).select().single();
          if (error) throw error;
          LV().toast("Emprego criado ✓", "ok");
          m.close(); after && after();
          openSteps(data);
        } else {
          const { error } = await sb.from("job_templates").update(payload).eq("id", j.id);
          if (error) throw error;
          LV().toast("Salvo ✓", "ok");
          m.close(); after && after();
        }
      } catch (e) { LV().toast(e.message || String(e), "error"); }
    }
  }

  // ============ Steps editor ============
  async function openSteps(j) {
    const sb = SB();
    const m = LV().modal({
      title: `🧩 Etapas — ${j.title}`,
      large: true,
      foot: [{ label: "Fechar", ghost: true, onClick: () => m.close() }],
    });

    async function refresh() {
      const { data: steps } = await sb.from("job_steps").select("*").eq("job_id", j.id).order("created_at");
      const stepIds = (steps || []).map(s => s.id);
      let trs = [];
      if (stepIds.length) {
        const { data } = await sb.from("job_step_transitions").select("*").in("from_step_id", stepIds);
        trs = data || [];
      }
      m.body.innerHTML = "";

      // Toolbar add step
      const toolbar = document.createElement("div");
      toolbar.className = "lv-chip-row";
      toolbar.style.marginBottom = "8px";
      for (const [k, info] of Object.entries(STEP_KINDS)) {
        const b = document.createElement("button");
        b.className = "lv-chip"; b.textContent = `+ ${info.icon} ${info.label}`;
        b.onclick = async () => {
          const { data: ns, error } = await sb.from("job_steps").insert({ job_id: j.id, kind: k, label: info.label, config: {}, dialogue: {} }).select().single();
          if (error) return LV().toast(error.message, "error");
          if (!j.start_step_id) { await sb.from("job_templates").update({ start_step_id: ns.id }).eq("id", j.id); j.start_step_id = ns.id; }
          refresh();
        };
        toolbar.appendChild(b);
      }
      m.body.appendChild(toolbar);

      if (!steps?.length) {
        const e = document.createElement("div"); e.className = "lv-empty";
        e.innerHTML = "Adicione etapas com os botões acima. A primeira vira o <b>início</b> automaticamente.";
        m.body.appendChild(e); return;
      }
      for (const s of steps) m.body.appendChild(stepCard(j, s, steps, trs, refresh));
    }
    refresh();
  }

  function stepCard(j, s, allSteps, trs, refresh) {
    const sb = SB();
    const c = document.createElement("div");
    c.className = "lv-card";
    const info = STEP_KINDS[s.kind] || { label: s.kind, icon: "•" };
    const isStart = j.start_step_id === s.id;
    const outs = trs.filter(t => t.from_step_id === s.id);
    c.innerHTML = `
      <div class="lv-card-head">
        <div>${isStart ? '▶ ' : ''}${info.icon} <strong>${LV().esc(s.label || info.label)}</strong> <span class="lv-pill">${s.kind}</span></div>
      </div>
      <div style="font-size:11px;opacity:.7">${outs.map(t => {
        const tgt = allSteps.find(x => x.id === t.to_step_id);
        return `${t.condition} → ${LV().esc(tgt?.label || tgt?.kind || '?')}`;
      }).join(" · ") || '<i>sem saídas</i>'}</div>
      <div class="lv-row">
        <button class="lv-btn" data-a="conf">⚙️ Configurar</button>
        <button class="lv-btn" data-a="dlg">💬 Falas</button>
        <button class="lv-btn" data-a="conn">🔗 Conexões</button>
        ${!isStart ? '<button class="lv-btn" data-a="start">▶ Marcar início</button>' : ''}
        <button class="lv-btn" data-a="rename">Renomear</button>
        <button class="lv-btn danger" data-a="del">Excluir</button>
      </div>
    `;
    c.querySelector('[data-a="conf"]').onclick = () => editStepConfig(j, s, refresh);
    c.querySelector('[data-a="dlg"]').onclick = () => editStepDialogue(s, refresh);
    c.querySelector('[data-a="conn"]').onclick = () => editConnections(s, allSteps, refresh);
    c.querySelector('[data-a="rename"]').onclick = () => LV().promptText("Rótulo:", s.label || "", async v => { if (v == null) return; await sb.from("job_steps").update({ label: v }).eq("id", s.id); refresh(); });
    c.querySelector('[data-a="del"]').onclick = () => LV().confirm("Excluir etapa?", async () => { await sb.from("job_steps").delete().eq("id", s.id); refresh(); });
    const sb_btn = c.querySelector('[data-a="start"]');
    if (sb_btn) sb_btn.onclick = async () => { await sb.from("job_templates").update({ start_step_id: s.id }).eq("id", j.id); j.start_step_id = s.id; refresh(); };
    return c;
  }

  // ============ Per-kind step config form ============
  async function editStepConfig(j, s, after) {
    const sb = SB();
    const cfg = { ...(s.config || {}) };
    const m = LV().modal({
      title: `⚙️ ${STEP_KINDS[s.kind]?.label || s.kind}`,
      foot: [
        { label: "Cancelar", ghost: true, onClick: () => m.close() },
        { label: "Salvar", primary: true, onClick: save },
      ],
    });
    const body = m.body;
    body.innerHTML = "<div class='lv-empty'>Carregando…</div>";

    // Load common pickers
    const [items, cars, npcInstances, npcModels, anims, interactions] = await Promise.all([
      sb.from("item_catalog").select("id,slug,name").then(r => r.data || []),
      sb.from("map_cars").select("id,name").eq("map_id", window.__currentMapId).then(r => r.data || []),
      sb.from("npc_instances").select("id,name").eq("map_id", window.__currentMapId).eq("active", true).then(r => r.data || []),
      sb.from("npc_models").select("id,name").then(r => r.data || []),
      sb.from("npc_animations").select("slug,name").then(r => r.data || []),
      sb.from("map_asset_interactions").select("id,name").eq("map_id", window.__currentMapId).then(r => r.data || []),
    ]);
    const animSlugs = []; const seen = new Set();
    for (const a of anims) if (!seen.has(a.slug)) { seen.add(a.slug); animSlugs.push(a); }

    const html = [];
    const captureBtn = `<button class="lv-btn" type="button" id="capPos">📍 Capturar minha posição</button>`;

    function num(id, label, val, step) { return `<div class="lv-field"><label>${label}</label><input type="number" step="${step||'any'}" id="${id}" value="${val ?? ''}"/></div>`; }
    function txt(id, label, val) { return `<div class="lv-field"><label>${label}</label><input type="text" id="${id}" value="${LV().esc(val||'')}"/></div>`; }
    function sel(id, label, opts, val, allowEmpty) {
      return `<div class="lv-field"><label>${label}</label><select id="${id}">${allowEmpty?'<option value="">— —</option>':''}${opts.map(o => `<option value="${o.v}" ${o.v===val?'selected':''}>${LV().esc(o.t)}</option>`).join('')}</select></div>`;
    }
    function chk(id, label, val) { return `<label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="${id}" ${val?'checked':''}/> ${label}</label>`; }

    const k = s.kind;
    if (k === "pickup_item") {
      html.push(sel("f-item", "Item", items.map(i => ({ v: i.slug, t: i.name + ' ('+i.slug+')' })), cfg.item_slug));
      html.push(`<div class="lv-row">${num("f-x","X",cfg.spawn_x)}${num("f-y","Y",cfg.spawn_y)}${num("f-z","Z",cfg.spawn_z)}</div>`);
      html.push(num("f-r","Raio",cfg.radius ?? 3));
      html.push(`<div>${captureBtn}</div>`);
    } else if (k === "deliver_item") {
      html.push(sel("f-item", "Item esperado", items.map(i => ({ v: i.slug, t: i.name })), cfg.item_slug, true));
      html.push(`<div class="lv-row">${num("f-x","X",cfg.x)}${num("f-y","Y",cfg.y)}${num("f-z","Z",cfg.z)}</div>`);
      html.push(num("f-r","Raio",cfg.radius ?? 3));
      html.push(`<div>${captureBtn}</div>`);
    } else if (k === "goto_point") {
      html.push(`<div class="lv-row">${num("f-x","X",cfg.x)}${num("f-y","Y",cfg.y)}${num("f-z","Z",cfg.z)}</div>`);
      html.push(num("f-r","Raio",cfg.radius ?? 3));
      html.push(txt("f-prompt","Texto do prompt (opcional)", cfg.prompt_text));
      html.push(`<div>${captureBtn}</div>`);
    } else if (k === "enter_vehicle") {
      html.push(sel("f-car", "Carro (vinculado ao mapa)", cars.map(c => ({ v: c.id, t: c.name || c.id.slice(0,8) })), cfg.car_id, true));
    } else if (k === "drive_to") {
      html.push(sel("f-car", "Carro", cars.map(c => ({ v: c.id, t: c.name || c.id.slice(0,8) })), cfg.car_id, true));
      html.push(`<div class="lv-row">${num("f-x","X",cfg.x)}${num("f-y","Y",cfg.y)}${num("f-z","Z",cfg.z)}</div>`);
      html.push(num("f-r","Raio",cfg.radius ?? 5));
      html.push(`<div>${captureBtn}</div>`);
    } else if (k === "park_vehicle") {
      html.push(sel("f-car", "Carro", cars.map(c => ({ v: c.id, t: c.name || c.id.slice(0,8) })), cfg.car_id, true));
      html.push(`<div class="lv-row">${num("f-x","X",cfg.x)}${num("f-y","Y",cfg.y)}${num("f-z","Z",cfg.z)}</div>`);
      html.push(num("f-r","Raio",cfg.radius ?? 4));
      html.push(chk("f-desp", "Veículo some ao concluir", cfg.despawn_on_complete));
      html.push(`<div>${captureBtn}</div>`);
    } else if (k === "talk_to_npc") {
      html.push(sel("f-npc", "NPC", npcInstances.map(n => ({ v: n.id, t: n.name || n.id.slice(0,8) })), cfg.target_npc_id, true));
      html.push(num("f-r","Raio",cfg.radius ?? 3));
    } else if (k === "deliver_to_spawned_npc") {
      html.push(sel("f-model", "Modelo do NPC a aparecer", npcModels.map(n => ({ v: n.id, t: n.name })), cfg.model_id, true));
      html.push(num("f-radspawn","Raio de spawn aleatório", cfg.spawn_random_in_radius ?? 80));
      html.push(num("f-r","Raio de entrega", cfg.radius ?? 3));
      html.push(chk("f-walkaway","NPC anda embora após receber", cfg.walk_away_after_deliver !== false));
      html.push(num("f-walkd","Distância da caminhada (m)", cfg.walk_distance ?? 8));
    } else if (k === "interact_asset") {
      html.push(sel("f-int", "Interação", interactions.map(i => ({ v: i.id, t: i.name })), cfg.asset_interaction_id, true));
      html.push(sel("f-anim", "Animação", animSlugs.map(a => ({ v: a.slug, t: a.slug })), cfg.animation_key, true));
    } else if (k === "play_animation") {
      html.push(sel("f-anim", "Animação", animSlugs.map(a => ({ v: a.slug, t: a.slug })), cfg.animation_key, true));
      html.push(num("f-dur","Duração (ms)", cfg.duration_ms ?? 3000));
    } else if (k === "talk_to_giver" || k === "complete" || k === "fail") {
      html.push("<div class='lv-empty'>Esta etapa não precisa de configuração extra. Use a aba <b>Falas</b> para diálogo.</div>");
    } else {
      html.push("<div class='lv-empty'>Tipo sem formulário, edite via JSON.</div>");
    }

    html.push(`<details style="margin-top:8px"><summary style="cursor:pointer;opacity:.7">Avançado (JSON)</summary><textarea id="f-json" style="width:100%;min-height:100px;margin-top:6px">${LV().esc(JSON.stringify(cfg, null, 2))}</textarea></details>`);
    body.innerHTML = html.join("");

    const capBtn = body.querySelector("#capPos");
    if (capBtn) capBtn.onclick = () => {
      const p = window.__player; if (!p) return LV().toast("Sem posição", "error");
      const useSpawn = k === "pickup_item";
      const fx = useSpawn ? "f-x" : "f-x";
      body.querySelector("#" + (useSpawn ? "f-x" : "f-x")).value = p.position.x.toFixed(2);
      body.querySelector("#" + (useSpawn ? "f-y" : "f-y")).value = p.position.y.toFixed(2);
      body.querySelector("#" + (useSpawn ? "f-z" : "f-z")).value = p.position.z.toFixed(2);
      LV().toast("Posição capturada ✓", "ok");
    };

    async function save() {
      const newCfg = {};
      try {
        const adv = body.querySelector("#f-json")?.value;
        if (adv) Object.assign(newCfg, JSON.parse(adv));
      } catch (e) { return LV().toast("JSON inválido: " + e.message, "error"); }

      function gv(id, isNum) { const el = body.querySelector("#"+id); if (!el) return undefined; if (el.type === "checkbox") return el.checked; const v = el.value; if (v === "") return null; return isNum ? Number(v) : v; }
      const map = {
        pickup_item: { item_slug: ["f-item"], spawn_x:["f-x",1], spawn_y:["f-y",1], spawn_z:["f-z",1], radius:["f-r",1] },
        deliver_item: { item_slug: ["f-item"], x:["f-x",1], y:["f-y",1], z:["f-z",1], radius:["f-r",1] },
        goto_point: { x:["f-x",1], y:["f-y",1], z:["f-z",1], radius:["f-r",1], prompt_text:["f-prompt"] },
        enter_vehicle: { car_id:["f-car"] },
        drive_to: { car_id:["f-car"], x:["f-x",1], y:["f-y",1], z:["f-z",1], radius:["f-r",1] },
        park_vehicle: { car_id:["f-car"], x:["f-x",1], y:["f-y",1], z:["f-z",1], radius:["f-r",1], despawn_on_complete:["f-desp"] },
        talk_to_npc: { target_npc_id:["f-npc"], radius:["f-r",1] },
        deliver_to_spawned_npc: { model_id:["f-model"], spawn_random_in_radius:["f-radspawn",1], radius:["f-r",1], walk_away_after_deliver:["f-walkaway"], walk_distance:["f-walkd",1] },
        interact_asset: { asset_interaction_id:["f-int"], animation_key:["f-anim"] },
        play_animation: { animation_key:["f-anim"], duration_ms:["f-dur",1] },
      }[k];
      if (map) for (const [field, [id, isNum]] of Object.entries(map)) { const v = gv(id, isNum); if (v !== undefined) newCfg[field] = v; }

      const { error } = await sb.from("job_steps").update({ config: newCfg }).eq("id", s.id);
      if (error) return LV().toast(error.message, "error");
      LV().toast("Salvo ✓", "ok"); m.close(); after && after();
    }
  }

  async function editStepDialogue(s, after) {
    const cur = s.dialogue || {};
    const m = LV().modal({
      title: "💬 Falas",
      foot: [
        { label: "Cancelar", ghost: true, onClick: () => m.close() },
        { label: "Salvar", primary: true, onClick: save },
      ],
    });
    m.body.innerHTML = `
      <div class="lv-field"><label>Ao iniciar (1 por linha)</label><textarea id="d-enter">${LV().esc((cur.on_enter||[]).join("\n"))}</textarea></div>
      <div class="lv-field"><label>Em progresso</label><textarea id="d-prog">${LV().esc((cur.on_progress||[]).join("\n"))}</textarea></div>
      <div class="lv-field"><label>Ao concluir</label><textarea id="d-done">${LV().esc((cur.on_complete||[]).join("\n"))}</textarea></div>
    `;
    async function save() {
      const split = id => m.body.querySelector("#"+id).value.split("\n").map(s=>s.trim()).filter(Boolean);
      const dlg = { on_enter: split("d-enter"), on_progress: split("d-prog"), on_complete: split("d-done") };
      const { error } = await SB().from("job_steps").update({ dialogue: dlg }).eq("id", s.id);
      if (error) return LV().toast(error.message, "error");
      LV().toast("Salvo ✓", "ok"); m.close(); after && after();
    }
  }

  async function editConnections(s, allSteps, after) {
    const sb = SB();
    const { data: trs } = await sb.from("job_step_transitions").select("*").eq("from_step_id", s.id);
    const m = LV().modal({
      title: "🔗 Conexões a partir de: " + (s.label || s.kind),
      foot: [{ label: "Fechar", ghost: true, onClick: () => { m.close(); after && after(); } }],
    });
    function render() {
      const list = (trs || []).map((t, i) => {
        const tgt = allSteps.find(x => x.id === t.to_step_id);
        return `<div class="lv-card" data-i="${i}"><div class="lv-card-head"><div><b>${t.condition}</b> → ${LV().esc(tgt?.label || tgt?.kind || '?')}</div><button class="lv-btn danger" data-del="${t.id}">×</button></div></div>`;
      }).join("");
      m.body.innerHTML = `
        ${list || "<div class='lv-empty'>Sem conexões.</div>"}
        <div class="lv-card">
          <div class="lv-row">
            <div class="lv-field"><label>Condição</label><select id="c-cond"><option>on_success</option><option>on_fail</option></select></div>
            <div class="lv-field"><label>Etapa destino</label><select id="c-to">${allSteps.filter(x=>x.id!==s.id).map(x=>`<option value="${x.id}">${LV().esc(x.label||x.kind)}</option>`).join("")}</select></div>
          </div>
          <button class="lv-btn primary" id="c-add">+ Adicionar conexão</button>
        </div>`;
      m.body.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
        await sb.from("job_step_transitions").delete().eq("id", b.dataset.del);
        const { data } = await sb.from("job_step_transitions").select("*").eq("from_step_id", s.id); trs.length = 0; trs.push(...(data||[])); render();
      });
      m.body.querySelector("#c-add").onclick = async () => {
        const cond = m.body.querySelector("#c-cond").value;
        const to = m.body.querySelector("#c-to").value;
        if (!to) return;
        const { error } = await sb.from("job_step_transitions").insert({ from_step_id: s.id, to_step_id: to, condition: cond });
        if (error) return LV().toast(error.message, "error");
        const { data } = await sb.from("job_step_transitions").select("*").eq("from_step_id", s.id); trs.length = 0; trs.push(...(data||[])); render();
      };
    }
    render();
  }

  // ============ Items quick upload (GLB) ============
  async function openItemsModal() {
    const sb = SB();
    const m = LV().modal({
      title: "📦 Itens — biblioteca",
      foot: [{ label: "Fechar", ghost: true, onClick: () => m.close() }],
    });
    async function refresh() {
      m.body.innerHTML = "<div class='lv-empty'>Carregando…</div>";
      const { data: items } = await sb.from("item_catalog").select("*").order("name");
      m.body.innerHTML = "";
      // upload block
      const up = document.createElement("div");
      up.className = "lv-card";
      up.innerHTML = `
        <div><b>+ Novo item (GLB)</b></div>
        <div class="lv-row">
          <div class="lv-field"><label>Nome</label><input type="text" id="up-name"/></div>
          <div class="lv-field"><label>Slug (opcional)</label><input type="text" id="up-slug" placeholder="ex.: caixa_correios"/></div>
        </div>
        <div class="lv-field"><label>Arquivo .glb</label><input type="file" id="up-file" accept=".glb"/></div>
        <button class="lv-btn primary" id="up-go">Enviar</button>
        <div id="up-status" style="opacity:.7;font-size:12px"></div>`;
      m.body.appendChild(up);
      up.querySelector("#up-go").onclick = async () => {
        const file = up.querySelector("#up-file").files[0];
        const name = up.querySelector("#up-name").value.trim() || file?.name?.replace(/\.glb$/i,'');
        let slug = (up.querySelector("#up-slug").value.trim() || name || '').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');
        const status = up.querySelector("#up-status");
        if (!file) return LV().toast("Escolha um .glb", "error");
        if (!slug) return LV().toast("Informe um slug válido", "error");
        status.textContent = "Enviando…";
        try {
          const path = "items/" + slug + "-" + Date.now() + ".glb";
          const { error: upErr } = await sb.storage.from("map-assets").upload(path, file, { contentType: "model/gltf-binary", upsert: false });
          if (upErr) throw upErr;
          const { data: pub } = sb.storage.from("map-assets").getPublicUrl(path);
          const { data: { user } } = await sb.auth.getUser();
          const { error } = await sb.from("item_catalog").insert({ slug, name, glb_url: pub.publicUrl, created_by: user.id });
          if (error) throw error;
          LV().toast("Item cadastrado ✓", "ok"); refresh();
        } catch (e) { status.textContent = "Erro: " + (e?.message || e); LV().toast(e.message || String(e), "error"); }
      };
      // list
      for (const it of items || []) {
        const c = document.createElement("div"); c.className = "lv-card";
        c.innerHTML = `<div class="lv-card-head"><div><b>${LV().esc(it.name)}</b> <span class="lv-pill">${LV().esc(it.slug)}</span></div>
          <button class="lv-btn danger" data-del="${it.id}">Excluir</button></div>`;
        c.querySelector("[data-del]").onclick = () => LV().confirm("Excluir item?", async () => {
          await sb.from("item_catalog").delete().eq("id", it.id); refresh();
        });
        m.body.appendChild(c);
      }
    }
    refresh();
  }
})();
