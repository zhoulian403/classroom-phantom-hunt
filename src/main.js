import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";

let scene, camera, renderer, controller;
let bunny;

let bunnyPlaced = false;
let bunnyHidden = false;
let gameFinished = false;

let mode = "hider";
let triggerDownTime = 0;
let isTriggerHolding = false;

const foundDistance = 0.45;

init();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    20
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
      requiredFeatures: ["local-floor"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.body }
    })
  );

  addLights();
  addCuteSmallBunny();
  addController();

  updateHUD(
    "Status: Player A mode. Short press trigger to move bunny. Hold trigger 2s to hide.",
    "Distance: --",
    "Direction: --"
  );

  window.addEventListener("resize", onWindowResize);
  renderer.setAnimationLoop(render);
}

function addLights() {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.8));

  const light = new THREE.DirectionalLight(0xffffff, 1.3);
  light.position.set(1, 3, 2);
  scene.add(light);
}

function addController() {
  controller = renderer.xr.getController(0);

  controller.addEventListener("selectstart", () => {
    if (gameFinished) return;

    isTriggerHolding = true;
    triggerDownTime = performance.now();

    if (mode === "hider" && !bunnyHidden) {
      placeBunnyInFrontOfController();

      updateHUD(
        "Status: Bunny moved. Hold trigger for 2 seconds to confirm hide.",
        "Distance: --",
        "Direction: --"
      );
    }

    if (mode === "seeker") {
      checkFoundByRay();
    }
  });

  controller.addEventListener("selectend", () => {
    if (!isTriggerHolding) return;

    const heldTime = performance.now() - triggerDownTime;
    isTriggerHolding = false;

    if (mode === "hider" && bunnyPlaced && !bunnyHidden && heldTime >= 2000) {
      confirmHide();
    }
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

  line.scale.z = 1.8;
  controller.add(line);
}

function placeBunnyInFrontOfController() {
  const tempMatrix = new THREE.Matrix4();
  tempMatrix.identity().extractRotation(controller.matrixWorld);

  const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
  const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);

  const position = origin.clone().add(direction.multiplyScalar(1.2));
  position.y = Math.max(position.y, 0.18);

  bunny.position.copy(position);
  bunny.visible = true;

  bunnyPlaced = true;
  bunnyHidden = false;
  gameFinished = false;

  setBunnyColor(0xffffff);
}

function confirmHide() {
  bunnyHidden = true;
  bunny.visible = false;
  mode = "seeker";

  updateHUD(
    "Status: Bunny hidden successfully! Give the headset to Player B.",
    "Distance: --",
    "Direction: Search mode will start now."
  );

  setTimeout(() => {
    if (!gameFinished && mode === "seeker") {
      updateHUD(
        "Status: Player B searching...",
        "Distance: calculating...",
        "Direction: calculating..."
      );
    }
  }, 2500);
}

function checkFoundByRay() {
  if (!bunnyPlaced || !bunnyHidden || gameFinished) return;

  const raycaster = new THREE.Raycaster();
  const tempMatrix = new THREE.Matrix4();

  tempMatrix.identity().extractRotation(controller.matrixWorld);

  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  bunny.visible = true;
  const hits = raycaster.intersectObject(bunny, true);
  bunny.visible = false;

  if (hits.length > 0) {
    foundBunny();
  }
}

function updateSeekerHint() {
  if (mode !== "seeker" || !bunnyPlaced || gameFinished) return;

  const cameraPos = new THREE.Vector3();
  camera.getWorldPosition(cameraPos);

  const bunnyPos = new THREE.Vector3();
  bunny.getWorldPosition(bunnyPos);

  const distance = cameraPos.distanceTo(bunnyPos);
  const direction = getDirectionHint(cameraPos, bunnyPos);

  updateHUD(
    "Status: Player B searching...",
    `Distance: ${distance.toFixed(2)} m`,
    `Direction: ${direction}`
  );

  if (distance < foundDistance) {
    foundBunny();
  }
}

function foundBunny() {
  gameFinished = true;
  bunnyHidden = false;
  bunny.visible = true;
  setBunnyColor(0x86efac);

  updateHUD(
    "Status: Bunny found! Player B wins.",
    "Distance: 0.00 m",
    "Direction: Found"
  );
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
  if (rightAmount > 0.2) return "On your right";
  if (rightAmount < -0.2) return "On your left";

  return "Very close";
}

function addCuteSmallBunny() {
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
    color: 0x111111,
    roughness: 0.3
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 32), white);
  body.scale.set(1, 1.15, 0.95);
  body.position.y = 0.12;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 32, 32), white);
  head.scale.set(1.08, 1, 1);
  head.position.y = 0.29;

  const earL = createEar(-0.045, white, pink);
  const earR = createEar(0.045, white, pink);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 16), black);
  eyeL.position.set(-0.038, 0.315, 0.095);

  const eyeR = eyeL.clone();
  eyeR.position.x = 0.038;

  const shineL = new THREE.Mesh(
    new THREE.SphereGeometry(0.0045, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  shineL.position.set(-0.033, 0.32, 0.107);

  const shineR = shineL.clone();
  shineR.position.x = 0.043;

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.01, 16, 16), pink);
  nose.position.set(0, 0.285, 0.105);

  const blushL = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 16), pink);
  blushL.scale.set(1.2, 0.65, 0.25);
  blushL.position.set(-0.065, 0.275, 0.095);

  const blushR = blushL.clone();
  blushR.position.x = 0.065;

  const footL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 16), white);
  footL.scale.set(1.25, 0.55, 0.9);
  footL.position.set(-0.05, 0.005, 0.055);

  const footR = footL.clone();
  footR.position.x = 0.05;

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 16), white);
  tail.position.set(0, 0.12, -0.105);

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

  bunny.scale.set(0.75, 0.75, 0.75);
  bunny.position.set(0, 0, -1);
  bunny.visible = false;

  scene.add(bunny);
}

function createEar(x, white, pink) {
  const group = new THREE.Group();

  const outer = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.022, 0.15, 8, 16),
    white
  );
  outer.position.y = 0.075;

  const inner = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.01, 0.105, 8, 16),
    pink
  );
  inner.position.set(0, 0.075, 0.006);

  group.add(outer, inner);
  group.position.set(x, 0.42, 0);
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

function updateHUD(status, distance, direction) {
  const s = document.getElementById("status");
  const d = document.getElementById("distance");
  const dir = document.getElementById("direction");

  if (s) s.innerText = status;
  if (d) d.innerText = distance;
  if (dir) dir.innerText = direction;
}

function render() {
  if (isTriggerHolding && mode === "hider" && bunnyPlaced && !bunnyHidden) {
    const held = (performance.now() - triggerDownTime) / 1000;

    updateHUD(
      `Status: Hold to hide... ${held.toFixed(1)} / 2.0s`,
      "Distance: --",
      "Direction: Release after 2 seconds to confirm."
    );
  }

  updateSeekerHint();

  if (bunny && bunny.visible) {
    bunny.rotation.y += 0.012;
    bunny.position.y += Math.sin(Date.now() * 0.003) * 0.00035;
  }

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}