import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";

let scene;
let camera;
let renderer;
let controller;

let bunny;
let reticle;
let hudPanel;

let hitTestSource = null;
let hitTestSourceRequested = false;

let mode = "hider"; // hider / seeker / finished
let bunnyPlaced = false;
let bunnyHidden = false;
let gameFinished = false;

let triggerStartTime = 0;
let triggerHolding = false;

const foundDistance = 0.45;

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
      requiredFeatures: ["hit-test", "local-floor"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.body }
    })
  );

  addLights();
  addReticle();
  addBunny();
  addController();
  addWorldHUD();

  setHUD(
    "PLAYER A MODE",
    "Short press trigger to move bunny.\nHold trigger for 2 seconds to hide."
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

function addReticle() {
  const geometry = new THREE.RingGeometry(0.08, 0.11, 32);
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

  controller.addEventListener("selectstart", () => {
    if (gameFinished) return;

    triggerHolding = true;
    triggerStartTime = performance.now();

    if (mode === "hider") {
      moveBunnyToReticleOrController();
      setHUD(
        "BUNNY MOVED",
        "Short press again to move.\nHold trigger 2 seconds to hide."
      );
    }

    if (mode === "seeker") {
      checkBunnyByRay();
    }
  });

  controller.addEventListener("selectend", () => {
    if (!triggerHolding) return;

    const holdTime = performance.now() - triggerStartTime;
    triggerHolding = false;

    if (mode === "hider" && bunnyPlaced && !bunnyHidden && holdTime >= 2000) {
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

  line.scale.z = 2;
  controller.add(line);
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

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.105, 32, 32), white);
  body.scale.set(1, 1.15, 0.95);
  body.position.y = 0.105;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 32, 32), white);
  head.position.y = 0.26;

  const earL = createEar(-0.04, white, pink);
  const earR = createEar(0.04, white, pink);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 16), black);
  eyeL.position.set(-0.034, 0.285, 0.085);

  const eyeR = eyeL.clone();
  eyeR.position.x = 0.034;

  const shineL = new THREE.Mesh(
    new THREE.SphereGeometry(0.004, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  shineL.position.set(-0.03, 0.292, 0.094);

  const shineR = shineL.clone();
  shineR.position.x = 0.039;

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 16), pink);
  nose.position.set(0, 0.255, 0.094);

  const blushL = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 16), pink);
  blushL.scale.set(1.2, 0.65, 0.25);
  blushL.position.set(-0.057, 0.245, 0.084);

  const blushR = blushL.clone();
  blushR.position.x = 0.057;

  const footL = new THREE.Mesh(new THREE.SphereGeometry(0.033, 16, 16), white);
  footL.scale.set(1.25, 0.55, 0.9);
  footL.position.set(-0.045, 0.005, 0.05);

  const footR = footL.clone();
  footR.position.x = 0.045;

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 16), white);
  tail.position.set(0, 0.11, -0.095);

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
    new THREE.CapsuleGeometry(0.018, 0.13, 8, 16),
    white
  );
  outer.position.y = 0.065;

  const inner = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.008, 0.09, 8, 16),
    pink
  );
  inner.position.set(0, 0.065, 0.006);

  group.add(outer, inner);
  group.position.set(x, 0.38, 0);
  group.rotation.z = x > 0 ? -0.25 : 0.25;

  return group;
}

function moveBunnyToReticleOrController() {
  let position = new THREE.Vector3();

  if (reticle.visible) {
    position.setFromMatrixPosition(reticle.matrixWorld);
  } else {
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
    const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);

    position = origin.clone().add(direction.multiplyScalar(1.2));
    position.y = 0;
  }

  bunny.position.copy(position);
  bunny.position.y = 0;

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

  setHUD(
    "BUNNY HIDDEN SUCCESSFULLY",
    "Give the headset to Player B.\nSearch mode starts now."
  );

  setTimeout(() => {
    if (!gameFinished) {
      setHUD("PLAYER B MODE", "Follow distance and direction hints.");
    }
  }, 2500);
}

function updateSeekerHint() {
  if (mode !== "seeker" || !bunnyPlaced || gameFinished) return;

  const cameraPos = new THREE.Vector3();
  camera.getWorldPosition(cameraPos);

  const bunnyPos = new THREE.Vector3();
  bunny.getWorldPosition(bunnyPos);

  const distance = cameraPos.distanceTo(bunnyPos);
  const direction = getDirectionHint(cameraPos, bunnyPos);

  setHUD(
    "PLAYER B SEARCHING",
    `Distance: ${distance.toFixed(2)} m\nDirection: ${direction}`
  );

  if (distance <= foundDistance) {
    foundBunny();
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

function foundBunny() {
  gameFinished = true;
  bunnyHidden = false;
  bunny.visible = true;
  mode = "finished";

  setBunnyColor(0x86efac);

  setHUD(
    "BUNNY FOUND!",
    "Player B wins.\nThe bunny is now visible."
  );
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
  ctx.font = "bold 64px Arial";
  ctx.fillText(title, 48, 115);

  ctx.fillStyle = "#ffffff";
  ctx.font = "48px Arial";

  const lines = body.split("\n");
  lines.forEach((line, index) => {
    ctx.fillText(line, 48, 210 + index * 70);
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

  const position = camPos.clone().add(camDir.multiplyScalar(1.35));
  position.y += 0.1;

  hudPanel.position.copy(position);
  hudPanel.lookAt(camPos);
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
    });

    hitTestSourceRequested = true;
  }

  if (hitTestSource) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const hitTestResults = frame.getHitTestResults(hitTestSource);

    if (hitTestResults.length > 0) {
      const hit = hitTestResults[0];
      const pose = hit.getPose(referenceSpace);

      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }
}

function setBunnyColor(color) {
  bunny.children.forEach((part) => {
    if (!part.material || !part.material.color) return;

    const current = part.material.color.getHex();

    if (current === 0x111111 || current === 0xff9eb5) return;

    part.material.color.set(color);
  });
}

function render(timestamp, frame) {
  if (frame) {
    updateHitTest(frame);
  }

  if (triggerHolding && mode === "hider" && bunnyPlaced && !bunnyHidden) {
    const held = (performance.now() - triggerStartTime) / 1000;

    setHUD(
      "HOLD TO HIDE",
      `${held.toFixed(1)} / 2.0 seconds\nRelease after 2 seconds.`
    );
  }

  updateHUDPosition();
  updateSeekerHint();

  if (bunny && bunny.visible) {
    bunny.rotation.y += 0.012;
  }

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}