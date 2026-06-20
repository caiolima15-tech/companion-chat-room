/*
 * audio.js — Camada de áudio do jogo com Web Audio API.
 * - Volumes por categoria (master, ambient, sfx, voice, engine)
 * - Áudio 3D posicional via PannerNode (para sons remotos / objetos)
 * - Biblioteca de clipes do banco (tabela audio_clips), com fallback para clipes padrão embutidos
 * - Sons por sala (map_ambient_sounds), por objeto (map_object_sounds) e por carro (cars_catalog.*_clip_id)
 * - Intervalo de passos configurável (audio_settings)
 *
 * API global: window.GameAudio
 */
(function () {
  'use strict';

  // ---------- Clipes padrão (fallback usado quando o admin ainda não cadastrou nada) ----------
  const DEFAULT_CLIPS = {
    city_ambience:  '/__l5e/assets-v1/38c92040-7719-4e02-842d-9d2c98e6962b/city_ambience.mp3',
    footstep_walk:  '/__l5e/assets-v1/be79361e-292c-4a92-88da-5d990376876e/footstep_walk.mp3',
    footstep_run:   '/__l5e/assets-v1/041b3a9c-7843-460c-a206-a37c931ce485/footstep_run.mp3',
    car_enter:      '/__l5e/assets-v1/aed3589b-1b29-4b6e-b496-6f899dc38d2d/car_enter.mp3',
    car_accel_loop: '/__l5e/assets-v1/b7a8cf38-8d92-43cf-9693-bc88dcf5844b/car_accel_loop.mp3',
    car_brake:      '/__l5e/assets-v1/c13bc620-c595-40e1-bab4-666380f4ceb0/car_brake.mp3',
    car_crash:      '/__l5e/assets-v1/f65d01fd-ce0d-41ad-aaab-24f27fe086f7/car_crash.mp3',
  };

  // Mapeia chaves antigas para categorias do banco — primeiro clipe encontrado da categoria vence.
  const KEY_TO_CATEGORY = {
    city_ambience:  'ambient',
    footstep_walk:  'footstep_walk',
    footstep_run:   'footstep_run',
    car_enter:      'car_engine',
    car_accel_loop: 'car_engine',
    car_brake:      'car_brake',
    car_crash:      'car_crash',
    car_horn:       'car_horn',
  };

  // ---------- Estado ----------
  let ctx = null;
  let masterGain = null;
  const catGains = {}; // category -> GainNode
  const bufferCache = new Map(); // url -> Promise<AudioBuffer>
  const loops = new Map(); // id -> { source, gain, panner }
  let unlocked = false;
  let pendingAmbient = false;
  let currentAmbient = null; // { mapId, sourceId }

  // Configs (vão sendo sobrescritas pelo banco)
  const cfg = {
    master_volume: 1.0,
    ambient_volume: 0.35,
    sfx_volume: 0.8,
    voice_volume: 1.0,
    engine_volume: 0.7,
    footstep_walk_interval_ms: 410,
    footstep_run_interval_ms: 250,
    hearing_radius_m: 18,
    falloff_ref_distance: 2.0,
    falloff_max_distance: 25.0,
    falloff_rolloff: 1.4,
  };

  // Biblioteca carregada do banco: id->clip e category->[clips]
  const clipsById = new Map();
  const clipsByCategory = new Map();

  // ---------- AudioContext lazy ----------
  function ensureCtx() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = cfg.master_volume;
      masterGain.connect(ctx.destination);
      for (const c of ['ambient','sfx','voice','engine']) {
        const g = ctx.createGain();
        g.gain.value = cfg[c + '_volume'] ?? 1;
        g.connect(masterGain);
        catGains[c] = g;
      }
    } catch (e) { console.warn('[audio] AudioContext indisponivel', e); }
    return ctx;
  }

  function categoryGain(cat) {
    return catGains[cat] || catGains.sfx;
  }

  function categoryForKey(keyOrCat) {
    if (catGains[keyOrCat]) return keyOrCat;
    if (KEY_TO_CATEGORY[keyOrCat]) {
      const c = KEY_TO_CATEGORY[keyOrCat];
      if (c === 'footstep_walk' || c === 'footstep_run') return 'sfx';
      if (c === 'car_engine' || c === 'car_brake') return 'engine';
      if (c === 'car_horn' || c === 'car_crash') return 'sfx';
      if (c === 'ambient') return 'ambient';
    }
    return 'sfx';
  }

  function resolveUrl(keyOrClipId) {
    if (!keyOrClipId) return null;
    // Se for UUID de clipe
    const byId = clipsById.get(keyOrClipId);
    if (byId) return byId.url;
    // Se for nome de categoria
    const list = clipsByCategory.get(keyOrClipId);
    if (list && list.length) return list[0].url;
    // Mapear chave -> categoria
    const cat = KEY_TO_CATEGORY[keyOrClipId];
    if (cat) {
      const l = clipsByCategory.get(cat);
      if (l && l.length) return l[0].url;
    }
    return DEFAULT_CLIPS[keyOrClipId] || null;
  }

  async function loadBuffer(url) {
    if (!url) return null;
    if (bufferCache.has(url)) return bufferCache.get(url);
    const p = (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('fetch ' + r.status);
        const ab = await r.arrayBuffer();
        ensureCtx();
        return await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
      } catch (e) {
        console.warn('[audio] falha ao carregar', url, e);
        return null;
      }
    })();
    bufferCache.set(url, p);
    return p;
  }

  // ---------- API: one-shots ----------
  async function playOnce(key, opts = {}) {
    if (!unlocked) return;
    ensureCtx();
    const url = opts.url || resolveUrl(key);
    if (!url) return;
    const buf = await loadBuffer(url);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, opts.volume ?? 1));
    src.connect(gain);
    if (opts.position) {
      const panner = makePanner(opts);
      panner.connect(categoryGain(opts.category || categoryForKey(key)));
      gain.connect(panner);
    } else {
      gain.connect(categoryGain(opts.category || categoryForKey(key)));
    }
    if (opts.playbackRate) src.playbackRate.value = opts.playbackRate;
    try { src.start(); } catch {}
  }

  // ---------- API: loops (com id pra poder parar) ----------
  async function startLoop(id, opts = {}) {
    if (!unlocked) { if (id === 'city_ambience') pendingAmbient = true; return; }
    ensureCtx();
    if (loops.has(id)) return; // já tocando
    const url = opts.url || resolveUrl(opts.key || id);
    if (!url) return;
    const buf = await loadBuffer(url);
    if (!buf) return;
    if (loops.has(id)) return; // race
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    if (opts.playbackRate) src.playbackRate.value = opts.playbackRate;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, opts.volume ?? 0.5));
    src.connect(gain);
    let panner = null;
    if (opts.position) {
      panner = makePanner(opts);
      gain.connect(panner);
      panner.connect(categoryGain(opts.category || categoryForKey(opts.key || id)));
    } else {
      gain.connect(categoryGain(opts.category || categoryForKey(opts.key || id)));
    }
    try { src.start(); } catch {}
    loops.set(id, { source: src, gain, panner, follow: opts.follow || null });
  }

  function stopLoop(id) {
    const L = loops.get(id);
    if (!L) return;
    try { L.source.stop(); } catch {}
    try { L.source.disconnect(); L.gain.disconnect(); if (L.panner) L.panner.disconnect(); } catch {}
    loops.delete(id);
  }

  function setLoopVolume(id, v) {
    const L = loops.get(id);
    if (L) try { L.gain.gain.value = Math.max(0, Math.min(1, v)); } catch {}
  }
  function setLoopRate(id, r) {
    const L = loops.get(id);
    if (L) try { L.source.playbackRate.value = Math.max(0.5, Math.min(2.2, r)); } catch {}
  }
  function setLoopPosition(id, pos) {
    const L = loops.get(id);
    if (!L || !L.panner || !pos) return;
    try {
      if (L.panner.positionX) {
        L.panner.positionX.value = pos.x; L.panner.positionY.value = pos.y; L.panner.positionZ.value = pos.z;
      } else { L.panner.setPosition(pos.x, pos.y, pos.z); }
    } catch {}
  }

  function makePanner(opts) {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = opts.refDistance ?? cfg.falloff_ref_distance;
    p.maxDistance = opts.maxDistance ?? cfg.falloff_max_distance;
    p.rolloffFactor = opts.rolloff ?? cfg.falloff_rolloff;
    const pos = opts.position;
    try {
      if (p.positionX) {
        p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      } else { p.setPosition(pos.x, pos.y, pos.z); }
    } catch {}
    return p;
  }

  // ---------- API: listener (chamar todo frame) ----------
  function setListener(pos, forward, up) {
    if (!ctx || !ctx.listener) return;
    const L = ctx.listener;
    try {
      if (L.positionX) {
        L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
        if (forward) { L.forwardX.value = forward.x; L.forwardY.value = forward.y; L.forwardZ.value = forward.z; }
        if (up) { L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z; }
      } else {
        L.setPosition(pos.x, pos.y, pos.z);
        if (forward && up) L.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
      }
    } catch {}
    // Atualiza posições de loops com follow()
    for (const [, L2] of loops) {
      if (L2.follow && L2.panner) {
        try { const p = L2.follow(); if (p) setLoopPosition2(L2, p); } catch {}
      }
    }
  }
  function setLoopPosition2(L, pos) {
    try {
      if (L.panner.positionX) {
        L.panner.positionX.value = pos.x; L.panner.positionY.value = pos.y; L.panner.positionZ.value = pos.z;
      } else { L.panner.setPosition(pos.x, pos.y, pos.z); }
    } catch {}
  }

  // ---------- API: motor (compat com app.js) ----------
  function setEngine(throttle, speed01) {
    if (!loops.has('car_accel_loop')) return;
    const s = Math.max(0, Math.min(1, Math.abs(speed01)));
    const t = Math.max(0, Math.min(1, Math.abs(throttle)));
    const vol = Math.min(0.6, 0.12 + 0.45 * s + 0.15 * t);
    setLoopVolume('car_accel_loop', vol);
    setLoopRate('car_accel_loop', 0.85 + 0.7 * s + 0.1 * t);
  }

  // ---------- API: passos (intervalo controlado por config) ----------
  const _stepState = { lastWalk: 0, lastRun: 0 };
  function onFootstep(running) {
    const now = performance.now();
    if (running) {
      if (now - _stepState.lastRun < cfg.footstep_run_interval_ms) return;
      _stepState.lastRun = now;
      playOnce('footstep_run', { volume: 0.55 });
    } else {
      if (now - _stepState.lastWalk < cfg.footstep_walk_interval_ms) return;
      _stepState.lastWalk = now;
      playOnce('footstep_walk', { volume: 0.45 });
    }
  }

  // ---------- Remotos: passos de outros players/NPCs com som posicional + raio ----------
  // entity: { id, getState: () => ({ pos:{x,y,z}, running:bool, moving:bool }) }
  const remotes = new Map(); // id -> { entity, lastStep, getListenerPos }
  function registerRemote(id, entity) { remotes.set(id, { entity, lastStep: 0 }); }
  function unregisterRemote(id) { remotes.delete(id); }
  let _listenerPosCache = { x: 0, y: 0, z: 0 };
  function setListenerCache(p) { _listenerPosCache = { x: p.x, y: p.y, z: p.z }; }

  function tickRemotes(now) {
    if (!unlocked) return;
    for (const [, R] of remotes) {
      let s; try { s = R.entity.getState(); } catch { continue; }
      if (!s || !s.moving) continue;
      const dx = s.pos.x - _listenerPosCache.x, dz = s.pos.z - _listenerPosCache.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist > cfg.hearing_radius_m) continue;
      const interval = s.running ? cfg.footstep_run_interval_ms : cfg.footstep_walk_interval_ms;
      if (now - R.lastStep < interval) continue;
      R.lastStep = now;
      playOnce(s.running ? 'footstep_run' : 'footstep_walk', {
        volume: s.running ? 0.55 : 0.45,
        position: s.pos,
        refDistance: cfg.falloff_ref_distance,
        maxDistance: cfg.falloff_max_distance,
      });
    }
  }
  setInterval(() => tickRemotes(performance.now()), 60);

  // ---------- Master / categorias ----------
  function setMasterVolume(v) {
    cfg.master_volume = Math.max(0, Math.min(1, v));
    if (masterGain) masterGain.gain.value = cfg.master_volume;
  }
  function setCategoryVolume(cat, v) {
    cfg[cat + '_volume'] = Math.max(0, Math.min(1, v));
    if (catGains[cat]) catGains[cat].gain.value = cfg[cat + '_volume'];
  }
  function applyConfig(next) {
    Object.assign(cfg, next || {});
    if (masterGain) masterGain.gain.value = cfg.master_volume;
    for (const c of ['ambient','sfx','voice','engine']) {
      if (catGains[c]) catGains[c].gain.value = cfg[c + '_volume'] ?? 1;
    }
    // se ambiente estava tocando, ajusta volume base
    if (loops.has('city_ambience')) setLoopVolume('city_ambience', 1.0); // categoria já controla
  }

  // ---------- Carregar biblioteca + settings do banco ----------
  async function loadFromDb() {
    if (!window.supabase) return;
    try {
      const { data: cfgRow } = await window.supabase
        .from('audio_settings').select('*').eq('scope','global').maybeSingle();
      if (cfgRow) applyConfig(cfgRow);
    } catch {}
    try {
      const { data: clips } = await window.supabase
        .from('audio_clips').select('id,name,category,url').order('created_at', { ascending: true });
      clipsById.clear(); clipsByCategory.clear();
      for (const c of (clips || [])) {
        clipsById.set(c.id, c);
        if (!clipsByCategory.has(c.category)) clipsByCategory.set(c.category, []);
        clipsByCategory.get(c.category).push(c);
      }
    } catch {}
  }
  window.addEventListener('audio:reload', () => loadFromDb().then(() => {
    if (currentAmbient) applyMapAmbient(currentAmbient.mapId);
  }));

  // ---------- Ambiente por sala ----------
  async function applyMapAmbient(mapId) {
    if (!mapId) return;
    currentAmbient = { mapId };
    if (loops.has('city_ambience')) stopLoop('city_ambience');
    if (!window.supabase) { startLoop('city_ambience', { key: 'city_ambience', volume: 1.0 }); return; }
    try {
      const { data } = await window.supabase
        .from('map_ambient_sounds').select('clip_id,volume,enabled').eq('map_id', mapId).maybeSingle();
      if (data && data.enabled !== false && data.clip_id) {
        const clip = clipsById.get(data.clip_id);
        if (clip) {
          startLoop('city_ambience', { key: 'city_ambience', url: clip.url, volume: data.volume ?? 1.0, category: 'ambient' });
          return;
        }
      }
    } catch {}
    // Sem registro: usa ambiente padrão
    startLoop('city_ambience', { key: 'city_ambience', volume: 1.0, category: 'ambient' });
  }
  function stopAmbient() {
    currentAmbient = null;
    stopLoop('city_ambience');
    // Para também todos os object-sounds desta sala
    for (const id of Array.from(loops.keys())) {
      if (id.startsWith('obj:')) stopLoop(id);
    }
  }

  // ---------- Sons de objeto (posicionais) ----------
  // resolveAsset(assetId) -> {x,y,z} | null
  async function applyMapObjectSounds(mapId, resolveAssetPos) {
    if (!window.supabase || !mapId) return;
    // limpa anteriores
    for (const id of Array.from(loops.keys())) if (id.startsWith('obj:')) stopLoop(id);
    try {
      const { data } = await window.supabase
        .from('map_object_sounds').select('*').eq('map_id', mapId);
      for (const r of (data || [])) {
        const clip = clipsById.get(r.clip_id);
        if (!clip) continue;
        const pos = r.asset_id ? resolveAssetPos?.(r.asset_id) : { x: 0, y: 1, z: 0 };
        if (!pos) continue;
        if (r.trigger === 'interaction') continue; // disparado por evento do app.js
        if (r.loop) {
          startLoop('obj:' + r.id, {
            url: clip.url, volume: r.volume ?? 0.7,
            position: pos, refDistance: 1.5, maxDistance: r.radius_m ?? 8, rolloff: cfg.falloff_rolloff,
            category: 'sfx',
          });
        } else {
          playOnce(clip.id, { url: clip.url, volume: r.volume ?? 0.7, position: pos, maxDistance: r.radius_m ?? 8 });
        }
      }
    } catch (e) { console.warn('[audio] applyMapObjectSounds', e); }
  }

  // ---------- Autoplay unlock ----------
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ensureCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (pendingAmbient && currentAmbient?.mapId) { pendingAmbient = false; applyMapAmbient(currentAmbient.mapId); }
  }
  ['pointerdown','keydown','touchstart'].forEach(ev =>
    window.addEventListener(ev, unlock, { passive: true }));

  // Liga ao entrar no mundo, desliga ao sair
  const mo = new MutationObserver(() => {
    const inWorld = document.body.classList.contains('world-ready');
    if (!inWorld) { stopAmbient(); stopLoop('car_accel_loop'); }
  });
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // ---------- Boot ----------
  // Carrega settings/clips assim que o supabase aparecer
  const boot = setInterval(() => {
    if (window.supabase) { clearInterval(boot); loadFromDb(); }
  }, 300);

  // ---------- API pública ----------
  window.GameAudio = {
    // compat com versão anterior
    playOnce, startLoop, stopLoop, setEngine, onFootstep,
    setMasterVolume, unlock,
    // novos
    setCategoryVolume, applyConfig, loadFromDb,
    setListener: (pos, fwd, up) => { setListener(pos, fwd, up); setListenerCache(pos); },
    applyMapAmbient, stopAmbient, applyMapObjectSounds,
    registerRemote, unregisterRemote,
    setLoopVolume, setLoopRate, setLoopPosition,
    playInteractionSoundForAsset: async (mapId, assetId, pos) => {
      try {
        const { data } = await window.supabase
          .from('map_object_sounds').select('*').eq('map_id', mapId).eq('asset_id', assetId).eq('trigger','interaction');
        for (const r of (data || [])) {
          const clip = clipsById.get(r.clip_id);
          if (clip) playOnce(clip.id, { url: clip.url, volume: r.volume ?? 0.8, position: pos, maxDistance: r.radius_m ?? 12 });
        }
      } catch {}
    },
    getConfig: () => ({ ...cfg }),
    listClips: () => Array.from(clipsById.values()),
  };
})();
