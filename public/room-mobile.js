/*
 * room-mobile.js
 * — Trava o celular em landscape enquanto o usuário está numa sala
 *   (libera ao sair). Em iOS (que não permite lock fora de fullscreen)
 *   mostra um overlay pedindo pra girar.
 * — Trackeia a altura do visualViewport pra que o chat NÃO encolha/suma
 *   quando o teclado virtual aparece (--vv-height).
 * — Adiciona abas "Aqui / Global" no chat (estilo Roblox).
 */
(function () {
  'use strict';

  const body = document.body;
  const root = document.documentElement;

  // ---------- visualViewport height tracking ----------
  function updateVV() {
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    root.style.setProperty('--vv-height', h + 'px');
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateVV);
    window.visualViewport.addEventListener('scroll', updateVV);
  }
  window.addEventListener('resize', updateVV);
  updateVV();

  // ---------- Orientation lock ----------
  let lockRequested = false;
  async function tryLockLandscape() {
    if (!screen.orientation || !screen.orientation.lock) return false;
    try {
      await screen.orientation.lock('landscape');
      lockRequested = true;
      return true;
    } catch (_) {
      return false;
    }
  }
  function tryUnlock() {
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch {}
    lockRequested = false;
  }

  function isCoarsePointer() {
    return window.matchMedia('(pointer: coarse)').matches;
  }
  function isPortrait() {
    return window.matchMedia('(orientation: portrait)').matches;
  }

  // ---------- "Gire o celular" overlay: DESATIVADO (orientação trava automática) ----------
  function syncRotateOverlay() {
    const el = document.getElementById('rotateOverlay');
    if (el) el.hidden = true;
  }

  async function onEnterRoom() {
    if (!isCoarsePointer()) return;
    await tryLockLandscape();
    syncRotateOverlay();
  }
  function onLeaveRoom() {
    if (lockRequested) tryUnlock();
    const el = document.getElementById('rotateOverlay');
    if (el) el.hidden = true;
  }

  const mo = new MutationObserver(() => {
    const inRoom = body.classList.contains('world-ready');
    if (inRoom && !body.dataset.roomLocked) {
      body.dataset.roomLocked = '1';
      onEnterRoom();
    } else if (!inRoom && body.dataset.roomLocked) {
      delete body.dataset.roomLocked;
      onLeaveRoom();
    }
    syncRotateOverlay();
  });
  mo.observe(body, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('orientationchange', () => setTimeout(syncRotateOverlay, 60));
  window.addEventListener('resize', syncRotateOverlay);

  // ---------- Chat tabs (estilo Roblox: Aqui / Global) ----------
  function setupChatTabs() {
    const panel = document.querySelector('.chat-panel');
    if (!panel || panel.querySelector('.chat-tabs')) return;
    const tabs = document.createElement('div');
    tabs.className = 'chat-tabs';
    tabs.innerHTML = `
      <button type="button" class="chat-tab is-active" data-tab="aqui">Aqui</button>
      <button type="button" class="chat-tab" data-tab="global">Global</button>
    `;
    // Inserir como primeiro filho (antes de .identity / .chat-log)
    panel.insertBefore(tabs, panel.firstChild);
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.chat-tab');
      if (!btn) return;
      tabs.querySelectorAll('.chat-tab').forEach((b) => b.classList.toggle('is-active', b === btn));
      // Por enquanto só "Aqui" tem conteúdo real; "Global" é placeholder visual.
      e.stopPropagation();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupChatTabs);
  } else {
    setupChatTabs();
  }

  // ---------- Evitar que o chat "minimize" ao focar input ----------
  // Em alguns Androids o foco do input dispara scroll/resize que pode tirar
  // o panel da view. Forçamos manter mobile-show-chat enquanto o input estiver focado.
  document.addEventListener('focusin', (e) => {
    if (e.target && e.target.id === 'chatInput') {
      if (!body.classList.contains('mobile-show-chat')) {
        body.classList.add('mobile-show-chat');
      }
      // re-medir após o teclado abrir
      setTimeout(updateVV, 150);
      setTimeout(updateVV, 400);
    }
  });
})();
