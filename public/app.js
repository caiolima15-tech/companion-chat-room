import * as THREE from "three";
import { OrbitControls } from "/vendor/OrbitControls.js";
import { GLTFLoader } from "/vendor/GLTFLoader.js";
import { GLTFExporter } from "/vendor/GLTFExporter.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============ Supabase ============
const SUPABASE_URL = "https://ajphaszjpizepjmnjxtm.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqcGhhc3pqcGl6ZXBqbW5qeHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjYzOTksImV4cCI6MjA5NDgwMjM5OX0.uA5QN5snoDSOq0alFQMl89o_L4pksRIOWlZT0wm2nk0";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
const LOGIN_DISABLED_FOR_TEST = true;

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
let followCamera = true;
let lastMoveSent = 0;
let isAdmin = false;
let currentAssets = [];
let presenceChannel = null;
let movementChannel = null;
let mapChannel = null;
let chatChannel = null;
let lastSpeechClear = 0;

const playerEntities = new Map(); // id -> { group, mixer, actions, currentAction, target, plate, player, avatarUrl }
const assetObjects = new Map();
const keyState = new Set();

// ============ Scene ============
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0e1117");
scene.fog = new THREE.Fog("#0e1117", 16, 36);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 90);
camera.position.set(8.8, 8.4, 9.4);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 6;
controls.maxDistance = 24;
controls.target.set(0, 0.7, 0);

const stage = new THREE.Group();
scene.add(stage);

buildMap();
resize();
renderPermissions();
requestAnimationFrame(animate);

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
  if (LOGIN_DISABLED_FOR_TEST) {
    // Sempre garante uma sessão real (anon) no Supabase pra realtime/presence funcionar entre navegadores
    const { data: existing } = await supabase.auth.getSession();
    if (existing.session?.user) {
      await bootstrapSession(existing.session.user);
      return;
    }
    const { data: anon, error: anonErr } = await supabase.auth.signInAnonymously();
    if (anonErr || !anon?.user) {
      console.warn("Falha no signInAnonymously, usando guest local:", anonErr);
      await bootstrapSession(getGuestUser());
      return;
    }
    await bootstrapSession(anon.user);
    return;
  }

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
    .select("nickname, color, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const nickname = profile?.nickname || user.user_metadata?.nickname || localStorage.getItem("neon-tap-room-nickname") || "Visitante";
  const color = profile?.color || randomColor();
  const avatarUrl = profile?.avatar_url || null;
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
    x: 50,
    y: 50,
    facing: "down",
    speech: "",
    isAdmin,
  };

  renderPermissions();
  await Promise.all([loadInitialAssets(), loadInitialChat()]);
  await connectRealtime();
  addSystemLine(isAdmin ? "Você entrou como admin da sala." : "Bem-vindo à sala!");
}

function randomColor() {
  const palette = ["#29d3bd", "#f4bd4f", "#a78bfa", "#f26868", "#74c0fc", "#ffa94d"];
  return palette[Math.floor(Math.random() * palette.length)];
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
    z: row.z,
    rotationY: row.rotation_y,
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
          setTimeout(() => {
            player.speech = "";
            updateNameplate(player);
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
        if (old && p.id !== myId) {
          return { ...p, x: old.x ?? p.x, y: old.y ?? p.y, facing: old.facing ?? p.facing, speech: old.speech ?? p.speech };
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
        players[idx] = { ...players[idx], x: payload.x, y: payload.y, facing: payload.facing };
        const entity = playerEntities.get(payload.id);
        if (entity) {
          entity.player = players[idx];
          entity.target.copy(worldFromPercent(payload.x, payload.y));
        }
      }
    })
    .subscribe();
}

function presencePayload() {
  return {
    id: myId,
    name: me.name,
    color: me.color,
    avatar_url: me.avatar_url,
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
      payload: { id: myId, x: me.x, y: me.y, facing: me.facing },
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
function buildMap() {
  scene.add(new THREE.HemisphereLight("#ffe7b0", "#243344", 1.35));
  const key = new THREE.DirectionalLight("#ffffff", 1.35);
  key.position.set(6, 10, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 26;
  key.shadow.camera.left = -12;
  key.shadow.camera.right = 12;
  key.shadow.camera.top = 12;
  key.shadow.camera.bottom = -12;
  scene.add(key);

  const redAccent = new THREE.PointLight("#f26868", 3.4, 10);
  redAccent.position.set(-6.7, 3.2, -6.2);
  scene.add(redAccent);

  const tealAccent = new THREE.PointLight("#29d3bd", 2.4, 13);
  tealAccent.position.set(5.7, 3.4, 3.6);
  scene.add(tealAccent);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_WIDTH, MAP_DEPTH, 18, 14),
    new THREE.MeshStandardMaterial({ color: "#202832", roughness: 0.86, metalness: 0.02 }),
  );
  floor.name = "WalkableFloor";
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  stage.add(floor);

  const grid = new THREE.GridHelper(MAP_WIDTH, 18, "#48515e", "#2d3540");
  grid.scale.z = MAP_DEPTH / MAP_WIDTH;
  grid.position.y = 0.012;
  stage.add(grid);

  makeBox("BackWall", [MAP_WIDTH, 3.5, 0.35], [0, 1.75, -MAP_DEPTH / 2], "#232b36", { castShadow: false });
  makeBox("LeftWall", [0.35, 3.5, MAP_DEPTH], [-MAP_WIDTH / 2, 1.75, 0], "#1c2530", { castShadow: false });
  makeBox("RightRail", [0.28, 1.0, MAP_DEPTH], [MAP_WIDTH / 2, 0.5, 0], "#161f29");
}

// ============ Character ============
function createCharacter(color = "#29d3bd") {
  const root = new THREE.Group();
  root.name = "BarPlayer";
  const skin = material("#ffd4a3", 0.66);
  const shirt = material(color, 0.62);
  const dark = material("#171923", 0.72);
  const shoes = material("#0f141c", 0.7);

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

  // Default capsule character; replaced by GLB if avatar_url provided
  const character = createCharacter(player.color);
  group.add(character);

  const mixer = new THREE.AnimationMixer(character);
  const idle = mixer.clipAction(character.userData.clips.idle);
  const walk = mixer.clipAction(character.userData.clips.walk);
  idle.play();

  const plate = document.createElement("div");
  plate.className = "nameplate";
  nameplatesLayer.appendChild(plate);

  const entity = {
    group,
    character,
    mixer,
    actions: { idle, walk },
    currentAction: "idle",
    target: group.position.clone(),
    plate,
    player,
    avatarUrl: null,
  };
  if (player.avatar_url) applyAvatar(entity, player.avatar_url);
  return entity;
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
  if (!entity.actions[name]) return;
  if (entity.currentAction === name) return;
  const previous = entity.actions[entity.currentAction];
  const next = entity.actions[name];
  if (previous) previous.fadeOut(0.16);
  next.reset().fadeIn(0.16).play();
  entity.currentAction = name;
}

function updateNameplate(player) {
  const entity = playerEntities.get(player.id);
  if (!entity) return;
  entity.plate.innerHTML = `
    ${player.speech ? `<div class="speech">${escapeHtml(player.speech)}</div>` : ""}
    <div class="plate-name">${escapeHtml(player.name)}${player.id === myId ? " (você)" : ""}${player.isAdmin ? " • admin" : ""}</div>
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
    entity.target.copy(worldFromPercent(player.x, player.y));
    if (player.avatar_url && entity.avatarUrl !== player.avatar_url) {
      applyAvatar(entity, player.avatar_url);
    }
    // Tint default character
    if (!player.avatar_url) {
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
      object.position.set(asset.x, 0, asset.z);
      object.rotation.y = asset.rotationY;
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
        object.position.set(asset.x, 0, asset.z);
        object.rotation.y = asset.rotationY;
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
        fallback.position.set(asset.x, 0, asset.z);
        fallback.rotation.y = asset.rotationY;
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
    .map(
      (asset) => `
    <div class="asset-pill">
      <div class="asset-name">${escapeHtml(asset.name)}</div>
      <div class="asset-actions">
        <button type="button" data-asset-action="move" data-asset-id="${escapeHtml(asset.id)}" class="${movingAssetId === asset.id ? "is-active" : ""}">Mover</button>
        <button type="button" data-asset-action="rotate" data-asset-id="${escapeHtml(asset.id)}">Girar</button>
        <button type="button" data-asset-action="smaller" data-asset-id="${escapeHtml(asset.id)}">-</button>
        <button type="button" data-asset-action="bigger" data-asset-id="${escapeHtml(asset.id)}">+</button>
        <button type="button" data-asset-action="delete" data-asset-id="${escapeHtml(asset.id)}">Excluir</button>
      </div>
    </div>
  `,
    )
    .join("");
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
function moveToWorld(point) {
  if (!me || !myId) return;
  const next = percentFromWorld(point.x, point.z);
  const dx = next.x - me.x;
  const dy = next.y - me.y;
  const facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  me = { ...me, x: next.x, y: next.y, facing };
  const idx = players.findIndex((p) => p.id === myId);
  if (idx >= 0) players[idx] = { ...players[idx], ...me };
  const entity = playerEntities.get(myId);
  if (entity) entity.target.copy(worldFromPercent(me.x, me.y));
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
  const speed = 1.4; // unidades por segundo (caminhada)
  for (const entity of playerEntities.values()) {
    const distance = entity.group.position.distanceTo(entity.target);
    if (distance > 0.025) {
      const before = entity.group.position.clone();
      const step = Math.min(distance, speed * delta);
      const dir = entity.target.clone().sub(entity.group.position).normalize();
      entity.group.position.addScaledVector(dir, step);
      const moved = entity.group.position.clone().sub(before);
      if (moved.lengthSq() > 0.00001) {
        entity.group.rotation.y = Math.atan2(moved.x, moved.z);
      }
      setPlayerAction(entity, "walk");
    } else {
      entity.group.position.copy(entity.target);
      setPlayerAction(entity, "idle");
    }
    if (entity.mixer) entity.mixer.update(delta);
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
    z: Math.max(-6.5, Math.min(6.5, point.z)),
    rotation_y: 0,
    scale: 1,
    created_by: myId,
  });
  if (error) addSystemLine("Falha ao colocar GLB: " + error.message);
}

async function updateAsset(assetId, patch) {
  if (!isAdmin) return;
  const dbPatch = {};
  if (patch.x !== undefined) dbPatch.x = patch.x;
  if (patch.z !== undefined) dbPatch.z = patch.z;
  if (patch.rotationY !== undefined) dbPatch.rotation_y = patch.rotationY;
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
  renderer.render(scene, camera);
  updateNameplates();
}

// ============ Event wiring ============
window.addEventListener("resize", resize);

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input")) return;
  if (!event.key) return;
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
    keyState.add(key);
  }
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
  if (action === "rotate") {
    updateAsset(asset.id, { rotationY: asset.rotationY + Math.PI / 4 });
    return;
  }
  if (action === "smaller") {
    updateAsset(asset.id, { scale: Math.max(0.15, asset.scale - 0.15) });
    return;
  }
  if (action === "bigger") {
    updateAsset(asset.id, { scale: Math.min(4, asset.scale + 0.15) });
    return;
  }
  if (action === "delete") {
    deleteAsset(asset.id).then(() => addSystemLine(`${asset.name} removido.`));
  }
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
