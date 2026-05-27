import * as THREE from "three";
import { OrbitControls } from "/vendor/OrbitControls.js";
import { GLTFLoader } from "/vendor/GLTFLoader.js";
import { GLTFExporter } from "/vendor/GLTFExporter.js";
import { FBXLoader } from "/vendor/FBXLoader.js";
import { clone as cloneSkeleton } from "/vendor/utils/SkeletonUtils.js";

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
const loadingManager = new THREE.LoadingManager();
loadingManager.onProgress = (url, loaded, total) => {
  try { window.setWorldLoadingProgress?.(loaded, total); } catch {}
};
loadingManager.onStart = (url, loaded, total) => {
  try { window.setWorldLoadingProgress?.(loaded, total); } catch {}
};
loadingManager.onLoad = () => {
  try { window.setWorldLoadingProgress?.(1, 1); } catch {}
};
const loader = new GLTFLoader(loadingManager);
const fbxLoader = new FBXLoader(loadingManager);
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
let catalogChannel = null;
let userAvatarsChannel = null;
let profilesChannel = null;
let lobbyChannel = null;
let lobbyCounts = {}; // { [mapId]: number }
let currentRoomChannelsMapId = null; // qual mapId os canais por-sala estão usando
let lastSpeechClear = 0;
let charactersCatalog = []; // [{slug, name, ...urls, thumbnail_url}] — admin catalog
let userAvatars = []; // user-created avatars (Avaturn), shape: { id, user_id, name, base_url, thumbnail_url }
// Versão da última troca de personagem por jogador (id -> timestamp ms).
// Usada para ignorar eventos atrasados (presence/profiles) que tentariam reverter a troca.
const characterVersionById = new Map();
let myCharacterVersion = 0;
function bumpCharacterVersion(id, v) {
  const prev = characterVersionById.get(id) || 0;
  const next = v || Date.now();
  if (next < prev) return prev;
  characterVersionById.set(id, next);
  return next;
}
function isStaleCharacterEvent(id, v) {
  if (!v) return false;
  const prev = characterVersionById.get(id) || 0;
  return v < prev;
}
function userAvatarToCharacter(av) {
  // Normaliza um user_avatar para o mesmo formato dos personagens do admin.
  return {
    slug: `user:${av.id}`,
    name: av.name || "Meu Avatar",
    base_url: av.base_url,
    thumbnail_url: av.thumbnail_url || null,
    isUserAvatar: true,
    userAvatarId: av.id,
    user_id: av.user_id,
  };
}
function findCharacterBySlug(slug) {
  if (!slug) return null;
  return (
    charactersCatalog.find((c) => c.slug === slug) ||
    userAvatars.map(userAvatarToCharacter).find((c) => c.slug === slug) ||
    null
  );
}
let selectedCharacterSlug = null; // tile escolhido na tela de seleção
const characterCache = new Map(); // slug -> Promise<{base, clips}>
const ANIMATION_SLOTS = ["base", "idle", "walk", "run", "dance", "wave"];
const EMOTE_SLOTS = new Set(["dance", "wave"]);
// Rotação padrão aplicada a todo personagem GLB (Mixamo vem deitado no eixo X).
const CHARACTER_DEFAULT_ROT_X = -Math.PI / 2;

const playerEntities = new Map(); // id -> { group, mixer, actions, currentAction, target, plate, player, avatarUrl }

// ============ Pose debug (ajuste manual de inclinação do personagem) ============
const POSE_DEBUG_KEY = "neon-tap-room-pose-debug";
function loadPoseDebug() {
  try {
    const raw = localStorage.getItem(POSE_DEBUG_KEY);
    if (raw) return { rotX: 0, rotY: 0, rotZ: 0, offY: 0, ...JSON.parse(raw) };
  } catch {}
  return { rotX: 0, rotY: 0, rotZ: 0, offY: 0 };
}
const poseDebug = loadPoseDebug();
function applyPoseDebugTo(character) {
  if (!character) return;
  const d = Math.PI / 180;
  character.rotation.set(
    CHARACTER_DEFAULT_ROT_X + poseDebug.rotX * d,
    poseDebug.rotY * d,
    poseDebug.rotZ * d,
  );
  character.position.y = poseDebug.offY;
}
function applyPoseDebugToMe() {
  const myEntity = myId ? playerEntities.get(myId) : null;
  if (myEntity?.character) applyPoseDebugTo(myEntity.character);
}
// Pose Debug UI removido — applyPoseDebugTo continua disponível com valores zero salvos.

const assetObjects = new Map();
const keyState = new Set();

// ============ Maps catalog ============
const BUILTIN_MAPS = [
  { id: "bar",      name: "Bar Neon",   url: "/assets/maps/bar.glb",      mood: "night", bg: "#08090c", thumb: "🍻" },
  { id: "old_bar",  name: "Bar Antigo", url: "/assets/maps/old_bar.glb",  mood: "night", bg: "#1a120a", thumb: "🥃" },
  { id: "milk_bar", name: "Milk Bar",   url: "/assets/maps/milk_bar.glb", mood: "day",   bg: "#dfeaf2", thumb: "🥤" },
  { id: "scifi",    name: "Sci-Fi",     url: "/assets/maps/scifi.glb",    mood: "night", bg: "#040814", thumb: "🛸" },
  { id: "cinema",   name: "Cinema",     url: "/assets/maps/cinema.glb",   mood: "night", bg: "#0a0a14", thumb: "🎬" },
  { id: "beach",    name: "Praia",      url: "/assets/maps/beach.glb",    mood: "day",   bg: "#9bd3e0", thumb: "🏖️" },
  { id: "maikai",   name: "Maikai",     url: "/assets/maps/maikai.glb",   mood: "day",   bg: "#1b2a3a", thumb: "🌺" },
];
let MAPS = [...BUILTIN_MAPS];
let currentMapId = localStorage.getItem("neon-tap-room-map") || "bar";
let selectedMapId = currentMapId;


// ============ Scene ============
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0e1117");
scene.fog = null;

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
camera.position.set(4.6, 4.2, 5.0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;

// ============ Dark / lights-only mode (admin) ============
// Quando ON: hemi/sol do mood são apagados e o mapa fica escuro;
// só as luzes custom (spots + sol custom) iluminam a cena.
let DARK_MODE = false; // controlado por currentMapTransform.dark_mode
let currentMapTransform = { offset_x: 0, offset_y: 0, offset_z: 0, rotation_y: 0, scale_mul: 1, mood: null };
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 2.5;
controls.maxDistance = 60;
const BASE_MAX_DISTANCE = 60;
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
  document.body.classList.remove("in-world");
  document.body.classList.remove("world-ready");
  try { window.radioLeaveRoom?.(); } catch {}
  try { window.interactionsLeaveRoom?.(); } catch {}
  try { window.hideWorldLoading?.(true); } catch {}


  authError.hidden = true;
  if (mode === "signin") {
    authTitle.textContent = "​";
    authHint.textContent = "Use email e senha pra entrar na sala.";
    authSubmit.textContent = "​";
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
  document.body.classList.add("in-world");
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
    authSubmit.textContent = authMode === "signup" ? "Cadastrando…" : "​";
  } else {
    authSubmit.textContent = authMode === "signup" ? "Cadastrar" : "​";
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

  if (characterSlug) {
    myCharacterVersion = bumpCharacterVersion(user.id, Date.now());
  }
  renderPermissions();
  await Promise.all([loadCharactersCatalog(), loadUserAvatars()]);
  // Sempre mostra a tela de seleção de personagem antes de entrar
  openCharacterSelect();
}

async function enterRoom() {
  window.showWorldLoading?.("Carregando o mundo");
  try {
    // Aguarda apenas o cenário (mapa base) terminar para mostrar a sala.
    // Chat, GLBs colocados, realtime, rádio e interações carregam em segundo plano
    // — o usuário entra mais rápido e os elementos aparecem progressivamente.
    await loadEnvironment(currentMapId, { waitForAssets: false });
    document.body.classList.add("world-ready");
    addSystemLine(isAdmin ? "Você entrou como admin da sala." : "Bem-vindo à sala!");
  } finally {
    window.hideWorldLoading?.();
  }
  // Pós-entrada (não bloqueia)
  loadInitialChat().catch(() => {});
  connectRealtime().catch(() => {});
  Promise.resolve().then(() => window.radioEnterRoom?.(currentMapId)).catch(() => {});
  Promise.resolve().then(() => window.interactionsEnterRoom?.(currentMapId)).catch(() => {});
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

async function loadUserAvatars() {
  const { data, error } = await supabase
    .from("user_avatars")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Não consegui carregar avatares de usuários", error);
    userAvatars = [];
    return;
  }
  userAvatars = data || [];
}

function openCharacterSelect() {
  if (!characterSelectOverlay) return;
  renderCharacterTiles();
  characterNicknameInput.value = me?.name && me.name !== "Visitante" ? me.name : "";
  selectedCharacterSlug =
    me?.character_slug ||
    charactersCatalog.find((c) => c.base_url)?.slug ||
    (userAvatars[0] ? `user:${userAvatars[0].id}` : null);
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
  const myAvatarTiles = userAvatars
    .filter((av) => av.user_id === myId)
    .map((av) => userAvatarToCharacter(av));
  const all = [...charactersCatalog, ...myAvatarTiles];
  const tilesHtml = all
    .map((c) => {
      const isSelected = selectedCharacterSlug === c.slug;
      const ready = !!c.base_url;
      const thumb = c.thumbnail_url
        ? `<img src="${escapeHtml(c.thumbnail_url)}" alt="${escapeHtml(c.name)}">`
        : (c.isUserAvatar ? "🧑‍🎤" : "🧍");
      const badge = c.isUserAvatar ? `<div class="char-tile-warn" style="background:#7c5cff;color:#fff;">Meu</div>` : "";
      const deleteBtn = c.isUserAvatar
        ? `<button class="char-tile-delete" data-action="delete-avatar" data-avatar-id="${escapeHtml(c.userAvatarId || "")}" title="Excluir avatar" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.65);color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:14px;line-height:20px;text-align:center;cursor:pointer;z-index:3;padding:0;">×</button>`
        : "";
      return `
        <div class="char-tile ${isSelected ? "is-selected" : ""} ${ready ? "" : "is-disabled"}"
             data-character-slug="${escapeHtml(c.slug)}" style="position:relative;">
          ${deleteBtn}
          <div class="char-tile-thumb">${thumb}</div>
          <div class="char-tile-name">${escapeHtml(c.name)}</div>
          ${ready ? "" : `<div class="char-tile-warn">Sem arquivos</div>`}
          ${badge}
        </div>`;
    })
    .join("");
  const createTile = `
    <div class="char-tile" data-action="create-avatar" style="display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px dashed #4a4f5e;cursor:pointer;">
      <div class="char-tile-thumb" style="font-size:32px;">＋</div>
      <div class="char-tile-name">Criar meu avatar</div>
    </div>`;
  characterGrid.innerHTML = (all.length ? tilesHtml : `<div class="char-hint">Nenhum personagem disponível ainda.</div>`) + createTile;
}

function updateEnterButtonState() {
  if (!enterRoomButton) return;
  const character = findCharacterBySlug(selectedCharacterSlug);
  const hasFiles = !!character?.base_url;
  enterRoomButton.disabled = !selectedCharacterSlug || !hasFiles;
}

characterGrid?.addEventListener("click", async (event) => {
  const delBtn = event.target.closest('[data-action="delete-avatar"]');
  if (delBtn) {
    event.stopPropagation();
    const avatarId = delBtn.dataset.avatarId;
    if (!avatarId) return;
    if (!confirm("Excluir este avatar? Essa ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("user_avatars").delete().eq("id", avatarId);
    if (error) { alert("Não foi possível excluir: " + error.message); return; }
    if (selectedCharacterSlug === `user:${avatarId}`) selectedCharacterSlug = null;
    userAvatars = userAvatars.filter((a) => a.id !== avatarId);
    renderCharacterTiles();
    updateEnterButtonState();
    return;
  }
  const createBtn = event.target.closest('[data-action="create-avatar"]');
  if (createBtn) { openAvatarCreator(); return; }
  const tile = event.target.closest("[data-character-slug]");
  if (!tile) return;
  selectedCharacterSlug = tile.dataset.characterSlug;
  renderCharacterTiles();
  updateEnterButtonState();
});

enterRoomButton?.addEventListener("click", async () => {
  if (!me || !selectedCharacterSlug) return;
  const newName = (characterNicknameInput.value || "").trim() || "Visitante";
  const character = findCharacterBySlug(selectedCharacterSlug);
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
    // Marca a versão da troca ANTES de qualquer await — assim, qualquer evento
    // antigo (presence/profiles) que chegar depois é descartado.
    myCharacterVersion = bumpCharacterVersion(myId, Date.now());
    await applyCharacter(myEntity, selectedCharacterSlug);
    await trackMe();
    // Broadcast imediato pra todos verem a troca sem esperar presence sync.
    // Inclui posição atual para que ninguém "snap" o personagem pro ponto de origem.
    try {
      await movementChannel?.send({
        type: "broadcast",
        event: "character",
        payload: {
          id: myId,
          character_slug: selectedCharacterSlug,
          avatar_url: me.avatar_url || null,
          name: me.name,
          color: me.color,
          x: me.x,
          y: me.y,
          facing: me.facing,
          v: myCharacterVersion,
        },
      });
    } catch {}
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

// ===== Avatar Creator (Avaturn workaround) =====
const avatarCreatorOverlay = document.querySelector("#avatarCreatorOverlay");
const avatarCreatorClose = document.querySelector("#avatarCreatorClose");
const avatarCreatorFile = document.querySelector("#avatarCreatorFile");
const avatarCreatorName = document.querySelector("#avatarCreatorName");
const avatarCreatorStatus = document.querySelector("#avatarCreatorStatus");
const avatarDropzone = document.querySelector("#avatarDropzone");

function openAvatarCreator() {
  if (!avatarCreatorOverlay) return;
  avatarCreatorStatus.textContent = "";
  avatarCreatorStatus.style.color = "";
  avatarCreatorName.value = "";
  avatarCreatorFile.value = "";
  avatarCreatorOverlay.hidden = false;
}
function closeAvatarCreator() {
  if (avatarCreatorOverlay) avatarCreatorOverlay.hidden = true;
}
avatarCreatorClose?.addEventListener("click", closeAvatarCreator);

async function handleAvatarUpload(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".glb")) {
    avatarCreatorStatus.style.color = "#f26868";
    avatarCreatorStatus.textContent = "Arquivo precisa ser .glb (T-pose, sem expressões).";
    return;
  }
  if (!me?.id) return;
  const name = (avatarCreatorName.value || "").trim() || `Avatar de ${me.name || "Visitante"}`;
  avatarCreatorStatus.style.color = "";
  avatarCreatorStatus.textContent = "Enviando avatar…";
  try {
    const ext = "glb";
    const path = `user-avatars/${me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("characters").upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: "model/gltf-binary",
    });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("characters").getPublicUrl(path);
    const baseUrl = pub.publicUrl;
    const { data: inserted, error: dbErr } = await supabase
      .from("user_avatars")
      .insert({ user_id: me.id, name, base_url: baseUrl })
      .select()
      .single();
    if (dbErr) throw dbErr;
    userAvatars = [inserted, ...userAvatars];
    avatarCreatorStatus.style.color = "#29d3bd";
    avatarCreatorStatus.textContent = "Pronto! Avatar adicionado à sua lista.";
    selectedCharacterSlug = `user:${inserted.id}`;
    renderCharacterTiles();
    updateEnterButtonState();
    setTimeout(closeAvatarCreator, 900);
  } catch (err) {
    console.error("Falha ao subir avatar", err);
    avatarCreatorStatus.style.color = "#f26868";
    avatarCreatorStatus.textContent = `Erro: ${err.message || err}`;
  }
}

avatarCreatorFile?.addEventListener("change", (e) => {
  handleAvatarUpload(e.target.files?.[0]);
});
["dragenter", "dragover"].forEach((evt) => {
  avatarDropzone?.addEventListener(evt, (e) => {
    e.preventDefault();
    avatarDropzone.style.borderColor = "#29d3bd";
    avatarDropzone.style.background = "rgba(41,211,189,0.05)";
  });
});
["dragleave", "drop"].forEach((evt) => {
  avatarDropzone?.addEventListener(evt, (e) => {
    e.preventDefault();
    avatarDropzone.style.borderColor = "";
    avatarDropzone.style.background = "";
  });
});
avatarDropzone?.addEventListener("drop", (e) => {
  e.preventDefault();
  handleAvatarUpload(e.dataTransfer?.files?.[0]);
});

// Importar via URL colada (fallback caso o postMessage do Avaturn falhe)
const avatarCreatorUrlInput = document.querySelector("#avatarCreatorUrl");
const avatarCreatorUrlBtn = document.querySelector("#avatarCreatorUrlBtn");
avatarCreatorUrlBtn?.addEventListener("click", async () => {
  const url = (avatarCreatorUrlInput?.value || "").trim();
  if (!url) return;
  if (!/^https?:\/\/\S+\.glb(\?\S*)?$/i.test(url)) {
    avatarCreatorStatus.style.color = "#f26868";
    avatarCreatorStatus.textContent = "URL precisa terminar em .glb";
    return;
  }
  try {
    avatarCreatorStatus.style.color = "";
    avatarCreatorStatus.textContent = "Baixando avatar…";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download falhou (${res.status})`);
    const blob = await res.blob();
    const file = new File([blob], `avaturn-${Date.now()}.glb`, { type: "model/gltf-binary" });
    await handleAvatarUpload(file);
  } catch (err) {
    avatarCreatorStatus.style.color = "#f26868";
    avatarCreatorStatus.textContent = `Erro: ${err.message || err}`;
  }
});

// Integração SDK Avaturn (postMessage) — captura GLB automaticamente quando
// o usuário clica "Next/Export" dentro do iframe (hotmapavatar.avaturn.dev).
// Docs: https://docs.avaturn.me/sdk/iframe
function isGlbUrlString(s) {
  if (typeof s !== "string") return false;
  if (/^https?:\/\/\S+\.glb(\?\S*)?$/i.test(s)) return true;
  if (/^data:model\/gltf-binary[;,]/i.test(s)) return true;
  if (/^data:application\/octet-stream[;,]/i.test(s)) return true;
  if (/^blob:/i.test(s)) return true;
  return false;
}
function findGlbUrlDeep(obj, depth = 0) {
  if (depth > 8 || obj == null) return null;
  if (typeof obj === "string") return isGlbUrlString(obj) ? obj : null;
  if (typeof obj !== "object") return null;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    // Avaturn v2: { url: { _type: "String", value: "data:..." } }
    if (v && typeof v === "object" && typeof v.value === "string" && isGlbUrlString(v.value)) {
      return v.value;
    }
    const found = findGlbUrlDeep(v, depth + 1);
    if (found) return found;
  }
  return null;
}

let _lastAvaturnImportTs = 0;
window.addEventListener("message", async (event) => {
  let isAvaturn = false;
  try {
    const host = new URL(String(event.origin || "")).hostname;
    isAvaturn = /(^|\.)avaturn\.(dev|me)$/.test(host);
  } catch { return; }
  if (!isAvaturn) return;

  let payload = event.data;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); }
    catch {
      if (isGlbUrlString(payload)) payload = { url: payload };
      else return;
    }
  }
  if (!payload || typeof payload !== "object") return;

  // Log diagnóstico — para vermos o formato real que o Avaturn manda
  console.log("[Avaturn] message:", payload);

  const url = findGlbUrlDeep(payload);
  if (!url) return; // ignora handshakes (iframeReady, etc.)

  // Dedup: Avaturn dispara v1 e v2 em sequência. Ignora chamadas em < 5s.
  const now = Date.now();
  if (now - _lastAvaturnImportTs < 5000) {
    console.log("[Avaturn] ignorando export duplicado");
    return;
  }
  _lastAvaturnImportTs = now;

  if (!me?.id) {
    console.warn("[Avaturn] avatar exportado mas usuário não autenticado");
    if (avatarCreatorStatus) {
      avatarCreatorStatus.style.color = "#f26868";
      avatarCreatorStatus.textContent = "Faça login antes de criar o avatar.";
    }
    return;
  }

  try {
    if (avatarCreatorStatus) {
      avatarCreatorStatus.style.color = "";
      avatarCreatorStatus.textContent = "Baixando avatar do Avaturn…";
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download falhou (${res.status})`);
    const blob = await res.blob();
    const file = new File([blob], `avaturn-${Date.now()}.glb`, { type: "model/gltf-binary" });
    await handleAvatarUpload(file);
  } catch (err) {
    console.error("Falha ao importar avatar do Avaturn", err);
    if (avatarCreatorStatus) {
      avatarCreatorStatus.style.color = "#f26868";
      avatarCreatorStatus.textContent = `Erro ao importar: ${err.message || err}`;
    }
  }
});



// ===== Map (location) select =====
const mapSelectOverlay = document.querySelector("#mapSelectOverlay");
const mapGrid = document.querySelector("#mapGrid");
const confirmMapButton = document.querySelector("#confirmMapButton");
const mapSelectBack = document.querySelector("#mapSelectBack");

async function openMapSelect() {
  if (!mapSelectOverlay) return;
  selectedMapId = currentMapId;
  // Sempre busca a lista mais recente (importante p/ não-admin ver exclusões/edições)
  try { await loadCustomMaps(); } catch {}
  selectedMapId = MAPS.some((m) => m.id === selectedMapId) ? selectedMapId : (MAPS[0]?.id || null);
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
    const moodLabel = m.mood === "day" ? "☀️ Dia" : m.mood === "sunset" ? "🌅 Tarde" : "🌙 Noite";
    const count = lobbyCounts[m.id] || 0;
    const peopleLabel = count === 0 ? "Vazia" : `${count} ${count === 1 ? "pessoa" : "pessoas"}`;
    const isCurrent = currentRoomChannelsMapId === m.id;
    const thumbInner = m.thumbUrl
      ? `<img src="${m.thumbUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;display:block;">`
      : `<span style="font-size:32px;">${m.thumb}</span>`;
    return `
      <div class="char-tile ${isSelected ? "is-selected" : ""}" data-map-id="${m.id}" style="position:relative;">
        <div style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.55);color:#fff;border-radius:10px;padding:2px 8px;font-size:11px;display:flex;align-items:center;gap:4px;z-index:2;">
          <span style="width:6px;height:6px;border-radius:50%;background:${count > 0 ? "#29d3bd" : "#666"};"></span>
          ${peopleLabel}
        </div>
        ${isAdmin ? `<button type="button" class="map-edit-btn" data-edit-map="${m.id}" title="Editar mapa" style="position:absolute;top:6px;left:6px;background:rgba(0,0,0,0.6);color:#ffd166;border:1px solid rgba(255,209,102,0.4);border-radius:8px;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;padding:0;z-index:2;">✏️</button>` : ""}
        <div class="char-tile-thumb" style="display:flex;align-items:center;justify-content:center;overflow:hidden;">${thumbInner}</div>
        <div class="char-tile-name">${m.name}${isCurrent ? " · você está aqui" : ""}</div>
        <div class="char-tile-warn" style="background:transparent;color:#aeb6c4">${moodLabel}</div>
      </div>`;
  }).join("");
}
function updateConfirmMapButton() {
  if (!confirmMapButton) return;
  confirmMapButton.disabled = !selectedMapId;
}
mapGrid?.addEventListener("click", (e) => {
  const editBtn = e.target.closest("[data-edit-map]");
  if (editBtn) {
    e.stopPropagation();
    openMapEdit(editBtn.dataset.editMap);
    return;
  }
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
  const alreadyInRoom = !!playerEntities.get(myId);
  const switching = selectedMapId !== currentMapId;

  if (switching && !alreadyInRoom) {
    currentMapId = selectedMapId;
    localStorage.setItem("neon-tap-room-map", selectedMapId);
  }
  closeMapSelect();
  if (!alreadyInRoom) {
    // Primeira entrada: cria os canais já no map escolhido
    await enterRoom();
  } else if (switching) {
    // Já estava na sala — troca canais e chat sem reentrar
    await switchRoom(selectedMapId);
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

// Renomeia tracks de um clip para casar com os bones do alvo.
// Mantém os tracks originais da animação: o eixo do avatar fica como veio no GLB.
function retargetClipToBones(clip, targetBoneNames) {
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
    const nt = t.clone();
    nt.name = candidate + prop;
    tracks.push(nt);
  }
  if (!tracks.length) return null;
  out.tracks = tracks;
  return out;
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
    const animSlots = ["idle", "walk", "run", "dance", "wave"];

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
          const retarg = retargetClipToBones(clip, targetBones) || clip.clone();
          retarg.name = slot;
          clips[slot] = retarg;
          console.log(`[char ${character.slug}] "${slot}" <- ${override ? "override" : "shared"}`);
        } catch (e) {
          console.warn(`[anim ${slot}] falhou para ${character.slug}`, e);
        }


      }),
    );

    // Fallback mínimo: garante slot "idle" se nada carregou.
    if (!clips.idle) clips.idle = new THREE.AnimationClip("idle", 1, []);


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
  const character = findCharacterBySlug(slug);
  if (!character) {
    console.warn(`[applyCharacter] personagem "${slug}" não encontrado no catálogo`);
    return;
  }
  entity.pendingCharacterSlug = slug;
  // Remove personagem atual imediatamente e mostra fumaça de loading
  if (entity.character) {
    entity.group.remove(entity.character);
    entity.character = null;
    entity.mixer = null;
    entity.actions = {};
    entity.currentAction = null;
    entity.emoteAction = null;
    entity.emoteUntil = 0;
  }
  if (!entity.loadingFx) {
    entity.loadingFx = createLoadingSmoke();
    entity.group.add(entity.loadingFx);
  }
  if (!entity.loadingSpinner) {
    entity.loadingSpinner = document.createElement("div");
    entity.loadingSpinner.className = "avatar-spinner";
    entity.loadingSpinner.innerHTML = `<div class="avatar-spinner-ring"></div>`;
    nameplatesLayer.appendChild(entity.loadingSpinner);
  }
  try {
    const { base, clips } = await loadCharacterAssets(character);
    // Caso outra troca tenha começado enquanto carregávamos, aborta.
    if (entity.pendingCharacterSlug !== slug) return;
    const cloned = cloneSkeleton(base);
    cloned.scale.copy(base.scale);
    cloned.position.set(0, 0, 0);
    // Remove efeitos de loading
    if (entity.loadingFx) { entity.group.remove(entity.loadingFx); entity.loadingFx = null; }
    if (entity.loadingSpinner) { entity.loadingSpinner.remove(); entity.loadingSpinner = null; }
    entity.character = cloned;
    entity.group.add(cloned);
    // Aplica rotação padrão (-90 X) a todo personagem; debug sobrepõe pro "me".
    if (entity.player?.id && entity.player.id === myId) {
      applyPoseDebugTo(cloned);
    } else {
      cloned.rotation.x = CHARACTER_DEFAULT_ROT_X;
    }
    entity.mixer = new THREE.AnimationMixer(cloned);
    entity.actions = {};
    for (const [name, clip] of Object.entries(clips)) {
      const action = entity.mixer.clipAction(clip);
      if (name === "dance") {
        action.setLoop(THREE.LoopRepeat, Infinity);
      } else if (EMOTE_SLOTS.has(name)) {
        action.setLoop(THREE.LoopOnce, 1);
        // clampWhenFinished=true mantém o último frame durante o fadeOut,
        // evitando o snap pro bind pose ("enterrado") entre wave→idle.
        action.clampWhenFinished = true;
      }
      entity.actions[name] = action;
    }

    entity.currentAction = null;
    entity.characterSlug = slug;
    entity.emoteAction = null;
    entity.emoteUntil = 0;
    entity.mixer.addEventListener("finished", (e) => {
      if (entity.emoteAction === e.action) {
        // Inicia idle ANTES de soltar o emote para evitar 1 frame em bind pose ("enterrado").
        const idle = entity.actions?.idle;
        if (idle) {
          idle.reset().fadeIn(0.2).play();
          entity.currentAction = "idle";
        }
        e.action.fadeOut(0.2);
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
  const { data } = await supabase.from("map_assets").select("*").eq("map_id", currentMapId).order("created_at");
  await renderAssets((data || []).map(rowToAsset));
}

async function loadInitialChat() {
  chatLog.innerHTML = "";
  const { data } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("map_id", currentMapId)
    .order("created_at", { ascending: true })
    .limit(80);
  (data || []).forEach((m) => addMessage({ user_id: m.user_id, name: m.nickname, color: m.color, text: m.text, avatar_url: m.avatar_url }));
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

  // Map assets via postgres changes (global — não muda por sala)
  if (mapChannel) await supabase.removeChannel(mapChannel);
  mapChannel = supabase
    .channel("room-map")
    .on("postgres_changes", { event: "*", schema: "public", table: "map_assets" }, () => {
      loadInitialAssets();
    })
    .subscribe();

  await setupLobbyChannel();
  await setupRoomChannels(currentMapId);
}

// === Canais por-sala (chat / presence / movement) ===
async function setupRoomChannels(mapId) {
  currentRoomChannelsMapId = mapId;

  // Chat via postgres changes — filtra só esta sala
  if (chatChannel) await supabase.removeChannel(chatChannel);
  chatChannel = supabase
    .channel(`room-chat:${mapId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages", filter: `map_id=eq.${mapId}` },
      (payload) => {
        const m = payload.new;
        addMessage({ user_id: m.user_id, name: m.nickname, color: m.color, text: m.text, avatar_url: m.avatar_url });
        // Set speech bubble briefly
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

  // Presence — quem está nesta sala
  if (presenceChannel) await supabase.removeChannel(presenceChannel);
  presenceChannel = supabase.channel(`room-presence:${mapId}`, {
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
      const prev = new Map(players.map((p) => [p.id, p]));
      const merged = list.map((p) => {
        const old = prev.get(p.id);
        // Se temos uma versão local de troca de personagem MAIS NOVA do que
        // o que veio no presence, preservamos os dados locais (slug/avatar).
        // Isso evita reverter para o personagem antigo quando o presence
        // chega atrasado.
        const localV = characterVersionById.get(p.id) || 0;
        const presenceV = p.character_v || 0;
        const keepLocalChar = old && localV > presenceV;
        const base = old
          ? { ...p, x: old.x ?? p.x, y: old.y ?? p.y, facing: old.facing ?? p.facing, speech: old.speech ?? p.speech, running: old.running ?? false }
          : p;
        if (keepLocalChar) {
          base.character_slug = old.character_slug ?? base.character_slug;
          base.avatar_url = old.avatar_url ?? base.avatar_url;
          base.name = old.name ?? base.name;
          base.color = old.color ?? base.color;
        } else if (presenceV) {
          bumpCharacterVersion(p.id, presenceV);
        }
        return base;
      });
      renderPlayers(merged);
    })
    .on("presence", { event: "join" }, ({ newPresences }) => {
      // Quando alguém novo entra, reenvio meu estado completo (posição + personagem)
      // para que ele me veja exatamente como estou — não no ponto de origem nem
      // no personagem antigo.
      if (!newPresences || !newPresences.length) return;
      const hasNewcomer = newPresences.some((p) => (p.id || p.presence_ref) !== myId);
      if (!hasNewcomer) return;
      try {
        movementChannel?.send({
          type: "broadcast",
          event: "pos",
          payload: { id: myId, x: me.x, y: me.y, facing: me.facing, running: !!me.running },
        });
        if (me?.character_slug) {
          movementChannel?.send({
            type: "broadcast",
            event: "character",
            payload: {
              id: myId,
              character_slug: me.character_slug,
              avatar_url: me.avatar_url || null,
              name: me.name,
              color: me.color,
              x: me.x,
              y: me.y,
              facing: me.facing,
              v: myCharacterVersion || characterVersionById.get(myId) || 0,
            },
          });
        }
      } catch {}
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track(presencePayload());
      }
    });

  // Movimento — só desta sala
  if (movementChannel) await supabase.removeChannel(movementChannel);
  movementChannel = supabase.channel(`room-movement:${mapId}`, {
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
      if (entity && payload.slot !== "jump") playEmote(entity, payload.slot);
    })
    .on("broadcast", { event: "character" }, ({ payload }) => {
      if (!payload || payload.id === myId) return;
      // Descarta eventos antigos (chegou após uma troca mais nova).
      if (isStaleCharacterEvent(payload.id, payload.v)) return;
      bumpCharacterVersion(payload.id, payload.v);
      let idx = players.findIndex((p) => p.id === payload.id);
      if (idx < 0) {
        // Pode acontecer se o broadcast chegar antes do presence sync.
        players.push({
          id: payload.id,
          name: payload.name || "Visitante",
          color: payload.color || "#29d3bd",
          x: payload.x ?? 50,
          y: payload.y ?? 50,
          facing: payload.facing || "down",
          character_slug: payload.character_slug || null,
          avatar_url: payload.avatar_url || null,
        });
        idx = players.length - 1;
      } else {
        players[idx] = {
          ...players[idx],
          character_slug: payload.character_slug ?? players[idx].character_slug,
          avatar_url: payload.avatar_url ?? players[idx].avatar_url,
          name: payload.name ?? players[idx].name,
          color: payload.color ?? players[idx].color,
          // Posição: usa a do payload se vier, senão mantém atual (não volta pro origin).
          x: payload.x ?? players[idx].x,
          y: payload.y ?? players[idx].y,
          facing: payload.facing ?? players[idx].facing,
        };
      }
      const entity = playerEntities.get(payload.id);
      if (entity) {
        entity.player = players[idx];
        if (payload.x != null && payload.y != null) {
          entity.target.copy(worldFromPercent(players[idx].x, players[idx].y));
        }
        if (payload.character_slug && entity.characterSlug !== payload.character_slug) {
          applyCharacter(entity, payload.character_slug);
        } else if (!payload.character_slug && payload.avatar_url && entity.avatarUrl !== payload.avatar_url) {
          applyAvatar(entity, payload.avatar_url);
        }
        updateNameplate(players[idx]);
      } else {
        // Cria a entidade na hora caso ainda não exista (broadcast antes do presence)
        renderPlayers(players);
      }
    })
    .on("broadcast", { event: "leave" }, ({ payload }) => {
      if (!payload || payload.id === myId) return;
      const entity = playerEntities.get(payload.id);
      if (entity) {
        scene.remove(entity.group);
        entity.plate?.remove();
        if (entity.loadingSpinner) entity.loadingSpinner.remove();
        playerEntities.delete(payload.id);
      }
      players = players.filter((p) => p.id !== payload.id);
      onlineCount.textContent = `${players.length} online`;
    })
    .subscribe();

  // Catálogo, user_avatars e profiles permanecem globais — definidos abaixo (uma vez).
  await setupGlobalSecondaryChannels();
}

async function setupGlobalSecondaryChannels() {
  // Catálogo de personagens (admin add/edit/delete)
  if (!catalogChannel) {
    catalogChannel = supabase
      .channel("room-characters")
      .on("postgres_changes", { event: "*", schema: "public", table: "characters" }, async () => {
        await loadCharactersCatalog();
        if (characterSelectOverlay && !characterSelectOverlay.hidden) renderCharacterTiles();
      })
      .subscribe();
  }

  // Avatares de usuários (Avaturn)
  if (!userAvatarsChannel) {
    userAvatarsChannel = supabase
      .channel("room-user-avatars")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_avatars" }, async () => {
        await loadUserAvatars();
        if (characterSelectOverlay && !characterSelectOverlay.hidden) renderCharacterTiles();
      })
      .subscribe();
  }

  // Perfis — quando outro jogador troca nome / cor / personagem
  if (!profilesChannel) {
    profilesChannel = supabase
      .channel("room-profiles")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const row = payload.new;
        if (!row || row.id === myId) return;
        const idx = players.findIndex((p) => p.id === row.id);
        if (idx < 0) return;
        const prev = players[idx];
        // Se já temos uma versão mais nova de troca (vinda do broadcast),
        // ignoramos a parte do personagem deste UPDATE de profile — pode ser
        // uma escrita atrasada que reverteria a troca recém-feita.
        const localV = characterVersionById.get(row.id) || 0;
        const dbChanged = row.character_slug !== prev.character_slug;
        const keepLocalChar = localV > 0 && dbChanged;
        const next = {
          ...prev,
          name: row.nickname ?? prev.name,
          color: row.color ?? prev.color,
          avatar_url: keepLocalChar ? prev.avatar_url : (row.avatar_url ?? prev.avatar_url),
          character_slug: keepLocalChar ? prev.character_slug : (row.character_slug ?? prev.character_slug),
        };
        players[idx] = next;
        const entity = playerEntities.get(row.id);
        if (entity) {
          entity.player = next;
          if (!keepLocalChar && next.character_slug && next.character_slug !== prev.character_slug) {
            applyCharacter(entity, next.character_slug);
          }
          updateNameplate(next);
        }
      })
      .subscribe();
  }
}

// === Lobby: presence global que conta quantos estão em cada sala ===
async function setupLobbyChannel() {
  if (lobbyChannel) await supabase.removeChannel(lobbyChannel);
  lobbyChannel = supabase.channel("lobby", {
    config: { presence: { key: myId } },
  });
  lobbyChannel
    .on("presence", { event: "sync" }, () => {
      const state = lobbyChannel.presenceState();
      const counts = {};
      for (const id of Object.keys(state)) {
        const entry = state[id][0];
        const m = entry?.map_id;
        if (!m) continue;
        counts[m] = (counts[m] || 0) + 1;
      }
      lobbyCounts = counts;
      if (mapSelectOverlay && !mapSelectOverlay.hidden) renderMapTiles();
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await lobbyChannel.track({ map_id: currentMapId });
      }
    });
}

async function trackLobby() {
  if (!lobbyChannel) return;
  try { await lobbyChannel.track({ map_id: currentMapId }); } catch {}
}

// === Trocar de sala em runtime ===
async function switchRoom(newMapId) {
  if (newMapId === currentRoomChannelsMapId) return;
  window.showWorldLoading?.("Carregando o mundo");
  try { await window.radioLeaveRoom?.(); } catch {}
  try { await window.interactionsLeaveRoom?.(); } catch {}

  try {
    // Tira do canal antigo: derruba presence/movement/chat
    try {
      await movementChannel?.send({
        type: "broadcast",
        event: "leave",
        payload: { id: myId },
      });
    } catch {}
    if (presenceChannel) { try { await presenceChannel.untrack(); } catch {} await supabase.removeChannel(presenceChannel); presenceChannel = null; }
    if (movementChannel) { await supabase.removeChannel(movementChannel); movementChannel = null; }
    if (chatChannel) { await supabase.removeChannel(chatChannel); chatChannel = null; }

    // Limpa os outros jogadores da cena (mantém o meu) — eles estão em outra sala agora
    for (const [id, entity] of Array.from(playerEntities)) {
      if (id === myId) continue;
      scene.remove(entity.group);
      entity.plate?.remove();
      if (entity.loadingSpinner) entity.loadingSpinner.remove();
      playerEntities.delete(id);
    }
    players = players.filter((p) => p.id === myId);

    // Limpa o histórico do chat e carrega o da sala nova
    if (chatLog) chatLog.innerHTML = "";

    currentMapId = newMapId;
    localStorage.setItem("neon-tap-room-map", newMapId);

    await loadEnvironment(newMapId, { waitForAssets: false });
    const myEntity = playerEntities.get(myId);
    if (myEntity) {
      myEntity.group.position.set(0, 0, 0);
      if (me) { me.x = 50; me.y = 50; }
      const idx = players.findIndex((p) => p.id === myId);
      if (idx >= 0 && me) players[idx] = { ...players[idx], x: 50, y: 50 };
    }

    loadInitialChat().catch(() => {});
    setupRoomChannels(newMapId).then(() => trackLobby()).catch(() => {});
    Promise.resolve().then(() => window.radioEnterRoom?.(newMapId)).catch(() => {});
    Promise.resolve().then(() => window.interactionsEnterRoom?.(newMapId)).catch(() => {});

    addSystemLine(`Você entrou em ${MAPS.find((m) => m.id === newMapId)?.name || newMapId}.`);
  } finally {
    window.hideWorldLoading?.();
  }
}



function presencePayload() {
  return {
    id: myId,
    name: me.name,
    color: me.color,
    avatar_url: me.avatar_url,
    character_slug: me.character_slug || null,
    character_v: myCharacterVersion || characterVersionById.get(myId) || 0,
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

// Quando o usuário fecha a aba / muda de navegador, avisa todo mundo na hora
// (sem esperar o heartbeat de 30s do presence).
function notifyLeaveAndUntrack() {
  try {
    movementChannel?.send({
      type: "broadcast",
      event: "leave",
      payload: { id: myId },
    });
  } catch {}
  try { presenceChannel?.untrack(); } catch {}
  try { lobbyChannel?.untrack(); } catch {}
}
window.addEventListener("pagehide", notifyLeaveAndUntrack);
window.addEventListener("beforeunload", notifyLeaveAndUntrack);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") notifyLeaveAndUntrack();
});



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

function getMapScale() {
  const s = currentMapTransform?.scale_mul || 1;
  return Math.max(0.1, s);
}
function worldFromPercent(x, y) {
  const s = getMapScale();
  return new THREE.Vector3(
    (x / 100 - 0.5) * MAP_WIDTH * s,
    0,
    (y / 100 - 0.5) * MAP_DEPTH * s,
  );
}
function getWalkRange() {
  const v = parseFloat(localStorage.getItem("neon-walk-range") || "1");
  return Math.max(1, isFinite(v) ? v : 1);
}
function percentFromWorld(x, z) {
  const s = getMapScale();
  const r = getWalkRange();
  // Expand clamps symmetrically around 50% as r grows (r=1 keeps original 5..95 / 8..92)
  const padX = 45 * r; // half-range on X (expands with r)
  const padZ = 42 * r; // half-range on Z (expands with r)
  return {
    x: Math.max(50 - padX, Math.min(50 + padX, (x / (MAP_WIDTH * s) + 0.5) * 100)),
    y: Math.max(50 - padZ, Math.min(50 + padZ, (z / (MAP_DEPTH * s) + 0.5) * 100)),
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
const STEP_UP = 0.6;          // altura máxima de degrau que o personagem sobe automaticamente
const PLAYER_HEIGHT = 1.6;    // altura aproximada do peito/cabeça para colisão
const STAIR_NAME_RE = /stair|escad|step|ramp|slope/i;

// Registra todas as malhas de um root (env ou GLB colocado) como sólidos:
// servem ao mesmo tempo como chão (subir) e parede (bloquear se alto demais).
function registerCollidable(root) {
  const list = [];
  root.traverse((node) => {
    if (!node.isMesh || node.visible === false) return;
    // Ignora malhas puramente decorativas marcadas
    if (node.userData?.noCollide) return;
    walkableMeshes.push(node);
    colliderMeshes.push(node);
    occluderMeshes.push(node);
    list.push(node);
  });
  root.userData._collidableMeshes = list;
}
function unregisterCollidable(root) {
  const list = root?.userData?._collidableMeshes;
  if (!list || !list.length) return;
  for (const arr of [walkableMeshes, colliderMeshes, occluderMeshes]) {
    for (const m of list) {
      const i = arr.indexOf(m);
      if (i >= 0) arr.splice(i, 1);
    }
  }
  root.userData._collidableMeshes = null;
}


// Lighting groups we can swap when the map mood changes
const lightingGroup = new THREE.Group();
scene.add(lightingGroup);

// Environment GLB group (cleared/replaced on map switch)
const envGroup = new THREE.Group();
let envBaseFloor = null;

// Boundary visualizer (toggle): shows the invisible walkable area
const boundaryHelper = (() => {
  const geom = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.EdgesGeometry(geom);
  const mat = new THREE.LineBasicMaterial({ color: 0x29d3bd, transparent: true, opacity: 0.85 });
  const mesh = new THREE.LineSegments(edges, mat);
  mesh.visible = localStorage.getItem("neon-show-bounds") === "1";
  mesh.position.y = 0.6;
  scene.add(mesh);
  return mesh;
})();
function updateBoundaryHelper() {
  const s = (typeof getMapScale === "function") ? getMapScale() : 1;
  const r = (typeof getWalkRange === "function") ? getWalkRange() : 1;
  const w = MAP_WIDTH * s * 0.90 * r;
  const d = MAP_DEPTH * s * 0.84 * r;
  boundaryHelper.scale.set(w, 1.2, d);
}
function setBoundaryVisible(v) {
  boundaryHelper.visible = !!v;
  localStorage.setItem("neon-show-bounds", v ? "1" : "0");
  const btn = document.querySelector("#boundsToggleBtn");
  if (btn) {
    btn.dataset.on = v ? "1" : "0";
    btn.textContent = v ? "📐 Limites: ON" : "📐 Limites: OFF";
  }
}
updateBoundaryHelper();

function applyLightingForMood(mood) {
  // Clear previous lights
  while (lightingGroup.children.length) lightingGroup.remove(lightingGroup.children[0]);

  // Modo escuro: nenhuma luz ambiente / mood. Só as luzes custom iluminam.
  if (DARK_MODE) {
    scene.background = new THREE.Color("#020308");
    scene.fog = null;
    // Pequenísssima ambient pra não ficar 100% preto onde não chega luz
    lightingGroup.add(new THREE.AmbientLight("#0a0d18", 0.05));
    return;
  }

  function configSun(light) {
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.near = 1; light.shadow.camera.far = 50;
    light.shadow.camera.left = -18; light.shadow.camera.right = 18;
    light.shadow.camera.top = 18; light.shadow.camera.bottom = -18;
    light.shadow.bias = -0.0001;
    light.shadow.radius = 3;
    light.shadow.normalBias = 0.02;
  }

  if (mood === "day") {
    lightingGroup.add(new THREE.HemisphereLight("#fff3d6", "#7a8a9c", 1.5));
    const sun = new THREE.DirectionalLight("#fff7e0", 1.6);
    sun.position.set(8, 14, 6);
    configSun(sun);
    lightingGroup.add(sun);
    scene.background = new THREE.Color(currentMapTransform?.bg_color || "#0e1117");
    scene.fog = null;
  } else if (mood === "sunset") {
    lightingGroup.add(new THREE.HemisphereLight("#ffb98a", "#3a2a3a", 1.2));
    const sun = new THREE.DirectionalLight("#ff9a55", 1.5);
    sun.position.set(-10, 6, 4);
    configSun(sun);
    lightingGroup.add(sun);
    const fill = new THREE.PointLight("#ff6b88", 1.4, 18);
    fill.position.set(4, 3, -4);
    lightingGroup.add(fill);
    scene.background = new THREE.Color(currentMapTransform?.bg_color || "#0e1117");
    scene.fog = null;
  } else {
    lightingGroup.add(new THREE.HemisphereLight("#ffe7b0", "#243344", 1.1));
    const key = new THREE.DirectionalLight("#ffffff", 1.0);
    key.position.set(6, 10, 3);
    configSun(key);
    lightingGroup.add(key);

    const red = new THREE.PointLight("#f26868", 2.4, 12);
    red.position.set(-6.7, 3.2, -6.2);
    lightingGroup.add(red);

    const teal = new THREE.PointLight("#29d3bd", 1.8, 14);
    teal.position.set(5.7, 3.4, 3.6);
    lightingGroup.add(teal);
    scene.background = new THREE.Color(currentMapTransform?.bg_color || "#0e1117");
    scene.fog = null;
  }
}

// Re-apply shadow flags on environment meshes — sempre castShadow=true
// pra qualquer luz (mood ou custom) projetar sombras nos objetos.
function refreshEnvShadows() {
  envGroup.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
}

function setDarkMode(on, { persistLocal = false } = {}) {
  DARK_MODE = !!on;
  applyLightingForMood(currentMapTransform?.mood || "day");
  refreshEnvShadows();
  const stateEl = document.getElementById("darkModeState");
  if (stateEl) stateEl.textContent = DARK_MODE ? "ON" : "OFF";
  const btn = document.getElementById("darkModeToggle");
  if (btn) btn.style.borderColor = DARK_MODE ? "rgba(255,200,80,0.7)" : "rgba(255,255,255,0.2)";
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

  // Cenário NÃO é carregado aqui — só dentro de enterRoom()/switchRoom(),
  // para evitar mostrar um mapa de fundo antes do usuário escolher sala.
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

let currentEnvRoot = null;       // o gltf.scene atualmente carregado
let currentEnvBaseScale = 1;     // escala "auto-fit" base, antes do multiplicador admin


async function fetchMapTransform(mapId) {
  try {
    const { data } = await supabase
      .from("map_transforms")
      .select("offset_x, offset_y, offset_z, rotation_y, scale_mul, mood, dark_mode")
      .eq("map_id", mapId)
      .maybeSingle();
    return data || { offset_x: 0, offset_y: 0, offset_z: 0, rotation_y: 0, scale_mul: 1, mood: null, dark_mode: false };
  } catch {
    return { offset_x: 0, offset_y: 0, offset_z: 0, rotation_y: 0, scale_mul: 1, mood: null, dark_mode: false };
  }
}

function applyEnvTransform() {
  if (!currentEnvRoot) return;
  const t = currentMapTransform;
  const s = currentEnvBaseScale * (t.scale_mul || 1);
  currentEnvRoot.scale.setScalar(s);
  // baseOffset armazenado em unidades NÃO escaladas; multiplica pela escala final
  const base = currentEnvRoot.userData.baseOffset || { x: 0, y: 0, z: 0 };
  currentEnvRoot.position.set(
    base.x * s + (t.offset_x || 0),
    base.y * s + (t.offset_y || 0),
    base.z * s + (t.offset_z || 0),
  );
  currentEnvRoot.rotation.y = t.rotation_y || 0;
  currentEnvRoot.updateMatrixWorld(true);
  updateBoundaryHelper();
}

let __envLoadToken = 0;
async function loadEnvironment(mapId, opts = {}) {
  const waitForAssets = opts.waitForAssets !== false;
  const token = ++__envLoadToken;
  let map = MAPS.find((m) => m.id === mapId);
  if (!map) {
    // Mapa foi excluído / não existe mais — cair pro primeiro disponível.
    map = MAPS[0];
    if (!map) {
      // Sem mapas: limpa cenário e sai.
      clearEnvironment();
      currentEnvRoot = null;
      localStorage.removeItem("neon-tap-room-map");
      return;
    }
  }
  currentMapId = map.id;
  localStorage.setItem("neon-tap-room-map", map.id);

  scene.background = new THREE.Color(map.bg);
  applyLightingForMood(map.mood);
  clearEnvironment();
  currentEnvRoot = null;
  // Recarrega GLBs colocados que pertencem a este mapa (em paralelo com o env)
  const assetsPromise = loadInitialAssets();

  // Busca o transform salvo pelo admin (não bloqueia o load)
  const transformPromise = fetchMapTransform(map.id);

  // Mapa sem GLB: apenas aplica transform/luzes e sai (admin pode colocar GLBs dentro)
  if (!map.url) {
    currentMapTransform = await transformPromise;
    if (token !== __envLoadToken) { assetsPromise.catch(() => {}); return; }
    setDarkMode(!!currentMapTransform?.dark_mode);
    applyLightingForMood(currentMapTransform?.mood || map.mood || "day");
    reloadMapLights(currentMapId);
    syncMapAdminPanel();
    if (waitForAssets) try { await assetsPromise; } catch {}
    else assetsPromise.catch(() => {});
    return;
  }

  const envPromise = new Promise((resolve) => {
    let settled = false;
    let loadTimeout = null;
    const safeResolve = () => {
      if (settled) return;
      settled = true;
      if (loadTimeout) clearTimeout(loadTimeout);
      resolve();
    };
    loadTimeout = setTimeout(() => {
      console.warn("Cenário demorou demais; liberando entrada e mantendo o carregamento em segundo plano.");
      safeResolve();
    }, 12000);
    loader.load(
      map.url,
      async (gltf) => {
        try {
          if (token !== __envLoadToken) return; // outra chamada assumiu
          const env = gltf.scene;
          const box = new THREE.Box3().setFromObject(env);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const targetSize = Math.max(MAP_WIDTH, MAP_DEPTH) * 1.05;
          const currentSize = Math.max(size.x, size.z);
          const baseScale = currentSize > 0 ? targetSize / currentSize : 1;
          currentEnvBaseScale = baseScale;
          env.userData.baseOffset = { x: -center.x, y: -box.min.y, z: -center.z };

          currentMapTransform = await transformPromise;
          if (token !== __envLoadToken) return;
          setDarkMode(!!currentMapTransform?.dark_mode);
          applyLightingForMood(currentMapTransform?.mood || map.mood || "day");
          reloadMapLights(currentMapId);
          currentEnvRoot = env;
          applyEnvTransform();

          env.traverse((node) => {
            if (!node.isMesh) return;
            node.castShadow = true;
            node.receiveShadow = true;
          });
          registerCollidable(env);
          envGroup.add(env);
          syncMapAdminPanel();
        } finally {
          safeResolve();
        }
      },
      undefined,
      (err) => {
        console.error("Falha carregando cenário:", err);
        // Não tenta fallback automático para "bar" (pode estar oculto).
        // Apenas resolve — o jogador entra num cenário vazio mas a UI segue.
        localStorage.removeItem("neon-tap-room-map");
        safeResolve();
      },
    );
  });

  if (waitForAssets) {
    await Promise.all([envPromise, assetsPromise.catch(() => {})]);
  } else {
    await envPromise;
    // assetsPromise continua em background; erros silenciosos
    assetsPromise.catch(() => {});
  }
}


// Retorna a altura Y do chão sob `pos`, escolhendo o topo mais alto que o
// personagem consegue subir (até STEP_UP acima do Y atual). Permite subir
// escadas, rampas, plataformas e GLBs colocados sem ficar enterrado.
function groundHeightAt(pos, currentY) {
  if (!walkableMeshes.length) return 0;
  const baseY = currentY ?? pos.y;
  _groundOrigin.set(pos.x, baseY + 50, pos.z);
  _groundRay.set(_groundOrigin, _down);
  _groundRay.far = 100;
  const hits = _groundRay.intersectObjects(walkableMeshes, false);
  if (!hits.length) return baseY;
  const ceil = baseY + STEP_UP + 0.05;
  let best = null;
  // Acha o topo mais alto que ainda é subível; caso não exista, pega o mais alto abaixo.
  for (const h of hits) {
    if (h.point.y <= ceil) {
      if (best === null || h.point.y > best) best = h.point.y;
    }
  }
  if (best !== null) return best;
  // Sem nada subível: cai para a superfície mais alta abaixo do personagem
  let below = null;
  for (const h of hits) {
    if (h.point.y <= baseY + 0.05 && (below === null || h.point.y > below)) below = h.point.y;
  }
  return below !== null ? below : baseY;
}

// Verifica colisão entre `from` e `to`. Se houver um obstáculo baixo (≤ STEP_UP),
// permite passar (o personagem "sobe" o degrau via groundHeightAt). Apenas
// obstáculos altos (peito/cabeça) realmente bloqueiam.
function collidesAt(from, to) {
  if (!colliderMeshes.length) return false;
  _collDir.copy(to).sub(from);
  _collDir.y = 0;
  const dist = _collDir.length();
  if (dist < 0.0001) return false;
  _collDir.normalize();
  // Raio na altura do peito: qualquer hit aqui é parede de verdade
  _collOrigin.set(from.x, from.y + 1.3, from.z);
  _collRay.set(_collOrigin, _collDir);
  _collRay.far = dist + COLLISION_RADIUS;
  const chestHits = _collRay.intersectObjects(colliderMeshes, false);
  if (chestHits.length && chestHits[0].distance < dist + COLLISION_RADIUS) return true;
  // Raio na altura do joelho: se hit, checa se dá pra subir
  _collOrigin.set(from.x, from.y + 0.2, from.z);
  _collRay.set(_collOrigin, _collDir);
  _collRay.far = dist + COLLISION_RADIUS;
  const kneeHits = _collRay.intersectObjects(colliderMeshes, false);
  if (kneeHits.length && kneeHits[0].distance < dist + COLLISION_RADIUS) {
    // Mede a altura do topo do obstáculo no ponto de destino
    _groundOrigin.set(to.x, from.y + 4, to.z);
    _groundRay.set(_groundOrigin, _down);
    _groundRay.far = 10;
    const topHits = _groundRay.intersectObjects(colliderMeshes, false);
    if (!topHits.length) return true;
    // Maior Y abaixo de chest
    let top = -Infinity;
    for (const h of topHits) {
      if (h.point.y < from.y + 1.3 && h.point.y > top) top = h.point.y;
    }
    if (top === -Infinity) return false;
    if (top - from.y > STEP_UP) return true;
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
  // Paredes não somem mais. Restaura qualquer mesh que ainda esteja fadeada
  // de versões anteriores e sai. O clamping da câmera contra teto é feito
  // separadamente em clampCameraToCeiling().
  if (_fadedPrev.size) {
    for (const m of _fadedPrev) setMeshFaded(m, false);
    _fadedPrev.clear();
  }
}

// Limita o zoom-out para que a câmera não atravesse o teto do recinto.
// Se houver mesh acima do alvo, calcula a distância máxima possível ao longo
// do vetor câmera→alvo de forma que camera.position.y <= ceilingY - margem.
const _ceilRay = new THREE.Raycaster();
const _ceilOrigin = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
function clampCameraToCeiling() {
  if (window.__freeCameraMode) return;
  if (!colliderMeshes.length) { controls.maxDistance = BASE_MAX_DISTANCE; return; }
  _ceilOrigin.copy(controls.target);
  _ceilRay.set(_ceilOrigin, _up);
  _ceilRay.far = 50;
  const hits = _ceilRay.intersectObjects(colliderMeshes, false);
  let ceilingY = Infinity;
  for (const h of hits) { if (h.point.y > controls.target.y + 0.5 && h.point.y < ceilingY) ceilingY = h.point.y; }
  if (!isFinite(ceilingY)) { controls.maxDistance = BASE_MAX_DISTANCE; return; }
  const margin = 0.3;
  const maxY = ceilingY - margin;
  // direção câmera→alvo (normalizada)
  const dy = camera.position.y - controls.target.y;
  const dist = camera.position.distanceTo(controls.target);
  if (dy <= 0 || dist < 0.001) { controls.maxDistance = BASE_MAX_DISTANCE; return; }
  const sinElev = dy / dist; // componente vertical do vetor unitário
  if (sinElev <= 0.001) { controls.maxDistance = BASE_MAX_DISTANCE; return; }
  const maxDist = (maxY - controls.target.y) / sinElev;
  controls.maxDistance = Math.max(controls.minDistance + 0.1, Math.min(BASE_MAX_DISTANCE, maxDist));
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
      // Garante matrizes e bind pose atualizados antes de medir
      next.updateMatrixWorld(true);
      next.traverse((c) => {
        if (c.isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
          if (c.isSkinnedMesh && c.skeleton) {
            try { c.skeleton.update(); } catch {}
            // Recalcula bounding box/sphere com base nas posições com skin
            try { c.computeBoundingBox(); c.computeBoundingSphere(); } catch {}
            c.frustumCulled = false;
          }
        }
      });
      // Mede usando "precise=true" para considerar vértices skinned reais
      const measure = (obj) => {
        const b = new THREE.Box3();
        b.expandByObject(obj, true);
        if (!isFinite(b.min.y) || !isFinite(b.max.y)) {
          b.setFromObject(obj);
        }
        return b;
      };
      const box = measure(next);
      const size = box.getSize(new THREE.Vector3());
      // Escala pela ALTURA real (não pela maior dimensão — braços em T inflacionam X)
      const targetHeight = 1.7;
      const h = size.y || Math.max(size.x, size.z) || 1;
      next.scale.setScalar(targetHeight / h);
      next.updateMatrixWorld(true);
      // Alinha os pés ao chão (y=0 no grupo do player)
      const box2 = measure(next);
      next.position.y -= box2.min.y;
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
  // Movimento (walk/run) cancela emotes em loop como dance. Idle NÃO cancela.
  if (entity.emoteAction) {
    const isLoopEmote = entity.emoteAction.loop === THREE.LoopRepeat;
    if (isLoopEmote && (name === "walk" || name === "run")) {
      entity.emoteAction.fadeOut(0.18);
      const finished = entity.emoteAction;
      setTimeout(() => { try { finished.stop(); } catch {} }, 220);
      entity.emoteAction = null;
      entity.emoteUntil = 0;
      entity.currentAction = null;
    } else {
      // emote loop em idle: mantém. emote one-shot: bloqueia até terminar.
      return;
    }
  }

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
  if (entity.currentAction && entity.actions[entity.currentAction]) {
    entity.actions[entity.currentAction].fadeOut(0.12);
  }
  const action = entity.actions[slot];
  action.reset();
  if (slot === "dance") {
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
  } else {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
  }
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

// jump removido: animação desativada
emoteDanceButton?.addEventListener("click", () => triggerLocalEmote("dance"));
emoteWaveButton?.addEventListener("click", () => triggerLocalEmote("wave"));

// Dark mode toggle (admin) — apaga as luzes ambientes do mood
const darkModeToggleBtn = document.getElementById("darkModeToggle");
if (darkModeToggleBtn) {
  darkModeToggleBtn.addEventListener("click", async () => {
    if (!isAdmin) { alert("Apenas admin."); return; }
    const next = !DARK_MODE;
    setDarkMode(next);
    currentMapTransform = { ...currentMapTransform, dark_mode: next };
    // Persiste pra todo mundo (igual mood)
    try {
      await supabase.from("map_transforms").upsert({
        map_id: currentMapId,
        offset_x: currentMapTransform.offset_x || 0,
        offset_y: currentMapTransform.offset_y || 0,
        offset_z: currentMapTransform.offset_z || 0,
        rotation_y: currentMapTransform.rotation_y || 0,
        scale_mul: currentMapTransform.scale_mul || 1,
        mood: currentMapTransform.mood || null,
        dark_mode: next,
        updated_by: myId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "map_id" });
    } catch (e) { console.warn("dark_mode save", e); }
  });
}

// Boundary visibility toggle
const boundsToggleBtn = document.getElementById("boundsToggleBtn");
setBoundaryVisible(boundaryHelper.visible);
if (boundsToggleBtn) {
  boundsToggleBtn.addEventListener("click", () => {
    setBoundaryVisible(!boundaryHelper.visible);
    updateBoundaryHelper();
  });
}

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
    // Preserva escolhas locais (personagem/posição) — o presence pode trazer
    // valores antigos e reverter a troca de personagem ou teleportar o jogador.
    const localChar = me?.character_slug || null;
    const localAvatar = me?.avatar_url || null;
    const localX = me?.x; const localY = me?.y; const localFacing = me?.facing;
    me = { ...me, ...mine };
    if (localChar) me.character_slug = localChar;
    if (localAvatar) me.avatar_url = localAvatar;
    if (localX != null) me.x = localX;
    if (localY != null) me.y = localY;
    if (localFacing) me.facing = localFacing;
    // Reflete de volta no array `players` para manter consistência
    const idx = players.findIndex((p) => p.id === myId);
    if (idx >= 0) players[idx] = { ...players[idx], ...me };
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
      unregisterCollidable(object);
      scene.remove(object);
      assetObjects.delete(id);
    }
  }
  const pending = [];
  for (const asset of assets) {
    if (assetObjects.has(asset.id)) {
      const object = assetObjects.get(asset.id);
      object.position.set(asset.x, asset.y, asset.z);
      object.rotation.set(asset.rotationX, asset.rotationY, asset.rotationZ);
      if (object.userData.baseScale)
        object.scale.setScalar(object.userData.baseScale * asset.scale);
      object.updateMatrixWorld(true);
      unregisterCollidable(object);
      registerCollidable(object);
      continue;
    }
    pending.push(new Promise((resolve) => {
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
          object.updateMatrixWorld(true);
          registerCollidable(object);
          assetObjects.set(asset.id, object);
          resolve();
        },
        undefined,
        () => {
          const fallback = makeFallbackAsset(asset.name, asset.scale);
          fallback.position.set(asset.x, asset.y, asset.z);
          fallback.rotation.set(asset.rotationX, asset.rotationY, asset.rotationZ);
          scene.add(fallback);
          fallback.updateMatrixWorld(true);
          registerCollidable(fallback);
          assetObjects.set(asset.id, fallback);
          resolve();
        },
      );
    }));
  }
  updateAssetList(assets);
  return Promise.all(pending);
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
      ${row("Escala", "scale", asset.scale, 0.1, 200, 0.05)}
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
  const isSelf = message.user_id && myId && message.user_id === myId;
  item.className = "chat-item" + (isSelf ? " is-self" : "");
  const avatarStyle = message.avatar_url
    ? `background-image:url('${escapeHtml(message.avatar_url)}')`
    : `background:${escapeHtml(message.color || '#6c5ce7')}`;
  const initial = (message.name || "?").trim().charAt(0).toUpperCase();
  const avatarClass = message.avatar_url ? "chat-avatar" : "chat-avatar placeholder";
  const avatarContent = message.avatar_url ? "" : escapeHtml(initial);
  item.innerHTML = `
    <div class="${avatarClass}" data-user="${escapeHtml(message.user_id || '')}" style="${avatarStyle}">${avatarContent}</div>
    <div class="chat-copy">
      ${isSelf ? "" : `<span class="chat-name" data-user="${escapeHtml(message.user_id || '')}">${escapeHtml(message.name)}</span>`}
      <div class="chat-bubble">${escapeHtml(message.text)}</div>
    </div>
  `;
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
}


// ============ Movement ============
function move(dx, dy, facing) {
  if (window.__sittingInteraction) return;
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
  if (window.__sittingInteraction) return;
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
  if (window.__freeCameraMode) { applyFreeCameraMovement(); return; }
  if (window.__sittingInteraction) return;
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

function applyFreeCameraMovement() {
  const amount = 0.35;
  let fwd = 0, right = 0, up = 0;
  if (keyState.has("arrowup") || keyState.has("w")) fwd += amount;
  if (keyState.has("arrowdown") || keyState.has("s")) fwd -= amount;
  if (keyState.has("arrowleft") || keyState.has("a")) right -= amount;
  if (keyState.has("arrowright") || keyState.has("d")) right += amount;
  if (keyState.has("e")) up += amount;
  if (keyState.has("q")) up -= amount;
  if (!fwd && !right && !up) return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0; dir.normalize();
  const side = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
  const delta = new THREE.Vector3()
    .addScaledVector(dir, fwd)
    .addScaledVector(side, right)
    .addScaledVector(new THREE.Vector3(0,1,0), up);
  camera.position.add(delta);
  controls.target.add(delta);
}

function updatePlayerAnimation(delta) {
  const walkSpeed = 1.4;
  const runSpeed = 3.2;
  for (const entity of playerEntities.values()) {
    // Sit override (local player only): trava no assento, sem terreno, sem walk
    if (entity.player?.id === myId && window.__sittingInteraction) {
      const s = window.__sittingInteraction;
      if (s.worldPos) {
        entity.group.position.copy(s.worldPos);
        entity.group.rotation.y = s.worldRotY || 0;
        entity.target.copy(s.worldPos);
      }
      if (entity.mixer) entity.mixer.update(delta);
      continue;
    }
    const dxArr = entity.target.x - entity.group.position.x;
    const dzArr = entity.target.z - entity.group.position.z;
    const distance = Math.hypot(dxArr, dzArr);
    if (distance > 0.025) {
      const running = !!entity.running;
      const speed = running ? runSpeed : walkSpeed;
      const before = entity.group.position.clone();
      const step = Math.min(distance, speed * delta);
      const dir = new THREE.Vector3(dxArr, 0, dzArr).normalize();
      const candidate = before.clone().addScaledVector(dir, step);
      if (collidesAt(before, candidate)) {
        // Blocked by wall — cancel target so we stop here
        entity.target.x = before.x;
        entity.target.z = before.z;
        setPlayerAction(entity, "idle");
      } else {
        entity.group.position.x = candidate.x;
        entity.group.position.z = candidate.z;
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
      entity.group.position.x = entity.target.x;
      entity.group.position.z = entity.target.z;
      // Mantém Y do terreno mesmo parado
      const groundY = groundHeightAt(entity.group.position, entity.group.position.y);
      entity.group.position.y += (groundY - entity.group.position.y) * Math.min(1, delta * 12);
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
    projected.y += 1.8;
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
  // Spawn imediato no centro da câmera (onde você está olhando)
  const c = controls.target;
  await placeSelectedAsset({ x: c.x, y: c.y, z: c.z });
  selectedAsset = null;
  placementMode = false;
  placeButton.classList.remove("is-active");
  updateAssetList(currentAssets);
  addSystemLine(`${file.name} colocado no centro da câmera.`);
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
    map_id: currentMapId,
    name: selectedAsset.name,
    url: selectedAsset.url,
    x: point.x,
    y: point.y ?? 0,
    z: point.z,
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
  if (myId && !window.__freeCameraMode) {
    const entity = playerEntities.get(myId);
    if (entity) {
      const desired = new THREE.Vector3(entity.group.position.x, entity.group.position.y + 0.85, entity.group.position.z);
      const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
      controls.target.lerp(desired, delta * 4.0);
      camera.position.copy(controls.target).add(offset);
    }
  }
  if (window.__focusLerp) {
    const f = window.__focusLerp;
    controls.target.lerp(f.target, Math.min(1, delta * 5));
    camera.position.lerp(f.camera, Math.min(1, delta * 5));
    if (controls.target.distanceTo(f.target) < 0.05) window.__focusLerp = null;
  }
  clampCameraToCeiling();
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
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)
      || (window.__freeCameraMode && (key === "q" || key === "e"))) {
    event.preventDefault();
    keyState.add(key);
    return;
  }
  if (key === " " || key === "spacebar") { event.preventDefault(); return; }
  if (key === "e" && !window.__freeCameraMode && window.__sittingInteraction) {
    event.preventDefault();
    try { window.standUpFromInteraction?.(); } catch {}
    return;
  }
  if (window.__sittingInteraction) return; // bloqueia emotes enquanto sentado
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
      x: Math.max(-8.5 * getMapScale(), Math.min(8.5 * getMapScale(), point.x)),
      z: Math.max(-6.5 * getMapScale(), Math.min(6.5 * getMapScale(), point.z)),
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
    avatar_url: me.avatar_url || null,
    text,
    map_id: currentMapId,
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


// ===== Admin: editar transform do mapa =====
const mapAdminToggle = document.querySelector("#mapAdminToggle");
const mapAdminPanel = document.querySelector("#mapAdminPanel");
const mapAdminClose = document.querySelector("#mapAdminClose");
const mapAdminSave = document.querySelector("#mapAdminSave");
const mapAdminReset = document.querySelector("#mapAdminReset");
const mapAdminTitle = document.querySelector("#mapAdminTitle");
const mapAdminStatus = document.querySelector("#mapAdminStatus");
const mapScaleInput = document.querySelector("#mapScale");
const mapRotYInput = document.querySelector("#mapRotY");
const mapOffXInput = document.querySelector("#mapOffX");
const mapOffYInput = document.querySelector("#mapOffY");
const mapOffZInput = document.querySelector("#mapOffZ");
const mapScaleVal = document.querySelector("#mapScaleVal");
const mapRotYVal = document.querySelector("#mapRotYVal");
const mapOffXVal = document.querySelector("#mapOffXVal");
const mapOffYVal = document.querySelector("#mapOffYVal");
const mapOffZVal = document.querySelector("#mapOffZVal");
const mapScaleNum = document.querySelector("#mapScaleNum");
const mapRotYNum = document.querySelector("#mapRotYNum");
const mapOffXNum = document.querySelector("#mapOffXNum");
const mapOffYNum = document.querySelector("#mapOffYNum");
const mapOffZNum = document.querySelector("#mapOffZNum");
const walkRangeNum = document.querySelector("#walkRangeNum");
const mapMoodInput = document.querySelector("#mapMood");

function currentMapMoodEffective() {
  const m = MAPS.find((x) => x.id === currentMapId);
  return currentMapTransform?.mood || m?.mood || "day";
}

function syncMapAdminPanel() {
  if (!mapAdminPanel) return;
  const t = currentMapTransform || { offset_x: 0, offset_y: 0, offset_z: 0, rotation_y: 0, scale_mul: 1, mood: null };
  const scale = t.scale_mul ?? 1;
  const deg = Math.round(((t.rotation_y || 0) * 180) / Math.PI);
  const ox = t.offset_x ?? 1;
  const oy = t.offset_y ?? 1;
  const oz = t.offset_z ?? 1;
  if (mapScaleInput) { mapScaleInput.value = scale; mapScaleVal.textContent = scale.toFixed(2) + "×"; }
  if (mapScaleNum) mapScaleNum.value = scale;
  if (mapRotYInput) { mapRotYInput.value = deg; mapRotYVal.textContent = deg + "°"; }
  if (mapRotYNum) mapRotYNum.value = deg;
  if (mapOffXInput) { mapOffXInput.value = ox; mapOffXVal.textContent = ox.toFixed(2); }
  if (mapOffXNum) mapOffXNum.value = ox;
  if (mapOffYInput) { mapOffYInput.value = oy; mapOffYVal.textContent = oy.toFixed(2); }
  if (mapOffYNum) mapOffYNum.value = oy;
  if (mapOffZInput) { mapOffZInput.value = oz; mapOffZVal.textContent = oz.toFixed(2); }
  if (mapOffZNum) mapOffZNum.value = oz;
  if (mapMoodInput) mapMoodInput.value = currentMapMoodEffective();
  if (mapAdminTitle) {
    const m = MAPS.find((x) => x.id === currentMapId);
    mapAdminTitle.textContent = `Editar mapa: ${m?.name || currentMapId}`;
  }
}

mapAdminToggle?.addEventListener("click", () => {
  if (!isAdmin) { alert("Apenas admin."); return; }
  if (!mapAdminPanel) return;
  mapAdminPanel.hidden = !mapAdminPanel.hidden;
  if (!mapAdminPanel.hidden) syncMapAdminPanel();
});
mapAdminClose?.addEventListener("click", () => { if (mapAdminPanel) mapAdminPanel.hidden = true; });

// Collapse/expand do painel Editar mapa (igual ao Pose Debug)
(() => {
  const collapseBtn = document.getElementById("mapAdminCollapse");
  const body = document.getElementById("mapAdminBody");
  if (collapseBtn && body) {
    collapseBtn.addEventListener("click", () => {
      const hidden = body.style.display === "none";
      body.style.display = hidden ? "" : "none";
      collapseBtn.textContent = hidden ? "−" : "+";
    });
  }
})();

// Botão escudo: oculta/mostra toda a interface admin
(() => {
  const btn = document.getElementById("adminHideToggle");
  if (!btn) return;
  let hidden = false;
  btn.addEventListener("click", () => {
    hidden = !hidden;
    document.body.classList.toggle("admin-ui-hidden", hidden);
    btn.style.opacity = hidden ? "0.55" : "1";
    btn.title = hidden ? "Mostrar interface admin" : "Ocultar interface admin";
  });
})();

function onMapAdminInput() {
  const scale = parseFloat(mapScaleInput.value) || 1;
  const rotDeg = parseFloat(mapRotYInput.value) || 0;
  const ox = parseFloat(mapOffXInput.value) || 0;
  const oy = parseFloat(mapOffYInput.value) || 0;
  const oz = parseFloat(mapOffZInput.value) || 1;
  mapScaleVal.textContent = scale.toFixed(2) + "×";
  if (mapScaleNum) mapScaleNum.value = scale;
  mapRotYVal.textContent = Math.round(rotDeg) + "°";
  if (mapRotYNum) mapRotYNum.value = rotDeg;
  mapOffXVal.textContent = ox.toFixed(2);
  if (mapOffXNum) mapOffXNum.value = ox;
  mapOffYVal.textContent = oy.toFixed(2);
  if (mapOffYNum) mapOffYNum.value = oy;
  mapOffZVal.textContent = oz.toFixed(2);
  if (mapOffZNum) mapOffZNum.value = oz;
  currentMapTransform = {
    ...currentMapTransform,
    offset_x: ox, offset_y: oy, offset_z: oz,
    rotation_y: (rotDeg * Math.PI) / 180,
    scale_mul: scale,
  };
  applyEnvTransform();
}
[mapScaleInput, mapRotYInput, mapOffXInput, mapOffYInput, mapOffZInput].forEach((el) => {
  el?.addEventListener("input", onMapAdminInput);
});

function onMapAdminNumInput(el, slider) {
  return () => {
    const v = parseFloat(el.value);
    if (!Number.isNaN(v)) { slider.value = v; onMapAdminInput(); }
  };
}
if (mapScaleNum && mapScaleInput) mapScaleNum.addEventListener("input", onMapAdminNumInput(mapScaleNum, mapScaleInput));
if (mapRotYNum && mapRotYInput) mapRotYNum.addEventListener("input", onMapAdminNumInput(mapRotYNum, mapRotYInput));
if (mapOffXNum && mapOffXInput) mapOffXNum.addEventListener("input", onMapAdminNumInput(mapOffXNum, mapOffXInput));
if (mapOffYNum && mapOffYInput) mapOffYNum.addEventListener("input", onMapAdminNumInput(mapOffYNum, mapOffYInput));
if (mapOffZNum && mapOffZInput) mapOffZNum.addEventListener("input", onMapAdminNumInput(mapOffZNum, mapOffZInput));

// Walk range (área caminhável)
const walkRangeInput = document.querySelector("#walkRange");
const walkRangeVal = document.querySelector("#walkRangeVal");
if (walkRangeInput && walkRangeVal) {
  const initial = parseFloat(localStorage.getItem("neon-walk-range") || "1") || 1;
  walkRangeInput.value = initial;
  walkRangeVal.textContent = initial.toFixed(1) + "×";
  if (walkRangeNum) walkRangeNum.value = initial;
  walkRangeInput.addEventListener("input", () => {
    const v = parseFloat(walkRangeInput.value) || 1;
    walkRangeVal.textContent = v.toFixed(1) + "×";
    if (walkRangeNum) walkRangeNum.value = v;
    localStorage.setItem("neon-walk-range", String(v));
    if (typeof updateBoundaryHelper === "function") updateBoundaryHelper();
  });
  if (walkRangeNum && walkRangeInput) {
    walkRangeNum.addEventListener("input", () => {
      const v = parseFloat(walkRangeNum.value) || 1;
      walkRangeInput.value = v;
      walkRangeVal.textContent = v.toFixed(1) + "×";
      localStorage.setItem("neon-walk-range", String(v));
      if (typeof updateBoundaryHelper === "function") updateBoundaryHelper();
    });
  }
}

mapMoodInput?.addEventListener("change", () => {
  const mood = mapMoodInput.value || "day";
  currentMapTransform = { ...currentMapTransform, mood };
  applyLightingForMood(mood);
});

mapAdminReset?.addEventListener("click", () => {
  currentMapTransform = { offset_x: 0, offset_y: 0, offset_z: 0, rotation_y: 0, scale_mul: 1, mood: null };
  syncMapAdminPanel();
  applyEnvTransform();
  const m = MAPS.find((x) => x.id === currentMapId);
  applyLightingForMood(m?.mood || "day");
});

mapAdminSave?.addEventListener("click", async () => {
  if (!isAdmin) return;
  if (mapAdminStatus) mapAdminStatus.textContent = "Salvando…";
  const payload = {
    map_id: currentMapId,
    offset_x: currentMapTransform.offset_x || 0,
    offset_y: currentMapTransform.offset_y || 0,
    offset_z: currentMapTransform.offset_z || 0,
    rotation_y: currentMapTransform.rotation_y || 0,
    scale_mul: currentMapTransform.scale_mul || 1,
    mood: currentMapTransform.mood || null,
    dark_mode: !!currentMapTransform.dark_mode,
    updated_by: myId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("map_transforms").upsert(payload, { onConflict: "map_id" });
  if (mapAdminStatus) mapAdminStatus.textContent = error ? ("Erro: " + error.message) : "Salvo ✓";
  if (!error) setTimeout(() => { if (mapAdminStatus) mapAdminStatus.textContent = ""; }, 2000);
});

// Realtime: sincroniza ajustes feitos pelo admin para todos os usuários
supabase
  .channel("map-transforms")
  .on("postgres_changes", { event: "*", schema: "public", table: "map_transforms" }, (payload) => {
    const row = payload.new || payload.old;
    if (!row || row.map_id !== currentMapId) return;
    if (payload.eventType === "DELETE") {
      currentMapTransform = { offset_x: 0, offset_y: 0, offset_z: 0, rotation_y: 0, scale_mul: 1, mood: null, dark_mode: false };
      setDarkMode(false);
      const m = MAPS.find((x) => x.id === currentMapId);
      applyLightingForMood(m?.mood || "day");
    } else {
      currentMapTransform = {
        offset_x: row.offset_x, offset_y: row.offset_y, offset_z: row.offset_z,
        rotation_y: row.rotation_y, scale_mul: row.scale_mul, mood: row.mood || null,
        dark_mode: !!row.dark_mode,
      };
      setDarkMode(!!row.dark_mode);
      applyLightingForMood(row.mood || (MAPS.find((x) => x.id === currentMapId)?.mood) || "day");
    }
    applyEnvTransform();
    if (mapAdminPanel && !mapAdminPanel.hidden) syncMapAdminPanel();
  })
  .subscribe();

// ===== Custom maps (admin-created) =====
async function loadCustomMaps() {
  const [{ data, error }, { data: thumbs }] = await Promise.all([
    supabase.from("custom_maps").select("slug, name, url, mood, bg, thumb, hidden").order("created_at", { ascending: true }),
    supabase.from("map_thumbnails").select("map_id, thumb_url"),
  ]);
  if (error) { console.warn("custom_maps load:", error.message); return; }
  const thumbMap = new Map();
  for (const t of thumbs || []) thumbMap.set(t.map_id, t.thumb_url);
  const builtinSlugs = new Set(BUILTIN_MAPS.map((m) => m.id));
  const overrides = new Map();
  const hiddenBuiltins = new Set();
  const customs = [];
  for (const m of data || []) {
    if (builtinSlugs.has(m.slug)) {
      if (m.hidden) { hiddenBuiltins.add(m.slug); continue; }
      overrides.set(m.slug, {
        id: m.slug, name: m.name, url: m.url, mood: m.mood || "day",
        bg: m.bg || "#0e1117", thumb: m.thumb || "🗺️",
      });
    } else {
      if (m.hidden) continue;
      customs.push({
        id: m.slug, name: m.name, url: m.url, mood: m.mood || "day",
        bg: m.bg || "#0e1117", thumb: m.thumb || "🗺️", custom: true,
      });
    }
  }
  const merged = BUILTIN_MAPS
    .filter((b) => !hiddenBuiltins.has(b.id))
    .map((b) => {
      const ov = overrides.get(b.id);
      if (!ov) return { ...b };
      return { ...b, ...ov, url: ov.url || b.url, overridden: true };
    });
  MAPS = [...merged, ...customs].map((m) => ({ ...m, thumbUrl: thumbMap.get(m.id) || null }));
  // Se o mapa atual foi excluído/oculto, escolhe outro disponível
  if (!MAPS.some((m) => m.id === currentMapId)) {
    const next = MAPS[0]?.id || null;
    if (next) {
      currentMapId = next;
      selectedMapId = next;
      localStorage.setItem("neon-tap-room-map", next);
    } else {
      localStorage.removeItem("neon-tap-room-map");
    }
  }
  if (typeof renderMapTiles === "function" && mapSelectOverlay && !mapSelectOverlay.hidden) renderMapTiles();
}
loadCustomMaps();

supabase
  .channel("custom-maps")
  .on("postgres_changes", { event: "*", schema: "public", table: "custom_maps" }, () => {
    loadCustomMaps();
  })
  .on("postgres_changes", { event: "*", schema: "public", table: "map_thumbnails" }, () => {
    loadCustomMaps();
  })
  .subscribe();

// ===== Admin: criar novo mapa via map select overlay =====
const newMapName = document.querySelector("#newMapName");
const newMapThumb = document.querySelector("#newMapThumb");
const newMapMood = document.querySelector("#newMapMood");
const newMapBg = document.querySelector("#newMapBg");
const newMapGlb = document.querySelector("#newMapGlb");
const newMapCreate = document.querySelector("#newMapCreate");
const newMapStatus = document.querySelector("#newMapStatus");

function slugifyMap(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

newMapCreate?.addEventListener("click", async () => {
  if (!isAdmin) return;
  const name = (newMapName?.value || "").trim();
  const file = newMapGlb?.files?.[0];
  if (!name) { newMapStatus.textContent = "Informe um nome"; return; }
  let slug = slugifyMap(name);
  if (!slug) { newMapStatus.textContent = "Nome inválido"; return; }
  // Avoid collision with builtins
  if (BUILTIN_MAPS.some((m) => m.id === slug)) slug = slug + "-" + Date.now().toString(36).slice(-4);
  newMapCreate.disabled = true;
  let publicUrl = null;
  try {
    if (file) {
      newMapStatus.textContent = "Enviando arquivo…";
      const path = `maps/${slug}-${Date.now()}.glb`;
      const { error: upErr } = await supabase.storage.from("map-assets")
        .upload(path, file, { contentType: "model/gltf-binary", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("map-assets").getPublicUrl(path);
      publicUrl = pub.publicUrl;
    }
    newMapStatus.textContent = "Salvando mapa…";
    const { error: insErr } = await supabase.from("custom_maps").insert({
      slug, name, url: publicUrl,
      mood: newMapMood?.value || "day",
      bg: newMapBg?.value || "#0e1117",
      thumb: (newMapThumb?.value || "🗺️").trim() || "🗺️",
      created_by: myId,
    });
    if (insErr) throw insErr;
    newMapStatus.textContent = file ? "Mapa criado ✓" : "Mapa vazio criado ✓ — adicione GLBs dentro dele";
    newMapName.value = ""; newMapThumb.value = ""; if (newMapGlb) newMapGlb.value = "";
    await loadCustomMaps();
  } catch (e) {
    newMapStatus.textContent = "Erro: " + (e.message || e);
  } finally {
    newMapCreate.disabled = false;
    setTimeout(() => { if (newMapStatus) newMapStatus.textContent = ""; }, 4000);
  }
});


// ===== Admin: editar mapa custom (lápis) =====
async function openMapEdit(mapId) {
  if (!isAdmin) return;
  const m = MAPS.find((x) => x.id === mapId);
  if (!m) return;
  const isBuiltin = BUILTIN_MAPS.some((b) => b.id === mapId);

  // Remove modal anterior se existir
  document.getElementById("mapEditModal")?.remove();

  const modal = document.createElement("div");
  modal.id = "mapEditModal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);";
  modal.innerHTML = `
    <div style="background:#13161c;color:#eee;border:1px solid #333;border-radius:12px;padding:18px;width:min(420px,92vw);max-height:90vh;overflow-y:auto;font:13px/1.4 system-ui;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <strong style="font-size:15px;">✏️ Editar mapa</strong>
        <button id="mapEditClose" type="button" style="background:none;border:none;color:#aaa;font-size:20px;cursor:pointer;">×</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <label>Nome
          <input id="meName" type="text" maxlength="40" value="${(m.name || "").replace(/"/g, "&quot;")}" style="width:100%;padding:8px;border-radius:6px;background:#1a1f2a;color:#fff;border:1px solid #333;margin-top:4px;">
        </label>
        <div style="display:flex;gap:8px;">
          <label style="flex:1;">Thumb
            <input id="meThumb" type="text" maxlength="4" value="${(m.thumb || "").replace(/"/g, "&quot;")}" style="width:100%;padding:8px;text-align:center;border-radius:6px;background:#1a1f2a;color:#fff;border:1px solid #333;margin-top:4px;">
          </label>
          <label style="flex:1;">Clima
            <select id="meMood" style="width:100%;padding:8px;border-radius:6px;background:#1a1f2a;color:#fff;border:1px solid #333;margin-top:4px;">
              <option value="day">☀️ Dia</option>
              <option value="sunset">🌅 Tarde</option>
              <option value="night">🌙 Noite</option>
            </select>
          </label>
          <label>BG
            <input id="meBg" type="color" value="${m.bg || "#0e1117"}" style="width:48px;height:38px;margin-top:4px;display:block;border:none;background:transparent;cursor:pointer;">
          </label>
        </div>
        <div style="border:1px dashed #444;border-radius:8px;padding:10px;">
          <div style="font-size:12px;color:#9aa;margin-bottom:6px;">Trocar arquivo GLB do mapa (opcional)</div>
          <label class="file-picker" style="display:block;text-align:center;">
            <input id="meGlb" type="file" accept=".glb,model/gltf-binary">
            Escolher novo .glb
          </label>
          <div style="font-size:11px;color:#777;margin-top:6px;word-break:break-all;">Atual: ${m.url || "—"}</div>
        </div>
        <div style="border:1px dashed #444;border-radius:8px;padding:10px;">
          <div style="font-size:12px;color:#9aa;margin-bottom:6px;">Thumbnail (imagem) — opcional</div>
          ${m.thumbUrl ? `<img src="${m.thumbUrl}" alt="" style="width:100%;max-height:120px;object-fit:cover;border-radius:6px;margin-bottom:6px;">` : ""}
          <label class="file-picker" style="display:block;text-align:center;">
            <input id="meThumbImg" type="file" accept="image/*">
            ${m.thumbUrl ? "Trocar imagem" : "Escolher imagem"}
          </label>
          ${m.thumbUrl ? `<button id="meThumbRemove" type="button" style="margin-top:6px;background:#3a1a1a;color:#ff8a8a;border:1px solid #5a2a2a;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:11px;width:100%;">Remover imagem</button>` : ""}
        </div>
        <div id="meStatus" style="font-size:12px;color:#9aa;min-height:16px;"></div>
        <div style="display:flex;gap:8px;margin-top:6px;">
          ${isBuiltin ? `<button id="meRestore" type="button" style="background:#1a2a3a;color:#9ec5ff;border:1px solid #2a4a6a;border-radius:8px;padding:9px 12px;cursor:pointer;">↺ Restaurar</button>` : ""}
          <button id="meDelete" type="button" style="background:#3a1a1a;color:#ff8a8a;border:1px solid #5a2a2a;border-radius:8px;padding:9px 14px;cursor:pointer;">🗑️ Excluir</button>
          <div style="flex:1;"></div>
          <button id="meCancel" type="button" style="background:#22262e;color:#ddd;border:1px solid #333;border-radius:8px;padding:9px 14px;cursor:pointer;">Cancelar</button>
          <button id="meSave" type="button" style="background:#1e4a6e;color:#fff;border:1px solid #2d8a9e;border-radius:8px;padding:9px 14px;cursor:pointer;font-weight:600;">Salvar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector("#meMood").value = m.mood || "day";

  const close = () => modal.remove();
  modal.querySelector("#mapEditClose").onclick = close;
  modal.querySelector("#meCancel").onclick = close;
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  const status = modal.querySelector("#meStatus");

  modal.querySelector("#meSave").onclick = async () => {
    const name = modal.querySelector("#meName").value.trim();
    if (!name) { status.textContent = "Nome obrigatório"; return; }
    const thumb = (modal.querySelector("#meThumb").value || "🗺️").trim() || "🗺️";
    const mood = modal.querySelector("#meMood").value;
    const bg = modal.querySelector("#meBg").value;
    const file = modal.querySelector("#meGlb").files?.[0];
    const thumbFile = modal.querySelector("#meThumbImg")?.files?.[0];
    const saveBtn = modal.querySelector("#meSave");
    saveBtn.disabled = true;
    status.textContent = "Salvando…";
    try {
      const patch = { name, thumb, mood, bg };
      if (file) {
        status.textContent = "Enviando novo GLB…";
        const path = `maps/${m.id}-${Date.now()}.glb`;
        const { error: upErr } = await supabase.storage.from("map-assets")
          .upload(path, file, { contentType: "model/gltf-binary", upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("map-assets").getPublicUrl(path);
        patch.url = pub.publicUrl;
      }
      const { error } = await supabase.from("custom_maps").upsert(
        { slug: m.id, ...patch, url: patch.url || m.url },
        { onConflict: "slug" }
      );
      if (error) throw error;
      if (thumbFile) {
        status.textContent = "Enviando thumbnail…";
        const ext = (thumbFile.name.split(".").pop() || "png").toLowerCase();
        const tpath = `thumbs/${m.id}-${Date.now()}.${ext}`;
        const { error: tErr } = await supabase.storage.from("map-assets")
          .upload(tpath, thumbFile, { contentType: thumbFile.type || "image/png", upsert: false });
        if (tErr) throw tErr;
        const { data: tpub } = supabase.storage.from("map-assets").getPublicUrl(tpath);
        const { error: thErr } = await supabase.from("map_thumbnails").upsert(
          { map_id: m.id, thumb_url: tpub.publicUrl, updated_by: myId, updated_at: new Date().toISOString() },
          { onConflict: "map_id" }
        );
        if (thErr) throw thErr;
      }
      status.textContent = "Salvo ✓";
      await loadCustomMaps();
      // Se o mapa atual foi editado, recarrega
      if (currentMapId === m.id && patch.url) loadEnvironment(m.id);
      setTimeout(close, 600);
    } catch (e) {
      status.textContent = "Erro: " + (e.message || e);
      saveBtn.disabled = false;
    }
  };

  modal.querySelector("#meThumbRemove")?.addEventListener("click", async () => {
    if (!confirm("Remover a imagem de thumbnail?")) return;
    status.textContent = "Removendo…";
    try {
      const { error } = await supabase.from("map_thumbnails").delete().eq("map_id", m.id);
      if (error) throw error;
      status.textContent = "Removido ✓";
      await loadCustomMaps();
      setTimeout(close, 500);
    } catch (e) {
      status.textContent = "Erro: " + (e.message || e);
    }
  });

  async function cascadeDeleteMapData(mapId) {
    const tables = ["map_thumbnails", "map_transforms", "map_lights", "map_radios", "map_assets", "map_bots", "map_asset_interactions"];
    await Promise.all(tables.map((t) => supabase.from(t).delete().eq("map_id", mapId)));
  }

  modal.querySelector("#meDelete").onclick = async () => {
    if (!confirm(`Excluir o mapa "${m.name}"? Todos os objetos, luzes e configurações dele serão apagados.`)) return;
    const delBtn = modal.querySelector("#meDelete");
    delBtn.disabled = true;
    status.textContent = "Excluindo…";
    try {
      await cascadeDeleteMapData(m.id);
      if (isBuiltin) {
        // Built-in: marca como hidden (a entrada hardcoded continua existindo no código, mas some da UI)
        const { error } = await supabase.from("custom_maps").upsert(
          { slug: m.id, name: m.name, url: m.url, mood: m.mood, bg: m.bg, thumb: m.thumb, hidden: true },
          { onConflict: "slug" }
        );
        if (error) throw error;
      } else {
        const { error } = await supabase.from("custom_maps").delete().eq("slug", m.id);
        if (error) throw error;
      }
      status.textContent = "Excluído ✓";
      await loadCustomMaps();
      if (currentMapId === m.id) {
        const fallback = MAPS[0];
        if (fallback) loadEnvironment(fallback.id);
      }
      close();
    } catch (e) {
      status.textContent = "Erro: " + (e.message || e);
      delBtn.disabled = false;
    }
  };

  const restoreBtn = modal.querySelector("#meRestore");
  if (restoreBtn) {
    restoreBtn.onclick = async () => {
      if (!confirm(`Restaurar o mapa "${m.name}" para o padrão original? Customizações serão perdidas.`)) return;
      restoreBtn.disabled = true;
      status.textContent = "Restaurando…";
      try {
        const { error } = await supabase.from("custom_maps").delete().eq("slug", m.id);
        if (error) throw error;
        status.textContent = "Restaurado ✓";
        await loadCustomMaps();
        if (currentMapId === m.id) loadEnvironment(m.id);
        close();
      } catch (e) {
        status.textContent = "Erro: " + (e.message || e);
        restoreBtn.disabled = false;
      }
    };
  }
}



// ============================================================
// ===== Custom map lights (admin spotlights + sun globe) =====
// ============================================================
const customLightsGroup = new THREE.Group();
scene.add(customLightsGroup);
// id -> { row, light, target?, sunMesh?, helper? }
const customLightsMap = new Map();

function disposeCustomLight(entry) {
  if (!entry) return;
  if (entry.light) customLightsGroup.remove(entry.light);
  if (entry.target) customLightsGroup.remove(entry.target);
  if (entry.sunMesh) {
    customLightsGroup.remove(entry.sunMesh);
    entry.sunMesh.geometry?.dispose?.();
    entry.sunMesh.material?.dispose?.();
  }
}

function clearAllCustomLights() {
  for (const [, e] of customLightsMap) disposeCustomLight(e);
  customLightsMap.clear();
  while (customLightsGroup.children.length) customLightsGroup.remove(customLightsGroup.children[0]);
}

function rebuildCustomLight(row) {
  // Remove existing if any
  const existing = customLightsMap.get(row.id);
  if (existing) disposeCustomLight(existing);

  const entry = { row };
  const color = new THREE.Color(row.color || "#ffffff");
  const intensity = row.enabled === false ? 0 : (row.intensity ?? 5);

  if (row.kind === "sun") {
    // DirectionalLight + visible sphere "sun globe"
    const sun = new THREE.DirectionalLight(color, intensity);
    sun.position.set(row.pos_x, row.pos_y, row.pos_z);
    sun.castShadow = row.cast_shadow !== false;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 80;
    const halfBox = 24;
    sun.shadow.camera.left = -halfBox; sun.shadow.camera.right = halfBox;
    sun.shadow.camera.top = halfBox; sun.shadow.camera.bottom = -halfBox;
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.03;
    const tgt = new THREE.Object3D();
    tgt.position.set(row.target_x, row.target_y, row.target_z);
    customLightsGroup.add(tgt);
    sun.target = tgt;
    customLightsGroup.add(sun);

    // Visible globe (the "sun") — emissive sphere
    const radius = Math.max(0.1, row.radius ?? 1.5);
    const geo = new THREE.SphereGeometry(radius, 32, 16);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(sun.position);
    customLightsGroup.add(mesh);

    entry.light = sun;
    entry.target = tgt;
    entry.sunMesh = mesh;
  } else {
    // SpotLight
    const spot = new THREE.SpotLight(
      color,
      intensity,
      Math.max(1, row.distance ?? 30),
      THREE.MathUtils.degToRad(Math.max(1, Math.min(89, row.angle_deg ?? 35))),
      Math.max(0, Math.min(1, row.penumbra ?? 0.4)),
      1.2,
    );
    spot.position.set(row.pos_x, row.pos_y, row.pos_z);
    spot.castShadow = row.cast_shadow !== false;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = Math.max(8, (row.distance ?? 30) + 4);
    spot.shadow.bias = -0.0003;
    spot.shadow.normalBias = 0.02;
    const tgt = new THREE.Object3D();
    tgt.position.set(row.target_x, row.target_y, row.target_z);
    customLightsGroup.add(tgt);
    spot.target = tgt;
    customLightsGroup.add(spot);
    entry.light = spot;
    entry.target = tgt;
  }
  customLightsMap.set(row.id, entry);
}

async function reloadMapLights(mapId) {
  clearAllCustomLights();
  try {
    const { data, error } = await supabase
      .from("map_lights")
      .select("*")
      .eq("map_id", mapId);
    if (error) { console.warn("map_lights load", error.message); return; }
    for (const row of data || []) rebuildCustomLight(row);
    renderLightsAdminList();
  } catch (e) { console.warn("map_lights load", e); }
}

// Realtime
supabase.channel("map-lights")
  .on("postgres_changes", { event: "*", schema: "public", table: "map_lights" }, (payload) => {
    const row = payload.new || payload.old;
    if (!row || row.map_id !== currentMapId) return;
    if (payload.eventType === "DELETE") {
      const e = customLightsMap.get(row.id);
      if (e) { disposeCustomLight(e); customLightsMap.delete(row.id); }
    } else {
      rebuildCustomLight(payload.new);
    }
    renderLightsAdminList();
  })
  .subscribe();

// ---------- Admin UI ----------
const lightsAdminPanel = document.getElementById("lightsAdminPanel");
const lightsAdminList = document.getElementById("lightsAdminList");
const lightsAdminToggle = document.getElementById("lightsAdminToggle");
const lightsAdminClose = document.getElementById("lightsAdminClose");
const addSpotLightBtn = document.getElementById("addSpotLightBtn");
const addSunLightBtn = document.getElementById("addSunLightBtn");

lightsAdminToggle?.addEventListener("click", () => {
  if (!isAdmin) { alert("Apenas admin."); return; }
  lightsAdminPanel.hidden = !lightsAdminPanel.hidden;
  if (!lightsAdminPanel.hidden) renderLightsAdminList();
});
lightsAdminClose?.addEventListener("click", () => { lightsAdminPanel.hidden = true; });

async function createLight(kind) {
  if (!isAdmin) return;
  // Spawn at the camera focus point (center of view)
  const c = controls.target;
  const cx = c.x, cy = c.y, cz = c.z;
  const defaults = kind === "sun"
    ? { kind: "sun", name: "Sol", color: "#ffd27a", intensity: 2.5, pos_x: cx, pos_y: cy + 8, pos_z: cz + 2, target_x: cx, target_y: cy, target_z: cz, radius: 2.0, cast_shadow: true }
    : { kind: "spot", name: "Spot", color: "#ffffff", intensity: 8, pos_x: cx, pos_y: cy + 5, pos_z: cz, target_x: cx, target_y: cy, target_z: cz, angle_deg: 35, penumbra: 0.4, distance: 30, cast_shadow: true };
  const payload = { map_id: currentMapId, enabled: true, created_by: myId, ...defaults };
  const { error, data } = await supabase.from("map_lights").insert(payload).select().single();
  if (error) { alert("Erro: " + error.message); return; }
  if (data) rebuildCustomLight(data);
  renderLightsAdminList();
  renderLayersPanel?.();
}
addSpotLightBtn?.addEventListener("click", () => createLight("spot"));
addSunLightBtn?.addEventListener("click", () => createLight("sun"));

// Debounced per-light save
const _lightSaveTimers = new Map();
function scheduleLightSave(id, patch) {
  // Apply locally immediately
  const entry = customLightsMap.get(id);
  if (entry) {
    entry.row = { ...entry.row, ...patch };
    rebuildCustomLight(entry.row);
  }
  clearTimeout(_lightSaveTimers.get(id));
  _lightSaveTimers.set(id, setTimeout(async () => {
    const { error } = await supabase.from("map_lights").update(patch).eq("id", id);
    if (error) console.warn("light save", error.message);
  }, 250));
}

async function deleteLight(id) {
  if (!confirm("Apagar essa luz?")) return;
  const { error } = await supabase.from("map_lights").delete().eq("id", id);
  if (error) { alert("Erro: " + error.message); return; }
  const e = customLightsMap.get(id);
  if (e) { disposeCustomLight(e); customLightsMap.delete(id); }
  renderLightsAdminList();
}

function lightControlRow(row) {
  const isSun = row.kind === "sun";
  const icon = isSun ? "☀️" : "🔦";
  const slider = (label, key, min, max, step, val, fmt = (v) => v) => `
    <label style="display:block;margin:2px 0;font-size:11px;">
      ${label}: <span data-val="${key}">${fmt(val)}</span>
      <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${val}" style="width:100%">
    </label>`;
  return `
    <div data-light-id="${row.id}" style="border:1px solid #2a3040;border-radius:6px;padding:8px;background:rgba(255,255,255,0.03);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;">
        <strong style="font-size:12px;">${icon} ${row.name || (isSun ? "Sol" : "Spot")}</strong>
        <div style="display:flex;gap:4px;align-items:center;">
          <label style="font-size:11px;display:flex;align-items:center;gap:3px;cursor:pointer;">
            <input type="checkbox" data-key="enabled" ${row.enabled !== false ? "checked" : ""}> on
          </label>
          <input type="color" data-key="color" value="${row.color || "#ffffff"}" style="width:28px;height:24px;border:none;background:transparent;cursor:pointer;padding:0;">
          <button data-action="del" type="button" style="background:#5a1f1f;color:#fff;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;">✕</button>
        </div>
      </div>
      ${slider("Força", "intensity", 0, 50, 0.1, row.intensity ?? 5, (v) => Number(v).toFixed(1))}
      ${slider("Pos X", "pos_x", -30, 30, 0.1, row.pos_x ?? 0, (v) => Number(v).toFixed(1))}
      ${slider("Pos Y", "pos_y", 0, 30, 0.1, row.pos_y ?? 6, (v) => Number(v).toFixed(1))}
      ${slider("Pos Z", "pos_z", -30, 30, 0.1, row.pos_z ?? 0, (v) => Number(v).toFixed(1))}
      ${slider("Alvo X", "target_x", -30, 30, 0.1, row.target_x ?? 0, (v) => Number(v).toFixed(1))}
      ${slider("Alvo Y", "target_y", -5, 20, 0.1, row.target_y ?? 0, (v) => Number(v).toFixed(1))}
      ${slider("Alvo Z", "target_z", -30, 30, 0.1, row.target_z ?? 0, (v) => Number(v).toFixed(1))}
      ${isSun
        ? slider("Tamanho do globo", "radius", 0.2, 15, 0.1, row.radius ?? 1.5, (v) => Number(v).toFixed(1) + "m")
        : `
          ${slider("Abertura", "angle_deg", 5, 89, 1, row.angle_deg ?? 35, (v) => v + "°")}
          ${slider("Penumbra", "penumbra", 0, 1, 0.05, row.penumbra ?? 0.4, (v) => Number(v).toFixed(2))}
          ${slider("Alcance", "distance", 1, 100, 0.5, row.distance ?? 30, (v) => Number(v).toFixed(0) + "m")}
        `}
      <label style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:11px;cursor:pointer;">
        <input type="checkbox" data-key="cast_shadow" ${row.cast_shadow !== false ? "checked" : ""}>
        Projetar sombras
      </label>
    </div>`;
}

function renderLightsAdminList() {
  if (!lightsAdminList) return;
  const rows = [...customLightsMap.values()].map((e) => e.row);
  if (!rows.length) {
    lightsAdminList.innerHTML = `<div style="color:#7a8290;font-size:11px;padding:8px;text-align:center;">Nenhuma luz. Clique em <b>+ Spot</b> ou <b>+ Sol</b>.</div>`;
    return;
  }
  lightsAdminList.innerHTML = rows.map(lightControlRow).join("");
  // Wire each control
  lightsAdminList.querySelectorAll("[data-light-id]").forEach((card) => {
    const id = card.dataset.lightId;
    card.querySelectorAll("input[type=range]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const key = inp.dataset.key;
        const num = parseFloat(inp.value);
        const labelSpan = card.querySelector(`[data-val="${key}"]`);
        if (labelSpan) labelSpan.textContent = inp.value;
        scheduleLightSave(id, { [key]: num });
      });
    });
    card.querySelectorAll("input[type=color]").forEach((inp) => {
      inp.addEventListener("input", () => scheduleLightSave(id, { color: inp.value }));
    });
    card.querySelectorAll("input[type=checkbox]").forEach((inp) => {
      inp.addEventListener("change", () => scheduleLightSave(id, { [inp.dataset.key]: inp.checked }));
    });
    card.querySelector('[data-action="del"]')?.addEventListener("click", () => deleteLight(id));
  });
}

// ============================================================
// ===== Free camera + Layers panel (admin) ===================
// ============================================================
(function setupFreeCamAndLayers() {
  const freeBtn = document.getElementById("freeCamToggleBtn");
  const layersBtn = document.getElementById("layersToggleBtn");
  const layersPanel = document.getElementById("layersPanel");
  const layersClose = document.getElementById("layersClose");
  const layersBody = document.getElementById("layersBody");

  // --- Free camera ---
  function setFreeCam(on) {
    window.__freeCameraMode = !!on;
    if (on) {
      controls.maxPolarAngle = Math.PI; // permite olhar pra cima/baixo
      controls.minDistance = 0.5;
      controls.maxDistance = 200;
    } else {
      controls.maxPolarAngle = Math.PI * 0.47;
      controls.minDistance = 2.5;
      controls.maxDistance = BASE_MAX_DISTANCE;
    }
    if (freeBtn) freeBtn.innerHTML = `🎥 Câmera Livre: ${on ? "ON" : "OFF"}`;
    if (freeBtn) freeBtn.style.background = on ? "rgba(41,211,189,0.85)" : "rgba(15,23,42,0.85)";
  }
  freeBtn?.addEventListener("click", () => setFreeCam(!window.__freeCameraMode));

  // --- Focus camera on a world position ---
  window.focusCameraOn = function(pos, distance = 5) {
    const target = new THREE.Vector3(pos.x, (pos.y || 0) + 1, pos.z);
    // Manter direção atual da câmera, só recolocar a uma distância confortável
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
    if (dir.lengthSq() < 0.01) dir.set(0, 2, 5);
    dir.normalize().multiplyScalar(distance);
    const camPos = new THREE.Vector3().copy(target).add(dir);
    window.__focusLerp = { target, camera: camPos };
    if (!window.__freeCameraMode) setFreeCam(true); // entra em livre pra não voltar pro player
  };

  // --- Layers list ---
  const layerGroupsOpen = { glb: true, spot: true, sun: true };

  function renderLayersPanel() {
    if (!layersBody) return;
    const assets = (typeof currentAssets !== "undefined" ? currentAssets : []) || [];
    const lights = [...(customLightsMap?.values() || [])].map(e => e.row);
    const spots = lights.filter(l => l.kind !== "sun");
    const suns = lights.filter(l => l.kind === "sun");

    const group = (key, icon, title, rows, posOf, headerExtra = "") => {
      const open = layerGroupsOpen[key];
      const arrow = open ? "▾" : "▸";
      const items = open ? rows.map(r => {
        const p = posOf(r);
        return `<div class="layer-item" data-key="${key}" data-id="${r.id}" data-x="${p.x}" data-y="${p.y}" data-z="${p.z}"
          style="display:flex;justify-content:space-between;align-items:center;padding:5px 6px;border-radius:4px;cursor:pointer;background:rgba(255,255,255,0.04);margin:2px 0;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escapeHtml(r.name || "(sem nome)")}</span>
          <button data-del="${r.id}" data-key="${key}" type="button" style="background:#5a1f1f;color:#fff;border:none;border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;">✕</button>
        </div>`;
      }).join("") : "";
      return `
        <div style="margin-bottom:8px;border:1px solid #2a3040;border-radius:6px;overflow:hidden;">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:rgba(255,255,255,0.05);">
            <strong data-toggle="${key}" style="font-size:12px;cursor:pointer;user-select:none;flex:1;">${arrow} ${icon} ${title} <span style="color:#7a8290;font-weight:normal;">(${rows.length})</span></strong>
            ${headerExtra}
          </div>
          ${open ? `<div style="padding:4px 6px;">${rows.length ? items : '<div style="color:#7a8290;font-size:11px;padding:6px;text-align:center;">Vazio</div>'}</div>` : ""}
        </div>`;
    };

    const addGlbBtn = `<button data-add="glb" type="button" title="Adicionar novo GLB no foco da câmera" style="background:#1f5a3a;color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;margin-left:6px;">+ GLB</button>`;

    layersBody.innerHTML =
      group("glb", "📦", "GLBs", assets, (a) => ({ x: a.x, y: a.y, z: a.z }), addGlbBtn) +
      group("spot", "🔦", "Spots", spots, (l) => ({ x: l.pos_x, y: l.pos_y, z: l.pos_z })) +
      group("sun", "☀️", "Sóis", suns, (l) => ({ x: l.pos_x, y: l.pos_y, z: l.pos_z }));

    layersBody.querySelectorAll("[data-add='glb']").forEach(b => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        document.getElementById("glbInput")?.click();
      });
    });

    layersBody.querySelectorAll("[data-toggle]").forEach(el => {
      el.addEventListener("click", () => {
        const k = el.dataset.toggle;
        layerGroupsOpen[k] = !layerGroupsOpen[k];
        renderLayersPanel();
      });
    });
    layersBody.querySelectorAll(".layer-item").forEach(el => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-del]")) return;
        const x = parseFloat(el.dataset.x), y = parseFloat(el.dataset.y), z = parseFloat(el.dataset.z);
        window.focusCameraOn({ x, y, z }, 5);
        window.attachGizmoForLayer?.(el.dataset.key, el.dataset.id);
      });
    });
    layersBody.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.del;
        const key = btn.dataset.key;
        if (!confirm("Apagar esse item?")) return;
        if (key === "glb") {
          await deleteAsset(id);
        } else {
          await deleteLight(id);
        }
        renderLayersPanel();
      });
    });
  }
  window.renderLayersPanel = renderLayersPanel;

  layersBtn?.addEventListener("click", () => {
    if (!isAdmin) { alert("Apenas admin."); return; }
    layersPanel.hidden = !layersPanel.hidden;
    if (!layersPanel.hidden) renderLayersPanel();
  });
  layersClose?.addEventListener("click", () => { layersPanel.hidden = true; });

  // Re-render quando a lista de GLBs ou luzes muda no DOM
  const assetListEl = document.getElementById("assetList");
  if (assetListEl) new MutationObserver(() => renderLayersPanel()).observe(assetListEl, { childList: true });
  const lightsList = document.getElementById("lightsAdminList");
  if (lightsList) new MutationObserver(() => renderLayersPanel()).observe(lightsList, { childList: true });
})();

// ============================================================
// ===== Bots (admin avatars with selectable animations) ======
// ============================================================
const botsGroup = new THREE.Group();
scene.add(botsGroup);
// id -> { row, group, character, mixer, action, animationUrl, characterSlug, loading }
const botEntities = new Map();
let botAnimations = []; // [{id, name, url}]

const _animClipCache = new Map(); // url -> Promise<AnimationClip>
async function loadFbxClip(url) {
  if (!_animClipCache.has(url)) {
    _animClipCache.set(url, (async () => {
      const src = await loadFbxFromUrl(url);
      const clip = src.animations?.[0];
      if (!clip) throw new Error("FBX sem animações");
      return clip;
    })());
  }
  return _animClipCache.get(url);
}

async function buildBotEntity(row) {
  const character = findCharacterBySlug(row.character_slug);
  if (!character) { console.warn("[bot] personagem não encontrado:", row.character_slug); return null; }
  const { base, clips } = await loadCharacterAssets(character);
  const cloned = cloneSkeleton(base);
  cloned.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
  });
  const group = new THREE.Group();
  group.add(cloned);
  const mixer = new THREE.AnimationMixer(cloned);
  return { row, group, character: cloned, mixer, action: null, animationUrl: null, characterSlug: row.character_slug, clips };
}

async function applyBotAnimation(entity, url) {
  if (entity.animationUrl === url) return;
  if (entity.action) { entity.action.stop(); entity.action = null; }
  entity.animationUrl = url;
  if (!url) {
    const idleClip = entity.clips?.idle;
    if (idleClip && idleClip.tracks?.length) {
      const a = entity.mixer.clipAction(idleClip);
      a.reset().play(); entity.action = a;
    }
    return;
  }
  try {
    const clip = await loadFbxClip(url);
    if (entity.animationUrl !== url) return;
    const bones = collectBoneNames(entity.character);
    const retarg = retargetClipToBones(clip, bones) || clip.clone();
    const a = entity.mixer.clipAction(retarg);
    a.reset().play(); entity.action = a;
  } catch (e) { console.warn("[bot] anim", e); }
}

function applyBotTransform(entity, row) {
  entity.group.position.set(row.x, row.y, row.z);
  entity.group.rotation.y = row.rotation_y || 0;
  const s = row.scale || 1;
  entity.group.scale.setScalar(s);
}

async function upsertBot(row) {
  let entity = botEntities.get(row.id);
  if (entity && entity.characterSlug !== row.character_slug) {
    // mudou de personagem — rebuild
    botsGroup.remove(entity.group);
    botEntities.delete(row.id);
    entity = null;
  }
  if (!entity) {
    if (botEntities.has(`__loading_${row.id}`)) return;
    botEntities.set(`__loading_${row.id}`, true);
    entity = await buildBotEntity(row);
    botEntities.delete(`__loading_${row.id}`);
    if (!entity) return;
    botEntities.set(row.id, entity);
    botsGroup.add(entity.group);
  }
  entity.row = row;
  applyBotTransform(entity, row);
  await applyBotAnimation(entity, row.animation_url || null);
}

function removeBot(id) {
  const e = botEntities.get(id);
  if (!e) return;
  botsGroup.remove(e.group);
  e.mixer?.stopAllAction?.();
  botEntities.delete(id);
}

function clearAllBots() {
  for (const [id, e] of [...botEntities]) {
    if (typeof id === "string" && id.startsWith("__loading_")) continue;
    botsGroup.remove(e.group);
    botEntities.delete(id);
  }
}

async function reloadMapBots(mapId) {
  clearAllBots();
  const { data, error } = await supabase.from("map_bots").select("*").eq("map_id", mapId);
  if (error) { console.warn("map_bots load", error); return; }
  for (const row of data || []) await upsertBot(row);
  renderBotsAdminList();
  window.renderLayersPanel?.();
}

async function reloadBotAnimations() {
  const { data, error } = await supabase.from("bot_animations").select("*").order("created_at", { ascending: false });
  if (error) { console.warn(error); return; }
  botAnimations = data || [];
  renderBotAnimList();
  renderBotsAdminList();
}

// Realtime
supabase.channel("map-bots")
  .on("postgres_changes", { event: "*", schema: "public", table: "map_bots" }, async (payload) => {
    const row = payload.new || payload.old;
    if (!row || row.map_id !== currentMapId) return;
    if (payload.eventType === "DELETE") removeBot(row.id);
    else await upsertBot(payload.new);
    renderBotsAdminList(); window.renderLayersPanel?.();
  })
  .subscribe();
supabase.channel("bot-anims")
  .on("postgres_changes", { event: "*", schema: "public", table: "bot_animations" }, () => reloadBotAnimations())
  .subscribe();

// Update mixers in animate loop (hook via patch)
const _origAnimate = animate;
// Can't easily patch the already-running RAF; instead use our own ticker:
const _botClock = new THREE.Clock();
function _botTick() {
  requestAnimationFrame(_botTick);
  const dt = Math.min(_botClock.getDelta(), 0.05);
  for (const [id, e] of botEntities) {
    if (typeof id === "string" && id.startsWith("__loading_")) continue;
    e.mixer?.update?.(dt);
  }
}
_botTick();

// Reload bots when map changes
const _origReloadAssets = window._noop;
(function watchMapChange() {
  let last = currentMapId;
  setInterval(() => {
    if (currentMapId !== last) {
      last = currentMapId;
      reloadMapBots(currentMapId);
    }
  }, 1000);
})();

// initial load (defer until characters catalog ready)
async function _initBots() {
  // wait for charactersCatalog to populate
  for (let i = 0; i < 30 && !charactersCatalog.length; i++) await new Promise(r => setTimeout(r, 300));
  await reloadBotAnimations();
  await reloadMapBots(currentMapId);
}
_initBots();

// ---------- Bot CRUD UI ----------
async function createBot() {
  if (!isAdmin) return alert("Apenas admin.");
  const character = charactersCatalog[0];
  if (!character) return alert("Cadastre algum personagem primeiro.");
  const c = controls.target;
  const payload = {
    map_id: currentMapId,
    name: "Bot",
    character_slug: character.slug,
    x: c.x, y: 0, z: c.z,
    rotation_y: 0, scale: 1,
    created_by: myId,
  };
  const { data, error } = await supabase.from("map_bots").insert(payload).select().single();
  if (error) return alert("Erro: " + error.message);
  if (data) await upsertBot(data);
  renderBotsAdminList(); window.renderLayersPanel?.();
}

const _botSaveTimers = new Map();
function scheduleBotSave(id, patch) {
  const e = botEntities.get(id);
  if (e) { e.row = { ...e.row, ...patch }; applyBotTransform(e, e.row); if ("animation_url" in patch) applyBotAnimation(e, patch.animation_url); }
  clearTimeout(_botSaveTimers.get(id));
  _botSaveTimers.set(id, setTimeout(async () => {
    const { error } = await supabase.from("map_bots").update(patch).eq("id", id);
    if (error) console.warn("bot save", error.message);
  }, 250));
}

async function deleteBot(id) {
  if (!confirm("Apagar esse bot?")) return;
  const { error } = await supabase.from("map_bots").delete().eq("id", id);
  if (error) return alert("Erro: " + error.message);
  removeBot(id);
  renderBotsAdminList(); window.renderLayersPanel?.();
}

function botControlRow(row) {
  const slider = (label, key, min, max, step, val, fmt = (v) => v) => `
    <label style="display:block;margin:2px 0;font-size:11px;">
      ${label}: <span data-val="${key}">${fmt(val)}</span>
      <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${val}" style="width:100%">
    </label>`;
  const charOpts = charactersCatalog.map(c =>
    `<option value="${escapeHtml(c.slug)}" ${c.slug === row.character_slug ? "selected" : ""}>${escapeHtml(c.name)}</option>`
  ).join("");
  const animOpts = `<option value="">— Idle embutido —</option>` +
    botAnimations.map(a => `<option value="${escapeHtml(a.url)}" ${a.url === row.animation_url ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("");
  return `
    <div data-bot-id="${row.id}" style="border:1px solid #2a3040;border-radius:6px;padding:8px;background:rgba(255,255,255,0.03);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;">
        <input data-key="name" type="text" value="${escapeHtml(row.name || "Bot")}" maxlength="30" style="flex:1;background:#1a1f2a;color:#fff;border:1px solid #333;border-radius:4px;padding:3px 6px;font-size:12px;font-weight:600;">
        <button data-action="focus" type="button" title="Centralizar câmera" style="background:#333;color:#fff;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;">🎯</button>
        <button data-action="del" type="button" style="background:#5a1f1f;color:#fff;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;">✕</button>
      </div>
      <label style="display:block;margin:2px 0;font-size:11px;">Personagem
        <select data-key="character_slug" style="width:100%;background:#1a1f2a;color:#fff;border:1px solid #333;border-radius:4px;padding:3px;">${charOpts}</select>
      </label>
      <label style="display:block;margin:2px 0;font-size:11px;">Animação
        <select data-key="animation_url" style="width:100%;background:#1a1f2a;color:#fff;border:1px solid #333;border-radius:4px;padding:3px;">${animOpts}</select>
      </label>
      ${slider("Pos X", "x", -30, 30, 0.1, row.x ?? 0, v => Number(v).toFixed(1))}
      ${slider("Pos Y", "y", -2, 10, 0.05, row.y ?? 0, v => Number(v).toFixed(2))}
      ${slider("Pos Z", "z", -30, 30, 0.1, row.z ?? 0, v => Number(v).toFixed(1))}
      ${slider("Rotação Y", "rotation_y", -3.14159, 3.14159, 0.05, row.rotation_y ?? 0, v => (Number(v) * 180 / Math.PI).toFixed(0) + "°")}
      ${slider("Escala", "scale", 0.1, 200, 0.05, row.scale ?? 1, v => Number(v).toFixed(2) + "×")}
    </div>`;
}

function renderBotsAdminList() {
  const list = document.getElementById("botsAdminList");
  if (!list) return;
  const rows = [...botEntities.values()].filter(e => e?.row).map(e => e.row);
  if (!rows.length) {
    list.innerHTML = `<div style="color:#7a8290;font-size:11px;padding:8px;text-align:center;">Nenhum bot. Clique em <b>+ Adicionar bot</b>.</div>`;
    return;
  }
  list.innerHTML = rows.map(botControlRow).join("");
  list.querySelectorAll("[data-bot-id]").forEach(card => {
    const id = card.dataset.botId;
    card.querySelectorAll("input[type=range]").forEach(inp => {
      inp.addEventListener("input", () => {
        const k = inp.dataset.key; const v = parseFloat(inp.value);
        const s = card.querySelector(`[data-val="${k}"]`);
        if (s) {
          if (k === "rotation_y") s.textContent = (v * 180 / Math.PI).toFixed(0) + "°";
          else if (k === "scale") s.textContent = v.toFixed(2) + "×";
          else s.textContent = v.toFixed(2);
        }
        scheduleBotSave(id, { [k]: v });
      });
    });
    card.querySelectorAll("select").forEach(sel => {
      sel.addEventListener("change", () => scheduleBotSave(id, { [sel.dataset.key]: sel.value || null }));
    });
    const nameIn = card.querySelector('input[data-key="name"]');
    nameIn?.addEventListener("change", () => scheduleBotSave(id, { name: nameIn.value }));
    card.querySelector('[data-action="del"]')?.addEventListener("click", () => deleteBot(id));
    card.querySelector('[data-action="focus"]')?.addEventListener("click", () => {
      const e = botEntities.get(id);
      if (e) window.focusCameraOn({ x: e.row.x, y: e.row.y, z: e.row.z }, 4);
      window.attachGizmoForLayer?.("bot", id);
    });
  });
}

// Animation library UI
async function uploadBotAnimation(file, name) {
  if (!isAdmin) return alert("Apenas admin.");
  const status = document.getElementById("botAnimStatus");
  if (status) status.textContent = "Subindo " + file.name + "...";
  const path = `bot-anims/${Date.now()}-${sanitize(file.name)}`;
  const { error } = await supabase.storage.from("map-assets").upload(path, file, { contentType: "application/octet-stream", upsert: false });
  if (error) { if (status) status.textContent = "Erro: " + error.message; return; }
  const { data } = supabase.storage.from("map-assets").getPublicUrl(path);
  const { error: e2 } = await supabase.from("bot_animations").insert({ name: name || file.name.replace(/\.fbx$/i, ""), url: data.publicUrl, created_by: myId });
  if (e2) { if (status) status.textContent = "Erro: " + e2.message; return; }
  if (status) status.textContent = "OK!"; setTimeout(() => { if (status) status.textContent = ""; }, 1500);
  await reloadBotAnimations();
}

function renderBotAnimList() {
  const el = document.getElementById("botAnimList");
  if (!el) return;
  if (!botAnimations.length) { el.innerHTML = `<div style="color:#7a8290;font-size:11px;text-align:center;">Sem animações.</div>`; return; }
  el.innerHTML = botAnimations.map(a => `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:4px 6px;background:rgba(255,255,255,0.04);border-radius:4px;">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:11px;">${escapeHtml(a.name)}</span>
      <button data-del-anim="${a.id}" type="button" style="background:#5a1f1f;color:#fff;border:none;border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer;">✕</button>
    </div>`).join("");
  el.querySelectorAll("[data-del-anim]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Apagar essa animação da biblioteca?")) return;
      const { error } = await supabase.from("bot_animations").delete().eq("id", btn.dataset.delAnim);
      if (error) return alert(error.message);
      await reloadBotAnimations();
    });
  });
}

document.getElementById("addBotBtn")?.addEventListener("click", createBot);
document.getElementById("botAnimFile")?.addEventListener("change", (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  const nameInp = document.getElementById("botAnimName");
  uploadBotAnimation(f, nameInp?.value?.trim());
  e.target.value = "";
  if (nameInp) nameInp.value = "";
});

// ============================================================
// ===== Floating panels: draggable + minimizable + closable ==
// ============================================================
(function setupFloatingPanels() {
  function makePanel(panel, opts = {}) {
    if (!panel || panel.dataset.fpReady) return;
    panel.dataset.fpReady = "1";
    const head = opts.head || panel.querySelector(".panel-head") || panel.firstElementChild;
    const body = opts.body || panel.querySelector(".panel-body");
    const closeBtn = opts.closeBtn || panel.querySelector("[data-panel-close]");
    const minBtn = opts.minBtn || panel.querySelector("[data-panel-min]");

    // Drag
    if (head) {
      head.style.cursor = "move";
      head.style.userSelect = "none";
      head.addEventListener("mousedown", (e) => {
        if (e.target.closest("button,input,select,textarea")) return;
        const rect = panel.getBoundingClientRect();
        const parent = panel.offsetParent?.getBoundingClientRect() || { left: 0, top: 0 };
        const offX = e.clientX - rect.left;
        const offY = e.clientY - rect.top;
        function onMove(ev) {
          const x = ev.clientX - parent.left - offX;
          const y = ev.clientY - parent.top - offY;
          panel.style.left = Math.max(0, x) + "px";
          panel.style.top = Math.max(0, y) + "px";
          panel.style.right = "auto"; panel.style.bottom = "auto";
        }
        function onUp() { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        e.preventDefault();
      });
    }

    // Minimize
    if (minBtn && body) {
      minBtn.addEventListener("click", () => {
        const min = body.style.display === "none";
        body.style.display = min ? "" : "none";
        minBtn.textContent = min ? "−" : "+";
      });
    }

    // Close
    if (closeBtn) {
      closeBtn.addEventListener("click", () => { panel.hidden = true; });
    }
  }

  // Bots panel (already has data attrs)
  makePanel(document.getElementById("botsAdminPanel"));

  // Wire existing panels by passing custom selectors
  const mp = document.getElementById("mapAdminPanel");
  if (mp) makePanel(mp, {
    head: mp.querySelector("div"),
    body: document.getElementById("mapAdminBody"),
    closeBtn: document.getElementById("mapAdminClose"),
    minBtn: document.getElementById("mapAdminCollapse"),
  });

  const lp = document.getElementById("lightsAdminPanel");
  if (lp) makePanel(lp, {
    head: lp.querySelector("div"),
    body: document.getElementById("lightsAdminList")?.parentElement,
    closeBtn: document.getElementById("lightsAdminClose"),
  });
  // add minimize button to lights panel
  const lpHead = lp?.querySelector("div");
  if (lp && lpHead && !lp.querySelector("[data-panel-min]")) {
    const m = document.createElement("button");
    m.type = "button"; m.textContent = "−";
    m.style.cssText = "background:transparent;border:1px solid #555;color:#eee;border-radius:4px;padding:2px 8px;cursor:pointer;margin-right:4px;";
    const closeBtn = document.getElementById("lightsAdminClose");
    closeBtn?.parentElement?.insertBefore(m, closeBtn);
    const body = lp.querySelector("#lightsAdminList")?.parentElement;
    m.addEventListener("click", () => {
      // collapse everything except head row
      const children = [...lp.children]; let skipFirst = true;
      for (const ch of children) {
        if (skipFirst) { skipFirst = false; continue; }
        ch.style.display = ch.style.display === "none" ? "" : "none";
      }
      m.textContent = m.textContent === "−" ? "+" : "−";
    });
  }

  const layp = document.getElementById("layersPanel");
  if (layp) makePanel(layp, {
    head: layp.querySelector("div"),
    body: document.getElementById("layersBody"),
    closeBtn: document.getElementById("layersClose"),
  });
  // add minimize for layers
  const layHead = layp?.querySelector("div");
  if (layp && layHead && !layp.querySelector("[data-panel-min]")) {
    const m = document.createElement("button");
    m.type = "button"; m.textContent = "−";
    m.style.cssText = "background:transparent;border:1px solid #555;color:#eee;border-radius:4px;padding:2px 8px;cursor:pointer;margin-right:4px;";
    const closeBtn = document.getElementById("layersClose");
    closeBtn?.parentElement?.insertBefore(m, closeBtn);
    m.addEventListener("click", () => {
      const body = document.getElementById("layersBody");
      const hint = body?.nextElementSibling;
      const hidden = body.style.display === "none";
      if (body) body.style.display = hidden ? "" : "none";
      if (hint) hint.style.display = hidden ? "" : "none";
      m.textContent = hidden ? "−" : "+";
    });
  }

  // Interactions panel (já tem .panel-head / .panel-body / data-panel-min/close)
  makePanel(document.getElementById("interactionsAdminPanel"));
  // Radio panel idem
  makePanel(document.getElementById("radioAdminPanel"));

  // Pose debug removido

})();

// Bots panel toggle
document.getElementById("botsToggleBtn")?.addEventListener("click", () => {
  if (!isAdmin) return alert("Apenas admin.");
  const p = document.getElementById("botsAdminPanel");
  p.hidden = !p.hidden;
  if (!p.hidden) renderBotsAdminList();
});

// Add bots to layers panel
(function extendLayersWithBots() {
  const orig = window.renderLayersPanel;
  if (!orig) return;
  window.renderLayersPanel = function() {
    orig();
    const layersBody = document.getElementById("layersBody");
    if (!layersBody) return;
    const bots = [...botEntities.values()].filter(e => e?.row).map(e => e.row);
    const open = true;
    const items = bots.map(r => `
      <div class="layer-item" data-bot-id="${r.id}" data-x="${r.x}" data-y="${r.y}" data-z="${r.z}"
        style="display:flex;justify-content:space-between;align-items:center;padding:5px 6px;border-radius:4px;cursor:pointer;background:rgba(255,255,255,0.04);margin:2px 0;">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">🤖 ${escapeHtml(r.name || "Bot")}</span>
        <button data-del-bot="${r.id}" type="button" style="background:#5a1f1f;color:#fff;border:none;border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;">✕</button>
      </div>`).join("");
    const html = `
      <div style="margin-bottom:8px;border:1px solid #2a3040;border-radius:6px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:rgba(255,255,255,0.05);user-select:none;">
          <strong style="font-size:12px;">▾ 🤖 Bots <span style="color:#7a8290;font-weight:normal;">(${bots.length})</span></strong>
        </div>
        <div style="padding:4px 6px;">${bots.length ? items : '<div style="color:#7a8290;font-size:11px;padding:6px;text-align:center;">Vazio</div>'}</div>
      </div>`;
    layersBody.insertAdjacentHTML("beforeend", html);
    layersBody.querySelectorAll("[data-bot-id]").forEach(el => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-del-bot]")) return;
        const x = parseFloat(el.dataset.x), y = parseFloat(el.dataset.y), z = parseFloat(el.dataset.z);
        window.focusCameraOn({ x, y, z }, 4);
        window.attachGizmoForLayer?.("bot", el.dataset.botId);
        // Open bots panel and scroll to row
        const p = document.getElementById("botsAdminPanel");
        if (p) { p.hidden = false; renderBotsAdminList(); }
        setTimeout(() => {
          const card = document.querySelector(`[data-bot-id="${el.dataset.botId}"]`);
          card?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      });
    });
    layersBody.querySelectorAll("[data-del-bot]").forEach(btn => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); deleteBot(btn.dataset.delBot); });
    });
  };
})();

// ============ Layers: grupo "Mapas" (editar/trocar GLB fonte) ============
(function extendLayersWithMaps() {
  const orig = window.renderLayersPanel;
  if (!orig) return;
  const mapsGroupOpen = { v: true };
  let pendingReplaceSlug = null;

  const replaceInput = document.getElementById("replaceMapGlbInput");
  replaceInput?.addEventListener("change", async () => {
    const file = replaceInput.files?.[0];
    const slug = pendingReplaceSlug;
    pendingReplaceSlug = null;
    replaceInput.value = "";
    if (!file || !slug) return;
    try {
      addSystemLine?.(`Enviando novo GLB para "${slug}"…`);
      const path = `maps/${slug}-${Date.now()}.glb`;
      const { error: upErr } = await supabase.storage.from("map-assets")
        .upload(path, file, { contentType: "model/gltf-binary", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("map-assets").getPublicUrl(path);
      const { error: updErr } = await supabase.from("custom_maps")
        .update({ url: pub.publicUrl, updated_at: new Date().toISOString() })
        .eq("slug", slug);
      if (updErr) throw updErr;
      await loadCustomMaps();
      addSystemLine?.(`Mapa "${slug}" atualizado ✓`);
      if (currentMapId === slug) {
        addSystemLine?.("Recarregando mapa…");
        await loadEnvironment(slug);
      }
      window.renderLayersPanel?.();
    } catch (e) {
      addSystemLine?.("Erro ao trocar GLB: " + (e?.message || e));
    }
  });

  window.renderLayersPanel = function() {
    orig();
    const layersBody = document.getElementById("layersBody");
    if (!layersBody) return;
    const customs = (typeof MAPS !== "undefined" ? MAPS : []).filter(m => m.custom);
    const open = mapsGroupOpen.v;
    const arrow = open ? "▾" : "▸";
    const items = open ? customs.map(m => {
      const isCur = m.id === currentMapId;
      return `
        <div class="layer-item map-row" data-map-slug="${escapeHtml(m.id)}"
          style="display:flex;justify-content:space-between;align-items:center;padding:5px 6px;border-radius:4px;cursor:pointer;background:${isCur ? "rgba(41,211,189,0.15)" : "rgba(255,255,255,0.04)"};margin:2px 0;border:1px solid ${isCur ? "rgba(41,211,189,0.4)" : "transparent"};">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">
            ${escapeHtml(m.thumb || "🗺️")} ${escapeHtml(m.name || m.id)}${isCur ? " <em style='color:#29d3bd;font-style:normal;font-size:10px;'>(atual)</em>" : ""}
          </span>
          <button data-replace-map="${escapeHtml(m.id)}" type="button" title="Trocar arquivo GLB fonte" style="background:#1f3a5a;color:#fff;border:none;border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;">↻ GLB</button>
          <button data-del-map="${escapeHtml(m.id)}" type="button" title="Apagar mapa" style="background:#5a1f1f;color:#fff;border:none;border-radius:4px;padding:1px 6px;font-size:10px;cursor:pointer;margin-left:4px;">✕</button>
        </div>`;
    }).join("") : "";
    const html = `
      <div style="margin-bottom:8px;border:1px solid #2a3040;border-radius:6px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:rgba(255,255,255,0.05);user-select:none;">
          <strong data-toggle-maps style="font-size:12px;cursor:pointer;flex:1;">${arrow} 🗺️ Mapas <span style="color:#7a8290;font-weight:normal;">(${customs.length})</span></strong>
        </div>
        ${open ? `<div style="padding:4px 6px;">${customs.length ? items : '<div style="color:#7a8290;font-size:11px;padding:6px;text-align:center;">Nenhum mapa custom</div>'}</div>` : ""}
      </div>`;
    layersBody.insertAdjacentHTML("beforeend", html);

    layersBody.querySelector("[data-toggle-maps]")?.addEventListener("click", () => {
      mapsGroupOpen.v = !mapsGroupOpen.v;
      window.renderLayersPanel?.();
    });
    layersBody.querySelectorAll(".map-row").forEach(el => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-replace-map]") || e.target.closest("[data-del-map]")) return;
        const slug = el.dataset.mapSlug;
        if (slug && slug !== currentMapId) {
          switchRoom(slug).catch(err => addSystemLine?.("Erro: " + (err?.message || err)));
        }
      });
    });
    layersBody.querySelectorAll("[data-replace-map]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        pendingReplaceSlug = btn.dataset.replaceMap;
        replaceInput?.click();
      });
    });
    layersBody.querySelectorAll("[data-del-map]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const slug = btn.dataset.delMap;
        if (slug === currentMapId) { alert("Saia desse mapa antes de apagá-lo."); return; }
        if (!confirm(`Apagar o mapa "${slug}"?`)) return;
        const { error } = await supabase.from("custom_maps").delete().eq("slug", slug);
        if (error) { alert("Erro: " + error.message); return; }
        await loadCustomMaps();
        window.renderLayersPanel?.();
      });
    });
  };
  // Re-render quando custom_maps mudar
  if (typeof supabase !== "undefined") {
    supabase
      .channel("custom-maps-layers")
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_maps" }, () => {
        setTimeout(() => window.renderLayersPanel?.(), 100);
      })
      .subscribe();
  }
})();

// ============ Axis Gizmo — setinhas de eixo para arrastar itens ============
(function setupAxisGizmo() {
  if (typeof THREE === "undefined" || !scene || !camera || !renderer || !controls) return;

  const group = new THREE.Group();
  group.name = "__axisGizmo";
  group.visible = false;
  scene.add(group);

  const AXES = [
    { name: "x", dir: new THREE.Vector3(1, 0, 0), color: 0xff3344, rot: ["z", -Math.PI / 2] },
    { name: "y", dir: new THREE.Vector3(0, 1, 0), color: 0x44ff66, rot: null },
    { name: "z", dir: new THREE.Vector3(0, 0, 1), color: 0x3388ff, rot: ["x", Math.PI / 2] },
  ];
  const arrows = [];
  const pickMeshes = [];
  for (const a of AXES) {
    const arr = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: a.color, depthTest: false, transparent: true, opacity: 0.95 });
    const shaftGeom = new THREE.CylinderGeometry(0.05, 0.05, 1.0, 10);
    shaftGeom.translate(0, 0.5, 0);
    const headGeom = new THREE.ConeGeometry(0.16, 0.36, 14);
    headGeom.translate(0, 1.18, 0);
    const shaft = new THREE.Mesh(shaftGeom, mat);
    const head = new THREE.Mesh(headGeom, mat);
    // pick volume invisível (mais grosso, fácil de clicar)
    const pickGeom = new THREE.CylinderGeometry(0.22, 0.22, 1.4, 8);
    pickGeom.translate(0, 0.7, 0);
    const pick = new THREE.Mesh(pickGeom, new THREE.MeshBasicMaterial({ visible: false, depthTest: false }));
    pick.userData.axisName = a.name;
    arr.add(shaft, head, pick);
    if (a.rot) arr.rotation[a.rot[0]] = a.rot[1];
    arr.userData.axis = a.dir.clone();
    arr.userData.axisName = a.name;
    arr.userData.mat = mat;
    arr.traverse((o) => { o.renderOrder = 9999; });
    group.add(arr);
    arrows.push(arr);
    pickMeshes.push(pick);
  }

  let target = null; // { getPosition, setPosition(v, commit) }
  let dragging = null;

  function attach(t) {
    target = t || null;
    group.visible = !!t;
  }
  function detach() {
    target = null;
    group.visible = false;
    if (dragging) { controls.enabled = true; dragging = null; }
  }
  window.attachGizmo = attach;
  window.detachGizmo = detach;

  // Atualização por frame: segue posição do alvo + escala com a distância da câmera
  function tick() {
    requestAnimationFrame(tick);
    if (!target || !group.visible) return;
    const p = target.getPosition?.();
    if (!p) { detach(); return; }
    group.position.copy(p);
    const dist = camera.position.distanceTo(group.position);
    const s = Math.max(0.4, dist * 0.10);
    group.scale.setScalar(s);
    for (const arr of arrows) {
      const hi = dragging && dragging.axisName === arr.userData.axisName;
      arr.userData.mat.opacity = hi ? 1 : 0.9;
    }
  }
  tick();

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function setNdc(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  renderer.domElement.addEventListener("pointerdown", (ev) => {
    if (!target || !group.visible) return;
    setNdc(ev);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickMeshes, false);
    if (!hits.length) return;
    const axisName = hits[0].object.userData.axisName;
    const axisDef = AXES.find((a) => a.name === axisName);
    if (!axisDef) return;
    ev.stopPropagation();
    ev.preventDefault();
    controls.enabled = false;
    if (pointerDown) pointerDown = null; // evita que o handler de clique do mapa dispare
    const axisWorld = axisDef.dir.clone();
    const startPos = target.getPosition().clone();
    const camDir = new THREE.Vector3().subVectors(camera.position, startPos).normalize();
    const n = new THREE.Vector3().crossVectors(axisWorld, new THREE.Vector3().crossVectors(camDir, axisWorld));
    if (n.lengthSq() < 1e-6) n.copy(camDir);
    n.normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, startPos);
    const hit0 = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit0)) { controls.enabled = true; return; }
    dragging = { axisName, axis: axisWorld, startPos, plane, hit0 };
  }, true);

  window.addEventListener("pointermove", (ev) => {
    if (!dragging || !target) return;
    setNdc(ev);
    ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(dragging.plane, hit)) return;
    const d = new THREE.Vector3().subVectors(hit, dragging.hit0).dot(dragging.axis);
    const newPos = new THREE.Vector3().copy(dragging.startPos).addScaledVector(dragging.axis, d);
    target.setPosition(newPos, false);
  });

  window.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = null;
    controls.enabled = true;
    if (target) {
      const p = target.getPosition();
      target.setPosition(p, true); // commit final
    }
  });

  // Helper que liga o gizmo a um item das camadas (GLB, spot, sun, bot)
  window.attachGizmoForLayer = function (kind, id) {
    if (!isAdmin) return;
    if (kind === "glb") {
      const obj = assetObjects.get(id);
      const a = currentAssets.find((x) => x.id === id);
      if (!obj || !a) return;
      attach({
        getPosition: () => obj.position.clone(),
        setPosition: (v, commit) => {
          obj.position.copy(v);
          a.x = v.x; a.y = v.y; a.z = v.z;
          if (commit) updateAsset(id, { x: v.x, y: v.y, z: v.z });
        },
      });
    } else if (kind === "spot" || kind === "sun") {
      const e = customLightsMap.get(id);
      if (!e) return;
      attach({
        getPosition: () => new THREE.Vector3(e.row.pos_x || 0, e.row.pos_y || 0, e.row.pos_z || 0),
        setPosition: (v, commit) => {
          e.row.pos_x = v.x; e.row.pos_y = v.y; e.row.pos_z = v.z;
          try { rebuildCustomLight(e.row); } catch {}
          if (commit) scheduleLightSave(id, { pos_x: v.x, pos_y: v.y, pos_z: v.z });
        },
      });
    } else if (kind === "bot") {
      const e = botEntities.get(id);
      if (!e) return;
      attach({
        getPosition: () => new THREE.Vector3(e.row.x || 0, e.row.y || 0, e.row.z || 0),
        setPosition: (v, commit) => {
          e.row.x = v.x; e.row.y = v.y; e.row.z = v.z;
          try { applyBotTransform(e, e.row); } catch {}
          if (commit) scheduleBotSave(id, { x: v.x, y: v.y, z: v.z });
        },
      });
    }
  };
})();

// ============ Profile + Follow + DM ============
(function setupProfileAndDM() {
  const $ = (id) => document.getElementById(id);
  const overlay = $("profileOverlay");
  const dmOverlay = $("dmOverlay");
  const inboxOverlay = $("dmInboxOverlay");
  if (!overlay) return;

  const PHOTO_LIMIT = 15;
  let currentProfileId = null;
  let currentDmPeer = null;
  let dmChannel = null;

  const closeAll = () => { overlay.hidden = true; dmOverlay.hidden = true; inboxOverlay.hidden = true; };
  $("profileClose").onclick = () => overlay.hidden = true;
  $("dmClose").onclick = () => { dmOverlay.hidden = true; if (dmChannel) { supabase.removeChannel(dmChannel); dmChannel = null; } };
  $("dmBack").onclick = () => $("dmClose").click();
  $("dmInboxClose").onclick = () => inboxOverlay.hidden = true;

  async function openProfile(userId) {
    if (!userId) return;
    currentProfileId = userId;
    overlay.hidden = false;
    const isMe = userId === myId;
    const { data: p } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    $("profileName").textContent = p?.nickname || "Usuário";
    $("profileBio").textContent = p?.bio || "Sem descrição.";
    const av = p?.avatar_url || "";
    $("profileAvatar").src = av || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='100%' height='100%' fill='%232a2750'/></svg>";
    $("profileAvatarEdit").hidden = !isMe;
    $("profileEditBtn").hidden = !isMe;
    $("profileFollowBtn").hidden = isMe;
    $("profileDmBtn").hidden = isMe;
    $("profileAddPhoto").hidden = !isMe;
    $("profileBioEdit").hidden = true;
    $("profileEditActions").hidden = true;

    const [{ count: fc }, { count: fwc }, { data: photos }] = await Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
      supabase.from("profile_photos").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    ]);
    $("profileFollowerCount").textContent = fc || 0;
    $("profileFollowingCount").textContent = fwc || 0;
    $("profilePostCount").textContent = (photos || []).length;

    if (!isMe && myId) {
      const { data: rel } = await supabase.from("follows").select("id").eq("follower_id", myId).eq("following_id", userId).maybeSingle();
      const btn = $("profileFollowBtn");
      btn.textContent = rel ? "Deixar de seguir" : "Seguir";
      btn.dataset.following = rel ? "1" : "";
    }

    const grid = $("profileGrid");
    grid.innerHTML = "";
    (photos || []).forEach((ph) => {
      const div = document.createElement("div");
      div.className = "ig-grid-item";
      div.innerHTML = `<img src="${ph.url}" alt="">${isMe ? `<button class="del" data-id="${ph.id}" title="Remover">×</button>` : ""}`;
      grid.appendChild(div);
    });
    grid.onclick = async (e) => {
      const del = e.target.closest(".del");
      if (del && confirm("Remover esta foto?")) {
        await supabase.from("profile_photos").delete().eq("id", del.dataset.id);
        openProfile(currentProfileId);
      }
    };
  }

  $("profileFollowBtn").onclick = async () => {
    if (!myId || !currentProfileId) return;
    const btn = $("profileFollowBtn");
    if (btn.dataset.following) {
      await supabase.from("follows").delete().eq("follower_id", myId).eq("following_id", currentProfileId);
    } else {
      await supabase.from("follows").insert({ follower_id: myId, following_id: currentProfileId });
    }
    openProfile(currentProfileId);
  };

  $("profileEditBtn").onclick = () => {
    $("profileBioEdit").value = $("profileBio").textContent === "Sem descrição." ? "" : $("profileBio").textContent;
    $("profileBioEdit").hidden = false;
    $("profileEditActions").hidden = false;
  };
  $("profileBioCancel").onclick = () => { $("profileBioEdit").hidden = true; $("profileEditActions").hidden = true; };
  $("profileBioSave").onclick = async () => {
    const bio = $("profileBioEdit").value.trim().slice(0, 240);
    await supabase.from("profiles").update({ bio }).eq("id", myId);
    openProfile(myId);
  };

  $("profileAvatarEdit").onclick = () => $("profileAvatarFile").click();
  $("profileAvatarFile").onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f || !myId) return;
    const path = `${myId}/avatar-${Date.now()}.${(f.name.split('.').pop()||'png').toLowerCase()}`;
    const { error } = await supabase.storage.from("profile-photos").upload(path, f, { upsert: true });
    if (error) return alert("Falha no upload: " + error.message);
    const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", myId);
    if (me) me.avatar_url = data.publicUrl;
    openProfile(myId);
  };

  $("profilePhotoFile").onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f || !myId) return;
    const { count } = await supabase.from("profile_photos").select("*", { count: "exact", head: true }).eq("user_id", myId);
    if ((count || 0) >= PHOTO_LIMIT) return alert(`Limite de ${PHOTO_LIMIT} fotos atingido.`);
    const path = `${myId}/photo-${Date.now()}.${(f.name.split('.').pop()||'png').toLowerCase()}`;
    const { error } = await supabase.storage.from("profile-photos").upload(path, f);
    if (error) return alert("Falha: " + error.message);
    const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
    await supabase.from("profile_photos").insert({ user_id: myId, url: data.publicUrl, position: count || 0 });
    e.target.value = "";
    openProfile(myId);
  };

  // ===== DM =====
  async function openDm(peerId) {
    if (!peerId || peerId === myId) return;
    currentDmPeer = peerId;
    overlay.hidden = true;
    dmOverlay.hidden = false;
    const { data: peer } = await supabase.from("profiles").select("*").eq("id", peerId).maybeSingle();
    $("dmPeerName").textContent = peer?.nickname || "Usuário";
    $("dmPeerAvatar").src = peer?.avatar_url || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36'><rect fill='%232a2750' width='100%' height='100%'/></svg>";
    const log = $("dmLog");
    log.innerHTML = "";
    const { data: msgs } = await supabase.from("direct_messages")
      .select("*")
      .or(`and(from_user.eq.${myId},to_user.eq.${peerId}),and(from_user.eq.${peerId},to_user.eq.${myId})`)
      .order("created_at", { ascending: true }).limit(200);
    (msgs || []).forEach(renderDm);
    log.scrollTop = log.scrollHeight;
    await supabase.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("to_user", myId).eq("from_user", peerId).is("read_at", null);

    if (dmChannel) await supabase.removeChannel(dmChannel);
    dmChannel = supabase.channel(`dm:${myId}:${peerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (p) => {
        const m = p.new;
        if ((m.from_user === myId && m.to_user === peerId) || (m.from_user === peerId && m.to_user === myId)) {
          renderDm(m); log.scrollTop = log.scrollHeight;
        }
      }).subscribe();
  }
  function renderDm(m) {
    const div = document.createElement("div");
    div.className = "dm-msg" + (m.from_user === myId ? " is-self" : "");
    div.textContent = m.text;
    $("dmLog").appendChild(div);
  }
  $("dmForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = $("dmInput").value.trim();
    if (!t || !currentDmPeer || !myId) return;
    $("dmInput").value = "";
    await supabase.from("direct_messages").insert({ from_user: myId, to_user: currentDmPeer, text: t });
  });
  $("profileDmBtn").onclick = () => openDm(currentProfileId);

  async function openInbox() {
    if (!myId) return;
    inboxOverlay.hidden = false;
    const { data } = await supabase.from("direct_messages")
      .select("*").or(`from_user.eq.${myId},to_user.eq.${myId}`).order("created_at", { ascending: false }).limit(200);
    const peers = new Map();
    (data || []).forEach((m) => {
      const peer = m.from_user === myId ? m.to_user : m.from_user;
      if (!peers.has(peer)) peers.set(peer, { last: m, unread: 0 });
      if (m.to_user === myId && !m.read_at) peers.get(peer).unread++;
    });
    const list = $("dmInboxList"); list.innerHTML = "";
    if (peers.size === 0) { list.innerHTML = '<p style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem;">Sem mensagens ainda.</p>'; return; }
    const ids = [...peers.keys()];
    const { data: profs } = await supabase.from("profiles").select("id,nickname,avatar_url").in("id", ids);
    const pm = new Map((profs || []).map((p) => [p.id, p]));
    peers.forEach((info, pid) => {
      const p = pm.get(pid) || {};
      const div = document.createElement("div");
      div.className = "dm-inbox-item";
      div.innerHTML = `
        <img class="dm-avatar" src="${p.avatar_url || ''}" alt="">
        <div style="min-width:0;flex:1;">
          <div class="name">${(p.nickname || 'Usuário').replace(/</g,'&lt;')}</div>
          <div class="preview">${(info.last.text || '').slice(0,60).replace(/</g,'&lt;')}</div>
        </div>
        ${info.unread ? '<span class="unread"></span>' : ''}
      `;
      div.onclick = () => { inboxOverlay.hidden = true; openDm(pid); };
      list.appendChild(div);
    });
  }

  // Wire buttons
  const openProfileBtn = $("openProfileButton");
  const openInboxBtn = $("openDmInboxButton");
  if (openProfileBtn) openProfileBtn.onclick = () => myId && openProfile(myId);
  if (openInboxBtn) openInboxBtn.onclick = openInbox;
  const mpb = $("mobileProfileBtn"); if (mpb) mpb.onclick = () => myId && openProfile(myId);
  const mdb = $("mobileDmBtn"); if (mdb) mdb.onclick = openInbox;

  // Click avatar / name in chat -> open profile
  document.getElementById("chatLog")?.addEventListener("click", (e) => {
    const el = e.target.closest("[data-user]");
    if (el && el.dataset.user) openProfile(el.dataset.user);
  });

  // Global DM badge updater
  const dmBadge = $("mobileDmBadge");
  async function refreshDmBadge() {
    if (!myId) return;
    const { count } = await supabase.from("direct_messages").select("*", { count: "exact", head: true }).eq("to_user", myId).is("read_at", null);
    if (dmBadge) {
      if (count > 0) { dmBadge.hidden = false; dmBadge.textContent = count > 9 ? "9+" : String(count); }
      else { dmBadge.hidden = true; }
    }
  }
  setInterval(refreshDmBadge, 8000);
  setTimeout(refreshDmBadge, 2000);
  supabase.channel("dm-global")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, refreshDmBadge)
    .subscribe();
})();

// ============================================================
// ===== World loading overlay ================================
// ============================================================
(function setupWorldLoading() {
  const el = document.getElementById("worldLoadingOverlay");
  if (!el) return;
  const fill = document.getElementById("worldLoadingBarFill");
  const pct = document.getElementById("worldLoadingPercent");
  let counter = 0;
  let hideTimer = null;
  let tickTimer = null;
  let displayPct = 0;   // o que aparece na UI
  let realPct = 0;      // o que o LoadingManager reportou
  let visible = false;

  function paint() {
    const v = Math.max(0, Math.min(1, displayPct));
    if (fill) fill.style.width = (v * 100).toFixed(1) + "%";
    if (pct) pct.textContent = Math.round(v * 100) + "%";
  }
  function startTick() {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      if (!visible) return;
      // Alvo: nunca além de 95% até hideWorldLoading; depois corre para 100%.
      const target = Math.max(realPct, 0.95);
      if (displayPct < target) {
        // ease-out: avanço proporcional à distância, com piso pra não travar
        const delta = Math.max(0.004, (target - displayPct) * 0.05);
        displayPct = Math.min(target, displayPct + delta);
        paint();
      }
    }, 80);
  }
  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }
  window.setWorldLoadingProgress = function (loaded, total) {
    if (!total || total <= 0) return;
    const p = loaded / total;
    if (p > realPct) realPct = p;
  };
  window.showWorldLoading = function (label) {
    counter++;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (label) {
      const t = el.querySelector(".world-loading-text");
      if (t) t.textContent = label;
    }
    realPct = 0.05;
    displayPct = 0.05;
    paint();
    el.hidden = false;
    visible = true;
    startTick();
  };
  window.hideWorldLoading = function (force) {
    if (force) counter = 0;
    else counter = Math.max(0, counter - 1);
    if (counter > 0) return;
    realPct = 1;
    // Corre rápido até 100%
    const finish = setInterval(() => {
      displayPct = Math.min(1, displayPct + 0.08);
      paint();
      if (displayPct >= 1) {
        clearInterval(finish);
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          el.hidden = true;
          visible = false;
          hideTimer = null;
          displayPct = 0;
          realPct = 0;
          stopTick();
        }, 250);
      }
    }, 30);
  };
})();

// ============================================================
// ===== Radio (per-room, admin defines, user listens) ========
// ============================================================
(function setupRadio() {
  const audio = document.getElementById("radioPlayer");
  const hud = document.getElementById("radioHud");
  const hudName = document.getElementById("radioHudName");
  const hudGenre = document.getElementById("radioHudGenre");
  const muteBtn = document.getElementById("radioMuteBtn");
  const volSlider = document.getElementById("radioVolumeSlider");
  const adminBtn = document.getElementById("radioToggleBtn");
  const adminPanel = document.getElementById("radioAdminPanel");
  const stationsList = document.getElementById("radioStationsList");
  const newName = document.getElementById("radioNewName");
  const newGenre = document.getElementById("radioNewGenre");
  const newUrl = document.getElementById("radioNewUrl");
  const addBtn = document.getElementById("radioAddBtn");
  const stopBtn = document.getElementById("radioStopAllBtn");
  if (!audio || !hud) return;

  let stations = [];          // all stations for current map
  let activeStation = null;   // the one is_playing=true
  let channel = null;
  let subscribedMapId = null;
  let inRoom = false;

  // Persisted local volume/mute
  const savedVol = parseFloat(localStorage.getItem("radio.volume"));
  const savedMuted = localStorage.getItem("radio.muted") === "1";
  audio.volume = Number.isFinite(savedVol) ? Math.min(1, Math.max(0, savedVol)) : 0.7;
  audio.muted = savedMuted;
  if (volSlider) volSlider.value = String(Math.round(audio.volume * 100));
  syncMuteUi();

  function syncMuteUi() {
    if (muteBtn) muteBtn.textContent = audio.muted || audio.volume === 0 ? "🔇" : "🔊";
    hud.classList.toggle("is-muted", audio.muted || audio.volume === 0);
  }

  muteBtn?.addEventListener("click", () => {
    audio.muted = !audio.muted;
    localStorage.setItem("radio.muted", audio.muted ? "1" : "0");
    syncMuteUi();
  });
  volSlider?.addEventListener("input", () => {
    const v = Math.min(1, Math.max(0, (Number(volSlider.value) || 0) / 100));
    audio.volume = v;
    if (v > 0 && audio.muted) { audio.muted = false; localStorage.setItem("radio.muted", "0"); }
    localStorage.setItem("radio.volume", String(v));
    syncMuteUi();
  });

  function showHud(st) {
    activeStation = st;
    if (!st) { hud.hidden = true; return; }
    hudName.textContent = st.station_name || "Rádio";
    hudGenre.textContent = st.genre ? "· " + st.genre : "";
    hud.hidden = false;
  }

  function applyActive() {
    const playing = stations.find((s) => s.is_playing);
    if (!inRoom || !playing || !playing.stream_url) {
      try { audio.pause(); } catch {}
      audio.removeAttribute("src");
      try { audio.load(); } catch {}
      showHud(null);
      return;
    }
    if (audio.src !== playing.stream_url) {
      try { audio.pause(); } catch {}
      audio.src = playing.stream_url;
      audio.play().catch((err) => {
        console.warn("Rádio: autoplay bloqueado, aguardando interação.", err);
        const resume = () => { audio.play().catch(() => {}); document.removeEventListener("click", resume); document.removeEventListener("keydown", resume); };
        document.addEventListener("click", resume, { once: true });
        document.addEventListener("keydown", resume, { once: true });
      });
    } else if (audio.paused) {
      audio.play().catch(() => {});
    }
    showHud(playing);
  }

  async function loadStations(mapId) {
    if (!mapId) { stations = []; renderAdminList(); applyActive(); return; }
    const { data, error } = await supabase
      .from("map_radios")
      .select("*")
      .eq("map_id", mapId)
      .order("station_name", { ascending: true });
    if (error) { console.warn("Falha ao carregar rádios:", error); return; }
    stations = data || [];
    renderAdminList();
    applyActive();
  }

  async function subscribe(mapId) {
    if (channel && subscribedMapId === mapId) return;
    if (channel) { try { await supabase.removeChannel(channel); } catch {} channel = null; }
    subscribedMapId = mapId;
    if (!mapId) return;
    channel = supabase
      .channel("radio:" + mapId)
      .on("postgres_changes", { event: "*", schema: "public", table: "map_radios", filter: "map_id=eq." + mapId }, () => loadStations(mapId))
      .subscribe();
  }

  async function unsubscribe() {
    if (channel) { try { await supabase.removeChannel(channel); } catch {} channel = null; }
    subscribedMapId = null;
  }

  // Public lifecycle
  window.radioEnterRoom = async function (mapId) {
    inRoom = true;
    await subscribe(mapId);
    await loadStations(mapId);
  };
  window.radioLeaveRoom = async function () {
    inRoom = false;
    await unsubscribe();
    stations = [];
    applyActive();
    renderAdminList();
  };

  // ===== Admin panel =====
  adminBtn?.addEventListener("click", () => {
    if (!isAdmin) return alert("Apenas admin.");
    adminPanel.hidden = !adminPanel.hidden;
    if (!adminPanel.hidden) loadStations(currentMapId);
  });

  function renderAdminList() {
    if (!stationsList) return;
    if (!stations.length) { stationsList.innerHTML = '<div style="color:#777;font-size:11px;padding:6px;">Nenhuma estação ainda. Adicione a primeira acima.</div>'; return; }
    stationsList.innerHTML = stations.map((s) => {
      const playing = !!s.is_playing;
      return `
        <div class="radio-station-row ${playing ? "is-playing" : ""}" data-id="${s.id || s.map_id + '|' + s.station_name}">
          <div class="rs-title">${escapeHtml(s.station_name || "—")} ${playing ? "▶" : ""}</div>
          <div class="rs-meta">${escapeHtml(s.genre || "")}${s.genre ? " · " : ""}${escapeHtml(s.stream_url || "")}</div>
          <div class="rs-actions">
            <button type="button" class="rs-play" data-act="play" data-name="${encodeURIComponent(s.station_name)}">${playing ? "Tocando" : "▶ Tocar"}</button>
            <button type="button" class="rs-del" data-act="del" data-name="${encodeURIComponent(s.station_name)}">Excluir</button>
          </div>
        </div>`;
    }).join("");
  }

  stationsList?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    const name = decodeURIComponent(btn.dataset.name || "");
    const target = stations.find((s) => s.station_name === name);
    if (!target) return;
    if (act === "play") {
      // Set all to false, target to true (single source for this map_id)
      const others = stations.filter((s) => s.station_name !== name && s.is_playing);
      for (const s of others) {
        await supabase.from("map_radios").update({ is_playing: false, updated_at: new Date().toISOString() }).match({ map_id: s.map_id, station_name: s.station_name });
      }
      await supabase.from("map_radios").update({ is_playing: true, updated_at: new Date().toISOString() }).match({ map_id: target.map_id, station_name: target.station_name });
      await loadStations(currentMapId);
    } else if (act === "del") {
      if (!confirm("Excluir estação \"" + name + "\"?")) return;
      await supabase.from("map_radios").delete().match({ map_id: target.map_id, station_name: target.station_name });
      await loadStations(currentMapId);
    }
  });

  addBtn?.addEventListener("click", async () => {
    if (!isAdmin) return alert("Apenas admin.");
    const name = (newName?.value || "").trim();
    const url = (newUrl?.value || "").trim();
    const genre = (newGenre?.value || "").trim();
    if (!name) return alert("Dê um nome à estação.");
    if (!url) return alert("Informe a URL do stream.");
    if (!currentMapId) return alert("Entre em uma sala primeiro.");
    const { error } = await supabase.from("map_radios").insert({
      map_id: currentMapId,
      station_name: name,
      stream_url: url,
      genre,
      is_playing: false,
      updated_by: myId || null,
    });
    if (error) { alert("Erro: " + error.message); return; }
    if (newName) newName.value = "";
    if (newUrl) newUrl.value = "";
    if (newGenre) newGenre.value = "";
    await loadStations(currentMapId);
  });

  stopBtn?.addEventListener("click", async () => {
    if (!isAdmin) return;
    const playing = stations.filter((s) => s.is_playing);
    for (const s of playing) {
      await supabase.from("map_radios").update({ is_playing: false, updated_at: new Date().toISOString() }).match({ map_id: s.map_id, station_name: s.station_name });
    }
    await loadStations(currentMapId);
  });

  function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
})();

// ============================================================
// ===== Interações em objetos (sentar / posar / animar) ======
// ============================================================
(function setupInteractions() {
  const promptEl = document.getElementById("interactionPrompt");
  const adminBtn = document.getElementById("interactionsToggleBtn");
  const adminPanel = document.getElementById("interactionsAdminPanel");
  const listEl = document.getElementById("interactionsList");
  const editorEl = document.getElementById("interactionsEditor");
  const newBtn = document.getElementById("interactionsNewBtn");
  if (!promptEl) return;

  let interactions = [];       // [{...row}]
  let channel = null;
  let subscribedMapId = null;
  let inRoom = false;
  let activeNearby = null;     // interaction we're currently close to
  let editingId = null;        // id sendo editado no painel admin (string or "new")
  let editingDraft = null;     // patch em edição (preview ao vivo)
  let pickMode = false;        // selecionar asset no mundo
  let currentSit = null;       // {id, assetId, worldPos, worldRotY, animationUrl, mixerAction, animClipName}

  const tmpV = new THREE.Vector3();

  function _esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---------- Data layer ----------
  async function loadInteractions(mapId) {
    if (!mapId) { interactions = []; renderAdmin(); return; }
    const { data, error } = await supabase
      .from("map_asset_interactions")
      .select("*")
      .eq("map_id", mapId)
      .order("created_at", { ascending: true });
    if (error) { console.warn("[interactions] load", error); return; }
    interactions = data || [];
    renderAdmin();
  }

  async function subscribe(mapId) {
    if (channel && subscribedMapId === mapId) return;
    if (channel) { try { await supabase.removeChannel(channel); } catch {} channel = null; }
    subscribedMapId = mapId;
    if (!mapId) return;
    channel = supabase
      .channel("interactions:" + mapId)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "map_asset_interactions", filter: "map_id=eq." + mapId },
        () => loadInteractions(mapId))
      .subscribe();
  }
  async function unsubscribe() {
    if (channel) { try { await supabase.removeChannel(channel); } catch {} channel = null; }
    subscribedMapId = null;
  }

  // ---------- Geometry helpers ----------
  function computeSeatPose(inter, draft) {
    const obj = assetObjects.get(inter.asset_id);
    if (!obj) return null;
    obj.updateMatrixWorld(true);
    const ox = (draft?.offset_x ?? inter.offset_x) || 0;
    const oy = (draft?.offset_y ?? inter.offset_y) || 0;
    const oz = (draft?.offset_z ?? inter.offset_z) || 0;
    const ry = ((draft?.rotation_y ?? inter.rotation_y) || 0) * Math.PI / 180;
    const local = new THREE.Vector3(ox, oy, oz);
    const world = local.clone().applyMatrix4(obj.matrixWorld);
    return { worldPos: world, worldRotY: obj.rotation.y + ry };
  }

  function getMyEntity() { return (typeof myId !== "undefined" && myId) ? playerEntities.get(myId) : null; }

  // ---------- Proximity loop ----------
  setInterval(() => {
    if (!inRoom) { hidePrompt(); return; }
    const entity = getMyEntity();
    if (!entity || !entity.group) { hidePrompt(); return; }

    // Se sentado, mostra prompt "Levantar" no botão
    if (currentSit) { activeNearby = null; showPromptForSit(); return; }

    let best = null;
    let bestDist = Infinity;
    const pos = entity.group.position;
    for (const inter of interactions) {
      const pose = computeSeatPose(inter);
      if (!pose) continue;
      const d = Math.hypot(pose.worldPos.x - pos.x, pose.worldPos.z - pos.z);
      const r = inter.trigger_radius || 1.5;
      if (d <= r && d < bestDist) { best = { inter, pose, d }; bestDist = d; }
    }
    activeNearby = best;
    if (best) showPromptForInteraction(best.inter, best.pose);
    else hidePrompt();
  }, 180);

  // Reposiciona o botão (HUD) acompanhando o objeto/avatar
  function tickPromptPosition() {
    if (promptEl.hidden) return;
    let world;
    if (currentSit?.worldPos) {
      world = currentSit.worldPos.clone(); world.y += 1.7;
    } else if (activeNearby) {
      world = activeNearby.pose.worldPos.clone(); world.y += 1.6;
    } else return;
    const rect = renderer.domElement.getBoundingClientRect();
    tmpV.copy(world).project(camera);
    const x = (tmpV.x * 0.5 + 0.5) * rect.width + rect.left;
    const y = (-tmpV.y * 0.5 + 0.5) * rect.height + rect.top;
    const visible = tmpV.z > -1 && tmpV.z < 1;
    promptEl.style.opacity = visible ? "1" : "0";
    promptEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
  // Anexa no rAF global
  (function loop() { requestAnimationFrame(loop); tickPromptPosition(); })();

  function showPromptForInteraction(inter, pose) {
    promptEl.hidden = false;
    promptEl.dataset.kind = "enter";
    promptEl.innerHTML = `<span class="ip-icon">${_esc(inter.icon || "💺")}</span><span class="ip-label">${_esc(inter.label || "Interagir")}</span>`;
    promptEl.onclick = () => enterSit(inter);
  }
  function showPromptForSit() {
    promptEl.hidden = false;
    promptEl.dataset.kind = "exit";
    promptEl.innerHTML = `<span class="ip-icon">🚪</span><span class="ip-label">Levantar (E)</span>`;
    promptEl.onclick = () => standUp();
  }
  function hidePrompt() { promptEl.hidden = true; promptEl.onclick = null; }

  // ---------- Enter / exit sit ----------
  async function enterSit(inter) {
    const entity = getMyEntity();
    if (!entity || !entity.mixer) return;
    const pose = computeSeatPose(inter);
    if (!pose) return;

    currentSit = {
      id: inter.id,
      assetId: inter.asset_id,
      worldPos: pose.worldPos.clone(),
      worldRotY: pose.worldRotY,
      animationUrl: inter.animation_url || null,
      mixerAction: null,
      animClipName: null,
    };
    window.__sittingInteraction = currentSit;

    // Atualiza me.x/y para o assento (evita salto ao levantar)
    if (typeof me !== "undefined" && me) {
      const pct = percentFromWorld(pose.worldPos.x, pose.worldPos.z);
      me.x = pct.x; me.y = pct.y;
    }
    entity.target.copy(pose.worldPos);
    entity.group.position.copy(pose.worldPos);
    entity.group.rotation.y = pose.worldRotY;

    // Para ação atual e toca clip de sit (custom ou idle como fallback)
    try {
      if (entity.actions && entity.currentAction && entity.actions[entity.currentAction]) {
        entity.actions[entity.currentAction].fadeOut(0.2);
      }
      entity.currentAction = null;
      if (inter.animation_url) {
        const clip = await loadFbxClip(inter.animation_url);
        if (window.__sittingInteraction !== currentSit) return; // saiu nesse meio tempo
        const bones = collectBoneNames(entity.character);
        const retarg = retargetClipToBones(clip, bones) || clip.clone();
        const action = entity.mixer.clipAction(retarg);
        action.setLoop(inter.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = true;
        action.reset().fadeIn(0.2).play();
        currentSit.mixerAction = action;
      } else {
        const idle = entity.actions?.idle;
        if (idle) { idle.reset().fadeIn(0.2).play(); entity.currentAction = "idle"; }
      }
    } catch (e) { console.warn("[interactions] sit clip", e); }

    showPromptForSit();
  }

  function standUp() {
    if (!currentSit) return;
    const entity = getMyEntity();
    if (entity && currentSit.mixerAction) {
      currentSit.mixerAction.fadeOut(0.2);
      setTimeout(() => { try { currentSit?.mixerAction?.stop(); } catch {} }, 250);
    }
    if (entity?.actions?.idle) { entity.actions.idle.reset().fadeIn(0.2).play(); entity.currentAction = "idle"; }
    currentSit = null;
    window.__sittingInteraction = null;
    hidePrompt();
  }
  window.standUpFromInteraction = standUp;

  // ---------- Lifecycle ----------
  window.interactionsEnterRoom = async function (mapId) {
    inRoom = true;
    await subscribe(mapId);
    await loadInteractions(mapId);
  };
  window.interactionsLeaveRoom = async function () {
    inRoom = false;
    standUp();
    await unsubscribe();
    interactions = [];
    hidePrompt();
    renderAdmin();
  };

  // ---------- Admin panel ----------
  adminBtn?.addEventListener("click", () => {
    if (!isAdmin) return alert("Apenas admin.");
    adminPanel.hidden = !adminPanel.hidden;
    if (!adminPanel.hidden) { editingId = null; editingDraft = null; renderAdmin(); }
  });

  newBtn?.addEventListener("click", () => {
    editingId = "new";
    editingDraft = {
      asset_id: "",
      label: "Sentar",
      icon: "💺",
      kind: "sit",
      animation_key: "sit",
      animation_url: "",
      loop: true,
      offset_x: 0, offset_y: 0, offset_z: 0,
      rotation_y: 0, scale_mul: 1,
      trigger_radius: 1.5,
      exit_radius: 2.0,
      occupancy: "multi",
    };
    renderAdmin();
  });

  function renderAdmin() {
    if (!listEl || !editorEl) return;
    if (!interactions.length && editingId !== "new") {
      listEl.innerHTML = '<div style="color:#777;font-size:11px;padding:6px;">Nenhuma interação ainda.</div>';
    } else {
      listEl.innerHTML = interactions.map((it) => {
        const obj = assetObjects.get(it.asset_id);
        const assetName = obj?.name || "(asset removido)";
        const isEd = editingId === it.id;
        return `<div class="interact-row ${isEd ? "is-editing" : ""}" data-id="${_esc(it.id)}">
          <div class="ir-line"><span class="ir-icon">${_esc(it.icon || "💺")}</span>
            <span class="ir-label">${_esc(it.label || "—")}</span>
            <span class="ir-asset">${_esc(assetName)}</span></div>
          <div class="ir-actions">
            <button type="button" data-act="edit">${isEd ? "Cancelar" : "Editar"}</button>
            <button type="button" data-act="test">Testar</button>
            <button type="button" data-act="del" class="danger">×</button>
          </div>
        </div>`;
      }).join("");
    }
    // Editor form
    if (editingId === null) { editorEl.innerHTML = ""; return; }
    const isNew = editingId === "new";
    const base = isNew ? editingDraft : (interactions.find((i) => i.id === editingId) || null);
    if (!base) { editingId = null; editorEl.innerHTML = ""; return; }
    const draft = editingDraft || { ...base };
    editingDraft = draft;

    const assetsOptions = Array.from(assetObjects.entries())
      .map(([id, o]) => `<option value="${_esc(id)}" ${draft.asset_id === id ? "selected" : ""}>${_esc(o.name || id)}</option>`)
      .join("");

    const slider = (label, field, min, max, step) => `
      <label class="ie-slider">
        <span class="ie-label">${label}</span>
        <input type="range" data-field="${field}" min="${min}" max="${max}" step="${step}" value="${Number(draft[field] || 0)}">
        <span class="ie-val">${Number(draft[field] || 0).toFixed(2)}</span>
      </label>`;

    editorEl.innerHTML = `
      <div class="interact-editor">
        <div class="ie-row"><label>Objeto</label>
          <select data-field="asset_id"><option value="">— escolha —</option>${assetsOptions}</select>
          <button type="button" class="ie-pick">${pickMode ? "Cancelar seleção" : "Selecionar no mundo"}</button>
        </div>
        <div class="ie-row"><label>Rótulo</label><input type="text" data-field="label" value="${_esc(draft.label)}" maxlength="40"></div>
        <div class="ie-row"><label>Ícone</label><input type="text" data-field="icon" value="${_esc(draft.icon)}" maxlength="4" style="width:64px"></div>
        <div class="ie-row"><label>Tipo</label>
          <select data-field="kind">
            <option value="sit" ${draft.kind === "sit" ? "selected" : ""}>Sentar</option>
            <option value="pose" ${draft.kind === "pose" ? "selected" : ""}>Pose</option>
            <option value="animation" ${draft.kind === "animation" ? "selected" : ""}>Animação</option>
          </select>
        </div>
        <div class="ie-row"><label>Animação (URL FBX)</label>
          <input type="url" data-field="animation_url" placeholder="opcional — sobrepõe o idle" value="${_esc(draft.animation_url || "")}">
        </div>
        <div class="ie-row"><label>Loop</label>
          <input type="checkbox" data-field="loop" ${draft.loop ? "checked" : ""}>
        </div>
        <fieldset class="ie-fs"><legend>Posição relativa ao objeto</legend>
          ${slider("X", "offset_x", -3, 3, 0.05)}
          ${slider("Altura (Y)", "offset_y", -2, 3, 0.05)}
          ${slider("Z", "offset_z", -3, 3, 0.05)}
          ${slider("Rotação Y (°)", "rotation_y", -180, 180, 1)}
        </fieldset>
        <fieldset class="ie-fs"><legend>Aproximação</legend>
          ${slider("Raio (m)", "trigger_radius", 0.5, 5, 0.1)}
        </fieldset>
        <div class="ie-actions">
          <button type="button" class="ie-save primary">Salvar</button>
          <button type="button" class="ie-cancel">Cancelar</button>
        </div>
      </div>`;
  }

  // Delegação de eventos
  listEl?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]"); if (!btn) return;
    const row = btn.closest(".interact-row"); const id = row?.dataset.id;
    const inter = interactions.find((i) => i.id === id); if (!inter) return;
    const act = btn.dataset.act;
    if (act === "edit") {
      editingId = editingId === id ? null : id;
      editingDraft = editingId ? { ...inter } : null;
      renderAdmin();
    } else if (act === "test") {
      enterSit(inter);
    } else if (act === "del") {
      if (!confirm("Excluir esta interação?")) return;
      const { error } = await supabase.from("map_asset_interactions").delete().eq("id", id);
      if (error) { alert("Erro: " + error.message); return; }
      if (editingId === id) { editingId = null; editingDraft = null; }
      await loadInteractions(currentMapId);
    }
  });

  editorEl?.addEventListener("input", (e) => {
    const el = e.target.closest("[data-field]"); if (!el || !editingDraft) return;
    const field = el.dataset.field;
    let val;
    if (el.type === "checkbox") val = el.checked;
    else if (el.type === "range" || el.type === "number") val = Number(el.value);
    else val = el.value;
    editingDraft[field] = val;
    // Atualiza valor visual no slider
    if (el.type === "range") {
      const v = el.parentElement?.querySelector(".ie-val"); if (v) v.textContent = Number(val).toFixed(2);
    }
    // Preview ao vivo: se já sentamos para testar, atualiza pose
    if (currentSit && (editingId === currentSit.id || editingId === "new")) {
      const fake = { ...(interactions.find((i) => i.id === editingId) || {}), ...editingDraft, asset_id: editingDraft.asset_id || currentSit.assetId };
      const pose = computeSeatPose(fake);
      if (pose) {
        currentSit.worldPos.copy(pose.worldPos);
        currentSit.worldRotY = pose.worldRotY;
      }
    }
  });

  editorEl?.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.classList.contains("ie-cancel")) { editingId = null; editingDraft = null; renderAdmin(); return; }
    if (t.classList.contains("ie-pick")) {
      pickMode = !pickMode;
      addSystemLine?.(pickMode ? "Clique num objeto do mapa para selecionar." : "Seleção cancelada.");
      renderAdmin();
      return;
    }
    if (t.classList.contains("ie-save")) {
      if (!editingDraft.asset_id) return alert("Escolha um objeto primeiro.");
      const payload = {
        asset_id: editingDraft.asset_id,
        map_id: currentMapId,
        label: editingDraft.label || "Sentar",
        icon: editingDraft.icon || "💺",
        kind: editingDraft.kind || "sit",
        animation_key: editingDraft.animation_key || "sit",
        animation_url: editingDraft.animation_url || null,
        loop: editingDraft.loop !== false,
        offset_x: Number(editingDraft.offset_x) || 0,
        offset_y: Number(editingDraft.offset_y) || 0,
        offset_z: Number(editingDraft.offset_z) || 0,
        rotation_y: Number(editingDraft.rotation_y) || 0,
        scale_mul: Number(editingDraft.scale_mul) || 1,
        trigger_radius: Number(editingDraft.trigger_radius) || 1.5,
        exit_radius: (Number(editingDraft.trigger_radius) || 1.5) + 0.5,
        occupancy: editingDraft.occupancy || "multi",
      };
      let res;
      if (editingId === "new") {
        payload.created_by = myId || null;
        res = await supabase.from("map_asset_interactions").insert(payload).select().single();
      } else {
        res = await supabase.from("map_asset_interactions").update(payload).eq("id", editingId).select().single();
      }
      if (res.error) { alert("Erro: " + res.error.message); return; }
      editingId = null; editingDraft = null;
      await loadInteractions(currentMapId);
    }
  });

  // Picker: clique no canvas, raycast contra assetObjects
  renderer?.domElement.addEventListener("click", (event) => {
    if (!pickMode || !isAdmin) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera);
    const targets = Array.from(assetObjects.values());
    const hits = rc.intersectObjects(targets, true);
    if (!hits.length) return;
    // Sobe na hierarquia até achar o root em assetObjects
    let root = hits[0].object;
    while (root && !Array.from(assetObjects.values()).includes(root)) root = root.parent;
    if (!root) return;
    let foundId = null;
    for (const [id, obj] of assetObjects) if (obj === root) { foundId = id; break; }
    if (!foundId) return;
    if (editingDraft) editingDraft.asset_id = foundId;
    pickMode = false;
    addSystemLine?.("Objeto selecionado: " + (root.name || foundId));
    renderAdmin();
    event.stopPropagation();
  }, true);
})();

