// Weapon animation overlay — loads pistol/rifle FBX packs on demand and drives
// the player's locomotion + attaches the weapon GLB to the right hand bone.
// Public API on window.__weaponAnim.
(function () {
  const T = () => window.__THREE || window.THREE;
  const FBXLoader = () => window.__FBXLoader;
  const GLTFLoader = () => window.__GLTFLoader;

  // ---------- Asset URLs (from CDN — see supabase weapons rows & /public/anims) ----------
  const A = "/__l5e/assets-v1/";
  const PACKS = {
    pistol: {
      idle:     A + "91de3254-1b89-4010-b3f0-94bd37e84ca8/pistol_idle.fbx",
      walk:     A + "8d435c4b-b57e-4c46-af76-0d2ee76c2a0f/pistol_walk.fbx",
      walkBack: A + "92b9998c-a31f-43d5-8a07-b54f7c5d861a/pistol_walk_backward.fbx",
      run:      A + "b3533977-fc19-4354-b80e-b6f535b43001/pistol_run.fbx",
      runBack:  A + "13666115-a8eb-4265-8ffa-0c572ea8f2ba/pistol_run_backward.fbx",
      strafeL:  A + "2ddf4a08-978e-4266-9bda-0d5ee9fd7770/pistol_strafe.fbx",
      strafeR:  A + "5f333a23-20d9-4080-9b54-7c937a831692/pistol_strafe_2.fbx",
      jump:     A + "3762c29a-ac92-42e2-81c8-446f6d4f626d/pistol_jump.fbx",
    },
    rifle: {
      idle:     A + "66dc6575-a729-45b2-b803-7f5effeea34c/idle.fbx",
      idleAim:  A + "94f0a446-1cb5-405f-8771-9dd46dacf4bf/idle_aiming.fbx",
      walk:     A + "b4549259-580d-4c24-8edf-8d662d10b99f/walk_forward.fbx",
      walkBack: A + "3b494a95-8adf-420e-8ec2-cd64a2506501/walk_backward.fbx",
      walkL:    A + "32e7764e-0267-4c34-ae24-88547ee62842/walk_left.fbx",
      walkR:    A + "53495779-c486-4dfa-9a02-d3d5802c5319/walk_right.fbx",
      run:      A + "82351a72-725d-4d5c-a36c-3b42f2f33eb7/run_forward.fbx",
      runBack:  A + "fcd037af-c6bc-401b-8659-5b1002baf847/run_backward.fbx",
      runL:     A + "8d3d4e99-bbfc-4e6d-9c43-8e20b63f4fe8/run_left.fbx",
      runR:     A + "7d3f7461-2273-4457-8f99-758b59baaed8/run_right.fbx",
      sprint:   A + "cd5ce181-ad69-4fb3-ae56-2f065b853ad1/sprint_forward.fbx",
      jumpUp:   A + "d794fa46-7b09-4c6c-95a9-04f0ab62b772/jump_up.fbx",
      jumpLoop: A + "9c8cddb5-7393-4da6-a4ce-3bf08beb0db0/jump_loop.fbx",
      jumpDown: A + "8e394f4b-d655-4143-b775-28c5873e34f2/jump_down.fbx",
      death:    A + "bbcce2fd-1dfc-4a2b-a6dd-ec6b63396102/death_from_the_front.fbx",
    },
  };
  window.__weaponAnimPacks = PACKS;

  // ---------- Clip / model caches ----------
  const clipCache = new Map();   // url -> Promise<AnimationClip>
  const modelCache = new Map();  // url -> Promise<Scene>

  function loadClip(url) {
    if (!url) return Promise.resolve(null);
    if (clipCache.has(url)) return clipCache.get(url);
    const L = FBXLoader();
    if (!L) return Promise.resolve(null);
    const p = new Promise((resolve) => {
      new L().load(url, (fbx) => {
        const clip = fbx?.animations?.[0];
        if (!clip) return resolve(null);
        // Strip "mixamorig" prefix from track names so they bind to RPM/generic skeletons
        const remapped = clip.clone();
        for (const t of remapped.tracks) {
          t.name = t.name.replace(/^mixamorig[:_]?/i, "").replace(/\.mixamorig/gi, ".");
        }
        remapped.name = url.split("/").pop() || clip.name;
        resolve(remapped);
      }, undefined, () => resolve(null));
    });
    clipCache.set(url, p);
    return p;
  }

  function loadModel(url) {
    if (!url) return Promise.resolve(null);
    if (modelCache.has(url)) return modelCache.get(url);
    const L = GLTFLoader();
    if (!L) return Promise.resolve(null);
    const p = new Promise((resolve) => {
      new L().load(url, (gltf) => {
        const scene = gltf?.scene;
        if (!scene) return resolve(null);
        scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        resolve(scene);
      }, undefined, () => resolve(null));
    });
    modelCache.set(url, p);
    return p;
  }

  // ---------- Per-entity weapon state ----------
  // state[entity] = { packName, actions:Map(key->action), current, attach:{obj,bone}, savedActions, savedCurrent }
  const stateMap = new WeakMap();

  function ensureState(entity) {
    let s = stateMap.get(entity);
    if (!s) { s = { packName: null, actions: {}, current: null, attach: null, tempAction: null, tempUntil: 0 }; stateMap.set(entity, s); }
    return s;
  }

  function findBone(entity, boneName) {
    let out = null;
    entity.character?.traverse?.((o) => {
      if (out) return;
      if (o.isBone) {
        const n = o.name || "";
        if (n === boneName) out = o;
        else if (n.replace(/^mixamorig[:_]?/i, "") === boneName.replace(/^mixamorig[:_]?/i, "")) out = o;
      }
    });
    return out;
  }

  async function attachWeapon(entity, weapon) {
    detachWeapon(entity);
    if (!weapon?.model_url) return;
    const scene = await loadModel(weapon.model_url);
    if (!scene) return;
    const clone = scene.clone(true);
    const off = weapon.hand_offset || {};
    const px = +off.px || 0, py = +off.py || 0, pz = +off.pz || 0;
    const rx = +off.rx || 0, ry = +off.ry || 0, rz = +off.rz || 0;
    const sc = +off.scale || 1;
    const wrap = new (T()).Group();
    wrap.add(clone);
    wrap.position.set(px, py, pz);
    wrap.rotation.set(rx, ry, rz);
    wrap.scale.setScalar(sc);
    const bone = findBone(entity, weapon.hand_bone || "mixamorigRightHand") || findBone(entity, "RightHand");
    const s = ensureState(entity);
    if (bone) {
      bone.add(wrap);
      s.attach = { obj: wrap, bone, char: entity.character };
    } else if (entity.character) {
      // fallback: parent on character root — user can still see the model
      wrap.position.set(0.28, 1.05, 0.18);
      entity.character.add(wrap);
      s.attach = { obj: wrap, bone: null, char: entity.character };
    }
  }

  function detachWeapon(entity) {
    const s = stateMap.get(entity);
    if (!s?.attach) return;
    try { s.attach.obj.parent?.remove(s.attach.obj); } catch {}
    try {
      s.attach.obj.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      });
    } catch {}
    s.attach = null;
  }

  async function loadPack(entity, packName) {
    const pack = PACKS[packName]; if (!pack) return;
    if (!entity.mixer) return;
    const s = ensureState(entity);
    if (s.packName === packName && Object.keys(s.actions).length) return;
    s.packName = packName;
    s.actions = {};
    const keys = Object.keys(pack);
    const clips = await Promise.all(keys.map((k) => loadClip(pack[k])));
    for (let i = 0; i < keys.length; i++) {
      const clip = clips[i]; if (!clip) continue;
      try {
        const action = entity.mixer.clipAction(clip);
        action.enabled = true; action.setEffectiveWeight(0);
        s.actions[keys[i]] = action;
      } catch {}
    }
  }

  function pickLocoKey(entity, name) {
    // name: 'idle' | 'walk' | 'run'
    const s = stateMap.get(entity); if (!s?.packName) return null;
    if (name === "idle") return "idle";
    // Determine direction from input keys (local player)
    const KS = window.__keyState || null;
    let iy = 0, ix = 0;
    if (KS && typeof KS.has === "function") {
      if (KS.has("arrowup") || KS.has("w")) iy += 1;
      if (KS.has("arrowdown") || KS.has("s")) iy -= 1;
      if (KS.has("arrowleft") || KS.has("a")) ix -= 1;
      if (KS.has("arrowright") || KS.has("d")) ix += 1;
    }
    // Fallback: forward
    const running = name === "run";
    // For rifle we have 8-dir; for pistol we have limited set
    if (s.packName === "rifle") {
      if (iy < -0.5) return running ? "runBack" : "walkBack";
      if (ix < -0.5 && Math.abs(iy) < 0.5) return running ? "runL" : "walkL";
      if (ix > 0.5 && Math.abs(iy) < 0.5) return running ? "runR" : "walkR";
      return running ? "run" : "walk";
    }
    // pistol
    if (iy < -0.5) return running ? "runBack" : "walkBack";
    if (ix < -0.5 && Math.abs(iy) < 0.5) return "strafeL";
    if (ix > 0.5 && Math.abs(iy) < 0.5) return "strafeR";
    return running ? "run" : "walk";
  }

  function crossFadeTo(entity, key, fade = 0.16) {
    const s = ensureState(entity);
    if (s.tempAction && performance.now() < s.tempUntil) return; // locked by one-shot
    const next = s.actions[key]; if (!next) return;
    if (s.current === key) return;
    const prev = s.actions[s.current];
    if (prev && prev !== next) { prev.fadeOut(fade); }
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    s.current = key;
  }

  function stopAll(entity, fade = 0.2) {
    const s = stateMap.get(entity); if (!s) return;
    for (const k in s.actions) { try { s.actions[k].fadeOut(fade); } catch {} }
    s.current = null;
  }

  // ---------- Public API ----------
  window.__weaponAnim = {
    async setWeapon(entity, weapon) {
      if (!entity || !weapon) return;
      const pack = weapon.anim_pack;
      await Promise.all([
        attachWeapon(entity, weapon),
        pack ? loadPack(entity, pack) : Promise.resolve(),
      ]);
      // start on idle
      if (pack) crossFadeTo(entity, "idle", 0.25);
    },
    clearWeapon(entity) {
      if (!entity) return;
      detachWeapon(entity);
      stopAll(entity, 0.2);
      const s = stateMap.get(entity);
      if (s) { s.packName = null; s.actions = {}; s.current = null; s.tempAction = null; s.tempUntil = 0; }
    },
    // Called from patched setPlayerAction. Return true if we handled locomotion.
    overrideLoco(entity, name) {
      const s = stateMap.get(entity);
      if (!s?.packName || !Object.keys(s.actions).length) return false;
      const key = pickLocoKey(entity, name);
      if (!key) return false;
      crossFadeTo(entity, key, 0.15);
      return true;
    },
    // One-shot animations (reload/shoot recoil). Returns duration in ms.
    playOnce(entity, key, ms) {
      const s = stateMap.get(entity); if (!s?.actions?.[key]) return 0;
      const action = s.actions[key];
      const prev = s.actions[s.current];
      if (prev && prev !== action) prev.fadeOut(0.1);
      action.reset(); action.setLoop(T().LoopOnce, 1); action.clampWhenFinished = true;
      action.setEffectiveWeight(1).fadeIn(0.08).play();
      s.tempAction = action;
      s.tempUntil = performance.now() + (ms || (action.getClip().duration * 1000));
      setTimeout(() => {
        if (s.tempAction === action) { s.tempAction = null; s.tempUntil = 0; }
        // resume idle
        try { action.fadeOut(0.15); } catch {}
        s.current = null;
        crossFadeTo(entity, "idle", 0.15);
      }, s.tempUntil - performance.now());
      return s.tempUntil - performance.now();
    },
    isReady(entity) {
      const s = stateMap.get(entity);
      return !!(s?.packName && Object.keys(s.actions).length);
    },
  };
})();
