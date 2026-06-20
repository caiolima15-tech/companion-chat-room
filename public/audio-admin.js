// audio-admin.js — Painel admin para gerenciar áudios do jogo
// Abre via botão "🔊 Áudios". Abas: Biblioteca, Sala atual, Carros, Volumes.
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));

  function currentMapId() {
    return window.__currentMapId || localStorage.getItem('lastMapId') || null;
  }

  async function sb() { return window.supabase || null; }

  async function uploadFile(file, name) {
    const supabase = await sb();
    if (!supabase) throw new Error('backend offline');
    const safe = name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const path = `${Date.now()}_${safe}`;
    const { error: upErr } = await supabase.storage.from('audio-clips').upload(path, file, {
      contentType: file.type || 'audio/mpeg', upsert: false,
    });
    if (upErr) throw upErr;
    // bucket é privado: usamos signed URL com expiração longa
    const { data: signed, error: sErr } = await supabase.storage.from('audio-clips').createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (sErr) throw sErr;
    return { url: signed.signedUrl, storage_path: path };
  }

  function open() {
    if ($('#audioAdminOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'audioAdminOverlay';
    ov.className = 'users-admin-overlay';
    ov.innerHTML = `
      <div class="users-admin-modal" role="dialog" aria-label="Painel de áudios" style="max-width:980px;width:96vw;max-height:90vh;display:flex;flex-direction:column">
        <div class="users-admin-head">
          <div class="users-admin-title">🔊 Áudios do jogo</div>
          <button type="button" id="audioAdminClose" class="users-admin-close">✕</button>
        </div>
        <div class="users-admin-toolbar" style="gap:6px">
          <button type="button" class="aa-tab" data-tab="lib">📚 Biblioteca</button>
          <button type="button" class="aa-tab" data-tab="room">🏙️ Sala atual</button>
          <button type="button" class="aa-tab" data-tab="cars">🚗 Carros</button>
          <button type="button" class="aa-tab" data-tab="vol">🎚️ Volumes & timing</button>
        </div>
        <div id="audioAdminBody" class="users-admin-list" style="flex:1;overflow:auto;padding:12px"></div>
      </div>`;
    document.body.appendChild(ov);
    $('#audioAdminClose', ov).onclick = () => ov.remove();
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    ov.querySelectorAll('.aa-tab').forEach(b => b.onclick = () => showTab(b.dataset.tab));
    showTab('lib');
  }

  async function showTab(tab) {
    const body = $('#audioAdminBody');
    if (!body) return;
    document.querySelectorAll('.aa-tab').forEach(b => b.style.background = b.dataset.tab === tab ? '#1e293b' : '');
    body.innerHTML = '<div style="opacity:.6">Carregando…</div>';
    try {
      if (tab === 'lib') await renderLibrary(body);
      else if (tab === 'room') await renderRoom(body);
      else if (tab === 'cars') await renderCars(body);
      else if (tab === 'vol') await renderVolumes(body);
    } catch (e) {
      body.innerHTML = `<div style="color:#f99">Erro: ${esc(e.message || e)}</div>`;
    }
  }

  // ---------- Biblioteca ----------
  const CATEGORIES = [
    { v:'ambient', l:'Ambiente' },
    { v:'footstep_walk', l:'Passo - andar' },
    { v:'footstep_run', l:'Passo - correr' },
    { v:'car_engine', l:'Motor (loop aceleração)' },
    { v:'car_brake', l:'Freio / pneu' },
    { v:'car_horn', l:'Buzina' },
    { v:'object', l:'Objeto' },
    { v:'ui', l:'UI' },
    { v:'other', l:'Outro' },
  ];

  async function renderLibrary(body) {
    const supabase = await sb();
    const { data: clips, error } = await supabase.from('audio_clips').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    body.innerHTML = `
      <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:12px;flex-wrap:wrap;background:rgba(255,255,255,0.04);padding:10px;border-radius:8px;border:1px solid #333">
        <div style="display:flex;flex-direction:column;gap:4px"><label style="font-size:11px;opacity:.7">Nome</label><input id="newName" type="text" style="background:#1e293b;color:#eee;border:1px solid #444;border-radius:4px;padding:4px 6px;width:200px" placeholder="Ex: Ambiente cidade dia"></div>
        <div style="display:flex;flex-direction:column;gap:4px"><label style="font-size:11px;opacity:.7">Categoria</label>
          <select id="newCat" style="background:#1e293b;color:#eee;border:1px solid #444;border-radius:4px;padding:4px 6px">
            ${CATEGORIES.map(c => `<option value="${c.v}">${c.l}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px"><label style="font-size:11px;opacity:.7">Arquivo (mp3/ogg/wav, ≤4MB)</label><input id="newFile" type="file" accept="audio/*" style="color:#eee;font-size:12px"></div>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px"><input id="newLoop" type="checkbox"> loopável</label>
        <button id="uploadBtn" type="button" style="background:#1e40af;color:#fff;border:0;border-radius:4px;padding:6px 12px;cursor:pointer">⬆️ Enviar</button>
        <span id="upStatus" style="font-size:11px;opacity:.7"></span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${(clips||[]).map(c => `
          <div style="display:flex;gap:8px;align-items:center;background:rgba(255,255,255,0.03);padding:6px 8px;border-radius:6px;border:1px solid #2a2a2a">
            <span style="font-weight:600">${esc(c.name)}</span>
            <span style="font-size:11px;opacity:.6;background:#1e293b;padding:1px 6px;border-radius:3px">${esc(c.category)}</span>
            <audio src="${esc(c.url)}" preload="none" controls style="height:28px;flex:1;max-width:280px"></audio>
            <button data-del="${c.id}" data-path="${esc(c.storage_path||'')}" type="button" style="background:#7f1d1d;color:#fff;border:0;border-radius:4px;padding:4px 8px;cursor:pointer">🗑️</button>
          </div>`).join('') || '<div style="opacity:.6">Nenhum áudio enviado ainda.</div>'}
      </div>`;
    $('#uploadBtn', body).onclick = async () => {
      const f = $('#newFile', body).files?.[0];
      const name = $('#newName', body).value.trim();
      const cat = $('#newCat', body).value;
      const loopable = $('#newLoop', body).checked;
      if (!f || !name) { alert('Preencha nome e arquivo'); return; }
      if (f.size > 4 * 1024 * 1024) { alert('Arquivo maior que 4MB'); return; }
      $('#upStatus', body).textContent = 'Enviando…';
      try {
        const { url, storage_path } = await uploadFile(f, name);
        const { error } = await supabase.from('audio_clips').insert({
          name, category: cat, url, storage_path, size_bytes: f.size, loopable,
        });
        if (error) throw error;
        window.dispatchEvent(new Event('audio:reload'));
        showTab('lib');
      } catch (e) { $('#upStatus', body).textContent = 'Erro: ' + (e.message || e); }
    };
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Apagar este áudio?')) return;
      const id = b.dataset.del, path = b.dataset.path;
      try {
        await supabase.from('audio_clips').delete().eq('id', id);
        if (path) await supabase.storage.from('audio-clips').remove([path]);
        window.dispatchEvent(new Event('audio:reload'));
        showTab('lib');
      } catch (e) { alert(e.message || e); }
    });
  }

  // ---------- Sala ----------
  async function renderRoom(body) {
    const supabase = await sb();
    const mapId = currentMapId();
    if (!mapId) { body.innerHTML = '<div style="opacity:.7">Entre numa sala primeiro.</div>'; return; }
    const [clipsR, ambR, objsR, assetsR] = await Promise.all([
      supabase.from('audio_clips').select('id,name,category').order('created_at'),
      supabase.from('map_ambient_sounds').select('*').eq('map_id', mapId).maybeSingle(),
      supabase.from('map_object_sounds').select('*, audio_clips(name)').eq('map_id', mapId),
      supabase.from('map_assets').select('id,name,kind,x,z').eq('map_id', mapId).order('created_at'),
    ]);
    const clips = clipsR.data || [];
    const amb = ambR.data || null;
    const objs = objsR.data || [];
    const assets = assetsR.data || [];
    const ambientClips = clips.filter(c => c.category === 'ambient');
    const opts = (list, sel) => list.map(c => `<option value="${c.id}" ${sel===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
    body.innerHTML = `
      <div style="background:rgba(255,255,255,0.04);padding:10px;border-radius:8px;border:1px solid #333;margin-bottom:14px">
        <div style="font-weight:600;margin-bottom:8px">🏙️ Som de ambiente desta sala</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select id="ambClip" style="background:#1e293b;color:#eee;border:1px solid #444;border-radius:4px;padding:4px 6px;min-width:200px">
            <option value="">— nenhum —</option>${opts(ambientClips, amb?.clip_id)}
          </select>
          <label style="font-size:12px">Vol <input id="ambVol" type="range" min="0" max="1" step="0.05" value="${amb?.volume ?? 0.35}"></label>
          <label style="font-size:12px;display:flex;align-items:center;gap:4px"><input id="ambEnabled" type="checkbox" ${amb?.enabled !== false ? 'checked' : ''}> ativo</label>
          <button id="ambSave" type="button" style="background:#1e40af;color:#fff;border:0;border-radius:4px;padding:4px 10px;cursor:pointer">Salvar</button>
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.04);padding:10px;border-radius:8px;border:1px solid #333">
        <div style="font-weight:600;margin-bottom:8px">📦 Sons anexados a objetos do mapa</div>
        <div style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px;border-bottom:1px solid #2a2a2a;padding-bottom:10px">
          <div><label style="font-size:11px;opacity:.7">Objeto</label><br>
            <select id="objAsset" style="background:#1e293b;color:#eee;border:1px solid #444;border-radius:4px;padding:4px 6px;max-width:220px">
              ${assets.map(a => `<option value="${a.id}">${esc(a.name || a.kind || a.id.slice(0,6))}</option>`).join('')}
            </select></div>
          <div><label style="font-size:11px;opacity:.7">Clipe</label><br>
            <select id="objClip" style="background:#1e293b;color:#eee;border:1px solid #444;border-radius:4px;padding:4px 6px;max-width:200px">
              ${clips.map(c => `<option value="${c.id}">${esc(c.name)} (${esc(c.category)})</option>`).join('')}
            </select></div>
          <div><label style="font-size:11px;opacity:.7">Gatilho</label><br>
            <select id="objTrig" style="background:#1e293b;color:#eee;border:1px solid #444;border-radius:4px;padding:4px 6px">
              <option value="proximity">Proximidade</option>
              <option value="always">Sempre tocando</option>
              <option value="interaction">Ao interagir</option>
            </select></div>
          <label style="font-size:12px">Raio(m) <input id="objR" type="number" min="1" max="80" step="1" value="8" style="width:60px;background:#1e293b;color:#eee;border:1px solid #444;border-radius:4px;padding:2px 4px"></label>
          <label style="font-size:12px">Vol <input id="objV" type="range" min="0" max="1" step="0.05" value="0.7"></label>
          <label style="font-size:12px"><input id="objLoop" type="checkbox" checked> loop</label>
          <button id="objAdd" type="button" style="background:#166534;color:#fff;border:0;border-radius:4px;padding:4px 10px;cursor:pointer">+ Adicionar</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${objs.map(o => {
            const a = assets.find(x => x.id === o.asset_id);
            return `<div style="display:flex;gap:8px;align-items:center;background:rgba(255,255,255,0.03);padding:5px 8px;border-radius:6px">
              <span>${esc(a?.name || a?.kind || o.asset_id?.slice(0,6) || '—')}</span>
              <span style="opacity:.7">→ ${esc(o.audio_clips?.name || o.clip_id.slice(0,6))}</span>
              <span style="font-size:11px;background:#1e293b;padding:1px 5px;border-radius:3px">${esc(o.trigger)}</span>
              <span style="font-size:11px;opacity:.6">${o.radius_m}m / vol ${o.volume}</span>
              <button data-rmobj="${o.id}" type="button" style="margin-left:auto;background:#7f1d1d;color:#fff;border:0;border-radius:4px;padding:3px 8px;cursor:pointer">🗑️</button>
            </div>`;
          }).join('') || '<div style="opacity:.6">Nenhum objeto com som ainda.</div>'}
        </div>
      </div>`;
    $('#ambSave', body).onclick = async () => {
      const payload = { map_id: mapId, clip_id: $('#ambClip', body).value || null, volume: parseFloat($('#ambVol', body).value), enabled: $('#ambEnabled', body).checked };
      try {
        await supabase.from('map_ambient_sounds').upsert(payload, { onConflict: 'map_id' });
        window.dispatchEvent(new Event('audio:reload'));
        window.GameAudio?.applyMapAmbient?.(mapId);
        alert('Salvo!');
      } catch (e) { alert(e.message || e); }
    };
    $('#objAdd', body).onclick = async () => {
      const payload = {
        map_id: mapId, asset_id: $('#objAsset', body).value,
        clip_id: $('#objClip', body).value, trigger: $('#objTrig', body).value,
        radius_m: parseFloat($('#objR', body).value), volume: parseFloat($('#objV', body).value),
        loop: $('#objLoop', body).checked,
      };
      if (!payload.asset_id || !payload.clip_id) { alert('Escolha objeto e clipe'); return; }
      try {
        await supabase.from('map_object_sounds').insert(payload);
        window.dispatchEvent(new Event('audio:map-objects-changed'));
        showTab('room');
      } catch (e) { alert(e.message || e); }
    };
    body.querySelectorAll('[data-rmobj]').forEach(b => b.onclick = async () => {
      try {
        await supabase.from('map_object_sounds').delete().eq('id', b.dataset.rmobj);
        window.dispatchEvent(new Event('audio:map-objects-changed'));
        showTab('room');
      } catch (e) { alert(e.message || e); }
    });
  }

  // ---------- Carros ----------
  async function renderCars(body) {
    const supabase = await sb();
    const [carsR, clipsR] = await Promise.all([
      supabase.from('cars_catalog').select('id,name,accel_clip_id,brake_clip_id,horn_clip_id').order('name'),
      supabase.from('audio_clips').select('id,name,category').order('created_at'),
    ]);
    const cars = carsR.data || [];
    const clips = clipsR.data || [];
    const opt = (cat, sel) => `<option value="">—</option>` + clips.filter(c => !cat || c.category === cat || c.category === 'other')
      .map(c => `<option value="${c.id}" ${sel===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
    body.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">
      ${cars.map(c => `
        <div style="background:rgba(255,255,255,0.04);padding:8px;border-radius:8px;border:1px solid #2a2a2a;display:grid;grid-template-columns:160px 1fr 1fr 1fr 80px;gap:8px;align-items:center">
          <span style="font-weight:600">${esc(c.name)}</span>
          <label style="font-size:11px">Aceleração<br><select data-car="${c.id}" data-fld="accel_clip_id" style="background:#1e293b;color:#eee;border:1px solid #444;border-radius:4px;padding:3px 4px;width:100%">${opt('car_engine', c.accel_clip_id)}</select></label>
          <label style="font-size:11px">Freio<br><select data-car="${c.id}" data-fld="brake_clip_id" style="background:#1e293b;color:#eee;border:1px solid #444;border-radius:4px;padding:3px 4px;width:100%">${opt('car_brake', c.brake_clip_id)}</select></label>
          <label style="font-size:11px">Buzina<br><select data-car="${c.id}" data-fld="horn_clip_id" style="background:#1e293b;color:#eee;border:1px solid #444;border-radius:4px;padding:3px 4px;width:100%">${opt('car_horn', c.horn_clip_id)}</select></label>
          <button data-savcar="${c.id}" type="button" style="background:#1e40af;color:#fff;border:0;border-radius:4px;padding:4px 8px;cursor:pointer">Salvar</button>
        </div>`).join('') || '<div style="opacity:.6">Nenhum carro no catálogo.</div>'}
    </div>`;
    body.querySelectorAll('[data-savcar]').forEach(b => b.onclick = async () => {
      const id = b.dataset.savcar;
      const patch = {};
      body.querySelectorAll(`[data-car="${id}"]`).forEach(s => { patch[s.dataset.fld] = s.value || null; });
      try {
        await supabase.from('cars_catalog').update(patch).eq('id', id);
        window.dispatchEvent(new Event('audio:reload'));
        b.textContent = '✓'; setTimeout(() => b.textContent = 'Salvar', 1200);
      } catch (e) { alert(e.message || e); }
    });
  }

  // ---------- Volumes & timing ----------
  async function renderVolumes(body) {
    const supabase = await sb();
    const { data: cfg } = await supabase.from('audio_settings').select('*').eq('scope','global').maybeSingle();
    const c = cfg || {};
    const slider = (id, lbl, min, max, step, val, unit='') =>
      `<label style="display:grid;grid-template-columns:200px 1fr 70px;gap:8px;align-items:center">
        <span>${lbl}</span>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val ?? ''}">
        <span id="${id}_v" style="font-family:monospace;font-size:12px;opacity:.8">${val}${unit}</span>
      </label>`;
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;max-width:640px">
        <h3 style="margin:0 0 4px;font-size:14px">Volumes (0 - 1)</h3>
        ${slider('master_volume','Master',0,1,0.01,c.master_volume)}
        ${slider('ambient_volume','Ambiente',0,1,0.01,c.ambient_volume)}
        ${slider('sfx_volume','SFX (passos, objetos)',0,1,0.01,c.sfx_volume)}
        ${slider('voice_volume','Voz',0,1,0.01,c.voice_volume)}
        ${slider('engine_volume','Motor / freio',0,1,0.01,c.engine_volume)}
        <h3 style="margin:10px 0 4px;font-size:14px">Passos</h3>
        ${slider('footstep_walk_interval_ms','Intervalo andando',150,900,10,c.footstep_walk_interval_ms,'ms')}
        ${slider('footstep_run_interval_ms','Intervalo correndo',100,700,10,c.footstep_run_interval_ms,'ms')}
        <h3 style="margin:10px 0 4px;font-size:14px">Áudio 3D</h3>
        ${slider('hearing_radius_m','Raio de audição (m)',3,80,1,c.hearing_radius_m,'m')}
        ${slider('falloff_ref_distance','Distância de referência',0.5,10,0.1,c.falloff_ref_distance,'m')}
        ${slider('falloff_max_distance','Distância máxima',5,100,1,c.falloff_max_distance,'m')}
        ${slider('falloff_rolloff','Rolloff (queda)',0.1,4,0.05,c.falloff_rolloff)}
        <button id="volSave" type="button" style="background:#1e40af;color:#fff;border:0;border-radius:4px;padding:8px 14px;cursor:pointer;margin-top:10px;align-self:flex-start">Salvar</button>
      </div>`;
    body.querySelectorAll('input[type=range]').forEach(r => {
      const v = document.getElementById(r.id + '_v');
      r.addEventListener('input', () => { v.textContent = r.value + (v.textContent.replace(/[\d\.\-]/g,'')); });
    });
    $('#volSave', body).onclick = async () => {
      const fields = ['master_volume','ambient_volume','sfx_volume','voice_volume','engine_volume','footstep_walk_interval_ms','footstep_run_interval_ms','hearing_radius_m','falloff_ref_distance','falloff_max_distance','falloff_rolloff'];
      const patch = {};
      for (const f of fields) { const el = document.getElementById(f); if (el) patch[f] = f.endsWith('_ms') || f.endsWith('_m') || f.endsWith('_distance') || f === 'hearing_radius_m' ? parseFloat(el.value) : parseFloat(el.value); }
      try {
        if (c.id) await supabase.from('audio_settings').update(patch).eq('id', c.id);
        else await supabase.from('audio_settings').upsert({ scope:'global', ...patch }, { onConflict: 'scope' });
        window.GameAudio?.applyConfig?.(patch);
        alert('Salvo!');
      } catch (e) { alert(e.message || e); }
    };
  }

  // Botão no topbar
  function ensureButton() {
    if (document.getElementById('audioAdminToggle')) return;
    const btn = document.createElement('button');
    btn.id = 'audioAdminToggle';
    btn.className = 'admin-only';
    btn.type = 'button';
    btn.title = 'Áudios do jogo (admin)';
    btn.textContent = '🔊 Áudios';
    btn.style.cssText = 'position:absolute;top:12px;left:1130px;z-index:30;background:rgba(15,23,42,0.85);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:6px 10px;cursor:pointer;backdrop-filter:blur(6px);font:13px system-ui';
    btn.onclick = open;
    // injeta no mesmo container dos outros admin buttons
    const ref = document.getElementById('animAdminToggle') || document.getElementById('speedAdminToggle') || document.body;
    ref.parentNode.appendChild(btn);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureButton);
  } else { ensureButton(); }
  // Reaplica em troca de visibilidade admin
  setInterval(ensureButton, 2000);

  window.AudioAdmin = { open };
})();
