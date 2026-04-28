import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";

let scene;
let camera;
let renderer;
let bunny;
let controller;

let gameState = "waiting";
let timeLeft = 60;
let timerInterval = null;
let targetPosition = null;
let currentZone = null;

const floatingObjects = [];
const stars = [];

const zones = {
  blackboard: {
    label: "Blackboard",
    position: [0.75, 1.2, -2.55],
    hint1: "Hint: It is near the front wall.",
    hint2: "Hint: Check around the green board."
  },
  desk: {
    label: "Desk",
    position: [2.0, 0.72, -1.15],
    hint1: "Hint: It is near the student area.",
    hint2: "Hint: Look near the wooden desk."
  },
  door: {
    label: "Door",
    position: [-2.55, 0.9, -1.8],
    hint1: "Hint: It is close to the entrance.",
    hint2: "Hint: Search beside the blue door."
  }
};

init();

window.hideAt = function (zoneName) {
  if (gameState === "playing") return;

  currentZone = zones[zoneName];
  targetPosition = new THREE.Vector3(...currentZone.position);

  gameState = "playing";
  timeLeft = 60;

  setBunnyColor(0xffffff);

  document.getElementById("status").innerText =
    `Bunny hidden at ${currentZone.label}. Player B, start searching!`;
  document.getElementById("timer").innerText = "Time: 60";
  document.getElementById("hint").innerText = "Hint: None";

  startTimer();
};

window.restartGame = function () {
  gameState = "waiting";
  timeLeft = 60;
  targetPosition = null;
  currentZone = null;

  if (timerInterval) clearInterval(timerInterval);

  bunny.position.set(0.8, 0.55, -1.35);
  bunny.rotation.set(0, 0, 0);
  setBunnyColor(0xffffff);

  document.getElementById("status").innerText = "Choose a hiding location.";
  document.getElementById("timer").innerText = "Time: 60";
  document.getElementById("hint").innerText = "Hint: None";
};

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    if (gameState !== "playing") return;

    timeLeft--;
    document.getElementById("timer").innerText = `Time: ${timeLeft}`;

    if (timeLeft === 40) {
      document.getElementById("hint").innerText = currentZone.hint1;
    }

    if (timeLeft === 20) {
      document.getElementById("hint").innerText = currentZone.hint2;
    }

    if (timeLeft <= 0) {
      gameState = "finished";
      clearInterval(timerInterval);

      document.getElementById("status").innerText = "Time is up! Player B loses.";
      document.getElementById("hint").innerText =
        `Answer: The bunny was at ${currentZone.label}.`;

      setBunnyColor(0x60a5fa);
    }
  }, 1000);
}

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8d9b1);
  scene.fog = new THREE.Fog(0xf8d9b1, 7, 15);

  camera = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0.8, 1.6, 5.15);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  addLights();
  addClassroom();
  addBunny();
  addController();

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("click", onMouseClick);

  renderer.setAnimationLoop(render);
}

function addLights() {
  const ambient = new THREE.HemisphereLight(0xffffff, 0x8b7355, 1.8);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(3, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  scene.add(sun);

  const warmLight = new THREE.PointLight(0xffd7a0, 1.6, 9);
  warmLight.position.set(0.8, 3.0, 1.4);
  scene.add(warmLight);
}

function addClassroom() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(9.5, 7.5),
    new THREE.MeshStandardMaterial({ color: 0xc98945, roughness: 0.62 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  addFloorLines();

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(9.5, 3.5, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xf4cda8, roughness: 0.75 })
  );
  wall.position.set(0.7, 1.75, -3);
  scene.add(wall);

  const rightWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 3.5, 7.5),
    new THREE.MeshStandardMaterial({ color: 0xb39a83, roughness: 0.75 })
  );
  rightWall.position.set(5.4, 1.75, 0.6);
  scene.add(rightWall);

  addWindow(5.35, 1.9, -1.35);
  addClock(3.75, 2.55, -2.85);
  addBlackboard();
  addDoor();
  addTables();
  addBooksAndProps();
  addBackpack(2.9, 0.08, -0.75);
  addPlant(4.2, 0.0, -0.85, 1.15);
  addSmallPlant(-1.95, 0.9, -2.05);
  addFlags();
  addMagicCircle();
}

function addFloorLines() {
  for (let i = -4; i <= 4; i++) {
    addBox(i * 0.75, 0.012, 0.2, 0.025, 0.01, 7.2, 0xb5793c);
  }

  for (let j = -3; j <= 3; j++) {
    addBox(0.7, 0.014, j * 0.8, 8.5, 0.01, 0.025, 0xb5793c);
  }
}

function addBlackboard() {
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(3.9, 1.45, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.55 })
  );
  frame.position.set(0.75, 1.86, -2.9);
  frame.castShadow = true;
  scene.add(frame);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(3.55, 1.12, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x0b4b2a, roughness: 0.9 })
  );
  board.position.set(0.75, 1.86, -2.83);
  scene.add(board);

  addBox(0.75, 1.98, -2.76, 1.25, 0.035, 0.02, 0xf3f4f6);
  addBox(0.75, 1.78, -2.76, 1.65, 0.035, 0.02, 0xf3f4f6);
  addBox(-0.65, 2.22, -2.76, 0.28, 0.035, 0.02, 0xf3f4f6);
  addBox(2.05, 2.22, -2.76, 0.28, 0.035, 0.02, 0xf3f4f6);

  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.06, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xd6a15f })
  );
  tray.position.set(0.75, 1.21, -2.74);
  scene.add(tray);
}

function addWindow(x, y, z) {
  const group = new THREE.Group();

  const outerFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, 1.55, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45
    })
  );
  group.add(outerFrame);

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.22, 1.28, 0.06),
    new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.72,
      roughness: 0.18,
      metalness: 0.05
    })
  );
  glass.position.set(0, 0, 0.05);
  group.add(glass);

  const verticalBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 1.28, 0.075),
    new THREE.MeshStandardMaterial({ color: 0xe0f2fe })
  );
  verticalBar.position.set(0, 0, 0.1);
  group.add(verticalBar);

  const horizontalBar = new THREE.Mesh(
    new THREE.BoxGeometry(1.22, 0.055, 0.075),
    new THREE.MeshStandardMaterial({ color: 0xe0f2fe })
  );
  horizontalBar.position.set(0, 0, 0.1);
  group.add(horizontalBar);

  const shine1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.0, 0.08),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35
    })
  );
  shine1.position.set(-0.35, 0.05, 0.13);
  shine1.rotation.z = -0.35;
  group.add(shine1);

  const shine2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.65, 0.08),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.22
    })
  );
  shine2.position.set(0.3, -0.05, 0.13);
  shine2.rotation.z = -0.35;
  group.add(shine2);

  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.65, 16),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
  );
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, 0.88, 0.08);
  group.add(rod);

  const curtainLeft = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 1.35, 0.05),
    new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.8
    })
  );
  curtainLeft.position.set(-0.78, -0.05, 0.08);
  group.add(curtainLeft);

  const curtainRight = curtainLeft.clone();
  curtainRight.position.x = 0.78;
  group.add(curtainRight);

  for (let i = 0; i < 4; i++) {
    const foldL = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 1.28, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xea580c })
    );
    foldL.position.set(-0.86 + i * 0.05, -0.05, 0.12);
    group.add(foldL);

    const foldR = foldL.clone();
    foldR.position.x = 0.7 + i * 0.05;
    group.add(foldR);
  }

  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 0.09, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xfef3c7 })
  );
  sill.position.set(0, -0.84, 0.08);
  group.add(sill);

  group.rotation.y = -Math.PI / 2;
  group.position.set(x, y, z);
  scene.add(group);
}

function addDoor() {
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 2.1, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.55 })
  );
  door.position.set(-2.95, 1.05, -2.15);
  door.castShadow = true;
  scene.add(door);

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.9, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x1d4ed8 })
  );
  panel.position.set(-2.95, 1.25, -2.08);
  scene.add(panel);

  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 18, 18),
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.2
    })
  );
  knob.position.set(-2.63, 0.96, -2.04);
  scene.add(knob);
}

function addTables() {
  addTable(-2.0, -1.95, 1.25, 0.62);
  addTable(2.0, -1.3, 1.45, 0.72);
}

function addTable(x, z, w, d) {
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.16, d),
    new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.55 })
  );
  top.position.set(x, 0.82, z);
  top.castShadow = true;
  scene.add(top);

  const legColor = 0x5b3416;
  const lx = w / 2 - 0.12;
  const lz = d / 2 - 0.12;

  addBox(x - lx, 0.4, z - lz, 0.08, 0.8, 0.08, legColor);
  addBox(x + lx, 0.4, z - lz, 0.08, 0.8, 0.08, legColor);
  addBox(x - lx, 0.4, z + lz, 0.08, 0.8, 0.08, legColor);
  addBox(x + lx, 0.4, z + lz, 0.08, 0.8, 0.08, legColor);
}

function addBooksAndProps() {
  addBox(-2.08, 0.95, -1.95, 0.52, 0.08, 0.28, 0xef4444);
  addBox(-2.0, 1.04, -1.95, 0.45, 0.08, 0.25, 0xfacc15);

  addBox(1.75, 0.96, -1.3, 0.55, 0.07, 0.32, 0xfef3c7);
  addBox(2.1, 1.04, -1.32, 0.62, 0.08, 0.34, 0x2563eb);

  const pencilCup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 0.2, 18),
    new THREE.MeshStandardMaterial({ color: 0xef4444 })
  );
  pencilCup.position.set(2.55, 0.96, -1.15);
  scene.add(pencilCup);

  for (let i = 0; i < 3; i++) {
    const pencil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: [0xfacc15, 0x22c55e, 0x3b82f6][i] })
    );
    pencil.position.set(2.5 + i * 0.05, 1.15, -1.15);
    pencil.rotation.z = -0.25 + i * 0.2;
    scene.add(pencil);
  }
}

function addClock(x, y, z) {
  const clock = new THREE.Group();

  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.04, 40),
    new THREE.MeshStandardMaterial({ color: 0xffedd5 })
  );
  face.rotation.x = Math.PI / 2;

  const hand1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, 0.18, 0.015),
    new THREE.MeshStandardMaterial({ color: 0x3f1f0f })
  );
  hand1.position.set(0, 0.04, 0.04);
  hand1.rotation.z = -0.5;

  const hand2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.025, 0.24, 0.015),
    new THREE.MeshStandardMaterial({ color: 0x3f1f0f })
  );
  hand2.position.set(0.04, 0.04, 0.04);
  hand2.rotation.z = 0.9;

  clock.add(face, hand1, hand2);
  clock.position.set(x, y, z);
  scene.add(clock);
}

function addBackpack(x, y, z) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.52, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.55 })
  );
  body.position.set(0, 0.26, 0);

  const top = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.5 })
  );
  top.scale.set(1, 0.45, 0.55);
  top.position.set(0, 0.5, 0);

  const pocket = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.18, 0.035),
    new THREE.MeshStandardMaterial({ color: 0x1e40af })
  );
  pocket.position.set(0, 0.26, 0.14);

  const star = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.06),
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xfacc15,
      emissiveIntensity: 0.45
    })
  );
  star.position.set(0, 0.34, 0.17);

  group.add(body, top, pocket, star);
  group.position.set(x, y, z);
  group.scale.set(0.82, 0.82, 0.82);
  scene.add(group);
}

function addPlant(x, y, z, scale = 1) {
  const group = new THREE.Group();

  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.32, 0.42, 28),
    new THREE.MeshStandardMaterial({ color: 0xf5d0a9, roughness: 0.72 })
  );
  pot.position.set(0, 0.21, 0);
  group.add(pot);

  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.22, 0.04, 28),
    new THREE.MeshStandardMaterial({ color: 0x3f1f0f })
  );
  soil.position.set(0, 0.44, 0);
  group.add(soil);

  for (let i = 0; i < 14; i++) {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 18, 12),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0x16a34a : 0x22c55e })
    );

    const angle = (i / 14) * Math.PI * 2;
    const radius = i % 2 === 0 ? 0.17 : 0.3;

    leaf.scale.set(0.5, 0.22, 1.35);
    leaf.position.set(
      Math.cos(angle) * radius,
      0.55 + (i % 3) * 0.06,
      Math.sin(angle) * radius
    );
    leaf.rotation.y = angle;
    leaf.rotation.z = 0.48;

    group.add(leaf);
  }

  group.position.set(x, y, z);
  group.scale.set(scale, scale, scale);
  scene.add(group);
}

function addSmallPlant(x, y, z) {
  const group = new THREE.Group();

  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.15, 0.2, 18),
    new THREE.MeshStandardMaterial({ color: 0xc2410c })
  );
  group.add(pot);

  for (let i = 0; i < 8; i++) {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x16a34a })
    );
    const angle = (i / 8) * Math.PI * 2;
    leaf.scale.set(0.6, 0.25, 1);
    leaf.position.set(Math.cos(angle) * 0.11, 0.18, Math.sin(angle) * 0.11);
    leaf.rotation.y = angle;
    group.add(leaf);
  }

  group.position.set(x, y, z);
  scene.add(group);
}

function addFlags() {
  const colors = [0xef4444, 0xf97316, 0xeab308, 0x22c55e, 0x3b82f6, 0xa855f7];

  for (let i = 0; i < colors.length; i++) {
    const flag = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.38, 3),
      new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.6 })
    );

    flag.position.set(-1.85 + i * 0.9, 2.88 + Math.sin(i) * 0.05, -2.78);
    flag.rotation.z = Math.PI;
    flag.castShadow = true;

    floatingObjects.push(flag);
    scene.add(flag);
  }
}

function addMagicCircle() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.52, 72),
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0.8, 0.025, -1.35);
  scene.add(ring);
  floatingObjects.push(ring);

  addStar(0.25, 0.45, -1.35);
  addStar(1.35, 0.45, -1.35);
  addStar(0.8, 0.9, -1.35);
}

function addBunny() {
  bunny = new THREE.Group();

  const white = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0
  });

  const pink = new THREE.MeshStandardMaterial({
    color: 0xffb6c1,
    roughness: 0.7
  });

  const eye = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    roughness: 0.25
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 40, 40), white);
  body.scale.set(1.0, 1.16, 0.95);
  body.position.set(0, 0.22, 0);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 40, 40), white);
  head.scale.set(1.1, 1.0, 1.0);
  head.position.set(0, 0.62, 0.03);

  const earL = createEar(-0.12, white, pink);
  const earR = createEar(0.12, white, pink);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 18, 18), eye);
  eyeL.position.set(-0.095, 0.67, 0.27);

  const eyeR = eyeL.clone();
  eyeR.position.x = 0.095;

  const shineL = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  shineL.position.set(-0.08, 0.685, 0.3);

  const shineR = shineL.clone();
  shineR.position.x = 0.11;

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 16), pink);
  nose.position.set(0, 0.59, 0.29);

  const blushL = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0xff8aa0,
      transparent: true,
      opacity: 0.75
    })
  );
  blushL.scale.set(1.2, 0.55, 0.2);
  blushL.position.set(-0.16, 0.56, 0.265);

  const blushR = blushL.clone();
  blushR.position.x = 0.16;

  const footL = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 18), white);
  footL.scale.set(1.25, 0.55, 0.9);
  footL.position.set(-0.12, -0.03, 0.15);

  const footR = footL.clone();
  footR.position.x = 0.12;

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 18), white);
  tail.position.set(0, 0.23, -0.25);

  bunny.add(
    body,
    head,
    earL,
    earR,
    eyeL,
    eyeR,
    shineL,
    shineR,
    nose,
    blushL,
    blushR,
    footL,
    footR,
    tail
  );

  bunny.position.set(0.8, 0.55, -1.35);
  bunny.scale.set(1.05, 1.05, 1.05);

  scene.add(bunny);
}

function createEar(x, white, pink) {
  const ear = new THREE.Group();

  const outer = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.38, 10, 18), white);
  outer.position.set(0, 0.16, 0);

  const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.29, 8, 14), pink);
  inner.position.set(0, 0.16, 0.02);

  ear.add(outer, inner);
  ear.position.set(x, 0.94, 0.02);
  ear.rotation.z = x > 0 ? -0.23 : 0.23;

  return ear;
}

function setBunnyColor(color) {
  bunny.children.forEach((part) => {
    if (!part.material || !part.material.color) return;

    const hex = part.material.color.getHex();

    if (hex === 0xffffff) {
      part.material.color.set(color);
    }
  });
}

function addController() {
  controller = renderer.xr.getController(0);
  controller.addEventListener("selectstart", onSelect);
  scene.add(controller);
}

function handleFound() {
  if (gameState !== "playing") return;

  gameState = "finished";
  clearInterval(timerInterval);

  document.getElementById("status").innerText = "Found it! Player B wins!";
  document.getElementById("hint").innerText =
    `The bunny was hidden at ${currentZone.label}.`;

  setBunnyColor(0x86efac);
}

function onMouseClick(event) {
  if (gameState !== "playing") return;

  const mouse = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObject(bunny, true);
  if (intersects.length > 0) handleFound();
}

function onSelect() {
  if (gameState !== "playing") return;

  const raycaster = new THREE.Raycaster();
  const matrix = new THREE.Matrix4();

  matrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(matrix);

  const intersects = raycaster.intersectObject(bunny, true);
  if (intersects.length > 0) handleFound();
}

function addBox(x, y, z, w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.65 })
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addStar(x, y, z) {
  const star = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.085),
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xfacc15,
      emissiveIntensity: 0.8
    })
  );

  star.position.set(x, y, z);
  stars.push(star);
  scene.add(star);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function render() {
  const t = Date.now() * 0.001;

  if (targetPosition && bunny) {
    bunny.position.lerp(targetPosition, 0.05);

    if (bunny.position.distanceTo(targetPosition) < 0.01) {
      bunny.position.copy(targetPosition);
      targetPosition = null;
    }
  }

  bunny.rotation.y += 0.006;
  bunny.position.y += Math.sin(t * 3) * 0.001;

  stars.forEach((star, index) => {
    star.rotation.y += 0.03;
    star.rotation.x += 0.02;
    star.position.y += Math.sin(t * 3 + index) * 0.0015;
  });

  floatingObjects.forEach((obj, index) => {
    obj.rotation.y += Math.sin(t + index) * 0.001;
  });

  renderer.render(scene, camera);
}