import * as THREE from "three";
import { OrbitControls } from "/vendor/OrbitControls.js";
import { GLTFLoader } from "/vendor/GLTFLoader.js";
import { GLTFExporter } from "/vendor/GLTFExporter.js";
import { FBXLoader } from "/vendor/FBXLoader.js";
import { clone as cloneSkeleton, retargetClip as retargetClipBake } from "/vendor/utils/SkeletonUtils.js";

// Biblioteca compartilhada de animações (GLB sem skin, só esqueleto + clip)
const SHARED_ANIM_LIBRARY = {
  idle: "/assets/animations/idle.fbx",
  walk: "/assets/animations/walk.fbx",
  run: "/assets/animations/run.fbx",
  jump: "/assets/animations/jump.fbx",
  dance: "/assets/animations/dance.fbx",
  wave: "/assets/animations/wave.fbx",
};
const sharedAnimSourceCache = new Map(); // url -> Promise<Object3D scene with .animations>
function loadSharedAnimSource(url) {
  if (!sharedAnimSourceCache.has(url)) {
    sharedAnimSourceCache.set(
      url,
      (async () => {
        const isGlb = /\.glb(\?|$)/i.test(url);
        return isGlb ? await loadGlbAsScene(url) : await loadFbxFromUrl(url);
      })().catch((e) => {
        sharedAnimSourceCache.delete(url);
        throw e;
      }),
    );
  }
  return sharedAnimSourceCache.get(url);
}
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============ Supabase ============
const SUPABASE_URL = "https://ajphaszjpizepjmnjxtm.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqcGhhc3pqcGl6ZXBqbW5qeHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjYzOTksImV4cCI6MjA5NDgwMjM5OX0.uA5QN5snoDSOq0alFQMl89o_L4pksRIOWlZT0wm2nk0";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
const LOGIN_DISABLED_FOR_TEST = false;

function getGuestUser() {
  const idKey = "neon-tap-room-guest-id";
  let id = localStorage.getItem(idKey);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(idKey, id);
  }
  return {
    id,
    user_metadata: {
      nickname: localStorage.getItem("neon-tap-room-nickname") || "Visitante",
    },
  };
}

// ============ DOM ============
const canvas = document.querySelector("#worldCanvas");
const worldShell = document.querySelector("#worldShell");
const nameplatesLayer = document.querySelector("#nameplates");
const onlineCount = document.querySelector("#onlineCount");
const chatLog = document.querySelector("#chatLog");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const nameInput = document.querySelector("#nameInput");
const joinButton = document.querySelector("#joinButton");
const glbInput = document.querySelector("#glbInput");
const avatarInput = document.querySelector("#avatarInput");
const placeButton = document.querySelector("#placeButton");
const exportButton = document.querySelector("#exportButton");
const cameraButton = document.querySelector("#cameraButton");
const assetList = document.querySelector("#assetList");
const roleBadge = document.querySelector("#roleBadge");
const logoutButton = document.querySelector("#logoutButton");
const changeCharacterButton = document.querySelector("#changeCharacterButton");
const changeMapButton = document.querySelector("#changeMapButton");
const manageCharactersButton = document.querySelector("#manageCharactersButton");
const emoteJumpButton = document.querySelector("#emoteJump");
const emoteDanceButton = document.querySelector("#emoteDance");
const emoteWaveButton = document.querySelector("#emoteWave");

// Character select overlay
const characterSelectOverlay = document.querySelector("#characterSelectOverlay");
const characterGrid = document.querySelector("#characterGrid");
const characterNicknameInput = document.querySelector("#characterNickname");
const enterRoomButton = document.querySelector("#enterRoomButton");
const characterSelectError = document.querySelector("#characterSelectError");

// Character admin overlay
const characterAdminOverlay = document.querySelector("#characterAdminOverlay");
const characterAdminList = document.querySelector("#characterAdminList");
const characterAdminClose = document.querySelector("#characterAdminClose");

// Auth overlay
const authOverlay = document.querySelector("#authOverlay");
const authForm = document.querySelector("#authForm");
const authEmail = document.querySelector("#authEmail");
const authPassword = document.querySelector("#authPassword");
const authNickname = document.querySelector("#authNickname");
const authTitle = document.querySelector("#authTitle");
const authHint = document.querySelector("#authHint");
const authSubmit = document.querySelector("#authSubmit");
const authSwitch = document.querySelector("#authSwitch");
const authError = document.querySelector("#authError");

const MAP_WIDTH = 18;
const MAP_DEPTH = 14;
const clock = new THREE.Clock();
const loader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const exporter = new GLTFExporter();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorHit = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

let myId = "";
let me = null; // { id, name, color, x, y, facing, speech, isAdmin, avatar_url }
let players = []; // all current players including me
let selectedAsset = null;
let placementMode = false;
let movingAssetId = "";
let editingAssetId = "";
let followCamera = true;
let lastMoveSent = 0;
let isAdmin = false;
let currentAssets = [];
let presenceChannel = null;
let movementChannel = null;
let mapChannel = null;
let chatChannel = null;
let lastSpeechClear = 0;
let charactersCatalog = []; // [{slug, name, ...urls, thumbnail_url}]
let selectedCharacterSlug = null; // tile escolhido na tela de seleção
const characterCache = new Map(); // slug -> Promise<{base, clips}>
const ANIMATION_SLOTS = ["base", "idle", "walk", "run", "jump", "dance", "wave"];
const EMOTE_SLOTS = new Set(["jump", "dance", "wave"]);

const playerEntities = new Map(); // id -> { group, mixer, actions, currentAction, target, plate, player, avatarUrl }
const assetObjects = new Map();
const keyState = new Set();

// ============ Maps catalog ============
const MAPS = [
  { id: "bar",      name: "Bar Neon",   url: "/assets/maps/bar.glb",      mood: "night", bg: "#08090c", thumb: "🍻" },
  { id: "old_bar",  name: "Bar Antigo", url: "/assets/maps/old_bar.glb",  mood: "night", bg: "#1a120a", thumb: "🥃" },
  { id: "milk_bar", name: "Milk Bar",   url: "/assets/maps/milk_bar.glb", mood: "day",   bg: "#dfeaf2", thumb: "🥤" },
  { id: "scifi",    name: "Sci-Fi",     url: "/assets/maps/scifi.glb",    mood: "night", bg: "#040814", thumb: "🛸" },
  { id: "cinema",   name: "Cinema",     url: "/assets/maps/cinema.glb",   mood: "night", bg: "#0a0a14", thumb: "🎬" },
  { id: "beach",    name: "Praia",      url: "/assets/maps/beach.glb",    mood: "day",   bg: "#9bd3e0", thumb: "🏖️" },
];
let currentMapId = localStorage.getItem("neon-tap-room-map") || "bar";
let selectedMapId = currentMapId;


// ============ Scene ============
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0e1117");
scene.fog = new THREE.Fog("#0e1117", 16, 36);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 90);
camera.position.set(4.6, 4.2, 5.0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 2.5;
controls.maxDistance = 11;
controls.target.set(0, 1.0, 0);

const stage = new THREE.Group();
scene.add(stage);

// buildMap/resize/animate are kicked off at the bottom of the file,
// after all module-scope consts they depend on are initialized (TDZ-safe).

// ============ Auth bootstrap ============
let authMode = "signin"; // or "signup"
function showAuth(mode = "signin") {
  if (LOGIN_DISABLED_FOR_TEST) {
    hideAuth();
    return;
  }
  authMode = mode;
  authOverlay.style.display = "grid";
  authOverlay.hidden = false;
  authError.hidden = true;
  if (mode === "signin") {
    authTitle.textContent = "Entrar";
    authHint.textContent = "Use email e senha pra entrar na sala.";
    authSubmit.textContent = "Entrar";
    authSwitch.textContent = "Criar conta";
    authNickname.hidden = true;
    authNickname.required = false;
  } else {
    authTitle.textContent = "Criar conta";
    authHint.textContent = "Sua conta vira seu personagem. Primeiro usuário = admin.";
    authSubmit.textContent = "Cadastrar";
    authSwitch.textContent = "Já tenho conta";
    authNickname.hidden = false;
    authNickname.required = true;
  }
}
function hideAuth() {
  authOverlay.hidden = true;
  authOverlay.style.display = "none";
}
function showAuthError(msg) {
  authError.textContent = msg;
  authError.hidden = false;
}
authSwitch.addEventListener("click", () => showAuth(authMode === "signin" ? "signup" : "signin"));
function setAuthBusy(isBusy) {
  authSubmit.disabled = isBusy;
  authSwitch.disabled = isBusy;
  if (isBusy) {
    authSubmit.textContent = authMode === "signup" ? "Cadastrando…" : "Entrando…";
  } else {
    authSubmit.textContent = authMode === "signup" ? "Cadastrar" : "Entrar";
  }
}

function translateAuthError(err) {
  const msg = err?.message || "";
  const code = err?.code || "";
  if (code === "missing_fields") return "Preencha email e senha.";
  if (code === "invalid_credentials" || /invalid login/i.test(msg)) return "Email ou senha incorretos.";
  if (code === "user_already_exists") return "Esse email já tem conta. Use 'Já tenho conta' pra entrar.";
  if (code === "email_not_confirmed") return "Confirme seu email antes de entrar.";
  if (code === "weak_password" || /password/i.test(msg) && /6/.test(msg)) return "Senha precisa ter pelo menos 6 caracteres.";
  if (/email/i.test(msg) && /valid/i.test(msg)) return "Email inválido.";
  return msg || "Falha de autenticação.";
}

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.hidden = true;
  setAuthBusy(true);
  try {
    const email = authEmail.value.trim().toLowerCase();
    const password = authPassword.value.trim();
    if (!email || !password) throw { code: "missing_fields" };

    let signedInUser = null;
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { nickname: authNickname.value.trim() || "Visitante" },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        // Se já existe, tenta logar direto
        if (error.code === "user_already_exists") {
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (signInErr) throw signInErr;
          signedInUser = signInData.user;
        } else {
          throw error;
        }
      } else if (!data.session) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) {
          showAuthError("Conta criada. Verifique seu email para confirmar antes de entrar.");
          return;
        }
        signedInUser = signInData.user;
      } else {
        signedInUser = data.user;
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      signedInUser = data.user;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const user = signedInUser || sessionData.session?.user;
    if (user) {
      hideAuth();
      await bootstrapSession(user);
    }
  } catch (err) {
    console.error("[auth]", err);
    showAuthError(translateAuthError(err));
  } finally {
    setAuthBusy(false);
  }
});

logoutButton.addEventListener("click", async () => {
  if (!LOGIN_DISABLED_FOR_TEST) await supabase.auth.signOut();
  location.reload();
});

// TEMP: login desativado para teste. Entra direto como convidado local.
if (!LOGIN_DISABLED_FOR_TEST) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      hideAuth();
      bootstrapSession(session.user);
    }
  });
}

(async () => {
  hideAuth();
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session?.user) {
    bootstrapSession(existing.session.user);
    return;
  }
  showAuth("signin");
})();

async function bootstrapSession(user) {
  if (myId === user.id) return; // already bootstrapped
  myId = user.id;

  // Load profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, color, avatar_url, character_slug")
    .eq("id", user.id)
    .maybeSingle();

  const nickname = profile?.nickname || user.user_metadata?.nickname || localStorage.getItem("neon-tap-room-nickname") || "Visitante";
  const color = profile?.color || randomColor();
  const avatarUrl = profile?.avatar_url || null;
  const characterSlug = profile?.character_slug || localStorage.getItem("neon-tap-room-character") || null;
  nameInput.value = nickname;

  // Admin?
  if (LOGIN_DISABLED_FOR_TEST) {
    isAdmin = false;
  } else {
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    isAdmin = !!roleRow;
  }

  me = {
    id: user.id,
    name: nickname,
    color,
    avatar_url: avatarUrl,
    character_slug: characterSlug,
    x: 50,
    y: 50,
    facing: "down",
    speech: "",
    anim: "idle",
    isAdmin,
  };

  renderPermissions();
  await loadCharactersCatalog();
  // Sempre mostra a tela de seleção de personagem antes de entrar
  openCharacterSelect();
}

async function enterRoom() {
  await Promise.all([loadInitialAssets(), loadInitialChat()]);
  await connectRealtime();
  addSystemLine(isAdmin ? "Você entrou como admin da sala." : "Bem-vindo à sala!");
}

function randomColor() {
  const palette = ["#29d3bd", "#f4bd4f", "#a78bfa", "#f26868", "#74c0fc", "#ffa94d"];
  return palette[Math.floor(Math.random() * palette.length)];
}

// ============ Characters ============
async function loadCharactersCatalog() {
  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .order("position", { ascending: true });
  if (error) {
    console.warn("Não consegui carregar personagens", error);
    charactersCatalog = [];
    return;
  }
  charactersCatalog = data || [];
}

function openCharacterSelect() {
  if (!characterSelectOverlay) return;
  renderCharacterTiles();
  characterNicknameInput.value = me?.name && me.name !== "Visitante" ? me.name : "";
  selectedCharacterSlug = me?.character_slug || charactersCatalog.find((c) => c.base_url)?.slug || null;
  updateEnterButtonState();
  const label = document.querySelector("#currentAccountLabel");
  if (label) {
    supabase.auth.getUser().then(({ data }) => {
      label.textContent = data?.user?.email ? `Conectado como ${data.user.email}` : "";
    });
  }
  characterSelectOverlay.hidden = false;
}
document.querySelector("#characterSelectLogout")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.reload();
});
function closeCharacterSelect() {
  if (characterSelectOverlay) characterSelectOverlay.hidden = true;
}

function renderCharacterTiles() {
  if (!characterGrid) return;
  if (!charactersCatalog.length) {
    characterGrid.innerHTML = `<div class="char-hint">Nenhum personagem disponível ainda.</div>`;
    return;
  }
  characterGrid.innerHTML = charactersCatalog
    .map((c) => {
      const isSelected = selectedCharacterSlug === c.slug;
      const ready = !!c.base_url;
      const thumb = c.thumbnail_url
        ? `<img src="${escapeHtml(c.thumbnail_url)}" alt="${escapeHtml(c.name)}">`
        : "🧍";
      return `
        <div class="char-tile ${isSelected ? "is-selected" : ""} ${ready ? "" : "is-disabled"}"
             data-character-slug="${escapeHtml(c.slug)}">
          <div class="char-tile-thumb">${thumb}</div>
          <div class="char-tile-name">${escapeHtml(c.name)}</div>
          ${ready ? "" : `<div class="char-tile-warn">Sem arquivos</div>`}
        </div>`;
    })
    .join("");
}

function updateEnterButtonState() {
  if (!enterRoomButton) return;
  const character = charactersCatalog.find((c) => c.slug === selectedCharacterSlug);
  const hasFiles = !!character?.base_url;
  enterRoomButton.disabled = !selectedCharacterSlug || !hasFiles;
}

characterGrid?.addEventListener("click", (event) => {
  const tile = event.target.closest("[data-character-slug]");
  if (!tile) return;
  selectedCharacterSlug = tile.dataset.characterSlug;
  renderCharacterTiles();
  updateEnterButtonState();
});

enterRoomButton?.addEventListener("click", async () => {
  if (!me || !selectedCharacterSlug) return;
  const newName = (characterNicknameInput.value || "").trim() || "Visitante";
  const character = charactersCatalog.find((c) => c.slug === selectedCharacterSlug);
  if (!character?.base_url) {
    characterSelectError.hidden = false;
    characterSelectError.textContent = "Esse personagem ainda não tem arquivos carregados.";
    return;
  }
  characterSelectError.hidden = true;
  me.name = newName;
  me.character_slug = selectedCharacterSlug;
  localStorage.setItem("neon-tap-room-nickname", newName);
  localStorage.setItem("neon-tap-room-character", selectedCharacterSlug);
  nameInput.value = newName;
  // Salva no banco (upsert pra cobrir o caso do profile ainda não existir)
  await supabase.from("profiles").upsert({
    id: me.id,
    nickname: newName,
    color: me.color,
    character_slug: selectedCharacterSlug,
  });
  closeCharacterSelect();
  // Se já estávamos na sala, atualiza meu próprio entity
  const myEntity = playerEntities.get(myId);
  if (myEntity) {
    await applyCharacter(myEntity, selectedCharacterSlug);
    await trackMe();
  } else {
    // Primeira vez entrando: pede pra escolher o local antes de spawnar
    openMapSelect();
  }
});

changeCharacterButton?.addEventListener("click", () => {
  openCharacterSelect();
});

changeMapButton?.addEventListener("click", () => {
  openMapSelect();
});

// ===== Map (location) select =====
const mapSelectOverlay = document.querySelector("#mapSelectOverlay");
const mapGrid = document.querySelector("#mapGrid");
const confirmMapButton = document.querySelector("#confirmMapButton");
const mapSelectBack = document.querySelector("#mapSelectBack");

function openMapSelect() {
  if (!mapSelectOverlay) return;
  selectedMapId = currentMapId;
  renderMapTiles();
  updateConfirmMapButton();
  mapSelectOverlay.hidden = false;
}
function closeMapSelect() {
  if (mapSelectOverlay) mapSelectOverlay.hidden = true;
}
function renderMapTiles() {
  if (!mapGrid) return;
  mapGrid.innerHTML = MAPS.map((m) => {
    const isSelected = selectedMapId === m.id;
    const moodLabel = m.mood === "day" ? "☀️ Dia" : "🌙 Noite";
    return `
      <div class="char-tile ${isSelected ? "is-selected" : ""}" data-map-id="${m.id}">
        <div class="char-tile-thumb" style="font-size:32px">${m.thumb}</div>
        <div class="char-tile-name">${m.name}</div>
        <div class="char-tile-warn" style="background:transparent;color:#aeb6c4">${moodLabel}</div>
      </div>`;
  }).join("");
}
function updateConfirmMapButton() {
  if (!confirmMapButton) return;
  confirmMapButton.disabled = !selectedMapId;
}
mapGrid?.addEventListener("click", (e) => {
  const tile = e.target.closest("[data-map-id]");
  if (!tile) return;
  selectedMapId = tile.dataset.mapId;
  renderMapTiles();
  updateConfirmMapButton();
});
mapSelectBack?.addEventListener("click", () => {
  closeMapSelect();
  // Se ainda não entrou na sala, volta pra escolher personagem
  if (!playerEntities.get(myId)) openCharacterSelect();
});
confirmMapButton?.addEventListener("click", async () => {
  if (!selectedMapId) return;
  const switching = selectedMapId !== currentMapId;
  if (switching) {
    loadEnvironment(selectedMapId);
    // Reposiciona meu avatar perto da origem do novo cenário
    const myEntity = playerEntities.get(myId);
    if (myEntity) {
      myEntity.group.position.set(0, 0, 0);
      if (me) { me.x = 50; me.y = 50; }
    }
  }
  closeMapSelect();
  if (!playerEntities.get(myId)) {
    await enterRoom();
  }
});


characterAdminClose?.addEventListener("click", () => {
  if (characterAdminOverlay) characterAdminOverlay.hidden = true;
});

// ===== Admin: gerenciar personagens =====
const CHAR_SLOTS = [
  { key: "base", label: "Base (modelo)", accept: ".fbx", ext: "fbx" },
  { key: "idle", label: "Idle (parado)", accept: ".fbx", ext: "fbx" },
  { key: "walk", label: "Walk (andar)", accept: ".fbx", ext: "fbx" },
  { key: "run", label: "Run (correr)", accept: ".fbx", ext: "fbx" },
  { key: "jump", label: "Jump (pular)", accept: ".fbx", ext: "fbx" },
  { key: "dance", label: "Dance (dançar)", accept: ".fbx", ext: "fbx" },
  { key: "wave", label: "Wave (acenar)", accept: ".fbx", ext: "fbx" },
  { key: "thumbnail", label: "Miniatura", accept: "image/*", ext: "png" },
];

function openCharacterAdmin() {
  if (!isAdmin) {
    alert("Apenas admin pode gerenciar personagens.");
    return;
  }
  if (!characterAdminOverlay) return;
  characterAdminOverlay.hidden = false;
  renderCharacterAdmin();
}

async function renderCharacterAdmin() {
  if (!characterAdminList) return;
  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .order("position", { ascending: true });
  if (error) {
    characterAdminList.innerHTML = `<div class="char-hint">Erro: ${escapeHtml(error.message)}</div>`;
    return;
  }
  charactersCatalog = data || [];

  characterAdminList.innerHTML = `
    <div class="char-admin-row" style="background: rgba(41,211,189,0.08)">
      <div class="char-admin-row-head">
        <div class="char-admin-name">+ Novo personagem</div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <input id="newCharName" type="text" placeholder="Nome (ex: Hero)" maxlength="40"
          style="flex:1; min-width:160px; padding:8px; border-radius:6px; background:#1a1f2a; color:#fff; border:1px solid rgba(255,255,255,0.1);">
        <input id="newCharSlug" type="text" placeholder="slug-único" maxlength="40"
          style="flex:1; min-width:160px; padding:8px; border-radius:6px; background:#1a1f2a; color:#fff; border:1px solid rgba(255,255,255,0.1);">
        <button id="createCharBtn" type="button" class="char-enter" style="padding:8px 14px;">Criar</button>
      </div>
    </div>
  ` + charactersCatalog.map((c) => {
    const thumb = c.thumbnail_url
      ? `<img src="${escapeHtml(c.thumbnail_url)}" alt="">`
      : "🧍";
    const slots = CHAR_SLOTS.map((s) => {
      const urlKey = s.key === "thumbnail" ? "thumbnail_url" : `${s.key}_url`;
      const hasUrl = !!c[urlKey];
      return `
        <div class="char-slot">
          <div class="char-slot-label">${s.label}</div>
          <div class="char-slot-status ${hasUrl ? "ok" : "empty"}">${hasUrl ? "✓ ok" : "vazio"}</div>
          <label class="file-picker">
            <input type="file" accept="${s.accept}" data-char-slug="${escapeHtml(c.slug)}" data-char-slot="${s.key}">
            ${hasUrl ? "Trocar" : "Subir"}
          </label>
        </div>`;
    }).join("");
    return `
      <div class="char-admin-row" data-row-slug="${escapeHtml(c.slug)}">
        <div class="char-admin-row-head">
          <div class="char-admin-thumb">${thumb}</div>
          <div style="flex:1">
            <div class="char-admin-name">${escapeHtml(c.name)}</div>
            <div class="char-admin-slug">${escapeHtml(c.slug)}</div>
          </div>
          <button type="button" class="auth-link" data-delete-char="${escapeHtml(c.slug)}" style="color:#ff6b6b;">Remover</button>
        </div>
        <div class="char-admin-grid">${slots}</div>
      </div>`;
  }).join("");

  characterAdminList.querySelectorAll("input[type=file][data-char-slug]").forEach((inp) => {
    inp.addEventListener("change", () => handleCharacterUpload(inp));
  });
  characterAdminList.querySelectorAll("[data-delete-char]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const slug = btn.getAttribute("data-delete-char");
      if (!confirm(`Remover personagem "${slug}"?`)) return;
      const { error } = await supabase.from("characters").delete().eq("slug", slug);
      if (error) { alert(error.message); return; }
      await renderCharacterAdmin();
      await loadCharactersCatalog();
    });
  });
  const createBtn = characterAdminList.querySelector("#createCharBtn");
  createBtn?.addEventListener("click", async () => {
    const name = characterAdminList.querySelector("#newCharName").value.trim();
    const slug = characterAdminList.querySelector("#newCharSlug").value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!name || !slug) { alert("Preencha nome e slug."); return; }
    const nextPos = (charactersCatalog.reduce((m, c) => Math.max(m, c.position || 0), 0) || 0) + 1;
    const { error } = await supabase.from("characters").insert({ slug, name, position: nextPos });
    if (error) { alert(error.message); return; }
    await renderCharacterAdmin();
    await loadCharactersCatalog();
  });
}

async function handleCharacterUpload(input) {
  const file = input.files?.[0];
  if (!file) return;
  const slug = input.getAttribute("data-char-slug");
  const slotKey = input.getAttribute("data-char-slot");
  const slotDef = CHAR_SLOTS.find((s) => s.key === slotKey);
  const ext = file.name.split(".").pop()?.toLowerCase() || slotDef.ext;
  const path = `${slug}/${slotKey}.${ext}`;
  const status = input.closest(".char-slot")?.querySelector(".char-slot-status");
  if (status) { status.textContent = "enviando..."; status.className = "char-slot-status"; }
  try {
    const { error: upErr } = await supabase.storage
      .from("characters")
      .upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("characters").getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    const patch = {};
    if (slotKey === "thumbnail") patch.thumbnail_url = url;
    else {
      patch[`${slotKey}_url`] = url;
      const cur = charactersCatalog.find((c) => c.slug === slug);
      if (slotKey === "idle" && !cur?.base_url) patch.base_url = url;
      if (slotKey === "base") patch.base_url = url;
    }
    const { error: dbErr } = await supabase.from("characters").update(patch).eq("slug", slug);
    if (dbErr) throw dbErr;
    characterCache.delete(slug);
    await renderCharacterAdmin();
    await loadCharactersCatalog();
  } catch (err) {
    alert("Falha no upload: " + (err?.message || err));
    if (status) { status.textContent = "erro"; status.className = "char-slot-status empty"; }
  } finally {
    input.value = "";
  }
}

manageCharactersButton?.addEventListener("click", openCharacterAdmin);
document.querySelector("#adminShortcut")?.addEventListener("click", openCharacterAdmin);

// ============ Character loader (FBX + animations) ============
// Usamos XHR direto (evita o wrapper de fetch da preview que quebra em arquivos grandes)
function fetchFbxBuffer(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
      else reject(new Error(`HTTP ${xhr.status} em ${url}`));
    };
    xhr.onerror = () => reject(new Error(`Erro de rede em ${url}`));
    xhr.send();
  });
}
async function loadFbxFromUrl(url) {
  const buffer = await fetchFbxBuffer(url);
  return fbxLoader.parse(buffer, "");
}
async function loadGlbAsScene(url) {
  const buffer = await fetchFbxBuffer(url);
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(buffer, "", resolve, reject);
  });
  const scene = gltf.scene || gltf.scenes?.[0];
  if (!scene) throw new Error(`GLB sem cena em ${url}`);
  scene.animations = gltf.animations || [];
  return scene;
}

function normalizeBoneName(name = "") {
  return name.replace(/^mixamorig:?/i, "").toLowerCase();
}

// Coleta nomes de bones de um objeto skinned
function collectBoneNames(root) {
  const set = new Set();
  root.traverse((o) => {
    if (o.isBone) set.add(o.name);
    if (o.isSkinnedMesh && o.skeleton) {
      for (const b of o.skeleton.bones) set.add(b.name);
    }
  });
  return set;
}

// Renomeia tracks de um clip para casar com os bones do alvo
// (ex.: Mixamo FBX usa "mixamorigHips" e o GLB usa "Hips")
// opts.stripRootRotation: remove a rotação absoluta do Hips para evitar que
// o avatar GLB "deite" quando recebe clips Mixamo cuja bind pose difere.
function retargetClipToBones(clip, targetBoneNames, opts = {}) {
  const out = clip.clone();
  const tracks = [];
  for (const t of out.tracks) {
    const dot = t.name.indexOf(".");
    if (dot < 0) { tracks.push(t); continue; }
    const boneName = t.name.slice(0, dot);
    const prop = t.name.slice(dot);
    let candidate = boneName;
    if (!targetBoneNames.has(candidate) && candidate.startsWith("mixamorig")) {
      candidate = candidate.replace(/^mixamorig:?/, "");
    }
    if (!targetBoneNames.has(candidate)) {
      const withPrefix = "mixamorig" + boneName;
      if (targetBoneNames.has(withPrefix)) candidate = withPrefix;
    }
    if (!targetBoneNames.has(candidate)) continue;
    // Strip rotação/posição absoluta do Hips: mantém só animação relativa dos
    // membros, evitando que o personagem tombe ou afunde no chão.
    if (opts.stripRootRotation && /hips?$/i.test(candidate)) {
      if (prop === ".quaternion" || prop === ".position") continue;
    }
    const nt = t.clone();
    nt.name = candidate + prop;
    tracks.push(nt);
  }
  if (!tracks.length) return null;
  out.tracks = tracks;
  return out;
}

// Bake-retarget: resolve diferenças de bind pose / escala entre o rig do GLB e o FBX Mixamo.
// Sem isso, o personagem fica "deitado" porque os tracks rotacionais são aplicados sobre uma bind pose diferente.
function bakeRetargetMixamoClip(targetRoot, sourceRoot, clip) {
  let targetSkinned = null, sourceSkinned = null;
  targetRoot.traverse((o) => { if (!targetSkinned && o.isSkinnedMesh) targetSkinned = o; });
  sourceRoot.traverse((o) => { if (!sourceSkinned && o.isSkinnedMesh) sourceSkinned = o; });
  if (!targetSkinned || !sourceSkinned) return null;

  const sourceByNormalized = new Map();
  for (const b of sourceSkinned.skeleton.bones) sourceByNormalized.set(normalizeBoneName(b.name), b.name);
  const names = {};
  let hipName = null;
  for (const b of targetSkinned.skeleton.bones) {
    const sourceName = sourceByNormalized.get(normalizeBoneName(b.name));
    if (sourceName) {
      names[b.name] = sourceName;
      if (/hips?$/i.test(b.name)) hipName = sourceName;
    }
  }
  if (!Object.keys(names).length) return null;

  try {
    return retargetClipBake(targetSkinned, sourceSkinned, clip, {
      names,
      hip: hipName || "mixamorigHips",
      useFirstFramePosition: true,
      preserveHipPosition: true,
      fps: 30,
    });
  } catch (e) {
    console.warn("[retarget] bake falhou, usando rename-only", e);
    return null;
  }
}

function loadCharacterAssets(character) {
  if (!character?.slug) return Promise.reject(new Error("Sem personagem"));
  if (characterCache.has(character.slug)) return characterCache.get(character.slug);
  const promise = (async () => {
    if (!character.base_url) throw new Error("Personagem sem base");
    const isGlb = /\.glb(\?|$)/i.test(character.base_url);
    const base = isGlb
      ? await loadGlbAsScene(character.base_url)
      : await loadFbxFromUrl(character.base_url);
    let box = new THREE.Box3().setFromObject(base);
    let size = box.getSize(new THREE.Vector3());
    // Normaliza escala
    const height = size.y || 1;
    const targetHeight = 1.8;
    const scale = targetHeight / height;
    base.scale.setScalar(scale);
    base.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(base);
    base.position.y -= box.min.y;
    base.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
        if (child.material) {
          (Array.isArray(child.material) ? child.material : [child.material]).forEach((m) => {
            m.side = THREE.FrontSide;
          });
        }
      }
    });
    const targetBones = collectBoneNames(base);
    const clips = {};
    const animSlots = ["idle", "walk", "run", "jump", "dance", "wave"];

    // 1) Animações embutidas no próprio GLB (prioridade máxima)
    if (base.animations?.length) {
      for (const a of base.animations) {
        if (!a || a.duration <= 0.05) continue;
        const lname = (a.name || "").toLowerCase();
        let slot = null;
        for (const s of animSlots) if (lname.includes(s)) { slot = s; break; }
        if (slot && !clips[slot]) {
          const c = a.clone();
          c.name = slot;
          clips[slot] = c;
          console.log(`[char ${character.slug}] clip embutido -> "${slot}"`);
        }
      }
    }

    // Fallback mínimo: garante slot "idle" mesmo que nada carregue depois.
    if (!clips.idle) clips.idle = new THREE.AnimationClip("idle", 1, []);

    // 2) Para cada slot: usa override do banco; senão, biblioteca compartilhada
    await Promise.all(
      animSlots.map(async (slot) => {
        if (clips[slot]) return;
        const override = character[`${slot}_url`];
        const url = override || SHARED_ANIM_LIBRARY[slot];
        if (!url) return;
        try {
          const src = await loadSharedAnimSource(url);
          const clip = src.animations?.[0];
          if (!clip || clip.duration <= 0) return;
          // Para GLBs: pular o bake (gera bind-pose mismatch -> deita) e
          // aplicar rename-only descartando a rotação absoluta do Hips.
          let retarg = null;
          if (!isGlb) retarg = bakeRetargetMixamoClip(base, src, clip);
          if (!retarg) retarg = retargetClipToBones(clip, targetBones, { stripRootRotation: isGlb }) || clip.clone();
          retarg.name = slot;
          clips[slot] = retarg;
          console.log(`[char ${character.slug}] "${slot}" <- ${override ? "override" : "shared"}`);
        } catch (e) {
          console.warn(`[anim ${slot}] falhou para ${character.slug}`, e);
        }
      }),
    );

    return { base, clips, scale };
  })();
  characterCache.set(character.slug, promise);
  promise.catch(() => characterCache.delete(character.slug));
  return promise;
}

async function applyCharacter(entity, slug) {
  if (!slug) return;
  if (entity.characterSlug === slug) return;
  if (entity.pendingCharacterSlug === slug) return;
  const character = charactersCatalog.find((c) => c.slug === slug);
  if (!character) {
    console.warn(`[applyCharacter] personagem "${slug}" não encontrado no catálogo`);
    return;
  }
  entity.pendingCharacterSlug = slug;
  try {
    const { base, clips } = await loadCharacterAssets(character);
    // Caso outra troca tenha começado enquanto carregávamos, aborta.
    if (entity.pendingCharacterSlug !== slug) return;
    const cloned = cloneSkeleton(base);
    cloned.scale.copy(base.scale);
    cloned.position.set(0, 0, 0);
    // Remove personagem antigo + efeitos de loading
    if (entity.character) entity.group.remove(entity.character);
    if (entity.loadingFx) { entity.group.remove(entity.loadingFx); entity.loadingFx = null; }
    if (entity.loadingSpinner) { entity.loadingSpinner.remove(); entity.loadingSpinner = null; }
    entity.character = cloned;
    entity.group.add(cloned);
    entity.mixer = new THREE.AnimationMixer(cloned);
    entity.actions = {};
    for (const [name, clip] of Object.entries(clips)) {
      const action = entity.mixer.clipAction(clip);
      if (EMOTE_SLOTS.has(name) || name === "jump") {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = false;
      }
      entity.actions[name] = action;
    }
    entity.currentAction = null;
    entity.characterSlug = slug;
    entity.emoteAction = null;
    entity.emoteUntil = 0;
    entity.mixer.addEventListener("finished", (e) => {
      if (entity.emoteAction === e.action) {
        entity.emoteAction = null;
        entity.emoteUntil = 0;
      }
    });
    setPlayerAction(entity, "idle");
    console.log(`[applyCharacter] aplicado "${slug}" com clips:`, Object.keys(clips));
  } catch (err) {
    console.warn("Falha ao aplicar personagem", slug, err);
  } finally {
    if (entity.pendingCharacterSlug === slug) entity.pendingCharacterSlug = null;
  }
}

// ============ Realtime ============
async function loadInitialAssets() {
  const { data } = await supabase.from("map_assets").select("*").order("created_at");
  renderAssets((data || []).map(rowToAsset));
}
async function loadInitialChat() {
  chatLog.innerHTML = "";
  const { data } = await supabase
    .from("chat_messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(80);
  (data || []).forEach((m) => addMessage({ name: m.nickname, color: m.color, text: m.text }));
}

function rowToAsset(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    x: row.x,
    y: row.y ?? 0,
    z: row.z,
    rotationX: row.rotation_x ?? 0,
    rotationY: row.rotation_y,
    rotationZ: row.rotation_z ?? 0,
    scale: row.scale,
  };
}

async function connectRealtime() {
  // Garante que o websocket de realtime use o JWT atual (anon ou autenticado)
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) supabase.realtime.setAuth(token);
  } catch {}

  // Map assets via postgres changes
  if (mapChannel) await supabase.removeChannel(mapChannel);
  mapChannel = supabase
    .channel("room-map")
    .on("postgres_changes", { event: "*", schema: "public", table: "map_assets" }, () => {
      loadInitialAssets();
    })
    .subscribe();

  // Chat via postgres changes
  if (chatChannel) await supabase.removeChannel(chatChannel);
  chatChannel = supabase
    .channel("room-chat")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages" },
      (payload) => {
        const m = payload.new;
        addMessage({ name: m.nickname, color: m.color, text: m.text });
        // Set speech bubble briefly
        const entity = playerEntities.get(m.user_id);
        const player = players.find((p) => p.id === m.user_id);
        if (player) {
          player.speech = m.text;
          updateNameplate(player);
          clearTimeout(player._speechTimer);
          player._speechTimer = setTimeout(() => {
            const cur = players.find((p) => p.id === m.user_id);
            if (cur) {
              cur.speech = "";
              updateNameplate(cur);
            }
          }, 4500);
        }
      },
    )
    .subscribe();

  // Presence for players (join/leave roster)
  if (presenceChannel) await supabase.removeChannel(presenceChannel);
  presenceChannel = supabase.channel("room-presence", {
    config: { presence: { key: myId } },
  });

  presenceChannel
    .on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      const list = [];
      for (const id of Object.keys(state)) {
        const entry = state[id][0];
        if (entry) list.push({ ...entry, id });
      }
      // Preserve current positions for already-known players (broadcast owns x/y/facing/speech)
      const prev = new Map(players.map((p) => [p.id, p]));
      const merged = list.map((p) => {
        const old = prev.get(p.id);
        if (old) {
          return { ...p, x: old.x ?? p.x, y: old.y ?? p.y, facing: old.facing ?? p.facing, speech: old.speech ?? p.speech, running: old.running ?? false };
        }
        return p;
      });
      renderPlayers(merged);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track(presencePayload());
      }
    });

  // Movimento em canal separado: mais rápido e não depende do refresh do presence
  if (movementChannel) await supabase.removeChannel(movementChannel);
  movementChannel = supabase.channel("room-movement", {
    config: { broadcast: { self: false } },
  });
  movementChannel
    .on("broadcast", { event: "pos" }, ({ payload }) => {
      if (!payload || payload.id === myId) return;
      const idx = players.findIndex((p) => p.id === payload.id);
      if (idx >= 0) {
        players[idx] = { ...players[idx], x: payload.x, y: payload.y, facing: payload.facing, running: !!payload.running };
        const entity = playerEntities.get(payload.id);
        if (entity) {
          entity.player = players[idx];
          entity.target.copy(worldFromPercent(payload.x, payload.y));
          entity.running = !!payload.running;
        }
      }
    })
    .on("broadcast", { event: "emote" }, ({ payload }) => {
      if (!payload || payload.id === myId) return;
      const entity = playerEntities.get(payload.id);
      if (entity) playEmote(entity, payload.slot);
    })
    .subscribe();
}

function presencePayload() {
  return {
    id: myId,
    name: me.name,
    color: me.color,
    avatar_url: me.avatar_url,
    character_slug: me.character_slug || null,
    x: me.x,
    y: me.y,
    facing: me.facing,
    speech: me.speech || "",
    isAdmin,
  };
}

async function trackMe(updateRoster = true) {
  if (!presenceChannel) return;
  // Atualiza roster (nome/cor/avatar) via presence só quando necessário
  if (updateRoster) {
    try { await presenceChannel.track(presencePayload()); } catch {}
  }
  // Posição/facing via broadcast dedicado
  try {
    await movementChannel?.send({
      type: "broadcast",
      event: "pos",
      payload: { id: myId, x: me.x, y: me.y, facing: me.facing, running: !!me.running },
    });
  } catch {}
}

// ============ HUD permissions ============
function renderPermissions() {
  document.body.classList.toggle("is-admin", isAdmin);
  roleBadge.textContent = isAdmin ? "admin" : "visitante";
  if (glbInput) glbInput.disabled = !isAdmin;
  if (exportButton) exportButton.disabled = !isAdmin;
  if (placeButton) placeButton.disabled = !isAdmin || !selectedAsset;
  if (!isAdmin) {
    placementMode = false;
    movingAssetId = "";
    selectedAsset = null;
    placeButton?.classList.remove("is-active");
  }
}

// ============ Helpers ============
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}

function worldFromPercent(x, y) {
  return new THREE.Vector3(
    (x / 100 - 0.5) * MAP_WIDTH,
    0,
    (y / 100 - 0.5) * MAP_DEPTH,
  );
}
function percentFromWorld(x, z) {
  return {
    x: Math.max(5, Math.min(95, (x / MAP_WIDTH + 0.5) * 100)),
    y: Math.max(8, Math.min(92, (z / MAP_DEPTH + 0.5) * 100)),
  };
}

function material(color, roughness = 0.72, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function makeBox(name, size, position, color, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, options.roughness, options.metalness));
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  stage.add(mesh);
  return mesh;
}

// ============ Map (default scenery) ============
const colliderMeshes = [];   // walls / counters / chairs — block movement
const walkableMeshes = [];   // floor / stairs / ramps — drive Y height
const occluderMeshes = [];   // any visible env mesh — candidates for camera occlusion fade
const _fadedNow = new Set();
const _fadedPrev = new Set();
const _collRay = new THREE.Raycaster();
const _collDir = new THREE.Vector3();
const _collOrigin = new THREE.Vector3();
const _groundRay = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);
const _groundOrigin = new THREE.Vector3();
const COLLISION_RADIUS = 0.4;
const STAIR_NAME_RE = /stair|escad|step|ramp|slope/i;


// Lighting groups we can swap when the map mood changes
const lightingGroup = new THREE.Group();
scene.add(lightingGroup);

// Environment GLB group (cleared/replaced on map switch)
const envGroup = new THREE.Group();
let envBaseFloor = null;

function applyLightingForMood(mood) {
  // Clear previous lights
  while (lightingGroup.children.length) lightingGroup.remove(lightingGroup.children[0]);

  if (mood === "day") {
    lightingGroup.add(new THREE.HemisphereLight("#fff3d6", "#7a8a9c", 1.5));
    const sun = new THREE.DirectionalLight("#fff7e0", 1.6);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 50;
    sun.shadow.camera.left = -18; sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
    lightingGroup.add(sun);
  } else {
    lightingGroup.add(new THREE.HemisphereLight("#ffe7b0", "#243344", 1.1));
    const key = new THREE.DirectionalLight("#ffffff", 1.0);
    key.position.set(6, 10, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1; key.shadow.camera.far = 40;
    key.shadow.camera.left = -16; key.shadow.camera.right = 16;
    key.shadow.camera.top = 16; key.shadow.camera.bottom = -16;
    lightingGroup.add(key);

    const red = new THREE.PointLight("#f26868", 2.4, 12);
    red.position.set(-6.7, 3.2, -6.2);
    lightingGroup.add(red);

    const teal = new THREE.PointLight("#29d3bd", 1.8, 14);
    teal.position.set(5.7, 3.4, 3.6);
    lightingGroup.add(teal);
  }
}

function buildMap() {
  // Invisible base floor — used for click-to-move raycast & shadow receiver
  envBaseFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_WIDTH, MAP_DEPTH),
    new THREE.MeshStandardMaterial({ color: "#202832", roughness: 0.9, transparent: true, opacity: 0 }),
  );
  envBaseFloor.name = "WalkableFloor";
  envBaseFloor.rotation.x = -Math.PI / 2;
  envBaseFloor.receiveShadow = true;
  stage.add(envBaseFloor);

  scene.fog = null;
  stage.add(envGroup);

  // Load initial environment
  loadEnvironment(currentMapId);
}

function clearEnvironment() {
  while (envGroup.children.length) {
    const child = envGroup.children[0];
    envGroup.remove(child);
    child.traverse?.((n) => {
      if (n.geometry) n.geometry.dispose?.();
      if (n.material) {
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        mats.forEach((m) => m.dispose?.());
      }
    });
  }
  colliderMeshes.length = 0;
  occluderMeshes.length = 0;
  // Reset walkable but keep the invisible base floor
  walkableMeshes.length = 0;
  if (envBaseFloor) walkableMeshes.push(envBaseFloor);
  _fadedNow.clear();
  _fadedPrev.clear();
}

function loadEnvironment(mapId) {
  const map = MAPS.find((m) => m.id === mapId) || MAPS[0];
  currentMapId = map.id;
  localStorage.setItem("neon-tap-room-map", map.id);

  scene.background = new THREE.Color(map.bg);
  applyLightingForMood(map.mood);
  clearEnvironment();

  loader.load(
    map.url,
    (gltf) => {
      const env = gltf.scene;
      const box = new THREE.Box3().setFromObject(env);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const targetSize = Math.max(MAP_WIDTH, MAP_DEPTH) * 1.05;
      const currentSize = Math.max(size.x, size.z);
      const scale = currentSize > 0 ? targetSize / currentSize : 1;
      env.scale.setScalar(scale);
      env.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      env.updateMatrixWorld(true);

      // Determine "ceiling cutoff" — meshes whose bottom sits above this Y are hidden.
      // For open/outdoor maps with no roof, this won't hide anything important.
      const ceilingCutoff = 2.8;

      env.traverse((node) => {
        if (!node.isMesh) return;
        const meshBox = new THREE.Box3().setFromObject(node);
        const height = meshBox.max.y - meshBox.min.y;
        if (meshBox.min.y > ceilingCutoff) { node.visible = false; return; }
        node.castShadow = false;
        node.receiveShadow = true;
        occluderMeshes.push(node);

        const name = (node.name || "") + " " + (node.parent?.name || "");
        const isStair = STAIR_NAME_RE.test(name);
        const isLowSlope = height < 0.6 && meshBox.min.y < 0.05;
        if (isStair || isLowSlope) {
          walkableMeshes.push(node);
        } else if (meshBox.max.y > 0.35) {
          colliderMeshes.push(node);
        }
      });
      envGroup.add(env);
    },
    undefined,
    (err) => {
      console.error("Falha carregando cenário:", err);
      if (map.id !== "bar") {
        localStorage.removeItem("neon-tap-room-map");
        loadEnvironment("bar");
      }
    },
  );
}


// Returns the highest walkable surface Y under `pos` that is at or below the player's head.
function groundHeightAt(pos, currentY) {
  if (!walkableMeshes.length) return 0;
  _groundOrigin.set(pos.x, (currentY ?? pos.y) + 4, pos.z);
  _groundRay.set(_groundOrigin, _down);
  _groundRay.far = 20;
  const hits = _groundRay.intersectObjects(walkableMeshes, false);
  for (const h of hits) {
    if (h.point.y <= (currentY ?? pos.y) + 1.2) return h.point.y;
  }
  return currentY ?? 0;
}

// Returns true if moving from `from` to `to` would collide with a wall/counter/chair.
function collidesAt(from, to) {
  if (!colliderMeshes.length) return false;
  _collDir.copy(to).sub(from);
  _collDir.y = 0;
  const dist = _collDir.length();
  if (dist < 0.0001) return false;
  _collDir.normalize();
  // Two rays: knees & chest. Catches low chairs AND tall walls; stairs are walkable, not colliders.
  for (const yOff of [0.35, 1.2]) {
    _collOrigin.copy(from);
    _collOrigin.y = from.y + yOff;
    _collRay.set(_collOrigin, _collDir);
    _collRay.far = dist + COLLISION_RADIUS;
    const hits = _collRay.intersectObjects(colliderMeshes, false);
    if (hits.length && hits[0].distance < dist + COLLISION_RADIUS) return true;
  }
  return false;
}

// ============ Camera occlusion (hide walls between camera and player) ============
const _occRay = new THREE.Raycaster();
const _occDir = new THREE.Vector3();
const _occFrom = new THREE.Vector3();
const FADE_OPACITY = 0.0;


function setMeshFaded(mesh, faded) {
  if (!mesh.material) return;
  if (faded) {
    if (!mesh.userData._fadeMatClone) {
      // Clone material per-mesh so fading one wall doesn't affect every mesh that shares the material
      mesh.userData._origMaterial = mesh.material;
      mesh.material = mesh.material.clone();
      mesh.userData._fadeMatClone = true;
    }
    mesh.material.transparent = true;
    mesh.material.opacity = FADE_OPACITY;
    mesh.material.depthWrite = false;
    mesh.material.needsUpdate = true;
  } else if (mesh.userData._fadeMatClone) {
    mesh.material.dispose?.();
    mesh.material = mesh.userData._origMaterial;
    delete mesh.userData._origMaterial;
    delete mesh.userData._fadeMatClone;
  }
}

function updateCameraOcclusion() {
  _fadedNow.clear();
  const entity = myId ? playerEntities.get(myId) : null;
  if (entity && occluderMeshes.length) {
    _occFrom.copy(camera.position);
    _occDir.set(entity.group.position.x, entity.group.position.y + 1.1, entity.group.position.z).sub(_occFrom);
    const dist = _occDir.length();
    _occDir.normalize();
    _occRay.set(_occFrom, _occDir);
    _occRay.far = dist;
    const hits = _occRay.intersectObjects(occluderMeshes, false);
    for (const h of hits) {
      if (h.distance < dist - 0.4) _fadedNow.add(h.object);
    }
  }
  // Apply / restore
  for (const m of _fadedNow) if (!_fadedPrev.has(m)) setMeshFaded(m, true);
  for (const m of _fadedPrev) if (!_fadedNow.has(m)) setMeshFaded(m, false);
  _fadedPrev.clear();
  for (const m of _fadedNow) _fadedPrev.add(m);
}



// ============ Character ============
function createCharacter(color = "#29d3bd", opts = {}) {
  const loading = !!opts.loading;
  const root = new THREE.Group();
  root.name = "BarPlayer";
  // No estado de loading, tudo cinza neutro (sem skin/cabelo/olhos coloridos), como mannequin.
  const skin = loading ? material("#9aa0a6", 0.85) : material("#ffd4a3", 0.66);
  const shirt = loading ? material("#9aa0a6", 0.85) : material(color, 0.62);
  const dark = loading ? material("#8a8f96", 0.85) : material("#171923", 0.72);
  const shoes = loading ? material("#7d8288", 0.85) : material("#0f141c", 0.7);

  const torso = new THREE.Group();
  torso.name = "Torso";
  torso.position.y = 1.08;
  root.add(torso);
  const torsoMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 10, 20), shirt);
  torsoMesh.name = "TorsoMesh";
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  torso.add(torsoMesh);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 18), skin);
  head.name = "Head";
  head.position.y = 1.68;
  head.castShadow = true;
  root.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.285, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), dark);
  hair.position.set(0, 1.81, -0.02);
  hair.rotation.x = -0.2;
  hair.castShadow = true;
  root.add(hair);

  const eyeGeo = new THREE.SphereGeometry(0.028, 8, 8);
  for (const x of [-0.09, 0.09]) {
    const eye = new THREE.Mesh(eyeGeo, dark);
    eye.position.set(x, 1.69, 0.245);
    root.add(eye);
  }

  createLimb(root, "LeftArm", [-0.36, 1.34, 0], 0.13, 0.48, shirt, "arm");
  createLimb(root, "RightArm", [0.36, 1.34, 0], 0.13, 0.48, shirt, "arm");
  createLimb(root, "LeftLeg", [-0.16, 0.7, 0], 0.13, 0.58, dark, "leg");
  createLimb(root, "RightLeg", [0.16, 0.7, 0], 0.13, 0.58, dark, "leg");

  for (const x of [-0.16, 0.16]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.38), shoes);
    foot.position.set(x, 0.1, 0.08);
    foot.castShadow = true;
    root.add(foot);
  }

  root.scale.setScalar(0.82);
  root.userData.clips = createCharacterClips();
  return root;
}

function createLimb(root, name, position, radius, length, mat, type) {
  const limb = new THREE.Group();
  limb.name = name;
  limb.position.set(...position);
  root.add(limb);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, 16), mat);
  mesh.position.y = -length * 0.5;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  limb.add(mesh);
  if (type === "arm") {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.86, 14, 10), material("#ffd4a3", 0.66));
    hand.position.y = -length - radius * 0.9;
    hand.castShadow = true;
    limb.add(hand);
  }
}

function quatValues(axis, degrees) {
  const q = new THREE.Quaternion();
  const values = [];
  for (const degree of degrees) {
    q.setFromAxisAngle(axis, THREE.MathUtils.degToRad(degree));
    values.push(q.x, q.y, q.z, q.w);
  }
  return values;
}

function createCharacterClips() {
  const xAxis = new THREE.Vector3(1, 0, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const idleTimes = [0, 0.8, 1.6];
  const idle = new THREE.AnimationClip("Idle", 1.6, [
    new THREE.VectorKeyframeTrack("Torso.position", idleTimes, [0, 1.08, 0, 0, 1.14, 0, 0, 1.08, 0]),
    new THREE.QuaternionKeyframeTrack("LeftArm.quaternion", idleTimes, quatValues(zAxis, [8, 12, 8])),
    new THREE.QuaternionKeyframeTrack("RightArm.quaternion", idleTimes, quatValues(zAxis, [-8, -12, -8])),
  ]);
  const walkTimes = [0, 0.22, 0.44, 0.66, 0.88];
  const walk = new THREE.AnimationClip("Walk", 0.88, [
    new THREE.VectorKeyframeTrack("Torso.position", walkTimes, [0, 1.08, 0, 0, 1.16, 0, 0, 1.08, 0, 0, 1.16, 0, 0, 1.08, 0]),
    new THREE.QuaternionKeyframeTrack("LeftArm.quaternion", walkTimes, quatValues(xAxis, [-26, 22, -26, 22, -26])),
    new THREE.QuaternionKeyframeTrack("RightArm.quaternion", walkTimes, quatValues(xAxis, [26, -22, 26, -22, 26])),
    new THREE.QuaternionKeyframeTrack("LeftLeg.quaternion", walkTimes, quatValues(xAxis, [28, -25, 28, -25, 28])),
    new THREE.QuaternionKeyframeTrack("RightLeg.quaternion", walkTimes, quatValues(xAxis, [-25, 28, -25, 28, -25])),
  ]);
  return { idle, walk };
}

// ============ Player entities ============
function createPlayerEntity(player) {
  const group = new THREE.Group();
  group.name = `Player_${player.id}`;
  group.position.copy(worldFromPercent(player.x, player.y));
  group.rotation.y = Math.PI;
  scene.add(group);

  const plate = document.createElement("div");
  plate.className = "nameplate";
  nameplatesLayer.appendChild(plate);



  let character = null;
  let mixer = null;
  let actions = {};
  let loadingFx = null;
  let loadingSpinner = null;

  if (player.character_slug) {
    // Em vez de mannequin cinza: efeito de fumaça 3D + spinner HTML enquanto carrega.
    loadingFx = createLoadingSmoke();
    group.add(loadingFx);
    loadingSpinner = document.createElement("div");
    loadingSpinner.className = "avatar-spinner";
    loadingSpinner.innerHTML = `<div class="avatar-spinner-ring"></div>`;
    nameplatesLayer.appendChild(loadingSpinner);
  } else {
    character = createCharacter(player.color || "#29d3bd");
    group.add(character);
    mixer = new THREE.AnimationMixer(character);
    const idle = mixer.clipAction(character.userData.clips.idle);
    const walk = mixer.clipAction(character.userData.clips.walk);
    idle.play();
    actions = { idle, walk };
  }

  const entity = {
    group,
    character,
    mixer,
    actions,
    currentAction: character ? "idle" : null,
    target: group.position.clone(),
    plate,
    player,
    avatarUrl: null,
    characterSlug: null,
    emoteAction: null,
    emoteUntil: 0,
    loadingFx,
    loadingSpinner,
  };
  if (player.character_slug) applyCharacter(entity, player.character_slug);
  else if (player.avatar_url) applyAvatar(entity, player.avatar_url);
  return entity;
}

function createLoadingSmoke() {
  const group = new THREE.Group();
  const tex = getSmokeTexture();
  const count = 6;
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      color: 0xc8ccd2,
    });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(1.2);
    s.position.set(0, 0.4, 0);
    s.userData.phase = (i / count) * Math.PI * 2;
    s.userData.seed = Math.random();
    group.add(s);
  }
  group.userData.isLoadingSmoke = true;
  return group;
}

let _smokeTextureCache = null;
function getSmokeTexture() {
  if (_smokeTextureCache) return _smokeTextureCache;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.35, "rgba(220,225,235,0.55)");
  g.addColorStop(1, "rgba(180,185,195,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _smokeTextureCache = t;
  return t;
}

function updateLoadingSmoke(entity, time) {
  const g = entity.loadingFx;
  if (!g) return;
  for (const s of g.children) {
    const p = s.userData.phase + time * 1.4;
    const r = 0.35 + 0.1 * Math.sin(p * 0.7 + s.userData.seed * 6);
    s.position.x = Math.cos(p) * r;
    s.position.z = Math.sin(p) * r;
    s.position.y = 0.4 + 0.55 + 0.35 * Math.sin(p * 0.9);
    const sc = 0.9 + 0.25 * Math.sin(p * 1.2 + s.userData.seed * 3);
    s.scale.setScalar(sc);
    s.material.opacity = 0.4 + 0.25 * (0.5 + 0.5 * Math.sin(p));
  }
}

function applyAvatar(entity, url) {
  if (entity.avatarUrl === url) return;
  entity.avatarUrl = url;
  loader.load(
    url,
    (gltf) => {
      const next = gltf.scene;
      // Normalize size
      const box = new THREE.Box3().setFromObject(next);
      const size = box.getSize(new THREE.Vector3());
      const max = Math.max(size.x, size.y, size.z) || 1;
      next.scale.setScalar(1.8 / max);
      const box2 = new THREE.Box3().setFromObject(next);
      next.position.y -= box2.min.y;
      next.traverse((c) => {
        if (c.isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });
      entity.group.remove(entity.character);
      entity.character = next;
      entity.group.add(next);
      entity.mixer = new THREE.AnimationMixer(next);
      entity.actions = { idle: null, walk: null };
      entity.currentAction = "idle";
    },
    undefined,
    () => {
      // fallback keeps default character
    },
  );
}

function setPlayerAction(entity, name) {
  if (entity.emoteAction) return; // emote em andamento bloqueia idle/walk/run
  if (!entity.actions || !entity.actions[name]) return;
  if (entity.currentAction === name) return;
  const previous = entity.actions[entity.currentAction];
  const next = entity.actions[name];
  if (previous) previous.fadeOut(0.16);
  next.reset().fadeIn(0.16).play();
  entity.currentAction = name;
}

function playEmote(entity, slot) {
  if (!entity?.actions?.[slot]) return;
  // para tudo e roda o emote uma vez
  if (entity.currentAction && entity.actions[entity.currentAction]) {
    entity.actions[entity.currentAction].fadeOut(0.12);
  }
  const action = entity.actions[slot];
  action.reset();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = false;
  action.fadeIn(0.12).play();
  entity.emoteAction = action;
  entity.currentAction = null;
}

function triggerLocalEmote(slot) {
  if (!me || !myId) return;
  const entity = playerEntities.get(myId);
  if (!entity) return;
  playEmote(entity, slot);
  movementChannel?.send({
    type: "broadcast",
    event: "emote",
    payload: { id: myId, slot },
  }).catch(() => {});
}

emoteJumpButton?.addEventListener("click", () => triggerLocalEmote("jump"));
emoteDanceButton?.addEventListener("click", () => triggerLocalEmote("dance"));
emoteWaveButton?.addEventListener("click", () => triggerLocalEmote("wave"));

function updateNameplate(player) {
  const entity = playerEntities.get(player.id);
  if (!entity) return;
  entity.plate.innerHTML = `
    ${player.speech ? `<div class="speech">${escapeHtml(player.speech)}</div>` : ""}
    <div class="plate-name">${escapeHtml(player.name)}</div>
  `;
}

function renderPlayers(nextPlayers) {
  players = nextPlayers;
  const mine = players.find((p) => p.id === myId);
  if (mine) {
    me = { ...me, ...mine };
    isAdmin = !!mine.isAdmin;
  }
  onlineCount.textContent = `${players.length} online`;

  const byId = new Map(players.map((p) => [p.id, p]));
  for (const [id, entity] of playerEntities) {
    if (!byId.has(id)) {
      scene.remove(entity.group);
      entity.plate.remove();
      if (entity.loadingSpinner) entity.loadingSpinner.remove();
      playerEntities.delete(id);
    }
  }
  for (const player of players) {
    let entity = playerEntities.get(player.id);
    if (!entity) {
      entity = createPlayerEntity(player);
      playerEntities.set(player.id, entity);
    }
    entity.player = player;
    // Para o próprio jogador, a fonte da verdade é `me.character_slug`,
    // não o presence (que pode chegar atrasado e reverter a troca).
    const desiredSlug = player.id === myId ? (me.character_slug || player.character_slug) : player.character_slug;
    if (desiredSlug && entity.characterSlug !== desiredSlug && entity.pendingCharacterSlug !== desiredSlug) {
      applyCharacter(entity, desiredSlug);
    }
    entity.target.copy(worldFromPercent(player.x, player.y));
    if (!desiredSlug && player.avatar_url && entity.avatarUrl !== player.avatar_url) {
      applyAvatar(entity, player.avatar_url);
    }
    // Tint default character only while using the built-in fallback mannequin.
    if (!desiredSlug && entity.character) {
      entity.character.traverse((child) => {
        if (child.material?.color && child.name?.includes("Torso")) {
          child.material.color.set(player.color);
        }
      });
    }
    updateNameplate(player);
  }
}

// ============ Map assets ============
function renderAssets(assets = []) {
  currentAssets = assets;
  const byId = new Map(assets.map((a) => [a.id, a]));
  for (const [id, object] of assetObjects) {
    if (!byId.has(id)) {
      scene.remove(object);
      assetObjects.delete(id);
    }
  }
  for (const asset of assets) {
    if (assetObjects.has(asset.id)) {
      const object = assetObjects.get(asset.id);
      object.position.set(asset.x, asset.y, asset.z);
      object.rotation.set(asset.rotationX, asset.rotationY, asset.rotationZ);
      if (object.userData.baseScale)
        object.scale.setScalar(object.userData.baseScale * asset.scale);
      continue;
    }
    loader.load(
      asset.url,
      (gltf) => {
        const object = gltf.scene;
        object.name = asset.name;
        normalizeImportedObject(object, asset.scale);
        object.position.set(asset.x, asset.y, asset.z);
        object.rotation.set(asset.rotationX, asset.rotationY, asset.rotationZ);
        object.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        scene.add(object);
        assetObjects.set(asset.id, object);
      },
      undefined,
      () => {
        const fallback = makeFallbackAsset(asset.name, asset.scale);
        fallback.position.set(asset.x, asset.y, asset.z);
        fallback.rotation.set(asset.rotationX, asset.rotationY, asset.rotationZ);
        scene.add(fallback);
        assetObjects.set(asset.id, fallback);
      },
    );
  }
  updateAssetList(assets);
}

function normalizeImportedObject(object, scale = 1) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z) || 1;
  const baseScale = 2 / max;
  object.position.sub(center);
  object.userData.baseScale = baseScale;
  object.scale.setScalar(baseScale * scale);
  const newBox = new THREE.Box3().setFromObject(object);
  object.position.y -= newBox.min.y;
}

function makeFallbackAsset(name, scale = 1) {
  const group = new THREE.Group();
  group.name = name;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.MeshStandardMaterial({ color: "#a78bfa", roughness: 0.6, metalness: 0.1 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.baseScale = 1;
  group.scale.setScalar(scale);
  return group;
}

function updateAssetList(assets) {
  if (!assets.length) {
    assetList.textContent = selectedAsset ? `Pronto: ${selectedAsset.name}` : "Nenhum GLB colocado";
    return;
  }
  assetList.innerHTML = assets
    .map((asset) => {
      const isEditing = editingAssetId === asset.id;
      const editorHtml = isEditing ? renderAssetEditor(asset) : "";
      return `
    <div class="asset-pill ${isEditing ? "is-editing" : ""}">
      <div class="asset-name">${escapeHtml(asset.name)}</div>
      <div class="asset-actions">
        <button type="button" data-asset-action="move" data-asset-id="${escapeHtml(asset.id)}" class="${movingAssetId === asset.id ? "is-active" : ""}">Mover</button>
        <button type="button" data-asset-action="edit" data-asset-id="${escapeHtml(asset.id)}" class="${isEditing ? "is-active" : ""}">Editar</button>
        <button type="button" data-asset-action="delete" data-asset-id="${escapeHtml(asset.id)}">Excluir</button>
      </div>
      ${editorHtml}
    </div>
  `;
    })
    .join("");
}

function renderAssetEditor(asset) {
  const id = escapeHtml(asset.id);
  const row = (label, field, value, min, max, step) => `
    <div class="asset-slider">
      <span class="asset-slider-label">${label}</span>
      <input type="range" data-asset-field="${field}" data-asset-id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" />
      <span class="asset-slider-value">${Number(value).toFixed(2)}</span>
    </div>`;
  const deg = (r) => (r * 180) / Math.PI;
  return `
    <div class="asset-editor">
      ${row("X", "x", asset.x, -12, 12, 0.05)}
      ${row("Y (altura)", "y", asset.y, -2, 6, 0.05)}
      ${row("Z", "z", asset.z, -10, 10, 0.05)}
      ${row("Rot X (tomb.)", "rotationX", deg(asset.rotationX), -180, 180, 1)}
      ${row("Rot Y (gira)", "rotationY", deg(asset.rotationY), -180, 180, 1)}
      ${row("Rot Z (tomb.)", "rotationZ", deg(asset.rotationZ), -180, 180, 1)}
      ${row("Escala", "scale", asset.scale, 0.1, 6, 0.05)}
    </div>`;
}

// ============ Chat UI ============
function addSystemLine(text) {
  const item = document.createElement("div");
  item.className = "system-line";
  item.textContent = text;
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
}
function addMessage(message) {
  const item = document.createElement("div");
  item.className = "chat-item";
  item.innerHTML = `
    <div class="chat-dot" style="--chat-color: ${escapeHtml(message.color)}"></div>
    <div class="chat-copy">
      <div class="chat-name">${escapeHtml(message.name)}</div>
      <div class="chat-text">${escapeHtml(message.text)}</div>
    </div>
  `;
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ============ Movement ============
function move(dx, dy, facing) {
  if (!me || !myId) return;
  const now = performance.now();
  me = {
    ...me,
    x: Math.max(5, Math.min(95, me.x + dx)),
    y: Math.max(8, Math.min(92, me.y + dy)),
    facing,
  };
  const idx = players.findIndex((p) => p.id === myId);
  if (idx >= 0) players[idx] = { ...players[idx], ...me };
  const entity = playerEntities.get(myId);
  if (entity) entity.target.copy(worldFromPercent(me.x, me.y));

  if (now - lastMoveSent > 90) {
    lastMoveSent = now;
    trackMe(false).catch(() => {});
  }
}
let lastMoveClickAt = 0;
function moveToWorld(point) {
  if (!me || !myId) return;
  const now = performance.now();
  const isDoubleClick = now - lastMoveClickAt < 350;
  lastMoveClickAt = now;
  const next = percentFromWorld(point.x, point.z);
  const dx = next.x - me.x;
  const dy = next.y - me.y;
  const facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  const running = isDoubleClick;
  me = { ...me, x: next.x, y: next.y, facing, running };
  const idx = players.findIndex((p) => p.id === myId);
  if (idx >= 0) players[idx] = { ...players[idx], ...me };
  const entity = playerEntities.get(myId);
  if (entity) {
    entity.target.copy(worldFromPercent(me.x, me.y));
    entity.running = running;
  }
  trackMe(false).catch(() => {});
}
function applyHeldMovement() {
  if (!keyState.size) return;
  const amount = 0.72;
  let dx = 0;
  let dy = 0;
  if (keyState.has("arrowup") || keyState.has("w")) dy -= amount;
  if (keyState.has("arrowdown") || keyState.has("s")) dy += amount;
  if (keyState.has("arrowleft") || keyState.has("a")) dx -= amount;
  if (keyState.has("arrowright") || keyState.has("d")) dx += amount;
  if (dx || dy) {
    move(dx, dy, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  }
}

function updatePlayerAnimation(delta) {
  const walkSpeed = 1.4;
  const runSpeed = 3.2;
  for (const entity of playerEntities.values()) {
    const distance = entity.group.position.distanceTo(entity.target);
    if (distance > 0.025) {
      const running = !!entity.running;
      const speed = running ? runSpeed : walkSpeed;
      const before = entity.group.position.clone();
      const step = Math.min(distance, speed * delta);
      const dir = entity.target.clone().sub(entity.group.position).normalize();
      const candidate = before.clone().addScaledVector(dir, step);
      if (collidesAt(before, candidate)) {
        // Blocked by wall — cancel target so we stop here
        entity.target.copy(before);
        setPlayerAction(entity, "idle");
      } else {
        entity.group.position.copy(candidate);
        // Follow terrain: stairs, ramps, raised floors
        const groundY = groundHeightAt(entity.group.position, entity.group.position.y);
        entity.group.position.y += (groundY - entity.group.position.y) * Math.min(1, delta * 12);
        const moved = entity.group.position.clone().sub(before);
        if (Math.abs(moved.x) + Math.abs(moved.z) > 0.00001) {
          entity.group.rotation.y = Math.atan2(moved.x, moved.z);
        }
        setPlayerAction(entity, running && entity.actions?.run ? "run" : "walk");
      }
    } else {
      entity.group.position.copy(entity.target);
      entity.running = false;
      if (entity.player?.id === myId && me) me.running = false;
      setPlayerAction(entity, "idle");
    }
    if (entity.mixer) entity.mixer.update(delta);
    if (entity.loadingFx) updateLoadingSmoke(entity, performance.now() / 1000);
  }
}

function updateNameplates() {
  const rect = renderer.domElement.getBoundingClientRect();
  const projected = new THREE.Vector3();
  for (const entity of playerEntities.values()) {
    projected.copy(entity.group.position);
    projected.y += 2.2;
    projected.project(camera);
    const x = (projected.x * 0.5 + 0.5) * rect.width;
    const y = (-projected.y * 0.5 + 0.5) * rect.height;
    const visible = projected.z > -1 && projected.z < 1;
    entity.plate.style.opacity = visible ? "1" : "0";
    entity.plate.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    if (entity.loadingSpinner) {
      entity.loadingSpinner.style.opacity = visible ? "1" : "0";
      entity.loadingSpinner.style.transform = `translate(${x}px, ${y + 40}px) translate(-50%, -50%)`;
    }
  }
}

function resize() {
  const rect = worldShell.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function pointerToWorld(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(floorHit, hitPoint) ? hitPoint.clone() : null;
}

// ============ Uploads ============
async function uploadMapGlb(file) {
  if (!isAdmin) throw new Error("Apenas admin");
  const path = `${myId}/${Date.now()}-${sanitize(file.name)}`;
  const { error } = await supabase.storage.from("map-assets").upload(path, file, {
    contentType: "model/gltf-binary",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("map-assets").getPublicUrl(path);
  selectedAsset = { name: file.name, url: data.publicUrl };
  placementMode = true;
  movingAssetId = "";
  placeButton.disabled = false;
  placeButton.classList.add("is-active");
  updateAssetList(currentAssets);
  addSystemLine(`${file.name} pronto pra colocar no mapa. Clique no chão.`);
}

async function uploadAvatar(file) {
  if (!myId) return;
  const path = `${myId}/avatar-${Date.now()}.glb`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    contentType: "model/gltf-binary",
    upsert: true,
  });
  if (error) {
    addSystemLine("Não consegui subir o avatar: " + error.message);
    return;
  }
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", myId);
  me.avatar_url = data.publicUrl;
  const myEntity = playerEntities.get(myId);
  if (myEntity) applyAvatar(myEntity, data.publicUrl);
  await trackMe();
  addSystemLine("Avatar atualizado!");
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function placeSelectedAsset(point) {
  if (!isAdmin || !selectedAsset) return;
  const { error } = await supabase.from("map_assets").insert({
    name: selectedAsset.name,
    url: selectedAsset.url,
    x: Math.max(-8.5, Math.min(8.5, point.x)),
    y: 0,
    z: Math.max(-6.5, Math.min(6.5, point.z)),
    rotation_x: 0,
    rotation_y: 0,
    rotation_z: 0,
    scale: 1,
    created_by: myId,
  });
  if (error) addSystemLine("Falha ao colocar GLB: " + error.message);
}

async function updateAsset(assetId, patch) {
  if (!isAdmin) return;
  const dbPatch = {};
  if (patch.x !== undefined) dbPatch.x = patch.x;
  if (patch.y !== undefined) dbPatch.y = patch.y;
  if (patch.z !== undefined) dbPatch.z = patch.z;
  if (patch.rotationX !== undefined) dbPatch.rotation_x = patch.rotationX;
  if (patch.rotationY !== undefined) dbPatch.rotation_y = patch.rotationY;
  if (patch.rotationZ !== undefined) dbPatch.rotation_z = patch.rotationZ;
  if (patch.scale !== undefined) dbPatch.scale = patch.scale;
  const { error } = await supabase.from("map_assets").update(dbPatch).eq("id", assetId);
  if (error) addSystemLine("Falha ao atualizar GLB: " + error.message);
}

async function deleteAsset(assetId) {
  if (!isAdmin) return;
  const { error } = await supabase.from("map_assets").delete().eq("id", assetId);
  if (error) addSystemLine("Falha ao excluir GLB: " + error.message);
}

function exportCharacter() {
  if (!isAdmin) return;
  const character = createCharacter("#29d3bd");
  character.name = "ExportedBarPlayer";
  character.updateMatrixWorld(true);
  const animations = [character.userData.clips.idle, character.userData.clips.walk];
  exporter.parse(
    character,
    (result) => {
      const blob =
        result instanceof ArrayBuffer
          ? new Blob([result], { type: "model/gltf-binary" })
          : new Blob([JSON.stringify(result, null, 2)], { type: "model/gltf+json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "personagem-bar-idle-walk.glb";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      addSystemLine("Personagem exportado com Idle e Walk.");
    },
    (error) => {
      console.error(error);
      addSystemLine("Não consegui exportar o personagem.");
    },
    { binary: true, animations },
  );
}

// ============ Animation loop ============
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  applyHeldMovement();
  updatePlayerAnimation(delta);
  if (followCamera && myId) {
    const entity = playerEntities.get(myId);
    if (entity)
      controls.target.lerp(new THREE.Vector3(entity.group.position.x, 0.85, entity.group.position.z), delta * 2.2);
  }
  controls.update();
  updateCameraOcclusion();
  renderer.render(scene, camera);
  updateNameplates();
}

// ============ Event wiring ============
window.addEventListener("resize", resize);

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea")) return;
  if (!event.key) return;
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
    keyState.add(key);
    return;
  }
  if (key === " " || key === "spacebar") { event.preventDefault(); triggerLocalEmote("jump"); return; }
  if (key === "1") { event.preventDefault(); triggerLocalEmote("dance"); return; }
  if (key === "2") { event.preventDefault(); triggerLocalEmote("wave"); return; }
});
document.addEventListener("keyup", (event) => {
  if (!event.key) return;
  keyState.delete(event.key.toLowerCase());
});

document.querySelectorAll("[data-step]").forEach((button) => {
  button.addEventListener("click", () => {
    const steps = {
      up: [0, -4, "up"],
      down: [0, 4, "down"],
      left: [-4, 0, "left"],
      right: [4, 0, "right"],
    };
    move(...steps[button.dataset.step]);
  });
});

let pointerDown = null;
renderer.domElement.addEventListener("pointerdown", (event) => {
  pointerDown = { x: event.clientX, y: event.clientY, t: performance.now() };
});
renderer.domElement.addEventListener("pointerup", (event) => {
  const start = pointerDown;
  pointerDown = null;
  if (!start) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  const dist = Math.hypot(dx, dy);
  const dt = performance.now() - start.t;
  // ignora se arrastou a câmera ou segurou por muito tempo
  if (dist > 6 || dt > 400) return;
  handleSceneClick(event);
});
function handleSceneClick(event) {
  const point = pointerToWorld(event);
  if (!point) return;
  if (isAdmin && movingAssetId) {
    updateAsset(movingAssetId, {
      x: Math.max(-8.5, Math.min(8.5, point.x)),
      z: Math.max(-6.5, Math.min(6.5, point.z)),
    })
      .then(() => {
        movingAssetId = "";
        updateAssetList(currentAssets);
      })
      .catch(() => addSystemLine("Não consegui mover o GLB."));
    return;
  }
  if (isAdmin && placementMode && selectedAsset) {
    placeSelectedAsset(point).catch(() => addSystemLine("Falha ao colocar."));
    placementMode = false;
    placeButton.classList.remove("is-active");
    return;
  }
  moveToWorld(point);
}

glbInput?.addEventListener("change", () => {
  if (!isAdmin) return;
  const file = glbInput.files?.[0];
  if (!file) return;
  uploadMapGlb(file).catch((e) => addSystemLine("Erro: " + (e?.message || "GLB inválido")));
  glbInput.value = "";
});

avatarInput?.addEventListener("change", () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  uploadAvatar(file).catch((e) => addSystemLine("Erro avatar: " + (e?.message || "")));
  avatarInput.value = "";
});

placeButton?.addEventListener("click", () => {
  if (!isAdmin || !selectedAsset) return;
  placementMode = !placementMode;
  if (placementMode) movingAssetId = "";
  placeButton.classList.toggle("is-active", placementMode);
  updateAssetList(currentAssets);
});

exportButton?.addEventListener("click", exportCharacter);

assetList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-asset-action]");
  if (!button || !isAdmin) return;
  const asset = currentAssets.find((item) => item.id === button.dataset.assetId);
  if (!asset) return;
  const action = button.dataset.assetAction;

  if (action === "move") {
    movingAssetId = movingAssetId === asset.id ? "" : asset.id;
    placementMode = false;
    placeButton.classList.remove("is-active");
    updateAssetList(currentAssets);
    addSystemLine(movingAssetId ? `Clique no mapa para mover ${asset.name}.` : "Movimento cancelado.");
    return;
  }
  if (action === "edit") {
    editingAssetId = editingAssetId === asset.id ? "" : asset.id;
    updateAssetList(currentAssets);
    return;
  }
  if (action === "delete") {
    if (editingAssetId === asset.id) editingAssetId = "";
    deleteAsset(asset.id).then(() => addSystemLine(`${asset.name} removido.`));
  }
});

assetList.addEventListener("input", (event) => {
  const input = event.target.closest("input[data-asset-field]");
  if (!input || !isAdmin) return;
  const asset = currentAssets.find((item) => item.id === input.dataset.assetId);
  if (!asset) return;
  const field = input.dataset.assetField;
  let value = parseFloat(input.value);
  if (Number.isNaN(value)) return;
  const patch = {};
  if (field === "rotationX" || field === "rotationY" || field === "rotationZ") {
    patch[field] = (value * Math.PI) / 180;
  } else {
    patch[field] = value;
  }
  // Atualiza valor exibido ao lado
  const valueEl = input.parentElement?.querySelector(".asset-slider-value");
  if (valueEl) valueEl.textContent = value.toFixed(2);
  // Atualiza cache local pra render imediato e evita reset do slider
  Object.assign(asset, patch);
  // Render local imediato
  const object = assetObjects.get(asset.id);
  if (object) {
    object.position.set(asset.x, asset.y, asset.z);
    object.rotation.set(asset.rotationX, asset.rotationY, asset.rotationZ);
    if (object.userData.baseScale)
      object.scale.setScalar(object.userData.baseScale * asset.scale);
  }
  // Debounce do update no banco
  clearTimeout(updateAsset._t);
  updateAsset._t = setTimeout(() => updateAsset(asset.id, patch), 120);
});

cameraButton.addEventListener("click", () => {
  followCamera = !followCamera;
  cameraButton.textContent = followCamera ? "Câmera" : "Livre";
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !myId || !me) return;
  chatInput.value = "";
  const { error } = await supabase.from("chat_messages").insert({
    user_id: myId,
    nickname: me.name,
    color: me.color,
    text,
  });
  if (error) {
    addSystemLine("Falha ao enviar: " + error.message);
    return;
  }
  // Bolha local imediata (o postgres_changes também atualiza pros outros)
  me.speech = text;
  await trackMe();
  setTimeout(() => {
    if (me) {
      me.speech = "";
      trackMe();
    }
  }, 4500);
});

joinButton.addEventListener("click", saveNickname);
nameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveNickname();
  }
});

async function saveNickname() {
  if (!myId) return;
  const newName = nameInput.value.trim() || "Visitante";
  localStorage.setItem("neon-tap-room-nickname", newName);
  await supabase.from("profiles").update({ nickname: newName }).eq("id", myId);
  me.name = newName;
  await trackMe();
  addSystemLine(`Apelido atualizado para ${newName}.`);
}

// ===== Bootstrap (runs after all module-scope consts are initialized) =====
buildMap();
resize();
renderPermissions();
requestAnimationFrame(animate);
