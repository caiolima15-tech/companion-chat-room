import * as THREE from "three";
import { OrbitControls } from "/vendor/OrbitControls.js";
import { GLTFLoader } from "/vendor/GLTFLoader.js";
import { GLTFExporter } from "/vendor/GLTFExporter.js";

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
const placeButton = document.querySelector("#placeButton");
const exportButton = document.querySelector("#exportButton");
const cameraButton = document.querySelector("#cameraButton");
const assetList = document.querySelector("#assetList");
const roleBadge = document.querySelector("#roleBadge");

const MAP_WIDTH = 18;
const MAP_DEPTH = 14;
const clock = new THREE.Clock();
const loader = new GLTFLoader();
const exporter = new GLTFExporter();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorHit = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

let source;
let myId = "";
let me = null;
let players = [];
let selectedAsset = null;
let placementMode = false;
let movingAssetId = "";
let followCamera = true;
let lastMoveSent = 0;
let isAdmin = false;
let currentAssets = [];

const playerEntities = new Map();
const assetObjects = new Map();
const keyState = new Set();
const savedName = localStorage.getItem("barName") || "";
nameInput.value = savedName;

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
connect();
requestAnimationFrame(animate);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function renderPermissions() {
  document.body.classList.toggle("is-admin", isAdmin);
  roleBadge.textContent = isAdmin ? "admin" : "visitante";
  glbInput.disabled = !isAdmin;
  exportButton.disabled = !isAdmin;
  placeButton.disabled = !isAdmin || !selectedAsset;
  if (!isAdmin) {
    placementMode = false;
    movingAssetId = "";
    selectedAsset = null;
    placeButton.classList.remove("is-active");
  }
}

function worldFromPercent(x, y) {
  return new THREE.Vector3((x / 100 - 0.5) * MAP_WIDTH, 0, (y / 100 - 0.5) * MAP_DEPTH);
}

function percentFromWorld(x, z) {
  return {
    x: Math.max(5, Math.min(95, (x / MAP_WIDTH + 0.5) * 100)),
    y: Math.max(8, Math.min(92, (z / MAP_DEPTH + 0.5) * 100))
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

  const neonLight = new THREE.PointLight("#f26868", 3.4, 10);
  neonLight.position.set(-6.7, 3.2, -6.2);
  scene.add(neonLight);

  const barLight = new THREE.PointLight("#29d3bd", 2.4, 13);
  barLight.position.set(5.7, 3.4, 3.6);
  scene.add(barLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_WIDTH, MAP_DEPTH, 18, 14),
    new THREE.MeshStandardMaterial({ color: "#202832", roughness: 0.86, metalness: 0.02 })
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

  makeBox("BarCounter", [10.8, 0.72, 1.25], [-0.8, 0.58, -4.45], "#8a572b", { roughness: 0.5 });
  makeBox("BarTop", [11.2, 0.16, 1.55], [-0.8, 1.02, -4.45], "#c98b47", { roughness: 0.36, metalness: 0.08 });
  makeBox("BackShelf", [8.8, 0.18, 0.28], [1.0, 2.25, -6.83], "#b07a42");
  makeBox("BackShelf2", [8.8, 0.18, 0.28], [1.0, 2.85, -6.83], "#b07a42");

  for (let i = 0; i < 11; i += 1) {
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.11, 0.45 + (i % 3) * 0.08, 12),
      material(["#f4bd4f", "#29d3bd", "#f26868", "#a78bfa"][i % 4], 0.42, 0.04)
    );
    bottle.position.set(-2.8 + i * 0.62, 2.55 + (i % 2) * 0.58, -6.66);
    bottle.castShadow = true;
    stage.add(bottle);
  }

  createNeonSign();
  createTable(-4.8, 0.2);
  createTable(4.6, 0.55);
  createTable(0.5, 4.35);
  createPlant(-7.3, 4.8);
  createPlant(7.2, 4.7);
  createRug();
}

function createNeonSign() {
  const canvas2d = document.createElement("canvas");
  canvas2d.width = 512;
  canvas2d.height = 192;
  const ctx = canvas2d.getContext("2d");
  ctx.clearRect(0, 0, canvas2d.width, canvas2d.height);
  ctx.font = "900 92px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#f26868";
  ctx.shadowBlur = 28;
  ctx.fillStyle = "#fff5f1";
  ctx.fillText("OPEN", 256, 96);

  const texture = new THREE.CanvasTexture(canvas2d);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 1.05),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  );
  sign.name = "NeonOpenSign";
  sign.position.set(-6.7, 2.55, -6.79);
  stage.add(sign);
}

function createTable(x, z) {
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.14, 36), material("#202637", 0.55, 0.12));
  top.position.set(x, 0.72, z);
  top.castShadow = true;
  top.receiveShadow = true;
  stage.add(top);

  const trim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.035, 8, 42), material("#a78bfa", 0.36, 0.2));
  trim.position.set(x, 0.81, z);
  trim.rotation.x = Math.PI / 2;
  trim.castShadow = true;
  stage.add(trim);

  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.72, 16), material("#596273", 0.5, 0.25));
  leg.position.set(x, 0.36, z);
  leg.castShadow = true;
  stage.add(leg);

  for (const angle of [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]) {
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.22, 24), material("#29d3bd", 0.48, 0.08));
    stool.position.set(x + Math.cos(angle) * 1.55, 0.32, z + Math.sin(angle) * 1.55);
    stool.castShadow = true;
    stool.receiveShadow = true;
    stage.add(stool);
  }
}

function createPlant(x, z) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 0.55, 18), material("#9a4b24", 0.72));
  pot.position.set(x, 0.28, z);
  pot.castShadow = true;
  stage.add(pot);

  for (let i = 0; i < 7; i += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), material("#21b36f", 0.76));
    leaf.scale.set(0.55, 0.18, 1.1);
    leaf.position.set(x + Math.cos(i) * 0.24, 0.78 + (i % 3) * 0.1, z + Math.sin(i) * 0.24);
    leaf.rotation.y = i * 0.9;
    leaf.castShadow = true;
    stage.add(leaf);
  }
}

function createRug() {
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(2.25, 64),
    new THREE.MeshStandardMaterial({ color: "#7f3b46", roughness: 0.9 })
  );
  rug.name = "CenterRug";
  rug.scale.z = 0.62;
  rug.rotation.x = -Math.PI / 2;
  rug.rotation.z = -0.18;
  rug.position.set(0.3, 0.018, 1.8);
  rug.receiveShadow = true;
  stage.add(rug);
}

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
  hair.name = "Hair";
  hair.position.set(0, 1.81, -0.02);
  hair.rotation.x = -0.2;
  hair.castShadow = true;
  root.add(hair);

  const eyeGeo = new THREE.SphereGeometry(0.028, 8, 8);
  for (const x of [-0.09, 0.09]) {
    const eye = new THREE.Mesh(eyeGeo, dark);
    eye.name = x < 0 ? "LeftEye" : "RightEye";
    eye.position.set(x, 1.69, 0.245);
    root.add(eye);
  }

  createLimb(root, "LeftArm", [-0.36, 1.34, 0], 0.13, 0.48, shirt, "arm");
  createLimb(root, "RightArm", [0.36, 1.34, 0], 0.13, 0.48, shirt, "arm");
  createLimb(root, "LeftLeg", [-0.16, 0.7, 0], 0.13, 0.58, dark, "leg");
  createLimb(root, "RightLeg", [0.16, 0.7, 0], 0.13, 0.58, dark, "leg");

  for (const x of [-0.16, 0.16]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.38), shoes);
    foot.name = x < 0 ? "LeftFoot" : "RightFoot";
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
  mesh.name = `${name}Mesh`;
  mesh.position.y = -length * 0.5;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  limb.add(mesh);

  if (type === "arm") {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.86, 14, 10), material("#ffd4a3", 0.66));
    hand.name = `${name}Hand`;
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
    new THREE.QuaternionKeyframeTrack("RightArm.quaternion", idleTimes, quatValues(zAxis, [-8, -12, -8]))
  ]);

  const walkTimes = [0, 0.22, 0.44, 0.66, 0.88];
  const walk = new THREE.AnimationClip("Walk", 0.88, [
    new THREE.VectorKeyframeTrack("Torso.position", walkTimes, [0, 1.08, 0, 0, 1.16, 0, 0, 1.08, 0, 0, 1.16, 0, 0, 1.08, 0]),
    new THREE.QuaternionKeyframeTrack("LeftArm.quaternion", walkTimes, quatValues(xAxis, [-26, 22, -26, 22, -26])),
    new THREE.QuaternionKeyframeTrack("RightArm.quaternion", walkTimes, quatValues(xAxis, [26, -22, 26, -22, 26])),
    new THREE.QuaternionKeyframeTrack("LeftLeg.quaternion", walkTimes, quatValues(xAxis, [28, -25, 28, -25, 28])),
    new THREE.QuaternionKeyframeTrack("RightLeg.quaternion", walkTimes, quatValues(xAxis, [-25, 28, -25, 28, -25]))
  ]);

  return { idle, walk };
}

function createPlayerEntity(player) {
  const group = createCharacter(player.color);
  group.position.copy(worldFromPercent(player.x, player.y));
  group.rotation.y = Math.PI;
  scene.add(group);

  const mixer = new THREE.AnimationMixer(group);
  const idle = mixer.clipAction(group.userData.clips.idle);
  const walk = mixer.clipAction(group.userData.clips.walk);
  idle.play();

  const plate = document.createElement("div");
  plate.className = "nameplate";
  nameplatesLayer.appendChild(plate);

  return {
    group,
    mixer,
    actions: { idle, walk },
    currentAction: "idle",
    target: group.position.clone(),
    plate,
    player
  };
}

function setPlayerAction(entity, name) {
  if (entity.currentAction === name) return;
  const previous = entity.actions[entity.currentAction];
  const next = entity.actions[name];
  previous.fadeOut(0.16);
  next.reset().fadeIn(0.16).play();
  entity.currentAction = name;
}

function renderPlayers(nextPlayers) {
  players = nextPlayers;
  me = players.find((player) => player.id === myId) || me;
  onlineCount.textContent = `${players.length} online`;

  const byId = new Map(players.map((player) => [player.id, player]));
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
    entity.group.traverse((child) => {
      if (child.material?.color && child.name.includes("Torso")) {
        child.material.color.set(player.color);
      }
    });
    entity.plate.innerHTML = `
      ${player.speech ? `<div class="speech">${escapeHtml(player.speech)}</div>` : ""}
      <div class="plate-name">${escapeHtml(player.name)}${player.id === myId ? " (você)" : ""}${player.isAdmin ? " • admin" : ""}</div>
    `;
  }
}

function renderAssets(assets = []) {
  currentAssets = assets;
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
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
      if (object.userData.baseScale) object.scale.setScalar(object.userData.baseScale * asset.scale);
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
      }
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
    new THREE.MeshStandardMaterial({ color: "#a78bfa", roughness: 0.6, metalness: 0.1 })
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
  assetList.innerHTML = assets.map((asset) => `
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
  `).join("");
}

async function post(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Ação não permitida");
  return response;
}

function connect() {
  if (location.protocol === "file:") return;
  const name = nameInput.value.trim() || `Visitante ${Math.floor(100 + Math.random() * 900)}`;
  localStorage.setItem("barName", name);
  source?.close();
  source = new EventSource(`/events?name=${encodeURIComponent(name)}`);

  source.addEventListener("welcome", (event) => {
    const data = JSON.parse(event.data);
    myId = data.id;
    isAdmin = Boolean(data.isAdmin);
    renderPermissions();
    chatLog.innerHTML = "";
    data.snapshot.messages.forEach(addMessage);
    renderPlayers(data.snapshot.players);
    renderAssets(data.snapshot.assets || []);
    addSystemLine(isAdmin ? "Você entrou como admin da sala." : "Você entrou como visitante.");
  });

  source.addEventListener("players", (event) => {
    renderPlayers(JSON.parse(event.data));
  });

  source.addEventListener("assets", (event) => {
    renderAssets(JSON.parse(event.data));
  });

  source.addEventListener("message", (event) => {
    addMessage(JSON.parse(event.data));
  });

  source.addEventListener("system", (event) => {
    addSystemLine(JSON.parse(event.data).text);
  });

  source.onerror = () => {
    onlineCount.textContent = "Reconectando";
  };
}

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

function move(dx, dy, facing) {
  if (!me || !myId) return;
  const now = performance.now();
  me = {
    ...me,
    x: Math.max(5, Math.min(95, me.x + dx)),
    y: Math.max(8, Math.min(92, me.y + dy)),
    facing
  };
  renderPlayers(players.map((player) => player.id === myId ? me : player));

  if (now - lastMoveSent > 70) {
    lastMoveSent = now;
    post("/move", { id: myId, x: me.x, y: me.y, facing }).catch(() => {});
  }
}

function moveToWorld(point) {
  if (!me || !myId) return;
  const next = percentFromWorld(point.x, point.z);
  const dx = next.x - me.x;
  const dy = next.y - me.y;
  const facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  me = { ...me, x: next.x, y: next.y, facing };
  renderPlayers(players.map((player) => player.id === myId ? me : player));
  post("/move", { id: myId, x: me.x, y: me.y, facing }).catch(() => {});
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
    move(dx, dy, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  }
}

function updatePlayerAnimation(delta) {
  for (const entity of playerEntities.values()) {
    const distance = entity.group.position.distanceTo(entity.target);
    if (distance > 0.025) {
      const before = entity.group.position.clone();
      entity.group.position.lerp(entity.target, Math.min(1, delta * 8.5));
      const after = entity.group.position;
      const direction = after.clone().sub(before);
      if (direction.lengthSq() > 0.00001) {
        entity.group.rotation.y = Math.atan2(direction.x, direction.z);
      }
      setPlayerAction(entity, "walk");
    } else {
      entity.group.position.copy(entity.target);
      setPlayerAction(entity, "idle");
    }
    entity.mixer.update(delta);
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

async function uploadGlb(file) {
  if (!isAdmin) throw new Error("Apenas admin");
  const bytes = await file.arrayBuffer();
  const response = await fetch(`/assets/upload?name=${encodeURIComponent(file.name)}&id=${encodeURIComponent(myId)}`, {
    method: "POST",
    headers: { "Content-Type": "model/gltf-binary" },
    body: bytes
  });
  if (!response.ok) throw new Error("Falha ao importar GLB");
  selectedAsset = await response.json();
  placeButton.disabled = !isAdmin;
  placementMode = true;
  movingAssetId = "";
  placeButton.classList.add("is-active");
  updateAssetList([]);
}

async function placeSelectedAsset(point) {
  if (!isAdmin || !selectedAsset) return;
  await post("/assets/place", {
    id: myId,
    url: selectedAsset.url,
    name: selectedAsset.name,
    x: Math.max(-8.5, Math.min(8.5, point.x)),
    z: Math.max(-6.5, Math.min(6.5, point.z)),
    rotationY: 0,
    scale: 1
  });
}

async function updateAsset(assetId, patch) {
  if (!isAdmin) return;
  await post("/assets/update", { id: myId, assetId, ...patch });
}

async function deleteAsset(assetId) {
  if (!isAdmin) return;
  await post("/assets/delete", { id: myId, assetId });
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
      const blob = result instanceof ArrayBuffer
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
    { binary: true, animations }
  );
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  applyHeldMovement();
  updatePlayerAnimation(delta);
  if (followCamera && myId) {
    const entity = playerEntities.get(myId);
    if (entity) controls.target.lerp(new THREE.Vector3(entity.group.position.x, 0.85, entity.group.position.z), delta * 2.2);
  }
  controls.update();
  renderer.render(scene, camera);
  updateNameplates();
}

window.addEventListener("resize", resize);

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input")) return;
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
    keyState.add(key);
  }
});

document.addEventListener("keyup", (event) => {
  keyState.delete(event.key.toLowerCase());
});

document.querySelectorAll("[data-step]").forEach((button) => {
  button.addEventListener("click", () => {
    const steps = {
      up: [0, -4, "up"],
      down: [0, 4, "down"],
      left: [-4, 0, "left"],
      right: [4, 0, "right"]
    };
    move(...steps[button.dataset.step]);
  });
});

renderer.domElement.addEventListener("click", (event) => {
  const point = pointerToWorld(event);
  if (!point) return;
  if (isAdmin && movingAssetId) {
    updateAsset(movingAssetId, {
      x: Math.max(-8.5, Math.min(8.5, point.x)),
      z: Math.max(-6.5, Math.min(6.5, point.z))
    })
      .then(() => {
        movingAssetId = "";
        updateAssetList(currentAssets);
      })
      .catch(() => addSystemLine("Não consegui mover o GLB."));
    return;
  }
  if (isAdmin && placementMode && selectedAsset) {
    placeSelectedAsset(point).catch(() => addSystemLine("Não consegui colocar o GLB no mapa."));
    return;
  }
  moveToWorld(point);
});

glbInput.addEventListener("change", () => {
  if (!isAdmin) return;
  const file = glbInput.files?.[0];
  if (!file) return;
  uploadGlb(file)
    .then(() => addSystemLine(`${file.name} pronto para colocar no mapa.`))
    .catch(() => addSystemLine("Escolha um arquivo .glb válido."));
  glbInput.value = "";
});

placeButton.addEventListener("click", () => {
  if (!isAdmin || !selectedAsset) return;
  placementMode = !placementMode;
  if (placementMode) movingAssetId = "";
  placeButton.classList.toggle("is-active", placementMode);
  updateAssetList(currentAssets);
});

exportButton.addEventListener("click", exportCharacter);

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
    addSystemLine(movingAssetId ? `Clique no mapa para mover ${asset.name}.` : "Movimento de GLB cancelado.");
    return;
  }

  if (action === "rotate") {
    updateAsset(asset.id, { rotationY: asset.rotationY + Math.PI / 4 }).catch(() => addSystemLine("Não consegui girar o GLB."));
    return;
  }

  if (action === "smaller") {
    updateAsset(asset.id, { scale: Math.max(0.15, asset.scale - 0.15) }).catch(() => addSystemLine("Não consegui diminuir o GLB."));
    return;
  }

  if (action === "bigger") {
    updateAsset(asset.id, { scale: Math.min(4, asset.scale + 0.15) }).catch(() => addSystemLine("Não consegui aumentar o GLB."));
    return;
  }

  if (action === "delete") {
    deleteAsset(asset.id)
      .then(() => addSystemLine(`${asset.name} foi excluído do mapa.`))
      .catch(() => addSystemLine("Não consegui excluir o GLB."));
  }
});

cameraButton.addEventListener("click", () => {
  followCamera = !followCamera;
  cameraButton.textContent = followCamera ? "Câmera" : "Livre";
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !myId) return;
  chatInput.value = "";
  post("/chat", { id: myId, text }).catch(() => {});
});

joinButton.addEventListener("click", connect);
nameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") connect();
});
