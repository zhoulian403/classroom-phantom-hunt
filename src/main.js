import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";

let scene;
let camera;
let renderer;
let rabbit;
let controller;
let targetPosition = null;

let gameState = "hiding"; // hiding, searching, finished
let timeLeft = 60;
let timerInterval = null;

const zones = {
  blackboard: {
    label: "Blackboard",
    position: [0, 1.7, -3],
    hint1: "Hint: It is near the teaching area.",
    hint2: "Hint: Look at a vertical surface."
  },
  desk: {
    label: "Desk",
    position: [1.5, 0.8, -2],
    hint1: "Hint: It is near the student area.",
    hint2: "Hint: Look around the desk."
  },
  door: {
    label: "Door",
    position: [-2, 1.2, -1],
    hint1: "Hint: It is near the entrance.",
    hint2: "Hint: Look close to the door."
  }
};

let currentZone = zones.blackboard;

init();

window.hideAt = function (zoneName) {
  if (gameState === "searching") return;

  currentZone = zones[zoneName];

  targetPosition = new THREE.Vector3(
    currentZone.position[0],
    currentZone.position[1],
    currentZone.position[2]
  );

  rabbit.material.color.set(0xff5555);
  rabbit.visible = true;

  gameState = "searching";
  timeLeft = 60;

  document.getElementById("status").innerText =
    `Player A hid the target. Player B: find it!`;

  document.getElementById("hint").innerText = "Hint: None";
  document.getElementById("timer").innerText = `Time: ${timeLeft}`;

  startTimer();
};

window.restartGame = function () {
  gameState = "hiding";
  timeLeft = 60;
  targetPosition = null;

  if (timerInterval) {
    clearInterval(timerInterval);
  }

  rabbit.visible = true;
  rabbit.material.color.set(0xff5555);
  rabbit.position.set(0, 1.7, -3);

  document.getElementById("status").innerText =
    "Choose a hiding location.";

  document.getElementById("timer").innerText = "Time: 60";
  document.getElementById("hint").innerText = "Hint: None";
};

function startTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  timerInterval = setInterval(() => {
    if (gameState !== "searching") return;

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

      document.getElementById("status").innerText =
        "Time is up! Player B loses.";

      document.getElementById("hint").innerText =
        `The target was hidden at: ${currentZone.label}`;

      rabbit.material.color.set(0x3b82f6);
    }
  }, 1000);
}

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1f5f9);

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 1.6, 3);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);

  document.body.appendChild(VRButton.createButton(renderer));

  addLights();
  addClassroom();
  addRabbit();
  addController();

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("click", onMouseClick);

  renderer.setAnimationLoop(render);
}

function addLights() {
  const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(2, 5, 3);
  scene.add(directionalLight);
}

function addClassroom() {
  const floorGeometry = new THREE.PlaneGeometry(7, 7);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xbfc5cc });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const backWallGeometry = new THREE.BoxGeometry(7, 3, 0.08);
  const backWallMaterial = new THREE.MeshStandardMaterial({ color: 0xe5e7eb });
  const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
  backWall.position.set(0, 1.5, -3.05);
  scene.add(backWall);

  const blackboardGeometry = new THREE.BoxGeometry(3.2, 1.25, 0.08);
  const blackboardMaterial = new THREE.MeshStandardMaterial({ color: 0x064e3b });
  const blackboard = new THREE.Mesh(blackboardGeometry, blackboardMaterial);
  blackboard.position.set(0, 1.75, -3);
  scene.add(blackboard);

  const deskGeometry = new THREE.BoxGeometry(1.3, 0.55, 0.85);
  const deskMaterial = new THREE.MeshStandardMaterial({ color: 0x7c4a21 });
  const desk = new THREE.Mesh(deskGeometry, deskMaterial);
  desk.position.set(1.5, 0.3, -2);
  scene.add(desk);

  const doorGeometry = new THREE.BoxGeometry(0.85, 2, 0.08);
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x4a250b });
  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.position.set(-2, 1, -1);
  scene.add(door);
}

function addRabbit() {
  const geometry = new THREE.SphereGeometry(0.25, 32, 32);
  const material = new THREE.MeshStandardMaterial({
    color: 0xff5555,
    metalness: 0.1,
    roughness: 0.35
  });

  rabbit = new THREE.Mesh(geometry, material);
  rabbit.position.set(0, 1.7, -3);
  rabbit.name = "target";

  scene.add(rabbit);
}

function addController() {
  controller = renderer.xr.getController(0);
  controller.addEventListener("selectstart", onSelect);
  scene.add(controller);
}

function handleFound() {
  if (gameState !== "searching") return;

  gameState = "finished";
  clearInterval(timerInterval);

  document.getElementById("status").innerText =
    "Found it! Player B wins!";

  document.getElementById("hint").innerText =
    `The target was hidden at: ${currentZone.label}`;

  rabbit.material.color.set(0x22c55e);
}

function onMouseClick(event) {
  if (gameState !== "searching") return;

  const mouse = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObject(rabbit);

  if (intersects.length > 0) {
    handleFound();
  }
}

function onSelect() {
  if (gameState !== "searching") return;

  const raycaster = new THREE.Raycaster();
  const tempMatrix = new THREE.Matrix4();

  tempMatrix.identity().extractRotation(controller.matrixWorld);

  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  const intersects = raycaster.intersectObject(rabbit);

  if (intersects.length > 0) {
    handleFound();
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function render() {
  if (targetPosition && rabbit) {
    rabbit.position.lerp(targetPosition, 0.05);

    if (rabbit.position.distanceTo(targetPosition) < 0.01) {
      rabbit.position.copy(targetPosition);
      targetPosition = null;
    }
  }

  rabbit.rotation.y += 0.015;
  renderer.render(scene, camera);
}