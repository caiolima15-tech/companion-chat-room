// Weapons runtime — inventário, roda de armas (GTA-style), tiro/recarga, dano em NPCs.
(function () {
  const SB = () => window.__supabase || window.supabase;
  const THREE = () => window.__THREE || window.THREE;
  const $ = (s, r = document) => r.querySelector(s);

  let userId = null;
  let catalog = [];              // weapons rows
  let inv = new Map();           // slug -> { ammo_in_mag, ammo_reserve }
  let equippedSlug = null;       // null => fists (slot 0)
  let lastShot = 0;
  let reloading = false;
  let mounted = false;
  let handMesh = null;           // placeholder mesh in hand
  let placeholderTag = null;

  const FISTS = {
    slug: "__fists", name: "Punhos", kind: "melee", wheel_slot: 0,
    damage: 8, range_m: 2.4, fire_rate_ms: 500, mag_size: 0, reserve_start: 0, reload_ms: 0,
    icon_url: null, anim_shoot: "kickStrong", anim_reload: null, anim_idle: "idle",
  };

  // -------- boot --------
  function boot() {
    if (mounted) return;
    if (!SB()) return setTimeout(boot, 800);
    mounted = true;
    createHud();
    createWheel();
    createMobileButtons();
    bindKeys();
    bindMouse();
    init();
  }
  document.addEventListener("DOMContentLoaded", boot);
  setTimeout(boot, 1500);

  async function init() {
    try {
      const { data: { user } } = await SB().auth.getUser();
      if (!user) return setTimeout(init, 2000);
      userId = user.id;
      await Promise.all([loadCatalog(), loadInventory()]);
      renderHud();
    } catch (e) { console.warn("[weapons] init", e); }
  }

  async function loadCatalog() {
    const { data } = await SB().from("weapons").select("*").eq("active", true).order("wheel_slot");
    catalog = data || [];
    window.__weaponsCatalog = catalog;
  }
  async function loadInventory() {
    const { data } = await SB().from("player_weapons").select("*").eq("user_id", userId);
    inv.clear();
    (data || []).forEach(r => inv.set(r.weapon_slug, { ammo_in_mag: r.ammo_in_mag, ammo_reserve: r.ammo_reserve }));
    window.__weaponsInv = inv;
  }
  async function saveInvRow(slug) {
    const it = inv.get(slug); if (!it) return;
    await SB().from("player_weapons").upsert({
      user_id: userId, weapon_slug: slug,
      ammo_in_mag: it.ammo_in_mag, ammo_reserve: it.ammo_reserve, equipped: equippedSlug === slug,
    });
  }
  window.__weaponsReload = async () => { await Promise.all([loadCatalog(), loadInventory()]); renderHud(); refreshWheel(); };

  // Public API: give a weapon to the player
  window.giveWeaponToPlayer = async function (slug, ammoOverride) {
    if (!userId) return;
    const w = catalog.find(x => x.slug === slug);
    if (!w) { toast("Arma não encontrada: " + slug, "error"); return; }
    const it = inv.get(slug) || { ammo_in_mag: w.mag_size, ammo_reserve: w.reserve_start };
    if (ammoOverride) Object.assign(it, ammoOverride);
    inv.set(slug, it);
    await saveInvRow(slug);
    toast("+ " + w.name, "ok");
    renderHud();
  };

  // ============ HUD ============
  function createHud() {
    if ($("#weaponHud")) return;
    const el = document.createElement("div");
    el.id = "weaponHud";
    el.innerHTML = `<div class="wh-inner">
      <div class="wh-icon" id="whIcon">✊</div>
      <div class="wh-name" id="whName">Punhos</div>
      <div class="wh-ammo" id="whAmmo"></div>
    </div>`;
    document.body.appendChild(el);
  }
  function renderHud() {
    const w = current(); const el = $("#weaponHud"); if (!el) return;
    $("#whName").textContent = w.name;
    if (w.slug === "__fists") { $("#whIcon").textContent = "✊"; $("#whAmmo").textContent = "∞"; }
    else {
      $("#whIcon").innerHTML = w.icon_url ? `<img src="${w.icon_url}" alt=""/>` : "🔫";
      const it = inv.get(w.slug); const cur = it?.ammo_in_mag ?? 0, res = it?.ammo_reserve ?? 0;
      $("#whAmmo").innerHTML = `<b>${cur}</b> / ${res}`;
    }
  }
  function current() {
    if (!equippedSlug) return FISTS;
    return catalog.find(x => x.slug === equippedSlug) || FISTS;
  }

  // ============ WHEEL ============
  let wheelOpen = false, wheelHover = -1;
  function createWheel() {
    if ($("#weaponWheel")) return;
    const wrap = document.createElement("div");
    wrap.id = "weaponWheel";
    wrap.innerHTML = `<svg id="wwSvg" viewBox="-160 -160 320 320" aria-hidden="true"></svg>
      <div id="wwCenter"><div id="wwName">—</div><div id="wwAmmo"></div></div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener("mousemove", onWheelMove);
    wrap.addEventListener("touchmove", onWheelMove, { passive: true });
    wrap.addEventListener("touchend", (e) => { e.preventDefault(); closeWheel(true); });
    wrap.addEventListener("mouseup", () => closeWheel(true));
  }
  function refreshWheel() { if (wheelOpen) drawWheel(); }
  function drawWheel() {
    const svg = $("#wwSvg"); if (!svg) return;
    const N = 8, R = 150, r = 55;
    let html = "";
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2 - Math.PI / 2 - Math.PI / N;
      const a1 = a0 + (Math.PI * 2) / N;
      const x0 = Math.cos(a0) * R, y0 = Math.sin(a0) * R;
      const x1 = Math.cos(a1) * R, y1 = Math.sin(a1) * R;
      const rx0 = Math.cos(a0) * r, ry0 = Math.sin(a0) * r;
      const rx1 = Math.cos(a1) * r, ry1 = Math.sin(a1) * r;
      const w = i === 0 ? FISTS : catalog.find(x => x.wheel_slot === i);
      const owned = i === 0 || (w && inv.has(w.slug));
      const hover = wheelHover === i;
      const fill = hover ? "rgba(120,180,255,.55)" : owned ? "rgba(20,25,35,.6)" : "rgba(20,25,35,.25)";
      html += `<path data-slot="${i}" d="M ${rx0} ${ry0} L ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1} L ${rx1} ${ry1} A ${r} ${r} 0 0 0 ${rx0} ${ry0} Z"
        fill="${fill}" stroke="rgba(255,255,255,.28)" stroke-width="1.2"/>`;
      if (w) {
        const mid = (a0 + a1) / 2, mr = (R + r) / 2;
        const mx = Math.cos(mid) * mr, my = Math.sin(mid) * mr;
        const label = i === 0 ? "✊" : (w.icon_url ? "" : "🔫");
        html += `<text x="${mx}" y="${my + 6}" text-anchor="middle" fill="#fff" font-size="22" opacity="${owned ? 1 : 0.35}">${label}</text>`;
        if (i !== 0 && w.icon_url && owned) {
          html += `<image href="${w.icon_url}" x="${mx - 22}" y="${my - 26}" width="44" height="44" preserveAspectRatio="xMidYMid meet"/>`;
        }
      }
    }
    svg.innerHTML = html;
    updateWheelCenter();
  }
  function updateWheelCenter() {
    const i = wheelHover;
    let w = null;
    if (i === 0) w = FISTS;
    else if (i > 0) w = catalog.find(x => x.wheel_slot === i);
    $("#wwName").textContent = w?.name || "—";
    if (w && w.slug !== "__fists") {
      const it = inv.get(w.slug);
      $("#wwAmmo").textContent = it ? `${it.ammo_in_mag} / ${it.ammo_reserve}` : "(não possui)";
    } else $("#wwAmmo").textContent = "";
  }
  function onWheelMove(ev) {
    const rect = $("#weaponWheel").getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const p = ev.touches ? ev.touches[0] : ev;
    const dx = p.clientX - cx, dy = p.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 45) { wheelHover = -1; drawWheel(); return; }
    const ang = Math.atan2(dy, dx) + Math.PI / 2 + Math.PI / 8;
    const norm = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    wheelHover = Math.floor((norm / (Math.PI * 2)) * 8);
    drawWheel();
  }
  function openWheel() {
    if (wheelOpen) return;
    wheelOpen = true;
    $("#weaponWheel").classList.add("open");
    drawWheel();
  }
  function closeWheel(select) {
    if (!wheelOpen) return;
    wheelOpen = false;
    $("#weaponWheel").classList.remove("open");
    if (select && wheelHover >= 0) {
      if (wheelHover === 0) equip(null);
      else {
        const w = catalog.find(x => x.wheel_slot === wheelHover);
        if (w && inv.has(w.slug)) equip(w.slug);
        else if (w) toast("Você não tem: " + w.name, "warn");
      }
    }
    wheelHover = -1;
  }
  window.__openWeaponWheel = openWheel;

  // ============ EQUIP ============
  function getMyEntity() {
    try {
      const me = window.__myId; const map = window.__playerEntities;
      if (me && map?.get) return map.get(me);
    } catch {}
    return null;
  }

  async function equip(slug) {
    equippedSlug = slug;
    renderHud();
    await updateHandVisual();
    toast(slug ? ("🎯 " + (catalog.find(x => x.slug === slug)?.name || slug)) : "✊ Punhos", "ok");
    if (userId) SB().from("player_weapons").update({ equipped: false }).eq("user_id", userId).neq("weapon_slug", slug || "__none").then(() => {});
    if (slug && userId) SB().from("player_weapons").update({ equipped: true }).eq("user_id", userId).eq("weapon_slug", slug).then(() => {});
  }

  async function updateHandVisual() {
    const entity = getMyEntity();
    if (!entity) return;
    const WA = window.__weaponAnim;
    if (!equippedSlug) { WA?.clearWeapon?.(entity); return; }
    const w = catalog.find(x => x.slug === equippedSlug); if (!w) return;
    try { await WA?.setWeapon?.(entity, w); } catch (e) { console.warn("[weapons] setWeapon", e); }
  }
  // Re-attach when the avatar changes
  window.addEventListener("player-avatar-loaded", () => { if (equippedSlug) updateHandVisual(); });

  // ============ INPUTS ============
  function bindKeys() {
    let tabDown = false;
    window.addEventListener("keydown", (e) => {
      const k = (e.key || "").toLowerCase();
      if (k === "tab") { e.preventDefault(); if (!tabDown) { tabDown = true; openWheel(); } return; }
      if (e.repeat) return;
      if (k === "r") { if (equippedSlug) { e.preventDefault(); reload(); } }
    });
    window.addEventListener("keyup", (e) => {
      const k = (e.key || "").toLowerCase();
      if (k === "tab") { e.preventDefault(); tabDown = false; closeWheel(true); }
    });
  }
  function bindMouse() {
    window.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      // ignore clicks on UI (buttons, panels)
      const t = e.target;
      if (t && t.closest && (t.closest("button, input, textarea, select, [contenteditable], .lv-modal, .admin-dock, #adminBar, #chat, #weaponWheel"))) return;
      if (!equippedSlug) return; // fists use existing kick emote
      fire();
    });
  }

  function createMobileButtons() {
    if ($("#mobWheelBtn")) return;
    const bar = document.createElement("div");
    bar.id = "weaponMobBar";
    bar.innerHTML = `
      <button id="mobWheelBtn" type="button" aria-label="Roda de armas">🎯</button>
      <button id="mobShootBtn" type="button" aria-label="Atirar">🔥</button>
      <button id="mobReloadBtn" type="button" aria-label="Recarregar">🔄</button>`;
    document.body.appendChild(bar);
    $("#mobWheelBtn").addEventListener("touchstart", (e) => { e.preventDefault(); openWheel(); }, { passive: false });
    $("#mobWheelBtn").addEventListener("click", () => { wheelOpen ? closeWheel(true) : openWheel(); });
    $("#mobShootBtn").addEventListener("click", () => { if (equippedSlug) fire(); else window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" })); });
    $("#mobReloadBtn").addEventListener("click", () => { if (equippedSlug) reload(); });
  }

  // ============ FIRE / RELOAD ============
  async function fire() {
    const w = current();
    const now = performance.now();
    if (reloading) return;
    if (now - lastShot < w.fire_rate_ms) return;
    lastShot = now;

    if (w.slug !== "__fists") {
      const it = inv.get(w.slug);
      if (!it || it.ammo_in_mag <= 0) {
        playClip(w.sfx_empty, 0.6);
        toast("Sem munição — recarregue (R)", "warn");
        return;
      }
      it.ammo_in_mag -= 1;
      renderHud();
      saveInvRow(w.slug);
      playClip(w.sfx_shoot, 0.9);
    } else {
      // fists: use existing kick if available
      try { window.triggerLocalEmote?.("kickStrong"); } catch {}
    }
    // animation — prefer weapon-anim pack; fallback to legacy emote
    const entity = getMyEntity();
    if (entity && window.__weaponAnim?.isReady?.(entity)) {
      // small recoil: reuse idle briefly — packs don't ship a shoot clip
    } else if (w.anim_shoot && window.playPlayerAnimation) {
      try { window.playPlayerAnimation(w.anim_shoot, 400); } catch {}
    }
    // hit test
    doHitScan(w);
    window.dispatchEvent(new CustomEvent("weapon-shot", { detail: { slug: w.slug } }));
  }

  async function reload() {
    const w = current(); if (w.slug === "__fists") return;
    if (reloading) return;
    const it = inv.get(w.slug); if (!it) return;
    if (it.ammo_in_mag >= w.mag_size) return;
    if (it.ammo_reserve <= 0) { toast("Sem munição reserva", "warn"); return; }
    reloading = true;
    playClip(w.sfx_reload, 0.9);
    if (w.anim_reload && window.playPlayerAnimation) { try { window.playPlayerAnimation(w.anim_reload, w.reload_ms); } catch {} }
    toast("Recarregando…", "ok");
    setTimeout(async () => {
      const need = w.mag_size - it.ammo_in_mag;
      const take = Math.min(need, it.ammo_reserve);
      it.ammo_in_mag += take; it.ammo_reserve -= take;
      renderHud();
      reloading = false;
      await saveInvRow(w.slug);
      window.dispatchEvent(new CustomEvent("weapon-reload", { detail: { slug: w.slug } }));
    }, Math.max(200, w.reload_ms | 0));
  }

  function playClip(clipId, vol) {
    if (!clipId) return;
    try { window.GameAudio?.playClipById?.(clipId, { volume: vol ?? 0.8 }); } catch {}
  }

  // ============ HIT SCAN ============
  function doHitScan(w) {
    const T = THREE(); const cam = window.__camera; const player = window.__player;
    if (!T || !cam || !player) return;
    const origin = new T.Vector3(); cam.getWorldPosition(origin);
    const dir = new T.Vector3(); cam.getWorldDirection(dir);
    // slight spread
    const s = w.spread || 0.03;
    dir.x += (Math.random() - 0.5) * s;
    dir.y += (Math.random() - 0.5) * s;
    dir.z += (Math.random() - 0.5) * s;
    dir.normalize();

    const range = w.range_m || (w.slug === "__fists" ? 2.4 : 40);
    const ents = window.__npcEntities;
    if (!ents) return;

    let best = null, bestT = Infinity;
    const tmp = new T.Vector3();
    for (const [id, e] of ents) {
      if (!e?.group) continue;
      const pos = e.group.position;
      // approximate torso center
      tmp.set(pos.x, pos.y + 1.0, pos.z);
      const rel = tmp.clone().sub(origin);
      const along = rel.dot(dir);
      if (along < 0.2 || along > range) continue;
      const closest = origin.clone().addScaledVector(dir, along);
      const d = tmp.distanceTo(closest);
      const radius = 0.6;
      if (d <= radius && along < bestT) { bestT = along; best = { id, ent: e, along }; }
    }
    // muzzle flash / tracer
    spawnTracer(origin, dir, best?.along ?? range);
    if (best) {
      try { window.__damageNpc?.(best.id, w.damage || 10, { from: "player", weapon: w.slug }); } catch {}
      playClip(w.sfx_impact, 0.7);
    }
  }

  function spawnTracer(origin, dir, len) {
    const T = THREE(); const scene = window.__scene; if (!T || !scene) return;
    const geo = new T.BufferGeometry();
    const a = origin.clone().addScaledVector(dir, 0.4);
    const b = origin.clone().addScaledVector(dir, Math.max(1, len));
    geo.setAttribute("position", new T.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z], 3));
    const mat = new T.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.85 });
    const line = new T.Line(geo, mat);
    scene.add(line);
    let t = 0;
    const tick = () => {
      t += 1 / 60;
      mat.opacity = Math.max(0, 0.85 - t * 6);
      if (t < 0.14) requestAnimationFrame(tick);
      else { scene.remove(line); geo.dispose(); mat.dispose(); }
    };
    requestAnimationFrame(tick);
  }

  // ============ UTIL ============
  function toast(t, k) { if (window.LV?.toast) window.LV.toast(t, k); else console.log("[weapon]", t); }
})();
