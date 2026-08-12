import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";

let scene, camera, renderer, controller;
let bunny, marker, hudPanel, keypadGroup;
let controllerInput = null;

// Game flow:
// calibration -> ready -> searching -> keypad -> finished
let mode = "calibration";
let gameFinished = false;

// Three real-space target points are calibrated before gameplay.
const targetSlots = [];
const REQUIRED_TARGETS = 3;
let selectedTargetIndex = -1;

// Manual depth is only used during admin calibration.
let placementDistance = 1.5;
const minDistance = 0.35;
const maxDistance = 6;

let timeLeft = 60;
let lastTimerUpdate = 0;
let enteredCode = "";

const CORRECT_CODE = "386";
const revealDistance = 0.75;

const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

init();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    30
  );

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  document.body.appendChild(
    ARButton.createButton(renderer, {
      requiredFeatures: ["local-floor"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.body }
    })
  );

  addLights();
  addController();
  addMarker();
  addBunny();
  addHUD();
  addKeypad();

  setHUD(
    "ADMIN CALIBRATION 1/3",
    "Before the game: save 3 possible desk locations.\nAim green marker at a different real desk area.\nThumbstick up/down = adjust depth.\nTrigger = save this location."
  );

  window.addEventListener("resize", onWindowResize);
  renderer.setAnimationLoop(render);
}

function addLights() {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445047, 1.8));
  const light = new THREE.DirectionalLight(0xffffff, 1.25);
  light.position.set(2, 4, 2);
  scene.add(light);
}

function addController() {
  controller = renderer.xr.getController(0);

  controller.addEventListener("connected", (event) => {
    controllerInput = event.data;
  });

  controller.addEventListener("selectend", () => {
    if (gameFinished) return;

    if (mode === "calibration") {
      saveCalibrationPoint();
      return;
    }

    if (mode === "searching") {
      trySelectBunny();
      return;
    }

    if (mode === "keypad") {
      trySelectKeypadButton();
    }
  });

  controller.addEventListener("squeezestart", () => {
    if (mode === "ready") {
      startMission();
    }
  });

  scene.add(controller);

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1)
    ]),
    new THREE.LineBasicMaterial({ color: 0x7cffb2 })
  );
  line.name = "controller-ray";
  line.scale.z = 6;
  controller.add(line);
}

function updatePlacementDistance() {
  if (!controllerInput?.gamepad?.axes) return;
  const axes = controllerInput.gamepad.axes;
  const y = axes[3] ?? axes[1] ?? 0;

  if (Math.abs(y) > 0.12) {
    placementDistance -= y * 0.035;
    placementDistance = THREE.MathUtils.clamp(
      placementDistance,
      minDistance,
      maxDistance
    );
  }
}

function getControllerRay() {
  const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  const direction = new THREE.Vector3(0, 0, -1)
    .applyMatrix4(tempMatrix)
    .normalize();
  return { origin, direction };
}

function getControllerRayPoint() {
  const { origin, direction } = getControllerRay();
  return origin.clone().add(direction.multiplyScalar(placementDistance));
}

function addMarker() {
  marker = new THREE.Group();

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0x7cffb2 })
  );

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.07, 0.095, 36),
    new THREE.MeshBasicMaterial({
      color: 0x7cffb2,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    })
  );
  ring.rotation.x = -Math.PI / 2;

  marker.add(dot, ring);
  marker.visible = false;
  scene.add(marker);
}

function updateMarker() {
  if (mode !== "calibration") {
    marker.visible = false;
    return;
  }

  updatePlacementDistance();
  marker.position.copy(getControllerRayPoint());
  marker.visible = true;
}

function saveCalibrationPoint() {
  if (!marker.visible || targetSlots.length >= REQUIRED_TARGETS) return;

  targetSlots.push(marker.position.clone());

  if (targetSlots.length < REQUIRED_TARGETS) {
    setHUD(
      `ADMIN CALIBRATION ${targetSlots.length + 1}/${REQUIRED_TARGETS}`,
      `Saved location ${targetSlots.length}.\nAim at a DIFFERENT real desk/chair area.\nDepth: ${placementDistance.toFixed(2)} m\nTrigger = save next location.`
    );
    return;
  }

  mode = "ready";
  marker.visible = false;

  setHUD(
    "CALIBRATION COMPLETE",
    "3 possible target locations are saved.\nThe system will randomly choose ONE when the game starts.\nPlayer A will not know which one.\nSqueeze = START 60-second game."
  );
}

function addBunny() {
  bunny = new THREE.Group();

  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xff9eb5, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.4 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 32, 32), white);
  body.scale.set(1, 1.15, 0.95);
  body.position.y = 0.09;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 32, 32), white);
  head.position.y = 0.21;

  const earL = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.11, 8, 16), white);
  earL.position.set(-0.035, 0.32, 0);
  earL.rotation.z = 0.18;

  const earR = earL.clone();
  earR.position.x = 0.035;
  earR.rotation.z = -0.18;

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.01, 16, 16), dark);
  eyeL.position.set(-0.028, 0.23, 0.073);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.028;

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 16), pink);
  nose.position.set(0, 0.2, 0.082);

  const cheekL = new THREE.Mesh(new THREE.SphereGeometry(0.01, 16, 16), pink);
  cheekL.scale.set(1.3, 0.65, 0.45);
  cheekL.position.set(-0.045, 0.19, 0.072);
  const cheekR = cheekL.clone();
  cheekR.position.x = 0.045;

  const footL = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 16), white);
  footL.scale.set(1.35, 0.55, 0.9);
  footL.position.set(-0.038, 0.005, 0.04);
  const footR = footL.clone();
  footR.position.x = 0.038;

  bunny.add(body, head, earL, earR, eyeL, eyeR, nose, cheekL, cheekR, footL, footR);
  bunny.scale.set(0.85, 0.85, 0.85);
  bunny.visible = false;
  scene.add(bunny);
}

function startMission() {
  if (targetSlots.length !== REQUIRED_TARGETS) return;

  selectedTargetIndex = Math.floor(Math.random() * targetSlots.length);
  bunny.position.copy(targetSlots[selectedTargetIndex]);
  faceBunnyToUser();
  bunny.visible = false;

  mode = "searching";
  keypadGroup.visible = false;
  enteredCode = "";
  timeLeft = 60;
  lastTimerUpdate = performance.now();

  setHUD(
    "MISSION START",
    "Player A: find the hidden virtual bunny.\nPlayer B: solve the 3 maths questions NOW.\nBoth players are active at the same time."
  );
}

function updateSearchGame() {
  if (mode !== "searching" || gameFinished) return;

  updateTimer();
  if (gameFinished) return;

  const cameraPos = new THREE.Vector3();
  camera.getWorldPosition(cameraPos);

  const bunnyPos = new THREE.Vector3();
  bunny.getWorldPosition(bunnyPos);

  const distance = cameraPos.distanceTo(bunnyPos);
  const direction = getDirectionHint(cameraPos, bunnyPos);

  let warning = "";
  if (timeLeft <= 10) warning = "\nHURRY — only a few seconds left!";
  else if (timeLeft <= 20) warning = "\nTime is running out.";

  if (distance <= revealDistance) {
    bunny.visible = true;
    setHUD(
      "BUNNY FOUND!",
      `Time: ${timeLeft}s\nAim at the bunny and press Trigger.\nYou will need Player B's 3-digit code.${warning}`
    );
  } else {
    bunny.visible = false;
    setHUD(
      "PLAYER A — SEARCH",
      `Time: ${timeLeft}s\nDistance: ${distance.toFixed(2)} m\nDirection: ${direction}\nPlayer B is solving the code.${warning}`
    );
  }
}

function updateTimer() {
  const now = performance.now();
  if (now - lastTimerUpdate >= 1000) {
    const secondsPassed = Math.floor((now - lastTimerUpdate) / 1000);
    timeLeft -= secondsPassed;
    lastTimerUpdate += secondsPassed * 1000;
  }

  if (timeLeft <= 0) {
    timeLeft = 0;
    finishGame(false, "TIME'S UP", "The team did not unlock the bunny in time.");
  }
}

function getDirectionHint(cameraPos, targetPos) {
  const toTarget = targetPos.clone().sub(cameraPos);
  const verticalDifference = toTarget.y;
  toTarget.y = 0;

  if (toTarget.lengthSq() < 0.0001) {
    if (verticalDifference > 0.35) return "Above you";
    if (verticalDifference < -0.35) return "Below you";
    return "Very close";
  }

  toTarget.normalize();

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3()
    .crossVectors(forward, new THREE.Vector3(0, 1, 0))
    .normalize();

  const f = toTarget.dot(forward);
  const r = toTarget.dot(right);

  let horizontal;
  if (f > 0.65) horizontal = "In front";
  else if (f < -0.65) horizontal = "Behind";
  else if (r > 0.25) horizontal = "Right";
  else if (r < -0.25) horizontal = "Left";
  else horizontal = "Nearby";

  if (verticalDifference > 0.5) return `${horizontal} / higher`;
  if (verticalDifference < -0.5) return `${horizontal} / lower`;
  return horizontal;
}

function trySelectBunny() {
  if (mode !== "searching" || !bunny.visible) return;

  const { origin, direction } = getControllerRay();
  raycaster.set(origin, direction);
  const hits = raycaster.intersectObject(bunny, true);

  if (hits.length > 0) openKeypad();
}

function addKeypad() {
  keypadGroup = new THREE.Group();
  keypadGroup.visible = false;

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 1.18),
    new THREE.MeshBasicMaterial({ color: 0x172033, transparent: true, opacity: 0.95 })
  );
  panel.position.z = -0.015;
  keypadGroup.add(panel);

  const labels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "CLR", "0", "OK"];
  labels.forEach((label, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = -0.29 + col * 0.29;
    const y = 0.27 - row * 0.25;
    keypadGroup.add(createKeyButton(label, x, y));
  });

  scene.add(keypadGroup);
}

function createKeyButton(label, x, y) {
  const group = new THREE.Group();
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = label === "OK" ? "#3f765e" : label === "CLR" ? "#7c4d57" : "#f6f1e8";
  roundRect(ctx, 4, 4, 248, 152, 22);
  ctx.fill();

  ctx.fillStyle = label === "OK" || label === "CLR" ? "#ffffff" : "#172033";
  ctx.font = "bold 62px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 128, 82);

  const texture = new THREE.CanvasTexture(canvas);
  const button = new THREE.Mesh(
    new THREE.PlaneGeometry(0.23, 0.16),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  );
  button.userData.keypadValue = label;
  group.add(button);
  group.position.set(x, y, 0.01);
  return group;
}

function openKeypad() {
  mode = "keypad";
  enteredCode = "";
  bunny.visible = true;

  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  keypadGroup.position.copy(camPos.clone().add(camDir.multiplyScalar(1.15)));
  keypadGroup.position.y -= 0.05;
  keypadGroup.lookAt(camPos);
  keypadGroup.visible = true;

  setHUD(
    "BUNNY LOCKED",
    `Time: ${timeLeft}s\nAsk Player B for the 3-digit code.\nEntered code: ---\nUse the controller ray to press the keypad.`
  );
}

function trySelectKeypadButton() {
  if (mode !== "keypad" || !keypadGroup.visible) return;

  updateTimer();
  if (gameFinished) return;

  const { origin, direction } = getControllerRay();
  raycaster.set(origin, direction);
  const hits = raycaster.intersectObjects(keypadGroup.children, true);
  const hit = hits.find((item) => item.object.userData.keypadValue);
  if (!hit) return;

  handleKeypadValue(hit.object.userData.keypadValue);
}

function handleKeypadValue(value) {
  if (value === "CLR") {
    enteredCode = "";
  } else if (value === "OK") {
    if (enteredCode === CORRECT_CODE) {
      finishGame(
        true,
        "MISSION COMPLETE!",
        "Correct code: 386. Player A and Player B win together."
      );
      return;
    }

    enteredCode = "";
    timeLeft = Math.max(0, timeLeft - 5);
    setHUD(
      "WRONG CODE",
      `5-second penalty!\nTime: ${timeLeft}s\nAsk Player B to check the maths and try again.`
    );
    return;
  } else if (enteredCode.length < 3) {
    enteredCode += value;
  }

  const display = enteredCode.padEnd(3, "-");
  setHUD(
    "BUNNY LOCKED",
    `Time: ${timeLeft}s\nPlayer B must provide the code.\nEntered code: ${display}\nPress OK when ready.`
  );
}

function finishGame(win, title, message) {
  gameFinished = true;
  mode = "finished";
  keypadGroup.visible = false;
  bunny.visible = true;

  bunny.traverse((child) => {
    if (child.isMesh && child.material?.color) {
      const current = child.material.color.getHex();
      if (current === 0xffffff) {
        child.material.color.set(win ? 0x8ee6aa : 0x9cb8ff);
      }
    }
  });

  setHUD(title, message);
}

function faceBunnyToUser() {
  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  bunny.lookAt(camPos);
  bunny.rotation.x = 0;
  bunny.rotation.z = 0;
}

function addHUD() {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 480;

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  hudPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.50), material);
  hudPanel.userData.canvas = canvas;
  hudPanel.userData.texture = texture;
  scene.add(hudPanel);
}

function setHUD(title, body) {
  if (!hudPanel) return;

  const canvas = hudPanel.userData.canvas;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(20, 28, 42, 0.88)";
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 42);
  ctx.fill();

  ctx.strokeStyle = "rgba(124,255,178,0.55)";
  ctx.lineWidth = 7;
  roundRect(ctx, 7, 7, canvas.width - 14, canvas.height - 14, 38);
  ctx.stroke();

  ctx.fillStyle = "#9fffc3";
  ctx.font = "bold 54px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, 42, 82);

  ctx.fillStyle = "#ffffff";
  ctx.font = "32px Arial";
  body.split("\n").forEach((line, i) => {
    ctx.fillText(line, 42, 145 + i * 48);
  });

  hudPanel.userData.texture.needsUpdate = true;
}

function updateHUDPosition() {
  if (!hudPanel) return;

  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  const targetPosition = camPos.clone().add(camDir.multiplyScalar(1.55));
  targetPosition.x -= 0.35; // keep HUD slightly left of centre
  targetPosition.y += 0.20;

  hudPanel.position.lerp(targetPosition, 0.18);
  hudPanel.lookAt(camPos);
}

function render() {
  updateMarker();

  if (mode === "searching") updateSearchGame();
  if (mode === "keypad") updateTimer();

  if (mode === "calibration" && targetSlots.length < REQUIRED_TARGETS) {
    const step = targetSlots.length + 1;
    setHUD(
      `ADMIN CALIBRATION ${step}/${REQUIRED_TARGETS}`,
      `Aim green marker at real desk location ${step}.\nDepth: ${placementDistance.toFixed(2)} m\nThumbstick up/down = adjust depth.\nTrigger = save location.`
    );
  }

  updateHUDPosition();
  renderer.render(scene, camera);
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

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
