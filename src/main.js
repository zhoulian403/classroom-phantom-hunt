import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";

/* =========================================================
   SILENT STUDY CHALLENGE
   Player A: Quest 3 — find the hidden virtual bunny
   Player B: solve maths questions and obtain code 386

   FINAL FLOW:
   READY
     ↓ Trigger
   System automatically chooses a random bunny position
     ↓
   Player A follows DISTANCE + DIRECTION
   Player B solves maths questions at the same time
     ↓
   A gets close → bunny appears
     ↓ Trigger bunny
   VR keypad appears
     ↓
   B gives A code 386
     ↓
   A enters 386 → MISSION COMPLETE
========================================================= */

let scene;
let camera;
let renderer;
let controller;

let bunny;
let hudPanel;
let keypadGroup;

let mode = "ready";
let gameFinished = false;

let timeLeft = 60;
let lastTimerUpdate = 0;

let enteredCode = "";

const CORRECT_CODE = "386";

// Bunny only becomes visible when A is close enough.
const REVEAL_DISTANCE = 0.85;

// Random bunny placement settings.
// Bunny is generated automatically around the player's
// starting position when the mission begins.
const MIN_TARGET_DISTANCE = 1.6;
const MAX_TARGET_DISTANCE = 2.8;

// Avoid putting bunny too far above/below the player.
// This is a prototype-safe approximation for the study room.
const TARGET_HEIGHT_OFFSET = -0.65;

const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

init();

/* =========================================================
   INITIALISATION
========================================================= */

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

  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;

  document.body.appendChild(renderer.domElement);

  document.body.appendChild(
    ARButton.createButton(renderer, {
      requiredFeatures: ["local-floor"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: {
        root: document.body
      }
    })
  );

  addLights();
  addController();
  addBunny();
  addHUD();
  addKeypad();

  setHUD(
    "SILENT STUDY CHALLENGE",
    "PLAYER A\nFind the hidden bunny using MR clues.\n\nPLAYER B\nSolve the maths challenge to get the code.\n\nTrigger = START GAME"
  );

  window.addEventListener("resize", onWindowResize);

  renderer.setAnimationLoop(render);
}

/* =========================================================
   LIGHTS
========================================================= */

function addLights() {
  const hemi = new THREE.HemisphereLight(
    0xffffff,
    0x445047,
    1.8
  );

  scene.add(hemi);

  const light = new THREE.DirectionalLight(
    0xffffff,
    1.3
  );

  light.position.set(2, 4, 2);

  scene.add(light);
}

/* =========================================================
   QUEST CONTROLLER
========================================================= */

function addController() {
  controller = renderer.xr.getController(0);

  controller.addEventListener("selectend", () => {
    if (gameFinished) return;

    // FIRST TRIGGER:
    // Start the game.
    if (mode === "ready") {
      startMission();
      return;
    }

    // DURING SEARCH:
    // Try clicking bunny.
    if (mode === "searching") {
      trySelectBunny();
      return;
    }

    // KEYPAD:
    // Try clicking a number.
    if (mode === "keypad") {
      trySelectKeypadButton();
    }
  });

  scene.add(controller);

  // Visible controller ray
  const geometry =
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1)
    ]);

  const material =
    new THREE.LineBasicMaterial({
      color: 0x7cffb2
    });

  const line = new THREE.Line(
    geometry,
    material
  );

  line.name = "controller-ray";

  // 6 metre ray
  line.scale.z = 6;

  controller.add(line);
}

/* =========================================================
   CONTROLLER RAY
========================================================= */

function getControllerRay() {
  const origin =
    new THREE.Vector3()
      .setFromMatrixPosition(
        controller.matrixWorld
      );

  tempMatrix
    .identity()
    .extractRotation(
      controller.matrixWorld
    );

  const direction =
    new THREE.Vector3(0, 0, -1)
      .applyMatrix4(tempMatrix)
      .normalize();

  return {
    origin,
    direction
  };
}

/* =========================================================
   BUNNY MODEL
========================================================= */

function addBunny() {
  bunny = new THREE.Group();

  const white =
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7
    });

  const pink =
    new THREE.MeshStandardMaterial({
      color: 0xff9eb5,
      roughness: 0.65
    });

  const dark =
    new THREE.MeshStandardMaterial({
      color: 0x171717,
      roughness: 0.4
    });

  // BODY
  const body =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        0.10,
        32,
        32
      ),
      white
    );

  body.scale.set(
    1,
    1.18,
    0.95
  );

  body.position.y = 0.10;

  // HEAD
  const head =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        0.085,
        32,
        32
      ),
      white
    );

  head.position.y = 0.235;

  // LEFT EAR
  const earL =
    new THREE.Mesh(
      new THREE.CapsuleGeometry(
        0.017,
        0.12,
        8,
        16
      ),
      white
    );

  earL.position.set(
    -0.038,
    0.355,
    0
  );

  earL.rotation.z = 0.18;

  // RIGHT EAR
  const earR = earL.clone();

  earR.position.x = 0.038;
  earR.rotation.z = -0.18;

  // EYES
  const eyeL =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        0.011,
        16,
        16
      ),
      dark
    );

  eyeL.position.set(
    -0.029,
    0.25,
    0.077
  );

  const eyeR = eyeL.clone();

  eyeR.position.x = 0.029;

  // NOSE
  const nose =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        0.009,
        16,
        16
      ),
      pink
    );

  nose.position.set(
    0,
    0.215,
    0.088
  );

  // CHEEKS
  const cheekL =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        0.011,
        16,
        16
      ),
      pink
    );

  cheekL.scale.set(
    1.3,
    0.65,
    0.45
  );

  cheekL.position.set(
    -0.048,
    0.205,
    0.076
  );

  const cheekR = cheekL.clone();

  cheekR.position.x = 0.048;

  // FEET
  const footL =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        0.028,
        16,
        16
      ),
      white
    );

  footL.scale.set(
    1.35,
    0.55,
    0.9
  );

  footL.position.set(
    -0.04,
    0.008,
    0.045
  );

  const footR = footL.clone();

  footR.position.x = 0.04;

  bunny.add(
    body,
    head,
    earL,
    earR,
    eyeL,
    eyeR,
    nose,
    cheekL,
    cheekR,
    footL,
    footR
  );

  // Keep bunny small
  bunny.scale.set(
    0.8,
    0.8,
    0.8
  );

  bunny.visible = false;

  scene.add(bunny);
}

/* =========================================================
   START GAME
========================================================= */

function startMission() {
  mode = "searching";

  gameFinished = false;

  enteredCode = "";

  timeLeft = 60;

  lastTimerUpdate =
    performance.now();

  keypadGroup.visible = false;

  /*
     IMPORTANT:
     PLAYER A DOES NOT HIDE THE BUNNY.

     The system automatically chooses a random
     position when the game begins.
  */

  chooseRandomBunnyPosition();

  bunny.visible = false;

  setHUD(
    "FIND THE BUNNY",
    "TIME      60 s\nDISTANCE  calculating...\nDIRECTION calculating...\n\nFollow the clues.\nPlayer B: solve the code NOW!"
  );
}

/* =========================================================
   AUTOMATIC RANDOM BUNNY POSITION
========================================================= */

function chooseRandomBunnyPosition() {
  /*
     Get Player A's current head position.
  */

  const playerPosition =
    new THREE.Vector3();

  camera.getWorldPosition(
    playerPosition
  );

  /*
     Choose random horizontal direction.

     We deliberately avoid generating the target
     directly behind Player A every time.

     Angle range is approximately:
     -140 degrees → +140 degrees.
  */

  const randomAngle =
    THREE.MathUtils.degToRad(
      THREE.MathUtils.randFloat(
        -140,
        140
      )
    );

  /*
     Random distance from Player A.
  */

  const randomDistance =
    THREE.MathUtils.randFloat(
      MIN_TARGET_DISTANCE,
      MAX_TARGET_DISTANCE
    );

  /*
     Calculate random X/Z location.
  */

  const x =
    playerPosition.x +
    Math.sin(randomAngle) *
      randomDistance;

  const z =
    playerPosition.z -
    Math.cos(randomAngle) *
      randomDistance;

  /*
     Put bunny lower than eye height.

     This makes it appear around desk/chair
     level rather than floating at eye level.

     NOTE:
     Browser WebXR does not guarantee semantic
     desk detection, so this is intentionally
     a prototype approximation.
  */

  const y =
    Math.max(
      0.05,
      playerPosition.y +
        TARGET_HEIGHT_OFFSET
    );

  bunny.position.set(
    x,
    y,
    z
  );

  faceBunnyToUser();

  console.log(
    "System selected bunny position:",
    bunny.position
  );
}

/* =========================================================
   SEARCH GAME
========================================================= */

function updateSearchGame() {
  if (
    mode !== "searching" ||
    gameFinished
  ) {
    return;
  }

  updateTimer();

  if (gameFinished) return;

  const playerPosition =
    new THREE.Vector3();

  camera.getWorldPosition(
    playerPosition
  );

  const bunnyPosition =
    new THREE.Vector3();

  bunny.getWorldPosition(
    bunnyPosition
  );

  const distance =
    playerPosition.distanceTo(
      bunnyPosition
    );

  const direction =
    getDirectionHint(
      playerPosition,
      bunnyPosition
    );

  /*
     Bunny remains invisible until
     Player A gets close.
  */

  if (
    distance <= REVEAL_DISTANCE
  ) {
    bunny.visible = true;

    setHUD(
      "BUNNY FOUND!",
      `TIME      ${timeLeft} s\nDISTANCE  ${distance.toFixed(1)} m\n\nAim at the bunny.\nPress Trigger to unlock it.\n\nYou will need Player B's code.`
    );

    return;
  }

  bunny.visible = false;

  let warning = "";

  if (timeLeft <= 10) {
    warning =
      "\n\n⚠ HURRY!";
  } else if (timeLeft <= 20) {
    warning =
      "\n\nTime is running out!";
  }

  setHUD(
    "PLAYER A — FIND THE BUNNY",
    `TIME      ${timeLeft} s\nDISTANCE  ${distance.toFixed(1)} m\nDIRECTION ${direction}\n\nFollow the clues.${warning}`
  );
}

/* =========================================================
   TIMER
========================================================= */

function updateTimer() {
  if (gameFinished) return;

  const now =
    performance.now();

  if (
    now - lastTimerUpdate >= 1000
  ) {
    const secondsPassed =
      Math.floor(
        (now - lastTimerUpdate) /
          1000
      );

    timeLeft -= secondsPassed;

    lastTimerUpdate +=
      secondsPassed * 1000;
  }

  if (timeLeft <= 0) {
    timeLeft = 0;

    finishGame(
      false,
      "TIME'S UP!",
      "The team did not unlock the bunny in time."
    );
  }
}

/* =========================================================
   DIRECTION SYSTEM
========================================================= */

function getDirectionHint(
  cameraPos,
  targetPos
) {
  const toTarget =
    targetPos
      .clone()
      .sub(cameraPos);

  const verticalDifference =
    toTarget.y;

  toTarget.y = 0;

  if (
    toTarget.lengthSq() <
    0.0001
  ) {
    return "VERY CLOSE";
  }

  toTarget.normalize();

  const forward =
    new THREE.Vector3();

  camera.getWorldDirection(
    forward
  );

  forward.y = 0;
  forward.normalize();

  const right =
    new THREE.Vector3()
      .crossVectors(
        forward,
        new THREE.Vector3(
          0,
          1,
          0
        )
      )
      .normalize();

  const forwardAmount =
    toTarget.dot(forward);

  const rightAmount =
    toTarget.dot(right);

  let horizontalDirection;

  if (forwardAmount > 0.7) {
    horizontalDirection =
      "↑ FORWARD";
  } else if (
    forwardAmount < -0.7
  ) {
    horizontalDirection =
      "↓ BEHIND";
  } else if (
    rightAmount > 0.2
  ) {
    horizontalDirection =
      "→ RIGHT";
  } else if (
    rightAmount < -0.2
  ) {
    horizontalDirection =
      "← LEFT";
  } else {
    horizontalDirection =
      "NEARBY";
  }

  if (
    verticalDifference > 0.6
  ) {
    return (
      horizontalDirection +
      " / HIGHER"
    );
  }

  if (
    verticalDifference < -0.6
  ) {
    return (
      horizontalDirection +
      " / LOWER"
    );
  }

  return horizontalDirection;
}

/* =========================================================
   SELECT BUNNY
========================================================= */

function trySelectBunny() {
  if (
    mode !== "searching" ||
    !bunny.visible
  ) {
    return;
  }

  const {
    origin,
    direction
  } = getControllerRay();

  raycaster.set(
    origin,
    direction
  );

  const hits =
    raycaster.intersectObject(
      bunny,
      true
    );

  if (hits.length > 0) {
    openKeypad();
  }
}

/* =========================================================
   VR KEYPAD
========================================================= */

function addKeypad() {
  keypadGroup =
    new THREE.Group();

  keypadGroup.visible = false;

  /*
     Background panel
  */

  const panel =
    new THREE.Mesh(
      new THREE.PlaneGeometry(
        0.95,
        1.25
      ),
      new THREE.MeshBasicMaterial({
        color: 0x101827,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide
      })
    );

  panel.position.z = -0.02;

  keypadGroup.add(panel);

  /*
     Number buttons
  */

  const labels = [
    "1", "2", "3",
    "4", "5", "6",
    "7", "8", "9",
    "CLR", "0", "OK"
  ];

  labels.forEach(
    (label, index) => {
      const col =
        index % 3;

      const row =
        Math.floor(
          index / 3
        );

      const x =
        -0.29 +
        col * 0.29;

      const y =
        0.30 -
        row * 0.25;

      const button =
        createKeyButton(
          label,
          x,
          y
        );

      keypadGroup.add(
        button
      );
    }
  );

  scene.add(keypadGroup);
}

/* =========================================================
   CREATE KEYPAD BUTTON
========================================================= */

function createKeyButton(
  label,
  x,
  y
) {
  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width = 320;
  canvas.height = 220;

  const ctx =
    canvas.getContext("2d");

  /*
     Button background
  */

  if (label === "OK") {
    ctx.fillStyle =
      "#49a477";
  } else if (
    label === "CLR"
  ) {
    ctx.fillStyle =
      "#a64f5e";
  } else {
    ctx.fillStyle =
      "#f5f2eb";
  }

  roundRect(
    ctx,
    5,
    5,
    310,
    210,
    30
  );

  ctx.fill();

  /*
     Button text
  */

  if (
    label === "OK" ||
    label === "CLR"
  ) {
    ctx.fillStyle =
      "#ffffff";
  } else {
    ctx.fillStyle =
      "#111827";
  }

  ctx.font =
    "bold 86px Arial";

  ctx.textAlign =
    "center";

  ctx.textBaseline =
    "middle";

  ctx.fillText(
    label,
    160,
    112
  );

  const texture =
    new THREE.CanvasTexture(
      canvas
    );

  const button =
    new THREE.Mesh(
      new THREE.PlaneGeometry(
        0.24,
        0.17
      ),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
      })
    );

  /*
     VERY IMPORTANT:
     Store keypad value directly
     on clickable mesh.
  */

  button.userData.keypadValue =
    label;

  button.position.set(
    x,
    y,
    0.02
  );

  return button;
}

/* =========================================================
   OPEN KEYPAD
========================================================= */

function openKeypad() {
  mode = "keypad";

  enteredCode = "";

  bunny.visible = true;

  const playerPosition =
    new THREE.Vector3();

  camera.getWorldPosition(
    playerPosition
  );

  const cameraDirection =
    new THREE.Vector3();

  camera.getWorldDirection(
    cameraDirection
  );

  /*
     Put keypad directly in front
     of Player A.
  */

  keypadGroup.position.copy(
    playerPosition
      .clone()
      .add(
        cameraDirection.multiplyScalar(
          1.0
        )
      )
  );

  /*
     Slightly below eye level.
  */

  keypadGroup.position.y -=
    0.12;

  keypadGroup.lookAt(
    playerPosition
  );

  keypadGroup.visible = true;

  setHUD(
    "BUNNY LOCKED",
    `TIME      ${timeLeft} s\nCODE      ---\n\nAsk Player B for the code.\nPoint at the keypad and press Trigger.`
  );
}

/* =========================================================
   KEYPAD CLICK DETECTION
========================================================= */

function trySelectKeypadButton() {
  if (
    mode !== "keypad" ||
    !keypadGroup.visible
  ) {
    return;
  }

  updateTimer();

  if (gameFinished) return;

  const {
    origin,
    direction
  } = getControllerRay();

  raycaster.set(
    origin,
    direction
  );

  /*
     Search all keypad descendants.
  */

  const hits =
    raycaster.intersectObjects(
      keypadGroup.children,
      true
    );

  const clickableHit =
    hits.find(
      hit =>
        hit.object.userData
          .keypadValue !==
        undefined
    );

  if (!clickableHit) {
    return;
  }

  const value =
    clickableHit.object
      .userData
      .keypadValue;

  handleKeypadValue(value);
}

/* =========================================================
   KEYPAD LOGIC
========================================================= */

function handleKeypadValue(
  value
) {
  /*
     CLEAR
  */

  if (value === "CLR") {
    enteredCode = "";

    updateKeypadHUD();

    return;
  }

  /*
     OK
  */

  if (value === "OK") {
    if (
      enteredCode ===
      CORRECT_CODE
    ) {
      finishGame(
        true,
        "MISSION COMPLETE!",
        "CODE 386 ACCEPTED\n\nPLAYER A + PLAYER B WIN!"
      );

      return;
    }

    /*
       Wrong password:
       remove 5 seconds.
    */

    enteredCode = "";

    timeLeft =
      Math.max(
        0,
        timeLeft - 5
      );

    if (timeLeft <= 0) {
      finishGame(
        false,
        "TIME'S UP!",
        "Wrong code caused the team to run out of time."
      );

      return;
    }

    setHUD(
      "WRONG CODE!",
      `-5 SECOND PENALTY\n\nTIME      ${timeLeft} s\nCODE      ---\n\nAsk Player B to check the answers.`
    );

    return;
  }

  /*
     NUMBER
  */

  if (
    enteredCode.length < 3
  ) {
    enteredCode += value;
  }

  updateKeypadHUD();
}

/* =========================================================
   UPDATE KEYPAD DISPLAY
========================================================= */

function updateKeypadHUD() {
  const codeDisplay =
    enteredCode
      .padEnd(
        3,
        "-"
      );

  setHUD(
    "BUNNY LOCKED",
    `TIME      ${timeLeft} s\nCODE      ${codeDisplay}\n\nPlayer B has the answer.\nEnter 3 digits and press OK.`
  );
}

/* =========================================================
   FINISH GAME
========================================================= */

function finishGame(
  win,
  title,
  message
) {
  gameFinished = true;

  mode = "finished";

  keypadGroup.visible = false;

  bunny.visible = true;

  /*
     Bunny colour changes when game ends.
  */

  bunny.traverse(
    child => {
      if (
        child.isMesh &&
        child.material?.color
      ) {
        const colour =
          child.material
            .color
            .getHex();

        if (
          colour ===
          0xffffff
        ) {
          child.material
            .color
            .set(
              win
                ? 0x8ee6aa
                : 0x9cb8ff
            );
        }
      }
    }
  );

  setHUD(
    title,
    message
  );
}

/* =========================================================
   FACE BUNNY TOWARDS PLAYER
========================================================= */

function faceBunnyToUser() {
  const playerPosition =
    new THREE.Vector3();

  camera.getWorldPosition(
    playerPosition
  );

  bunny.lookAt(
    playerPosition
  );

  bunny.rotation.x = 0;
  bunny.rotation.z = 0;
}

/* =========================================================
   HUD
========================================================= */

function addHUD() {
  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width = 900;
  canvas.height = 500;

  const texture =
    new THREE.CanvasTexture(
      canvas
    );

  const material =
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide
    });

  /*
     Smaller HUD than previous version.
  */

  hudPanel =
    new THREE.Mesh(
      new THREE.PlaneGeometry(
        0.82,
        0.455
      ),
      material
    );

  hudPanel.userData.canvas =
    canvas;

  hudPanel.userData.texture =
    texture;

  scene.add(hudPanel);
}

/* =========================================================
   DRAW HUD
========================================================= */

function setHUD(
  title,
  body
) {
  if (!hudPanel) return;

  const canvas =
    hudPanel.userData.canvas;

  const ctx =
    canvas.getContext("2d");

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  /*
     Background
  */

  ctx.fillStyle =
    "rgba(13, 20, 33, 0.82)";

  roundRect(
    ctx,
    0,
    0,
    canvas.width,
    canvas.height,
    40
  );

  ctx.fill();

  /*
     Green border
  */

  ctx.strokeStyle =
    "rgba(124,255,178,0.75)";

  ctx.lineWidth = 6;

  roundRect(
    ctx,
    6,
    6,
    canvas.width - 12,
    canvas.height - 12,
    36
  );

  ctx.stroke();

  /*
     Title
  */

  ctx.fillStyle =
    "#9fffc3";

  ctx.font =
    "bold 46px Arial";

  ctx.textAlign =
    "left";

  ctx.textBaseline =
    "alphabetic";

  ctx.fillText(
    title,
    38,
    68
  );

  /*
     Body
  */

  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    "29px Arial";

  const lines =
    body.split("\n");

  lines.forEach(
    (line, index) => {
      ctx.fillText(
        line,
        38,
        125 +
          index * 43
      );
    }
  );

  hudPanel.userData.texture
    .needsUpdate = true;
}

/* =========================================================
   KEEP HUD IN PLAYER A'S VIEW
========================================================= */

function updateHUDPosition() {
  if (!hudPanel) return;

  const playerPosition =
    new THREE.Vector3();

  camera.getWorldPosition(
    playerPosition
  );

  const cameraDirection =
    new THREE.Vector3();

  camera.getWorldDirection(
    cameraDirection
  );

  /*
     Place HUD in front of player,
     but move it left and upward.

     This keeps the centre of the
     real study room visible.
  */

  const targetPosition =
    playerPosition
      .clone()
      .add(
        cameraDirection.multiplyScalar(
          1.45
        )
      );

  targetPosition.x -= 0.42;
  targetPosition.y += 0.30;

  hudPanel.position.lerp(
    targetPosition,
    0.20
  );

  hudPanel.lookAt(
    playerPosition
  );
}

/* =========================================================
   RENDER LOOP
========================================================= */

function render() {
  if (
    mode === "searching"
  ) {
    updateSearchGame();
  }

  if (
    mode === "keypad"
  ) {
    updateTimer();
  }

  updateHUDPosition();

  renderer.render(
    scene,
    camera
  );
}

/* =========================================================
   ROUND RECTANGLE
========================================================= */

function roundRect(
  ctx,
  x,
  y,
  width,
  height,
  radius
) {
  ctx.beginPath();

  ctx.moveTo(
    x + radius,
    y
  );

  ctx.arcTo(
    x + width,
    y,
    x + width,
    y + height,
    radius
  );

  ctx.arcTo(
    x + width,
    y + height,
    x,
    y + height,
    radius
  );

  ctx.arcTo(
    x,
    y + height,
    x,
    y,
    radius
  );

  ctx.arcTo(
    x,
    y,
    x + width,
    y,
    radius
  );

  ctx.closePath();
}

/* =========================================================
   WINDOW RESIZE
========================================================= */

function onWindowResize() {
  camera.aspect =
    window.innerWidth /
    window.innerHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );
}