// Painel admin de Armas — cria/edita catálogo, uploads GLB/ícone/SFX, dá para o player.
(function () {
  const SB = () => window.__supabase || window.supabase;
  const LV = () => window.LV;

  document.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.("#adminDockWeapons");
    if (!btn) return;
    ev.preventDefault(); ev.stopPropagation();
    try { openPanel(); } catch (e) { LV()?.toast?.("Erro: " + (e?.message || e), "error"); }
  }, true);
  window.openWeaponsAdmin = openPanel;

  async function openPanel() {
    const sb = SB();
    const m = LV().modal({
      title: "⚔ Armas",
      large: true,
      foot: [
        { label: "+ Nova arma", primary: true, onClick: () => editWeapon(null, refresh) },
        { label: "Fechar", ghost: true, onClick: () => m.close() },
      ],
    });
    async function refresh() {
      m.body.innerHTML = "<div class='lv-empty'>Carregando…</div>";
      const { data, error } = await sb.from("weapons").select("*").order("wheel_slot");
      if (error) return m.body.innerHTML = "Erro: " + LV().esc(error.message);
      if (!data?.length) { m.body.innerHTML = "<div class='lv-empty'>Nenhuma arma. Clique em <b>+ Nova arma</b>.</div>"; return; }
      m.body.innerHTML = "";
      for (const w of data) m.body.appendChild(card(w, refresh));
    }
    refresh();
  }

  function card(w, refresh) {
    const el = document.createElement("div");
    el.className = "lv-card";
    el.innerHTML = `<div style="display:flex;gap:10px;align-items:center;padding:8px">
      <div style="width:44px;height:44px;background:#0008;border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden">
        ${w.icon_url ? `<img src="${w.icon_url}" style="max-width:100%;max-height:100%"/>` : "🔫"}
      </div>
      <div style="flex:1">
        <div style="font-weight:600">${LV().esc(w.name)} <span style="opacity:.6;font-weight:400">· slot ${w.wheel_slot} · ${w.kind}</span></div>
        <div style="opacity:.7;font-size:12px">dano ${w.damage} · pente ${w.mag_size} · reserva ${w.reserve_start} · alcance ${w.range_m}m</div>
      </div>
      <button data-a="give"  class="lv-btn">Dar ao jogador</button>
      <button data-a="edit"  class="lv-btn">Editar</button>
      <button data-a="del"   class="lv-btn lv-danger">Excluir</button>
    </div>`;
    el.querySelector('[data-a="give"]').onclick = async () => {
      await window.giveWeaponToPlayer?.(w.slug);
      await window.__weaponsReload?.();
    };
    el.querySelector('[data-a="edit"]').onclick = () => editWeapon(w, refresh);
    el.querySelector('[data-a="del"]').onclick = async () => {
      if (!confirm("Excluir " + w.name + "?")) return;
      await SB().from("weapons").delete().eq("id", w.id);
      refresh();
    };
    return el;
  }

  function editWeapon(row, done) {
    const isNew = !row;
    const w = row || {
      slug: "", name: "", kind: "firearm", wheel_slot: 1,
      damage: 25, range_m: 40, fire_rate_ms: 350, mag_size: 12, reserve_start: 60, reload_ms: 1800, spread: 0.03,
      anim_shoot: "wave", anim_reload: "wave", anim_idle: "idle",
      icon_url: "", model_url: "",
      sfx_shoot: null, sfx_reload: null, sfx_empty: null, sfx_impact: null,
      active: true,
      anim_pack: "",
      hand_bone: "mixamorigRightHand",
      hand_offset: { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, scale: 1 },
    };
    const ho = w.hand_offset || { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, scale: 1 };
    const m = LV().modal({
      title: isNew ? "Nova arma" : ("Editar: " + w.name),
      large: true,
      foot: [
        { label: "Salvar", primary: true, onClick: save },
        { label: "Cancelar", ghost: true, onClick: () => m.close() },
      ],
    });
    m.body.innerHTML = `
      <div class="lv-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label>Slug<input id="wSlug" value="${LV().esc(w.slug)}" placeholder="pistol"/></label>
        <label>Nome<input id="wName" value="${LV().esc(w.name)}" placeholder="Pistola"/></label>
        <label>Tipo
          <select id="wKind">
            <option value="firearm" ${w.kind==="firearm"?"selected":""}>Arma de fogo</option>
            <option value="melee" ${w.kind==="melee"?"selected":""}>Corpo a corpo</option>
          </select>
        </label>
        <label>Slot da roda (0..7)<input id="wSlot" type="number" min="0" max="7" value="${w.wheel_slot}"/></label>
        <label>Dano<input id="wDmg" type="number" value="${w.damage}"/></label>
        <label>Alcance (m)<input id="wRange" type="number" step="0.1" value="${w.range_m}"/></label>
        <label>Cadência (ms)<input id="wRate" type="number" value="${w.fire_rate_ms}"/></label>
        <label>Pente<input id="wMag" type="number" value="${w.mag_size}"/></label>
        <label>Reserva inicial<input id="wRes" type="number" value="${w.reserve_start}"/></label>
        <label>Recarga (ms)<input id="wReload" type="number" value="${w.reload_ms}"/></label>
        <label>Dispersão<input id="wSpread" type="number" step="0.005" value="${w.spread}"/></label>
        <label>Anim tiro (fallback)<input id="wAnimShoot" value="${LV().esc(w.anim_shoot||'')}" placeholder="wave"/></label>
        <label>Anim recarga (fallback)<input id="wAnimReload" value="${LV().esc(w.anim_reload||'')}" placeholder="wave"/></label>
        <label>Ícone (URL)<input id="wIcon" value="${LV().esc(w.icon_url||'')}" placeholder="https://…"/></label>
        <label>Modelo GLB (URL)<input id="wModel" value="${LV().esc(w.model_url||'')}"/></label>
      </div>

      <fieldset style="margin-top:14px;border:1px solid #333;padding:10px;border-radius:8px">
        <legend>🎬 Pack de animação de locomoção</legend>
        <div class="lv-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label>Pack
            <select id="wPack">
              <option value="" ${!w.anim_pack?"selected":""}>Nenhum (usa animação padrão)</option>
              <option value="pistol" ${w.anim_pack==="pistol"?"selected":""}>Pistola (8 clips)</option>
              <option value="rifle" ${w.anim_pack==="rifle"?"selected":""}>Rifle / AK (15 clips)</option>
            </select>
          </label>
          <label>Bone da mão<input id="wBone" value="${LV().esc(w.hand_bone||'mixamorigRightHand')}"/></label>
        </div>
        <div style="font-size:12px;opacity:.7;margin-top:6px">O pack só toca em avatares com esqueleto compatível (RPM/Mixamo).</div>
      </fieldset>

      <fieldset style="margin-top:10px;border:1px solid #333;padding:10px;border-radius:8px">
        <legend>🖐 Offset visual da arma na mão</legend>
        <div class="lv-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
          <label>Pos X<input id="hoPx" type="number" step="0.005" value="${ho.px ?? 0}"/></label>
          <label>Pos Y<input id="hoPy" type="number" step="0.005" value="${ho.py ?? 0}"/></label>
          <label>Pos Z<input id="hoPz" type="number" step="0.005" value="${ho.pz ?? 0}"/></label>
          <label>Escala<input id="hoSc" type="number" step="0.05" value="${ho.scale ?? 1}"/></label>
          <label>Rot X (rad)<input id="hoRx" type="number" step="0.05" value="${ho.rx ?? 0}"/></label>
          <label>Rot Y (rad)<input id="hoRy" type="number" step="0.05" value="${ho.ry ?? 0}"/></label>
          <label>Rot Z (rad)<input id="hoRz" type="number" step="0.05" value="${ho.rz ?? 0}"/></label>
        </div>
      </fieldset>

      <fieldset style="margin-top:14px;border:1px solid #333;padding:10px;border-radius:8px">
        <legend>🔊 Áudios (clip id do painel Áudio)</legend>
        <div class="lv-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label>Tiro <select id="sSfxShoot"></select></label>
          <label>Recarga <select id="sSfxReload"></select></label>
          <label>Vazio (click)<select id="sSfxEmpty"></select></label>
          <label>Impacto <select id="sSfxImpact"></select></label>
        </div>
        <div style="font-size:12px;opacity:.7;margin-top:6px">Adicione novos clipes no painel 🔊 Áudio.</div>
      </fieldset>

      <label style="margin-top:10px;display:block"><input type="checkbox" id="wActive" ${w.active?'checked':''}/> Ativa</label>
    `;

    // load audio clips
    (async () => {
      const { data: clips } = await SB().from("audio_clips").select("id,name,category").order("name");
      const opts = ["<option value=''>(nenhum)</option>", ...(clips||[]).map(c =>
        `<option value="${c.id}">${LV().esc(c.name)}${c.category?` · ${LV().esc(c.category)}`:""}</option>`)];
      for (const [id, cur] of [["sSfxShoot", w.sfx_shoot],["sSfxReload", w.sfx_reload],["sSfxEmpty", w.sfx_empty],["sSfxImpact", w.sfx_impact]]) {
        const sel = m.body.querySelector("#" + id);
        sel.innerHTML = opts.join("");
        if (cur) sel.value = cur;
      }
    })();

    async function save() {
      const payload = {
        slug: m.body.querySelector("#wSlug").value.trim(),
        name: m.body.querySelector("#wName").value.trim(),
        kind: m.body.querySelector("#wKind").value,
        wheel_slot: parseInt(m.body.querySelector("#wSlot").value || "1", 10),
        damage: parseInt(m.body.querySelector("#wDmg").value || "0", 10),
        range_m: parseFloat(m.body.querySelector("#wRange").value || "0"),
        fire_rate_ms: parseInt(m.body.querySelector("#wRate").value || "0", 10),
        mag_size: parseInt(m.body.querySelector("#wMag").value || "0", 10),
        reserve_start: parseInt(m.body.querySelector("#wRes").value || "0", 10),
        reload_ms: parseInt(m.body.querySelector("#wReload").value || "0", 10),
        spread: parseFloat(m.body.querySelector("#wSpread").value || "0"),
        anim_shoot: m.body.querySelector("#wAnimShoot").value.trim() || null,
        anim_reload: m.body.querySelector("#wAnimReload").value.trim() || null,
        icon_url: m.body.querySelector("#wIcon").value.trim() || null,
        model_url: m.body.querySelector("#wModel").value.trim() || null,
        sfx_shoot: m.body.querySelector("#sSfxShoot").value || null,
        sfx_reload: m.body.querySelector("#sSfxReload").value || null,
        sfx_empty: m.body.querySelector("#sSfxEmpty").value || null,
        sfx_impact: m.body.querySelector("#sSfxImpact").value || null,
        active: m.body.querySelector("#wActive").checked,
        anim_pack: m.body.querySelector("#wPack").value || null,
        hand_bone: m.body.querySelector("#wBone").value.trim() || "mixamorigRightHand",
        hand_offset: {
          px: parseFloat(m.body.querySelector("#hoPx").value || "0"),
          py: parseFloat(m.body.querySelector("#hoPy").value || "0"),
          pz: parseFloat(m.body.querySelector("#hoPz").value || "0"),
          rx: parseFloat(m.body.querySelector("#hoRx").value || "0"),
          ry: parseFloat(m.body.querySelector("#hoRy").value || "0"),
          rz: parseFloat(m.body.querySelector("#hoRz").value || "0"),
          scale: parseFloat(m.body.querySelector("#hoSc").value || "1"),
        },
      };
      if (!payload.slug || !payload.name) return LV().toast("Preencha slug e nome", "error");
      const sb = SB();
      let err;
      if (isNew) ({ error: err } = await sb.from("weapons").insert(payload));
      else ({ error: err } = await sb.from("weapons").update(payload).eq("id", w.id));
      if (err) return LV().toast("Erro: " + err.message, "error");
      LV().toast("Salvo!", "ok");
      m.close();
      await window.__weaponsReload?.();
      done?.();
    }
  }
})();
