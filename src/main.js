import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";

let scene, camera, renderer, controller;
let bunny, hudPanel, marker;

let hitTestSource = null;
let hitTestSourceRequested = false;
let latestHitPosition = null;

let mode = "hider";
let bunnyPlaced = false;
let bunnyHidden = false;
let gameFinished = false;

let triggerHolding = false;
let triggerStartTime = 0;
let hideConfirmed = false;

let seekerTimeLeft = 60;
let lastTimerUpdate = 0;

const foundDistance = 0.45;
const fallbackDistance = 1.5;

init();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    30
  );

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;

  document.body.appendChild(renderer.domElement);

  document.body.appendChild(
    ARButton.createButton(renderer, {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["local-floor", "dom-overlay"],
      domOverlay: { root: document.body }
    })
  );

  addLights();
  addBunny();
  addMarker();
  addController();
  addWorldHUD();

  setHUD(
    "PLAYER A: HIDE",
    "Point with controller.\nTrigger = place bunny at ray target.\nHold trigger 2s = hide."
  );

  window.addEventListener("resize", onWindowResize);
  renderer.setAnimationLoop(render);
}

function addLights() {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.8));

  const light = new THREE.DirectionalLight(0xffffff, 1.3);
  light.position.set(2, 4, 2);
  scene.add(light);
}

function addController() {
  controller = renderer.xr.getController(0);

  controller.addEventListener("selectstart", () => {
    if (gameFinished) return;

    triggerHolding = true;
    triggerStartTime = performance.now();
    hideConfirmed = false;

    if (mode === "hider") {
      placeBunnyAtControllerTarget();
    }

    if (mode === "seeker") {
      checkBunnyByRay();
    }
  });

  controller.addEventListener("selectend", () => {
    triggerHolding = false;
  });

  scene.add(controller);

  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1)
  ]);

  const line = new THREE.Line(
    lineGeometry,
    new THREE.LineBasicMaterial({ color: 0x00ff88 })
  );

  line.scale.z = 3;
  controller.add(line);
}

function getControllerRay() {
  const origin = new THREE.Vector3();
  origin.setFromMatrixPosition(controller.matrixWorld);

  const matrix = new THREE.Matrix4();
  matrix.identity().extractRotation(controller.matrixWorld);

  const direction = new THREE.Vector3(0, 0, -1);
  direction.applyMatrix4(matrix).normalize();

  return { origin, direction };
}

function getControllerTargetPoint() {
  if (latestHitPosition) {
    return latestHitPosition.clone();
  }

  const { origin, direction } = getControllerRay();
  return origin.clone().add(direction.multiplyScalar(fallbackDistance));
}

function placeBunnyAtControllerTarget() {
  const targetPoint = getControllerTargetPoint();

  bunny.position.copy(targetPoint);
  bunny.visible = true;

  bunnyPlaced = true;
  bunnyHidden = false;
  gameFinished = false;

  setBunnyColor(0xffffff);

  setHUD(
    "BUNNY PLACED",
    "Bunny placed at controller ray target.\nMove controller and trigger again to reposition.\nHold trigger 2s to hide."
  );
}

function confirmHide() {
  if (!bunnyPlaced || bunnyHidden) return;

  bunnyHidden = true;
  bunny.visible = false;

  mode = "seeker";
  seekerTimeLeft = 60;
  lastTimerUpdate = performance.now();

  setHUD(
    "BUNNY HIDDEN!",
    "Player B starts now.\nTime: 60s\nFollow distance and direction."
  );
}

function updateSeekerGame() {
  if (mode !== "seeker" || !bunnyPlaced || gameFinished) return;

  const now = performance.now();

  if (now - lastTimerUpdate >= 1000) {
    seekerTimeLeft--;
    lastTimerUpdate = now;
  }

  if (seekerTimeLeft <= 0) {
    playerBLoses();
    return;
  }

  const cameraPos = new THREE.Vector3();
  camera.getWorldPosition(cameraPos);

  const bunnyPos = new THREE.Vector3();
  bunny.getWorldPosition(bunnyPos);

  const distance = cameraPos.distanceTo(bunnyPos);
  const direction = getDirectionHint(cameraPos, bunnyPos);

  let warning = "";
  if (seekerTimeLeft <= 10) {
    warning = "\nHurry up! Time is almost over!";
  } else if (seekerTimeLeft <= 20) {
    warning = "\nTime is running out!";
  }

  setHUD(
    "PLAYER B: SEARCH",
    `Time: ${seekerTimeLeft}s\nDistance: ${distance.toFixed(2)} m\nDirection: ${direction}${warning}`
  );

  if (distance <= foundDistance) {
    playerBWins();
  }
}

function getDirectionHint(cameraPos, targetPos) {
  const toTarget = targetPos.clone().sub(cameraPos);
  toTarget.y = 0;
  toTarget.normalize();

  const cameraDir = new THREE.Vector3();
  camera.getWorldDirection(cameraDir);
  cameraDir.y = 0;
  cameraDir.normalize();

  const right = new THREE.Vector3();
  right.crossVectors(cameraDir, new THREE.Vector3(0, 1, 0)).normalize();

  const forwardAmount = toTarget.dot(cameraDir);
  const rightAmount = toTarget.dot(right);

  if (forwardAmount > 0.65) return "In front of you";
  if (forwardAmount < -0.65) return "Behind you";
  if (rightAmount > 0.25) return "On your right";
  if (rightAmount < -0.25) return "On your left";

  return "Very close";
}

function checkBunnyByRay() {
  if (!bunnyPlaced || !bunnyHidden || gameFinished) return;

  const { origin, direction } = getControllerRay();

  const raycaster = new THREE.Raycaster();
  raycaster.ray.origin.copy(origin);
  raycaster.ray.direction.copy(direction);

  bunny.visible = true;
  const hits = raycaster.intersectObject(bunny, true);
  bunny.visible = false;

  if (hits.length > 0) {
    playerBWins();
  }
}

function playerBWins() {
  gameFinished = true;
  mode = "finished";
  bunnyHidden = false;
  bunny.visible = true;

  setBunnyColor(0x86efac);

  setHUD(
    "BUNNY FOUND!",
    "Player B wins.\nThe bunny is now visible."
  );
}

function playerBLoses() {
  gameFinished = true;
  mode = "finished";
  bunnyHidden = false;
  bunny.visible = true;

  setBunnyColor(0x60a5fa);

  setHUD(
    "TIME IS UP!",
    "Player B loses.\nThe bunny is revealed."
  );
}

function addMarker() {
  marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );

  marker.visible = false;
  scene.add(marker);
}

function updateMarker() {
  if (mode !== "hider" || gameFinished || bunnyHidden) {
    marker.visible = false;
    return;
  }

  const target = getControllerTargetPoint();

  marker.position.copy(target);
  marker.visible = true;
}

function updateHitTest(frame) {
  const session = renderer.xr.getSession();
  if (!session) return;

  if (!hitTestSourceRequested) {
    session.requestReferenceSpace("viewer").then((referenceSpace) => {
      session.requestHitTestSource({ space: referenceSpace }).then((source) => {
        hitTestSource = source;
      });
    });

    session.addEventListener("end", () => {
      hitTestSourceRequested = false;
      hitTestSource = null;
      latestHitPosition = null;
    });

    hitTestSourceRequested = true;
  }

  if (!hitTestSource) return;

  const referenceSpace = renderer.xr.getReferenceSpace();
  const hits = frame.getHitTestResults(hitTestSource);

  if (hits.length > 0) {
    const hit = hits[0];
    const pose = hit.getPose(referenceSpace);

    const matrix = new THREE.Matrix4();
    matrix.fromArray(pose.transform.matrix);

    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    matrix.decompose(position, quaternion, scale);
    latestHitPosition = position;
  } else {
    latestHitPosition = null;
  }
}

function addBunny() {
  bunny = new THREE.Group();

  const white = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85
  });

  const pink = new THREE.MeshStandardMaterial({
    color: 0xff9eb5,
    roughness: 0.7
  });

  const black = new THREE.MeshStandardMaterial({
    color: 0x111111
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 32, 32), white);
  body.scale.set(1, 1.15, 0.95);
  body.position.y = 0.09;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 32, 32), white);
  head.position.y = 0.21;

  const earL = createEar(-0.035, white, pink);
  const earR = createEar(0.035, white, pink);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.01, 16, 16), black);
  eyeL.position.set(-0.028, 0.23, 0.072);

  const eyeR = eyeL.clone();
  eyeR.position.x = 0.028;

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 16), pink);
  nose.position.set(0, 0.2, 0.08);

  const blushL = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 16), pink);
  blushL.scale.set(1.2, 0.65, 0.25);
  blushL.position.set(-0.048, 0.195, 0.07);

  const blushR = blushL.clone();
  blushR.position.x = 0.048;

  const footL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 16), white);
  footL.scale.set(1.25, 0.55, 0.9);
  footL.position.set(-0.038, 0.004, 0.04);

  const footR = footL.clone();
  footR.position.x = 0.038;

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 16), white);
  tail.position.set(0, 0.09, -0.08);

  bunny.add(
    body,
    head,
    earL,
    earR,
    eyeL,
    eyeR,
    nose,
    blushL,
    blushR,
    footL,
    footR,
    tail
  );

  bunny.scale.set(0.75, 0.75, 0.75);
  bunny.visible = false;

  scene.add(bunny);
}

function createEar(x, white, pink) {
  const group = new THREE.Group();

  const outer = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.015, 0.11, 8, 16),
    white
  );
  outer.position.y = 0.055;

  const inner = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.007, 0.08, 8, 16),
    pink
  );
  inner.position.set(0, 0.055, 0.005);

  group.add(outer, inner);
  group.position.set(x, 0.31, 0);
  group.rotation.z = x > 0 ? -0.25 : 0.25;

  return group;
}

function setBunnyColor(color) {
  bunny.children.forEach((part) => {
    if (!part.material || !part.material.color) return;

    const current = part.material.color.getHex();

    if (current === 0x111111 || current === 0xff9eb5) return;

    part.material.color.set(color);
  });
}

function addWorldHUD() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;

  const texture = new THREE.CanvasTexture(canvas);

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true
  });

  const geometry = new THREE.PlaneGeometry(1.35, 0.68);
  hudPanel = new THREE.Mesh(geometry, material);

  hudPanel.userData.canvas = canvas;
  hudPanel.userData.texture = texture;

  scene.add(hudPanel);
}

function setHUD(title, body) {
  if (!hudPanel) return;

  const canvas = hudPanel.userData.canvas;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 48);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 8;
  roundRect(ctx, 6, 6, canvas.width - 12, canvas.height - 12, 44);
  ctx.stroke();

  ctx.fillStyle = "#fde047";
  ctx.font = "bold 58px Arial";
  ctx.fillText(title, 48, 95);

  ctx.fillStyle = "#ffffff";
  ctx.font = "38px Arial";

  const lines = body.split("\n");
  lines.forEach((line, index) => {
    ctx.fillText(line, 48, 170 + index * 52);
  });

  hudPanel.userData.texture.needsUpdate = true;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function updateHUDPosition() {
  if (!hudPanel) return;

  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);

  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  const position = camPos.clone().add(camDir.multiplyScalar(1.25));
  position.y += 0.05;

  hudPanel.position.copy(position);
  hudPanel.lookAt(camPos);
}

function render(timestamp, frame) {
  if (frame) {
    updateHitTest(frame);
  }

  updateMarker();

  if (triggerHolding && mode === "hider" && bunnyPlaced && !bunnyHidden) {
    const held = (performance.now() - triggerStartTime) / 1000;

    if (held >= 2 && !hideConfirmed) {
      hideConfirmed = true;
      triggerHolding = false;
      confirmHide();
    } else {
      setHUD(
        "HOLD TO HIDE",
        `${held.toFixed(1)} / 2.0 seconds\nKeep holding until it hides.`
      );
    }
  }

  updateHUDPosition();
  updateSeekerGame();

  if (bunny && bunny.visible) {
    bunny.rotation.y += 0.01;
  }

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}