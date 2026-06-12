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
  // Modo futebol — exportar do Mixamo em FBX "Without Skin" (só animação).
  kickWeak: "/assets/animations/kickweak.fbx",
  kickStrong: "/assets/animations/kickstrong.fbx",
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
const roomTitleEl = document.querySelector("#roomTitle");
function updateRoomTitle() {
  if (!roomTitleEl) return;
  const m = (typeof MAPS !== "undefined" && Array.isArray(MAPS)) ? MAPS.find((x) => x.id === currentMapId) : null;
  if (m?.name) roomTitleEl.textContent = m.name;
}
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
let voiceChannel = null;
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

// ============ Pose debug do CHUTE (legacy — mantido só p/ migração) ============
const KICK_POSE_KEY = "neon-tap-room-kick-pose";
const KICK_POSE_VERSION_KEY = "neon-tap-room-kick-pose-version";
const KICK_POSE_VERSION = "2";
const KICK_POSE_DEFAULTS = { offY: 0, offFwd: 0, rotX: -90 };
function loadLegacyKickPose() {
  try {
    const ver = localStorage.getItem(KICK_POSE_VERSION_KEY);
    if (ver !== KICK_POSE_VERSION) {
      localStorage.removeItem(KICK_POSE_KEY);
      localStorage.setItem(KICK_POSE_VERSION_KEY, KICK_POSE_VERSION);
      return { ...KICK_POSE_DEFAULTS };
    }
    const raw = localStorage.getItem(KICK_POSE_KEY);
    if (raw) return { ...KICK_POSE_DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...KICK_POSE_DEFAULTS };
}
const _legacyKickPose = loadLegacyKickPose();

// ============ Ajustes por animação (posição + ângulo) ============
// Sistema unificado: cada animação tem 6 valores (offX/Y/Z em unidades, rotX/Y/Z em graus).
// É aplicado no objeto interno do personagem (entity.character) do jogador local,
// substituindo os antigos "fbPose" e "kickPose".
const ANIM_NAMES = ["idle", "walk", "run", "dance", "wave", "kickWeak", "kickStrong"];
const ANIM_TUNINGS_KEY = "neon-tap-room-anim-tunings";
const ANIM_TUNINGS_VERSION_KEY = "neon-tap-room-anim-tunings-version";
// Bump para "3": invalida caches de versões antigas que herdaram rotX=-90 do
// legado kickPose em animações não-chute (bug que deixava o avatar deitado
// para qualquer dispositivo novo até o admin ter salvado tuning explícito).
const ANIM_TUNINGS_VERSION = "3";
const NON_KICK_ANIMS = new Set(["idle", "walk", "run", "dance", "wave"]);
function defaultAnimTuning() { return { offX: 0, offY: 0, offZ: 0, rotX: 0, rotY: 0, rotZ: 0 }; }
function loadAnimTunings() {
  const out = {};
  for (const n of ANIM_NAMES) out[n] = defaultAnimTuning();
  try {
    const ver = localStorage.getItem(ANIM_TUNINGS_VERSION_KEY);
    if (ver === ANIM_TUNINGS_VERSION) {
      const raw = localStorage.getItem(ANIM_TUNINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const n of ANIM_NAMES) if (parsed[n]) Object.assign(out[n], parsed[n]);
        // Preserva tunings de animações customizadas (chaves "custom:<id>")
        for (const k of Object.keys(parsed)) {
          if (k.startsWith("custom:")) {
            out[k] = Object.assign(defaultAnimTuning(), parsed[k]);
          }
        }
      }
    } else {
      // Versão antiga detectada: tenta preservar valores razoáveis, mas
      // descarta o lixo de rotX=-90 em animações não-chute (causa do avatar
      // deitado em dispositivos que nunca tiveram tuning explícito).
      try {
        const raw = localStorage.getItem(ANIM_TUNINGS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          for (const n of ANIM_NAMES) {
            if (parsed[n]) Object.assign(out[n], parsed[n]);
            if (NON_KICK_ANIMS.has(n) && Math.abs(out[n].rotX || 0) >= 89) {
              out[n].rotX = 0;
            }
          }
          for (const k of Object.keys(parsed)) {
            if (k.startsWith("custom:")) {
              out[k] = Object.assign(defaultAnimTuning(), parsed[k]);
              if (Math.abs(out[k].rotX || 0) >= 89) out[k].rotX = 0;
            }
          }
        }
      } catch {}
      localStorage.setItem(ANIM_TUNINGS_VERSION_KEY, ANIM_TUNINGS_VERSION);
      try { localStorage.setItem(ANIM_TUNINGS_KEY, JSON.stringify(out)); } catch {}
    }
  } catch {}
  // Auto-reparo final: nunca deixe animações não-chute saírem com rotX absurdo.
  for (const n of ANIM_NAMES) {
    if (NON_KICK_ANIMS.has(n) && Math.abs(out[n].rotX || 0) >= 89) {
      out[n].rotX = 0;
    }
  }
  return out;
}

const animTunings = loadAnimTunings();
function saveAnimTunings(remoteKey) {
  try { localStorage.setItem(ANIM_TUNINGS_KEY, JSON.stringify(animTunings)); } catch {}
  if (remoteKey && window.supabase && animTunings[remoteKey]) {
    const t = animTunings[remoteKey];
    Promise.resolve().then(async () => {
      try {
        const { data: au } = await window.supabase.auth.getUser();
        const uid = au?.user?.id || null;
        const { error } = await window.supabase.from("animation_tunings").upsert({
          anim_key: remoteKey,
          off_x: t.offX || 0, off_y: t.offY || 0, off_z: t.offZ || 0,
          rot_x: t.rotX || 0, rot_y: t.rotY || 0, rot_z: t.rotZ || 0,
          updated_by: uid, updated_at: new Date().toISOString(),
        }, { onConflict: "anim_key" });
        if (error) console.warn("[animation_tunings upsert]", error);
      } catch (e) { console.warn("[animation_tunings upsert]", e); }
    });
    // Broadcast immediately (postgres_changes is a slower fallback)
    try { window.__broadcastAnimTuning?.(remoteKey); } catch {}
  }
}
async function deleteAnimTuningRemote(key) {
  try { await window.supabase?.from("animation_tunings").delete().eq("anim_key", key); } catch {}
}
async function loadRemoteAnimTunings() {
  if (!window.supabase) return;
  try {
    const { data, error } = await window.supabase.from("animation_tunings").select("*");
    if (error) { console.warn("[animation_tunings load]", error); return; }
    for (const row of (data || [])) {
      const t = animTunings[row.anim_key] || (animTunings[row.anim_key] = defaultAnimTuning());
      t.offX = row.off_x || 0; t.offY = row.off_y || 0; t.offZ = row.off_z || 0;
      t.rotX = row.rot_x || 0; t.rotY = row.rot_y || 0; t.rotZ = row.rot_z || 0;
    }
    try { localStorage.setItem(ANIM_TUNINGS_KEY, JSON.stringify(animTunings)); } catch {}
    window.dispatchEvent(new CustomEvent("animation-tunings:updated"));
  } catch (e) { console.warn("[animation_tunings load]", e); }
}
function subscribeAnimTunings() {
  if (!window.supabase) return;
  try {
    window.supabase.channel("animation_tunings")
      .on("postgres_changes", { event: "*", schema: "public", table: "animation_tunings" }, (payload) => {
        const row = payload.new || payload.old;
        if (!row?.anim_key) return;
        if (payload.eventType === "DELETE") {
          if (animTunings[row.anim_key]) animTunings[row.anim_key] = defaultAnimTuning();
        } else {
          const t = animTunings[row.anim_key] || (animTunings[row.anim_key] = defaultAnimTuning());
          t.offX = row.off_x || 0; t.offY = row.off_y || 0; t.offZ = row.off_z || 0;
          t.rotX = row.rot_x || 0; t.rotY = row.rot_y || 0; t.rotZ = row.rot_z || 0;
        }
        try { localStorage.setItem(ANIM_TUNINGS_KEY, JSON.stringify(animTunings)); } catch {}
        window.dispatchEvent(new CustomEvent("animation-tunings:updated"));
      })
      .subscribe();
  } catch (e) { console.warn("[animation_tunings sub]", e); }
}
// Kick off loading + subscription (defers until supabase is ready)
Promise.resolve().then(() => { loadRemoteAnimTunings(); subscribeAnimTunings(); });

// Canal global de broadcast — sync instantâneo de tunings entre todos os clientes
// (independente de RLS/replicação postgres_changes). Cada cliente entra automaticamente.
let __animTuningsBc = null;
function __ensureAnimTuningsBc() {
  if (__animTuningsBc || !window.supabase) return;
  try {
    __animTuningsBc = window.supabase
      .channel("anim-tunings-bc", { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "tuning" }, ({ payload }) => {
        if (!payload?.key) return;
        const t = animTunings[payload.key] || (animTunings[payload.key] = defaultAnimTuning());
        t.offX = payload.offX || 0; t.offY = payload.offY || 0; t.offZ = payload.offZ || 0;
        t.rotX = payload.rotX || 0; t.rotY = payload.rotY || 0; t.rotZ = payload.rotZ || 0;
        try { localStorage.setItem(ANIM_TUNINGS_KEY, JSON.stringify(animTunings)); } catch {}
        window.dispatchEvent(new CustomEvent("animation-tunings:updated"));
      })
      .subscribe();
  } catch (e) { console.warn("[anim-tunings-bc]", e); }
}
Promise.resolve().then(__ensureAnimTuningsBc);
window.__broadcastAnimTuning = function (key) {
  const t = animTunings[key]; if (!t) return;
  __ensureAnimTuningsBc();
  if (!__animTuningsBc) return;
  try {
    __animTuningsBc.send({
      type: "broadcast", event: "tuning",
      payload: { key, offX: t.offX, offY: t.offY, offZ: t.offZ, rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
    });
  } catch {}
};
window.__animTunings = animTunings;
window.__animNames = ANIM_NAMES;
window.__saveAnimTunings = saveAnimTunings;
window.__deleteAnimTuningRemote = deleteAnimTuningRemote;
window.__defaultAnimTuning = defaultAnimTuning;

// Aplica live as tunings da animação atual no character do jogador local.
function applyLocalAnimTuning(entity, delta) {
  const ch = entity?.character;
  if (!ch) return;
  let name = null;
  if (entity.__fbKicking) name = entity.__lastKickStrong ? "kickStrong" : "kickWeak";
  else if (entity.currentAction && animTunings[entity.currentAction]) name = entity.currentAction;
  const tn = name ? animTunings[name] : null;
  const targetX = tn ? (tn.offX || 0) : 0;
  const targetY = tn ? (tn.offY || 0) : 0;
  const targetZ = tn ? (tn.offZ || 0) : 0;
  const d = Math.PI / 180;
  const targetRx = CHARACTER_DEFAULT_ROT_X + (tn ? (tn.rotX || 0) : 0) * d;
  const targetRy = (tn ? (tn.rotY || 0) : 0) * d;
  const targetRz = (tn ? (tn.rotZ || 0) : 0) * d;
  const t = Math.min(1, (delta || 0.016) * 12);
  ch.position.x += (targetX - ch.position.x) * t;
  ch.position.y += (targetY - ch.position.y) * t;
  ch.position.z += (targetZ - ch.position.z) * t;
  ch.rotation.x += (targetRx - ch.rotation.x) * t;
  ch.rotation.y += (targetRy - ch.rotation.y) * t;
  ch.rotation.z += (targetRz - ch.rotation.z) * t;
}
window.__applyLocalAnimTuning = applyLocalAnimTuning;

// Stubs de compatibilidade.
window.__kickPose = _legacyKickPose;
window.__fbPose = _legacyKickPose;
window.__saveKickPose = () => {};

// ============ Speed config (admin tunable) ============
const SPEED_CFG_KEY = "neon-tap-room-speed-cfg";
const SPEED_CFG_VERSION_KEY = "neon-tap-room-speed-cfg-version";
const SPEED_CFG_VERSION = "2";
const SPEED_DEFAULTS = { walkN: 1.8, runN: 5.0, walkFb: 2.8, runFb: 5.6, walkAnim: 1.0, runAnim: 1.15 };
function loadSpeedCfg() {
  try {
    const ver = localStorage.getItem(SPEED_CFG_VERSION_KEY);
    if (ver !== SPEED_CFG_VERSION) {
      // força upgrade dos defaults p/ todos os usuários
      localStorage.removeItem(SPEED_CFG_KEY);
      localStorage.setItem(SPEED_CFG_VERSION_KEY, SPEED_CFG_VERSION);
      return { ...SPEED_DEFAULTS };
    }
    const raw = localStorage.getItem(SPEED_CFG_KEY);
    if (raw) return { ...SPEED_DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...SPEED_DEFAULTS };
}
const speedCfg = loadSpeedCfg();
function saveSpeedCfg() { try { localStorage.setItem(SPEED_CFG_KEY, JSON.stringify(speedCfg)); } catch {} }
window.__speedCfg = speedCfg;
window.__saveSpeedCfg = saveSpeedCfg;
function applyAnimSpeedsAll() {
  for (const ent of playerEntities.values()) {
    if (ent.actions?.walk) ent.actions.walk.timeScale = speedCfg.walkAnim;
    if (ent.actions?.run) ent.actions.run.timeScale = speedCfg.runAnim;
  }
}
window.__applyAnimSpeeds = applyAnimSpeedsAll;



const assetObjects = new Map();
const assetMixers = new Set(); // mixers de GLBs do mapa com animação embutida
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
controls.enablePan = false; // shift+drag continua girando a câmera (sem panorâmica)
const BASE_MAX_DISTANCE = 60;
controls.target.set(0, 1.0, 0);

controls.addEventListener("start", () => { window.__camUserDragging = true; });
controls.addEventListener("end", () => {
  window.__camUserDragging = false;
  window.__camUserHoldUntil = performance.now() + 600;
});

// OrbitControls trata shift/ctrl/meta + drag como PAN; como pan está desligado,
// isso bloqueia a rotação enquanto o jogador segura Shift pra correr. Aqui
// removemos as modificadoras do pointerdown ANTES do OrbitControls processar,
// preservando rotate e zoom com Shift segurado.
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    try {
      Object.defineProperty(e, "shiftKey", { value: false, configurable: true });
      Object.defineProperty(e, "ctrlKey",  { value: false, configurable: true });
      Object.defineProperty(e, "metaKey",  { value: false, configurable: true });
    } catch {}
  }
}, true);

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

const authForgot = document.getElementById("authForgot");
if (authForgot) {
  authForgot.addEventListener("click", async () => {
    const email = (authEmail.value || "").trim().toLowerCase()
      || (window.prompt("Digite seu email para receber o link de redefinição:") || "").trim().toLowerCase();
    if (!email) return;
    authForgot.disabled = true;
    try {
      try { localStorage.setItem("neon-tap-room-password-recovery", String(Date.now())); } catch {}
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname + "?recovery=1",
      });
      if (error) throw error;
      authError.hidden = false;
      authError.style.color = "#7CFCAB";
      authError.textContent = "Enviamos um link de redefinição para " + email + ". Confira sua caixa de entrada.";
    } catch (err) {
      console.error("[auth] reset", err);
      showAuthError(translateAuthError(err));
    } finally {
      authForgot.disabled = false;
    }
  });
}

// Detecta link de recuperação de senha antes de abrir a tela normal de login.
function getRecoveryUrlInfo() {
  const url = new URL(window.location.href);
  const hashText = (window.location.hash || "").replace(/^#/, "").replace(/#/g, "&");
  const hashParams = new URLSearchParams(hashText);
  const search = url.searchParams;
  const pendingAt = Number(localStorage.getItem("neon-tap-room-password-recovery") || 0);
  const pendingRecent = pendingAt && Date.now() - pendingAt < 1000 * 60 * 60 * 2;
  const isRecovery =
    search.get("recovery") === "1" ||
    search.get("type") === "recovery" ||
    hashParams.get("type") === "recovery" ||
    /(^|[&#])recovery([&#=]|$)/i.test(hashText) ||
    (pendingRecent && (search.has("code") || hashParams.has("access_token") || hashParams.has("refresh_token")));

  return {
    isRecovery,
    code: search.get("code"),
    accessToken: hashParams.get("access_token"),
    refreshToken: hashParams.get("refresh_token"),
    error: search.get("error_description") || hashParams.get("error_description") || search.get("error") || hashParams.get("error"),
  };
}

window.__isRecoveringPassword = getRecoveryUrlInfo().isRecovery;

async function ensureRecoverySession() {
  const info = getRecoveryUrlInfo();
  if (info.error) throw new Error(decodeURIComponent(info.error).replace(/\+/g, " "));
  if (info.accessToken && info.refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: info.accessToken, refresh_token: info.refreshToken });
    if (error) throw error;
  } else if (info.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(info.code);
    if (error && !/already|invalid.*code/i.test(error.message || "")) throw error;
  }
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Link inválido ou expirado. Peça um novo link de redefinição.");
  return data.session;
}

function beginRecoveryMode() {
  window.__isRecoveringPassword = true;
  showRecoveryOverlay();
  ensureRecoverySession().catch((err) => {
    const box = document.getElementById("recoveryError");
    if (box) {
      box.textContent = translateAuthError(err);
      box.hidden = false;
    }
  });
}

function showRecoveryOverlay() {
  if (document.getElementById("recoveryOverlay")) return;
  const wrap = document.createElement("div");
  wrap.id = "recoveryOverlay";
  wrap.className = "auth-overlay";
  wrap.style.display = "grid";
  wrap.style.zIndex = "9999";
  wrap.innerHTML = `
    <form class="auth-card" id="recoveryForm">
      <h2>Digite sua nova senha</h2>
      <p class="auth-hint">Escolha uma nova senha para sua conta.</p>
      <input id="recoveryPass1" type="password" placeholder="Nova senha (min. 6)" minlength="6" required autocomplete="new-password">
      <input id="recoveryPass2" type="password" placeholder="Confirmar nova senha" minlength="6" required autocomplete="new-password">
      <div id="recoveryError" class="auth-error" hidden></div>
      <button type="submit" id="recoverySubmit">Salvar nova senha</button>
    </form>`;
  document.body.appendChild(wrap);
  try { document.body.classList.remove("in-world"); } catch {}
  try { authOverlay.hidden = true; authOverlay.style.display = "none"; } catch {}

  const form = wrap.querySelector("#recoveryForm");
  const p1 = wrap.querySelector("#recoveryPass1");
  const p2 = wrap.querySelector("#recoveryPass2");
  const err = wrap.querySelector("#recoveryError");
  const btn = wrap.querySelector("#recoverySubmit");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    const a = p1.value.trim(), b = p2.value.trim();
    if (a.length < 6) { err.textContent = "Senha precisa ter pelo menos 6 caracteres."; err.hidden = false; return; }
    if (a !== b) { err.textContent = "As senhas não coincidem."; err.hidden = false; return; }
    btn.disabled = true;
    try {
      await ensureRecoverySession();
      const { error } = await supabase.auth.updateUser({ password: a });
      if (error) throw error;
      window.__isRecoveringPassword = false;
      try { localStorage.removeItem("neon-tap-room-password-recovery"); } catch {}
      await supabase.auth.signOut();
      try { history.replaceState(null, "", window.location.pathname); } catch {}
      wrap.remove();
      showAuth("signin");
      authError.hidden = false;
      authError.style.color = "#7CFCAB";
      authError.textContent = "Senha atualizada! Entre com sua nova senha.";
    } catch (ex) {
      console.error("[auth] update password", ex);
      err.textContent = ex?.message || "Não foi possível atualizar a senha.";
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}

if (window.__isRecoveringPassword) beginRecoveryMode();

supabase.auth.onAuthStateChange(async (event) => {
  if (event === "PASSWORD_RECOVERY") {
    beginRecoveryMode();
  }
});
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
    if (window.__isRecoveringPassword) return;
    if (session?.user) {
      hideAuth();
      bootstrapSession(session.user);
    }
  });
}

(async () => {
  hideAuth();
  if (window.__isRecoveringPassword) { showRecoveryOverlay(); return; }
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
    updateRoomTitle();
    if (me) renderPlayers([me, ...players.filter((p) => p.id !== myId)]);
    document.body.classList.add("world-ready");
    // Garante que todos os painéis admin comecem fechados ao entrar
    document.querySelectorAll("#lightsAdminPanel, #layersPanel, #mapAdminPanel, #botsAdminPanel, #radioAdminPanel, #interactionsAdminPanel, .floating-panel").forEach((p) => { if (p) { p.hidden = true; p.style.display = ""; } });
    const _dock = document.querySelector("#adminDock");
    if (_dock) { _dock.hidden = true; _dock.querySelectorAll("[data-dock-panel]").forEach((b) => b.setAttribute("aria-pressed", "false")); }
    const _shield = document.querySelector("#adminShortcut");
    if (_shield) _shield.setAttribute("aria-pressed", "false");
    addSystemLine(isAdmin ? "Você entrou como admin da sala." : "Bem-vindo à sala!");
  } finally {
    window.hideWorldLoading?.();
  }
  // Pós-entrada (não bloqueia)
  loadInitialChat().catch(() => {});
  connectRealtime().catch(() => {});
  Promise.resolve().then(() => window.radioEnterRoom?.(currentMapId)).catch(() => {});
  Promise.resolve().then(() => window.interactionsEnterRoom?.(currentMapId)).catch(() => {});
  Promise.resolve().then(() => window.portalsEnterRoom?.(currentMapId)).catch(() => {});
  Promise.resolve().then(() => window.carsEnterRoom?.(currentMapId)).catch(() => {});

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
  // Nome do usuário é pré-estabelecido na conta. Só pedimos para definir quando
  // ainda não existe (contas antigas / criadas sem nome).
  const hasName = !!(me?.name && me.name !== "Visitante");
  const nickWrap = document.querySelector("#characterNickWrap");
  if (nickWrap) nickWrap.hidden = hasName;
  characterNicknameInput.value = hasName ? "" : "";
  selectedCharacterSlug =
    me?.character_slug ||
    charactersCatalog.find((c) => c.base_url)?.slug ||
    (userAvatars[0] ? `user:${userAvatars[0].id}` : null);
  characterSelectOverlay.hidden = false;
  initPreviewScene();
  refreshCharacterCarousel();
  startPreviewLoop();
  setTimeout(resizePreview, 60);
}
document.querySelector("#characterSelectLogout")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.reload();
});
function closeCharacterSelect() {
  if (characterSelectOverlay) characterSelectOverlay.hidden = true;
  stopPreviewLoop();
}

function updateEnterButtonState() {
  if (!enterRoomButton) return;
  const character = findCharacterBySlug(selectedCharacterSlug);
  const hasFiles = !!character?.base_url;
  enterRoomButton.disabled = !selectedCharacterSlug || !hasFiles;
}

// ============ Preview 3D da seleção de personagem (estilo Avaturn) ============
const charStage = document.querySelector("#characterStage");
const previewCanvas = document.querySelector("#characterPreviewCanvas");
const charPrevBtn = document.querySelector("#charPrevBtn");
const charNextBtn = document.querySelector("#charNextBtn");
const charDeleteBtn = document.querySelector("#charDeleteBtn");
const charStageName = document.querySelector("#charStageName");
const charStageLoader = document.querySelector("#charStageLoader");
const charStageEmpty = document.querySelector("#charStageEmpty");
const charDots = document.querySelector("#charDots");
const charEditBtn = document.querySelector("#charEditBtn");
const charCreateBtn = document.querySelector("#charCreateBtn");

let selectableChars = [];
let previewIndex = 0;
let previewRenderer = null, previewScene = null, previewCamera = null, previewControls = null;
let previewMixer = null, previewClock = null, previewRaf = null;
let previewCharObj = null, previewGround = null, previewRing = null;
let previewSmoke = null;
let previewLoadToken = 0;
let previewBodySize = null; // tamanho (Vector3) do avatar atual, para reenquadrar no resize

function initPreviewScene() {
  if (previewRenderer || !previewCanvas) return;
  previewRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true, alpha: true });
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  previewRenderer.shadowMap.enabled = true;
  previewRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

  previewScene = new THREE.Scene();
  previewCamera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  previewCamera.position.set(0, 1.4, 3.4);

  previewScene.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a2440, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(2.6, 4.2, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 25;
  previewScene.add(key);
  const rim = new THREE.DirectionalLight(0x9b8cff, 0.9);
  rim.position.set(-3, 2.4, -2.4);
  previewScene.add(rim);

  previewGround = new THREE.Mesh(
    new THREE.CircleGeometry(1.45, 56),
    new THREE.MeshStandardMaterial({ color: 0x14172a, roughness: 0.92, metalness: 0.08 }),
  );
  previewGround.rotation.x = -Math.PI / 2;
  previewGround.receiveShadow = true;
  previewScene.add(previewGround);

  previewRing = new THREE.Mesh(
    new THREE.RingGeometry(1.32, 1.46, 64),
    new THREE.MeshBasicMaterial({ color: 0x7c5cff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  previewRing.rotation.x = -Math.PI / 2;
  previewScene.add(previewRing);

  previewControls = new OrbitControls(previewCamera, previewRenderer.domElement);
  previewControls.enablePan = false;
  previewControls.enableDamping = true;
  previewControls.dampingFactor = 0.08;
  previewControls.rotateSpeed = 0.7;
  previewControls.minDistance = 1.4;
  previewControls.maxDistance = 5;
  previewControls.minPolarAngle = Math.PI * 0.12;
  previewControls.maxPolarAngle = Math.PI * 0.54;
  previewControls.target.set(0, 0.95, 0);

  previewClock = new THREE.Clock();
  if (typeof ResizeObserver !== "undefined" && charStage) {
    new ResizeObserver(() => resizePreview()).observe(charStage);
  }
  window.addEventListener("resize", resizePreview);
  resizePreview();
}

function resizePreview() {
  if (!previewRenderer || !previewCanvas) return;
  const w = previewCanvas.clientWidth || charStage?.clientWidth || 0;
  const h = previewCanvas.clientHeight || charStage?.clientHeight || 0;
  if (!w || !h) return;
  previewRenderer.setSize(w, h, false);
  previewCamera.aspect = w / h;
  previewCamera.updateProjectionMatrix();
  reframePreview();
}

// Enquadra o avatar com a câmera nivelada: corpo inteiro visível e a BASE (pés/y=0)
// bem embaixo, logo acima do nome. Robusto ao aspect (recalcula em todo resize).
function reframePreview() {
  if (!previewCamera || !previewControls || !previewBodySize) return;
  const size = previewBodySize;
  const vFov = (previewCamera.fov * Math.PI) / 180;
  const aspect = Math.max(previewCamera.aspect, 0.0001);
  const tan = Math.tan(vFov / 2);
  // halfH = metade da altura visível (em unidades de mundo) no plano do alvo.
  // Garante caber o corpo todo em altura e largura, com folga.
  const halfH = Math.max((size.y * 0.62), (size.x * 0.58) / aspect, 0.4);
  const dist = halfH / tan;
  // Câmera nivelada (mesma altura do alvo). Cy controla onde a base cai na tela:
  // ground (y=0) ficará a ~12% do fundo do quadro → logo acima do nome.
  const Cy = halfH * 0.76;
  previewControls.target.set(0, Cy, 0);
  previewCamera.position.set(0, Cy, dist);
  previewControls.minDistance = Math.max(dist * 0.5, 0.4);
  previewControls.maxDistance = dist * 2.4;
  previewControls.update();
}

function previewLoop() {
  previewRaf = requestAnimationFrame(previewLoop);
  const dt = previewClock ? previewClock.getDelta() : 0;
  if (previewMixer) previewMixer.update(dt);
  if (previewSmoke) updateLoadingSmoke({ loadingFx: previewSmoke }, performance.now() / 1000);
  if (previewControls) previewControls.update();
  if (previewRenderer && previewScene && previewCamera) previewRenderer.render(previewScene, previewCamera);
}
function startPreviewLoop() {
  if (previewRaf || !previewRenderer) return;
  previewClock?.start();
  previewLoop();
}
function stopPreviewLoop() {
  if (previewRaf) { cancelAnimationFrame(previewRaf); previewRaf = null; }
}

async function loadPreviewCharacter(character) {
  if (!previewScene || !character) return;
  const token = ++previewLoadToken;
  if (previewCharObj) { previewScene.remove(previewCharObj); previewCharObj = null; }
  previewMixer = null;
  // Mesma fumaça 3D usada ao carregar o avatar na sala (em vez do spinner HTML).
  if (charStageLoader) charStageLoader.hidden = true;
  if (previewSmoke) { previewScene.remove(previewSmoke); previewSmoke = null; }
  previewSmoke = createLoadingSmoke();
  previewSmoke.position.set(0, 0.35, 0);
  previewScene.add(previewSmoke);
  try {
    const { base, clips } = await loadCharacterAssets(character);
    if (token !== previewLoadToken) return;
    const obj = cloneSkeleton(base);
    obj.scale.copy(base.scale);
    obj.position.set(0, 0, 0);
    obj.rotation.set(CHARACTER_DEFAULT_ROT_X, 0, 0);
    obj.traverse((c) => {
      if (c.isMesh || c.isSkinnedMesh) { c.castShadow = true; c.frustumCulled = false; }
    });
    previewScene.add(obj);
    previewCharObj = obj;

    // Mede com PRECISÃO (vértices com skin reais) — igual à sala. setFromObject usa
    // a bind pose e costuma dar um min.y abaixo dos pés, deixando o avatar flutuando.
    const measure = (o) => {
      o.updateMatrixWorld(true);
      o.traverse((c) => {
        if (c.isSkinnedMesh && c.skeleton) {
          try { c.skeleton.update(); } catch {}
          try { c.computeBoundingBox(); c.computeBoundingSphere(); } catch {}
        }
      });
      const b = new THREE.Box3();
      b.expandByObject(o, true);
      if (!isFinite(b.min.y) || !isFinite(b.max.y)) b.setFromObject(o);
      return b;
    };
    let box = measure(obj);
    // Cola os pés na base: desloca o modelo para que o ponto mais baixo fique em y=0.
    obj.position.y -= box.min.y;
    box = measure(obj);
    if (previewGround) previewGround.position.y = 0;
    if (previewRing) previewRing.position.y = 0.002;

    previewMixer = new THREE.AnimationMixer(obj);
    const idleClip = clips.idle || Object.values(clips)[0];
    if (idleClip && idleClip.tracks.length) previewMixer.clipAction(idleClip).reset().play();
    // Gambiarra anti-flutuação: aplica o 1º frame da idle e recola os pés na base,
    // pois a pose animada pode diferir da pose medida (variando por tamanho/avatar).
    previewMixer.update(0);
    const posed = measure(obj);
    if (isFinite(posed.min.y)) obj.position.y -= posed.min.y;

    // Guarda o tamanho e reenquadra (recalcula no resize, robusto ao aspect do canvas).
    resizePreview();
    previewBodySize = (posed && isFinite(posed.min.y) ? posed : box).getSize(new THREE.Vector3());
    reframePreview();
  } catch (e) {
    console.warn("[preview] falha ao carregar personagem", e);
  } finally {
    if (token === previewLoadToken) {
      if (previewSmoke) { previewScene.remove(previewSmoke); previewSmoke = null; }
      if (charStageLoader) charStageLoader.hidden = true;
    }
  }
}

function buildSelectableChars() {
  const myAvatarTiles = userAvatars
    .filter((av) => av.user_id === myId)
    .map((av) => userAvatarToCharacter(av));
  selectableChars = [...charactersCatalog.filter((c) => c.base_url), ...myAvatarTiles];
}
function currentPreviewChar() { return selectableChars[previewIndex] || null; }

function refreshCharacterCarousel() {
  buildSelectableChars();
  const idx = selectableChars.findIndex((c) => c.slug === selectedCharacterSlug);
  if (idx >= 0) previewIndex = idx;
  else if (previewIndex >= selectableChars.length) previewIndex = Math.max(0, selectableChars.length - 1);
  updateCarouselUI();
}

function renderDots() {
  if (!charDots) return;
  charDots.innerHTML = selectableChars
    .map((c, i) => `<button type="button" class="char-dot ${i === previewIndex ? "is-active" : ""}" data-i="${i}" aria-label="${escapeHtml(c.name)}"></button>`)
    .join("");
}

function updateCarouselUI() {
  const empty = selectableChars.length === 0;
  if (charStageEmpty) charStageEmpty.hidden = !empty;
  if (charPrevBtn) charPrevBtn.disabled = selectableChars.length <= 1;
  if (charNextBtn) charNextBtn.disabled = selectableChars.length <= 1;
  const c = currentPreviewChar();
  selectedCharacterSlug = c?.slug || null;
  if (charStageName) charStageName.textContent = c?.name || "";
  // Apenas admin pode anexar/editar/excluir avatares customizados.
  if (charCreateBtn) charCreateBtn.hidden = !isAdmin;
  if (charEditBtn) charEditBtn.hidden = !isAdmin || !c?.isUserAvatar;
  if (charDeleteBtn) charDeleteBtn.hidden = !isAdmin || !c?.isUserAvatar;
  renderDots();
  updateEnterButtonState();
  if (c) loadPreviewCharacter(c);
  else if (previewCharObj && previewScene) { previewScene.remove(previewCharObj); previewCharObj = null; previewMixer = null; }
}

function previewGo(delta) {
  if (selectableChars.length <= 1) return;
  previewIndex = (previewIndex + delta + selectableChars.length) % selectableChars.length;
  updateCarouselUI();
}

charPrevBtn?.addEventListener("click", () => previewGo(-1));
charNextBtn?.addEventListener("click", () => previewGo(1));
charDots?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-i]");
  if (!b) return;
  previewIndex = Number(b.dataset.i);
  updateCarouselUI();
});
function slugifyCharacterName(name) {
  return String(name || "personagem")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34) || "personagem";
}

async function uploadAdminCharacterGlb(file) {
  if (!isAdmin) { alert("Apenas admin pode anexar personagens."); return; }
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".glb")) {
    if (characterSelectError) {
      characterSelectError.hidden = false;
      characterSelectError.textContent = "Escolha um arquivo .glb.";
    }
    return;
  }
  const name = (prompt("Nome do personagem:", file.name.replace(/\.glb$/i, "")) || "").trim();
  if (!name) return;
  const baseSlug = slugifyCharacterName(name);
  const slug = `${baseSlug}-${Date.now().toString(36).slice(-5)}`;
  if (characterSelectError) {
    characterSelectError.hidden = false;
    characterSelectError.textContent = "Enviando personagem…";
  }
  try {
    const path = `admin-characters/${slug}/base.glb`;
    const { error: upErr } = await supabase.storage.from("characters").upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: "model/gltf-binary",
    });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("characters").getPublicUrl(path);
    const nextPos = (charactersCatalog.reduce((m, c) => Math.max(m, c.position || 0), 0) || 0) + 1;
    const { error: dbErr } = await supabase.from("characters").insert({
      slug,
      name,
      base_url: `${pub.publicUrl}?v=${Date.now()}`,
      position: nextPos,
    });
    if (dbErr) throw dbErr;
    await loadCharactersCatalog();
    selectedCharacterSlug = slug;
    refreshCharacterCarousel();
    if (characterSelectError) {
      characterSelectError.hidden = false;
      characterSelectError.textContent = "Personagem anexado. Já está disponível para todos.";
    }
  } catch (err) {
    console.error("Falha ao anexar personagem", err);
    if (characterSelectError) {
      characterSelectError.hidden = false;
      characterSelectError.textContent = `Erro ao anexar: ${err.message || err}`;
    }
  }
}

charCreateBtn?.addEventListener("click", () => {
  if (!isAdmin) { alert("Apenas admin pode anexar personagens."); return; }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".glb,model/gltf-binary";
  input.addEventListener("change", () => uploadAdminCharacterGlb(input.files?.[0]));
  input.click();
});
charEditBtn?.addEventListener("click", () => {
  if (!isAdmin) return;
  const c = currentPreviewChar();
  if (!c?.isUserAvatar) return;
  openAvatarCreator({ editId: c.userAvatarId, name: c.name });
});
charDeleteBtn?.addEventListener("click", async () => {
  const c = currentPreviewChar();
  if (!c?.isUserAvatar) return;
  if (!confirm("Excluir este avatar? Essa ação não pode ser desfeita.")) return;
  const oldBaseUrl = userAvatars.find((a) => a.id === c.userAvatarId)?.base_url || null;
  const { error } = await supabase.from("user_avatars").delete().eq("id", c.userAvatarId);
  if (error) { alert("Não foi possível excluir: " + error.message); return; }
  // Remove o GLB do storage para não deixar arquivos órfãos.
  if (oldBaseUrl) {
    const oldPath = storagePathFromPublicUrl(oldBaseUrl, "characters");
    if (oldPath) {
      supabase.storage.from("characters").remove([oldPath])
        .catch((e) => console.warn("[avatar] falha ao remover GLB excluído", e));
    }
  }
  if (selectedCharacterSlug === c.slug) selectedCharacterSlug = null;
  userAvatars = userAvatars.filter((a) => a.id !== c.userAvatarId);
  refreshCharacterCarousel();
});

enterRoomButton?.addEventListener("click", async () => {
  if (!me || !selectedCharacterSlug) return;
  const nickWrap = document.querySelector("#characterNickWrap");
  const needsName = nickWrap && !nickWrap.hidden;
  let newName = me.name && me.name !== "Visitante" ? me.name : "";
  if (needsName) {
    newName = (characterNicknameInput.value || "").trim();
    if (!newName) {
      characterSelectError.hidden = false;
      characterSelectError.textContent = "Digite seu nome de usuário para continuar.";
      characterNicknameInput.focus();
      return;
    }
  }
  if (!newName) newName = "Visitante";
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
    // Reexibe o mundo (trocar personagem removeu a classe ao voltar pro lobby).
    document.body.classList.add("world-ready");
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
  exitRoomToLobby();
  openCharacterSelect();
});

changeMapButton?.addEventListener("click", () => {
  exitRoomToLobby();
  openMapSelect();
});

function exitRoomToLobby() {
  document.body.classList.remove("world-ready");
  // Limpa o chat local (mensagens somem ao sair da sala)
  if (chatLog) chatLog.innerHTML = "";
  try {
    const cb = document.querySelector("#mobileChatBadge");
    const db = document.querySelector("#mobileDmBadge");
    if (cb) cb.hidden = true;
    if (db) db.hidden = true;
  } catch {}
  // Fecha o admin dock e qualquer painel aberto
  const dock = document.querySelector("#adminDock");
  if (dock) {
    dock.hidden = true;
    dock.querySelectorAll("[data-dock-panel]").forEach((b) => b.setAttribute("aria-pressed", "false"));
  }
  document.querySelectorAll("#lightsAdminPanel, #layersPanel, #mapAdminPanel, #botsAdminPanel, #radioAdminPanel, #interactionsAdminPanel, .floating-panel").forEach((p) => {
    if (p) { p.hidden = true; p.style.display = ""; }
  });
}

// ===== Avatar Creator (Avaturn workaround) =====
const avatarCreatorOverlay = document.querySelector("#avatarCreatorOverlay");
const avatarCreatorClose = document.querySelector("#avatarCreatorClose");
const avatarCreatorFile = document.querySelector("#avatarCreatorFile");
const avatarCreatorName = document.querySelector("#avatarCreatorName");
const avatarCreatorStatus = document.querySelector("#avatarCreatorStatus");
const avatarDropzone = document.querySelector("#avatarDropzone");

const avatarCreatorFrame = document.querySelector("#avatarCreatorFrame");
const avatarCreatorLoader = document.querySelector("#avatarCreatorLoader");
let _avaturnReady = false;
let _avaturnSaving = false;

function hideAvaturnLoader() {
  if (!avatarCreatorLoader) return;
  avatarCreatorLoader.style.opacity = "0";
  setTimeout(() => { if (avatarCreatorLoader) avatarCreatorLoader.style.display = "none"; }, 400);
}

let _editingAvatarId = null;
function openAvatarCreator(opts = {}) {
  if (!avatarCreatorOverlay) return;
  _editingAvatarId = opts.editId || null;
  const heading = avatarCreatorOverlay.querySelector("h2");
  if (heading) heading.textContent = _editingAvatarId ? "Editar meu avatar" : "Criar meu avatar";
  avatarCreatorStatus.textContent = _editingAvatarId
    ? "Ajuste seu avatar e clique em “Next” para atualizar."
    : "";
  avatarCreatorStatus.style.color = "";
  avatarCreatorName.value = opts.name || "";
  avatarCreatorFile.value = "";
  _avaturnReady = false;
  _avaturnSaving = false;
  _lastAvaturnImportTs = 0;
  if (avatarCreatorLoader) {
    avatarCreatorLoader.style.display = "flex";
    avatarCreatorLoader.style.opacity = "1";
  }
  // Failsafe: se nenhum handshake chegar em 8s, esconde o loader mesmo assim
  setTimeout(() => {
    if (!_avaturnReady) {
      _avaturnReady = true;
      hideAvaturnLoader();
    }
  }, 8000);
  avatarCreatorOverlay.hidden = false;
}
function closeAvatarCreator() {
  if (avatarCreatorOverlay) avatarCreatorOverlay.hidden = true;
}
avatarCreatorClose?.addEventListener("click", closeAvatarCreator);




// Converte uma URL pública do Storage de volta para o caminho interno do bucket.
function storagePathFromPublicUrl(url, bucket) {
  if (!url) return null;
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
}

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
    // Garante uma sessão válida antes do upload — o fluxo do Avaturn pode demorar
    // e o token de acesso pode expirar, fazendo a RLS do storage (auth.uid()) falhar.
    let authedId = null;
    const { data: userData } = await supabase.auth.getUser();
    authedId = userData?.user?.id || null;
    if (!authedId) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      authedId = refreshed?.user?.id || null;
    }
    if (!authedId) {
      throw new Error("Sua sessão expirou. Faça login novamente para salvar o avatar.");
    }
    // Usa o ID autenticado real no caminho do storage (igual à política de RLS).
    const ownerId = authedId;
    if (ownerId !== me.id) me.id = ownerId;
    const ext = "glb";
    const path = `user-avatars/${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("characters").upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: "model/gltf-binary",
    });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("characters").getPublicUrl(path);
    const baseUrl = pub.publicUrl;

    if (_editingAvatarId) {
      // Edição: substitui o GLB do avatar atual (mesmo slug user:<id>).
      const oldBaseUrl = userAvatars.find((a) => a.id === _editingAvatarId)?.base_url || null;
      const { data: updated, error: dbErr } = await supabase
        .from("user_avatars")
        .update({ base_url: baseUrl })
        .eq("id", _editingAvatarId)
        .select()
        .single();
      if (dbErr) throw dbErr;
      // Remove o GLB antigo do storage para não deixar arquivos órfãos.
      if (oldBaseUrl && oldBaseUrl !== baseUrl) {
        const oldPath = storagePathFromPublicUrl(oldBaseUrl, "characters");
        if (oldPath) {
          supabase.storage.from("characters").remove([oldPath])
            .catch((e) => console.warn("[avatar] falha ao remover GLB antigo", e));
        }
      }
      userAvatars = userAvatars.map((a) => (a.id === _editingAvatarId ? updated : a));
      // Limpa o cache para recarregar a nova versão no preview e na sala.
      characterCache.delete(`user:${_editingAvatarId}`);
      selectedCharacterSlug = `user:${_editingAvatarId}`;
      avatarCreatorStatus.style.color = "#29d3bd";
      avatarCreatorStatus.textContent = "Pronto! Avatar atualizado.";
      // Atualiza meu personagem na sala, se eu já estiver usando este avatar.
      const myEntity = playerEntities.get(myId);
      if (myEntity && me?.character_slug === `user:${_editingAvatarId}`) {
        myEntity.characterSlug = null;
        myEntity.pendingCharacterSlug = null;
        applyCharacter(myEntity, `user:${_editingAvatarId}`);
      }
    } else {
      const { data: inserted, error: dbErr } = await supabase
        .from("user_avatars")
        .insert({ user_id: me.id, name, base_url: baseUrl })
        .select()
        .single();
      if (dbErr) throw dbErr;
      userAvatars = [inserted, ...userAvatars];
      selectedCharacterSlug = `user:${inserted.id}`;
      avatarCreatorStatus.style.color = "#29d3bd";
      avatarCreatorStatus.textContent = "Pronto! Avatar adicionado à sua lista.";
    }
    _editingAvatarId = null;
    refreshCharacterCarousel();
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

  // Qualquer mensagem do Avaturn = iframe está vivo. Esconde nosso loader.
  if (!_avaturnReady) {
    _avaturnReady = true;
    hideAvaturnLoader();
  }

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
    _avaturnSaving = false;
  } catch (err) {
    console.error("Falha ao importar avatar do Avaturn", err);
    _avaturnSaving = false;
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
  const visibleMaps = MAPS.filter((m) => isAdmin || !m.hidden);
  mapGrid.innerHTML = visibleMaps.map((m) => {
    const isSelected = selectedMapId === m.id;
    const moodLabel = m.mood === "day" ? "☀️ Dia" : m.mood === "sunset" ? "🌅 Tarde" : "🌙 Noite";
    const count = lobbyCounts[m.id] || 0;
    const peopleLabel = count === 0 ? "Vazia" : `${count} ${count === 1 ? "pessoa" : "pessoas"}`;
    const isCurrent = currentRoomChannelsMapId === m.id;
    const thumbInner = m.thumbUrl
      ? `<img src="${m.thumbUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;display:block;">`
      : `<span style="font-size:32px;">${m.thumb}</span>`;
    const hiddenBadge = m.hidden ? `<div style="position:absolute;bottom:6px;left:6px;background:rgba(120,40,160,0.85);color:#fff;border-radius:8px;padding:2px 7px;font-size:10px;font-weight:600;z-index:2;">🔒 OCULTO</div>` : "";
    return `
      <div class="char-tile ${isSelected ? "is-selected" : ""}" data-map-id="${m.id}" style="position:relative;${m.hidden ? "opacity:0.78;" : ""}">
        <div style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.55);color:#fff;border-radius:10px;padding:2px 8px;font-size:11px;display:flex;align-items:center;gap:4px;z-index:2;">
          <span style="width:6px;height:6px;border-radius:50%;background:${count > 0 ? "#29d3bd" : "#666"};"></span>
          ${peopleLabel}
        </div>
        ${isAdmin ? `<button type="button" class="map-edit-btn" data-edit-map="${m.id}" title="Editar mapa" style="position:absolute;top:6px;left:6px;background:rgba(0,0,0,0.6);color:#ffd166;border:1px solid rgba(255,209,102,0.4);border-radius:8px;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;padding:0;z-index:2;">✏️</button>` : ""}
        ${hiddenBadge}
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
  // Se ainda não entrou na sala, volta pra escolher personagem.
  // Se já está na sala, restaura a visão do mundo (exitRoomToLobby removeu world-ready).
  if (!playerEntities.get(myId)) {
    openCharacterSelect();
  } else {
    document.body.classList.add("world-ready");
  }
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
  } else {
    // Mesma sala — apenas restaura a visão do mundo
    document.body.classList.add("world-ready");
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
// Shield admin: abre/fecha o dock de ferramentas no canto direito
(() => {
  const shield = document.querySelector("#adminShortcut");
  const dock = document.querySelector("#adminDock");
  if (!shield || !dock) return;
  const DOCK_KEY = "admin-dock-open";
  function setDock(open) {
    dock.hidden = !open;
    shield.setAttribute("aria-pressed", open ? "true" : "false");
    try { localStorage.setItem(DOCK_KEY, open ? "1" : "0"); } catch {}
    if (!open) {
      // Fecha todos os painéis admin ao recolher o dock
      dock.querySelectorAll("[data-dock-panel]").forEach((b) => {
        const sel = b.getAttribute("data-dock-panel");
        const panel = sel && document.querySelector(sel);
        if (panel && !panel.hidden) panel.hidden = true;
        b.setAttribute("aria-pressed", "false");
      });
    }
  }
  shield.addEventListener("click", () => setDock(dock.hidden));
  // Estado inicial: começa fechado (mesmo pro admin)
  setDock(false);

  // Delegação: cada barra do dock clica no botão original correspondente
  const ALL_PANEL_SELECTORS = [
    "#lightsAdminPanel", "#layersPanel", "#botsAdminPanel",
    "#radioAdminPanel", "#interactionsAdminPanel", "#mapAdminPanel",
    "#carsAdminPanel", "#animAdminPanel", "#speedAdminPanel",
    "#portalsAdminPanel", "#itemsAdminPanel",
  ];
  dock.addEventListener("click", (ev) => {
    const item = ev.target.closest(".admin-dock-item");
    if (!item) return;
    if (item.id === "adminDockImportGlb") {
      document.querySelector("#glbInput")?.click();
      return;
    }
    if (item.id === "adminDockAssets") {
      const panel = document.querySelector("#assetDock");
      if (panel) {
        panel.hidden = !panel.hidden;
        item.setAttribute("aria-pressed", panel.hidden ? "false" : "true");
      }
      return;
    }
    const panelSel = item.getAttribute("data-dock-panel");
    // Antes de abrir uma ferramenta, fecha todas as outras (uma de cada vez)
    if (panelSel) {
      for (const sel of ALL_PANEL_SELECTORS) {
        if (sel === panelSel) continue;
        const other = document.querySelector(sel);
        if (other && !other.hidden) other.hidden = true;
      }
      dock.querySelectorAll("[data-dock-panel]").forEach((b) => {
        if (b !== item) b.setAttribute("aria-pressed", "false");
      });
    }
    const targetSel = item.getAttribute("data-dock-target");
    const target = targetSel && document.querySelector(targetSel);
    const panel = panelSel ? document.querySelector(panelSel) : null;
    const wasHidden = panel ? panel.hidden : null;
    if (target) {
      target.click();
      // Fallback: se o clique no botão original não toggleou o painel, força
      if (panel && panel.hidden === wasHidden) panel.hidden = !panel.hidden;
    } else if (panel) {
      panel.hidden = !panel.hidden;
    }
    if (item.hasAttribute("data-dock-toggle") && target) {
      setTimeout(() => {
        const on = /\bON\b/i.test(target.textContent || "");
        item.setAttribute("aria-pressed", on ? "true" : "false");
      }, 0);
    }
    if (panelSel) {
      const panel = document.querySelector(panelSel);
      setTimeout(() => {
        item.setAttribute("aria-pressed", panel && !panel.hidden ? "true" : "false");
      }, 0);
    }
  });


  // Quando um painel é fechado pelos seus próprios botões internos (×/−),
  // remove o destaque da barra correspondente no dock.
  const panelMap = {
    "lightsAdminPanel": "[data-dock-panel='#lightsAdminPanel']",
    "layersPanel": "[data-dock-panel='#layersPanel']",
    "botsAdminPanel": "[data-dock-panel='#botsAdminPanel']",
    "radioAdminPanel": "[data-dock-panel='#radioAdminPanel']",
    "interactionsAdminPanel": "[data-dock-panel='#interactionsAdminPanel']",
    "mapAdminPanel": "[data-dock-panel='#mapAdminPanel']",
    "carsAdminPanel": "[data-dock-panel='#carsAdminPanel']",
    "animAdminPanel": "[data-dock-panel='#animAdminPanel']",
    "portalsAdminPanel": "[data-dock-panel='#portalsAdminPanel']",
    "itemsAdminPanel": "[data-dock-panel='#itemsAdminPanel']",
  };
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type !== "attributes" || m.attributeName !== "hidden") continue;
      const panel = m.target;
      const sel = panelMap[panel.id];
      if (!sel) continue;
      const btn = dock.querySelector(sel);
      if (btn) btn.setAttribute("aria-pressed", panel.hidden ? "false" : "true");
    }
  });
  Object.keys(panelMap).forEach((id) => {
    const p = document.getElementById(id);
    if (p) obs.observe(p, { attributes: true });
  });
})();

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
// opts.stripRootPosition: remove TODAS as faixas de POSIÇÃO (mantém só rotações).
// opts.stripHipRotation: remove a faixa de ROTAÇÃO do osso Hips. Usado nos chutes
// para evitar que o Hips role o corpo inteiro 90° (deitado) durante o clipe.
function retargetClipToBones(clip, targetBoneNames, opts = {}) {
  const stripRootPosition = !!opts.stripRootPosition;
  const stripHipRotation = !!opts.stripHipRotation;
  const isHipName = (n) => /^(mixamorig\d*:?)?hips?$/i.test(n);
  // Index target bones by their "stripped" form (no mixamorig prefix, lowercased)
  // so we can match clips that differ only by prefix / numeric suffix / casing.
  const stripPrefix = (n) => n.replace(/^mixamorig\d*:?/i, "");
  const targetByStripped = new Map();
  for (const name of targetBoneNames) {
    const key = stripPrefix(name).toLowerCase();
    if (key && !targetByStripped.has(key)) targetByStripped.set(key, name);
  }
  const out = clip.clone();
  const tracks = [];
  for (const t of out.tracks) {
    const dot = t.name.indexOf(".");
    if (dot < 0) { tracks.push(t); continue; }
    const boneName = t.name.slice(0, dot);
    const prop = t.name.slice(dot);
    if (stripRootPosition && prop === ".position") continue;
    if (stripHipRotation && isHipName(boneName) && prop === ".quaternion") continue;
    let candidate = null;
    if (targetBoneNames.has(boneName)) {
      candidate = boneName;
    } else {
      const key = stripPrefix(boneName).toLowerCase();
      if (targetByStripped.has(key)) candidate = targetByStripped.get(key);
    }
    if (!candidate) continue;
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
    const animSlots = ["idle", "walk", "run", "dance", "wave", "kickWeak", "kickStrong"];

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
          const isKick = (slot === "kickWeak" || slot === "kickStrong");
          const retarg = retargetClipToBones(clip, targetBones, { stripRootPosition: isKick, stripHipRotation: isKick }) || clip.clone();
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
      } else if (name === "kickWeak" || name === "kickStrong") {
        // Chute toca uma vez; o módulo de futebol controla o retorno pra idle/walk.
        action.setLoop(THREE.LoopOnce, 1);
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
async function loadInitialAssets(mapId = currentMapId) {
  const { data } = await supabase.from("map_assets").select("*").eq("map_id", mapId).order("created_at");
  if (mapId !== currentMapId) return;
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
      if (onlineCount) onlineCount.textContent = `${players.length} online`;
    })
    .subscribe();

  // Voz por proximidade — push-to-talk
  if (voiceChannel) await supabase.removeChannel(voiceChannel);
  voiceChannel = supabase.channel(`room-voice:${mapId}`, {
    config: { broadcast: { self: false } },
  });
  voiceChannel
    .on("broadcast", { event: "voice-start" }, ({ payload }) => {
      if (!payload || payload.id === myId) return;
      window.__voice?.onRemoteStart?.(payload.id);
    })
    .on("broadcast", { event: "voice-end" }, ({ payload }) => {
      if (!payload || payload.id === myId) return;
      window.__voice?.onRemoteEnd?.(payload.id);
    })
    .on("broadcast", { event: "voice-blob" }, ({ payload }) => {
      if (!payload || payload.id === myId) return;
      window.__voice?.onRemoteBlob?.(payload.id, payload.b64, payload.mime);
    })
    .subscribe();
  window.__voice?.setChannel?.(voiceChannel);

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
        if (characterSelectOverlay && !characterSelectOverlay.hidden) refreshCharacterCarousel();
      })
      .subscribe();
  }

  // Avatares de usuários (Avaturn)
  if (!userAvatarsChannel) {
    userAvatarsChannel = supabase
      .channel("room-user-avatars")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_avatars" }, async () => {
        await loadUserAvatars();
        if (characterSelectOverlay && !characterSelectOverlay.hidden) refreshCharacterCarousel();
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
        // Notifica amigos via push que entrei online
        try { window.__notifyFriendsOnline?.(); } catch {}
      }
    });
}

async function trackLobby() {
  if (!lobbyChannel) return;
  try { await lobbyChannel.track({ map_id: currentMapId }); } catch {}
}

// === Trocar de sala em runtime ===
async function switchRoom(newMapId) {
  if (newMapId === currentRoomChannelsMapId) {
    // Já estamos nessa sala — só garante que o mundo volte a aparecer.
    document.body.classList.add("world-ready");
    return;
  }
  window.showWorldLoading?.("Carregando o mundo");
  try { await window.radioLeaveRoom?.(); } catch {}
  try { await window.interactionsLeaveRoom?.(); } catch {}
  try { await window.portalsLeaveRoom?.(); } catch {}
  try { await window.carsLeaveRoom?.(); } catch {}

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
    if (voiceChannel) { await supabase.removeChannel(voiceChannel); voiceChannel = null; window.__voice?.setChannel?.(null); }

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
    updateRoomTitle();

    await loadEnvironment(newMapId, { waitForAssets: false });
    // Reexibe o mundo (o botão "Trocar local" removeu a classe ao voltar pro lobby)
    document.body.classList.add("world-ready");
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
    Promise.resolve().then(() => window.portalsEnterRoom?.(newMapId)).catch(() => {});
    Promise.resolve().then(() => window.carsEnterRoom?.(newMapId)).catch(() => {});

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
    sitting_id: window.__sittingInteraction?.id || null,
  };
}

// Verifica via presence se algum OUTRO usuário já está ocupando essa interação
window.isInteractionOccupied = function (interactionId) {
  if (!interactionId || !presenceChannel) return false;
  try {
    const state = presenceChannel.presenceState();
    for (const key of Object.keys(state)) {
      for (const p of state[key]) {
        if (p && p.id !== myId && p.sitting_id === interactionId) return true;
      }
    }
  } catch {}
  return false;
};

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
  // Se estiver dirigindo um carro, dispara uma persistência da posição atual
  // (best-effort) e libera o assento de motorista. O save periódico de 3s
  // do simulateDriving é a rede de segurança principal.
  try {
    const dc = window.__drivingCar;
    if (dc?.row && dc?.group) {
      supabase.from("map_cars").update({
        x: dc.group.position.x, y: dc.group.position.y, z: dc.group.position.z,
        rotation_y: dc.state.yaw,
        driver_user_id: null, driver_since: null,
      }).eq("id", dc.row.id).then(() => {});
    }
  } catch {}
}
window.addEventListener("pagehide", notifyLeaveAndUntrack);
window.addEventListener("beforeunload", notifyLeaveAndUntrack);
// Só sai da sala depois de um tempo longo em segundo plano (AFK real).
let _afkLeaveTimer = null;
const AFK_LEAVE_MS = 5 * 60 * 1000; // 5 minutos
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    if (_afkLeaveTimer) clearTimeout(_afkLeaveTimer);
    _afkLeaveTimer = setTimeout(() => { notifyLeaveAndUntrack(); }, AFK_LEAVE_MS);
  } else {
    if (_afkLeaveTimer) { clearTimeout(_afkLeaveTimer); _afkLeaveTimer = null; }
  }
});



// ============ HUD permissions ============
function renderPermissions() {
  document.body.classList.toggle("is-admin", isAdmin);
  if (roleBadge) roleBadge.textContent = isAdmin ? "admin" : "visitante";
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
  invalidateEnvCullCache?.();
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
  invalidateEnvCullCache?.();
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
  // GLBs colocados não bloqueiam a entrada: só carregam junto quando explicitamente pedido.
  const startAssetsLoad = () => loadInitialAssets(map.id);
  const assetsPromise = waitForAssets ? startAssetsLoad() : null;

  // Busca o transform salvo pelo admin (não bloqueia o load)
  const transformPromise = fetchMapTransform(map.id);

  // Mapa sem GLB: apenas aplica transform/luzes e sai (admin pode colocar GLBs dentro)
  if (!map.url) {
    currentMapTransform = await transformPromise;
    if (token !== __envLoadToken) { assetsPromise?.catch(() => {}); return; }
    setDarkMode(!!currentMapTransform?.dark_mode);
    applyLightingForMood(currentMapTransform?.mood || map.mood || "day");
    reloadMapLights(currentMapId);
    syncMapAdminPanel();
    if (waitForAssets) try { await assetsPromise; } catch {}
    else startAssetsLoad().catch(() => {});
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
          invalidateEnvCullCache?.();
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
    // GLBs extras entram em segundo plano depois que mapa e usuário já aparecem.
    startAssetsLoad().catch(() => {});
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
  plate.dataset.user = player.id;
  if (player.id !== myId) plate.classList.add("is-clickable");
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
  if (name === "walk") next.timeScale = speedCfg.walkAnim;
  else if (name === "run") next.timeScale = speedCfg.runAnim;
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
  if (onlineCount) onlineCount.textContent = `${players.length} online`;

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
    // Replica em tempo real interações (sit/lay/etc.) de jogadores remotos
    // para que TODOS vejam a mesma animação, não só quem disparou.
    if (player.id !== myId) {
      try { window.__applyRemoteSit?.(entity, player.sitting_id || null); } catch {}
    }
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
      if (object.userData?.__mixer) {
        try { assetMixers.delete(object.userData.__mixer); } catch {}
        object.userData.__mixer = null;
      }
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
          // Suporte a GLBs com animação embutida: cria mixer e toca todas em loop
          if (gltf.animations && gltf.animations.length) {
            try {
              const mixer = new THREE.AnimationMixer(object);
              for (const clip of gltf.animations) {
                const action = mixer.clipAction(clip);
                action.setLoop(THREE.LoopRepeat, Infinity);
                action.play();
              }
              object.userData.__mixer = mixer;
              assetMixers.add(mixer);
            } catch (e) { console.warn("[map asset anim]", e); }
          }
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
      <input type="number" class="asset-slider-value" data-asset-num="${field}" data-asset-id="${id}" min="${min}" max="${max}" step="${step}" value="${Number(value).toFixed(2)}" />
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
const CHAT_MSG_TTL_MS = 30 * 60 * 1000; // 30 minutos
function purgeOldChatMessages() {
  if (!chatLog) return;
  const cutoff = Date.now() - CHAT_MSG_TTL_MS;
  chatLog.querySelectorAll("[data-ts]").forEach((el) => {
    const ts = Number(el.getAttribute("data-ts")) || 0;
    if (ts && ts < cutoff) el.remove();
  });
}
setInterval(purgeOldChatMessages, 60_000);

function addSystemLine(text) {
  const item = document.createElement("div");
  item.className = "system-line";
  item.textContent = text;
  item.setAttribute("data-ts", String(Date.now()));
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
}
function addMessage(message) {
  const item = document.createElement("div");
  const isSelf = message.user_id && myId && message.user_id === myId;
  item.className = "chat-item" + (isSelf ? " is-self" : "");
  item.setAttribute("data-ts", String(Date.now()));
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
function applyJoystickMoveNormal(jx, jy, mag) {
  if (!me || !myId) return;
  const entity = playerEntities.get(myId);
  if (!entity) return;
  const camFwd = new THREE.Vector3().copy(entity.group.position).sub(camera.position);
  camFwd.y = 0;
  if (camFwd.lengthSq() < 1e-4) camFwd.set(0, 0, 1);
  camFwd.normalize();
  const camRight = new THREE.Vector3(-camFwd.z, 0, camFwd.x);
  const dir = new THREE.Vector3().addScaledVector(camFwd, jy).addScaledVector(camRight, jx);
  if (dir.lengthSq() < 1e-5) return;
  dir.normalize();
  // limiar: subir um pouco anda, subir bem corre
  const running = mag > 0.7;
  // alvo logo à frente — updatePlayerAnimation cuida de mover/animar
  entity.target.copy(entity.group.position).addScaledVector(dir, 1.2);
  entity.running = running;
  me.running = running;
  const pct = percentFromWorld(entity.target.x, entity.target.z);
  me.x = Math.max(5, Math.min(95, pct.x));
  me.y = Math.max(8, Math.min(92, pct.y));
  const facing = Math.abs(dir.x) > Math.abs(dir.z) ? (dir.x > 0 ? "right" : "left") : dir.z > 0 ? "down" : "up";
  me.facing = facing;
  const idx = players.findIndex((p) => p.id === myId);
  if (idx >= 0) players[idx] = { ...players[idx], ...me };
  const now = performance.now();
  if (now - lastMoveSent > 90) { lastMoveSent = now; trackMe(false).catch(() => {}); }
}

function applyHeldMovement(delta) {
  if (window.__drivingCar) return; // dirigindo carro: controles do veículo
  if (window.__ridingCar) return;  // de carona: posição controlada pelo carro
  if (window.__footballMode) return; // módulo de futebol controla o movimento
  if (window.__freeCameraMode) { applyFreeCameraMovement(); return; }
  // Joystick na tela (modo normal)
  const j = window.__joyState;
  const usingJoy = !!(j && j.active && Math.hypot(j.x, j.y) > 0.12);
  // Auto-levantar ao detectar qualquer input de movimento
  if (window.__sittingInteraction) {
    const hasKey = keyState.has("arrowup") || keyState.has("arrowdown") || keyState.has("arrowleft") || keyState.has("arrowright") || keyState.has("w") || keyState.has("a") || keyState.has("s") || keyState.has("d");
    if (hasKey || usingJoy) { try { window.standUpFromInteraction?.(); } catch {} }
    else return;
  }
  if (!me || !myId) return;
  const entity = playerEntities.get(myId);
  if (!entity) return;
  const dt = Math.min(0.05, delta || 1 / 60);

  // Salto físico (independente do movimento horizontal)
  if (entity.__jumpVy != null) {
    entity.__jumpVy -= 22 * dt;
    entity.group.position.y += entity.__jumpVy * dt;
    const gy0 = groundHeightAt(entity.group.position, entity.group.position.y);
    if (entity.group.position.y <= gy0 && entity.__jumpVy <= 0) {
      entity.group.position.y = gy0;
      entity.__jumpVy = null;
    }
  }

  // Direção de entrada (teclado WASD/setas tem prioridade; senão usa joystick)
  let ix = 0, iy = 0;
  if (keyState.has("arrowup") || keyState.has("w")) iy += 1;
  if (keyState.has("arrowdown") || keyState.has("s")) iy -= 1;
  if (keyState.has("arrowleft") || keyState.has("a")) ix -= 1;
  if (keyState.has("arrowright") || keyState.has("d")) ix += 1;
  let mag = Math.hypot(ix, iy);
  let running = keyState.has("shift");
  if (mag < 0.01 && usingJoy) {
    ix = j.x; iy = j.y; // joystick: joy.y já é positivo quando o knob vai pra cima
    mag = Math.min(1, Math.hypot(ix, iy));
    running = !!j.run; // só corre quando arrasta para fora do círculo
  }

  if (mag < 0.01) {
    entity.running = false;
    if (me) me.running = false;
    entity.target.copy(entity.group.position);
    entity.__moveDir = null;
    setPlayerAction(entity, "idle");
    return;
  }

  // Direção relativa à câmera (igual ao modo futebol — resposta imediata)
  const camFwd = new THREE.Vector3().copy(entity.group.position).sub(camera.position);
  camFwd.y = 0;
  if (camFwd.lengthSq() < 1e-4) camFwd.set(0, 0, 1);
  camFwd.normalize();
  const camRight = new THREE.Vector3(-camFwd.z, 0, camFwd.x);
  const dir = new THREE.Vector3()
    .addScaledVector(camFwd, iy)
    .addScaledVector(camRight, ix);
  if (dir.lengthSq() < 1e-5) return;
  dir.normalize();

  const speed = running ? speedCfg.runN : speedCfg.walkN;
  const step = speed * dt * (running ? 1 : Math.max(0.5, Math.min(1, mag)));
  const before = entity.group.position.clone();
  const cand = before.clone().addScaledVector(dir, step);
  if (!collidesAt(before, cand)) {
    entity.group.position.x = cand.x;
    entity.group.position.z = cand.z;
  }
  entity.group.rotation.y = Math.atan2(dir.x, dir.z);
  // Só auto-rotaciona a câmera para frente/laterais; ré (S) não vira a câmera
  // (evita flip de 180° quando o jogador anda de costas).
  entity.__moveDir = (iy >= -0.1) ? { x: dir.x, z: dir.z } : null;
  if (entity.__jumpVy == null) {
    const gy = groundHeightAt(entity.group.position, entity.group.position.y);
    entity.group.position.y += (gy - entity.group.position.y) * Math.min(1, dt * 12);
  }
  entity.target.copy(entity.group.position);
  entity.running = running;

  setPlayerAction(entity, running && entity.actions?.run ? "run" : "walk");

  if (me) {
    me.running = running;
    const pct = percentFromWorld(entity.group.position.x, entity.group.position.z);
    me.x = Math.max(5, Math.min(95, pct.x));
    me.y = Math.max(8, Math.min(92, pct.y));
    me.facing = Math.abs(dir.x) > Math.abs(dir.z)
      ? (dir.x > 0 ? "right" : "left")
      : (dir.z > 0 ? "down" : "up");
    const idx = players.findIndex((p) => p.id === myId);
    if (idx >= 0) players[idx] = { ...players[idx], ...me };
    const now = performance.now();
    if (now - lastMoveSent > 90) { lastMoveSent = now; trackMe(false).catch(() => {}); }
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
  const walkSpeed = speedCfg.walkN;
  const runSpeed = speedCfg.runN;
  for (const entity of playerEntities.values()) {
    // Modo futebol (jogador local): o módulo posiciona/anima; aqui só atualiza o mixer.
    if (entity.player?.id === myId && window.__footballMode) {
      if (entity.mixer) entity.mixer.update(delta);
      continue;
    }
    // Jogador local em modo normal: applyHeldMovement já posiciona/anima.
    // Aqui só atualizamos o mixer, aplicamos a tuning por animação, e seguimos.
    if (entity.player?.id === myId && !window.__drivingCar && !window.__sittingInteraction && !window.__freeCameraMode) {
      if (entity.mixer) entity.mixer.update(delta);
      applyLocalAnimTuning(entity, delta);
      if (entity.loadingFx) updateLoadingSmoke(entity, performance.now() / 1000);
      continue;
    }
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
    const isRemote = entity.player?.id !== myId;
    // Remoto sentado: trava na pose do assento e não roda a lógica de andar/idle.
    if (isRemote && entity.__remoteSit?.id) {
      if (entity.mixer) entity.mixer.update(delta);
      continue;
    }
    const culled = isRemote && entity.group.visible === false;
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
      // Para jogadores remotos não rodamos collidesAt (raycast caro); confiamos no broadcast.
      const blocked = isRemote ? false : collidesAt(before, candidate);
      if (blocked) {
        entity.target.x = before.x;
        entity.target.z = before.z;
        setPlayerAction(entity, "idle");
      } else {
        entity.group.position.x = candidate.x;
        entity.group.position.z = candidate.z;
        // Follow terrain: stairs, ramps, raised floors. Pula raycast quando culled.
        if (!culled) {
          const groundY = groundHeightAt(entity.group.position, entity.group.position.y);
          entity.group.position.y += (groundY - entity.group.position.y) * Math.min(1, delta * 12);
        }
        const moved = entity.group.position.clone().sub(before);
        if (Math.abs(moved.x) + Math.abs(moved.z) > 0.00001) {
          entity.group.rotation.y = Math.atan2(moved.x, moved.z);
        }
        setPlayerAction(entity, running && entity.actions?.run ? "run" : "walk");
      }
    } else {
      entity.group.position.x = entity.target.x;
      entity.group.position.z = entity.target.z;
      // Mantém Y do terreno mesmo parado (pula se invisível)
      if (!culled) {
        const groundY = groundHeightAt(entity.group.position, entity.group.position.y);
        entity.group.position.y += (groundY - entity.group.position.y) * Math.min(1, delta * 12);
      }
      entity.running = false;
      if (entity.player?.id === myId && me) me.running = false;
      setPlayerAction(entity, "idle");
    }
    // Mixer também é caro: se culled, atualiza só a cada ~3 frames.
    if (entity.mixer) {
      if (culled) {
        entity._mixerAccum = (entity._mixerAccum || 0) + delta;
        if (entity._mixerAccum > 0.1) { entity.mixer.update(entity._mixerAccum); entity._mixerAccum = 0; }
      } else {
        entity.mixer.update(delta);
      }
    }
    // Aplica também aos jogadores remotos para que vejam as mesmas poses configuradas no admin.
    if (!culled) applyLocalAnimTuning(entity, delta);
    if (entity.loadingFx && !culled) updateLoadingSmoke(entity, performance.now() / 1000);
  }
}


function updateNameplates() {
  const rect = renderer.domElement.getBoundingClientRect();
  const projected = new THREE.Vector3();
  const hidden = window.__hiddenDrivers;
  for (const [id, entity] of playerEntities) {
    if (hidden && hidden.has(id)) {
      entity.plate.style.opacity = "0";
      if (entity.loadingSpinner) entity.loadingSpinner.style.opacity = "0";
      continue;
    }
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
// ============ Distance-based render culling (LOD) ============
// Carrega/renderiza apenas o que está perto do jogador para aliviar o desempenho.
const RENDER_DISTANCE_KEY = "neon-render-distance";
const RENDER_DISTANCE_VERSION_KEY = "neon-render-distance-version";
const RENDER_DISTANCE_CONFIG_VERSION = "3";
const RENDER_DISTANCE_DEFAULT = 260;
const RENDER_DISTANCE_MIN = 40;
const RENDER_DISTANCE_MAX = 800;
function readInitialRenderDistance() {
  let stored = NaN;
  let shouldUpgrade = true;
  try {
    stored = parseFloat(localStorage.getItem(RENDER_DISTANCE_KEY) || "");
    shouldUpgrade = localStorage.getItem(RENDER_DISTANCE_VERSION_KEY) !== RENDER_DISTANCE_CONFIG_VERSION;
  } catch {}
  let value = Number.isFinite(stored) ? stored : RENDER_DISTANCE_DEFAULT;
  if (shouldUpgrade && value < RENDER_DISTANCE_DEFAULT) value = RENDER_DISTANCE_DEFAULT;
  value = Math.max(RENDER_DISTANCE_MIN, Math.min(RENDER_DISTANCE_MAX, value));
  try {
    localStorage.setItem(RENDER_DISTANCE_KEY, String(value));
    localStorage.setItem(RENDER_DISTANCE_VERSION_KEY, RENDER_DISTANCE_CONFIG_VERSION);
  } catch {}
  return value;
}
let RENDER_DISTANCE = readInitialRenderDistance();
let RENDER_DISTANCE_SQ = RENDER_DISTANCE * RENDER_DISTANCE;
window.RENDER_DISTANCE = RENDER_DISTANCE;
window.setRenderDistance = function (d) {
  RENDER_DISTANCE = Math.max(RENDER_DISTANCE_MIN, Math.min(RENDER_DISTANCE_MAX, +d || RENDER_DISTANCE_DEFAULT));
  RENDER_DISTANCE_SQ = RENDER_DISTANCE * RENDER_DISTANCE;
  window.RENDER_DISTANCE = RENDER_DISTANCE;
  localStorage.setItem(RENDER_DISTANCE_KEY, String(RENDER_DISTANCE));
  localStorage.setItem(RENDER_DISTANCE_VERSION_KEY, RENDER_DISTANCE_CONFIG_VERSION);
};
const _lodRef = new THREE.Vector3();
const _lodTmp = new THREE.Vector3();
const _lodLastRef = new THREE.Vector3(Infinity, Infinity, Infinity);
let _lodLastDistance = -1;
let _lodAccum = 0;
let _envCullCache = null; // [{node, cx,cy,cz, r}]
let _envCullDirty = true;
function invalidateEnvCullCache() { _envCullDirty = true; }
window.invalidateEnvCullCache = invalidateEnvCullCache;
function _rebuildEnvCullCache() {
  envGroup.updateMatrixWorld(true);
  const list = [];
  envGroup.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    if (node === envBaseFloor) return;
    if (!node.geometry.boundingSphere) node.geometry.computeBoundingSphere();
    const bs = node.geometry.boundingSphere;
    if (!bs) return;
    _lodTmp.copy(bs.center).applyMatrix4(node.matrixWorld);
    const s = node.matrixWorld.getMaxScaleOnAxis ? node.matrixWorld.getMaxScaleOnAxis() : 1;
    list.push({ node, cx: _lodTmp.x, cy: _lodTmp.y, cz: _lodTmp.z, r: bs.radius * s });
  });
  _envCullCache = list;
  _envCullDirty = false;
}
function _lodCullChildren(group) {
  if (!group || !group.children) return;
  for (const child of group.children) {
    child.getWorldPosition(_lodTmp);
    child.visible = _lodTmp.distanceToSquared(_lodRef) < RENDER_DISTANCE_SQ;
  }
}
function updateRenderDistanceCulling(force = false) {
  const ent = myId ? playerEntities.get(myId) : null;
  if (ent) _lodRef.copy(ent.group.position);
  else _lodRef.copy(controls.target);

  // Pula se o player não se moveu o suficiente e a distância não mudou.
  const moved = _lodRef.distanceToSquared(_lodLastRef);
  if (!force && !_envCullDirty && moved < 1.0 && _lodLastDistance === RENDER_DISTANCE) return;
  _lodLastRef.copy(_lodRef);
  _lodLastDistance = RENDER_DISTANCE;

  // Outros jogadores (esconde quem está dirigindo um carro)
  const hidden = window.__hiddenDrivers;
  for (const [id, e] of playerEntities) {
    if (hidden && hidden.has(id)) { e.group.visible = false; continue; }
    if (id === myId) { e.group.visible = true; continue; }
    e.group.getWorldPosition(_lodTmp);
    e.group.visible = _lodTmp.distanceToSquared(_lodRef) < RENDER_DISTANCE_SQ;
  }
  // Bots / luzes customizadas / carros
  _lodCullChildren(botsGroup);
  _lodCullChildren(customLightsGroup);
  const carsRoot = scene.getObjectByName("CarsRoot");
  if (carsRoot) _lodCullChildren(carsRoot);

  // Malhas do mapa via cache (estático): só compara distância ao quadrado.
  if (_envCullDirty || !_envCullCache) _rebuildEnvCullCache();
  const cache = _envCullCache;
  const rx = _lodRef.x, ry = _lodRef.y, rz = _lodRef.z;
  for (let i = 0; i < cache.length; i++) {
    const m = cache[i];
    const dx = m.cx - rx, dy = m.cy - ry, dz = m.cz - rz;
    const lim = RENDER_DISTANCE + m.r;
    m.node.visible = (dx*dx + dy*dy + dz*dz) < (lim * lim);
  }
  if (envBaseFloor) envBaseFloor.visible = true;
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  // Hook do modo futebol: dirige movimento/bola/câmera quando ativo.
  if (window.__footballFrame) { try { window.__footballFrame(delta); } catch (e) { console.warn("[football] frame", e); } }
  if (window.__carsFrame) { try { window.__carsFrame(delta); } catch (e) { console.warn("[cars] frame", e); } }
  applyHeldMovement(delta);
  updatePlayerAnimation(delta);
  if (assetMixers.size) { for (const m of assetMixers) { try { m.update(delta); } catch {} } }
  if (myId && !window.__freeCameraMode && !window.__footballMode && !window.__drivingCar) {
    const entity = playerEntities.get(myId);
    if (entity) {
      const desired = new THREE.Vector3(entity.group.position.x, entity.group.position.y + 0.85, entity.group.position.z);
      const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
      controls.target.lerp(desired, delta * 4.0);
      // Auto-orbit: enquanto se move, gira a câmera para ficar atrás do personagem.
      const mv = entity.__moveDir;
      if (mv && !window.__camUserDragging && performance.now() > (window.__camUserHoldUntil || 0)) {
        const r = Math.hypot(offset.x, offset.z);
        if (r > 0.001) {
          const curYaw = Math.atan2(offset.x, offset.z);
          const wantYaw = Math.atan2(-mv.x, -mv.z);
          let d = wantYaw - curYaw;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const k = Math.min(1, delta * 1.5);
          const newYaw = curYaw + d * k;
          offset.x = Math.sin(newYaw) * r;
          offset.z = Math.cos(newYaw) * r;
        }
      }
      camera.position.copy(controls.target).add(offset);
    }
  }
  if (window.__focusLerp) {
    const f = window.__focusLerp;
    controls.target.lerp(f.target, Math.min(1, delta * 5));
    camera.position.lerp(f.camera, Math.min(1, delta * 5));
    if (controls.target.distanceTo(f.target) < 0.05) window.__focusLerp = null;
  }
  if (window.__footballMode) {
    // Câmera 3ª pessoa controlada pelo módulo de futebol.
    if (window.__footballCamera) { try { window.__footballCamera(delta); } catch {} }
  } else {
    clampCameraToCeiling();
    controls.update();
    updateCameraOcclusion();
  }
  _lodAccum += delta;
  if (_lodAccum >= 0.2) { _lodAccum = 0; updateRenderDistanceCulling(); }
  renderer.render(scene, camera);
  updateNameplates();
}


// ============ Event wiring ============
window.addEventListener("resize", resize);

// Teclado mobile: mantém o jogo ancorado e sobe APENAS o chat usando --kb-offset.
// O visualViewport encolhe quando o teclado aparece (iOS Safari, Chrome Android).
(function setupKeyboardOffset() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  function update() {
    // Distância entre o fundo do layout viewport e o fundo do visual viewport
    const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    root.style.setProperty("--kb-offset", offset + "px");
  }
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();
})();

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea")) return;
  if (!event.key) return;
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "shift"].includes(key)
      || (window.__freeCameraMode && (key === "q" || key === "e"))) {
    event.preventDefault();
    keyState.add(key);
    return;
  }
  if (key === " " || key === "spacebar") {
    event.preventDefault();
    // Pulo (modo normal apenas)
    if (!window.__footballMode && !window.__drivingCar && !window.__sittingInteraction && !window.__freeCameraMode && myId) {
      const ent = playerEntities.get(myId);
      if (ent && ent.__jumpVy == null) ent.__jumpVy = 7.2;
    }
    return;
  }
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
  // Primeiro: tenta detectar clique no avatar (GLB) de outro jogador
  const peerHit = pickPeerAvatar(event);
  if (peerHit) {
    if (window.__playerPopup?.open) {
      // âncora "fake" na posição do clique
      const fakeAnchor = { getBoundingClientRect: () => ({ left: event.clientX, top: event.clientY, width: 0, height: 0, right: event.clientX, bottom: event.clientY }) };
      window.__playerPopup.open(peerHit, fakeAnchor);
    }
    return;
  }
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

function pickPeerAvatar(event) {
  if (!playerEntities || playerEntities.size === 0) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const groups = [];
  for (const [pid, ent] of playerEntities) {
    if (pid === myId) continue;
    if (ent?.group && ent.group.visible !== false) groups.push({ pid, group: ent.group });
  }
  if (!groups.length) return null;
  const hits = raycaster.intersectObjects(groups.map((g) => g.group), true);
  if (!hits.length) return null;
  // sobe na hierarquia até bater num group de peer conhecido
  for (const h of hits) {
    let o = h.object;
    while (o) {
      const m = groups.find((g) => g.group === o);
      if (m) return m.pid;
      o = o.parent;
    }
  }
  return null;
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
  const input = event.target.closest("input[data-asset-field], input[data-asset-num]");
  if (!input || !isAdmin) return;
  const asset = currentAssets.find((item) => item.id === input.dataset.assetId);
  if (!asset) return;
  const field = input.dataset.assetField || input.dataset.assetNum;
  let value = parseFloat(input.value);
  if (Number.isNaN(value)) return;
  const patch = {};
  if (field === "rotationX" || field === "rotationY" || field === "rotationZ") {
    patch[field] = (value * Math.PI) / 180;
  } else {
    patch[field] = value;
  }
  // Mantém os dois controles (barra + número) em sincronia
  const wrap = input.parentElement;
  const range = wrap?.querySelector("input[type=range]");
  const num = wrap?.querySelector("input[type=number]");
  if (input === range && num && document.activeElement !== num) num.value = value.toFixed(2);
  if (input === num && range) range.value = value;
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
  const hiddenSet = new Set();
  const customs = [];
  for (const m of data || []) {
    if (m.hidden) hiddenSet.add(m.slug);
    if (builtinSlugs.has(m.slug)) {
      overrides.set(m.slug, {
        id: m.slug, name: m.name, url: m.url, mood: m.mood || "day",
        bg: m.bg || "#0e1117", thumb: m.thumb || "🗺️",
      });
    } else {
      customs.push({
        id: m.slug, name: m.name, url: m.url, mood: m.mood || "day",
        bg: m.bg || "#0e1117", thumb: m.thumb || "🗺️", custom: true,
      });
    }
  }
  const merged = BUILTIN_MAPS.map((b) => {
    const ov = overrides.get(b.id);
    if (!ov) return { ...b };
    return { ...b, ...ov, url: ov.url || b.url, overridden: true };
  });
  MAPS = [...merged, ...customs].map((m) => ({
    ...m,
    thumbUrl: thumbMap.get(m.id) || null,
    hidden: hiddenSet.has(m.id),
  }));
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
        <label style="display:flex;align-items:center;gap:8px;background:#171b22;border:1px solid #2a2f3a;border-radius:8px;padding:8px 10px;cursor:pointer;">
          <input id="meHidden" type="checkbox" ${m.hidden ? "checked" : ""} style="width:16px;height:16px;cursor:pointer;">
          <span><strong style="color:#e4a8ff;">🔒 Ocultar do painel de salas</strong><br><span style="font-size:11px;color:#9aa;">O mapa só fica acessível por portais.</span></span>
        </label>
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
      const hiddenVal = !!modal.querySelector("#meHidden")?.checked;
      const patch = { name, thumb, mood, bg, hidden: hiddenVal };
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
      <span style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <span>${label}</span>
        <input type="number" class="num-edit" data-numkey="${key}" min="${min}" max="${max}" step="${step}" value="${Number(val)}">
      </span>
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
        const numEl = card.querySelector(`input[data-numkey="${key}"]`);
        if (numEl && document.activeElement !== numEl) numEl.value = inp.value;
        scheduleLightSave(id, { [key]: num });
      });
    });
    card.querySelectorAll("input[data-numkey]").forEach((numEl) => {
      numEl.addEventListener("input", () => {
        const key = numEl.dataset.numkey;
        const num = parseFloat(numEl.value);
        if (Number.isNaN(num)) return;
        const range = card.querySelector(`input[type=range][data-key="${key}"]`);
        if (range) range.value = num;
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
window.__mapBots = new Map(); // id -> row (lightweight, for admin UI)
let botAnimations = []; // [{id, name, url}]
let botTemplates = []; // [{id, name, glb_url, default_scale, default_animation_url}]
window.__botTemplates = botTemplates;

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

function botCharacterFromRow(row) {
  // Prioridade: glb_url salvo na instância > template > character_slug legado
  if (row.glb_url) {
    return {
      slug: `__bot_glb:${row.glb_url}`,
      name: row.name || "Bot",
      base_url: row.glb_url,
      isBotTemplate: true,
    };
  }
  if (row.template_id) {
    const tpl = (botTemplates || []).find(t => t.id === row.template_id);
    if (tpl) {
      return {
        slug: `__bot_tpl:${tpl.id}`,
        name: tpl.name,
        base_url: tpl.glb_url,
        isBotTemplate: true,
      };
    }
  }
  return findCharacterBySlug(row.character_slug);
}

async function buildBotEntity(row) {
  const character = botCharacterFromRow(row);
  if (!character) { console.warn("[bot] sem fonte de modelo:", row); return null; }
  const { base, clips } = await loadCharacterAssets(character);
  const cloned = cloneSkeleton(base);
  cloned.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
  });
  const group = new THREE.Group();
  group.add(cloned);
  const mixer = new THREE.AnimationMixer(cloned);
  return { row, group, character: cloned, mixer, action: null, animationUrl: null, characterSlug: character.slug, clips };
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
    const retarg = retargetClipToBones(clip, bones, { stripRootPosition: true });
    if (!retarg) { console.warn("[bot] nenhum osso da animação casou com", entity.characterSlug); return; }
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

function _botSourceKey(row) {
  return row.glb_url || (row.template_id ? `tpl:${row.template_id}` : `char:${row.character_slug || ""}`);
}

async function upsertBot(row) {
  let entity = botEntities.get(row.id);
  if (entity && entity._sourceKey !== _botSourceKey(row)) {
    // mudou de fonte de modelo — rebuild
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
    entity._sourceKey = _botSourceKey(row);
    botEntities.set(row.id, entity);
    botsGroup.add(entity.group);
  }
  entity.row = row;
  applyBotTransform(entity, row);
  await applyBotAnimation(entity, row.animation_url || null);
  try { window.__mapBots.set(row.id, row); } catch {}
}


function removeBot(id) {
  const e = botEntities.get(id);
  if (!e) return;
  botsGroup.remove(e.group);
  e.mixer?.stopAllAction?.();
  botEntities.delete(id);
  try { window.__mapBots.delete(id); } catch {}
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
  window.__botAnimations = botAnimations;
  window.dispatchEvent(new CustomEvent("bot-animations:updated"));
  renderBotAnimList();
  renderBotsAdminList();
}

async function reloadBotTemplates() {
  const { data, error } = await supabase.from("bot_templates").select("*").order("created_at", { ascending: false });
  if (error) { console.warn("bot_templates load", error); return; }
  botTemplates = data || [];
  window.__botTemplates = botTemplates;
  renderBotTemplatesList();
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
supabase.channel("bot-templates")
  .on("postgres_changes", { event: "*", schema: "public", table: "bot_templates" }, () => reloadBotTemplates())
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

// initial load (templates podem existir mesmo sem characters)
async function _initBots() {
  // espera no máximo 9s pelo charactersCatalog, mas não bloqueia se vazio (bots agora podem usar templates próprios)
  for (let i = 0; i < 30 && !charactersCatalog.length; i++) await new Promise(r => setTimeout(r, 300));
  await Promise.all([reloadBotAnimations(), reloadBotTemplates()]);
  await reloadMapBots(currentMapId);
}
_initBots();


// ---------- Bot CRUD UI ----------
async function createBot() {
  if (!isAdmin) return alert("Apenas admin.");
  // Prioriza templates (GLB próprios); cai pra catálogo de characters como fallback
  const tpl = botTemplates[0];
  const character = !tpl ? charactersCatalog[0] : null;
  if (!tpl && !character) return alert("Suba um GLB em 'Templates de Bot' (ou cadastre um personagem) antes.");
  const c = controls.target;
  const payload = {
    map_id: currentMapId,
    name: tpl ? tpl.name : "Bot",
    x: c.x, y: 0, z: c.z,
    rotation_y: 0,
    scale: tpl ? (tpl.default_scale || 1) : 1,
    created_by: myId,
  };
  if (tpl) {
    // snapshot da config — instância fica independente do template
    payload.template_id = tpl.id;
    payload.glb_url = tpl.glb_url;
    payload.animation_url = tpl.default_animation_url || null;
    payload.character_slug = null;
  } else {
    payload.character_slug = character.slug;
  }
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
      <span style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <span>${label}</span>
        <input type="number" class="num-edit" data-numkey="${key}" min="${min}" max="${max}" step="${step}" value="${Number(val)}">
      </span>
      <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${val}" style="width:100%">
    </label>`;
  const tplOpts = `<option value="">— Personagem do catálogo —</option>` +
    (botTemplates || []).map(t =>
      `<option value="${t.id}" ${t.id === row.template_id ? "selected" : ""}>${escapeHtml(t.name)}</option>`
    ).join("");
  const charOpts = `<option value="">—</option>` + charactersCatalog.map(c =>
    `<option value="${escapeHtml(c.slug)}" ${c.slug === row.character_slug ? "selected" : ""}>${escapeHtml(c.name)}</option>`
  ).join("");
  const animOpts = `<option value="">— Idle embutido —</option>` +
    botAnimations.map(a => `<option value="${escapeHtml(a.url)}" ${a.url === row.animation_url ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("");
  const usingTpl = !!row.template_id || !!row.glb_url;
  return `
    <div data-bot-id="${row.id}" style="border:1px solid #2a3040;border-radius:6px;padding:8px;background:rgba(255,255,255,0.03);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;">
        <input data-key="name" type="text" value="${escapeHtml(row.name || "Bot")}" maxlength="30" style="flex:1;background:#1a1f2a;color:#fff;border:1px solid #333;border-radius:4px;padding:3px 6px;font-size:12px;font-weight:600;">
        <button data-action="focus" type="button" title="Centralizar câmera" style="background:#333;color:#fff;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;">🎯</button>
        <button data-action="del" type="button" style="background:#5a1f1f;color:#fff;border:none;border-radius:4px;padding:2px 6px;cursor:pointer;">✕</button>
      </div>
      <label style="display:block;margin:2px 0;font-size:11px;">Template de bot
        <select data-action="set-template" style="width:100%;background:#1a1f2a;color:#fff;border:1px solid #333;border-radius:4px;padding:3px;">${tplOpts}</select>
      </label>
      ${usingTpl ? "" : `
      <label style="display:block;margin:2px 0;font-size:11px;">Personagem (legado)
        <select data-key="character_slug" style="width:100%;background:#1a1f2a;color:#fff;border:1px solid #333;border-radius:4px;padding:3px;">${charOpts}</select>
      </label>`}
      <label style="display:block;margin:2px 0;font-size:11px;">Animação
        <select data-key="animation_url" style="width:100%;background:#1a1f2a;color:#fff;border:1px solid #333;border-radius:4px;padding:3px;">${animOpts}</select>
      </label>
      ${slider("Pos X", "x", -30, 30, 0.1, row.x ?? 0)}
      ${slider("Pos Y", "y", -2, 10, 0.05, row.y ?? 0)}
      ${slider("Pos Z", "z", -30, 30, 0.1, row.z ?? 0)}
      ${slider("Rotação Y", "rotation_y", -3.14159, 3.14159, 0.05, row.rotation_y ?? 0)}
      ${slider("Escala", "scale", 0.1, 200, 0.05, row.scale ?? 1)}
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
        const numEl = card.querySelector(`input[data-numkey="${k}"]`);
        if (numEl && document.activeElement !== numEl) numEl.value = inp.value;
        scheduleBotSave(id, { [k]: v });
      });
    });
    card.querySelectorAll("input[data-numkey]").forEach(numEl => {
      numEl.addEventListener("input", () => {
        const k = numEl.dataset.numkey; const v = parseFloat(numEl.value);
        if (Number.isNaN(v)) return;
        const range = card.querySelector(`input[type=range][data-key="${k}"]`);
        if (range) range.value = v;
        scheduleBotSave(id, { [k]: v });
      });
    });
    card.querySelectorAll("select[data-key]").forEach(sel => {
      sel.addEventListener("change", () => scheduleBotSave(id, { [sel.dataset.key]: sel.value || null }));
    });
    const tplSel = card.querySelector('select[data-action="set-template"]');
    tplSel?.addEventListener("change", async () => {
      const tplId = tplSel.value || null;
      if (!tplId) {
        // volta pro modo "personagem" — limpa snapshot do template
        await supabase.from("map_bots").update({ template_id: null, glb_url: null }).eq("id", id);
        return;
      }
      const tpl = botTemplates.find(t => t.id === tplId);
      if (!tpl) return;
      // snapshot do template -> instância (continua independente depois)
      const patch = {
        template_id: tpl.id,
        glb_url: tpl.glb_url,
        character_slug: null,
      };
      // só preenche se o usuário ainda não customizou
      const cur = botEntities.get(id)?.row || {};
      if (!cur.animation_url && tpl.default_animation_url) patch.animation_url = tpl.default_animation_url;
      const { error } = await supabase.from("map_bots").update(patch).eq("id", id);
      if (error) alert("Erro: " + error.message);
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
  if (!isAdmin) { alert("Apenas admin."); return null; }
  const status = document.getElementById("botAnimStatus");
  if (status) status.textContent = "Subindo " + file.name + "...";
  const path = `bot-anims/${Date.now()}-${sanitize(file.name)}`;
  const { error } = await supabase.storage.from("map-assets").upload(path, file, { contentType: "application/octet-stream", upsert: false });
  if (error) { if (status) status.textContent = "Erro: " + error.message; return null; }
  const { data } = supabase.storage.from("map-assets").getPublicUrl(path);
  const animName = name || file.name.replace(/\.fbx$/i, "");
  const { data: row, error: e2 } = await supabase.from("bot_animations").insert({ name: animName, url: data.publicUrl, created_by: myId }).select().single();
  if (e2) { if (status) status.textContent = "Erro: " + e2.message; return null; }
  if (status) status.textContent = "OK!"; setTimeout(() => { if (status) status.textContent = ""; }, 1500);
  await reloadBotAnimations();
  return row || { name: animName, url: data.publicUrl };
}
window.uploadBotAnimation = uploadBotAnimation;

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

// ---------- Bot Templates UI (catálogo reutilizável de GLBs) ----------
async function uploadBotTemplate(file, name) {
  if (!isAdmin) { alert("Apenas admin."); return null; }
  const status = document.getElementById("botTplStatus");
  if (status) status.textContent = "Subindo " + file.name + "...";
  const path = `bot-templates/${Date.now()}-${sanitize(file.name)}`;
  const { error } = await supabase.storage.from("map-assets").upload(path, file, { contentType: "model/gltf-binary", upsert: false });
  if (error) { if (status) status.textContent = "Erro: " + error.message; return null; }
  const { data } = supabase.storage.from("map-assets").getPublicUrl(path);
  const tplName = name || file.name.replace(/\.(glb|gltf)$/i, "");
  const { data: row, error: e2 } = await supabase.from("bot_templates").insert({
    name: tplName, glb_url: data.publicUrl, created_by: myId,
  }).select().single();
  if (e2) { if (status) status.textContent = "Erro: " + e2.message; return null; }
  if (status) status.textContent = "OK!"; setTimeout(() => { if (status) status.textContent = ""; }, 1500);
  await reloadBotTemplates();
  return row;
}
window.uploadBotTemplate = uploadBotTemplate;

function renderBotTemplatesList() {
  const el = document.getElementById("botTplList");
  if (!el) return;
  if (!botTemplates.length) {
    el.innerHTML = `<div style="color:#7a8290;font-size:11px;text-align:center;">Sem templates. Suba um GLB acima.</div>`;
    return;
  }
  el.innerHTML = botTemplates.map(t => `
    <div data-tpl-id="${t.id}" style="display:flex;flex-direction:column;gap:4px;padding:6px;background:rgba(255,255,255,0.04);border-radius:4px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <input data-key="name" type="text" value="${escapeHtml(t.name)}" maxlength="40" style="flex:1;background:#1a1f2a;color:#fff;border:1px solid #333;border-radius:4px;padding:3px 6px;font-size:11px;font-weight:600;">
        <button data-act="del" type="button" style="background:#5a1f1f;color:#fff;border:none;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer;">✕</button>
      </div>
      <label style="font-size:10px;color:#9aa;">Escala padrão
        <input data-key="default_scale" type="number" min="0.1" max="10" step="0.05" value="${t.default_scale ?? 1}" style="width:100%;background:#1a1f2a;color:#fff;border:1px solid #333;border-radius:4px;padding:3px;">
      </label>
      <label style="font-size:10px;color:#9aa;">Animação padrão
        <select data-key="default_animation_url" style="width:100%;background:#1a1f2a;color:#fff;border:1px solid #333;border-radius:4px;padding:3px;">
          <option value="">— Idle embutido —</option>
          ${botAnimations.map(a => `<option value="${escapeHtml(a.url)}" ${a.url === t.default_animation_url ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("")}
        </select>
      </label>
    </div>`).join("");
  el.querySelectorAll("[data-tpl-id]").forEach(card => {
    const id = card.dataset.tplId;
    card.querySelectorAll("[data-key]").forEach(inp => {
      inp.addEventListener("change", async () => {
        const k = inp.dataset.key;
        const v = inp.type === "number" ? parseFloat(inp.value) : (inp.value || null);
        const { error } = await supabase.from("bot_templates").update({ [k]: v }).eq("id", id);
        if (error) alert(error.message);
      });
    });
    card.querySelector('[data-act="del"]')?.addEventListener("click", async () => {
      if (!confirm("Apagar template? Bots já criados a partir dele continuam funcionando (a config foi snapshot).")) return;
      const { error } = await supabase.from("bot_templates").delete().eq("id", id);
      if (error) return alert(error.message);
      await reloadBotTemplates();
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
document.getElementById("botTplFile")?.addEventListener("change", (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  const nameInp = document.getElementById("botTplName");
  uploadBotTemplate(f, nameInp?.value?.trim());
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
  makePanel(document.getElementById("animAdminPanel"));

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
  // Cars panel
  makePanel(document.getElementById("carsAdminPanel"));
  // Speed panel
  makePanel(document.getElementById("speedAdminPanel"));

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
    const goToBtn = $("profileGoToBtn");
    if (goToBtn) goToBtn.hidden = isMe;
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

    // ===== Amigos =====
    await renderFriendsSection(userId, isMe);
  }

  async function renderFriendsSection(userId, isMe) {
    const friendsList = $("profileFriendsList");
    const friendsCount = $("profileFriendsCount");
    const requestsSection = $("profileRequestsSection");
    const requestsList = $("profileRequestsList");
    const requestsCount = $("profileRequestsCount");
    if (!friendsList) return;

    // Pedidos pendentes recebidos (apenas no próprio perfil)
    if (isMe && myId) {
      const { data: reqs } = await supabase
        .from("friend_requests")
        .select("id,from_user,created_at")
        .eq("to_user", myId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      const pending = reqs || [];
      if (pending.length === 0) {
        requestsSection.hidden = true;
      } else {
        requestsSection.hidden = false;
        requestsCount.textContent = pending.length;
        const ids = pending.map((r) => r.from_user);
        const { data: profs } = await supabase.from("profiles").select("id,nickname,avatar_url").in("id", ids);
        const pm = new Map((profs || []).map((p) => [p.id, p]));
        requestsList.innerHTML = pending.map((r) => {
          const p = pm.get(r.from_user) || {};
          const av = p.avatar_url || `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><rect fill='%232a2750' width='100%25' height='100%25'/></svg>`;
          const nm = (p.nickname || "Usuário").replace(/</g, "&lt;");
          return `
            <div class="ig-req-item" data-uid="${r.from_user}">
              <img src="${av}" alt="" class="ig-req-avatar" data-act="open-profile" data-uid="${r.from_user}">
              <div class="ig-req-name" data-act="open-profile" data-uid="${r.from_user}">${nm}</div>
              <button class="ig-btn ig-btn-primary" data-act="accept" data-req="${r.id}">Aceitar</button>
              <button class="ig-btn" data-act="reject" data-req="${r.id}">Recusar</button>
            </div>`;
        }).join("");
      }
    } else {
      requestsSection.hidden = true;
    }

    // Lista de amigos (aceitos) — para qualquer perfil
    const { data: accepted } = await supabase
      .from("friend_requests")
      .select("from_user,to_user")
      .or(`from_user.eq.${userId},to_user.eq.${userId}`)
      .eq("status", "accepted");
    const friendIds = (accepted || []).map((r) => (r.from_user === userId ? r.to_user : r.from_user));
    friendsCount.textContent = friendIds.length;
    if (friendIds.length === 0) {
      friendsList.innerHTML = `<p style="color:var(--muted);font-size:0.85rem;padding:8px 4px;">Sem amigos ainda.</p>`;
      return;
    }
    const { data: profs } = await supabase.from("profiles").select("id,nickname,avatar_url").in("id", friendIds);
    friendsList.innerHTML = (profs || []).map((p) => {
      const av = p.avatar_url || `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect fill='%232a2750' width='100%25' height='100%25'/></svg>`;
      const nm = (p.nickname || "Usuário").replace(/</g, "&lt;");
      return `
        <div class="ig-friend-item" data-uid="${p.id}">
          <img src="${av}" alt="" class="ig-friend-avatar" data-act="open-profile" data-uid="${p.id}">
          <div class="ig-friend-name">${nm}</div>
          <div class="ig-friend-actions">
            <button class="ig-mini-btn" title="Ver perfil" data-act="open-profile" data-uid="${p.id}">👤</button>
            <button class="ig-mini-btn" title="Mandar DM" data-act="dm" data-uid="${p.id}">💬</button>
          </div>
        </div>`;
    }).join("");
  }

  // Delega cliques nas seções de amigos e pedidos
  document.getElementById("profileFriendsList")?.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const uid = el.dataset.uid;
    const act = el.dataset.act;
    if (act === "open-profile" && uid) openProfile(uid);
    else if (act === "dm" && uid) openDm(uid);
  });
  document.getElementById("profileRequestsList")?.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    if (act === "open-profile" && el.dataset.uid) { openProfile(el.dataset.uid); return; }
    const reqId = el.dataset.req;
    if (!reqId) return;
    el.disabled = true;
    if (act === "accept") {
      await supabase.from("friend_requests").update({ status: "accepted" }).eq("id", reqId);
    } else if (act === "reject") {
      await supabase.from("friend_requests").update({ status: "rejected" }).eq("id", reqId);
    }
    if (currentProfileId) openProfile(currentProfileId);
  });

  // Abrir DM por evento externo (popup do jogador)
  window.addEventListener("open-dm", (e) => {
    const uid = e?.detail;
    if (uid) { overlay.hidden = true; openDm(uid); }
  });


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
  $("profileGoToBtn")?.addEventListener("click", (ev) => {
    const peerId = currentProfileId;
    if (!peerId || peerId === myId) return;
    const anchor = ev.currentTarget;
    const name = $("profileName")?.textContent || "Usuário";
    // fecha o modal de perfil e dispara o fluxo de "ir até" reaproveitando a mini-popup
    document.getElementById("profileOverlay").hidden = true;
    if (window.__playerPopup?.goToLocation) {
      window.__playerPopup.goToLocation(peerId, name, anchor);
    }
  });

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

  const RADIO_DEFAULT_VOLUME = 0.20; // 20% real (= slider 100 quando MAX = 0.20)
  const RADIO_MAX_VOLUME = 0.20; // cap absoluto: 20% do volume real
  const RADIO_VOLUME_REDUCED_KEY = "radio.volume.default20.20260606";
  // Slider 0-100 -> volume real (0 .. RADIO_MAX_VOLUME), curva quadrática para resolução nos graves.
  const sliderToVol = (s) => {
    const x = Math.min(1, Math.max(0, (Number(s) || 0) / 100));
    return x * x * RADIO_MAX_VOLUME;
  };
  const volToSlider = (v) => {
    const x = Math.min(1, Math.max(0, (Number(v) || 0) / RADIO_MAX_VOLUME));
    return Math.round(Math.sqrt(x) * 100);
  };

  // ---- WebAudio gain (iOS/Safari ignora audio.volume em <audio> remoto) ----
  // O gainNode é ligado entre o <audio> e o destino. Algumas URLs com CORS
  // restrito podem falhar — nesse caso caímos no audio.volume nativo.
  let _audioCtx = null, _gainNode = null, _webAudioFailed = false;
  function ensureWebAudio() {
    if (_gainNode || _webAudioFailed) return _gainNode;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { _webAudioFailed = true; return null; }
      _audioCtx = new Ctx();
      const src = _audioCtx.createMediaElementSource(audio);
      _gainNode = _audioCtx.createGain();
      src.connect(_gainNode);
      _gainNode.connect(_audioCtx.destination);
    } catch (e) {
      console.warn("[radio webaudio]", e);
      _webAudioFailed = true;
      _gainNode = null;
    }
    return _gainNode;
  }
  function resumeAudioCtx() {
    if (_audioCtx && _audioCtx.state === "suspended") {
      _audioCtx.resume().catch(() => {});
    }
  }
  // Persisted local volume/mute
  const savedVol = parseFloat(localStorage.getItem("radio.volume"));
  const savedMuted = localStorage.getItem("radio.muted") === "1";
  let initialVolume = Number.isFinite(savedVol) ? Math.min(RADIO_MAX_VOLUME, Math.max(0, savedVol)) : RADIO_DEFAULT_VOLUME;
  if (localStorage.getItem(RADIO_VOLUME_REDUCED_KEY) !== "1") {
    initialVolume = RADIO_DEFAULT_VOLUME;
    localStorage.setItem("radio.volume", String(initialVolume));
    localStorage.setItem(RADIO_VOLUME_REDUCED_KEY, "1");
  }
  audio.volume = Math.min(RADIO_MAX_VOLUME, initialVolume);
  audio.muted = savedMuted;
  if (volSlider) volSlider.value = String(volToSlider(audio.volume));
  syncMuteUi();

  function syncMuteUi() {
    if (muteBtn) muteBtn.textContent = audio.muted || audio.volume === 0 ? "🔇" : "🔊";
    hud.classList.toggle("is-muted", audio.muted || audio.volume === 0);
  }

  muteBtn?.addEventListener("click", () => {
    audio.muted = !audio.muted;
    const g = ensureWebAudio();
    if (g) g.gain.value = audio.muted ? 0 : audio.volume;
    localStorage.setItem("radio.muted", audio.muted ? "1" : "0");
    syncMuteUi();
  });
  function applyVolumeFromSlider() {
    if (!volSlider) return;
    const v = sliderToVol(volSlider.value);
    audio.volume = v;
    const g = ensureWebAudio();
    if (g) g.gain.value = audio.muted ? 0 : v;
    resumeAudioCtx();
    if (v > 0 && audio.muted) { audio.muted = false; localStorage.setItem("radio.muted", "0"); }
    localStorage.setItem("radio.volume", String(v));
    syncMuteUi();
  }
  volSlider?.addEventListener("input", applyVolumeFromSlider);
  volSlider?.addEventListener("change", applyVolumeFromSlider);
  // Garante que o ganho seja inicializado/aplicado assim que o áudio puder rodar
  audio.addEventListener("play", () => { ensureWebAudio(); resumeAudioCtx(); applyVolumeFromSlider(); });

  // Mobile-safe drag: trackeia pointermove/touchmove no documento durante o gesto.
  // Algumas WebViews móveis não disparam pointermove no próprio <input range>
  // depois que o toque inicia, mesmo com setPointerCapture.
  if (volSlider) {
    let dragging = false;
    const updateFromX = (clientX) => {
      const r = volSlider.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
      volSlider.value = String(Math.round(pct * 100));
      applyVolumeFromSlider();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const x = e.touches ? e.touches[0]?.clientX : e.clientX;
      if (typeof x === "number") {
        if (e.cancelable) e.preventDefault();
        updateFromX(x);
      }
    };
    const onEnd = () => {
      dragging = false;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
    const onStart = (e) => {
      e.stopPropagation();
      dragging = true;
      const x = e.touches ? e.touches[0]?.clientX : e.clientX;
      if (typeof x === "number") updateFromX(x);
      document.addEventListener("pointermove", onMove, { passive: false });
      document.addEventListener("pointerup", onEnd);
      document.addEventListener("pointercancel", onEnd);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
      document.addEventListener("touchcancel", onEnd);
    };
    volSlider.addEventListener("pointerdown", onStart);
    volSlider.addEventListener("touchstart", onStart, { passive: false });
  }


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

  // Barra de modelos (templates) — injetada uma vez logo abaixo do botão "+ Nova"
  if (newBtn && !document.getElementById("interactionsTemplatesBar")) {
    const bar = document.createElement("div");
    bar.id = "interactionsTemplatesBar";
    bar.style.cssText = "display:flex;flex-direction:column;gap:6px;padding:8px;border:1px dashed #2d2d3d;border-radius:8px;background:rgba(255,255,255,0.02);";
    bar.innerHTML = `
      <div style="font-size:11px;color:#aaa;font-weight:600;">📦 Modelos salvos</div>
      <div style="display:flex;gap:6px;align-items:center;">
        <select id="interactionsTplSelect" style="flex:1;background:#11131a;color:#eee;border:1px solid #333;border-radius:6px;padding:6px;font:12px system-ui;"><option value="">— Selecione um modelo —</option></select>
        <button id="interactionsTplDel" type="button" title="Excluir modelo selecionado" style="background:#2a1416;color:#f88;border:1px solid #5a2024;border-radius:6px;padding:4px 8px;cursor:pointer;">×</button>
      </div>
      <div style="display:flex;gap:6px;">
        <button id="interactionsTplLoadHere" type="button" style="flex:1;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:6px;padding:6px;cursor:pointer;font-weight:600;font-size:12px;">📍 Usar aqui (minha posição)</button>
        <button id="interactionsTplLoadRaw" type="button" style="background:#1f2937;color:#eee;border:1px solid #374151;border-radius:6px;padding:6px 8px;cursor:pointer;font-size:12px;" title="Carregar com os offsets originais">⤓</button>
      </div>`;
    newBtn.insertAdjacentElement("afterend", bar);
  }

  let templates = [];          // [{...row}]
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

  // ---------- Templates ----------
  const TEMPLATE_FIELDS = [
    "label","icon","kind","animation_key","animation_url","loop",
    "offset_x","offset_y","offset_z","rotation_x","rotation_y","rotation_z",
    "scale_mul","trigger_radius","exit_radius","occupancy",
    "bot_animation_url","item_slug","item_spawn_offset_x","item_spawn_offset_y","item_spawn_offset_z",
    "service_duration_ms","auto_despawn_ms",
  ];
  async function loadTemplates() {
    const { data, error } = await supabase
      .from("interaction_templates").select("*").order("name", { ascending: true });
    if (error) { console.warn("[interactions] templates load", error); return; }
    templates = data || [];
    renderTemplatesBar();
  }
  function renderTemplatesBar() {
    const sel = document.getElementById("interactionsTplSelect");
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Selecione um modelo —</option>' +
      templates.map(t => `<option value="${_esc(t.id)}">${_esc(t.icon || "•")} ${_esc(t.name)}</option>`).join("");
    if (prev) sel.value = prev;
  }
  function templateToDraft(tpl, { useHere = false } = {}) {
    const draft = { asset_id: "" };
    for (const k of TEMPLATE_FIELDS) draft[k] = tpl[k];
    if (useHere) {
      const ent = (typeof myId !== "undefined" && myId) ? playerEntities.get(myId) : null;
      if (ent?.group) {
        draft.offset_x = Number(ent.group.position.x.toFixed(2));
        draft.offset_y = Number(ent.group.position.y.toFixed(2));
        draft.offset_z = Number(ent.group.position.z.toFixed(2));
        draft.rotation_y = Number((ent.group.rotation.y * 180 / Math.PI).toFixed(1));
      }
    }
    return draft;
  }
  async function saveAsTemplate(inter) {
    const name = prompt("Nome do modelo:", inter.label || "Interação");
    if (!name) return;
    const payload = { name, created_by: (typeof myId !== "undefined" ? myId : null) || null };
    for (const k of TEMPLATE_FIELDS) if (inter[k] !== undefined && inter[k] !== null) payload[k] = inter[k];
    const { error } = await supabase.from("interaction_templates").insert(payload);
    if (error) { alert("Erro ao salvar modelo: " + error.message); return; }
    addSystemLine?.("Modelo salvo: " + name);
    await loadTemplates();
  }

  document.getElementById("interactionsTplLoadHere")?.addEventListener("click", () => {
    const sel = document.getElementById("interactionsTplSelect");
    const tpl = templates.find(t => t.id === sel?.value);
    if (!tpl) return alert("Escolha um modelo primeiro.");
    editingId = "new"; editingDraft = templateToDraft(tpl, { useHere: true });
    renderAdmin();
    addSystemLine?.("Modelo carregado na sua posição. Ajuste e salve.");
  });
  document.getElementById("interactionsTplLoadRaw")?.addEventListener("click", () => {
    const sel = document.getElementById("interactionsTplSelect");
    const tpl = templates.find(t => t.id === sel?.value);
    if (!tpl) return alert("Escolha um modelo primeiro.");
    editingId = "new"; editingDraft = templateToDraft(tpl, { useHere: false });
    renderAdmin();
  });
  document.getElementById("interactionsTplDel")?.addEventListener("click", async () => {
    const sel = document.getElementById("interactionsTplSelect");
    const tpl = templates.find(t => t.id === sel?.value);
    if (!tpl) return;
    if (!confirm("Excluir modelo \"" + tpl.name + "\"?")) return;
    const { error } = await supabase.from("interaction_templates").delete().eq("id", tpl.id);
    if (error) { alert("Erro: " + error.message); return; }
    await loadTemplates();
  });
  loadTemplates();
  try {
    supabase.channel("interaction_templates")
      .on("postgres_changes", { event: "*", schema: "public", table: "interaction_templates" }, () => loadTemplates())
      .subscribe();
  } catch {}


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
    window.__mapInteractions = interactions;
    // Sync bot lookup for admin UI
    try { window.__mapBots = new Map(Array.from(botEntities.entries()).filter(([k]) => typeof k === "string" && !k.startsWith("__loading_")).map(([k, e]) => [k, e.row])); } catch {}
    window.dispatchEvent(new CustomEvent("interactions:updated"));
    // Pré-carrega clips FBX de todas as interações do mapa para eliminar T-pose no primeiro uso
    try {
      const urls = Array.from(new Set(interactions.map(i => i.animation_url).filter(Boolean)));
      let i = 0;
      const runNext = () => {
        if (i >= urls.length) return;
        const u = urls[i++];
        loadFbxClip(u).catch(()=>{}).finally(runNext);
      };
      for (let k = 0; k < Math.min(4, urls.length); k++) runNext();
    } catch {}
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
    const ox = (draft?.offset_x ?? inter.offset_x) || 0;
    const oy = (draft?.offset_y ?? inter.offset_y) || 0;
    const oz = (draft?.offset_z ?? inter.offset_z) || 0;
    const rx = ((draft?.rotation_x ?? inter.rotation_x) || 0) * Math.PI / 180;
    const ry = ((draft?.rotation_y ?? inter.rotation_y) || 0) * Math.PI / 180;
    const rz = ((draft?.rotation_z ?? inter.rotation_z) || 0) * Math.PI / 180;
    const assetId = draft?.asset_id ?? inter.asset_id;
    if (!assetId) {
      // Standalone: offsets são coordenadas de mundo, centradas onde o admin escolheu
      const world = new THREE.Vector3(ox, oy, oz);
      return { worldPos: world, worldRotX: rx, worldRotY: ry, worldRotZ: rz, objectTopY: world.y + 1.7 };
    }
    const obj = assetObjects.get(assetId);
    if (!obj) return null;
    obj.updateMatrixWorld(true);
    const local = new THREE.Vector3(ox, oy, oz);
    const world = local.clone().applyMatrix4(obj.matrixWorld);
    let topY = world.y + 1.0;
    try {
      const box = new THREE.Box3().setFromObject(obj);
      if (isFinite(box.max.y)) topY = box.max.y;
    } catch {}
    return { worldPos: world, worldRotX: rx, worldRotY: obj.rotation.y + ry, worldRotZ: rz, objectTopY: topY };
  }


  function getMyEntity() { return (typeof myId !== "undefined" && myId) ? playerEntities.get(myId) : null; }

  // ---------- Proximity loop ----------
  setInterval(() => {
    if (!inRoom) { hidePrompt(); return; }
    const entity = getMyEntity();
    if (!entity || !entity.group) { hidePrompt(); return; }

    // Se sentado, mostra prompt "Levantar" no botão
    if (currentSit) { activeNearby = null; hidePrompt(); return; }

    let best = null;
    let bestDist = Infinity;
    const pos = entity.group.position;
    for (const inter of interactions) {
      if (inter.kind === "football") continue; // tratado pelo módulo de futebol
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
      world = currentSit.worldPos.clone();
      world.y = (currentSit.objectTopY ?? (world.y + 1.0)) + 0.35;
    } else if (activeNearby) {
      world = activeNearby.pose.worldPos.clone();
      world.y = (activeNearby.pose.objectTopY ?? (world.y + 1.0)) + 0.35;
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
    const occupied = window.isInteractionOccupied?.(inter.id);
    const label = occupied ? "Ocupado" : (inter.label || "Interagir");
    promptEl.innerHTML = `<span class="ip-label">${_esc(label)}</span>`;
    promptEl.onclick = occupied ? null : (() => enterSit(inter));
    promptEl.style.filter = occupied ? "grayscale(1) opacity(0.7)" : "";
    // Pré-carrega o clip da interação ativa para evitar T-pose quando o jogador apertar E
    if (!occupied && inter.animation_url) { try { loadFbxClip(inter.animation_url).catch(()=>{}); } catch {} }
  }
  function showPromptForSit() {
    promptEl.hidden = false;
    promptEl.dataset.kind = "exit";
    promptEl.innerHTML = `<span class="ip-label">Levantar (E)</span>`;
    promptEl.onclick = () => standUp();
  }
  function hidePrompt() { promptEl.hidden = true; promptEl.onclick = null; }


  // ---------- Enter / exit sit ----------
  async function enterSit(inter) {
    const entity = getMyEntity();
    if (!entity || !entity.mixer) return;
    if (inter.kind === "bot_service") {
      hidePrompt();
      window.__runBotService?.(inter);
      return;
    }
    if (window.isInteractionOccupied?.(inter.id)) {
      addSystemLine?.("Esse lugar já está ocupado.");
      return;
    }
    const pose = computeSeatPose(inter);
    if (!pose) return;

    // Se já havia uma interação anterior em curso, encerra a ação dela completamente
    // antes de começar a próxima (evita "vazamento" da pose deitada).
    const prevSit = currentSit;
    if (prevSit?.mixerAction) {
      try {
        const prevAction = prevSit.mixerAction;
        prevAction.fadeOut(0.2);
        setTimeout(() => {
          try {
            prevAction.stop();
            const clip = prevAction.getClip?.();
            if (clip) entity.mixer.uncacheAction(clip);
          } catch {}
        }, 260);
      } catch {}
    }

    const loadToken = Symbol("sit");
    currentSit = {
      id: inter.id,
      assetId: inter.asset_id,
      worldPos: pose.worldPos.clone(),
      worldRotX: pose.worldRotX,
      worldRotY: pose.worldRotY,
      worldRotZ: pose.worldRotZ,
      objectTopY: pose.objectTopY,
      animationUrl: inter.animation_url || null,
      mixerAction: null,
      animClipName: null,
      loadToken,
    };
    window.__sittingInteraction = currentSit;
    try { presenceChannel?.track(presencePayload()); } catch {}

    // Atualiza me.x/y para o assento (evita salto ao levantar)
    if (typeof me !== "undefined" && me) {
      const pct = percentFromWorld(pose.worldPos.x, pose.worldPos.z);
      me.x = pct.x; me.y = pct.y;
    }
    entity.target.copy(pose.worldPos);
    entity.group.position.copy(pose.worldPos);
    entity.group.rotation.set(pose.worldRotX, pose.worldRotY, pose.worldRotZ);

    hidePrompt();

    // Mantém idle (ou ação atual) tocando enquanto o FBX baixa — sem janela morta de T-pose.
    try {
      if (inter.animation_url) {
        const clip = await loadFbxClip(inter.animation_url);
        // Cancela se o jogador saiu / trocou de interação enquanto carregava
        if (window.__sittingInteraction !== currentSit || currentSit.loadToken !== loadToken) return;
        const bones = collectBoneNames(entity.character);
        const retarg = retargetClipToBones(clip, bones, { stripRootPosition: true });
        if (!retarg) {
          console.warn("[interactions] nenhum osso do clip casou com o personagem; usando idle");
          const idle = entity.actions?.idle;
          if (idle) { idle.reset().fadeIn(0.2).play(); entity.currentAction = "idle"; }
        } else {
          // Crossfade da ação atual para a nova no mesmo frame (sem gap de T-pose)
          const prevAction = (entity.actions && entity.currentAction && entity.actions[entity.currentAction]) || null;
          const action = entity.mixer.clipAction(retarg);
          action.setLoop(inter.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = true;
          action.reset().fadeIn(0.25).play();
          if (prevAction) {
            try { prevAction.fadeOut(0.25); } catch {}
          }
          currentSit.mixerAction = action;
          // Resolve a chave de tuning
          let tuningKey = null;
          try {
            const match = (window.__botAnimations || []).find(a => a.url === inter.animation_url);
            if (match) tuningKey = "custom:" + match.id;
          } catch {}
          if (!tuningKey && inter.animation_key && window.__animTunings?.[inter.animation_key]) {
            tuningKey = inter.animation_key;
          }
          if (tuningKey) {
            if (!window.__animTunings[tuningKey]) window.__animTunings[tuningKey] = window.__defaultAnimTuning();
            entity.currentAction = tuningKey;
          } else {
            entity.currentAction = null;
          }
        }
      } else {
        const idle = entity.actions?.idle;
        if (idle) { idle.reset().fadeIn(0.2).play(); entity.currentAction = "idle"; }
      }
    } catch (e) { console.warn("[interactions] sit clip", e); }
  }

  function standUp() {
    if (!currentSit) return;
    const entity = getMyEntity();
    // Invalida cargas em curso para que não apliquem clip depois do levantar
    currentSit.loadToken = Symbol("standUp");
    const dyingAction = currentSit.mixerAction;
    if (entity && dyingAction) {
      try { dyingAction.fadeOut(0.2); } catch {}
      setTimeout(() => {
        try {
          dyingAction.stop();
          const clip = dyingAction.getClip?.();
          if (clip) entity.mixer.uncacheAction(clip);
        } catch {}
      }, 260);
    }
    // Inicia idle imediatamente para evitar peso residual do clip clamped (ex.: deitar)
    if (entity?.actions?.idle) { entity.actions.idle.reset().fadeIn(0.2).play(); entity.currentAction = "idle"; }
    if (entity?.group) {
      entity.group.rotation.x = 0;
      entity.group.rotation.z = 0;
    }
    if (entity?.character) {
      entity.character.position.set(0, poseDebug?.offY || 0, 0);
      entity.character.rotation.set(CHARACTER_DEFAULT_ROT_X, 0, 0);
    }

    currentSit = null;
    window.__sittingInteraction = null;
    try { presenceChannel?.track(presencePayload()); } catch {}
    hidePrompt();
  }
  window.standUpFromInteraction = standUp;

  // ---------- Remote sit replication ----------
  // Mantém o estado das interações que jogadores remotos estão executando,
  // para que TODOS vejam a mesma animação em tempo real (não apenas o dono).
  // entity.__remoteSit = { id, action } | null
  async function applyRemoteSit(entity, sittingId) {
    if (!entity || !entity.mixer || !entity.character) return;
    const cur = entity.__remoteSit || null;
    if ((cur?.id || null) === (sittingId || null)) return;
    // Para a ação anterior, se houver.
    if (cur?.action) {
      try { cur.action.fadeOut(0.2); } catch {}
      const dying = cur.action;
      setTimeout(() => {
        try {
          dying.stop();
          const cc = dying.getClip?.();
          if (cc) entity.mixer.uncacheAction(cc);
        } catch {}
      }, 260);
    }
    if (!sittingId) {
      entity.__remoteSit = null;
      // Volta a um estado neutro: idle e remove rotação aplicada pelo sit.
      try {
        if (entity.group) { entity.group.rotation.x = 0; entity.group.rotation.z = 0; }
        if (entity.character) {
          entity.character.position.set(0, poseDebug?.offY || 0, 0);
          entity.character.rotation.set(CHARACTER_DEFAULT_ROT_X, 0, 0);
        }
        if (entity.actions?.idle) { entity.actions.idle.reset().fadeIn(0.2).play(); entity.currentAction = "idle"; }
      } catch {}
      return;
    }
    const inter = (window.__mapInteractions || []).find((i) => i.id === sittingId);
    if (!inter) { entity.__remoteSit = { id: sittingId, action: null }; return; }
    if (inter.kind === "football") return;
    const pose = computeSeatPose(inter);
    if (pose && entity.group) {
      entity.target.copy(pose.worldPos);
      entity.group.position.copy(pose.worldPos);
      entity.group.rotation.set(pose.worldRotX, pose.worldRotY, pose.worldRotZ);
    }
    entity.__remoteSit = { id: sittingId, action: null };
    if (!inter.animation_url) return;
    const token = entity.__remoteSit;
    try {
      const clip = await loadFbxClip(inter.animation_url);
      if (entity.__remoteSit !== token) return; // mudou de assento enquanto carregava
      const bones = collectBoneNames(entity.character);
      const retarg = retargetClipToBones(clip, bones, { stripRootPosition: true });
      if (!retarg) return;
      const prevAction = (entity.actions && entity.currentAction && entity.actions[entity.currentAction]) || null;
      const action = entity.mixer.clipAction(retarg);
      action.setLoop(inter.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = true;
      action.reset().fadeIn(0.25).play();
      if (prevAction) { try { prevAction.fadeOut(0.25); } catch {} }
      entity.currentAction = null;
      token.action = action;
    } catch (e) { console.warn("[interactions] remote sit clip", e); }
  }
  window.__applyRemoteSit = applyRemoteSit;


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
      rotation_x: 0, rotation_y: 0, rotation_z: 0, scale_mul: 1,

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
        const obj = it.asset_id ? assetObjects.get(it.asset_id) : null;
        const assetName = it.asset_id ? (obj?.name || "(asset removido)") : "📍 posição livre";
        const isEd = editingId === it.id;
        return `<div class="interact-row ${isEd ? "is-editing" : ""}" data-id="${_esc(it.id)}">
          <div class="ir-line"><span class="ir-icon">${_esc(it.icon || "💺")}</span>
            <span class="ir-label">${_esc(it.label || "—")}</span>
            <span class="ir-asset">${_esc(assetName)}</span></div>
          <div class="ir-actions">
            <button type="button" data-act="edit">${isEd ? "Cancelar" : "Editar"}</button>
            <button type="button" data-act="test">Testar</button>
            <button type="button" data-act="tpl" title="Salvar como modelo reutilizável">💾</button>
            <button type="button" data-act="del" class="danger">×</button>
          </div>

        </div>`;
      }).join("");
    }
    // Editor form
    if (editingId === null) { editorEl.innerHTML = ""; window.__clearItemEditPreview?.(); return; }
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
        <input type="number" class="ie-val" data-field="${field}" min="${min}" max="${max}" step="${step}" value="${Number(draft[field] || 0).toFixed(2)}">
      </label>`;

    if (draft.kind === "football") {
      editorEl.innerHTML = `
        <div class="interact-editor">
          <div class="ie-row"><label>Tipo</label>
            <select data-field="kind">
              <option value="sit" ${draft.kind === "sit" ? "selected" : ""}>Sentar</option>
              <option value="pose" ${draft.kind === "pose" ? "selected" : ""}>Pose</option>
              <option value="animation" ${draft.kind === "animation" ? "selected" : ""}>Animação</option>
              <option value="football" selected>⚽ Bola de futebol</option>
            </select>
          </div>
          <div class="ie-row"><label>Rótulo</label><input type="text" data-field="label" value="${_esc(draft.label)}" maxlength="40"></div>
          <div class="ie-row"><label>Ícone</label><input type="text" data-field="icon" value="${_esc(draft.icon)}" maxlength="4" style="width:64px"></div>
          <div class="ie-row"><button type="button" class="ie-ball-here primary" style="width:100%">📍 Colocar bola na minha posição</button></div>
          <fieldset class="ie-fs"><legend>Posição da bola (mundo)</legend>
            ${slider("X", "offset_x", -40, 40, 0.1)}
            ${slider("Altura (Y)", "offset_y", 0, 4, 0.05)}
            ${slider("Z", "offset_z", -40, 40, 0.1)}
          </fieldset>
          <fieldset class="ie-fs"><legend>Tamanho da bola</legend>
            ${slider("Escala", "scale_mul", 0.3, 4, 0.05)}
          </fieldset>
          <fieldset class="ie-fs"><legend>Aproximação (ativa o modo futebol)</legend>
            ${slider("Raio (m)", "trigger_radius", 1, 10, 0.1)}
          </fieldset>
          <div class="ie-actions">
            <button type="button" class="ie-save primary">Salvar</button>
            <button type="button" class="ie-cancel">Cancelar</button>
          </div>
        </div>`;
      window.__footballSetPreview?.(draft);
      return;
    }

    const standalone = !draft.asset_id;
    const posRange = standalone ? 200 : 3;
    const posStep = standalone ? 0.1 : 0.05;
    editorEl.innerHTML = `
      <div class="interact-editor">
        <div class="ie-row"><label>Objeto</label>
          <select data-field="asset_id"><option value="">— sem objeto (posição livre) —</option>${assetsOptions}</select>
          <button type="button" class="ie-pick">${pickMode ? "Cancelar seleção" : "Selecionar no mundo"}</button>
        </div>
        ${standalone ? `<div class="ie-row"><button type="button" class="ie-here primary" style="width:100%">📍 Usar minha posição atual</button></div>` : ``}
        <div class="ie-row"><label>Rótulo</label><input type="text" data-field="label" value="${_esc(draft.label)}" maxlength="40"></div>
        <div class="ie-row"><label>Ícone</label><input type="text" data-field="icon" value="${_esc(draft.icon)}" maxlength="4" style="width:64px"></div>
        <div class="ie-row"><label>Tipo</label>
          <select data-field="kind">
            <option value="sit" ${draft.kind === "sit" ? "selected" : ""}>Sentar</option>
            <option value="pose" ${draft.kind === "pose" ? "selected" : ""}>Pose</option>
            <option value="animation" ${draft.kind === "animation" ? "selected" : ""}>Animação</option>
            <option value="football" ${draft.kind === "football" ? "selected" : ""}>⚽ Bola de futebol</option>
            <option value="bot_service" ${draft.kind === "bot_service" ? "selected" : ""}>🍹 Garçom (bot serve item)</option>
          </select>
        </div>
        <div class="ie-row"><label>Animação</label>
          <select data-field="animation_pick" style="flex:1">
            <option value="">— Nenhuma (idle) —</option>
            ${(window.__botAnimations || []).map(a => `<option value="${_esc(a.url)}" ${a.url === (draft.animation_url || "") ? "selected" : ""}>${_esc(a.name)}</option>`).join("")}
            <option value="__manual__" ${draft.animation_url && !(window.__botAnimations || []).some(a => a.url === draft.animation_url) ? "selected" : ""}>URL manual…</option>
          </select>
          <button type="button" class="ie-upload-anim" title="Enviar novo FBX">＋ FBX</button>
          <input type="file" class="ie-upload-anim-input" accept=".fbx" hidden>
        </div>
        <div class="ie-row" data-anim-url-row ${draft.animation_url && !(window.__botAnimations || []).some(a => a.url === draft.animation_url) ? "" : "hidden"}><label>URL FBX</label>
          <input type="url" data-field="animation_url" placeholder="https://… .fbx" value="${_esc(draft.animation_url || "")}">
        </div>

        <div class="ie-row"><label>Loop</label>
          <input type="checkbox" data-field="loop" ${draft.loop ? "checked" : ""}>
        </div>
        ${draft.kind === "bot_service" ? `
        <fieldset class="ie-fs"><legend>🤖 Garçom / Item entregue</legend>
          <div class="ie-row"><label>Bot atendente</label>
            <select data-field="bot_id" style="flex:1">
              <option value="">— Nenhum (só spawna item) —</option>
              ${Array.from((window.__mapBots || new Map()).entries()).map(([id, b]) => `<option value="${_esc(id)}" ${draft.bot_id === id ? "selected" : ""}>${_esc(b.name || id.slice(0,6))}</option>`).join("")}
            </select>
          </div>
          <div class="ie-row"><label>Animação do bot ao servir</label>
            <select data-field="bot_animation_url" style="flex:1">
              <option value="">— Nenhuma —</option>
              ${(window.__botAnimations || []).map(a => `<option value="${_esc(a.url)}" ${a.url === (draft.bot_animation_url || "") ? "selected" : ""}>${_esc(a.name)}</option>`).join("")}
            </select>
          </div>
          <div class="ie-row"><label>Item entregue</label>
            <select data-field="item_slug" style="flex:1">
              <option value="">— Nenhum —</option>
              ${(window.__itemCatalog || []).map(it => `<option value="${_esc(it.slug)}" ${it.slug === (draft.item_slug || "") ? "selected" : ""}>${_esc(it.name)}</option>`).join("")}
            </select>
          </div>
          ${slider("Spawn offset X", "item_spawn_offset_x", -5, 5, 0.05)}
          ${slider("Spawn offset Y (altura)", "item_spawn_offset_y", -2, 5, 0.05)}
          ${slider("Spawn offset Z", "item_spawn_offset_z", -5, 5, 0.05)}
          ${slider("Tempo de serviço (ms)", "service_duration_ms", 500, 10000, 100)}
          ${slider("Auto-despawn item (ms, 0 = nunca)", "auto_despawn_ms", 0, 600000, 1000)}
        </fieldset>
        ` : ``}
        <fieldset class="ie-fs"><legend>${standalone ? "Posição no mundo" : "Posição relativa ao objeto"}</legend>
          ${slider("X", "offset_x", -posRange, posRange, posStep)}
          ${slider("Altura (Y)", "offset_y", standalone ? -5 : -2, standalone ? 10 : 3, posStep)}
          ${slider("Z", "offset_z", -posRange, posRange, posStep)}
          ${slider("Rotação X (°)", "rotation_x", -180, 180, 1)}
          ${slider("Rotação Y (°)", "rotation_y", -180, 180, 1)}
          ${slider("Rotação Z (°)", "rotation_z", -180, 180, 1)}
        </fieldset>

        <fieldset class="ie-fs"><legend>Aproximação</legend>
          ${slider("Raio (m)", "trigger_radius", 0.5, 5, 0.1)}
        </fieldset>
        <div class="ie-actions">
          <button type="button" class="ie-save primary">Salvar</button>
          <button type="button" class="ie-cancel">Cancelar</button>
        </div>
      </div>`;
    // Sincroniza preview do item para interações tipo "garçom"
    try { window.__setItemEditPreview?.(draft); } catch {}
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
    } else if (act === "tpl") {
      await saveAsTemplate(inter);

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
    // Dropdown de animação: mapeia para animation_url (ou abre o campo manual)
    if (field === "animation_pick") {
      const urlRow = editorEl.querySelector("[data-anim-url-row]");
      const urlInp = editorEl.querySelector('input[data-field="animation_url"]');
      if (val === "__manual__") {
        if (urlRow) urlRow.hidden = false;
        urlInp?.focus();
      } else {
        if (urlRow) urlRow.hidden = true;
        editingDraft.animation_url = val || null;
        if (urlInp) urlInp.value = val || "";
      }
      return;
    }
    editingDraft[field] = val;
    if (field === "asset_id") { renderAdmin(); return; }
    // Trocar o tipo re-renderiza (editor do futebol é diferente)
    if (field === "kind") {
      if (val === "football") {
        if (editingDraft.label === "Sentar" || !editingDraft.label) editingDraft.label = "Jogar futebol";
        if (editingDraft.icon === "💺" || !editingDraft.icon) editingDraft.icon = "⚽";
        if (!editingDraft.scale_mul) editingDraft.scale_mul = 1;
        if (!editingDraft.trigger_radius || editingDraft.trigger_radius < 1) editingDraft.trigger_radius = 3;
      }
      renderAdmin();
      return;
    }

    // Mantém barra e número em sincronia
    if (el.type === "range") {
      const num = el.parentElement?.querySelector("input[type=number][data-field]");
      if (num && document.activeElement !== num) num.value = Number(val).toFixed(2);
    } else if (el.type === "number") {
      const range = el.parentElement?.querySelector("input[type=range][data-field]");
      if (range) range.value = val;
    }
    // Preview ao vivo da bola de futebol
    if (editingDraft.kind === "football") {
      window.__footballSetPreview?.(editingDraft);
      return;
    }
    // Preview ao vivo: se já sentamos para testar, atualiza pose
    if (currentSit && (editingId === currentSit.id || editingId === "new")) {
      const fake = { ...(interactions.find((i) => i.id === editingId) || {}), ...editingDraft, asset_id: editingDraft.asset_id || currentSit.assetId };
      const pose = computeSeatPose(fake);
      if (pose) {
        currentSit.worldPos.copy(pose.worldPos);
        currentSit.worldRotX = pose.worldRotX;
        currentSit.worldRotY = pose.worldRotY;
        currentSit.worldRotZ = pose.worldRotZ;
        currentSit.objectTopY = pose.objectTopY;
        const ent = getMyEntity();
        if (ent?.group) {
          ent.group.position.copy(pose.worldPos);
          ent.group.rotation.set(pose.worldRotX, pose.worldRotY, pose.worldRotZ);
        }
      }

    }
    // Preview ao vivo do item entregue pelo garçom
    if (editingDraft.kind === "bot_service") {
      try { window.__setItemEditPreview?.(editingDraft); } catch {}
    }
  });


  editorEl?.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.classList.contains("ie-cancel")) { editingId = null; editingDraft = null; try { window.__clearItemEditPreview?.(); } catch {} renderAdmin(); return; }
    if (t.classList.contains("ie-pick")) {
      pickMode = !pickMode;
      addSystemLine?.(pickMode ? "Clique num objeto do mapa para selecionar." : "Seleção cancelada.");
      renderAdmin();
      return;
    }
    if (t.classList.contains("ie-ball-here")) {
      const ent = (typeof myId !== "undefined" && myId) ? playerEntities.get(myId) : null;
      if (!ent?.group) return alert("Seu avatar não está pronto.");
      editingDraft.offset_x = Number(ent.group.position.x.toFixed(2));
      editingDraft.offset_z = Number(ent.group.position.z.toFixed(2));
      editingDraft.offset_y = 0;
      renderAdmin();
      window.__footballSetPreview?.(editingDraft);
      addSystemLine?.("Bola posicionada na sua posição atual.");
      return;
    }
    if (t.classList.contains("ie-upload-anim")) {
      const inp = editorEl.querySelector(".ie-upload-anim-input");
      if (inp) {
        inp.onchange = async (ev) => {
          const file = ev.target.files?.[0]; if (!file) return;
          const name = prompt("Nome desta animação:", file.name.replace(/\.fbx$/i, "")) || file.name.replace(/\.fbx$/i, "");
          t.disabled = true; t.textContent = "Enviando...";
          const row = await window.uploadBotAnimation?.(file, name);
          t.disabled = false; t.textContent = "＋ FBX";
          if (row?.url && editingDraft) {
            editingDraft.animation_url = row.url;
            renderAdmin();
          }
        };
        inp.click();
      }
      return;
    }
    if (t.classList.contains("ie-here")) {
      const ent = (typeof myId !== "undefined" && myId) ? playerEntities.get(myId) : null;
      if (!ent?.group) return alert("Seu avatar não está pronto.");
      editingDraft.offset_x = Number(ent.group.position.x.toFixed(2));
      editingDraft.offset_y = Number(ent.group.position.y.toFixed(2));
      editingDraft.offset_z = Number(ent.group.position.z.toFixed(2));
      editingDraft.rotation_y = Number((ent.group.rotation.y * 180 / Math.PI).toFixed(1));
      renderAdmin();
      addSystemLine?.("Interação posicionada na sua posição atual.");
      return;
    }
    if (t.classList.contains("ie-save")) {
      const isFootball = editingDraft.kind === "football";
      const payload = {
        asset_id: editingDraft.asset_id || null,
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
        rotation_x: Number(editingDraft.rotation_x) || 0,
        rotation_y: Number(editingDraft.rotation_y) || 0,
        rotation_z: Number(editingDraft.rotation_z) || 0,

        scale_mul: Number(editingDraft.scale_mul) || 1,
        trigger_radius: Number(editingDraft.trigger_radius) || 1.5,
        exit_radius: (Number(editingDraft.trigger_radius) || 1.5) + 0.5,
        occupancy: editingDraft.occupancy || "multi",
        bot_id: editingDraft.bot_id || null,
        bot_animation_url: editingDraft.bot_animation_url || null,
        item_slug: editingDraft.item_slug || null,
        item_spawn_offset_x: Number(editingDraft.item_spawn_offset_x) || 0,
        item_spawn_offset_y: Number(editingDraft.item_spawn_offset_y) || 0,
        item_spawn_offset_z: Number(editingDraft.item_spawn_offset_z) || 0,
        service_duration_ms: Math.max(200, Number(editingDraft.service_duration_ms) || 3500),
        auto_despawn_ms: Math.max(0, Number(editingDraft.auto_despawn_ms) || 0),
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
      try { window.__clearItemEditPreview?.(); } catch {}
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


// ============================================================
// ⚽ Módulo de Futebol (multiplayer, bola compartilhada)
// ============================================================
(function footballModule() {
  const BALL_RADIUS = 0.18;
  const BALL_DIAMETER = BALL_RADIUS * 2;
  const GRAVITY = -14.0;
  const DRIBBLE_DIST = 0.45;       // bola mais colada ao pé
  const DRIBBLE_SIDE = 0.08;       // leve deslocamento lateral (pé dominante)
  const PICKUP_RANGE = 0.85;
  const CAPTURE_RANGE = 1.0;
  // velocidades do modo futebol: vêm do painel admin (speedCfg, dinâmico)
  const WALK_SPEED = () => speedCfg.walkFb;
  const RUN_SPEED = () => speedCfg.runFb;
  const CHARGE_TIME = 1.0;
  const KICK_COOLDOWN = 0.9;       // segundos sem auto-pickup após chutar

  const loader = new GLTFLoader();

  let ballGroup = null;
  let loadingBall = false;
  const ballPos = new THREE.Vector3();
  const ballVel = new THREE.Vector3();
  let ballPlaced = false;

  let ownerId = null;
  let ownerClaimTs = 0;
  let held = false;
  let remoteHeld = false;
  let remoteBall = null;

  let activeInter = null;
  let ballChannel = null;
  let ballChannelMapId = null;
  let lastBroadcast = 0;

  let footballActive = false;
  let camYaw = 0, camPitch = 0.5, camDist = 4.6;
  let charging = false, charge = 0;

  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _head = new THREE.Vector3();

  function myEntity() { return (myId && playerEntities.get(myId)) || null; }

  let ballInner = null;      // malha interna (escala aplicada por scale_mul)
  let ballScale = 1;         // multiplicador atual de tamanho
  let stillTime = 0;         // tempo parada (para auto-reset)
  let pickupCooldown = 0;    // bloqueia auto-pickup logo após chute
  let dribblePhase = 0;      // fase do "toque" para drible com pequenos avanços

  function ensureBall() {
    if (ballGroup || loadingBall) return;
    loadingBall = true;
    loader.load("/assets/ball.glb", (gltf) => {
      const inner = gltf.scene;
      const box = new THREE.Box3().setFromObject(inner);
      const size = box.getSize(new THREE.Vector3());
      const maxd = Math.max(size.x, size.y, size.z) || 1;
      inner.scale.setScalar(BALL_DIAMETER / maxd);
      inner.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(inner);
      const c = box2.getCenter(new THREE.Vector3());
      inner.position.sub(c);
      inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      ballGroup = new THREE.Group();
      ballGroup.add(inner);
      ballGroup.scale.setScalar(ballScale);
      ballGroup.visible = false;
      ballInner = inner;
      scene.add(ballGroup);
    }, undefined, (e) => { loadingBall = false; console.warn("[football] ball load", e); });
  }

  // Posição de spawn ABSOLUTA no mundo (offset_x/z = mundo, offset_y = altura extra).
  // Aceita preview ao vivo do editor admin.
  function spawnWorldPos(inter) {
    const src = window.__footballEditPreview || inter;
    if (!src) return null;
    const x = Number(src.offset_x) || 0;
    const z = Number(src.offset_z) || 0;
    const extraY = Number(src.offset_y) || 0;
    const p = new THREE.Vector3(x, 0, z);
    p.y = groundHeightAt(p, 2) + ballRadius() + extraY;
    return p;
  }

  function ballRadius() { return BALL_RADIUS * ballScale; }

  function applyBallScale(mul) {
    ballScale = Math.max(0.2, Number(mul) || 1);
    if (ballGroup) ballGroup.scale.setScalar(ballScale);
  }

  function resetBallToSpawn() {
    const sp = spawnWorldPos(activeInter);
    if (!sp) return;
    ballPos.copy(sp);
    ballVel.set(0, 0, 0);
    held = false;
    ballPlaced = true;
  }


  function setupBallChannel(mapId) {
    if (ballChannelMapId === mapId) return;
    if (ballChannel) { try { supabase.removeChannel(ballChannel); } catch {} ballChannel = null; }
    ballChannelMapId = mapId;
    ownerId = null; ownerClaimTs = 0; held = false; remoteHeld = false; remoteBall = null;
    ballPlaced = false; ballVel.set(0, 0, 0);
    if (!mapId) return;
    ballChannel = supabase
      .channel("ball:" + mapId, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "state" }, ({ payload }) => {
        if (!payload) return;
        if (payload.owner && payload.owner !== myId) {
          if ((payload.ts || 0) >= ownerClaimTs) { ownerId = payload.owner; ownerClaimTs = payload.ts || ownerClaimTs; }
          remoteHeld = !!payload.held;
          remoteBall = {
            pos: new THREE.Vector3(payload.x, payload.y, payload.z),
            vel: new THREE.Vector3(payload.vx || 0, payload.vy || 0, payload.vz || 0),
          };
          ballPlaced = true;
        }
      })
      .on("broadcast", { event: "claim" }, ({ payload }) => {
        if (!payload || payload.id === myId) return;
        if ((payload.ts || 0) > ownerClaimTs) {
          ownerId = payload.id; ownerClaimTs = payload.ts; remoteHeld = true;
        }
      })
      .on("broadcast", { event: "kick" }, ({ payload }) => {
        if (!payload || payload.id === myId) return;
        const ent = playerEntities.get(payload.id);
        if (ent) playKickAnim(ent, !!payload.strong);
      })
      .subscribe();
  }

  function broadcastState(force) {
    if (!ballChannel) return;
    const now = performance.now();
    if (!force && now - lastBroadcast < 50) return;
    lastBroadcast = now;
    ballChannel.send({
      type: "broadcast", event: "state",
      payload: {
        owner: ownerId, held, ts: ownerClaimTs,
        x: ballPos.x, y: ballPos.y, z: ballPos.z,
        vx: ballVel.x, vy: ballVel.y, vz: ballVel.z,
      },
    }).catch(() => {});
  }

  function claimBall() {
    ownerId = myId; ownerClaimTs = Date.now(); held = true; remoteBall = null;
    ballChannel?.send({ type: "broadcast", event: "claim", payload: { id: myId, ts: ownerClaimTs } }).catch(() => {});
  }

  function broadcastKick(strong) {
    ballChannel?.send({ type: "broadcast", event: "kick", payload: { id: myId, strong } }).catch(() => {});
  }

  function refreshBall() {
    const list = (window.__mapInteractions || []).filter((i) => i.kind === "football");
    activeInter = list[0] || null;
    setupBallChannel(activeInter ? currentMapId : null);
    if (activeInter) {
      applyBallScale(activeInter.scale_mul);
      ensureBall();
      ballPlaced = false; // recoloca no novo spawn no próximo frame
    } else if (ballGroup) {
      ballGroup.visible = false;
      if (footballActive) exitFootball();
    }
  }
  window.addEventListener("interactions:updated", refreshBall);

  // Preview ao vivo do editor admin (posição/tamanho da bola enquanto arrasta sliders).
  window.__footballSetPreview = function (draft) {
    window.__footballEditPreview = draft || null;
    if (draft) {
      applyBallScale(draft.scale_mul);
      if (ownerId == null || ownerId === myId) resetBallToSpawn();
    }
  };


  let savedNormalPos = null;   // posição do modo normal preservada ao entrar no futebol
  let savedFootballPos = null;  // última posição usada no modo futebol
  function enterFootball() {
    if (footballActive) return;
    footballActive = true;
    window.__footballMode = true;
    controls.enabled = false;
    const ent = myEntity();
    if (ent) {
      // guarda posição normal e restaura (ou inicia) posição do modo futebol
      savedNormalPos = ent.group.position.clone();
      if (savedFootballPos) {
        ent.group.position.copy(savedFootballPos);
      }
      // garante postura em pé (sem inclinações remanescentes de chutes/pose debug)
      ent.__fbKicking = false;
      ent.__kickTargetRotX = null;
      if (ent.character) ent.character.rotation.x = 0;
      const d = _v1.copy(camera.position).sub(ent.group.position);
      camYaw = Math.atan2(d.x, d.z);
    }
    const hud = document.getElementById("footballHud");
    if (hud) { hud.hidden = false; requestAnimationFrame(() => hud.classList.add("is-visible")); }
    const kp = document.getElementById("kickPosePanel");
    if (kp) kp.hidden = !document.body.classList.contains("is-admin");
    document.body.classList.add("football-on");
  }
  function exitFootball() {
    if (!footballActive) return;
    footballActive = false;
    window.__footballMode = false;
    controls.enabled = true;
    charging = false; charge = 0;
    if (held && ownerId === myId) { held = false; broadcastState(true); }
    updateForceBar();
    const ent = myEntity();
    if (ent) {
      savedFootballPos = ent.group.position.clone();
      if (savedNormalPos) ent.group.position.copy(savedNormalPos);
      // restaura postura padrão do personagem (sem offsets do modo futebol)
      ent.__fbKicking = false;
      ent.__kickTargetRotX = null;
      if (ent.character) {
        ent.character.position.set(0, poseDebug.offY || 0, 0);
        const d = Math.PI / 180;
        ent.character.rotation.set(
          CHARACTER_DEFAULT_ROT_X + (poseDebug.rotX || 0) * d,
          (poseDebug.rotY || 0) * d,
          (poseDebug.rotZ || 0) * d,
        );
      }
    }
    const hud = document.getElementById("footballHud");
    if (hud) {
      hud.classList.remove("is-visible");
      setTimeout(() => { hud.hidden = true; }, 280);
    }
    const kp = document.getElementById("kickPosePanel");
    if (kp) kp.hidden = true;
    document.body.classList.remove("football-on");
  }
  window.__footballExit = exitFootball;

  // Pose Debug do chute (painel admin no HUD de futebol)
  (function wireKickPosePanel() {
    const kp = window.__kickPose || { offY: 0, offFwd: 0, rotX: 0 };
    const elY = document.getElementById("kpY");
    const elFwd = document.getElementById("kpFwd");
    const elRot = document.getElementById("kpRot");
    if (!elY || !elFwd || !elRot) return;
    const elYV = document.getElementById("kpYVal");
    const elFwdV = document.getElementById("kpFwdVal");
    const elRotV = document.getElementById("kpRotVal");
    function sync() {
      elY.value = kp.offY ?? 0; elFwd.value = kp.offFwd ?? 0; elRot.value = kp.rotX ?? 0;
      elYV.textContent = (kp.offY ?? 0).toFixed(2);
      elFwdV.textContent = (kp.offFwd ?? 0).toFixed(2);
      elRotV.textContent = String(kp.rotX ?? 0);
    }
    sync();
    elY.addEventListener("input", () => { kp.offY = Number(elY.value); elYV.textContent = kp.offY.toFixed(2); window.__fbApplyKickPoseLive?.(); });
    elFwd.addEventListener("input", () => { kp.offFwd = Number(elFwd.value); elFwdV.textContent = kp.offFwd.toFixed(2); window.__fbApplyKickPoseLive?.(); });
    elRot.addEventListener("input", () => { kp.rotX = Number(elRot.value); elRotV.textContent = String(kp.rotX); window.__fbApplyKickPoseLive?.(); });
    document.getElementById("kpTestWeak")?.addEventListener("click", () => window.__fbTestKick?.(false));
    document.getElementById("kpTestStrong")?.addEventListener("click", () => window.__fbTestKick?.(true));
    document.getElementById("kpSave")?.addEventListener("click", () => { window.__saveKickPose?.(); addSystemLine?.("Pose do chute salva."); });
  })();


  const joy = { active: false, x: 0, y: 0, id: null };
  let runHeld = false;

  function readInput() {
    let ix = joy.active ? joy.x : 0;
    let iy = joy.active ? joy.y : 0;
    if (keyState.has("w") || keyState.has("arrowup")) iy += 1;
    if (keyState.has("s") || keyState.has("arrowdown")) iy -= 1;
    if (keyState.has("a") || keyState.has("arrowleft")) ix -= 1;
    if (keyState.has("d") || keyState.has("arrowright")) ix += 1;
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    return { ix, iy, mag: Math.min(1, len) };
  }

  function playKickAnim(ent, strong) {
    if (!ent?.actions) return;
    const slot = strong ? "kickStrong" : "kickWeak";
    const act = ent.actions[slot];
    if (!act) return;
    if (ent.currentAction && ent.actions[ent.currentAction]) ent.actions[ent.currentAction].fadeOut(0.28);
    if (ent.emoteAction) { try { ent.emoteAction.fadeOut(0.28); } catch {} ent.emoteAction = null; }
    ent.currentAction = null;
    act.reset();
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = false;          // não congela na última pose
    // pula a pré-animação (windup) e começa mais perto do impacto
    const clipDur = act.getClip?.().duration || 0.6;
    const SKIP = Math.min(0.35, clipDur * 0.45);
    try { act.time = SKIP; } catch {}
    // janela efetiva (mais curta = chute mais básico)
    const WINDOW = Math.min(0.55, clipDur - SKIP);
    act.fadeIn(0.25).play();
    ent.__fbKicking = true;
    ent.__lastKickStrong = !!strong;
    applyKickPose(ent, true);
    clearTimeout(ent.__fbKickT);
    // antes do fim: começa a sair do chute suavemente (fade longo)
    ent.__fbKickT = setTimeout(() => {
      try { act.fadeOut(0.45); } catch {}
      applyKickPose(ent, false);
      ent.__fbKicking = false;
      // o próximo frame de handleFootballMovement já vai dar fadeIn em walk/idle
    }, Math.max(120, WINDOW * 1000 - 250));
  }

  // Ajuste fino opcional durante o chute. Por padrão NÃO mexe na posição do
  // personagem para evitar teleporte — a animação de chute já cuida do corpo.
  // Os sliders do Pose Debug ainda funcionam, mas com transição suave.
  function applyKickPose(ent, on) {
    const ch = ent?.character;
    if (!ch) return;
    // NÃO mexer em position — só na rotação X, sempre relativa a 0 (sem capturar valor atual,
    // o que acumulava drift e inclinava o personagem com o tempo).
    if (on) {
      const kp = window.__kickPose || { rotX: 0 };
      ent.__kickTargetRotX = (kp.rotX || 0) * (Math.PI / 180);
      ent.__kickTargetY = null;
      ent.__kickTargetZ = null;
    } else {
      ent.__kickTargetRotX = 0;
      ent.__kickTargetY = null;
      ent.__kickTargetZ = null;
      setTimeout(() => {
        if (ent && !ent.__fbKicking) ent.__kickTargetRotX = null;
      }, 300);
    }
  }

  window.__fbApplyKickPoseLive = function () {
    const ent = myEntity();
    if (ent && ent.__fbKicking) applyKickPose(ent, true);
  };
  window.__fbTestKick = function (strong) {
    const ent = myEntity();
    if (ent) playKickAnim(ent, !!strong);
  };


  function aimDir(ent) {
    _v1.set(Math.sin(ent.group.rotation.y), 0, Math.cos(ent.group.rotation.y));
    return _v1;
  }

  function doKick(strong) {
    const ent = myEntity();
    if (!ent) return;
    // chute só funciona se o jogador estiver com a posse da bola
    if (ownerId !== myId || !held) return;
    const dir = aimDir(ent).clone();
    const power = strong ? (11 + charge * 14) : (6 + charge * 5);
    // chutes fortes sobem bem mais alto que os fracos
    const up = strong ? (6.5 + charge * 7.5) : (2.2 + charge * 2);
    // posiciona a bola um pouco à frente do pé para sair limpa
    const R = ballRadius();
    ballPos.copy(ent.group.position).addScaledVector(dir, DRIBBLE_DIST + 0.15);
    ballPos.y = groundHeightAt(ballPos, ballPos.y) + R + 0.02;
    ballVel.set(dir.x * power, up, dir.z * power);
    held = false;
    pickupCooldown = KICK_COOLDOWN;
    stillTime = 0;
    playKickAnim(ent, strong);
    broadcastKick(strong);
    broadcastState(true);
  }


  let lastFbMoveSent = 0;
  function handleFootballMovement(delta, ent) {
    const { ix, iy, mag } = readInput();
    _head.copy(ent.group.position); _head.y += 1.4;
    const camFwd = _v1.copy(_head).sub(camera.position); camFwd.y = 0;
    if (camFwd.lengthSq() < 1e-4) camFwd.set(0, 0, 1);
    camFwd.normalize();
    const camRight = _v2.set(-camFwd.z, 0, camFwd.x);
    let moving = false;
    if (mag > 0.08) {
      const dir = new THREE.Vector3()
        .addScaledVector(camFwd, iy)
        .addScaledVector(camRight, ix);
      if (dir.lengthSq() > 1e-5) {
        dir.normalize();
        const running = runHeld || mag > 0.92;
        const speed = running ? RUN_SPEED() : WALK_SPEED();
        const step = speed * delta * (running ? 1 : Math.max(0.5, mag));
        const before = ent.group.position.clone();
        const cand = before.clone().addScaledVector(dir, step);
        if (!collidesAt(before, cand)) {
          ent.group.position.x = cand.x;
          ent.group.position.z = cand.z;
        }
        ent.group.rotation.y = Math.atan2(dir.x, dir.z);
        moving = true;
        if (!ent.__fbKicking) setPlayerAction(ent, running && ent.actions?.run ? "run" : "walk");
        me && (me.running = running);
      }
    }
    if (!moving) {
      ent.group.rotation.y = Math.atan2(camFwd.x, camFwd.z);
      if (!ent.__fbKicking) setPlayerAction(ent, "idle");
      me && (me.running = false);
    }
    const gy = groundHeightAt(ent.group.position, ent.group.position.y);
    ent.group.position.y += (gy - ent.group.position.y) * Math.min(1, delta * 12);
    // Pose por animação (idle/walk/run/kick): driven pelo painel admin "🎬 Animações".
    applyLocalAnimTuning(ent, delta);
    ent.target.copy(ent.group.position);

    if (me && myId) {
      const pct = percentFromWorld(ent.group.position.x, ent.group.position.z);
      me.x = pct.x; me.y = pct.y;
      const idx = players.findIndex((p) => p.id === myId);
      if (idx >= 0) players[idx] = { ...players[idx], ...me };
      const now = performance.now();
      if (now - lastFbMoveSent > 90) { lastFbMoveSent = now; trackMe(false).catch(() => {}); }
    }
  }

  const _prevPlayerPos = new THREE.Vector3();
  let _hasPrevPlayerPos = false;
  const _ballPrev = new THREE.Vector3();

  function simulateOwned(delta, ent) {
    const R = ballRadius();
    if (pickupCooldown > 0) pickupCooldown = Math.max(0, pickupCooldown - delta);

    // velocidade do jogador (XZ) — usada pra simular toques no drible
    let playerVx = 0, playerVz = 0, playerSpeed = 0;
    if (_hasPrevPlayerPos) {
      playerVx = (ent.group.position.x - _prevPlayerPos.x) / Math.max(1e-4, delta);
      playerVz = (ent.group.position.z - _prevPlayerPos.z) / Math.max(1e-4, delta);
      playerSpeed = Math.hypot(playerVx, playerVz);
    }
    _prevPlayerPos.copy(ent.group.position);
    _hasPrevPlayerPos = true;

    if (held) {
      const dir = aimDir(ent).clone();
      // ponto base: bem à frente do pé, com pequeno offset lateral
      const right = _v2.set(dir.z, 0, -dir.x);
      const target = _v3.copy(ent.group.position)
        .addScaledVector(dir, DRIBBLE_DIST)
        .addScaledVector(right, DRIBBLE_SIDE);
      // pequenos "toques": quando corre, a bola adianta um pouco em ciclos
      if (playerSpeed > 0.3) {
        dribblePhase += delta * (4 + playerSpeed * 1.2);
        const push = Math.max(0, Math.sin(dribblePhase)) * Math.min(0.18, playerSpeed * 0.04);
        target.addScaledVector(dir, push);
      } else {
        dribblePhase = 0;
      }
      target.y = groundHeightAt(target, ballPos.y) + R;
      ballPos.lerp(target, Math.min(1, delta * 18));
      // velocidade efetiva pra rotação visual = velocidade do jogador
      ballVel.set(playerVx, 0, playerVz);
      stillTime = 0;
    } else {
      ballVel.y += GRAVITY * delta;
      _ballPrev.copy(ballPos);
      ballPos.addScaledVector(ballVel, delta);

      // Colisão XZ contra paredes/objetos: reflete horizontalmente
      const horizMoved = Math.hypot(ballPos.x - _ballPrev.x, ballPos.z - _ballPrev.z);
      if (horizMoved > 0.001 && collidesAt(_ballPrev, ballPos)) {
        // calcula normal aproximada amostrando offset perpendicular
        const moveX = ballPos.x - _ballPrev.x;
        const moveZ = ballPos.z - _ballPrev.z;
        // tenta separar eixos pra decidir qual refletir
        const tryX = _ballPrev.clone(); tryX.x = ballPos.x;
        const tryZ = _ballPrev.clone(); tryZ.z = ballPos.z;
        const hitX = collidesAt(_ballPrev, tryX);
        const hitZ = collidesAt(_ballPrev, tryZ);
        if (hitX) ballVel.x = -ballVel.x * 0.55;
        if (hitZ) ballVel.z = -ballVel.z * 0.55;
        if (!hitX && !hitZ) { ballVel.x = -ballVel.x * 0.55; ballVel.z = -ballVel.z * 0.55; }
        ballPos.copy(_ballPrev);
        ballPos.x += ballVel.x * delta;
        ballPos.z += ballVel.z * delta;
      }

      // Chão: quique
      const gy = groundHeightAt(ballPos, ballPos.y) + R;
      if (ballPos.y <= gy) {
        ballPos.y = gy;
        if (ballVel.y < 0) ballVel.y = -ballVel.y * 0.55;
        if (Math.abs(ballVel.y) < 0.8) ballVel.y = 0;
        // atrito de rolagem (só quando no chão)
        const rolling = ballVel.y === 0;
        const f = Math.pow(rolling ? 0.35 : 0.92, delta);
        ballVel.x *= f; ballVel.z *= f;
        if (Math.hypot(ballVel.x, ballVel.z) < 0.12) { ballVel.x = 0; ballVel.z = 0; }
      }
      // Auto-pickup: só depois do cooldown e se a bola estiver lenta
      if (pickupCooldown === 0 && footballActive && ent &&
          ballVel.lengthSq() < 1.5 &&
          ballPos.distanceTo(ent.group.position) <= PICKUP_RANGE) {
        held = true;
      }
      // Segurança: posição inválida (NaN), bola muito longe ou parada há muito tempo → reseta no spawn.
      const bad = !isFinite(ballPos.x) || !isFinite(ballPos.y) || !isFinite(ballPos.z);
      const sp = spawnWorldPos(activeInter);
      const farAway = sp ? (Math.hypot(ballPos.x - sp.x, ballPos.z - sp.z) > 60) : false;
      if (ballVel.lengthSq() < 0.02 && !footballActive) stillTime += delta; else if (footballActive) stillTime = 0;
      if (bad || farAway || stillTime > 25) {
        resetBallToSpawn();
        stillTime = 0;
        broadcastState(true);
      }
    }
  }


  const spinAxis = new THREE.Vector3(1, 0, 0);
  window.__footballFrame = function (delta) {
    if (!activeInter || !ballGroup) {
      if (footballActive) exitFootball();
      return;
    }
    const ent = myEntity();
    if (!ballPlaced && ownerId == null) {
      const sp = spawnWorldPos(activeInter);
      if (sp) { ballPos.copy(sp); ballPlaced = true; }
    }


    const distToBall = ent ? ballPos.distanceTo(ent.group.position) : Infinity;
    const actR = Math.max(activeInter.trigger_radius || 2, 2);
    if (ent && !footballActive && distToBall <= actR) enterFootball();
    if (footballActive && distToBall > actR * 3 + 4 && !charging && ownerId !== myId) exitFootball();

    if (charging) { charge = Math.min(1, charge + delta / CHARGE_TIME); updateForceBar(); }

    if (footballActive && ent) handleFootballMovement(delta, ent);

    // habilita o botão de chute apenas quando o jogador estiver com a bola
    if (footballActive) {
      const kickBtn = document.getElementById("fbKick");
      if (kickBtn) {
        const has = (ownerId === myId) && held;
        kickBtn.classList.toggle("is-disabled", !has);
        kickBtn.style.opacity = has ? "" : "0.4";
        kickBtn.style.pointerEvents = has ? "" : "none";
      }
    }


    if (ownerId === myId) {
      simulateOwned(delta, ent);
      broadcastState(false);
    } else if (ownerId == null) {
      if (footballActive && ent && distToBall <= PICKUP_RANGE) { claimBall(); }
    } else {
      if (remoteBall) {
        ballPos.lerp(remoteBall.pos, Math.min(1, delta * 14));
        if (!remoteHeld) ballPos.addScaledVector(remoteBall.vel, delta * 0.4);
      }
      if (footballActive && ent && !remoteHeld && distToBall <= CAPTURE_RANGE) claimBall();
    }

    ballGroup.position.copy(ballPos);
    ballGroup.visible = true;
    const sp = Math.hypot(ballVel.x, ballVel.z);
    if (sp > 0.05) {
      spinAxis.set(ballVel.z, 0, -ballVel.x).normalize();
      ballGroup.rotateOnWorldAxis(spinAxis, (sp / ballRadius()) * delta);
    }

  };

  window.__footballCamera = function (delta) {
    const ent = myEntity();
    if (!ent) return;
    _head.copy(ent.group.position); _head.y += 1.35;
    camPitch = Math.max(0.08, Math.min(1.2, camPitch));
    camDist = Math.max(2.4, Math.min(8, camDist));
    const dir = new THREE.Vector3(
      Math.sin(camYaw) * Math.cos(camPitch),
      Math.sin(camPitch),
      Math.cos(camYaw) * Math.cos(camPitch),
    );
    const desired = _head.clone().addScaledVector(dir, camDist);
    const floorY = groundHeightAt(desired, desired.y) + 0.35;
    if (desired.y < floorY) desired.y = floorY;
    camera.position.lerp(desired, Math.min(1, delta * 9));
    camera.lookAt(_head);
  };

  let dragId = null, lastDX = 0, lastDY = 0;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (!footballActive) return;
    if (e.target.closest && e.target.closest("#footballHud")) return;
    dragId = e.pointerId; lastDX = e.clientX; lastDY = e.clientY;
  });
  window.addEventListener("pointermove", (e) => {
    if (dragId !== e.pointerId || !footballActive) return;
    const dx = e.clientX - lastDX, dy = e.clientY - lastDY;
    lastDX = e.clientX; lastDY = e.clientY;
    camYaw -= dx * 0.006;
    camPitch += dy * 0.005;
  });
  window.addEventListener("pointerup", (e) => { if (dragId === e.pointerId) dragId = null; });
  renderer.domElement.addEventListener("wheel", (e) => {
    if (!footballActive) return;
    e.preventDefault();
    camDist += e.deltaY * 0.01;
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    if (!footballActive) return;
    if (e.target.matches && e.target.matches("input, textarea")) return;
    const k = (e.key || "").toLowerCase();
    if (k === " " || k === "spacebar") { e.preventDefault(); if (!charging) { charging = true; charge = 0; } }
    else if (k === "shift") runHeld = true;
  });
  document.addEventListener("keyup", (e) => {
    if (!footballActive) return;
    const k = (e.key || "").toLowerCase();
    if (k === " " || k === "spacebar") { e.preventDefault(); releaseKick(); }
    else if (k === "shift") runHeld = false;
  });

  function releaseKick() {
    if (!charging) return;
    const strong = charge >= 0.5;
    charging = false;
    // só chuta de fato se tiver a posse da bola
    if (ownerId === myId && held) doKick(strong);
    charge = 0;
    updateForceBar();
  }


  function updateForceBar() {
    const fill = document.getElementById("fbForceFill");
    if (fill) fill.style.height = Math.round(charge * 100) + "%";
    const bar = document.getElementById("fbForceWrap");
    if (bar) bar.classList.toggle("is-charging", charging);
  }

  function bindHud() {
    window.__joyState = joy;
    const base = document.getElementById("fbJoy");
    const knob = document.getElementById("fbJoyKnob");
    if (base && knob) {
      const setKnob = (nx, ny) => { knob.style.transform = `translate(${nx * 34}px, ${ny * 34}px)`; };
      const moveJoy = (e) => {
        const r = base.getBoundingClientRect();
        let nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        let ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const len = Math.hypot(nx, ny);
        joy.run = len > 1; // arrastar para fora do círculo = correr
        if (len > 1) { nx /= len; ny /= len; }
        joy.x = nx; joy.y = -ny;
        setKnob(nx, ny);
      };
      base.addEventListener("pointerdown", (e) => {
        joy.active = true; joy.id = e.pointerId; base.setPointerCapture(e.pointerId); moveJoy(e);
      });
      base.addEventListener("pointermove", (e) => { if (joy.id === e.pointerId) moveJoy(e); });
      const end = (e) => { if (joy.id === e.pointerId) { joy.active = false; joy.id = null; joy.x = 0; joy.y = 0; joy.run = false; setKnob(0, 0); } };
      base.addEventListener("pointerup", end);
      base.addEventListener("pointercancel", end);
    }
    const kick = document.getElementById("fbKick");
    if (kick) {
      const down = (e) => { e.preventDefault(); if (!charging) { charging = true; charge = 0; } updateForceBar(); };
      const up = (e) => { e.preventDefault(); releaseKick(); };
      kick.addEventListener("pointerdown", down);
      kick.addEventListener("pointerup", up);
      kick.addEventListener("pointercancel", up);
    }
    const exit = document.getElementById("fbExit");
    if (exit) exit.addEventListener("click", () => exitFootball());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindHud);
  else bindHud();

  refreshBall();
})();

// ============================================================
// 🏃 Painel admin de Velocidades (movimento e animação)
// ============================================================
(function speedAdminPanel() {
  function bind() {
    const btn = document.getElementById("speedAdminToggle");
    const panel = document.getElementById("speedAdminPanel");
    if (!btn || !panel) return;
    const cfg = window.__speedCfg;
    if (!cfg) return;
    const rows = [
      { key: "walkN",    el: "spWalkN",   val: "spWalkNVal" },
      { key: "runN",     el: "spRunN",    val: "spRunNVal"  },
      { key: "walkFb",   el: "spWalkFb",  val: "spWalkFbVal"},
      { key: "runFb",    el: "spRunFb",   val: "spRunFbVal" },
      { key: "walkAnim", el: "spWalkA",   val: "spWalkAVal" },
      { key: "runAnim",  el: "spRunA",    val: "spRunAVal"  },
    ];
    function sync() {
      for (const r of rows) {
        const el = document.getElementById(r.el);
        const lbl = document.getElementById(r.val);
        if (!el || !lbl) continue;
        el.value = cfg[r.key];
        lbl.textContent = Number(cfg[r.key]).toFixed(2);
      }
    }
    sync();
    for (const r of rows) {
      const el = document.getElementById(r.el);
      const lbl = document.getElementById(r.val);
      if (!el) continue;
      el.addEventListener("input", () => {
        cfg[r.key] = Number(el.value);
        if (lbl) lbl.textContent = cfg[r.key].toFixed(2);
        if (r.key === "walkAnim" || r.key === "runAnim") window.__applyAnimSpeeds?.();
      });
    }
    // Slider: distância de renderização
    const rd = document.getElementById("spRenderDist");
    const rdv = document.getElementById("spRenderDistVal");
    if (rd) {
      rd.value = String(window.RENDER_DISTANCE || parseFloat(localStorage.getItem("neon-render-distance") || "160"));
      if (rdv) rdv.textContent = String(Math.round(+rd.value));
      rd.addEventListener("input", () => {
        if (rdv) rdv.textContent = String(Math.round(+rd.value));
        window.setRenderDistance?.(+rd.value);
      });
    }
    btn.addEventListener("click", () => { panel.hidden = !panel.hidden; if (!panel.hidden) sync(); });
    panel.querySelector("[data-panel-close]")?.addEventListener("click", () => { panel.hidden = true; });
    panel.querySelector("[data-panel-min]")?.addEventListener("click", () => {
      const body = panel.querySelector(".panel-body");
      if (body) body.style.display = body.style.display === "none" ? "" : "none";
    });
    document.getElementById("spSave")?.addEventListener("click", () => {
      window.__saveSpeedCfg?.();
      window.__applyAnimSpeeds?.();
      if (typeof addSystemLine === "function") addSystemLine("Velocidades salvas.");
    });
    document.getElementById("spReset")?.addEventListener("click", () => {
      Object.assign(cfg, { walkN: 1.4, runN: 3.2, walkFb: 2.3, runFb: 4.4, walkAnim: 1.0, runAnim: 1.0 });
      sync();
      window.__applyAnimSpeeds?.();
      window.__saveSpeedCfg?.();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();


// ============ Animações: painel admin (posição + ângulo por animação) ============
(function animAdminPanel() {
  const BUILTINS = [
    { v: "idle", label: "Idle (parado)" },
    { v: "walk", label: "Walk (andando)" },
    { v: "run", label: "Run (correndo)" },
    { v: "dance", label: "Dance" },
    { v: "wave", label: "Wave (acenar)" },
    { v: "kickWeak", label: "Kick fraco" },
    { v: "kickStrong", label: "Kick forte" },
  ];
  function bind() {
    const btn = document.getElementById("animAdminToggle");
    const panel = document.getElementById("animAdminPanel");
    const sel = document.getElementById("animSelect");
    const tunings = window.__animTunings;
    if (!btn || !panel || !sel || !tunings) return;
    const addBtn = document.getElementById("animAddBtn");
    const delBtn = document.getElementById("animDelBtn");
    const upBox = document.getElementById("animUploadBox");
    const upName = document.getElementById("animUpName");
    const upFile = document.getElementById("animUpFile");
    const upSend = document.getElementById("animUpSend");
    const upCancel = document.getElementById("animUpCancel");
    const upStatus = document.getElementById("animUpStatus");

    const fields = [
      { k: "offX", el: "anOffX", val: "anOffXVal", fixed: 2 },
      { k: "offY", el: "anOffY", val: "anOffYVal", fixed: 2 },
      { k: "offZ", el: "anOffZ", val: "anOffZVal", fixed: 2 },
      { k: "rotX", el: "anRotX", val: "anRotXVal", fixed: 0 },
      { k: "rotY", el: "anRotY", val: "anRotYVal", fixed: 0 },
      { k: "rotZ", el: "anRotZ", val: "anRotZVal", fixed: 0 },
    ];
    let current = "idle";

    function populateSelect() {
      const customs = window.__botAnimations || [];
      const prev = current;
      sel.innerHTML = "";
      const g1 = document.createElement("optgroup"); g1.label = "Nativas";
      for (const b of BUILTINS) {
        const o = document.createElement("option");
        o.value = b.v; o.textContent = b.label; g1.appendChild(o);
      }
      sel.appendChild(g1);
      if (customs.length) {
        const g2 = document.createElement("optgroup"); g2.label = "Customizadas";
        for (const a of customs) {
          const o = document.createElement("option");
          o.value = "custom:" + a.id;
          o.textContent = a.name;
          o.dataset.url = a.url;
          g2.appendChild(o);
        }
        sel.appendChild(g2);
      }
      sel.value = [...sel.options].some(o => o.value === prev) ? prev : "idle";
      current = sel.value;
      updateDelBtn();
    }

    function updateDelBtn() {
      if (delBtn) delBtn.hidden = !current.startsWith("custom:");
    }

    function ensureTuning(key) {
      if (!tunings[key]) tunings[key] = window.__defaultAnimTuning();
      return tunings[key];
    }

    function sync() {
      const t = ensureTuning(current);
      for (const f of fields) {
        const el = document.getElementById(f.el);
        const lbl = document.getElementById(f.val);
        if (!el) continue;
        const v = t[f.k] || 0;
        el.value = v;
        if (lbl) lbl.textContent = Number(v).toFixed(f.fixed);
      }
      updateDelBtn();
    }

    sel.addEventListener("change", () => { current = sel.value; sync(); });
    for (const f of fields) {
      const el = document.getElementById(f.el);
      const lbl = document.getElementById(f.val);
      if (!el) continue;
      el.addEventListener("input", () => {
        const v = Number(el.value);
        ensureTuning(current)[f.k] = v;
        if (lbl) lbl.textContent = v.toFixed(f.fixed);
      });
    }
    document.getElementById("anSave")?.addEventListener("click", () => {
      window.__saveAnimTunings?.(current);
      if (typeof addSystemLine === "function") addSystemLine(`Ajustes da animação "${sel.options[sel.selectedIndex]?.textContent || current}" salvos.`);
    });
    document.getElementById("anReset")?.addEventListener("click", () => {
      tunings[current] = window.__defaultAnimTuning();
      sync();
      window.__saveAnimTunings?.(current);
    });
    document.getElementById("anTest")?.addEventListener("click", async () => {
      const ent = (typeof myEntity === "function") ? myEntity() : null;
      if (!ent || !ent.actions || !ent.mixer) { console.warn("[anim test] sem entidade"); return; }
      if (current === "kickWeak" || current === "kickStrong") {
        window.__fbTestKick?.(current === "kickStrong");
        return;
      }
      const restoreIdle = (ms) => {
        setTimeout(() => {
          const idle = ent.actions?.idle;
          if (idle) { idle.reset().fadeIn(0.3).play(); ent.currentAction = "idle"; }
        }, ms);
      };
      if (current.startsWith("custom:")) {
        const opt = sel.options[sel.selectedIndex];
        const url = opt?.dataset?.url;
        if (!url) { console.warn("[anim test custom] sem url"); return; }
        try {
          const clip = await loadFbxClip(url);
          const bones = collectBoneNames(ent.character);
          const retarg = retargetClipToBones(clip, bones, { stripRootPosition: true });
          if (!retarg) { console.warn("[anim test custom] nenhum osso casou"); return; }
          if (ent.currentAction && ent.actions[ent.currentAction]) ent.actions[ent.currentAction].fadeOut(0.2);
          const action = ent.mixer.clipAction(retarg);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = false;
          action.reset().fadeIn(0.2).play();
          ent.currentAction = current; // permite que a tuning ao vivo aplique offsets/rotações
          const dur = Math.max(800, (retarg.duration || 1) * 1000);
          setTimeout(() => { try { action.fadeOut(0.3); } catch {} }, dur);
          restoreIdle(dur + 50);
        } catch (e) { console.warn("[anim test custom]", e); }
      } else if (ent.actions[current]) {
        try {
          if (ent.currentAction && ent.actions[ent.currentAction]) ent.actions[ent.currentAction].fadeOut(0.2);
          const action = ent.actions[current];
          action.reset().fadeIn(0.2).play();
          ent.currentAction = current;
          // Para emotes (wave/dance) volta pra idle após a duração do clip pra não congelar
          const clip = action.getClip ? action.getClip() : null;
          const dur = clip?.duration ? clip.duration * 1000 : 1200;
          if (current !== "idle" && current !== "walk" && current !== "run") {
            setTimeout(() => { try { action.fadeOut(0.3); } catch {} }, dur);
            restoreIdle(dur + 50);
          }
        } catch (e) { console.warn("[anim test builtin]", e); }
      } else {
        console.warn("[anim test] ação não carregada:", current);
      }
    });

    // Upload de animação nova
    addBtn?.addEventListener("click", () => {
      if (!isAdmin) { alert("Apenas admin."); return; }
      upBox.hidden = !upBox.hidden;
      if (!upBox.hidden) { upName.value = ""; upFile.value = ""; upStatus.textContent = ""; }
    });
    upCancel?.addEventListener("click", () => { upBox.hidden = true; });
    upSend?.addEventListener("click", async () => {
      const file = upFile.files?.[0];
      const name = (upName.value || "").trim();
      if (!file) { upStatus.textContent = "Escolha um arquivo .fbx"; return; }
      if (!name) { upStatus.textContent = "Dê um nome para a animação"; return; }
      try {
        upStatus.textContent = "Enviando " + file.name + "...";
        const path = `bot-anims/${Date.now()}-${(file.name || "anim.fbx").replace(/[^a-z0-9._-]+/gi, "_")}`;
        const { error: upErr } = await supabase.storage.from("map-assets").upload(path, file, { contentType: "application/octet-stream", upsert: false });
        if (upErr) { upStatus.textContent = "Erro: " + upErr.message; return; }
        const { data: pub } = supabase.storage.from("map-assets").getPublicUrl(path);
        const { error: insErr } = await supabase.from("bot_animations").insert({ name, url: pub.publicUrl, created_by: myId });
        if (insErr) { upStatus.textContent = "Erro: " + insErr.message; return; }
        upStatus.textContent = "Animação enviada!";
        upBox.hidden = true;
        // o realtime já recarrega botAnimations; populateSelect será chamado pelo evento
      } catch (e) { upStatus.textContent = "Erro: " + (e?.message || e); }
    });

    delBtn?.addEventListener("click", async () => {
      if (!current.startsWith("custom:")) return;
      const id = current.slice("custom:".length);
      const opt = sel.options[sel.selectedIndex];
      if (!confirm(`Excluir a animação "${opt?.textContent || id}"?`)) return;
      const key = current;
      const { error } = await supabase.from("bot_animations").delete().eq("id", id);
      if (error) { alert("Erro: " + error.message); return; }
      delete tunings[key];
      try { await window.__deleteAnimTuningRemote?.(key); } catch {}
      try { localStorage.setItem("neon-tap-room-anim-tunings", JSON.stringify(tunings)); } catch {}
      current = "idle";
    });

    window.addEventListener("bot-animations:updated", () => { populateSelect(); sync(); });
    window.addEventListener("animation-tunings:updated", () => { if (!panel.hidden) sync(); });

    btn.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) { populateSelect(); sync(); }
    });
    panel.querySelector("[data-panel-close]")?.addEventListener("click", () => { panel.hidden = true; });
    panel.querySelector("[data-panel-min]")?.addEventListener("click", () => {
      const body = panel.querySelector(".panel-body");
      if (body) body.style.display = body.style.display === "none" ? "" : "none";
    });
    populateSelect();
    sync();
  }
  // Bind seguro: aguarda DOM e idempotente (não duplica)
  let _bound = false;
  function _safeBind() {
    if (_bound) return;
    const btn = document.getElementById("animAdminToggle");
    const panel = document.getElementById("animAdminPanel");
    if (!btn || !panel || !window.__animTunings) { setTimeout(_safeBind, 200); return; }
    _bound = true;
    bind();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", _safeBind);
  else _safeBind();
})();



// ============ CARS MODULE ============
// Sistema arcade de carros: carros vivem em map_cars (Lovable Cloud).
// Admin: catálogo + tuning de rodas/velocidade. Usuário: F (ou botão) p/ entrar
// quando próximo; sai apenas com velocidade = 0.
(function carsModule() {
  const DEFAULT_WHEEL_OFFSETS = {
    fl:{x:-0.78,y:0.1,z:1.25}, fr:{x:0.75,y:0.1,z:1.25},
    rl:{x:-0.78,y:0.1,z:-1.25},  rr:{x:0.75,y:0.1,z:-1.25},
    scale: 1,
  };
  const cars = new Map(); // id -> { row, group, chassisGroup, wheels{fl,fr,rl,rr}, state, __netTarget? }
  let catalog = []; // [{id,name,...}]
  let channel = null;
  let currentMap = null;
  let driving = null; // car instance currently driven
  let riding = null;  // car instance we're passenger of
  let promptCarId = null;
  let promptCarOccupied = false;
  const carKeys = new Set();
  // botões on-screen
  const padState = { fwd:false, back:false, left:false, right:false, brake:false };

  const carsGroup = new THREE.Group();
  carsGroup.name = "CarsRoot";
  scene.add(carsGroup);

  // Helpers de colisão (reutiliza groundHeightAt + colliderMeshes globais)
  const _carRay = new THREE.Raycaster();
  const _carDown = new THREE.Vector3(0,-1,0);
  const _carFwd = new THREE.Vector3();
  const _carTmpA = new THREE.Vector3();
  const _carTmpB = new THREE.Vector3();

  function disposeCar(c) {
    if (!c) return;
    carsGroup.remove(c.group);
    c.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose?.());
      }
    });
  }

  async function loadCatalog() {
    const { data, error } = await supabase.from("cars_catalog").select("*").order("name");
    if (error) { console.warn("[cars] catalog", error); return; }
    catalog = data || [];
    renderCatalogPicker();
  }

  function makeWheelFallback(radius) {
    const g = new THREE.CylinderGeometry(radius, radius, radius*0.55, 18);
    g.rotateZ(Math.PI/2);
    const m = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.65, metalness: 0.2 });
    return new THREE.Mesh(g, m);
  }

  // Se o GLB tiver várias rodas (ou o carro inteiro), descarta e usa procedural.
  // Aceita apenas GLBs de UMA roda (≤1.2m em XZ).
  function tryExtractSingleWheel(scene) {
    if (!scene) return null;
    let meshCount = 0;
    scene.traverse(o => { if (o.isMesh) meshCount++; });
    if (!meshCount) return null;
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    // Só rejeita se for claramente o carro inteiro (várias rodas + tamanho de chassi).
    if (Math.max(size.x, size.z) > 2.5) {
      console.warn("[cars] GLB da roda parece conter o carro inteiro — usando rodas procedurais.", { size });
      return null;
    }
    const clone = scene.clone(true);
    clone.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const cb = new THREE.Box3().setFromObject(clone);
    const center = cb.getCenter(new THREE.Vector3());
    clone.position.sub(center);
    const wrap = new THREE.Group();
    wrap.add(clone);
    return wrap;
  }

  async function spawnCarMesh(row) {
    const group = new THREE.Group();
    group.name = `Car:${row.name}`;
    group.position.set(row.x || 0, row.y || 0, row.z || 0);
    group.rotation.y = row.rotation_y || 0;
    const chassisGroup = new THREE.Group();
    chassisGroup.position.y = row.chassis_offset_y || 0;
    chassisGroup.scale.setScalar(row.chassis_scale || 1);
    group.add(chassisGroup);
    // load chassis
    try {
      const gltf = await new Promise((res, rej) => loader.load(row.chassis_url, res, undefined, rej));
      const m = gltf.scene || gltf.scenes?.[0];
      if (m) {
        m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        chassisGroup.add(m);
      }
    } catch (e) {
      console.warn("[cars] chassis load fail", row.chassis_url, e);
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.9, 4),
        new THREE.MeshStandardMaterial({ color: 0xaa3333 })
      );
      fallback.position.y = 0.5;
      chassisGroup.add(fallback);
    }
    // wheels
    const wheelOffsets = row.wheel_offsets || DEFAULT_WHEEL_OFFSETS;
    const wheelScale = wheelOffsets.scale ?? 1;
    const radius = row.wheel_radius || 0.35;
    let wheelTemplate = null;
    if (row.wheel_url) {
      try {
        const gltf = await new Promise((res, rej) => loader.load(row.wheel_url, res, undefined, rej));
        const raw = gltf.scene || gltf.scenes?.[0];
        wheelTemplate = tryExtractSingleWheel(raw);
      } catch (e) { console.warn("[cars] wheel load fail", e); }
    }
    const wheels = {};
    const rotY = ((wheelOffsets.rotY ?? 0) * Math.PI) / 180;
    const mirror = wheelOffsets.mirror || "xz"; // "xz" | "x" | "z" | "none"
    for (const k of ["fl","fr","rl","rr"]) {
      const off = wheelOffsets[k] || DEFAULT_WHEEL_OFFSETS[k];
      const node = new THREE.Group();
      node.position.set(off.x, off.y, off.z);
      const spinPivot = new THREE.Group();
      spinPivot.scale.setScalar(wheelScale);
      node.add(spinPivot);
      let visual;
      if (wheelTemplate) {
        visual = wheelTemplate.clone(true);
        const isRight = (k === "fr" || k === "rr");
        const sx = (isRight && (mirror === "x" || mirror === "xz")) ? -1 : 1;
        const sz = (isRight && (mirror === "z" || mirror === "xz")) ? -1 : 1;
        visual.scale.set(sx, 1, sz);
        visual.rotation.y = rotY;
      } else {
        visual = makeWheelFallback(radius);
      }
      spinPivot.add(visual);
      node.userData.spin = spinPivot;
      node.userData.visual = visual;
      group.add(node);
      wheels[k] = node;
    }
    return { group, chassisGroup, wheels };
  }

  function applyWheelTransforms(c, wo) {
    const scl = wo.scale ?? 1;
    const rotY = ((wo.rotY ?? 0) * Math.PI) / 180;
    const mirror = wo.mirror || "xz";
    for (const k of ["fl","fr","rl","rr"]) {
      const off = wo[k] || DEFAULT_WHEEL_OFFSETS[k];
      c.wheels[k].position.set(off.x, off.y, off.z);
      c.wheels[k].userData.spin.scale.setScalar(scl);
      const vis = c.wheels[k].userData.visual;
      if (vis) {
        const isRight = (k === "fr" || k === "rr");
        const sx = (isRight && (mirror === "x" || mirror === "xz")) ? -1 : 1;
        const sz = (isRight && (mirror === "z" || mirror === "xz")) ? -1 : 1;
        vis.scale.set(sx, 1, sz);
        vis.rotation.y = rotY;
      }
    }
  }

  async function upsertCarFromRow(row) {
    const existing = cars.get(row.id);
    if (existing) {
      const isLocalDriver = driving && driving.row.id === row.id;
      const livePose = isLocalDriver
        ? {
            x: existing.group.position.x,
            y: existing.group.position.y,
            z: existing.group.position.z,
            rotation_y: existing.state.yaw,
          }
        : null;
      Object.assign(existing.row, row);
      if (livePose) Object.assign(existing.row, livePose);
      if (!driving || driving.row.id !== row.id) {
        existing.__netTarget = existing.__netTarget || {};
        existing.__netTarget.x = row.x||0;
        existing.__netTarget.y = row.y||0;
        existing.__netTarget.z = row.z||0;
        existing.__netTarget.yaw = row.rotation_y || 0;
      }
      const wo = row.wheel_offsets || DEFAULT_WHEEL_OFFSETS;
      applyWheelTransforms(existing, wo);
      existing.chassisGroup.position.y = row.chassis_offset_y || 0;
      existing.chassisGroup.scale.setScalar(row.chassis_scale || 1);
      if (isLocalDriver) {
        existing.state.yaw = livePose.rotation_y;
        existing.group.position.set(livePose.x, livePose.y, livePose.z);
        existing.group.rotation.y = livePose.rotation_y;
      }
      return existing;
    }
    const mesh = await spawnCarMesh(row);
    carsGroup.add(mesh.group);
    const c = {
      row,
      group: mesh.group,
      chassisGroup: mesh.chassisGroup,
      wheels: mesh.wheels,
      state: { vel: 0, steer: 0, yaw: row.rotation_y || 0, wheelSpin: 0 },
    };
    cars.set(row.id, c);
    return c;
  }

  async function loadCarsForMap(mapId) {
    currentMap = mapId;
    for (const c of cars.values()) disposeCar(c);
    cars.clear();
    const { data, error } = await supabase.from("map_cars").select("*").eq("map_id", mapId);
    if (error) { console.warn("[cars] load", error); return; }
    for (const row of data || []) {
      try {
        const c = await upsertCarFromRow(row);
        await clearStaleDriver(c);
      } catch (e) { console.warn("[cars] spawn", e); }
    }
    renderAdminList();
  }

  async function carsEnterRoom(mapId) {
    await loadCatalog();
    await loadCarsForMap(mapId);
    if (channel) await supabase.removeChannel(channel);
    channel = supabase.channel(`cars-${mapId}`, { config: { broadcast: { self: false } } })
      .on("postgres_changes", { event:"*", schema:"public", table:"map_cars", filter:`map_id=eq.${mapId}` }, async (payload) => {
        if (payload.eventType === "DELETE") {
          const c = cars.get(payload.old.id);
          if (c) { disposeCar(c); cars.delete(payload.old.id); }
          renderAdminList();
          return;
        }
        const row = payload.new;
        try { await upsertCarFromRow(row); renderAdminList(); } catch {}
      })
      .on("broadcast", { event: "pos" }, ({ payload }) => {
        const c = cars.get(payload.id);
        if (!c) return;
        if (driving && driving.row.id === payload.id) return;
        c.__netTarget = { x: payload.x, y: payload.y, z: payload.z, yaw: payload.yaw, vel: payload.vel || 0 };
      })
      .subscribe();
  }
  async function carsLeaveRoom() {
    if (channel) { await supabase.removeChannel(channel); channel = null; }
    for (const c of cars.values()) disposeCar(c);
    cars.clear();
    if (driving) await exitCar(true);
    if (riding) exitPassenger();
  }
  window.carsEnterRoom = carsEnterRoom;
  window.carsLeaveRoom = carsLeaveRoom;

  // ============ DRIVING ============
  function myPos() {
    const ent = myId ? playerEntities.get(myId) : null;
    return ent?.group?.position || null;
  }

  const DRIVER_HEARTBEAT_MS = 12000;
  function isDriverFresh(row) {
    if (!row?.driver_user_id) return false;
    const t = Date.parse(row.driver_since || "");
    return Number.isFinite(t) && (Date.now() - t) < DRIVER_HEARTBEAT_MS;
  }
  function isCarOccupied(c) {
    return !!(c?.row?.driver_user_id && isDriverFresh(c.row));
  }
  async function clearStaleDriver(c) {
    if (!c?.row?.driver_user_id || isDriverFresh(c.row)) return false;
    c.row.driver_user_id = null;
    c.row.driver_since = null;
    try {
      await supabase.from("map_cars").update({ driver_user_id: null, driver_since: null }).eq("id", c.row.id);
    } catch {}
    return true;
  }

  // Retorna o carro mais próximo (livre OU ocupado). Sinaliza se está ocupado.
  function nearestCarAny(maxDist = 3.2) {
    const p = myPos();
    if (!p) return null;
    let best = null, bestD = Infinity;
    for (const c of cars.values()) {
      const d = c.group.position.distanceTo(p);
      if (d < bestD) { bestD = d; best = c; }
    }
    return bestD <= maxDist ? best : null;
  }

  async function enterCar(c) {
    if (driving || riding || !c) return;
    await clearStaleDriver(c);
    const { data, error } = await supabase
      .from("map_cars")
      .update({ driver_user_id: myId, driver_since: new Date().toISOString() })
      .eq("id", c.row.id)
      .is("driver_user_id", null)
      .select()
      .maybeSingle();
    if (error || !data) {
      addSystemLine?.("Esse carro já está sendo dirigido.");
      return;
    }
    Object.assign(c.row, data);
    driving = c;
    window.__drivingCar = c;
    c.state.vel = 0; c.state.steer = 0; c.state.yaw = c.group.rotation.y;
    const ent = playerEntities.get(myId);
    if (ent) { ent.group.visible = false; if (ent.plate) ent.plate.style.opacity = "0"; }
    document.body.classList.add("driving-on");
    const hud = document.getElementById("carHud");
    if (hud) hud.hidden = false;
    const prompt = document.getElementById("carPrompt");
    if (prompt) prompt.hidden = true;
    if (controls) controls.enabled = false;
  }

  async function exitCar(force = false) {
    if (!driving) return;
    const c = driving;
    if (!force && Math.abs(c.state.vel) > 0.05) {
      addSystemLine?.("Pare o carro antes de sair.");
      return;
    }
    try {
      await supabase.from("map_cars").update({
        x: c.group.position.x, y: c.group.position.y, z: c.group.position.z,
        rotation_y: c.state.yaw,
        driver_user_id: null, driver_since: null,
      }).eq("id", c.row.id);
    } catch {}
    c.row.driver_user_id = null;
    driving = null;
    window.__drivingCar = null;
    document.body.classList.remove("driving-on");
    const hud = document.getElementById("carHud");
    if (hud) hud.hidden = true;
    const ent = playerEntities.get(myId);
    if (ent) {
      ent.group.visible = true;
      const fwd = new THREE.Vector3(Math.sin(c.state.yaw), 0, Math.cos(c.state.yaw));
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const exitPos = c.group.position.clone().addScaledVector(side, 1.6);
      ent.group.position.copy(exitPos);
      ent.target.copy(exitPos);
      if (me) {
        const pct = percentFromWorld(exitPos.x, exitPos.z);
        me.x = Math.max(5, Math.min(95, pct.x));
        me.y = Math.max(8, Math.min(92, pct.y));
        trackMe?.(true).catch(() => {});
      }
    }
    if (controls) controls.enabled = true;
  }

  // ============ PASSENGER (carona) ============
  function enterPassenger(c) {
    if (driving || riding || !c) return;
    if (!c.row.driver_user_id) {
      addSystemLine?.("Esse carro está vazio — entre como motorista (F).");
      return;
    }
    if (!isCarOccupied(c)) {
      clearStaleDriver(c);
      addSystemLine?.("Esse carro está vazio — entre como motorista (F).");
      return;
    }
    riding = c;
    window.__ridingCar = c;
    document.body.classList.add("driving-on");
    const hud = document.getElementById("carHud");
    if (hud) {
      hud.hidden = false;
      hud.classList.add("passenger-mode");
    }
    const prompt = document.getElementById("carPrompt");
    if (prompt) prompt.hidden = true;
    if (controls) controls.enabled = false;
    addSystemLine?.("Você está de carona. Aperte F para sair.");
  }

  function exitPassenger() {
    if (!riding) return;
    const c = riding;
    riding = null;
    window.__ridingCar = null;
    document.body.classList.remove("driving-on");
    const hud = document.getElementById("carHud");
    if (hud) { hud.hidden = true; hud.classList.remove("passenger-mode"); }
    const ent = playerEntities.get(myId);
    if (ent) {
      const fwd = new THREE.Vector3(Math.sin(c.state.yaw), 0, Math.cos(c.state.yaw));
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const exitPos = c.group.position.clone().addScaledVector(side, -1.6);
      ent.group.position.copy(exitPos);
      ent.target.copy(exitPos);
      if (me) {
        const pct = percentFromWorld(exitPos.x, exitPos.z);
        me.x = Math.max(5, Math.min(95, pct.x));
        me.y = Math.max(8, Math.min(92, pct.y));
        trackMe?.(true).catch(() => {});
      }
    }
    if (controls) controls.enabled = true;
  }

  function updatePassengerFrame(delta) {
    if (!riding) return;
    const c = riding;
    // Sai automaticamente se o motorista saiu (carro virou livre)
    if (!isCarOccupied(c)) { clearStaleDriver(c); exitPassenger(); return; }
    const ent = playerEntities.get(myId);
    if (!ent) return;
    // Posiciona o player no banco do carona (lado direito atrás)
    const yaw = c.state.yaw;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const pos = c.group.position.clone()
      .addScaledVector(side, 0.55)
      .addScaledVector(fwd, -0.2);
    pos.y = c.group.position.y + 0.9;
    ent.group.position.copy(pos);
    ent.group.rotation.y = yaw;
    ent.target.copy(pos);
    // Câmera 3a pessoa do carro (segue firme, sem double-smoothing)
    const camTarget = c.group.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const camWant = c.group.position.clone()
      .addScaledVector(fwd, -6.5)
      .add(new THREE.Vector3(0, 3.2, 0));
    const camK = Math.min(1, delta * 12);
    const tgtK = Math.min(1, delta * 16);
    camera.position.lerp(camWant, camK);
    controls.target.lerp(camTarget, tgtK);
    camera.lookAt(controls.target);
    // Broadcast posição p/ outros players verem o passageiro andando
    if (me) {
      const pct = percentFromWorld(pos.x, pos.z);
      me.x = Math.max(0, Math.min(100, pct.x));
      me.y = Math.max(0, Math.min(100, pct.y));
      const now = performance.now();
      if (!riding.__lastBcast || now - riding.__lastBcast > 90) {
        riding.__lastBcast = now;
        trackMe?.(false).catch(() => {});
      }
    }
  }

  function carInput() {
    const fwd = carKeys.has("w") || carKeys.has("arrowup") || padState.fwd ? 1 : 0;
    const back = carKeys.has("s") || carKeys.has("arrowdown") || padState.back ? 1 : 0;
    const left = carKeys.has("a") || carKeys.has("arrowleft") || padState.left ? 1 : 0;
    const right = carKeys.has("d") || carKeys.has("arrowright") || padState.right ? 1 : 0;
    const brake = carKeys.has(" ") || padState.brake ? 1 : 0;
    return { throttle: fwd - back, steer: right - left, brake };
  }

  // Verifica colisão à frente (parede ou objeto alto)
  function hasObstacleAt(from, to) {
    if (!colliderMeshes || !colliderMeshes.length) return false;
    _carFwd.copy(to).sub(from); _carFwd.y = 0;
    const dist = _carFwd.length();
    if (dist < 1e-4) return false;
    _carFwd.normalize();
    // Raio na altura do parachoque (~0.7m)
    _carTmpA.set(from.x, from.y + 0.7, from.z);
    _carRay.set(_carTmpA, _carFwd);
    _carRay.far = dist + 0.9;
    const hits = _carRay.intersectObjects(colliderMeshes, false);
    return !!(hits.length && hits[0].distance < dist + 0.9);
  }

  function simulateDriving(delta) {
    const c = driving;
    if (!c) return;
    const r = c.row;
    const inp = carInput();
    const maxSpeed = r.max_speed || 20;
    const accel = r.acceleration || 8;
    const brakeF = r.brake_force || 14;
    const turn = r.turn_speed || 2.2;
    if (inp.throttle > 0) c.state.vel += accel * delta;
    else if (inp.throttle < 0) c.state.vel -= accel * 0.7 * delta;
    else c.state.vel *= Math.pow(0.65, delta);
    if (inp.brake) {
      const decel = brakeF * delta;
      if (Math.abs(c.state.vel) <= decel) c.state.vel = 0;
      else c.state.vel -= Math.sign(c.state.vel) * decel;
    }
    c.state.vel = Math.max(-maxSpeed*0.5, Math.min(maxSpeed, c.state.vel));
    const targetSteer = inp.steer * 0.6;
    c.state.steer += (targetSteer - c.state.steer) * Math.min(1, delta * 8);
    const speedFactor = Math.min(1, Math.abs(c.state.vel) / 4);
    c.state.yaw -= c.state.steer * turn * delta * speedFactor * Math.sign(c.state.vel || 1);
    const fwd = new THREE.Vector3(Math.sin(c.state.yaw), 0, Math.cos(c.state.yaw));
    // Tenta mover; se bater em parede/obstáculo, zera velocidade
    const from = c.group.position.clone();
    const to = from.clone().addScaledVector(fwd, c.state.vel * delta);
    if (hasObstacleAt(from, to)) {
      c.state.vel *= -0.15; // pequeno ricochete
    } else {
      c.group.position.copy(to);
    }
    c.group.rotation.y = c.state.yaw;
    // Segue o chão (rampas, plataformas)
    try {
      const gy = groundHeightAt(c.group.position, c.group.position.y);
      c.group.position.y += (gy - c.group.position.y) * Math.min(1, delta * 12);
    } catch {}
    // rodas
    const wr = r.wheel_radius || 0.35;
    c.state.wheelSpin -= (c.state.vel * delta) / wr;
    for (const k of ["fl","fr","rl","rr"]) {
      const w = c.wheels[k];
      if (!w) continue;
      // Front wheels (visually) are rl/rr after the wheel-position swap
      if (k === "rl" || k === "rr") w.rotation.y = c.state.steer;
      w.userData.spin.rotation.x = c.state.wheelSpin;
    }
    // HUD
    const sv = document.getElementById("carSpeedVal");
    if (sv) sv.textContent = String(Math.round(Math.abs(c.state.vel) * 3.6));
    const exitBtn = document.getElementById("carExitBtn");
    if (exitBtn) exitBtn.disabled = Math.abs(c.state.vel) > 0.05;
    // Câmera
    const camTarget = c.group.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const camWant = c.group.position.clone()
      .addScaledVector(fwd, -6.5)
      .add(new THREE.Vector3(0, 3.2, 0));
    camera.position.lerp(camWant, Math.min(1, delta * 4));
    controls.target.lerp(camTarget, Math.min(1, delta * 6));
    camera.lookAt(controls.target);
    // Mantém a entidade do jogador acompanhando o carro (evita "snap" ao sair
    // e garante que outros players vejam o avatar junto do carro).
    const ent = playerEntities.get(myId);
    if (ent) {
      // Posiciona no banco do motorista (lado esquerdo, sentado)
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const seat = c.group.position.clone()
        .addScaledVector(side, -0.55)
        .addScaledVector(fwd, -0.2);
      seat.y = c.group.position.y + 0.9;
      ent.group.position.copy(seat);
      ent.group.rotation.y = c.state.yaw;
      ent.target.copy(seat);
      ent.group.visible = true;
    }
    if (me) {
      const pct = percentFromWorld(c.group.position.x, c.group.position.z);
      me.x = Math.max(0, Math.min(100, pct.x));
      me.y = Math.max(0, Math.min(100, pct.y));
    }
    // Broadcast a posição p/ outros players (a cada ~80ms)
    const now = performance.now();
    if (!c.__lastBcast || now - c.__lastBcast > 80) {
      c.__lastBcast = now;
      try {
        channel?.send({
          type: "broadcast",
          event: "pos",
          payload: {
            id: c.row.id,
            x: c.group.position.x, y: c.group.position.y, z: c.group.position.z,
            yaw: c.state.yaw, vel: c.state.vel,
          },
        });
      } catch {}
      try { trackMe?.(false); } catch {}
    }
    // Persiste posição no DB a cada ~3s (assim, se o motorista cair / fechar
    // a aba sem sair pelo botão, o carro fica onde parou pra todos.)
    if (!c.__lastDbSave || now - c.__lastDbSave > 3000) {
      c.__lastDbSave = now;
      const driverSince = new Date().toISOString();
      c.row.driver_since = driverSince;
      c.row.driver_user_id = myId;
      try {
        supabase.from("map_cars").update({
          x: c.group.position.x, y: c.group.position.y, z: c.group.position.z,
          rotation_y: c.state.yaw,
          driver_user_id: myId, driver_since: driverSince,
        }).eq("id", c.row.id).then(() => {});
      } catch {}
    }
  }

  // Lerp visual dos carros que NÃO estamos dirigindo (usa último broadcast OU posição do DB)
  function updateRemoteCars(delta) {
    for (const c of cars.values()) {
      if (driving && driving.row.id === c.row.id) continue;
      const t = c.__netTarget;
      if (t) {
        // Lerp mais firme quando estamos de carona neste carro (reduz travamento percebido)
        const ridingThis = riding && riding.row.id === c.row.id;
        const kxz = Math.min(1, delta * (ridingThis ? 18 : 10));
        const ky  = Math.min(1, delta * (ridingThis ? 14 : 8));
        const kr  = Math.min(1, delta * (ridingThis ? 18 : 10));
        c.group.position.x += (t.x - c.group.position.x) * kxz;
        c.group.position.y += (t.y - c.group.position.y) * ky;
        c.group.position.z += (t.z - c.group.position.z) * kxz;
        let dy = t.yaw - c.state.yaw;
        while (dy > Math.PI) dy -= Math.PI*2;
        while (dy < -Math.PI) dy += Math.PI*2;
        c.state.yaw += dy * kr;
        c.group.rotation.y = c.state.yaw;
        // Roda visual com base na velocidade transmitida
        const wr = c.row.wheel_radius || 0.35;
        c.state.wheelSpin -= ((t.vel || 0) * delta) / wr;
        for (const k of ["fl","fr","rl","rr"]) {
          const w = c.wheels[k]; if (!w) continue;
          w.userData.spin.rotation.x = c.state.wheelSpin;
        }
      }
    }
  }

  function updatePrompt() {
    if (driving || riding) return;
    const c = nearestCarAny();
    const prompt = document.getElementById("carPrompt");
    if (!prompt) return;
    if (c) {
      promptCarId = c.row.id;
      promptCarOccupied = isCarOccupied(c);
      if (c.row.driver_user_id && !promptCarOccupied) clearStaleDriver(c).then(() => updatePrompt()).catch(() => {});
      const txt = prompt.querySelector(".car-prompt-text");
      const enterBtn = document.getElementById("carEnterBtn");
      const rideBtn = document.getElementById("carRideBtn");
      if (promptCarOccupied) {
        if (txt) txt.textContent = `${c.row.name} (em uso) — Carona`;
        if (enterBtn) enterBtn.hidden = true;
        if (rideBtn) rideBtn.hidden = false;
      } else {
        if (txt) txt.textContent = `Entrar no ${c.row.name}`;
        if (enterBtn) enterBtn.hidden = false;
        if (rideBtn) rideBtn.hidden = true;
      }
      prompt.hidden = false;
    } else {
      promptCarId = null;
      promptCarOccupied = false;
      prompt.hidden = true;
    }
  }

  window.__carsFrame = function (delta) {
    if (driving) simulateDriving(delta);
    else if (riding) updatePassengerFrame(delta);
    else updatePrompt();
    updateRemoteCars(delta);
    // Esconde personagens (e nameplates) de quem está dentro de um carro
    const hide = new Set();
    for (const c of cars.values()) {
      const dId = c?.row?.driver_user_id;
      if (dId && isDriverFresh(c.row)) hide.add(dId);
    }
    window.__hiddenDrivers = hide;
    for (const [id, ent] of playerEntities) {
      if (hide.has(id)) {
        if (ent.group.visible) ent.group.visible = false;
        if (ent.plate) ent.plate.style.opacity = "0";
        if (ent.loadingSpinner) ent.loadingSpinner.style.opacity = "0";
      }
    }
  };

  // ============ INPUT ============
  document.addEventListener("keydown", (e) => {
    if (e.target?.matches?.("input, textarea")) return;
    const k = (e.key || "").toLowerCase();
    if (k === "f" && !driving && !riding && promptCarId) {
      e.preventDefault();
      const c = cars.get(promptCarId);
      if (!c) return;
      if (promptCarOccupied) enterPassenger(c);
      else enterCar(c);
      return;
    }
    if (k === "f" && driving) {
      e.preventDefault();
      exitCar();
      return;
    }
    if (k === "f" && riding) {
      e.preventDefault();
      exitPassenger();
      return;
    }
    if (driving) {
      if (["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) {
        e.preventDefault();
        carKeys.add(k);
        try { keyState.delete(k); } catch {}
      }
    }
  });
  document.addEventListener("keyup", (e) => {
    const k = (e.key || "").toLowerCase();
    carKeys.delete(k);
  });

  function bindHud() {
    document.getElementById("carEnterBtn")?.addEventListener("click", () => {
      if (driving || riding || !promptCarId) return;
      const c = cars.get(promptCarId);
      if (c) enterCar(c);
    });
    document.getElementById("carRideBtn")?.addEventListener("click", () => {
      if (driving || riding || !promptCarId) return;
      const c = cars.get(promptCarId);
      if (c) enterPassenger(c);
    });
    document.getElementById("carExitBtn")?.addEventListener("click", () => {
      if (driving) exitCar();
      else if (riding) exitPassenger();
    });
    const bind = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      const on = (e) => { e.preventDefault(); padState[key] = true; };
      const off = (e) => { e.preventDefault(); padState[key] = false; };
      el.addEventListener("pointerdown", on);
      el.addEventListener("pointerup", off);
      el.addEventListener("pointercancel", off);
      el.addEventListener("pointerleave", off);
    };
    bind("carBtnFwd","fwd");
    bind("carBtnBack","brake"); // pedal esquerdo é freio
    bind("carBtnL","left"); bind("carBtnR","right"); bind("carBtnBrake","brake");
  }

  // ============ ADMIN PANEL ============
  function renderCatalogPicker() {
    const sel = document.getElementById("carCatalogPicker");
    if (sel) {
      sel.innerHTML = catalog.length
        ? catalog.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")
        : `<option value="">— nenhum no catálogo —</option>`;
    }
    const list = document.getElementById("carCatalogList");
    if (list) {
      if (!catalog.length) {
        list.innerHTML = `<div style="opacity:0.6;font-size:11px;">Nenhum modelo cadastrado.</div>`;
      } else {
        list.innerHTML = catalog.map(c => `
          <div style="display:flex;align-items:center;gap:6px;padding:4px 6px;background:rgba(255,255,255,0.03);border:1px solid #2a3040;border-radius:4px;">
            <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.name)}</span>
            <button data-cat-del="${c.id}" title="Excluir do catálogo" style="background:#3a1020;color:#ff6680;border:1px solid #5a2030;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;">×</button>
          </div>
        `).join("");
        list.querySelectorAll("[data-cat-del]").forEach(b =>
          b.addEventListener("click", () => deleteCatalogCar(b.dataset.catDel))
        );
      }
    }
  }

  async function deleteCatalogCar(id) {
    const cat = catalog.find(c => c.id === id);
    if (!cat) return;
    if (!confirm(`Excluir o modelo "${cat.name}" do catálogo? Carros já no mapa continuam existindo.`)) return;
    const { error } = await supabase.from("cars_catalog").delete().eq("id", id);
    if (error) { alert("Falha ao excluir: " + error.message); return; }
    catalog = catalog.filter(c => c.id !== id);
    renderCatalogPicker();
    addSystemLine?.("Modelo removido do catálogo.");
  }


  function renderAdminList() {
    const list = document.getElementById("carsAdminList");
    if (!list) return;
    const rows = Array.from(cars.values()).map(c => c.row);
    if (!rows.length) { list.innerHTML = `<div style="opacity:0.6;font-size:12px;">Nenhum carro neste mapa.</div>`; return; }
    list.innerHTML = rows.map(r => `
      <div class="car-row" data-id="${r.id}">
        <div class="car-name">🚗 ${escapeHtml(r.name)}</div>
        <button data-tune="${r.id}">Ajustar</button>
        <button data-here="${r.id}">Trazer</button>
        <button class="danger" data-del="${r.id}">×</button>
      </div>
    `).join("");
    list.querySelectorAll("[data-tune]").forEach(b => b.addEventListener("click", () => openTune(b.dataset.tune)));
    list.querySelectorAll("[data-here]").forEach(b => b.addEventListener("click", () => bringHere(b.dataset.here)));
    list.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => deleteCar(b.dataset.del)));
  }

  async function bringHere(id) {
    const c = cars.get(id); if (!c) return;
    const p = myPos(); if (!p) return;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const spawn = p.clone().addScaledVector(fwd, 3);
    await supabase.from("map_cars").update({ x: spawn.x, y: 0, z: spawn.z }).eq("id", id);
  }
  async function deleteCar(id) {
    if (!confirm("Excluir este carro do mapa?")) return;
    // Se eu estiver dirigindo/de carona neste carro, sai antes.
    if (driving && driving.row.id === id) { try { await exitCar(true); } catch {} }
    if (riding && riding.row.id === id) { try { exitPassenger(); } catch {} }
    const { error } = await supabase.from("map_cars").delete().eq("id", id);
    if (error) { alert("Falha ao excluir: " + error.message); return; }
    // Remoção local imediata (não depende do evento realtime DELETE,
    // que pode não chegar com filtro em alguns casos).
    const c = cars.get(id);
    if (c) { disposeCar(c); cars.delete(id); }
    renderAdminList();
  }

  function openTune(id) {
    const c = cars.get(id);
    const wrap = document.getElementById("carTunePanel");
    if (!c || !wrap) return;
    wrap.hidden = false;
    const r = c.row;
    const wo = r.wheel_offsets || JSON.parse(JSON.stringify(DEFAULT_WHEEL_OFFSETS));
    if (wo.scale == null) wo.scale = 1;
    const slider = (label, key, min, max, step, val) => `
      <div class="ct-row"><label>${label}<span data-v="${key}">${Number(val).toFixed(2)}</span></label>
        <input type="range" data-tk="${key}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
    const wheelSliders = (k) => `
      <div class="ct-section"><h5>Roda ${k.toUpperCase()}</h5>
        <div class="ct-grid">
          ${slider("X", `wheel_offsets.${k}.x`, -3, 3, 0.01, wo[k]?.x ?? 0)}
          ${slider("Y", `wheel_offsets.${k}.y`, -2, 2, 0.01, wo[k]?.y ?? 0)}
          ${slider("Z", `wheel_offsets.${k}.z`, -3, 3, 0.01, wo[k]?.z ?? 0)}
        </div></div>`;
    // valores derivados para controles simétricos
    const trackF = Math.abs((wo.fr?.x ?? 0.75) - (wo.fl?.x ?? -0.75));
    const trackR = Math.abs((wo.rr?.x ?? 0.75) - (wo.rl?.x ?? -0.75));
    const wheelbase = Math.abs(((wo.rl?.z ?? 1.25) + (wo.rr?.z ?? 1.25))/2 - ((wo.fl?.z ?? -1.25) + (wo.fr?.z ?? -1.25))/2);
    const axleY = ((wo.fl?.y ?? 0.1)+(wo.fr?.y ?? 0.1)+(wo.rl?.y ?? 0.1)+(wo.rr?.y ?? 0.1))/4;
    wrap.innerHTML = `
      <div style="font-weight:600;font-size:12px;">⚙️ Ajustar: ${escapeHtml(r.name)}</div>
      <div class="ct-section"><h5>Performance</h5>
        ${slider("Velocidade máx (m/s)", "max_speed", 1, 60, 0.5, r.max_speed)}
        ${slider("Aceleração", "acceleration", 1, 30, 0.5, r.acceleration)}
        ${slider("Freio", "brake_force", 1, 40, 0.5, r.brake_force)}
        ${slider("Curva", "turn_speed", 0.3, 5, 0.05, r.turn_speed)}
      </div>
      <div class="ct-section"><h5>Chassi</h5>
        ${slider("Escala", "chassis_scale", 0.3, 3, 0.01, r.chassis_scale)}
        ${slider("Offset Y", "chassis_offset_y", -2, 2, 0.01, r.chassis_offset_y)}
        ${slider("Rotação Y°", "_rot_deg", -180, 180, 1, (r.rotation_y||0)*180/Math.PI)}
      </div>
      <div class="ct-section"><h5>Rodas (simétrico)</h5>
        ${slider("Tamanho das rodas", "wheel_offsets.scale", 0.3, 3, 0.01, wo.scale ?? 1)}
        ${slider("Raio (procedural)", "wheel_radius", 0.1, 1, 0.01, r.wheel_radius)}
        ${slider("Bitola dianteira (X)", "_trackF", 0.5, 3, 0.01, trackF)}
        ${slider("Bitola traseira (X)", "_trackR", 0.5, 3, 0.01, trackR)}
        ${slider("Distância eixos (Z)", "_wheelbase", 0.8, 5, 0.01, wheelbase)}
        ${slider("Altura eixos (Y)", "_axleY", -1, 1, 0.01, axleY)}
        ${slider("Rotação Y° rodas (GLB)", "wheel_offsets.rotY", -180, 180, 1, wo.rotY ?? 0)}
        <div class="ct-row"><label>Espelhar L/R</label>
          <select data-tk="wheel_offsets.mirror" style="background:#0c0c18;color:#fff;border:1px solid #2a3040;border-radius:4px;padding:4px;font:12px system-ui;">
            <option value="xz" ${(wo.mirror||"xz")==="xz"?"selected":""}>XZ (padrão)</option>
            <option value="x" ${wo.mirror==="x"?"selected":""}>Só X</option>
            <option value="z" ${wo.mirror==="z"?"selected":""}>Só Z</option>
            <option value="none" ${wo.mirror==="none"?"selected":""}>Nenhum</option>
          </select>
        </div>
      </div>
      <details><summary style="cursor:pointer;font-size:11px;opacity:0.8;margin-top:6px;">Ajuste fino por roda</summary>
        ${wheelSliders("fl")}${wheelSliders("fr")}${wheelSliders("rl")}${wheelSliders("rr")}
      </details>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
        <button id="ctSave" style="flex:1 1 100%;background:#29d3bd;color:#001a17;border:none;border-radius:4px;padding:8px;cursor:pointer;font-weight:600;">💾 Salvar neste carro (permanente)</button>
        ${r.catalog_id ? `<button id="ctSaveCatalog" style="flex:1;background:#7c5fff;color:#fff;border:none;border-radius:4px;padding:8px;cursor:pointer;font-weight:600;">Salvar como padrão do modelo</button>` : ""}
        <button id="ctClose" style="background:#333;color:#fff;border:none;border-radius:4px;padding:8px 10px;cursor:pointer;">Fechar</button>
      </div>`;
    const draft = JSON.parse(JSON.stringify(r));
    if (!draft.wheel_offsets) draft.wheel_offsets = JSON.parse(JSON.stringify(DEFAULT_WHEEL_OFFSETS));
    if (draft.wheel_offsets.scale == null) draft.wheel_offsets.scale = 1;
    const applyDraft = () => {
      const isDrivingThis = driving && driving.row.id === c.row.id;
      const liveYaw = c.state.yaw;
      Object.assign(c.row, draft);
      c.chassisGroup.position.y = draft.chassis_offset_y || 0;
      c.chassisGroup.scale.setScalar(draft.chassis_scale || 1);
      if (!isDrivingThis) {
        c.group.rotation.y = draft.rotation_y || 0;
        c.state.yaw = draft.rotation_y || 0;
      } else {
        c.group.rotation.y = liveYaw;
        c.state.yaw = liveYaw;
        c.row.rotation_y = liveYaw;
      }
      applyWheelTransforms(c, draft.wheel_offsets);
    };
    wrap.querySelectorAll("[data-tk]").forEach(inp => {
      const handler = () => {
        const key = inp.dataset.tk;
        const isSelect = inp.tagName === "SELECT";
        const rawVal = isSelect ? inp.value : inp.value;
        const val = isSelect ? rawVal : parseFloat(rawVal);
        const lbl = wrap.querySelector(`[data-v="${key}"]`);
        if (lbl && !isSelect) lbl.textContent = Number(val).toFixed(2);
        if (key === "_rot_deg") draft.rotation_y = val * Math.PI / 180;
        else if (key === "_trackF") {
          const h = val/2;
          draft.wheel_offsets.fl = { ...(draft.wheel_offsets.fl||{}), x: -h };
          draft.wheel_offsets.fr = { ...(draft.wheel_offsets.fr||{}), x: h };
        } else if (key === "_trackR") {
          const h = val/2;
          draft.wheel_offsets.rl = { ...(draft.wheel_offsets.rl||{}), x: -h };
          draft.wheel_offsets.rr = { ...(draft.wheel_offsets.rr||{}), x: h };
        } else if (key === "_wheelbase") {
          const h = val/2;
          draft.wheel_offsets.fl = { ...(draft.wheel_offsets.fl||{}), z: h };
          draft.wheel_offsets.fr = { ...(draft.wheel_offsets.fr||{}), z: h };
          draft.wheel_offsets.rl = { ...(draft.wheel_offsets.rl||{}), z: -h };
          draft.wheel_offsets.rr = { ...(draft.wheel_offsets.rr||{}), z: -h };
        } else if (key === "_axleY") {
          for (const k of ["fl","fr","rl","rr"]) {
            draft.wheel_offsets[k] = { ...(draft.wheel_offsets[k]||{}), y: val };
          }
        } else if (key.startsWith("wheel_offsets.")) {
          const parts = key.split(".");
          if (parts.length === 2) {
            // wheel_offsets.scale, wheel_offsets.rotY, wheel_offsets.mirror
            draft.wheel_offsets[parts[1]] = val;
          } else {
            const [, k, axis] = parts;
            if (!draft.wheel_offsets[k]) draft.wheel_offsets[k] = { x:0,y:0,z:0 };
            draft.wheel_offsets[k][axis] = val;
          }
        } else draft[key] = val;
        applyDraft();
      };
      inp.addEventListener("input", handler);
      inp.addEventListener("change", handler);
    });
    wrap.querySelector("#ctClose")?.addEventListener("click", () => { wrap.hidden = true; });
    wrap.querySelector("#ctSave")?.addEventListener("click", async () => {
      const patch = {
        max_speed: draft.max_speed, acceleration: draft.acceleration,
        brake_force: draft.brake_force, turn_speed: draft.turn_speed,
        chassis_scale: draft.chassis_scale, chassis_offset_y: draft.chassis_offset_y,
        wheel_radius: draft.wheel_radius, wheel_offsets: draft.wheel_offsets,
        rotation_y: draft.rotation_y,
      };
      const { error } = await supabase.from("map_cars").update(patch).eq("id", r.id);
      if (error) addSystemLine?.("Erro ao salvar carro: " + error.message);
      else addSystemLine?.("Carro salvo.");
    });
    wrap.querySelector("#ctSaveCatalog")?.addEventListener("click", async () => {
      if (!r.catalog_id) return;
      const patch = {
        max_speed: draft.max_speed, acceleration: draft.acceleration,
        brake_force: draft.brake_force, turn_speed: draft.turn_speed,
        chassis_scale: draft.chassis_scale, chassis_offset_y: draft.chassis_offset_y,
        wheel_radius: draft.wheel_radius, wheel_offsets: draft.wheel_offsets,
      };
      const { error } = await supabase.from("cars_catalog").update(patch).eq("id", r.catalog_id);
      if (error) addSystemLine?.("Erro: " + error.message);
      else addSystemLine?.("Padrão do modelo atualizado.");
    });
  }

  async function uploadGlb(file, prefix) {
    const ext = "glb";
    const path = `cars/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const { error } = await supabase.storage.from("map-assets").upload(path, file, {
      contentType: "model/gltf-binary", upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("map-assets").getPublicUrl(path);
    return data.publicUrl;
  }

  function bindAdminPanel() {
    document.getElementById("carSpawnFromCatalog")?.addEventListener("click", async () => {
      const sel = document.getElementById("carCatalogPicker");
      const id = sel?.value;
      const cat = catalog.find(c => c.id === id);
      if (!cat) { addSystemLine?.("Cadastre um modelo primeiro."); return; }
      const p = myPos() || new THREE.Vector3(0,0,0);
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const spawn = p.clone().addScaledVector(fwd, 4);
      const row = {
        map_id: currentMap, catalog_id: cat.id, name: cat.name,
        chassis_url: cat.chassis_url, wheel_url: cat.wheel_url,
        x: spawn.x, y: 0, z: spawn.z, rotation_y: 0,
        max_speed: cat.max_speed, acceleration: cat.acceleration,
        brake_force: cat.brake_force, turn_speed: cat.turn_speed,
        wheel_radius: cat.wheel_radius, chassis_scale: cat.chassis_scale,
        chassis_offset_y: cat.chassis_offset_y, wheel_offsets: cat.wheel_offsets,
        created_by: myId,
      };
      const { data: inserted, error } = await supabase.from("map_cars").insert(row).select().single();
      if (error) { addSystemLine?.("Erro: " + error.message); return; }
      addSystemLine?.("Carro adicionado.");
      if (inserted) {
        try { await upsertCarFromRow(inserted); renderAdminList(); } catch (e) { console.warn("[cars] spawn local", e); }
      }
    });

    document.getElementById("carNewSave")?.addEventListener("click", async () => {
      const name = document.getElementById("carNewName")?.value?.trim();
      const chassisFile = document.getElementById("carNewChassisFile")?.files?.[0];
      const wheelFile = document.getElementById("carNewWheelFile")?.files?.[0];
      const status = document.getElementById("carNewStatus");
      if (!name) { status.textContent = "Dê um nome ao modelo."; return; }
      if (!chassisFile) { status.textContent = "Selecione o GLB do chassi."; return; }
      status.textContent = "Subindo chassi...";
      try {
        const chassisUrl = await uploadGlb(chassisFile, "chassis");
        let wheelUrl = null;
        if (wheelFile) {
          status.textContent = "Subindo roda...";
          wheelUrl = await uploadGlb(wheelFile, "wheel");
        }
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"") + "-" + Date.now().toString(36);
        const { error } = await supabase.from("cars_catalog").insert({
          slug, name, chassis_url: chassisUrl, wheel_url: wheelUrl, created_by: myId,
        });
        if (error) throw error;
        status.textContent = "Modelo salvo no catálogo.";
        document.getElementById("carNewName").value = "";
        document.getElementById("carNewChassisFile").value = "";
        if (document.getElementById("carNewWheelFile")) document.getElementById("carNewWheelFile").value = "";
        await loadCatalog();
      } catch (e) {
        status.textContent = "Erro: " + (e.message || e);
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { bindHud(); bindAdminPanel(); });
  else { bindHud(); bindAdminPanel(); }
})();

// ============ Voz por proximidade (streaming quase real-time) ============
(function setupProximityVoice() {
  const VOICE_FULL = 3.5;
  const VOICE_MAX  = 14;
  const MAX_REC_MS = 30000;
  const CHUNK_MS   = 280;          // tamanho de cada segmento enviado
  const REMOTE_INDICATOR_FADE_MS = 800;

  let btn = null;
  let mediaStream = null;
  let currentRecorder = null;
  let recording = false;
  let recStartTs = 0;
  let recTimer = null;
  let chan = null;
  let audioCtx = null;
  let selfSpeakingUntil = 0;
  let chosenMime = "";

  // Por id remoto: { queue, nextStartAt, lastSignalAt }
  const remoteSpeakers = new Map();

  function ensureCtx() {
    if (audioCtx && audioCtx.state !== "closed") return audioCtx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC({ latencyHint: "interactive" });
    return audioCtx;
  }

  // Garante que o contexto de áudio esteja "running" — assim quem só escuta
  // (sem habilitar microfone) também ouve os colegas próximos.
  const resumeOnGesture = () => {
    try { ensureCtx()?.resume?.(); } catch {}
  };
  document.addEventListener("pointerdown", resumeOnGesture, { passive: true });
  document.addEventListener("keydown", resumeOnGesture);
  document.addEventListener("touchstart", resumeOnGesture, { passive: true });

  function distanceGainFor(speakerId) {
    const a = playerEntities.get(speakerId)?.group?.position;
    const b = playerEntities.get(myId)?.group?.position;
    if (!a || !b) return 0.6;
    const dx = a.x - b.x, dz = a.z - b.z;
    const d = Math.hypot(dx, dz);
    if (d <= VOICE_FULL) return 1;
    if (d >= VOICE_MAX) return 0;
    const t = 1 - (d - VOICE_FULL) / (VOICE_MAX - VOICE_FULL);
    return t * t;
  }

  function setSpeakingClass(id, on) {
    const ent = playerEntities.get(id);
    if (!ent?.plate) return;
    ent.plate.classList.toggle("is-speaking", !!on);
  }

  function pickMime() {
    if (chosenMime) return chosenMime;
    const cands = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const m of cands) {
      try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) { chosenMime = m; return m; } } catch {}
    }
    return "";
  }

  async function getStream() {
    if (mediaStream && mediaStream.active) return mediaStream;
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
      },
    });
    return mediaStream;
  }

  // Pré-aquece o microfone na primeira interação após entrar na sala,
  // para que apertar o botão "fale" não tenha latência de permissão.
  let prewarmed = false;
  async function tryPrewarm() {
    if (prewarmed) return;
    if (!document.body.classList.contains("world-ready")) return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      // só pré-aquece se a permissão já foi concedida antes
      const perm = await navigator.permissions?.query?.({ name: "microphone" }).catch(() => null);
      if (!perm || perm.state !== "granted") return;
      await getStream();
      prewarmed = true;
    } catch {}
  }

  async function blobToBase64(blob) {
    const buf = await blob.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  // Grava em segmentos pequenos e independentes (cada um com cabeçalho próprio),
  // enviando assim que cada segmento termina — latência ~CHUNK_MS.
  function startSegment() {
    if (!recording || !chan) return;
    const mime = pickMime();
    let rec;
    try {
      rec = mime
        ? new MediaRecorder(mediaStream, { mimeType: mime, audioBitsPerSecond: 20000 })
        : new MediaRecorder(mediaStream);
    } catch (e) {
      console.warn("MediaRecorder não suportado:", e);
      recording = false;
      return;
    }
    currentRecorder = rec;
    const localChunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) localChunks.push(e.data); };
    rec.onstop = async () => {
      const type = rec.mimeType || mime || "audio/webm";
      const blob = new Blob(localChunks, { type });
      try {
        if (blob.size > 0 && chan) {
          const b64 = await blobToBase64(blob);
          if (b64.length < 240_000) {
            chan.send({ type: "broadcast", event: "voice-blob", payload: { id: myId, b64, mime: type } });
          }
        }
      } catch (err) {
        console.warn("Falha enviando voz:", err);
      }
      if (recording) {
        // emenda imediatamente o próximo segmento
        startSegment();
      } else {
        try { chan?.send({ type: "broadcast", event: "voice-end", payload: { id: myId } }); } catch {}
      }
    };
    rec.start();
    setTimeout(() => { try { if (rec.state !== "inactive") rec.stop(); } catch {} }, CHUNK_MS);
  }

  async function startRecording() {
    if (recording) return;
    if (!chan) return;
    try { ensureCtx()?.resume?.(); } catch {}
    try {
      await getStream();
    } catch (e) {
      console.warn("Mic negado:", e);
      btn?.classList.add("is-denied");
      btn?.setAttribute("title", "Microfone negado. Permita o acesso e tente de novo.");
      return;
    }
    recording = true;
    recStartTs = performance.now();
    selfSpeakingUntil = recStartTs + MAX_REC_MS;
    setSpeakingClass(myId, true);
    btn?.classList.add("is-recording");
    try { chan.send({ type: "broadcast", event: "voice-start", payload: { id: myId } }); } catch {}
    startSegment();
    recTimer = setTimeout(() => stopRecording(), MAX_REC_MS);
  }

  function stopRecording() {
    if (!recording) return;
    recording = false;
    if (recTimer) { clearTimeout(recTimer); recTimer = null; }
    btn?.classList.remove("is-recording");
    selfSpeakingUntil = 0;
    setSpeakingClass(myId, false);
    try { if (currentRecorder && currentRecorder.state !== "inactive") currentRecorder.stop(); } catch {}
  }

  function ensureRemote(id) {
    let r = remoteSpeakers.get(id);
    if (!r) {
      r = { queue: [], nextStartAt: 0, lastSignalAt: 0 };
      remoteSpeakers.set(id, r);
    }
    return r;
  }

  function markRemoteSpeaking(id) {
    const r = ensureRemote(id);
    r.lastSignalAt = performance.now();
    setSpeakingClass(id, true);
  }

  async function onRemoteBlob(id, b64, mime) {
    const ctx = ensureCtx();
    if (!ctx) return;
    try { await ctx.resume(); } catch {}
    let audioBuf;
    try {
      audioBuf = await ctx.decodeAudioData(base64ToArrayBuffer(b64));
    } catch (e) {
      // segmento corrompido — descarta sem barulho
      return;
    }
    const r = ensureRemote(id);
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    const gainNode = ctx.createGain();
    gainNode.gain.value = distanceGainFor(id);
    src.connect(gainNode).connect(ctx.destination);

    // Encadeia os segmentos sem gap perceptível: começa onde o anterior termina,
    // mas nunca mais de 120ms no futuro pra evitar acúmulo de atraso.
    const now = ctx.currentTime;
    const minStart = now + 0.02;
    const maxStart = now + 0.12;
    let startAt = Math.max(r.nextStartAt || 0, minStart);
    if (startAt > maxStart) startAt = maxStart;

    const item = { src, gainNode, speakerId: id };
    src.onended = () => {
      r.queue = r.queue.filter((x) => x !== item);
      if (r.queue.length === 0) {
        r.nextStartAt = 0;
        if (performance.now() - r.lastSignalAt > REMOTE_INDICATOR_FADE_MS) setSpeakingClass(id, false);
      }
    };
    r.queue.push(item);
    try { src.start(startAt); } catch { try { src.start(); } catch {} }
    r.nextStartAt = startAt + audioBuf.duration;
    markRemoteSpeaking(id);
  }

  function tick() {
    const t = audioCtx?.currentTime ?? 0;
    for (const [id, r] of remoteSpeakers) {
      for (const item of r.queue) {
        const g = distanceGainFor(id);
        try { item.gainNode.gain.setTargetAtTime(g, t, 0.08); } catch {}
      }
    }
    requestAnimationFrame(tick);
  }

  function bind() {
    btn = document.getElementById("voicePttBtn");
    if (!btn) return;
    const refreshVisibility = () => {
      const inRoom = document.body.classList.contains("world-ready");
      btn.hidden = !inRoom;
      if (inRoom) tryPrewarm();
    };
    refreshVisibility();
    const mo = new MutationObserver(refreshVisibility);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    const press = (e) => {
      e.preventDefault();
      try { btn.setPointerCapture?.(e.pointerId); } catch {}
      startRecording();
    };
    const release = (e) => {
      try { btn.releasePointerCapture?.(e.pointerId); } catch {}
      stopRecording();
    };
    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave", (e) => { if (recording) release(e); });
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (e.target?.matches?.("input, textarea")) return;
      if (e.code === "KeyV") { e.preventDefault(); startRecording(); }
    });
    document.addEventListener("keyup", (e) => {
      if (e.code === "KeyV") { e.preventDefault(); stopRecording(); }
    });
    requestAnimationFrame(tick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  window.__voice = {
    setChannel(c) { chan = c; },
    onRemoteStart(id) { markRemoteSpeaking(id); },
    onRemoteEnd(id) {
      const r = remoteSpeakers.get(id);
      if (r) r.lastSignalAt = 0;
      if (!r || r.queue.length === 0) setSpeakingClass(id, false);
    },
    onRemoteBlob,
  };
})();

// ============ Painel admin: gerenciar usuários ============
(() => {
  const overlay = document.getElementById("usersAdminOverlay");
  const list = document.getElementById("usersAdminList");
  const search = document.getElementById("usersAdminSearch");
  const closeBtn = document.getElementById("usersAdminClose");
  const refreshBtn = document.getElementById("usersAdminRefresh");
  const dockBtn = document.getElementById("usersAdminToggle");
  if (!overlay || !dockBtn) return;

  let cache = [];

  async function authHeaders() {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function fmtDate(s) {
    if (!s) return "—";
    try { return new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); }
    catch { return s; }
  }

  function render(filter = "") {
    const q = filter.trim().toLowerCase();
    const rows = cache.filter(u =>
      !q ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.nickname || "").toLowerCase().includes(q)
    );
    if (!rows.length) {
      list.innerHTML = `<div class="users-admin-empty">Nenhum usuário encontrado.</div>`;
      return;
    }
    list.innerHTML = rows.map(u => {
      const isAdminRow = (u.roles || []).includes("admin");
      const avatar = u.avatar_url
        ? `<img src="${u.avatar_url}" alt="">`
        : `<span>${(u.nickname || u.email || "?").slice(0,1).toUpperCase()}</span>`;
      return `
        <div class="user-row" data-uid="${u.id}">
          <div class="user-row-avatar">${avatar}</div>
          <div class="user-row-info">
            <div class="user-row-name">${escapeHtml(u.nickname || "(sem nome)")}${isAdminRow ? '<span class="badge-admin">admin</span>' : ''}</div>
            <div class="user-row-meta">${escapeHtml(u.email || "—")} · Criado ${fmtDate(u.created_at)} · Último login ${fmtDate(u.last_sign_in_at)}</div>
          </div>
          <button type="button" class="user-row-delete" data-act="delete">Excluir</button>
        </div>
      `;
    }).join("");
  }

  async function load() {
    list.innerHTML = `<div class="users-admin-empty">Carregando…</div>`;
    try {
      const res = await fetch("/api/admin/list-users", { headers: await authHeaders() });
      if (!res.ok) {
        list.innerHTML = `<div class="users-admin-empty">Erro ao carregar (${res.status}).</div>`;
        return;
      }
      const json = await res.json();
      cache = json.users || [];
      render(search.value);
    } catch (e) {
      list.innerHTML = `<div class="users-admin-empty">Erro: ${escapeHtml(String(e))}</div>`;
    }
  }

  async function doDelete(uid, btn) {
    const target = cache.find(u => u.id === uid);
    const label = target ? (target.nickname || target.email || uid) : uid;
    const confirm1 = prompt(`Tem certeza que deseja EXCLUIR PERMANENTEMENTE a conta de "${label}"?\n\nEsta ação é IRREVERSÍVEL.\n\nDigite EXCLUIR para confirmar:`);
    if (confirm1 !== "EXCLUIR") return;
    btn.disabled = true;
    btn.textContent = "Excluindo…";
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ userId: uid }),
      });
      if (!res.ok) {
        const msg = await res.text();
        alert(`Falha ao excluir: ${msg}`);
        btn.disabled = false;
        btn.textContent = "Excluir";
        return;
      }
      cache = cache.filter(u => u.id !== uid);
      render(search.value);
    } catch (e) {
      alert(`Erro: ${e}`);
      btn.disabled = false;
      btn.textContent = "Excluir";
    }
  }

  function open() {
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    load();
  }
  function close() {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
  }

  dockBtn.addEventListener("click", () => { if (typeof isAdmin !== "undefined" && !isAdmin) return alert("Apenas admin."); open(); });
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  refreshBtn.addEventListener("click", load);
  search.addEventListener("input", () => render(search.value));
  list.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-act="delete"]');
    if (!btn) return;
    const row = btn.closest(".user-row");
    const uid = row?.dataset.uid;
    if (uid) doDelete(uid, btn);
  });
})();

// ============ Popup ao clicar em outro jogador no mapa ============
(function setupPlayerPopup() {
  let popup = null;
  let currentPeerId = null;

  function close() {
    if (popup) { popup.remove(); popup = null; currentPeerId = null; }
  }

  document.addEventListener("pointerdown", (e) => {
    if (popup && !popup.contains(e.target) && !e.target.closest?.(".nameplate")) close();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  async function getFriendRel(peerId) {
    if (!myId || !peerId) return { status: "none" };
    const { data } = await supabase
      .from("friend_requests")
      .select("id,from_user,to_user,status")
      .or(`and(from_user.eq.${myId},to_user.eq.${peerId}),and(from_user.eq.${peerId},to_user.eq.${myId})`)
      .order("updated_at", { ascending: false })
      .limit(1);
    const row = data?.[0];
    if (!row) return { status: "none" };
    if (row.status === "accepted") return { status: "accepted", row };
    if (row.status === "rejected") return { status: "rejected", row, mine: row.from_user === myId };
    return { status: "pending", row, mine: row.from_user === myId };
  }


  function friendButtonLabel(rel) {
    if (rel.status === "accepted") return { text: "✓ Amigos", disabled: true };
    if (rel.status === "pending" && rel.mine) return { text: "⏳ Pedido enviado", disabled: true };
    if (rel.status === "pending" && !rel.mine) return { text: "✅ Aceitar pedido", disabled: false, accept: true };
    if (rel.status === "rejected") return { text: "🤝 Solicitar amizade", disabled: false };
    return { text: "🤝 Solicitar amizade", disabled: false };
  }

  async function open(peerId, anchorEl) {
    if (!peerId || peerId === (typeof myId !== "undefined" ? myId : null)) return;
    close();
    currentPeerId = peerId;
    const [{ data: peer }, rel] = await Promise.all([
      supabase.from("profiles").select("id,nickname,avatar_url").eq("id", peerId).maybeSingle(),
      getFriendRel(peerId),
    ]);
    if (currentPeerId !== peerId) return;
    const name = peer?.nickname || "Usuário";
    const avatar = peer?.avatar_url || "";
    const fb = friendButtonLabel(rel);

    popup = document.createElement("div");
    popup.className = "player-popup";
    popup.innerHTML = `
      <div class="player-popup-header">
        <div class="player-popup-avatar" style="${avatar ? `background-image:url('${avatar.replace(/'/g, "%27")}');` : ''}"></div>
        <div class="player-popup-name">${escapeHtml(name)}</div>
      </div>
      <div class="player-popup-actions">
        <button data-act="profile">👤 Ver perfil</button>
        <button data-act="dm">💬 Mandar DM</button>
        <button data-act="friend" ${fb.disabled ? "disabled" : ""}>${fb.text}</button>
      </div>
    `;
    document.body.appendChild(popup);
    positionPopup(anchorEl);

    popup.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "profile") {
        close();
        if (typeof openProfile === "function") openProfile(peerId);
        else window.dispatchEvent(new CustomEvent("open-profile", { detail: peerId }));
      } else if (act === "dm") {
        close();
        window.dispatchEvent(new CustomEvent("open-dm", { detail: peerId }));
      } else if (act === "friend") {
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = fb.accept ? "Aceitando…" : "Enviando…";
        try {
          if (fb.accept) {
            await supabase.from("friend_requests").update({ status: "accepted" }).eq("id", rel.row.id);
            btn.textContent = "✓ Amigos";
          } else {
            const { error } = await supabase.from("friend_requests").insert({ from_user: myId, to_user: peerId, status: "pending" });
            if (error) throw error;
            btn.textContent = "⏳ Pedido enviado";
          }
          setTimeout(close, 900);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = original;
          alert("Falha: " + (err?.message || err));
        }
      } else if (act === "follow-loc") {
        await handleFollowLocation(peerId, name);
      }
    });
  }


  function teleportNear(peerId) {
    const target = playerEntities.get(peerId);
    if (!target) return false;
    const ang = Math.random() * Math.PI * 2;
    const offX = Math.cos(ang) * 1.2;
    const offZ = Math.sin(ang) * 1.2;
    const pos = target.group.position;
    try { moveToWorld({ x: pos.x + offX, z: pos.z + offZ }); return true; } catch { return false; }
  }

  function waitForPeerEntity(peerId, timeoutMs = 4000) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        if (playerEntities.get(peerId)) return resolve(true);
        if (Date.now() - t0 > timeoutMs) return resolve(false);
        setTimeout(tick, 120);
      };
      tick();
    });
  }

  function renderConfirmStep(mapName) {
    if (!popup) return;
    popup.innerHTML = `
      <div class="player-popup-confirm">
        <div class="player-popup-confirm-text">Esse usuário está na sala <b>${escapeHtml(mapName)}</b>. Ir até lá?</div>
        <div class="player-popup-confirm-actions">
          <button data-act="cancel">Cancelar</button>
          <button data-act="go" class="primary">Ir</button>
        </div>
      </div>
    `;
  }

  function renderErrorStep(msg) {
    if (!popup) return;
    popup.innerHTML = `
      <div class="player-popup-confirm">
        <div class="player-popup-confirm-text player-popup-error">${escapeHtml(msg)}</div>
        <div class="player-popup-confirm-actions">
          <button data-act="cancel" class="primary">Fechar</button>
        </div>
      </div>
    `;
  }

  function renderLoadingStep(msg) {
    if (!popup) return;
    popup.innerHTML = `<div class="player-popup-confirm"><div class="player-popup-confirm-text">${escapeHtml(msg)}</div></div>`;
  }

  async function handleFollowLocation(peerId, peerName) {
    // Peer na mesma sala? Move direto.
    if (playerEntities.get(peerId)) {
      teleportNear(peerId);
      close();
      return;
    }
    // Descobre a sala do peer via lobby presence
    let peerMapId = null;
    try {
      const state = lobbyChannel?.presenceState?.() || {};
      const entry = state[peerId]?.[0];
      peerMapId = entry?.map_id || null;
    } catch {}
    if (!peerMapId) { renderErrorStep("Esse usuário não está online."); return; }
    if (peerMapId === currentMapId) {
      // Está na sala mas a entidade ainda não carregou; aguarda um pouco.
      renderLoadingStep("Localizando…");
      const ok = await waitForPeerEntity(peerId, 2500);
      if (ok && teleportNear(peerId)) close();
      else renderErrorStep("Não foi possível localizar esse usuário.");
      return;
    }
    const mapInfo = (Array.isArray(MAPS) ? MAPS : []).find((m) => m.id === peerMapId);
    if (!mapInfo) { renderErrorStep("Não foi possível entrar nessa sala."); return; }

    renderConfirmStep(mapInfo.name || peerMapId);
    popup.addEventListener("click", async (ev) => {
      const b = ev.target.closest("button[data-act]");
      if (!b) return;
      const a = b.dataset.act;
      if (a === "cancel") { close(); return; }
      if (a === "go") {
        renderLoadingStep(`Indo para ${mapInfo.name || peerMapId}…`);
        try {
          if (typeof switchRoom !== "function") throw new Error("switchRoom indisponível");
          await switchRoom(peerMapId);
        } catch (err) {
          renderErrorStep("Não foi possível entrar nessa sala.");
          return;
        }
        const appeared = await waitForPeerEntity(peerId, 4000);
        if (!appeared) { renderErrorStep("Esse usuário saiu da sala."); return; }
        if (!teleportNear(peerId)) { renderErrorStep("Não foi possível chegar até ele."); return; }
        close();
      }
    }, { once: false });
  }

  function positionPopup(anchorEl) {
    if (!popup || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    popup.style.left = (r.left + r.width / 2) + "px";
    popup.style.top = r.top + "px";
  }

  // delegação no layer de nameplates
  document.addEventListener("click", (e) => {
    const plate = e.target.closest?.(".nameplate.is-clickable");
    if (!plate) return;
    const uid = plate.dataset.user;
    if (uid) { e.stopPropagation(); open(uid, plate); }
  });

  // Exposto para outros módulos (ex: clique no avatar 3D, botão "Ir até" no perfil)
  window.__playerPopup = {
    open,
    async goToLocation(peerId) {
      if (!peerId || peerId === (typeof myId !== "undefined" ? myId : null)) return;
      close();
      if (playerEntities.get(peerId)) { teleportNear(peerId); return; }
      let peerMapId = null;
      try {
        const state = lobbyChannel?.presenceState?.() || {};
        peerMapId = state[peerId]?.[0]?.map_id || null;
      } catch {}
      const notify = (m) => { try { (window.toast || console.log)(m); } catch {} };
      if (!peerMapId) { notify("Esse usuário não está online."); return; }
      if (peerMapId === currentMapId) {
        const ok = await waitForPeerEntity(peerId, 2500);
        if (ok) teleportNear(peerId);
        return;
      }
      const mapInfo = (Array.isArray(MAPS) ? MAPS : []).find((m) => m.id === peerMapId);
      if (!mapInfo) { notify("Não foi possível entrar nessa sala."); return; }
      try {
        if (typeof switchRoom !== "function") throw new Error("switchRoom indisponível");
        await switchRoom(peerMapId);
      } catch {
        notify("Não foi possível entrar nessa sala.");
        return;
      }
      const appeared = await waitForPeerEntity(peerId, 4000);
      if (appeared) teleportNear(peerId);
      else notify("Esse usuário saiu da sala.");
    },
  };
})();

// ============================================================
// ===== Portais (teleporte estilo GTA, rosa) =================
// ============================================================
(function setupPortals() {
  const panel    = document.getElementById("portalsAdminPanel");
  const dockBtn  = document.getElementById("portalsAdminToggle");
  const listEl   = document.getElementById("portalsList");
  const editorEl = document.getElementById("portalsEditor");
  const newBtn   = document.getElementById("portalsNewBtn");
  if (!panel) return;

  // 3D group dedicated to portals (added once)
  const portalsGroup = new THREE.Group();
  portalsGroup.name = "__portalsGroup";
  try { scene.add(portalsGroup); } catch {}

  let portals = [];           // rows
  const portalMeshes = new Map(); // id -> { group, label }
  let channel = null;
  let subscribedMapId = null;
  let inRoom = false;
  let teleporting = false;
  let cooldownUntil = 0;
  // Portals to ignore until the player walks out of their radius.
  // Used so that landing on a destination portal doesn't immediately re-teleport.
  // Each entry: portalId -> true. Cleared per-tick once the player is outside.
  const suppressedPortals = new Set();
  // A portal only becomes "armed" (i.e. allowed to teleport) once the player has
  // been observed OUTSIDE its activation radius at least once. This prevents
  // spawning / landing on top of a portal from instantly triggering it.
  const armedPortals = new Set();
  // After switching room because of a portal-to-portal link, we remember which
  // portal id to drop the player on (and immediately suppress) once portals load.
  let pendingDropPortalId = null;

  function _esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function destOptions(selectedId) {
    const list = (Array.isArray(MAPS) ? MAPS : []).slice();
    return list.map((m) =>
      `<option value="${_esc(m.id)}" ${m.id === selectedId ? "selected" : ""}>${_esc(m.name || m.id)}</option>`
    ).join("");
  }

  // Cache of portals per map id, used to populate the "destination portal" select.
  const portalsByMap = new Map();
  async function fetchPortalsForMap(mapId) {
    if (!mapId) return [];
    if (portalsByMap.has(mapId)) return portalsByMap.get(mapId);
    const { data, error } = await supabase
      .from("map_portals").select("id,label,map_id").eq("map_id", mapId);
    if (error) { console.warn("[portals] fetchPortalsForMap", error); return []; }
    portalsByMap.set(mapId, data || []);
    return data || [];
  }
  function destPortalOptions(mapId, selectedId, excludeId) {
    const list = (portalsByMap.get(mapId) || []).filter((p) => p.id !== excludeId);
    const empty = `<option value="">— (apenas o mapa) —</option>`;
    return empty + list.map((p) =>
      `<option value="${_esc(p.id)}" ${p.id === selectedId ? "selected" : ""}>${_esc(p.label || "Portal")}</option>`
    ).join("");
  }

  // ---------- Visual portal mesh ----------
  function buildPortalMesh(p) {
    const g = new THREE.Group();
    const color = new THREE.Color(p.color || "#ff3ea5");
    const radius = Math.max(0.3, Number(p.radius) || 1.2);
    const height = Math.max(0.6, Number(p.height) || 2.6);

    // Pillar of light (open cylinder, double-sided, additive)
    const cylGeo = new THREE.CylinderGeometry(radius, radius, height, 32, 1, true);
    const cylMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const cyl = new THREE.Mesh(cylGeo, cylMat);
    cyl.position.y = height / 2;
    g.add(cyl);

    // Inner brighter core
    const coreGeo = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, height * 0.98, 24, 1, true);
    const coreMat = new THREE.MeshBasicMaterial({
      color: color.clone().lerp(new THREE.Color("#ffffff"), 0.35),
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = height / 2;
    g.add(core);

    // Ground disc
    const discGeo = new THREE.CircleGeometry(radius, 32);
    const discMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.02;
    g.add(disc);

    // Soft point light tinted with the portal color
    const light = new THREE.PointLight(color, 1.4, radius * 6, 2);
    light.position.y = height * 0.6;
    g.add(light);

    g.position.set(Number(p.pos_x) || 0, Number(p.pos_y) || 0, Number(p.pos_z) || 0);
    g.userData.portalId = p.id;
    g.userData.spawn = Math.random() * Math.PI * 2;
    return g;
  }

  function syncMeshes() {
    const seen = new Set();
    for (const p of portals) {
      seen.add(p.id);
      const existing = portalMeshes.get(p.id);
      if (existing) {
        portalsGroup.remove(existing.group);
        existing.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      }
      const group = buildPortalMesh(p);
      portalsGroup.add(group);
      portalMeshes.set(p.id, { group, row: p });
    }
    for (const [id, m] of Array.from(portalMeshes)) {
      if (!seen.has(id)) {
        portalsGroup.remove(m.group);
        m.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
        portalMeshes.delete(id);
      }
    }
  }

  // Subtle rotation/pulse
  (function animate() {
    requestAnimationFrame(animate);
    const t = performance.now() / 1000;
    for (const { group } of portalMeshes.values()) {
      const phase = group.userData.spawn || 0;
      group.rotation.y = t * 0.6 + phase;
      const s = 1 + Math.sin(t * 2 + phase) * 0.03;
      group.scale.set(s, 1, s);
    }
  })();

  // ---------- Data ----------
  async function load(mapId) {
    if (!mapId) { portals = []; syncMeshes(); renderAdmin(); return; }
    const { data, error } = await supabase
      .from("map_portals")
      .select("*")
      .eq("map_id", mapId)
      .order("created_at", { ascending: true });
    if (error) { console.warn("[portals] load", error); return; }
    portals = data || [];
    portalsByMap.set(mapId, portals.map((p) => ({ id: p.id, label: p.label, map_id: p.map_id })));
    syncMeshes();
    renderAdmin();
    // If we arrived here via a portal-to-portal teleport, drop the player on the
    // destination portal and suppress it until they walk out.
    if (pendingDropPortalId) {
      const target = portals.find((x) => x.id === pendingDropPortalId);
      pendingDropPortalId = null;
      if (target) {
        // Wait briefly for the player entity to be present in the new room.
        let tries = 0;
        const tryDrop = () => {
          if (dropPlayerAt(target.pos_x, target.pos_y, target.pos_z)) {
            suppressedPortals.add(target.id);
            armedPortals.delete(target.id);
            return;
          }
          if (++tries < 40) setTimeout(tryDrop, 75);
        };
        tryDrop();
      }
    }
  }

  async function subscribe(mapId) {
    if (channel && subscribedMapId === mapId) return;
    if (channel) { try { await supabase.removeChannel(channel); } catch {} channel = null; }
    subscribedMapId = mapId;
    if (!mapId) return;
    channel = supabase
      .channel("portals:" + mapId)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "map_portals", filter: "map_id=eq." + mapId },
        () => load(mapId))
      .subscribe();
  }
  async function unsubscribe() {
    if (channel) { try { await supabase.removeChannel(channel); } catch {} channel = null; }
    subscribedMapId = null;
  }

  function clearScene() {
    for (const { group } of portalMeshes.values()) {
      portalsGroup.remove(group);
      group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    }
    portalMeshes.clear();
    armedPortals.clear();
    suppressedPortals.clear();
  }

  // ---------- Proximity / teleport ----------
  function dropPlayerAt(x, y, z) {
    const entity = (typeof myId !== "undefined" && myId) ? playerEntities.get(myId) : null;
    if (!entity?.group) return false;
    entity.group.position.set(Number(x) || 0, Number(y) || entity.group.position.y, Number(z) || 0);
    return true;
  }

  setInterval(() => {
    if (!inRoom) return;
    const entity = (typeof myId !== "undefined" && myId) ? playerEntities.get(myId) : null;
    if (!entity?.group) return;
    const px = entity.group.position.x, pz = entity.group.position.z;

    // Update armed/suppressed state per portal based on distance.
    for (const p of portals) {
      const dx = px - (Number(p.pos_x) || 0);
      const dz = pz - (Number(p.pos_z) || 0);
      const r = Math.max(0.3, Number(p.radius) || 1.2);
      const outsideMargin = (dx * dx + dz * dz) > (r * 1.6) * (r * 1.6);
      if (outsideMargin) {
        // Player is clearly outside → arm it and lift any suppression.
        armedPortals.add(p.id);
        suppressedPortals.delete(p.id);
      }
    }

    if (teleporting) return;
    if (performance.now() < cooldownUntil) return;

    for (const p of portals) {
      if (suppressedPortals.has(p.id)) continue;
      if (!armedPortals.has(p.id)) continue; // must walk away first
      const sameMap = !p.dest_map_id || p.dest_map_id === currentMapId;
      // Skip cross-map portals without destination, and same-map portals without a destination portal.
      if (!p.dest_map_id && !p.dest_portal_id) continue;
      if (sameMap && !p.dest_portal_id) continue;
      const dx = px - (Number(p.pos_x) || 0);
      const dz = pz - (Number(p.pos_z) || 0);
      const r = Math.max(0.3, Number(p.radius) || 1.2);
      if (dx * dx + dz * dz <= r * r) {
        teleporting = true;
        cooldownUntil = performance.now() + 4000;
        const destMap = p.dest_map_id || currentMapId;
        const destPortalId = p.dest_portal_id || null;
        if (sameMap) {
          // Same-map jump: move directly to the destination portal and suppress it.
          const target = portals.find((x) => x.id === destPortalId);
          if (target) {
            dropPlayerAt(target.pos_x, target.pos_y, target.pos_z);
            suppressedPortals.add(target.id);
            armedPortals.delete(target.id);
          }
          teleporting = false;
        } else {
          pendingDropPortalId = destPortalId;
          Promise.resolve()
            .then(() => (typeof switchRoom === "function" ? switchRoom(destMap) : null))
            .catch((e) => console.warn("[portals] switchRoom", e))
            .finally(() => { teleporting = false; });
        }
        break;
      }
    }
  }, 220);

  // ---------- Lifecycle ----------
  window.portalsEnterRoom = async function (mapId) {
    inRoom = true;
    clearScene();
    await subscribe(mapId);
    await load(mapId);
  };
  window.portalsLeaveRoom = async function () {
    inRoom = false;
    await unsubscribe();
    portals = [];
    clearScene();
    renderAdmin();
  };

  // ---------- Admin panel ----------
  let editingId = null;
  let editingDraft = null;

  // O toggle do painel é feito pela delegação do dock lateral (admin-dock).
  // Aqui apenas observamos o atributo `hidden` para (re)renderizar quando abrir
  // e bloquear não-admin. Evita duplo toggle (delegação + listener próprio).
  try {
    const _obs = new MutationObserver(() => {
      if (panel.hidden) return;
      if (!isAdmin) { panel.hidden = true; alert("Apenas admin."); return; }
      editingId = null; editingDraft = null;
      renderAdmin();
    });
    _obs.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  } catch {}

  newBtn?.addEventListener("click", async () => {
    if (!isAdmin) return alert("Apenas admin.");
    if (!currentMapId) return alert("Entre em uma sala primeiro.");
    const entity = (typeof myId !== "undefined" && myId) ? playerEntities.get(myId) : null;
    const pos = entity?.group?.position || { x: 0, y: 0, z: 0 };
    const dest = (MAPS.find((m) => m.id !== currentMapId)?.id) || currentMapId;
    const { data, error } = await supabase.from("map_portals").insert({
      map_id: currentMapId,
      dest_map_id: dest,
      label: "Portal",
      pos_x: Number(pos.x.toFixed(3)),
      pos_y: 0,
      pos_z: Number(pos.z.toFixed(3)),
      radius: 1.2,
      height: 2.6,
      color: "#ff3ea5",
    }).select().single();
    if (error) { alert("Erro ao criar portal: " + error.message); return; }
    editingId = data.id;
    editingDraft = null;
    await load(currentMapId);
  });

  function renderAdmin() {
    if (!listEl || !editorEl) return;
    if (!portals.length) {
      listEl.innerHTML = '<div style="color:#777;font-size:11px;padding:6px;">Nenhum portal nesta sala. Clique no + para adicionar.</div>';
    } else {
      listEl.innerHTML = portals.map((p) => {
        const destName = (MAPS.find((m) => m.id === p.dest_map_id)?.name) || p.dest_map_id;
        const isEd = editingId === p.id;
        return `<div class="portal-row" data-id="${_esc(p.id)}" style="border:1px solid ${isEd ? "#ff3ea5" : "#2a2a35"};border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px;background:rgba(255,255,255,0.02);">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="width:10px;height:10px;border-radius:50%;background:${_esc(p.color || "#ff3ea5")};box-shadow:0 0 6px ${_esc(p.color || "#ff3ea5")};"></span>
            <strong style="flex:1;">${_esc(p.label || "Portal")}</strong>
            <span style="color:#9aa;font-size:10px;">→ ${_esc(destName)}</span>
          </div>
          <div style="display:flex;gap:6px;">
            <button type="button" data-act="edit" style="flex:1;background:transparent;border:1px solid #555;color:#eee;border-radius:4px;padding:4px;cursor:pointer;">${isEd ? "Fechar" : "Editar"}</button>
            <button type="button" data-act="tp" style="flex:1;background:transparent;border:1px solid #555;color:#eee;border-radius:4px;padding:4px;cursor:pointer;">Entrar</button>
            <button type="button" data-act="del" style="background:transparent;border:1px solid #a33;color:#f88;border-radius:4px;padding:4px 8px;cursor:pointer;">×</button>
          </div>
        </div>`;
      }).join("");
    }

    if (!editingId) { editorEl.innerHTML = ""; return; }
    const base = portals.find((p) => p.id === editingId);
    if (!base) { editingId = null; editorEl.innerHTML = ""; return; }
    const d = editingDraft || { ...base };
    editingDraft = d;

    const slider = (label, field, min, max, step) => `
      <label style="display:flex;align-items:center;gap:6px;font-size:11px;">
        <span style="width:62px;color:#aab;">${label}</span>
        <input type="range" data-field="${field}" min="${min}" max="${max}" step="${step}" value="${Number(d[field] || 0)}" style="flex:1;">
        <input type="number" data-field="${field}" min="${min}" max="${max}" step="${step}" value="${Number(d[field] || 0)}" style="width:64px;background:#15151c;color:#eee;border:1px solid #333;border-radius:4px;padding:2px 4px;">
      </label>`;

    editorEl.innerHTML = `
      <div style="border-top:1px solid #2a2a35;margin-top:8px;padding-top:10px;display:flex;flex-direction:column;gap:8px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;"><span style="width:62px;color:#aab;">Nome</span>
          <input type="text" data-field="label" value="${_esc(d.label)}" maxlength="40" style="flex:1;background:#15151c;color:#eee;border:1px solid #333;border-radius:4px;padding:4px;">
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;"><span style="width:62px;color:#aab;">Destino</span>
          <select data-field="dest_map_id" style="flex:1;background:#15151c;color:#eee;border:1px solid #333;border-radius:4px;padding:4px;">${destOptions(d.dest_map_id)}</select>
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;"><span style="width:62px;color:#aab;">Portal</span>
          <select data-field="dest_portal_id" style="flex:1;background:#15151c;color:#eee;border:1px solid #333;border-radius:4px;padding:4px;">${destPortalOptions(d.dest_map_id, d.dest_portal_id, d.id)}</select>
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;"><span style="width:62px;color:#aab;">Cor</span>
          <input type="color" data-field="color" value="${_esc(d.color || "#ff3ea5")}" style="width:48px;height:28px;background:#15151c;border:1px solid #333;border-radius:4px;">
          <span style="color:#778;font-size:10px;">(padrão rosa)</span>
        </label>
        <fieldset style="border:1px solid #2a2a35;border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:6px;">
          <legend style="color:#aab;font-size:10px;padding:0 4px;">Posição (mundo)</legend>
          ${slider("X", "pos_x", -50, 50, 0.1)}
          ${slider("Y", "pos_y", -2, 4, 0.05)}
          ${slider("Z", "pos_z", -50, 50, 0.1)}
          <button type="button" data-act="here" style="background:#222;border:1px solid #444;color:#eee;border-radius:4px;padding:4px;cursor:pointer;">📍 Mover para minha posição</button>
        </fieldset>
        <fieldset style="border:1px solid #2a2a35;border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:6px;">
          <legend style="color:#aab;font-size:10px;padding:0 4px;">Forma</legend>
          ${slider("Raio", "radius", 0.4, 4, 0.05)}
          ${slider("Altura", "height", 0.6, 6, 0.1)}
        </fieldset>
        <div style="display:flex;gap:6px;">
          <button type="button" data-act="save" style="flex:1;background:linear-gradient(135deg,#ff3ea5,#ff8ac9);border:none;color:#fff;border-radius:4px;padding:6px;cursor:pointer;font-weight:700;">Salvar</button>
          <button type="button" data-act="cancel" style="flex:1;background:transparent;border:1px solid #555;color:#eee;border-radius:4px;padding:6px;cursor:pointer;">Cancelar</button>
        </div>
      </div>`;

    // Lazy-load portals for the destination map so the "Portal" select can be populated.
    const destMapId = d.dest_map_id;
    if (destMapId && !portalsByMap.has(destMapId)) {
      fetchPortalsForMap(destMapId).then(() => {
        if (editingId !== d.id) return;
        const sel = editorEl.querySelector('select[data-field="dest_portal_id"]');
        if (sel) sel.innerHTML = destPortalOptions(destMapId, editingDraft?.dest_portal_id, d.id);
      });
    }
  }

  // ---------- Panel events ----------
  listEl?.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-act]"); if (!btn) return;
    const row = ev.target.closest(".portal-row"); if (!row) return;
    const id = row.dataset.id;
    const act = btn.dataset.act;
    if (act === "edit") {
      editingId = (editingId === id) ? null : id;
      editingDraft = null;
      renderAdmin();
    } else if (act === "del") {
      if (!confirm("Remover este portal?")) return;
      const { error } = await supabase.from("map_portals").delete().eq("id", id);
      if (error) alert("Erro: " + error.message);
      else { editingId = null; await load(currentMapId); }
    } else if (act === "tp") {
      const p = portals.find((x) => x.id === id);
      if (p?.dest_map_id && typeof switchRoom === "function") switchRoom(p.dest_map_id);
    }
  });

  editorEl?.addEventListener("input", async (ev) => {
    if (!editingDraft) return;
    const t = ev.target;
    const field = t.dataset?.field; if (!field) return;
    let val = t.value;
    if (t.type === "range" || t.type === "number") val = Number(val);
    editingDraft[field] = val;
    // sync the paired range/number input
    editorEl.querySelectorAll(`[data-field="${field}"]`).forEach((el) => {
      if (el !== t) el.value = val;
    });
    // When the destination map changes, reset the chosen dest portal and
    // refresh the portal select with the portals from that map.
    if (field === "dest_map_id") {
      editingDraft.dest_portal_id = null;
      const sel = editorEl.querySelector('select[data-field="dest_portal_id"]');
      if (sel) sel.innerHTML = destPortalOptions(val, null, editingDraft.id);
      await fetchPortalsForMap(val);
      if (editingDraft && editingDraft.dest_map_id === val) {
        const sel2 = editorEl.querySelector('select[data-field="dest_portal_id"]');
        if (sel2) sel2.innerHTML = destPortalOptions(val, editingDraft.dest_portal_id, editingDraft.id);
      }
    }
    // live preview on the mesh
    const m = portalMeshes.get(editingId);
    if (m) {
      const merged = { ...m.row, ...editingDraft };
      const fresh = buildPortalMesh(merged);
      portalsGroup.remove(m.group);
      m.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      portalsGroup.add(fresh);
      portalMeshes.set(editingId, { group: fresh, row: m.row });
    }
  });

  editorEl?.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-act]"); if (!btn) return;
    const act = btn.dataset.act;
    if (act === "cancel") {
      editingId = null; editingDraft = null; renderAdmin();
      await load(currentMapId);
    } else if (act === "here") {
      const entity = (typeof myId !== "undefined" && myId) ? playerEntities.get(myId) : null;
      const pos = entity?.group?.position; if (!pos || !editingDraft) return;
      editingDraft.pos_x = Number(pos.x.toFixed(3));
      editingDraft.pos_z = Number(pos.z.toFixed(3));
      renderAdmin();
    } else if (act === "save") {
      if (!editingId || !editingDraft) return;
      const patch = {
        label: String(editingDraft.label || "Portal").slice(0, 40),
        dest_map_id: editingDraft.dest_map_id,
        dest_portal_id: editingDraft.dest_portal_id ? editingDraft.dest_portal_id : null,
        color: editingDraft.color || "#ff3ea5",
        pos_x: Number(editingDraft.pos_x) || 0,
        pos_y: Number(editingDraft.pos_y) || 0,
        pos_z: Number(editingDraft.pos_z) || 0,
        radius: Math.max(0.3, Number(editingDraft.radius) || 1.2),
        height: Math.max(0.6, Number(editingDraft.height) || 2.6),
      };
      const { error } = await supabase.from("map_portals").update(patch).eq("id", editingId);
      if (error) { alert("Erro: " + error.message); return; }
      // Invalidate cached portal lists for the affected maps so the selector refreshes.
      portalsByMap.delete(currentMapId);
      if (patch.dest_map_id) portalsByMap.delete(patch.dest_map_id);
      editingId = null; editingDraft = null;
      await load(currentMapId);
    }
  });

  // Auto-enter if already in a room when the script loads
  if (typeof currentMapId !== "undefined" && currentMapId && document.body.classList.contains("world-ready")) {
    window.portalsEnterRoom(currentMapId);
  }
})();

// ============================================================
// ===== ITEM CATALOG + ITEM INSTANCES + BOT SERVICE ==========
// ============================================================
(() => {
  if (typeof THREE === "undefined" || typeof scene === "undefined") return;

  // ---------- State ----------
  let itemCatalog = [];                  // [{ slug, name, glb_url, hold_*, drink_animation_url, ... }]
  const itemInstances = new Map();       // id -> { row, group, slug }
  const heldItems = new Map();           // userId -> { instanceRow, mesh, slug, drinkAction }
  const itemGroup = new THREE.Group();
  itemGroup.name = "ItemInstances";
  scene.add(itemGroup);

  // GLB cache per slug
  const _itemGlbCache = new Map(); // slug -> Promise<Object3D>

  function _esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  async function loadItemGlb(catItem) {
    if (!_itemGlbCache.has(catItem.slug)) {
      _itemGlbCache.set(catItem.slug, new Promise((resolve, reject) => {
        loader.load(catItem.glb_url, (gltf) => resolve(gltf.scene), undefined, reject);
      }));
    }
    const src = await _itemGlbCache.get(catItem.slug);
    const mesh = src.clone(true);
    mesh.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    return mesh;
  }

  // ---------- Catalog ----------
  async function reloadItemCatalog() {
    const { data, error } = await supabase.from("item_catalog").select("*").order("name");
    if (error) { console.warn("[items] catalog", error); return; }
    itemCatalog = data || [];
    window.__itemCatalog = itemCatalog;
    renderItemsAdmin();
    window.dispatchEvent(new CustomEvent("items:catalog-updated"));
  }
  window.addEventListener("bot-animations:updated", () => renderItemsAdmin());

  supabase.channel("item-catalog")
    .on("postgres_changes", { event: "*", schema: "public", table: "item_catalog" }, () => reloadItemCatalog())
    .subscribe();

  // ---------- Instances ----------
  async function reloadMapItems(mapId) {
    // clear current
    for (const [id, e] of [...itemInstances]) {
      itemGroup.remove(e.group);
      itemInstances.delete(id);
    }
    if (!mapId) return;
    const { data, error } = await supabase.from("map_item_instances").select("*").eq("map_id", mapId);
    if (error) { console.warn("[items] instances", error); return; }
    for (const row of data || []) await spawnInstance(row);
  }

  async function spawnInstance(row) {
    if (itemInstances.has(row.id)) return;
    const cat = itemCatalog.find((c) => c.slug === row.item_slug);
    if (!cat) {
      // Try fetching catalog once if not loaded yet
      await reloadItemCatalog();
      const cat2 = itemCatalog.find((c) => c.slug === row.item_slug);
      if (!cat2) { console.warn("[items] sem catálogo p/ slug", row.item_slug); return; }
      return spawnInstance(row);
    }
    let mesh;
    try { mesh = await loadItemGlb(cat); }
    catch (e) { console.warn("[items] GLB load", e); return; }
    const group = new THREE.Group();
    group.name = "ItemInstance:" + row.id;
    group.userData.itemInstanceId = row.id;
    group.userData.itemSlug = row.item_slug;
    mesh.scale.setScalar(cat.scale || 1);
    group.add(mesh);
    group.position.set(row.x, row.y, row.z);
    group.rotation.y = row.rotation_y || 0;
    itemGroup.add(group);
    itemInstances.set(row.id, { row, group, slug: row.item_slug });
  }

  function removeInstance(id) {
    const e = itemInstances.get(id);
    if (!e) return;
    itemGroup.remove(e.group);
    itemInstances.delete(id);
  }

  let _itemsChannel = null;
  function subscribeItemsForMap(mapId) {
    if (_itemsChannel) { try { supabase.removeChannel(_itemsChannel); } catch {} _itemsChannel = null; }
    if (!mapId) return;
    _itemsChannel = supabase.channel("map-items:" + mapId)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "map_item_instances", filter: "map_id=eq." + mapId },
        async (payload) => {
          if (payload.eventType === "INSERT") await spawnInstance(payload.new);
          else if (payload.eventType === "DELETE") removeInstance(payload.old.id);
          else if (payload.eventType === "UPDATE") {
            const e = itemInstances.get(payload.new.id);
            if (e) {
              e.row = payload.new;
              e.group.position.set(payload.new.x, payload.new.y, payload.new.z);
              e.group.rotation.y = payload.new.rotation_y || 0;
            }
          }
        })
      .subscribe();
  }

  // Auto-despawn loop (best-effort: any client triggers DELETE)
  setInterval(async () => {
    const now = Date.now();
    for (const [id, e] of itemInstances) {
      const exp = e.row.expires_at ? new Date(e.row.expires_at).getTime() : 0;
      if (exp && exp <= now) {
        try { await supabase.from("map_item_instances").delete().eq("id", id); } catch {}
      }
    }
  }, 5000);

  // ---------- Hold (attach to bone) ----------
  function findBoneByName(root, name) {
    if (!root || !name) return null;
    let found = null;
    const target = String(name).toLowerCase();
    root.traverse((o) => {
      if (found) return;
      if (!o.isBone && o.type !== "Bone") return;
      const n = (o.name || "").replace(/^mixamorig\d*:?/i, "").toLowerCase();
      if (n === target) found = o;
    });
    if (found) return found;
    // fallback: substring match
    root.traverse((o) => {
      if (found) return;
      if (!o.isBone && o.type !== "Bone") return;
      const n = (o.name || "").replace(/^mixamorig\d*:?/i, "").toLowerCase();
      if (n.includes(target)) found = o;
    });
    return found;
  }

  async function attachItemToUser(userId, instanceRow, cat) {
    const entity = playerEntities.get(userId);
    if (!entity?.character) return null;
    const bone = findBoneByName(entity.character, cat.hold_bone || "RightHand");
    if (!bone) { console.warn("[items] bone não encontrado:", cat.hold_bone); return null; }
    let mesh;
    try { mesh = await loadItemGlb(cat); } catch (e) { console.warn("[items] hold GLB", e); return null; }
    mesh.scale.setScalar((cat.scale || 1) * (cat.hold_scale || 1));
    mesh.position.set(cat.hold_offset_x || 0, cat.hold_offset_y || 0, cat.hold_offset_z || 0);
    mesh.rotation.set(
      (cat.hold_rot_x || 0) * Math.PI / 180,
      (cat.hold_rot_y || 0) * Math.PI / 180,
      (cat.hold_rot_z || 0) * Math.PI / 180
    );
    mesh.userData.heldItem = true;
    bone.add(mesh);
    // Start drink overlay if available
    let drinkAction = null;
    if (cat.drink_animation_url && entity.mixer) {
      try {
        const clip = await loadFbxClip(cat.drink_animation_url);
        const bones = collectBoneNames(entity.character);
        const retarg = retargetClipToBones(clip, bones, { stripRootPosition: true });
        if (retarg) {
          // Mask: keep only the right-arm chain so the cup-to-mouth motion
          // is the ONLY thing the drink clip drives. Idle/walk continue to
          // control the rest of the body normally.
          const keep = /right(arm|forearm|hand|shoulder)/i;
          retarg.tracks = retarg.tracks.filter((t) => keep.test(t.name.replace(/^mixamorig\d*:?/i, "")));
          if (retarg.tracks.length) {
            // Make the clip ADDITIVE relative to its first frame, so it
            // applies as a delta on top of idle/walk instead of blending
            // with them (which caused the arm to "merge" half-way).
            try { THREE.AnimationUtils.makeClipAdditive(retarg); } catch {}
            drinkAction = entity.mixer.clipAction(retarg);
            drinkAction.blendMode = THREE.AdditiveAnimationBlendMode;
            drinkAction.setLoop(THREE.LoopRepeat, Infinity);
            drinkAction.weight = 1;
            drinkAction.play();
          }
        }
      } catch (e) { console.warn("[items] drink anim", e); }
    }
    heldItems.set(userId, { instanceRow, mesh, slug: cat.slug, drinkAction, bone });
    return mesh;
  }

  function detachItemFromUser(userId) {
    const held = heldItems.get(userId);
    if (!held) return null;
    try { held.bone?.remove(held.mesh); } catch {}
    try {
      if (held.drinkAction) {
        held.drinkAction.fadeOut(0.2);
        setTimeout(() => { try { held.drinkAction.stop(); } catch {} }, 220);
      }
    } catch {}
    heldItems.delete(userId);
    return held;
  }

  // ---------- Bot service ----------
  function getBotEntityById(botId) {
    return botEntities.get(botId);
  }

  async function playBotActionOnce(botEntity, animUrl, durationMs) {
    if (!botEntity || !animUrl) return;
    try {
      const clip = await loadFbxClip(animUrl);
      const bones = collectBoneNames(botEntity.character);
      const retarg = retargetClipToBones(clip, bones, { stripRootPosition: true });
      if (!retarg) return;
      const prev = botEntity.action;
      const a = botEntity.mixer.clipAction(retarg);
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.reset().fadeIn(0.2).play();
      if (prev) { try { prev.fadeOut(0.2); } catch {} }
      botEntity.action = a;
      // After durationMs, restore idle animation
      setTimeout(() => {
        try { a.fadeOut(0.25); } catch {}
        setTimeout(() => {
          try { a.stop(); } catch {}
          // Re-apply original animation_url (or idle if null)
          botEntity.animationUrl = null;
          applyBotAnimation(botEntity, botEntity.row?.animation_url || null);
        }, 260);
      }, Math.max(200, durationMs - 250));
    } catch (e) { console.warn("[bot-service] play", e); }
  }

  window.__runBotService = async function (inter) {
    const myEnt = playerEntities.get(myId);
    if (!myEnt) return;
    if (window.isInteractionOccupied?.(inter.id)) {
      addSystemLine?.("Aguarde, o garçom está ocupado.");
      return;
    }
    // Mark occupancy locally
    try {
      window.__sittingInteraction = { id: inter.id, _service: true };
      presenceChannel?.track(presencePayload());
    } catch {}

    const duration = Math.max(200, inter.service_duration_ms || 3500);

    // 1) Trigger bot animation (face the player)
    if (inter.bot_id) {
      const bot = getBotEntityById(inter.bot_id);
      if (bot) {
        try {
          const dx = myEnt.group.position.x - bot.group.position.x;
          const dz = myEnt.group.position.z - bot.group.position.z;
          bot.group.rotation.y = Math.atan2(dx, dz);
        } catch {}
        if (inter.bot_animation_url) playBotActionOnce(bot, inter.bot_animation_url, duration);
      }
    }

    addSystemLine?.("Servindo…");

    // 2) After duration, spawn item instance at configured world position
    setTimeout(async () => {
      try {
        // release occupancy
        if (window.__sittingInteraction?._service) {
          window.__sittingInteraction = null;
          try { presenceChannel?.track(presencePayload()); } catch {}
        }
        if (!inter.item_slug) { addSystemLine?.("Nenhum item configurado."); return; }
        // Compute world position via existing seat pose helper
        const baseWorld = (function () {
          // Reuse computeSeatPose from interactions module isn't exposed; replicate minimal logic
          const ox = inter.offset_x || 0, oy = inter.offset_y || 0, oz = inter.offset_z || 0;
          if (!inter.asset_id) return new THREE.Vector3(ox, oy, oz);
          const obj = assetObjects.get(inter.asset_id);
          if (!obj) return new THREE.Vector3(ox, oy, oz);
          obj.updateMatrixWorld(true);
          return new THREE.Vector3(ox, oy, oz).applyMatrix4(obj.matrixWorld);
        })();
        const spawn = {
          x: baseWorld.x + (inter.item_spawn_offset_x || 0),
          y: baseWorld.y + (inter.item_spawn_offset_y || 0),
          z: baseWorld.z + (inter.item_spawn_offset_z || 0),
        };
        const expiresAt = inter.auto_despawn_ms > 0
          ? new Date(Date.now() + inter.auto_despawn_ms).toISOString()
          : null;
        const { error } = await supabase.from("map_item_instances").insert({
          map_id: currentMapId,
          item_slug: inter.item_slug,
          x: spawn.x, y: spawn.y, z: spawn.z, rotation_y: 0,
          spawned_by: myId || null,
          source_interaction_id: inter.id,
          expires_at: expiresAt,
        });
        if (error) console.warn("[items] insert", error);
        else addSystemLine?.("Pronto! Pegue sua bebida.");
      } catch (e) { console.warn("[bot-service] spawn", e); }
    }, duration);
  };

  // ---------- Pickup / drop proximity loop ----------
  let nearbyItemId = null;
  const pickupPrompt = document.createElement("div");
  pickupPrompt.id = "itemPickupPrompt";
  pickupPrompt.style.cssText = "position:fixed;pointer-events:auto;cursor:pointer;background:linear-gradient(135deg,#ffd27a,#ff7a59);color:#1a0e00;padding:6px 14px;border-radius:999px;font:600 13px system-ui;box-shadow:0 4px 20px rgba(0,0,0,.5);z-index:50;transition:opacity .15s;user-select:none;";
  pickupPrompt.hidden = true;
  document.body.appendChild(pickupPrompt);
  pickupPrompt.addEventListener("click", () => tryPickupOrDrop());

  const _tmpV3 = new THREE.Vector3();
  setInterval(() => {
    const myEnt = playerEntities.get(myId);
    if (!myEnt?.group) { pickupPrompt.hidden = true; nearbyItemId = null; return; }
    // If holding, show "Soltar"
    if (heldItems.has(myId)) {
      pickupPrompt.hidden = false;
      pickupPrompt.textContent = "Soltar (E)";
      // anchor near player
      const world = myEnt.group.position.clone(); world.y += 2.2;
      const rect = renderer.domElement.getBoundingClientRect();
      _tmpV3.copy(world).project(camera);
      pickupPrompt.style.left = ((_tmpV3.x * 0.5 + 0.5) * rect.width + rect.left) + "px";
      pickupPrompt.style.top  = ((-_tmpV3.y * 0.5 + 0.5) * rect.height + rect.top) + "px";
      pickupPrompt.style.transform = "translate(-50%,-100%)";
      nearbyItemId = "__drop__";
      return;
    }
    // Find nearest item within 1.5m
    let best = null, bestD = Infinity;
    const px = myEnt.group.position.x, pz = myEnt.group.position.z;
    for (const [id, e] of itemInstances) {
      const d = Math.hypot(e.group.position.x - px, e.group.position.z - pz);
      if (d < 1.5 && d < bestD) { best = { id, e, d }; bestD = d; }
    }
    if (!best) { pickupPrompt.hidden = true; nearbyItemId = null; return; }
    nearbyItemId = best.id;
    pickupPrompt.hidden = false;
    pickupPrompt.textContent = "Pegar (E)";
    const world = best.e.group.position.clone(); world.y += 0.6;
    const rect = renderer.domElement.getBoundingClientRect();
    _tmpV3.copy(world).project(camera);
    pickupPrompt.style.left = ((_tmpV3.x * 0.5 + 0.5) * rect.width + rect.left) + "px";
    pickupPrompt.style.top  = ((-_tmpV3.y * 0.5 + 0.5) * rect.height + rect.top) + "px";
    pickupPrompt.style.transform = "translate(-50%,-100%)";
  }, 180);

  async function tryPickupOrDrop() {
    if (!nearbyItemId) return;
    // Drop
    if (nearbyItemId === "__drop__") {
      const held = heldItems.get(myId);
      if (!held) return;
      const myEnt = playerEntities.get(myId);
      const px = myEnt?.group?.position?.x || 0;
      const py = 0;
      const pz = myEnt?.group?.position?.z || 0;
      // detach locally first
      const cat = itemCatalog.find((c) => c.slug === held.slug);
      const expiresAt = new Date(Date.now() + 60000).toISOString();
      detachItemFromUser(myId);
      try {
        await supabase.from("map_item_instances").insert({
          map_id: currentMapId,
          item_slug: held.slug,
          x: px, y: py, z: pz, rotation_y: 0,
          spawned_by: myId || null,
          expires_at: expiresAt,
        });
      } catch (e) { console.warn("[items] drop", e); }
      return;
    }
    // Pickup (race-safe DELETE + RETURNING)
    const targetId = nearbyItemId;
    const e = itemInstances.get(targetId);
    if (!e) return;
    const cat = itemCatalog.find((c) => c.slug === e.slug);
    if (!cat) return;
    const { data: deleted, error } = await supabase
      .from("map_item_instances").delete().eq("id", targetId).select();
    if (error) { console.warn("[items] pickup", error); return; }
    if (!deleted || !deleted.length) { addSystemLine?.("Alguém pegou primeiro."); return; }
    // Local remove (realtime DELETE will also remove)
    removeInstance(targetId);
    await attachItemToUser(myId, deleted[0], cat);
  }

  // Hotkey E for pickup/drop (in addition to button click)
  window.addEventListener("keydown", (ev) => {
    if (ev.key !== "e" && ev.key !== "E") return;
    if (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    if (!nearbyItemId) return;
    ev.preventDefault();
    tryPickupOrDrop();
  });

  // ---------- Items admin panel ----------
  const itemsListEl = () => document.getElementById("itemsList");
  function renderItemsAdmin() {
    const el = itemsListEl(); if (!el) return;
    if (!itemCatalog.length) {
      el.innerHTML = '<div style="color:#777;font-size:11px;padding:6px;">Nenhum item cadastrado ainda.</div>';
      return;
    }
    const slider = (label, key, val, min, max, step) => `
      <label style="display:flex;align-items:center;gap:6px;font-size:11px;margin:2px 0;">
        <span style="flex:0 0 110px;color:#9aa;">${label}</span>
        <input type="range" data-itemfield="${key}" min="${min}" max="${max}" step="${step}" value="${val}" style="flex:1">
        <input type="number" data-itemfield="${key}" min="${min}" max="${max}" step="${step}" value="${Number(val).toFixed(2)}" style="width:60px;background:#1a1f2a;color:#fff;border:1px solid #333;border-radius:3px;padding:2px;">
      </label>`;
    el.innerHTML = itemCatalog.map((it) => `
      <details data-item-id="${_esc(it.id)}" style="border:1px solid #2a3040;border-radius:6px;">
        <summary style="cursor:pointer;padding:6px 8px;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.04);">
          <span><strong>${_esc(it.name)}</strong> <span style="color:#888;font-size:10px;">(${_esc(it.slug)})</span></span>
          <button type="button" data-act="del-item" style="background:#7a2434;color:#fff;border:none;border-radius:3px;padding:2px 6px;cursor:pointer;">×</button>
        </summary>
        <div style="padding:8px;">
          <div style="font-weight:600;font-size:11px;color:#9aa;margin-bottom:4px;">Spawn (no mundo)</div>
          ${slider("Escala", "scale", it.scale, 0.1, 5, 0.05)}
          ${slider("Offset Y spawn", "spawn_offset_y", it.spawn_offset_y, -1, 3, 0.05)}
          <div style="font-weight:600;font-size:11px;color:#9aa;margin:8px 0 4px;">Ao carregar (mão)</div>
          <label style="display:flex;align-items:center;gap:6px;font-size:11px;margin:2px 0;">
            <span style="flex:0 0 110px;color:#9aa;">Bone da mão</span>
            <input type="text" data-itemfield="hold_bone" value="${_esc(it.hold_bone || 'RightHand')}" style="flex:1;background:#1a1f2a;color:#fff;border:1px solid #333;border-radius:3px;padding:2px 4px;">
          </label>
          ${slider("Hold escala", "hold_scale", it.hold_scale, 0.1, 5, 0.05)}
          ${slider("Hold offset X", "hold_offset_x", it.hold_offset_x, -0.5, 0.5, 0.005)}
          ${slider("Hold offset Y", "hold_offset_y", it.hold_offset_y, -0.5, 0.5, 0.005)}
          ${slider("Hold offset Z", "hold_offset_z", it.hold_offset_z, -0.5, 0.5, 0.005)}
          ${slider("Hold rot X (°)", "hold_rot_x", it.hold_rot_x, -180, 180, 1)}
          ${slider("Hold rot Y (°)", "hold_rot_y", it.hold_rot_y, -180, 180, 1)}
          ${slider("Hold rot Z (°)", "hold_rot_z", it.hold_rot_z, -180, 180, 1)}
          <div style="font-weight:600;font-size:11px;color:#9aa;margin:8px 0 4px;">Animação ao beber (FBX, overlay no braço+cabeça)</div>
          <label style="display:flex;align-items:center;gap:6px;font-size:11px;margin:2px 0;">
            <span style="flex:0 0 110px;color:#9aa;">Animação</span>
            <select data-itemfield="drink_animation_url" style="flex:1;background:#1a1f2a;color:#fff;border:1px solid #333;border-radius:3px;padding:2px;">
              <option value="">— Nenhuma —</option>
              ${(window.__botAnimations || []).map(a => `<option value="${_esc(a.url)}" ${a.url === (it.drink_animation_url || "") ? "selected" : ""}>${_esc(a.name)}</option>`).join("")}
            </select>
          </label>
          <button type="button" data-act="save-item" class="primary" style="margin-top:6px;width:100%;background:#29d3bd;color:#001a17;border:none;border-radius:4px;padding:6px;cursor:pointer;font-weight:600;">Salvar</button>
        </div>
      </details>
    `).join("");
  }

  const itemsPanel = () => document.getElementById("itemsAdminPanel");
  document.addEventListener("click", async (ev) => {
    const t = ev.target;
    if (!t) return;
    // delete
    if (t.dataset && t.dataset.act === "del-item") {
      ev.preventDefault();
      const det = t.closest("[data-item-id]");
      if (!det || !confirm("Excluir este item do catálogo?")) return;
      const id = det.dataset.itemId;
      const { error } = await supabase.from("item_catalog").delete().eq("id", id);
      if (error) alert("Erro: " + error.message);
      return;
    }
    // save
    if (t.dataset && t.dataset.act === "save-item") {
      ev.preventDefault();
      const det = t.closest("[data-item-id]"); if (!det) return;
      const id = det.dataset.itemId;
      const patch = {};
      det.querySelectorAll("[data-itemfield]").forEach((inp) => {
        const k = inp.dataset.itemfield;
        if (inp.type === "number" || inp.type === "range") patch[k] = Number(inp.value);
        else patch[k] = inp.value || null;
      });
      const { error } = await supabase.from("item_catalog").update(patch).eq("id", id);
      if (error) alert("Erro: " + error.message);
      else addSystemLine?.("Item salvo.");
    }
  });

  // keep range/number in sync inside items panel
  document.addEventListener("input", (ev) => {
    const el = ev.target;
    if (!el?.dataset || !el.dataset.itemfield) return;
    const wrap = el.closest("label"); if (!wrap) return;
    if (el.type === "range") {
      const num = wrap.querySelector('input[type=number][data-itemfield]');
      if (num && document.activeElement !== num) num.value = Number(el.value).toFixed(2);
    } else if (el.type === "number") {
      const range = wrap.querySelector('input[type=range][data-itemfield]');
      if (range) range.value = el.value;
    }
  });

  // Upload new item GLB
  document.addEventListener("change", async (ev) => {
    const t = ev.target;
    if (!t || t.id !== "newItemGlbFile") return;
    const file = t.files?.[0]; if (!file) return;
    const nameEl = document.getElementById("newItemName");
    const slugEl = document.getElementById("newItemSlug");
    const status = document.getElementById("newItemStatus");
    const name = nameEl?.value?.trim() || file.name.replace(/\.glb$/i, "");
    let slug = (slugEl?.value?.trim() || name).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slug) { alert("Informe um slug válido."); return; }
    status.textContent = "Enviando…";
    try {
      const path = "items/" + slug + "-" + Date.now() + ".glb";
      const { error: upErr } = await supabase.storage.from("map-assets").upload(path, file, { contentType: "model/gltf-binary", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("map-assets").getPublicUrl(path);
      const { error: insErr } = await supabase.from("item_catalog").insert({
        slug, name, glb_url: pub.publicUrl, created_by: myId || null,
      });
      if (insErr) throw insErr;
      status.textContent = "✔ Cadastrado.";
      if (nameEl) nameEl.value = "";
      if (slugEl) slugEl.value = "";
      t.value = "";
    } catch (e) {
      status.textContent = "Erro: " + (e?.message || e);
    }
  });

  // ---------- Lifecycle hooks ----------
  let lastMap = null;
  setInterval(() => {
    if (currentMapId !== lastMap) {
      lastMap = currentMapId;
      // detach any held when changing map
      if (heldItems.has(myId)) detachItemFromUser(myId);
      reloadMapItems(currentMapId);
      subscribeItemsForMap(currentMapId);
    }
  }, 1000);

  // initial
  (async () => {
    await reloadItemCatalog();
    setTimeout(() => { reloadMapItems(currentMapId); subscribeItemsForMap(currentMapId); }, 800);
  })();

})();


// ============================================================
// ===== ITEM EDIT PREVIEW (admin: arrastar item com setinhas) =
// ============================================================
(function itemEditPreview() {
  if (typeof THREE === "undefined" || typeof scene === "undefined") return;

  let previewGroup = null;
  let previewSlug = null;
  let activeDraft = null;
  let pendingLoadSlug = null;

  function _baseWorld(draft) {
    const ox = Number(draft.offset_x) || 0, oy = Number(draft.offset_y) || 0, oz = Number(draft.offset_z) || 0;
    if (!draft.asset_id) return new THREE.Vector3(ox, oy, oz);
    const obj = assetObjects.get(draft.asset_id);
    if (!obj) return new THREE.Vector3(ox, oy, oz);
    obj.updateMatrixWorld(true);
    return new THREE.Vector3(ox, oy, oz).applyMatrix4(obj.matrixWorld);
  }
  function _spawnWorld(draft) {
    const b = _baseWorld(draft);
    b.x += Number(draft.item_spawn_offset_x) || 0;
    b.y += Number(draft.item_spawn_offset_y) || 0;
    b.z += Number(draft.item_spawn_offset_z) || 0;
    return b;
  }

  function clearPreview() {
    const wasActive = !!previewGroup;
    if (previewGroup) {
      try { scene.remove(previewGroup); } catch {}
      previewGroup.traverse?.((o) => {
        if (o.isMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { try { m.dispose?.(); } catch {} });
        }
      });
      previewGroup = null;
    }
    previewSlug = null;
    activeDraft = null;
    pendingLoadSlug = null;
    if (wasActive) { try { window.detachGizmo?.(); } catch {} }
  }

  function _attachGizmo() {
    if (!previewGroup) return;
    try {
      window.attachGizmo?.({
        getPosition: () => previewGroup.position.clone(),
        setPosition: (v) => {
          if (!previewGroup || !activeDraft) return;
          previewGroup.position.copy(v);
          const base = _baseWorld(activeDraft);
          activeDraft.item_spawn_offset_x = +(v.x - base.x).toFixed(3);
          activeDraft.item_spawn_offset_y = +(v.y - base.y).toFixed(3);
          activeDraft.item_spawn_offset_z = +(v.z - base.z).toFixed(3);
          // Reflete os valores nos sliders/inputs do editor
          const ed = document.getElementById("interactionsEditor");
          if (ed) {
            for (const k of ["item_spawn_offset_x", "item_spawn_offset_y", "item_spawn_offset_z"]) {
              ed.querySelectorAll(`[data-field="${k}"]`).forEach((el) => {
                if (el.type === "number") el.value = Number(activeDraft[k]).toFixed(2);
                else el.value = String(activeDraft[k]);
              });
            }
          }
        },
      });
    } catch {}
  }

  function _loadGlb(cat) {
    return new Promise((res, rej) => {
      try { loader.load(cat.glb_url, (g) => res(g.scene.clone(true)), undefined, rej); }
      catch (e) { rej(e); }
    });
  }

  async function _ensurePreview(draft) {
    const cat = (window.__itemCatalog || []).find((c) => c.slug === draft.item_slug);
    if (!cat) { clearPreview(); return; }
    if (previewSlug !== draft.item_slug) {
      clearPreview();
      previewSlug = draft.item_slug;
      pendingLoadSlug = draft.item_slug;
      let mesh = null;
      try { mesh = await _loadGlb(cat); }
      catch (e) { console.warn("[item preview]", e); pendingLoadSlug = null; return; }
      if (pendingLoadSlug !== draft.item_slug) return; // mudou enquanto carregava
      pendingLoadSlug = null;
      mesh.scale.setScalar(cat.scale || 1);
      mesh.traverse((o) => {
        if (o.isMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          o.material = mats.map((m) => {
            const cl = m.clone();
            cl.transparent = true; cl.opacity = 0.7; cl.depthWrite = false;
            return cl;
          });
        }
      });
      previewGroup = new THREE.Group();
      previewGroup.name = "ItemEditPreview";
      previewGroup.add(mesh);
      scene.add(previewGroup);
      _attachGizmo();
    }
    if (previewGroup) previewGroup.position.copy(_spawnWorld(draft));
  }

  window.__setItemEditPreview = function (draft) {
    if (!draft || draft.kind !== "bot_service" || !draft.item_slug) { clearPreview(); return; }
    activeDraft = draft;
    _ensurePreview(draft);
  };
  window.__clearItemEditPreview = clearPreview;
})();

// ============================================================
// WEB PUSH NOTIFICATIONS (PWA instalado / iOS 16.4+ standalone)
// ============================================================
(function setupWebPush() {
  const VAPID_PUBLIC_KEY = "BJDMd4x3FV-pgiH6mk2Sy93qw3vdGXMkZd0Q89yeKS_zvXXlobv3aZ_Tzd0v9jwvoBiiOn27fBMb7zlo080Rp1M";
  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function bufToB64(buf) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  // Só dispara em PWA instalado (standalone) — alinhado com requisitos do iOS 16.4+
  function isStandalone() {
    try {
      return (
        window.matchMedia?.("(display-mode: standalone)").matches ||
        window.navigator.standalone === true
      );
    } catch { return false; }
  }
  async function registerAndSubscribe() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      if (!isStandalone()) return;
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      if (Notification.permission === "denied") return;
      if (Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;
      }
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      const { data: { user } } = await window.supabase.auth.getUser();
      if (!user) return;
      const json = sub.toJSON();
      await window.supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            endpoint: sub.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
            user_agent: navigator.userAgent.slice(0, 256),
          },
          { onConflict: "endpoint" }
        );
    } catch (e) {
      console.warn("[push] subscribe failed", e);
    }
  }
  // Tenta logo após login e em qualquer gesto inicial do usuário
  function trigger() { registerAndSubscribe(); }
  window.addEventListener("auth-ready", trigger);
  document.addEventListener("click", trigger, { once: true, capture: true });
  document.addEventListener("touchstart", trigger, { once: true, capture: true });

  // Helper: enviar push (chamado quando o jogador entra no lobby)
  window.__notifyFriendsOnline = async function () {
    try {
      const { data: { user } } = await window.supabase.auth.getUser();
      if (!user) return;
      const { data: rels } = await window.supabase
        .from("friend_requests")
        .select("from_user,to_user")
        .or(`from_user.eq.${user.id},to_user.eq.${user.id}`)
        .eq("status", "accepted");
      const friendIds = (rels || []).map((r) => (r.from_user === user.id ? r.to_user : r.from_user));
      if (friendIds.length === 0) return;
      const { data: prof } = await window.supabase
        .from("profiles").select("nickname").eq("id", user.id).maybeSingle();
      const nick = prof?.nickname || "Um amigo";
      await window.supabase.functions.invoke("send-push", {
        body: {
          user_ids: friendIds,
          title: "Virtualife",
          body: `${nick} ficou online`,
          url: "/",
          tag: `online:${user.id}`,
        },
      });
    } catch (e) { console.warn("[push] notifyFriendsOnline", e); }
  };
})();
