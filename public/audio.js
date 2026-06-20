/*
 * audio.js — Camada de áudio do jogo (ambiente urbano + SFX do jogador/veículo)
 *
 * API global: window.GameAudio
 *   playOnce(name, { volume })
 *   startLoop(name, { volume })
 *   stopLoop(name)
 *   setEngine(throttle, speed01)
 *   onFootstep(running)
 *   setMasterVolume(v)
 */
(function () {
  'use strict';

  const SOURCES = {
    city_ambience:  '/__l5e/assets-v1/38c92040-7719-4e02-842d-9d2c98e6962b/city_ambience.mp3',
    footstep_walk:  '/__l5e/assets-v1/be79361e-292c-4a92-88da-5d990376876e/footstep_walk.mp3',
    footstep_run:   '/__l5e/assets-v1/041b3a9c-7843-460c-a206-a37c931ce485/footstep_run.mp3',
    car_enter:      '/__l5e/assets-v1/aed3589b-1b29-4b6e-b496-6f899dc38d2d/car_enter.mp3',
    car_accel_loop: '/__l5e/assets-v1/b7a8cf38-8d92-43cf-9693-bc88dcf5844b/car_accel_loop.mp3',
    car_brake:      '/__l5e/assets-v1/c13bc620-c595-40e1-bab4-666380f4ceb0/car_brake.mp3',
    car_crash:      '/__l5e/assets-v1/f65d01fd-ce0d-41ad-aaab-24f27fe086f7/car_crash.mp3',
  };

  // Pool simples de Audio() para one-shots (evita corte quando o som dispara em sequência)
  const POOL_SIZE = 4;
  const pools = {};
  function getPool(name) {
    if (pools[name]) return pools[name];
    const arr = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const a = new Audio(SOURCES[name]);
      a.preload = 'auto';
      a.crossOrigin = 'anonymous';
      arr.push(a);
    }
    pools[name] = { arr, idx: 0 };
    return pools[name];
  }

  const loops = {}; // name -> Audio
  let master = 1.0;
  let unlocked = false;
  let pendingAmbient = false;

  function playOnce(name, opts = {}) {
    if (!SOURCES[name]) return;
    try {
      const p = getPool(name);
      const a = p.arr[p.idx];
      p.idx = (p.idx + 1) % POOL_SIZE;
      a.volume = Math.max(0, Math.min(1, (opts.volume ?? 1) * master));
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }

  function startLoop(name, opts = {}) {
    if (!SOURCES[name]) return;
    let a = loops[name];
    if (!a) {
      a = new Audio(SOURCES[name]);
      a.loop = true;
      a.preload = 'auto';
      loops[name] = a;
    }
    a.volume = Math.max(0, Math.min(1, (opts.volume ?? 0.5) * master));
    if (a.paused) a.play().catch(() => {});
  }

  function stopLoop(name) {
    const a = loops[name];
    if (a && !a.paused) {
      try { a.pause(); a.currentTime = 0; } catch {}
    }
  }

  function setLoopVolume(name, v) {
    const a = loops[name];
    if (a) a.volume = Math.max(0, Math.min(1, v * master));
  }
  function setLoopRate(name, r) {
    const a = loops[name];
    if (a) {
      try { a.playbackRate = Math.max(0.5, Math.min(2.2, r)); } catch {}
    }
  }

  // --- Engine: módulo o volume + pitch do loop conforme aceleração/velocidade ---
  function setEngine(throttle, speed01) {
    const a = loops['car_accel_loop'];
    if (!a) return;
    const s = Math.max(0, Math.min(1, Math.abs(speed01)));
    const t = Math.max(0, Math.min(1, Math.abs(throttle)));
    // volume cresce com velocidade; tem um piso quando o jogador segura acelerador parado
    const vol = Math.min(0.6, 0.12 + 0.45 * s + 0.15 * t);
    setLoopVolume('car_accel_loop', vol);
    setLoopRate('car_accel_loop', 0.85 + 0.7 * s + 0.1 * t);
  }

  // --- Passos: rate-limit interno por modo ---
  const stepState = { lastWalk: 0, lastRun: 0 };
  function onFootstep(running) {
    const now = performance.now();
    if (running) {
      if (now - stepState.lastRun < 250) return;
      stepState.lastRun = now;
      playOnce('footstep_run', { volume: 0.55 });
    } else {
      if (now - stepState.lastWalk < 410) return;
      stepState.lastWalk = now;
      playOnce('footstep_walk', { volume: 0.45 });
    }
  }

  function setMasterVolume(v) {
    master = Math.max(0, Math.min(1, v));
    for (const k in loops) {
      const a = loops[k];
      if (a) a.volume = Math.min(1, a.volume); // re-clamp; per-call refresh on next set
    }
  }

  // --- Autoplay unlock + ambient lifecycle ---
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    // Toca/pausa um audio silencioso para liberar a engine
    try {
      const probe = new Audio(SOURCES.city_ambience);
      probe.volume = 0;
      probe.play().then(() => probe.pause()).catch(() => {});
    } catch {}
    if (pendingAmbient) startAmbient();
  }

  function startAmbient() {
    if (!unlocked) { pendingAmbient = true; return; }
    pendingAmbient = false;
    startLoop('city_ambience', { volume: 0.22 });
  }
  function stopAmbient() {
    stopLoop('city_ambience');
  }

  // Primeiro gesto destrava
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => {
    window.addEventListener(ev, unlock, { once: false, passive: true });
  });

  // Liga/desliga ambiente conforme entra/sai do mundo
  const body = document.body;
  const mo = new MutationObserver(() => {
    const inWorld = body.classList.contains('world-ready');
    if (inWorld) startAmbient();
    else { stopAmbient(); stopLoop('car_accel_loop'); }
  });
  mo.observe(body, { attributes: true, attributeFilter: ['class'] });
  if (body.classList.contains('world-ready')) startAmbient();

  window.GameAudio = {
    playOnce, startLoop, stopLoop, setEngine, onFootstep, setMasterVolume, unlock,
  };
})();
