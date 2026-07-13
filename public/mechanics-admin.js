// Painel admin de Mecânicas — gatilho/condições/ações sem código.
(function () {
  const SB = () => window.__supabase || window.supabase;
  const LV = () => window.LV;

  const TRIGGERS = {
    zone_enter:        { label: "Entrar em zona",       fields: ["pos","radius"] },
    zone_exit:         { label: "Sair de zona",         fields: ["pos","radius"] },
    key_press:         { label: "Apertar tecla",        fields: ["key","prox_optional"] },
    proximity_to_npc:  { label: "Proximidade (zona)",   fields: ["pos","radius"] },
    proximity_to_asset:{ label: "Proximidade asset",    fields: ["pos","radius"] },
    interval:          { label: "A cada N segundos",    fields: ["seconds"] },
    vehicle_enter:     { label: "Ao entrar em carro",   fields: ["car_id_optional"] },
    vehicle_exit:      { label: "Ao sair do carro",     fields: ["car_id_optional"] },
    on_join_map:       { label: "Ao entrar no mapa",    fields: [] },
    on_emote:          { label: "Ao fazer emote/soco",  fields: ["emote_slot","npc_radius_optional"] },
    on_weapon_shot:    { label: "Ao atirar (arma)",     fields: [] },
    on_reload:         { label: "Ao recarregar",        fields: [] },
    on_npc_killed:     { label: "Ao matar NPC",         fields: [] },
    manual:            { label: "Manual (outra mecânica chama)", fields: [] },
  };

  const CONDITIONS = {
    has_item:        { label: "Tem item", fields: [["item_slug","Slug do item","text"]] },
    has_money:       { label: "Tem dinheiro", fields: [["cents","Centavos","num"]] },
    time_of_day:     { label: "Hora do dia", fields: [["from","De (HH:MM)","text"], ["to","Até","text"]] },
    is_admin:        { label: "É admin", fields: [] },
    inside_vehicle:  { label: "Dentro do carro", fields: [] },
    variable_equals: { label: "Variável = ", fields: [["key","Chave","text"], ["value","Valor","text"]] },
    variable_gte:    { label: "Variável ≥ ", fields: [["key","Chave","text"], ["value","Valor","num"]] },
    near_npc:        { label: "NPC por perto", fields: [["radius","Raio","num"], ["npc_id","NPC id (opcional)","text"]] },
  };

  const ACTIONS = {
    show_message:    { label: "Mostrar mensagem", fields: [["text","Texto","text"]] },
    play_sound:      { label: "Tocar som", fields: [["clip_id","Audio clip id","text"], ["volume","Volume 0..1","num"]] },
    play_animation:  { label: "Animação no player", fields: [["slug","Slug","text"], ["duration_ms","Duração ms","num"]] },
    give_item:       { label: "Dar item", fields: [["item_slug","Slug","text"]] },
    remove_item:     { label: "Remover item", fields: [["item_slug","Slug","text"]] },
    add_money:       { label: "Dar dinheiro (cents)", fields: [["cents","Centavos","num"]] },
    remove_money:    { label: "Cobrar dinheiro (cents)", fields: [["cents","Centavos","num"]] },
    teleport_player: { label: "Teleportar player", fields: [["x","X","num"],["y","Y","num"],["z","Z","num"]] },
    spawn_npc:       { label: "Spawn NPC", fields: [["model_id","Modelo id","text"],["x","X","num"],["y","Y","num"],["z","Z","num"],["lifetime_ms","Lifetime ms","num"]] },
    spawn_vehicle:   { label: "Spawn veículo", fields: [["car_id","Car id","text"],["x","X","num"],["y","Y","num"],["z","Z","num"]] },
    set_variable:    { label: "Definir variável", fields: [["key","Chave","text"],["value","Valor","text"]] },
    inc_variable:    { label: "Somar variável", fields: [["key","Chave","text"],["by","+","num"]] },
    trigger_mechanic:{ label: "Disparar outra mecânica", fields: [["mechanic_id","Mecânica id","text"]] },
    start_job:       { label: "Iniciar emprego", fields: [["job_id","Job id","text"]] },
    wait:            { label: "Aguardar (ms)", fields: [["ms","Tempo ms","num"]] },
    npc_play_animation: { label: "NPC: tocar animação", fields: [["anim","Animação (idle/walk/talk/…)","text"],["radius","Raio p/ escolher","num"],["npc_id","NPC id (opcional)","text"],["duration_ms","Duração ms","num"]] },
    give_weapon:     { label: "Dar arma ao jogador", fields: [["slug","Slug da arma","text"]] },
    damage_npc:      { label: "Dano em NPC", fields: [["damage","Dano","num"],["radius","Raio","num"],["npc_id","NPC id (opcional)","text"]] },
  };

  document.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.("#adminDockMechanics");
    if (!btn) return;
    ev.preventDefault(); ev.stopPropagation();
    try { openPanel(); } catch (e) { LV().toast("Erro: " + (e?.message || e), "error"); }
  }, true);
  window.openMechanicsAdmin = openPanel;

  async function openPanel() {
    const mapId = window.__currentMapId;
    if (!mapId) return LV().toast("Entre numa sala primeiro.", "error");
    const sb = SB();
    const m = LV().modal({
      title: "🧩 Mecânicas",
      large: true,
      foot: [
        { label: "+ Nova mecânica", primary: true, onClick: () => editMechanic(null, refresh) },
        { label: "Fechar", ghost: true, onClick: () => m.close() },
      ],
    });
    async function refresh() {
      m.body.innerHTML = "<div class='lv-empty'>Carregando…</div>";
      const { data, error } = await sb.from("mechanics").select("*").eq("map_id", mapId).order("created_at", { ascending: false });
      if (error) return m.body.innerHTML = "Erro: " + LV().esc(error.message);
      if (!data?.length) { m.body.innerHTML = "<div class='lv-empty'>Nenhuma mecânica. Clique em <b>+ Nova mecânica</b>.</div>"; return; }
      m.body.innerHTML = "";
      for (const mech of data) m.body.appendChild(mechCard(mech, refresh));
    }
    refresh();
  }

  function mechCard(mech, refresh) {
    const c = document.createElement("div"); c.className = "lv-card";
    const tk = TRIGGERS[mech.trigger?.kind]?.label || mech.trigger?.kind || "—";
    c.innerHTML = `
      <div class="lv-card-head">
        <div><strong>${LV().esc(mech.name)}</strong> <span class="lv-pill ${mech.active?'on':'off'}">${mech.active?'Ativa':'Inativa'}</span></div>
        <div style="opacity:.7;font-size:11px">${LV().esc(tk)} · ${mech.actions?.length||0} ações</div>
      </div>
      <div style="font-size:12px;opacity:.7">${LV().esc(mech.description || "")}</div>
      <div class="lv-row">
        <button class="lv-btn primary" data-a="edit">✏️ Editar</button>
        <button class="lv-btn" data-a="test">▶ Testar</button>
        <button class="lv-btn" data-a="toggle">${mech.active?'Desativar':'Ativar'}</button>
        <button class="lv-btn" data-a="copy">📋 Copiar id</button>
        <button class="lv-btn danger" data-a="del">Excluir</button>
      </div>`;
    c.querySelector('[data-a="edit"]').onclick = () => editMechanic(mech, refresh);
    c.querySelector('[data-a="test"]').onclick = () => { window.Mechanics?.fire(mech, {}); LV().toast("Disparada ▶", "ok"); };
    c.querySelector('[data-a="toggle"]').onclick = async () => { await SB().from("mechanics").update({ active: !mech.active }).eq("id", mech.id); refresh(); };
    c.querySelector('[data-a="copy"]').onclick = () => { navigator.clipboard.writeText(mech.id); LV().toast("ID copiado", "ok"); };
    c.querySelector('[data-a="del"]').onclick = () => LV().confirm("Excluir mecânica?", async () => { await SB().from("mechanics").delete().eq("id", mech.id); refresh(); });
    return c;
  }

  async function editMechanic(mech, after) {
    const isNew = !mech;
    const cur = mech || { name: "", description: "", active: true, trigger: { kind: "zone_enter", params: {} }, conditions: [], actions: [], cooldown_seconds: 0, per_player: true };
    const state = JSON.parse(JSON.stringify(cur));
    const m = LV().modal({
      title: isNew ? "+ Nova mecânica" : "✏️ " + cur.name,
      large: true,
      foot: [
        { label: "Cancelar", ghost: true, onClick: () => m.close() },
        { label: "Salvar", primary: true, onClick: save },
      ],
    });

    function render() {
      m.body.innerHTML = `
        <div class="lv-row">
          <div class="lv-field"><label>Nome</label><input id="me-name" type="text" value="${LV().esc(state.name)}"/></div>
          <div class="lv-field"><label>Cooldown (s)</label><input id="me-cd" type="number" value="${state.cooldown_seconds}"/></div>
        </div>
        <div class="lv-field"><label>Descrição</label><textarea id="me-desc">${LV().esc(state.description||"")}</textarea></div>

        <div class="lv-card">
          <div class="lv-card-head"><div><b>⚡ Gatilho</b></div></div>
          <div class="lv-field"><label>Tipo</label><select id="me-trig">${Object.entries(TRIGGERS).map(([k,v]) => `<option value="${k}" ${state.trigger?.kind===k?'selected':''}>${LV().esc(v.label)}</option>`).join("")}</select></div>
          <div id="me-trig-fields"></div>
        </div>

        <div class="lv-card">
          <div class="lv-card-head"><div><b>✅ Condições</b> <span style="opacity:.6">(todas devem ser verdade)</span></div>
            <button class="lv-btn" id="me-add-cond">+ Condição</button></div>
          <div id="me-conds"></div>
        </div>

        <div class="lv-card">
          <div class="lv-card-head"><div><b>🎬 Ações</b> <span style="opacity:.6">(em sequência)</span></div>
            <button class="lv-btn primary" id="me-add-act">+ Ação</button></div>
          <div id="me-acts"></div>
        </div>
      `;
      m.body.querySelector("#me-trig").onchange = (e) => { state.trigger = { kind: e.target.value, params: {} }; render(); };
      renderTriggerFields();
      renderConditions();
      renderActions();
      m.body.querySelector("#me-add-cond").onclick = () => { state.conditions.push({ kind: "is_admin", params: {} }); renderConditions(); };
      m.body.querySelector("#me-add-act").onclick = () => { state.actions.push({ kind: "show_message", params: { text: "Olá!" } }); renderActions(); };
    }

    function renderTriggerFields() {
      const host = m.body.querySelector("#me-trig-fields");
      const fields = TRIGGERS[state.trigger.kind]?.fields || [];
      const p = state.trigger.params || (state.trigger.params = {});
      let html = "";
      for (const f of fields) {
        if (f === "pos") html += `<div class="lv-row">
          <div class="lv-field"><label>X</label><input type="number" data-tp="x" value="${p.x ?? ''}"/></div>
          <div class="lv-field"><label>Y</label><input type="number" data-tp="y" value="${p.y ?? ''}"/></div>
          <div class="lv-field"><label>Z</label><input type="number" data-tp="z" value="${p.z ?? ''}"/></div>
          <button type="button" class="lv-btn" id="me-cappos">📍 Capturar</button>
        </div>`;
        else if (f === "radius") html += `<div class="lv-field"><label>Raio</label><input type="number" data-tp="radius" value="${p.radius ?? 5}"/></div>`;
        else if (f === "seconds") html += `<div class="lv-field"><label>Segundos</label><input type="number" data-tp="seconds" value="${p.seconds ?? 30}"/></div>`;
        else if (f === "key") html += `<div class="lv-field"><label>Tecla (ex.: e, b, 1)</label><input type="text" data-tp="key" value="${LV().esc(p.key||'')}"/></div>`;
        else if (f === "prox_optional") html += `<details><summary style="cursor:pointer">Proximidade exigida (opcional)</summary><div class="lv-row">
          <div class="lv-field"><label>X</label><input type="number" data-tpn="proximity.x" value="${p.proximity?.x ?? ''}"/></div>
          <div class="lv-field"><label>Z</label><input type="number" data-tpn="proximity.z" value="${p.proximity?.z ?? ''}"/></div>
          <div class="lv-field"><label>Raio</label><input type="number" data-tpn="proximity.r" value="${p.proximity?.r ?? 3}"/></div>
        </div></details>`;
        else if (f === "car_id_optional") html += `<div class="lv-field"><label>Car id (opcional)</label><input type="text" data-tp="car_id" value="${LV().esc(p.car_id||'')}"/></div>`;
        else if (f === "emote_slot") html += `<div class="lv-field"><label>Emote/soco</label><select data-tp="slot"><option value="">— qualquer —</option>${["kickWeak","kickStrong","wave","dance"].map(s=>`<option value="${s}" ${p.slot===s?'selected':''}>${s}</option>`).join("")}</select></div>`;
        else if (f === "npc_radius_optional") html += `<div class="lv-field"><label>Raio p/ exigir NPC próximo (0 = ignora)</label><input type="number" data-tp="npc_radius" value="${p.npc_radius ?? 0}"/></div>`;
      }
      host.innerHTML = html;
      host.querySelectorAll("[data-tp]").forEach(i => i.oninput = () => {
        const v = i.value === "" ? null : (i.type === "number" ? Number(i.value) : i.value);
        p[i.dataset.tp] = v;
      });
      host.querySelectorAll("[data-tpn]").forEach(i => i.oninput = () => {
        const [a,b] = i.dataset.tpn.split("."); p[a] ||= {};
        p[a][b] = i.value === "" ? null : (i.type === "number" ? Number(i.value) : i.value);
      });
      const cap = host.querySelector("#me-cappos");
      if (cap) cap.onclick = () => {
        const pl = window.__player; if (!pl) return LV().toast("Sem posição","error");
        p.x = +pl.position.x.toFixed(2); p.y = +pl.position.y.toFixed(2); p.z = +pl.position.z.toFixed(2);
        renderTriggerFields();
      };
    }

    function renderConditions() {
      const host = m.body.querySelector("#me-conds");
      host.innerHTML = "";
      state.conditions.forEach((c, idx) => host.appendChild(rowEditor(c, CONDITIONS, () => { state.conditions.splice(idx,1); renderConditions(); })));
    }
    function renderActions() {
      const host = m.body.querySelector("#me-acts");
      host.innerHTML = "";
      state.actions.forEach((a, idx) => host.appendChild(rowEditor(a, ACTIONS, () => { state.actions.splice(idx,1); renderActions(); }, idx, state.actions, renderActions)));
    }

    function rowEditor(item, registry, onDel, idx, arr, redraw) {
      const c = document.createElement("div"); c.className = "lv-card";
      const opts = Object.entries(registry).map(([k,v]) => `<option value="${k}" ${item.kind===k?'selected':''}>${LV().esc(v.label)}</option>`).join("");
      const fields = registry[item.kind]?.fields || [];
      const inner = fields.map(([k,label,type]) => {
        const v = item.params?.[k] ?? "";
        return `<div class="lv-field"><label>${LV().esc(label)}</label><input type="${type==='num'?'number':'text'}" data-fk="${k}" data-fn="${type==='num'?1:0}" value="${LV().esc(v)}"/></div>`;
      }).join("");
      const reorder = (arr && redraw) ? `<button class="lv-btn" data-mv="up">↑</button><button class="lv-btn" data-mv="dn">↓</button>` : "";
      c.innerHTML = `<div class="lv-card-head">
        <select data-kind>${opts}</select>
        <div>${reorder}<button class="lv-btn danger" data-del>×</button></div>
      </div>
      <div class="lv-row">${inner}</div>
      <details><summary style="cursor:pointer;font-size:11px;opacity:.6">delay (ms)</summary>
        <input type="number" data-delay value="${item.delay_ms || 0}" style="width:120px"/>
      </details>`;
      c.querySelector("[data-kind]").onchange = (e) => { item.kind = e.target.value; item.params = {}; if (redraw) redraw(); else renderConditions(); };
      c.querySelectorAll("[data-fk]").forEach(i => i.oninput = () => {
        const k = i.dataset.fk, isNum = i.dataset.fn === "1";
        item.params ||= {}; item.params[k] = i.value === "" ? null : (isNum ? Number(i.value) : i.value);
      });
      c.querySelector("[data-del]").onclick = onDel;
      const delayI = c.querySelector("[data-delay]");
      if (delayI) delayI.oninput = () => item.delay_ms = Number(delayI.value)||0;
      if (arr && redraw) {
        c.querySelector('[data-mv="up"]').onclick = () => { if (idx>0) { [arr[idx-1],arr[idx]]=[arr[idx],arr[idx-1]]; redraw(); } };
        c.querySelector('[data-mv="dn"]').onclick = () => { if (idx<arr.length-1) { [arr[idx+1],arr[idx]]=[arr[idx],arr[idx+1]]; redraw(); } };
      }
      return c;
    }

    async function save() {
      state.name = m.body.querySelector("#me-name").value.trim();
      state.description = m.body.querySelector("#me-desc").value;
      state.cooldown_seconds = Number(m.body.querySelector("#me-cd").value) || 0;
      if (!state.name) return LV().toast("Nome obrigatório", "error");
      try {
        const sb = SB();
        if (isNew) {
          const { data: { user } } = await sb.auth.getUser();
          const { error } = await sb.from("mechanics").insert({
            map_id: window.__currentMapId, name: state.name, description: state.description,
            trigger: state.trigger, conditions: state.conditions, actions: state.actions,
            cooldown_seconds: state.cooldown_seconds, per_player: state.per_player,
            created_by: user.id, active: state.active,
          });
          if (error) throw error;
        } else {
          const { error } = await sb.from("mechanics").update({
            name: state.name, description: state.description,
            trigger: state.trigger, conditions: state.conditions, actions: state.actions,
            cooldown_seconds: state.cooldown_seconds,
          }).eq("id", mech.id);
          if (error) throw error;
        }
        LV().toast("Salvo ✓", "ok"); m.close(); after && after();
      } catch (e) { LV().toast(e.message || String(e), "error"); }
    }
    render();
  }
})();
