import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";

let scene, camera, renderer, controller;
let bunny, marker, hudPanel;
let controllerInput = null;

let mode = "hider";
let bunnyPlaced = false;
let bunnyHidden = false;
let gameFinished = false;

let placementDistance = 1.4;
let triggerStartTime = 0;
let triggerDown = false;

let seekerTimeLeft = 60;
let lastTimerUpdate = 0;

const minDistance = 0.25;
const maxDistance = 6;
const foundDistance = 0.45;

init();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 30);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
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

  setHUD("PLAYER A", "Aim controller.\nThumbstick up/down adjusts depth.\nShort press = place bunny.\nHold 2s = hide.");

  window.addEventListener("resize", onWindowResize);
  renderer.setAnimationLoop(render);
}

function addLights() {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.8));

  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(2, 4, 2);
  scene.add(light);
}

function addController() {
  controller = renderer.xr.getController(0);

  controller.addEventListener("connected", (event) => {
    controllerInput = event.data;
  });

  controller.addEventListener("selectstart", () => {
    if (gameFinished) return;
    triggerDown = true;
    triggerStartTime = performance.now();
  });

  controller.addEventListener("selectend", () => {
    if (gameFinished) return;

    const held = (performance.now() - triggerStartTime) / 1000;
    triggerDown = false;

    if (mode === "hider") {
      if (held >= 2 && bunnyPlaced) {
        hideBunny();
      } else {
        placeBunny();
      }
    }

    if (mode === "seeker") {
      checkBunnyByRay();
    }
  });

  scene.add(controller);

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1)
    ]),
    new THREE.LineBasicMaterial({ color: 0x00ff88 })
  );

  line.scale.z = 6;
  controller.add(line);
}

function updatePlacementDistance() {
  if (!controllerInput?.gamepad?.axes) return;

  const axes = controllerInput.gamepad.axes;
  const y = axes[3] ?? axes[1] ?? 0;

  if (Math.abs(y) > 0.12) {
    placementDistance -= y * 0.035;
    placementDistance = THREE.MathUtils.clamp(placementDistance, minDistance, maxDistance);
  }
}

function getControllerRayPoint() {
  const origin = new THREE.Vector3();
  origin.setFromMatrixPosition(controller.matrixWorld);

  const rotation = new THREE.Matrix4();
  rotation.extractRotation(controller.matrixWorld);

  const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(rotation).normalize();

  return origin.add(direction.multiplyScalar(placementDistance));
}

function addMarker() {
  marker = new THREE.Group();

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.11, 32),
    new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;

  marker.add(sphere, ring);
  scene.add(marker);
}

function updateMarker() {
  if (mode !== "hider" || bunnyHidden || gameFinished) {
    marker.visible = false;
    return;
  }

  updatePlacementDistance();

  marker.position.copy(getControllerRayPoint());
  marker.visible = true;

  if (!triggerDown) {
    setHUD(
      "PLAYER A",
      `Green point = bunny position.\nThumbstick adjusts depth.\nDistance: ${placementDistance.toFixed(2)}m\nShort press = place. Hold 2s = hide.`
    );
  }
}

function addBunny() {
  bunny = new THREE.Group();

  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xff9eb5, roughness: 0.7 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111 });

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

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.01, 16, 16), black);
  eyeL.position.set(-0.028, 0.23, 0.073);

  const eyeR = eyeL.clone();
  eyeR.position.x = 0.028;

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 16), pink);
  nose.position.set(0, 0.2, 0.082);

  const blushL = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 16), pink);
  blushL.position.set(-0.048, 0.195, 0.074);

  const blushR = blushL.clone();
  blushR.position.x = 0.048;

  const footL = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 16), white);
  footL.scale.set(1.35, 0.55, 0.9);
  footL.position.set(-0.038, 0.005, 0.04);

  const footR = footL.clone();
  footR.position.x = 0.038;

  bunny.add(body, head, earL, earR, eyeL, eyeR, nose, blushL, blushR, footL, footR);
  bunny.scale.set(0.75, 0.75, 0.75);
  bunny.visible = false;

  scene.add(bunny);
}

function placeBunny() {
  if (!marker.visible) return;

  bunny.position.copy(marker.position);
  faceBunnyToUser();
  bunny.visible = true;

  bunnyPlaced = true;
  bunnyHidden = false;

  setHUD("BUNNY PLACED", "Adjust green point if needed.\nShort press = move bunny.\nHold trigger 2s = hide.");
}

function hideBunny() {
  bunny.visible = false;
  bunnyHidden = true;
  mode = "seeker";
  seekerTimeLeft = 60;
  lastTimerUpdate = performance.now();

  setHUD("BUNNY HIDDEN", "Player B starts now.\nFind the bunny before time runs out.");
}

function updateSeekerGame() {
  if (mode !== "seeker" || gameFinished) return;

  const now = performance.now();

  if (now - lastTimerUpdate >= 1000) {
    seekerTimeLeft--;
    lastTimerUpdate = now;
  }

  if (seekerTimeLeft <= 0) {
    endGame(false);
    return;
  }

  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);

  const bunnyPos = new THREE.Vector3();
  bunny.getWorldPosition(bunnyPos);

  const distance = camPos.distanceTo(bunnyPos);
  const direction = getDirectionHint(camPos, bunnyPos);

  let warning = "";
  if (seekerTimeLeft <= 10) warning = "\nHURRY UP!";
  else if (seekerTimeLeft <= 20) warning = "\nTime is running out.";

  setHUD(
    "PLAYER B",
    `Time: ${seekerTimeLeft}s\nDistance: ${distance.toFixed(2)}m\nDirection: ${direction}${warning}`
  );

  if (distance <= foundDistance) {
    endGame(true);
  }
}

function getDirectionHint(cameraPos, targetPos) {
  const toTarget = targetPos.clone().sub(cameraPos);
  toTarget.y = 0;
  toTarget.normalize();

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const f = toTarget.dot(forward);
  const r = toTarget.dot(right);

  if (f > 0.65) return "In front";
  if (f < -0.65) return "Behind";
  if (r > 0.25) return "Right";
  if (r < -0.25) return "Left";
  return "Very close";
}

function checkBunnyByRay() {
  const origin = new THREE.Vector3();
  origin.setFromMatrixPosition(controller.matrixWorld);

  const rotation = new THREE.Matrix4();
  rotation.extractRotation(controller.matrixWorld);

  const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(rotation).normalize();

  const raycaster = new THREE.Raycaster(origin, direction);

  bunny.visible = true;
  const hits = raycaster.intersectObject(bunny, true);
  bunny.visible = false;

  if (hits.length > 0) endGame(true);
}

function endGame(win) {
  gameFinished = true;
  mode = "finished";
  bunnyHidden = false;
  bunny.visible = true;

  setHUD(win ? "FOUND!" : "TIME UP", win ? "Player B wins." : "The bunny is revealed.");
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
  canvas.width = 1024;
  canvas.height = 512;

  const texture = new THREE.CanvasTexture(canvas);

  hudPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 0.68),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  );

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
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 44);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 8;
  roundRect(ctx, 6, 6, canvas.width - 12, canvas.height - 12, 40);
  ctx.stroke();

  ctx.fillStyle = "#fde047";
  ctx.font = "bold 58px Arial";
  ctx.fillText(title, 48, 96);

  ctx.fillStyle = "#ffffff";
  ctx.font = "38px Arial";

  body.split("\n").forEach((line, i) => {
    ctx.fillText(line, 48, 170 + i * 54);
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
  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);

  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  hudPanel.position.copy(camPos.add(camDir.multiplyScalar(1.25)));
  hudPanel.position.y += 0.05;
  hudPanel.lookAt(camera.position);
}

function render() {
  updateMarker();

  if (triggerDown && mode === "hider" && bunnyPlaced && !bunnyHidden) {
    const held = (performance.now() - triggerStartTime) / 1000;

    if (held < 2) {
      setHUD("HOLD TO HIDE", `${held.toFixed(1)} / 2.0 seconds`);
    }
  }

  updateHUDPosition();
  updateSeekerGame();

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}