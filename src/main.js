import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";

let scene;
let camera;
let renderer;
let controller;
let bunny;
let reticle;

let mode = "none"; 
let bunnyPlaced = false;
let bunnyHidden = false;
let gameFinished = false;

const foundDistance = 0.6;

init();

window.setMode = function (newMode) {
  if (newMode === "hider") {
    mode = "hider";
    bunnyHidden = false;
    gameFinished = false;

    if (bunny) {
      bunny.visible = true;
    }

    updateHUD(
      "Status: Player A mode. Point somewhere in the room and press trigger to place the bunny.",
      "Distance: --",
      "Direction: --"
    );
  }

  if (newMode === "seeker") {
    if (!bunnyPlaced) {
      updateHUD(
        "Status: No bunny has been hidden yet. Player A must hide it first.",
        "Distance: --",
        "Direction: --"
      );
      return;
    }

    mode = "seeker";
    bunnyHidden = true;
    gameFinished = false;
    bunny.visible = false;

    updateHUD(
      "Status: Player B mode. Search for the bunny using hints.",
      "Distance: calculating...",
      "Direction: calculating..."
    );
  }
};

window.confirmHide = function () {
  if (!bunnyPlaced) {
    updateHUD(
      "Status: Place the bunny first using the controller trigger.",
      "Distance: --",
      "Direction: --"
    );
    return;
  }

  bunnyHidden = true;
  bunny.visible = false;
  mode = "none";

  updateHUD(
    "Status: Bunny hidden. Now give the headset to Player B.",
    "Distance: --",
    "Direction: --"
  );
};

window.resetGame = function () {
  bunnyPlaced = false;
  bunnyHidden = false;
  gameFinished = false;
  mode = "none";

  if (bunny) {
    bunny.visible = false;
    bunny.position.set(0, 0, -1);
    setBunnyColor(0xffffff);
  }

  updateHUD(
    "Status: Reset complete. Player A can hide again.",
    "Distance: --",
    "Direction: --"
  );
};

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
  addBunny();
  addReticle();
  addController();

  window.addEventListener("resize", onWindowResize);

  renderer.setAnimationLoop(render);
}

function addLights() {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.6);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(2, 4, 2);
  scene.add(dir);
}

function addBunny() {
  bunny = new THREE.Group();

  const white = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.75
  });

  const pink = new THREE.MeshStandardMaterial({
    color: 0xffb6c1,
    roughness: 0.7
  });

  const black = new THREE.MeshStandardMaterial({
    color: 0x111111
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 32), white);
  body.position.y = 0.18;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 32), white);
  head.position.y = 0.42;

  const leftEar = createEar(-0.07, white, pink);
  const rightEar = createEar(0.07, white, pink);

  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 16), black);
  leftEye.position.set(-0.05, 0.45, 0.145);

  const rightEye = leftEye.clone();
  rightEye.position.x = 0.05;

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.017, 16, 16), pink);
  nose.position.set(0, 0.39, 0.16);

  const blushL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 16), pink);
  blushL.position.set(-0.08, 0.38, 0.135);

  const blushR = blushL.clone();
  blushR.position.x = 0.08;

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 16), white);
  tail.position.set(0, 0.18, -0.15);

  bunny.add(
    body,
    head,
    leftEar,
    rightEar,
    leftEye,
    rightEye,
    nose,
    blushL,
    blushR,
    tail
  );

  bunny.position.set(0, 0, -1);
  bunny.visible = false;

  scene.add(bunny);
}

function createEar(x, white, pink) {
  const ear = new THREE.Group();

  const outer = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.035, 0.24, 8, 16),
    white
  );
  outer.position.y = 0.12;

  const inner = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.017, 0.17, 8, 16),
    pink
  );
  inner.position.set(0, 0.12, 0.01);

  ear.add(outer, inner);
  ear.position.set(x, 0.58, 0);
  ear.rotation.z = x > 0 ? -0.22 : 0.22;

  return ear;
}

function addReticle() {
  const geometry = new THREE.RingGeometry(0.08, 0.1, 32);
  const material = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    side: THREE.DoubleSide
  });

  reticle = new THREE.Mesh(geometry, material);
  reticle.rotation.x = -Math.PI / 2;
  reticle.visible = false;

  scene.add(reticle);
}

function addController() {
  controller = renderer.xr.getController(0);
  controller.addEventListener("selectstart", onSelectStart);
  scene.add(controller);

  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1)
  ]);

  const line = new THREE.Line(
    lineGeometry,
    new THREE.LineBasicMaterial({ color: 0xffffff })
  );

  line.name = "controller-ray";
  line.scale.z = 3;
  controller.add(line);
}

function onSelectStart() {
  if (mode === "hider") {
    placeBunnyInFrontOfController();
  }

  if (mode === "seeker") {
    tryFindBunnyByRay();
  }
}

function placeBunnyInFrontOfController() {
  const tempMatrix = new THREE.Matrix4();
  tempMatrix.identity().extractRotation(controller.matrixWorld);

  const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
  const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);

  const placePosition = origin.clone().add(direction.multiplyScalar(1.5));
  placePosition.y = Math.max(placePosition.y, 0.2);

  bunny.position.copy(placePosition);
  bunny.visible = true;
  bunnyPlaced = true;
  bunnyHidden = false;
  setBunnyColor(0xffffff);

  updateHUD(
    "Status: Bunny placed. Press Confirm Hide to hide it.",
    "Distance: --",
    "Direction: --"
  );
}

function tryFindBunnyByRay() {
  if (!bunnyPlaced || gameFinished) return;

  const raycaster = new THREE.Raycaster();
  const tempMatrix = new THREE.Matrix4();

  tempMatrix.identity().extractRotation(controller.matrixWorld);

  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  bunny.visible = true;
  const intersects = raycaster.intersectObject(bunny, true);
  bunny.visible = !bunnyHidden;

  if (intersects.length > 0) {
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
    "Distance: 0.0 m",
    "Direction: Found"
  );
}

function updateSeekerHint() {
  if (mode !== "seeker" || !bunnyPlaced || gameFinished) return;

  const cameraPosition = new THREE.Vector3();
  camera.getWorldPosition(cameraPosition);

  const bunnyPosition = new THREE.Vector3();
  bunny.getWorldPosition(bunnyPosition);

  const distance = cameraPosition.distanceTo(bunnyPosition);

  const directionText = getDirectionHint(cameraPosition, bunnyPosition);

  updateHUD(
    "Status: Player B searching...",
    `Distance: ${distance.toFixed(2)} m`,
    `Direction: ${directionText}`
  );

  if (distance < foundDistance) {
    foundBunny();
  }
}

function getDirectionHint(cameraPosition, targetPosition) {
  const toTarget = targetPosition.clone().sub(cameraPosition);
  toTarget.y = 0;
  toTarget.normalize();

  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  cameraDirection.y = 0;
  cameraDirection.normalize();

  const right = new THREE.Vector3();
  right.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();

  const forwardAmount = toTarget.dot(cameraDirection);
  const rightAmount = toTarget.dot(right);

  if (forwardAmount > 0.7) return "In front of you";
  if (forwardAmount < -0.7) return "Behind you";
  if (rightAmount > 0.2) return "On your right";
  if (rightAmount < -0.2) return "On your left";

  return "Nearby";
}

function updateHUD(status, distance, direction) {
  document.getElementById("status").innerText = status;
  document.getElementById("distance").innerText = distance;
  document.getElementById("direction").innerText = direction;
}

function setBunnyColor(color) {
  bunny.children.forEach((part) => {
    if (!part.material || !part.material.color) return;

    const current = part.material.color.getHex();

    if (current === 0x111111 || current === 0xffb6c1) return;

    part.material.color.set(color);
  });
}

function render() {
  updateSeekerHint();

  if (bunny && bunny.visible) {
    bunny.rotation.y += 0.01;
    bunny.position.y += Math.sin(Date.now() * 0.003) * 0.0008;
  }

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}