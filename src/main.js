import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";

/* =========================================================
   SILENT STUDY CHALLENGE — FINAL VERSION

   PLAYER A — META QUEST 3
   - Press START GAME in MR.
   - The system automatically hides the bunny.
   - Follow distance + direction hints.
   - Find the bunny.
   - Ask Player B for the code.
   - Enter 386 on the VR keypad.

   PLAYER B — REAL WORLD
   - Solve the maths questions at the same time.
   - 9 - 6 = 3
   - 4 × 2 = 8
   - 12 ÷ 2 = 6
   - Code = 386

   STUDY ROOM RULE
   - Players must remain quiet.
   - Microphone measures relative noise level.
   - Too much noise for around 1.5 seconds = mission failed.
========================================================= */


/* =========================================================
   GLOBAL VARIABLES
========================================================= */

let scene;
let camera;
let renderer;
let controller;

let bunny;

let hudPanel;

let startButtonGroup;

let keypadGroup;


/*
   GAME MODES

   ready
   calibratingNoise
   searching
   keypad
   finished
*/

let mode = "ready";

let gameFinished = false;


/* =========================================================
   GAME VARIABLES
========================================================= */

let timeLeft = 60;

let lastTimerUpdate = 0;

let enteredCode = "";

const CORRECT_CODE = "386";


/*
   Bunny appears only when
   Player A is close enough.
*/

const REVEAL_DISTANCE = 0.9;


/*
   Random placement distance.
*/

const MIN_TARGET_DISTANCE = 1.6;

const MAX_TARGET_DISTANCE = 3.0;


/*
   Prevent accidental repeated
   keypad presses.
*/

const KEY_PRESS_COOLDOWN = 180;

let lastKeyPressTime = 0;


/* =========================================================
   RAYCASTING
========================================================= */

const raycaster =
  new THREE.Raycaster();

const tempMatrix =
  new THREE.Matrix4();

const tempV3A =
  new THREE.Vector3();

const tempV3B =
  new THREE.Vector3();


/* =========================================================
   MICROPHONE / NOISE VARIABLES
========================================================= */

let micStream = null;

let audioContext = null;

let analyser = null;

let audioBuffer = null;


/*
   Browser audio uses dBFS,
   not calibrated physical dB SPL.
*/

let currentNoiseDbfs = -80;

let baselineNoiseDbfs = -55;

let warningNoiseDbfs = -36;

let failNoiseDbfs = -30;


/*
   Noise must remain too loud
   for this long before failure.

   Avoids failing because of
   one short click/cough.
*/

const NOISE_FAIL_HOLD_MS = 1500;

let noiseOverLimitMs = 0;

let lastNoiseUpdate =
  performance.now();


/* =========================================================
   START
========================================================= */

init();


/* =========================================================
   INITIALISATION
========================================================= */

function init() {

  scene = new THREE.Scene();


  camera =
    new THREE.PerspectiveCamera(

      70,

      window.innerWidth /
      window.innerHeight,

      0.01,

      30
    );


  renderer =
    new THREE.WebGLRenderer({

      antialias: true,

      alpha: true

    });


  renderer.setPixelRatio(
    window.devicePixelRatio
  );


  renderer.setSize(

    window.innerWidth,

    window.innerHeight

  );


  renderer.xr.enabled = true;


  document.body.appendChild(
    renderer.domElement
  );


  /*
     ENTER AR BUTTON
  */

  document.body.appendChild(

    ARButton.createButton(

      renderer,

      {

        requiredFeatures: [
          "local-floor"
        ],

        optionalFeatures: [
          "dom-overlay"
        ],

        domOverlay: {
          root: document.body
        }

      }

    )

  );


  addLights();

  addController();

  addBunny();

  addHUD();

  addStartButton();

  addKeypad();


  setHUD(

    "SILENT STUDY CHALLENGE",

    "PLAYER A: Find the hidden bunny.\n" +

    "PLAYER B: Solve the maths code.\n\n" +

    "Keep the study room quiet.\n" +

    "Aim at START GAME and press Trigger."

  );


  window.addEventListener(

    "resize",

    onWindowResize

  );


  renderer.setAnimationLoop(
    render
  );

}


/* =========================================================
   LIGHTING
========================================================= */

function addLights() {

  const hemi =
    new THREE.HemisphereLight(

      0xffffff,

      0x445047,

      1.8

    );


  scene.add(hemi);


  const light =
    new THREE.DirectionalLight(

      0xffffff,

      1.3

    );


  light.position.set(

    2,

    4,

    2

  );


  scene.add(light);

}


/* =========================================================
   QUEST CONTROLLER
========================================================= */

function addController() {

  controller =
    renderer.xr.getController(0);


  /*
     Trigger pressed
  */

  controller.addEventListener(

    "selectstart",

    async () => {


      /*
         START SCREEN
      */

      if (mode === "ready") {

        await trySelectStartButton();

        return;

      }


      /*
         FINDING BUNNY
      */

      if (mode === "searching") {

        trySelectBunny();

        return;

      }


      /*
         KEYPAD
      */

      if (mode === "keypad") {

        trySelectKeypadButton();

        return;

      }


      /*
         GAME FINISHED
      */

      if (mode === "finished") {

        trySelectRestartButton();

      }

    }

  );


  scene.add(controller);


  /*
     GREEN CONTROLLER RAY
  */

  const geometry =

    new THREE.BufferGeometry()

      .setFromPoints([

        new THREE.Vector3(
          0,
          0,
          0
        ),

        new THREE.Vector3(
          0,
          0,
          -1
        )

      ]);


  const material =

    new THREE.LineBasicMaterial({

      color: 0x7cffb2

    });


  const line =

    new THREE.Line(

      geometry,

      material

    );


  line.name =
    "controller-ray";


  /*
     6 metre ray
  */

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

    new THREE.Vector3(

      0,

      0,

      -1

    )

      .applyMatrix4(

        tempMatrix

      )

      .normalize();


  return {

    origin,

    direction

  };

}


/* =========================================================
   HAPTIC FEEDBACK
========================================================= */

function pulseController(

  intensity = 0.35,

  duration = 35

) {

  const session =
    renderer.xr.getSession();


  if (!session) return;


  for (

    const source
    of session.inputSources

  ) {

    const actuator =

      source.gamepad
        ?.hapticActuators
        ?.[0];


    if (

      actuator &&
      actuator.pulse

    ) {

      actuator

        .pulse(

          intensity,

          duration

        )

        .catch(
          () => {}
        );


      break;

    }

  }

}


/* =========================================================
   BUNNY
========================================================= */

function addBunny() {

  bunny =
    new THREE.Group();


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


  /* BODY */

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


  body.position.y =
    0.10;


  /* HEAD */

  const head =

    new THREE.Mesh(

      new THREE.SphereGeometry(

        0.085,

        32,

        32

      ),

      white

    );


  head.position.y =
    0.235;


  /* LEFT EAR */

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


  earL.rotation.z =
    0.18;


  /* RIGHT EAR */

  const earR =
    earL.clone();


  earR.position.x =
    0.038;


  earR.rotation.z =
    -0.18;


  /* EYES */

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


  const eyeR =
    eyeL.clone();


  eyeR.position.x =
    0.029;


  /* NOSE */

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


  /* CHEEKS */

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


  const cheekR =
    cheekL.clone();


  cheekR.position.x =
    0.048;


  /* FEET */

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


  const footR =
    footL.clone();


  footR.position.x =
    0.04;


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


  /*
     Small bunny
  */

  bunny.scale.set(

    0.8,

    0.8,

    0.8

  );


  bunny.visible =
    false;


  scene.add(bunny);

}


/* =========================================================
   START GAME BUTTON
========================================================= */

function addStartButton() {

  startButtonGroup =
    new THREE.Group();


  startButtonGroup.visible =
    true;


  const button =

    makeTextButton(

      "START GAME",

      {

        width: 0.52,

        height: 0.18,

        bg: "#3fa976",

        fg: "#ffffff"

      }

    );


  button.userData.action =
    "start";


  startButtonGroup.add(
    button
  );


  scene.add(
    startButtonGroup
  );

}


/* =========================================================
   CHANGE START BUTTON
========================================================= */

function setStartButtonLabel(

  label,

  action = "start"

) {

  scene.remove(
    startButtonGroup
  );


  startButtonGroup =
    new THREE.Group();


  const button =

    makeTextButton(

      label,

      {

        width: 0.52,

        height: 0.18,

        bg:
          action === "restart"
            ? "#456fb8"
            : "#3fa976",

        fg: "#ffffff"

      }

    );


  button.userData.action =
    action;


  startButtonGroup.add(
    button
  );


  startButtonGroup.visible =
    true;


  scene.add(
    startButtonGroup
  );

}


/* =========================================================
   TEXT BUTTON
========================================================= */

function makeTextButton(

  text,

  {
    width,
    height,
    bg,
    fg
  }

) {

  const canvas =

    document.createElement(
      "canvas"
    );


  canvas.width = 640;

  canvas.height = 220;


  const ctx =
    canvas.getContext("2d");


  ctx.fillStyle = bg;


  roundRect(

    ctx,

    6,

    6,

    628,

    208,

    42

  );


  ctx.fill();


  ctx.strokeStyle =
    "rgba(255,255,255,0.55)";


  ctx.lineWidth = 8;


  roundRect(

    ctx,

    10,

    10,

    620,

    200,

    38

  );


  ctx.stroke();


  ctx.fillStyle = fg;


  ctx.font =
    "bold 70px Arial";


  ctx.textAlign =
    "center";


  ctx.textBaseline =
    "middle";


  ctx.fillText(

    text,

    320,

    112

  );


  const texture =

    new THREE.CanvasTexture(
      canvas
    );


  const mesh =

    new THREE.Mesh(

      new THREE.PlaneGeometry(

        width,

        height

      ),

      new THREE.MeshBasicMaterial({

        map: texture,

        transparent: true,

        side: THREE.DoubleSide

      })

    );


  return mesh;

}


/* =========================================================
   CLICK START
========================================================= */

async function trySelectStartButton() {

  if (

    !startButtonGroup ||
    !startButtonGroup.visible ||
    mode !== "ready"

  ) {

    return;

  }


  const {
    origin,
    direction
  } =
    getControllerRay();


  raycaster.set(

    origin,

    direction

  );


  const hits =

    raycaster.intersectObjects(

      startButtonGroup.children,

      true

    );


  if (!hits.length) {

    return;

  }


  pulseController(

    0.45,

    45

  );


  startButtonGroup.visible =
    false;


  mode =
    "calibratingNoise";


  setHUD(

    "CHECKING ROOM NOISE",

    "Please keep quiet for 2 seconds.\n" +

    "Measuring the normal study-room background level..."

  );


  /*
     Request microphone +
     measure background noise.
  */

  const success =

    await prepareMicrophoneAndCalibrate();


  if (!success) {

    mode =
      "ready";


    startButtonGroup.visible =
      true;


    setHUD(

      "MICROPHONE REQUIRED",

      "Please allow microphone access.\n\n" +

      "The noise rule is part of this game.\n" +

      "Then press START GAME again."

    );


    return;

  }


  startMission();

}


/* =========================================================
   PLAY AGAIN
========================================================= */

function trySelectRestartButton() {

  if (

    !startButtonGroup ||
    !startButtonGroup.visible ||
    mode !== "finished"

  ) {

    return;

  }


  const {
    origin,
    direction
  } =
    getControllerRay();


  raycaster.set(

    origin,

    direction

  );


  const hits =

    raycaster.intersectObjects(

      startButtonGroup.children,

      true

    );


  if (!hits.length) return;


  pulseController(
    0.4,
    40
  );


  resetGame();

}


/* =========================================================
   START BUTTON POSITION
========================================================= */

function updateStartButtonPosition() {

  if (

    !startButtonGroup ||
    !startButtonGroup.visible

  ) {

    return;

  }


  if (

    mode !== "ready" &&
    mode !== "finished"

  ) {

    return;

  }


  const camPos =
    tempV3A;


  camera.getWorldPosition(
    camPos
  );


  const camDir =
    tempV3B;


  camera.getWorldDirection(
    camDir
  );


  const position =

    camPos

      .clone()

      .add(

        camDir.multiplyScalar(
          1.2
        )

      );


  /*
     Below HUD
  */

  position.y -=
    0.23;


  startButtonGroup.position.lerp(

    position,

    0.20

  );


  startButtonGroup.lookAt(
    camPos
  );

}


/* =========================================================
   MICROPHONE SETUP
========================================================= */

async function prepareMicrophoneAndCalibrate() {

  try {


    if (

      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia

    ) {

      return false;

    }


    /*
       Ask Quest Browser for
       microphone permission.
    */

    if (!micStream) {

      micStream =

        await navigator.mediaDevices

          .getUserMedia({

            audio: {

              echoCancellation:
                false,

              noiseSuppression:
                false,

              autoGainControl:
                false

            },

            video: false

          });

    }


    /*
       Web Audio API
    */

    if (!audioContext) {

      const AudioCtx =

        window.AudioContext ||

        window.webkitAudioContext;


      audioContext =
        new AudioCtx();

    }


    if (

      audioContext.state ===
      "suspended"

    ) {

      await audioContext.resume();

    }


    const source =

      audioContext

        .createMediaStreamSource(
          micStream
        );


    analyser =

      audioContext
        .createAnalyser();


    analyser.fftSize =
      2048;


    analyser.smoothingTimeConstant =
      0.25;


    source.connect(
      analyser
    );


    audioBuffer =

      new Float32Array(

        analyser.fftSize

      );


    /*
       Measure normal study-room
       sound for 2 seconds.
    */

    const samples = [];


    const start =
      performance.now();


    while (

      performance.now() -
      start <
      2000

    ) {


      const db =
        readNoiseDbfs();


      if (

        Number.isFinite(db)

      ) {

        samples.push(db);

      }


      await wait(70);

    }


    if (!samples.length) {

      return false;

    }


    /*
       Median baseline.
    */

    samples.sort(

      (a, b) =>
        a - b

    );


    baselineNoiseDbfs =

      samples[

        Math.floor(

          samples.length /
          2

        )

      ];


    /*
       Adaptive thresholds.

       Quiet room:
       background + 8dB → warning

       background + 14dB → danger

       Clamps prevent impossible
       sensitivity values.
    */

    warningNoiseDbfs =

      THREE.MathUtils.clamp(

        baselineNoiseDbfs + 8,

        -42,

        -26

      );


    failNoiseDbfs =

      THREE.MathUtils.clamp(

        baselineNoiseDbfs + 14,

        -35,

        -20

      );


    noiseOverLimitMs = 0;


    lastNoiseUpdate =
      performance.now();


    console.log(

      "Noise baseline:",

      baselineNoiseDbfs,

      "Warning:",

      warningNoiseDbfs,

      "Fail:",

      failNoiseDbfs

    );


    return true;


  } catch (error) {


    console.error(

      "Microphone setup failed:",

      error

    );


    return false;

  }

}


/* =========================================================
   READ MICROPHONE LEVEL
========================================================= */

function readNoiseDbfs() {

  if (

    !analyser ||
    !audioBuffer

  ) {

    return -80;

  }


  analyser.getFloatTimeDomainData(
    audioBuffer
  );


  let sumSquares = 0;


  for (

    let i = 0;

    i < audioBuffer.length;

    i++

  ) {

    sumSquares +=

      audioBuffer[i] *
      audioBuffer[i];

  }


  const rms =

    Math.sqrt(

      sumSquares /

      audioBuffer.length

    );


  if (

    rms <= 0.000001

  ) {

    return -80;

  }


  /*
     dBFS
  */

  return Math.max(

    -80,

    20 *
    Math.log10(rms)

  );

}


/* =========================================================
   UPDATE NOISE
========================================================= */

function updateNoiseMonitor() {

  if (

    mode !== "searching" &&
    mode !== "keypad"

  ) {

    return;

  }


  if (

    !analyser ||
    gameFinished

  ) {

    return;

  }


  const now =
    performance.now();


  const deltaTime =

    now -
    lastNoiseUpdate;


  lastNoiseUpdate =
    now;


  currentNoiseDbfs =
    readNoiseDbfs();


  /*
     Loud continuously
  */

  if (

    currentNoiseDbfs >=
    failNoiseDbfs

  ) {

    noiseOverLimitMs +=
      deltaTime;

  } else {


    /*
       Slowly recover.
    */

    noiseOverLimitMs =

      Math.max(

        0,

        noiseOverLimitMs -
        deltaTime * 1.4

      );

  }


  /*
     TOO LOUD FOR 1.5 SEC
  */

  if (

    noiseOverLimitMs >=
    NOISE_FAIL_HOLD_MS

  ) {


    finishGame(

      false,

      "TOO LOUD!",

      "MISSION FAILED\n" +

      "You disturbed the study room."

    );

  }

}


/* =========================================================
   NOISE STATUS
========================================================= */

function getNoiseStatus() {

  if (!analyser) {

    return "MIC OFF";

  }


  if (

    currentNoiseDbfs >=
    failNoiseDbfs

  ) {

    return "DANGER";

  }


  if (

    currentNoiseDbfs >=
    warningNoiseDbfs

  ) {

    return "WARNING";

  }


  return "QUIET";

}


/* =========================================================
   HUD NOISE
========================================================= */

function noiseHudLine() {

  return (

    "NOISE     " +

    currentNoiseDbfs.toFixed(0) +

    " dBFS  " +

    getNoiseStatus()

  );

}


/* =========================================================
   WAIT
========================================================= */

function wait(ms) {

  return new Promise(

    resolve =>
      setTimeout(
        resolve,
        ms
      )

  );

}


/* =========================================================
   START MISSION
========================================================= */

function startMission() {

  mode =
    "searching";


  gameFinished =
    false;


  enteredCode =
    "";


  timeLeft =
    60;


  lastTimerUpdate =
    performance.now();


  lastNoiseUpdate =
    performance.now();


  noiseOverLimitMs =
    0;


  keypadGroup.visible =
    false;


  /*
     SYSTEM HIDES BUNNY.

     PLAYER A DOES NOT
     CHOOSE THE POSITION.
  */

  chooseRandomBunnyPosition();


  bunny.visible =
    false;


  setHUD(

    "PLAYER A — FIND THE BUNNY",

    "TIME      60 s\n" +

    "DISTANCE  calculating...\n" +

    "DIRECTION calculating...\n" +

    noiseHudLine() +

    "\n\n" +

    "Follow the clues.\n" +

    "Player B solves the code now."

  );

}


/* =========================================================
   AUTOMATIC RANDOM BUNNY POSITION
========================================================= */

function chooseRandomBunnyPosition() {

  const playerPos =

    new THREE.Vector3();


  camera.getWorldPosition(
    playerPos
  );


  /*
     Completely random direction
     around Player A.
  */

  const angle =

    THREE.MathUtils.randFloat(

      -Math.PI,

      Math.PI

    );


  const distance =

    THREE.MathUtils.randFloat(

      MIN_TARGET_DISTANCE,

      MAX_TARGET_DISTANCE

    );


  const x =

    playerPos.x +

    Math.sin(angle) *
    distance;


  const z =

    playerPos.z -

    Math.cos(angle) *
    distance;


  /*
     local-floor means y≈0
     represents physical floor.

     Bunny is therefore placed
     near the floor rather than
     floating in mid-air.
  */

  const y =
    0.02;


  bunny.position.set(

    x,

    y,

    z

  );


  faceBunnyToUser();


  console.log(

    "System-selected bunny:",

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


  updateNoiseMonitor();


  if (gameFinished) {

    return;

  }


  const playerPos =

    new THREE.Vector3();


  camera.getWorldPosition(
    playerPos
  );


  const bunnyPos =

    new THREE.Vector3();


  bunny.getWorldPosition(
    bunnyPos
  );


  const distance =

    playerPos.distanceTo(
      bunnyPos
    );


  const direction =

    getDirectionHint(

      playerPos,

      bunnyPos

    );


  /*
     CLOSE ENOUGH:
     REVEAL BUNNY
  */

  if (

    distance <=
    REVEAL_DISTANCE

  ) {


    bunny.visible =
      true;


    setHUD(

      "BUNNY FOUND!",

      "TIME      " +
      timeLeft +
      " s\n" +

      "DISTANCE  " +
      distance.toFixed(1) +
      " m\n" +

      noiseHudLine() +

      "\n\n" +

      "Aim at the bunny.\n" +

      "Press Trigger to unlock it.\n" +

      "You will need Player B's code."

    );


    return;

  }


  bunny.visible =
    false;


  let timeWarning =
    "";


  if (

    timeLeft <= 10

  ) {

    timeWarning =

      "\nHURRY — only a few seconds left!";

  } else if (

    timeLeft <= 20

  ) {

    timeWarning =

      "\nTime is running out.";

  }


  let noiseWarning =
    "";


  if (

    currentNoiseDbfs >=
    warningNoiseDbfs

  ) {

    noiseWarning =

      "\nKEEP QUIET — noise is too high!";

  }


  setHUD(

    "PLAYER A — FIND THE BUNNY",

    "TIME      " +
    timeLeft +
    " s\n" +

    "DISTANCE  " +
    distance.toFixed(1) +
    " m\n" +

    "DIRECTION " +
    direction +
    "\n" +

    noiseHudLine() +

    "\n\nFollow the clues." +

    timeWarning +

    noiseWarning

  );

}


/* =========================================================
   TIMER
========================================================= */

function updateTimer() {

  if (gameFinished) {

    return;

  }


  const now =
    performance.now();


  if (

    now -
    lastTimerUpdate >=
    1000

  ) {


    const secondsPassed =

      Math.floor(

        (
          now -
          lastTimerUpdate
        ) /

        1000

      );


    timeLeft -=
      secondsPassed;


    lastTimerUpdate +=

      secondsPassed *
      1000;

  }


  if (

    timeLeft <= 0

  ) {


    timeLeft = 0;


    finishGame(

      false,

      "TIME'S UP!",

      "MISSION FAILED\n" +

      "The team did not unlock the bunny in time."

    );

  }

}


/* =========================================================
   DIRECTION HINT
========================================================= */

function getDirectionHint(

  cameraPos,

  targetPos

) {

  const toTarget =

    targetPos

      .clone()

      .sub(
        cameraPos
      );


  /*
     Ignore height because
     bunny is floor based.
  */

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

    toTarget.dot(
      forward
    );


  const rightAmount =

    toTarget.dot(
      right
    );


  if (

    forwardAmount > 0.72

  ) {

    return "FORWARD";

  }


  if (

    forwardAmount < -0.72

  ) {

    return "BEHIND";

  }


  if (

    rightAmount > 0.2

  ) {

    return "RIGHT";

  }


  if (

    rightAmount < -0.2

  ) {

    return "LEFT";

  }


  return "NEARBY";

}


/* =========================================================
   CLICK BUNNY
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

  } =
    getControllerRay();


  raycaster.set(

    origin,

    direction

  );


  const hits =

    raycaster.intersectObject(

      bunny,

      true

    );


  if (

    hits.length > 0

  ) {


    pulseController(

      0.5,

      45

    );


    openKeypad();

  }

}


/* =========================================================
   SMALL VR KEYPAD
========================================================= */

function addKeypad() {

  keypadGroup =
    new THREE.Group();


  keypadGroup.visible =
    false;


  /*
     SMALLER BACKGROUND
  */

  const panel =

    new THREE.Mesh(

      new THREE.PlaneGeometry(

        0.58,

        0.72

      ),

      new THREE.MeshBasicMaterial({

        color: 0x101827,

        transparent: true,

        opacity: 0.90,

        side: THREE.DoubleSide

      })

    );


  panel.position.z =
    -0.025;


  keypadGroup.add(
    panel
  );


  const labels = [

    "1",
    "2",
    "3",

    "4",
    "5",
    "6",

    "7",
    "8",
    "9",

    "CLR",
    "0",
    "OK"

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

        -0.18 +

        col *
        0.18;


      const y =

        0.20 -

        row *
        0.155;


      keypadGroup.add(

        createKeyButton(

          label,

          x,

          y

        )

      );

    }

  );


  scene.add(
    keypadGroup
  );

}


/* =========================================================
   KEYPAD BUTTON
========================================================= */

function createKeyButton(

  label,

  x,

  y

) {

  const group =
    new THREE.Group();


  const canvas =

    document.createElement(
      "canvas"
    );


  canvas.width =
    320;


  canvas.height =
    220;


  const ctx =
    canvas.getContext("2d");


  /*
     BUTTON COLOUR
  */

  if (

    label === "OK"

  ) {

    ctx.fillStyle =
      "#43a877";

  } else if (

    label === "CLR"

  ) {

    ctx.fillStyle =
      "#a64f5e";

  } else {

    ctx.fillStyle =
      "#f6f4ef";

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


  if (

    label === "OK" ||
    label === "CLR"

  ) {

    ctx.fillStyle =
      "#ffffff";

  } else {

    ctx.fillStyle =
      "#172033";

  }


  /*
     Smaller text for CLR/OK
  */

  ctx.font =

    label.length > 1

      ? "bold 62px Arial"

      : "bold 86px Arial";


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


  /*
     VISIBLE BUTTON
  */

  const visual =

    new THREE.Mesh(

      new THREE.PlaneGeometry(

        0.135,

        0.095

      ),

      new THREE.MeshBasicMaterial({

        map: texture,

        transparent: true,

        side: THREE.DoubleSide

      })

    );


  visual.position.z =
    0.012;


  group.add(
    visual
  );


  /*
     INVISIBLE BIGGER HIT BOX

     Makes Quest controller
     much easier to use.
  */

  const hitArea =

    new THREE.Mesh(

      new THREE.PlaneGeometry(

        0.165,

        0.125

      ),

      new THREE.MeshBasicMaterial({

        transparent: true,

        opacity: 0,

        side: THREE.DoubleSide

      })

    );


  hitArea.userData.keypadValue =
    label;


  hitArea.position.z =
    0.025;


  group.add(
    hitArea
  );


  group.position.set(

    x,

    y,

    0.01

  );


  return group;

}


/* =========================================================
   OPEN KEYPAD
========================================================= */

function openKeypad() {

  mode =
    "keypad";


  enteredCode =
    "";


  lastKeyPressTime =
    0;


  bunny.visible =
    true;


  const camPos =

    new THREE.Vector3();


  const camDir =

    new THREE.Vector3();


  camera.getWorldPosition(
    camPos
  );


  camera.getWorldDirection(
    camDir
  );


  /*
     Put keypad about 1.1m
     in front of Player A.
  */

  const keypadPosition =

    camPos

      .clone()

      .add(

        camDir
          .clone()
          .multiplyScalar(
            1.10
          )

      );


  /*
     Move downward.
  */

  keypadPosition.y -=
    0.28;


  /*
     Move to right side of
     Player A's vision.
  */

  const right =

    new THREE.Vector3()

      .crossVectors(

        camDir,

        new THREE.Vector3(

          0,

          1,

          0

        )

      )

      .normalize();


  keypadPosition.add(

    right.multiplyScalar(
      0.30
    )

  );


  keypadGroup.position.copy(
    keypadPosition
  );


  keypadGroup.lookAt(
    camPos
  );


  keypadGroup.visible =
    true;


  setHUD(

    "BUNNY LOCKED",

    "TIME      " +
    timeLeft +
    " s\n" +

    "CODE      ---\n" +

    noiseHudLine() +

    "\n\n" +

    "Ask Player B for the 3-digit code."

  );

}


/* =========================================================
   KEYPAD CLICK
========================================================= */

function trySelectKeypadButton() {

  if (

    mode !== "keypad" ||
    !keypadGroup.visible ||
    gameFinished

  ) {

    return;

  }


  const now =
    performance.now();


  /*
     Prevent accidental
     duplicate button presses.
  */

  if (

    now -
    lastKeyPressTime <
    KEY_PRESS_COOLDOWN

  ) {

    return;

  }


  updateTimer();


  updateNoiseMonitor();


  if (gameFinished) {

    return;

  }


  const {

    origin,

    direction

  } =
    getControllerRay();


  raycaster.set(

    origin,

    direction

  );


  const hits =

    raycaster.intersectObjects(

      keypadGroup.children,

      true

    );


  /*
     Find the invisible
     clickable hit box.
  */

  const hit =

    hits.find(

      item =>

        item.object
          .userData
          .keypadValue !==
        undefined

    );


  if (!hit) {

    return;

  }


  lastKeyPressTime =
    now;


  pulseController(

    0.28,

    28

  );


  handleKeypadValue(

    hit.object
      .userData
      .keypadValue

  );

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

  if (

    value === "CLR"

  ) {


    enteredCode =
      "";


    updateKeypadHUD();


    return;

  }


  /*
     OK
  */

  if (

    value === "OK"

  ) {


    if (

      enteredCode ===
      CORRECT_CODE

    ) {


      finishGame(

        true,

        "MISSION COMPLETE!",

        "CODE 386 ACCEPTED\n" +

        "PLAYER A + PLAYER B WIN TOGETHER!"

      );


      return;

    }


    /*
       WRONG CODE
       -5 seconds
    */

    enteredCode =
      "";


    timeLeft =

      Math.max(

        0,

        timeLeft - 5

      );


    if (

      timeLeft <= 0

    ) {


      finishGame(

        false,

        "TIME'S UP!",

        "MISSION FAILED\n" +

        "Wrong code used the remaining time."

      );


      return;

    }


    setHUD(

      "WRONG CODE!",

      "-5 SECOND PENALTY\n" +

      "TIME      " +
      timeLeft +
      " s\n" +

      "CODE      ---\n" +

      noiseHudLine() +

      "\n\n" +

      "Ask Player B to check the maths."

    );


    return;

  }


  /*
     NUMBER
  */

  if (

    enteredCode.length < 3

  ) {


    enteredCode +=
      value;

  }


  updateKeypadHUD();

}


/* =========================================================
   KEYPAD HUD
========================================================= */

function updateKeypadHUD() {

  const codeDisplay =

    enteredCode.padEnd(

      3,

      "-"

    );


  setHUD(

    "BUNNY LOCKED",

    "TIME      " +
    timeLeft +
    " s\n" +

    "CODE      " +
    codeDisplay +
    "\n" +

    noiseHudLine() +

    "\n\n" +

    "Enter 3 digits, then press OK."

  );

}


/* =========================================================
   GAME FINISH
========================================================= */

function finishGame(

  win,

  title,

  message

) {

  gameFinished =
    true;


  mode =
    "finished";


  keypadGroup.visible =
    false;


  bunny.visible =
    true;


  /*
     Change bunny colour
     after win / fail.
  */

  bunny.traverse(

    child => {


      if (

        child.isMesh &&
        child.material &&
        child.material.color

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

    message +

    "\n\nAim at PLAY AGAIN to restart."

  );


  setStartButtonLabel(

    "PLAY AGAIN",

    "restart"

  );

}


/* =========================================================
   RESET GAME
========================================================= */

function resetGame() {

  gameFinished =
    false;


  mode =
    "ready";


  enteredCode =
    "";


  timeLeft =
    60;


  noiseOverLimitMs =
    0;


  bunny.visible =
    false;


  keypadGroup.visible =
    false;


  /*
     Restore bunny white.
  */

  bunny.traverse(

    child => {


      if (

        child.isMesh &&
        child.material &&
        child.material.color

      ) {


        const hex =

          child.material
            .color
            .getHex();


        if (

          hex === 0x8ee6aa ||
          hex === 0x9cb8ff

        ) {


          child.material
            .color
            .set(
              0xffffff
            );

        }

      }

    }

  );


  setStartButtonLabel(

    "START GAME",

    "start"

  );


  setHUD(

    "SILENT STUDY CHALLENGE",

    "PLAYER A: Find the hidden bunny.\n" +

    "PLAYER B: Solve the maths code.\n\n" +

    "Keep the study room quiet.\n" +

    "Aim at START GAME and press Trigger."

  );

}


/* =========================================================
   FACE BUNNY TO PLAYER
========================================================= */

function faceBunnyToUser() {

  const camPos =

    new THREE.Vector3();


  camera.getWorldPosition(
    camPos
  );


  bunny.lookAt(
    camPos
  );


  bunny.rotation.x =
    0;


  bunny.rotation.z =
    0;

}


/* =========================================================
   HUD
========================================================= */

function addHUD() {

  const canvas =

    document.createElement(
      "canvas"
    );


  canvas.width =
    900;


  canvas.height =
    500;


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
     Smaller HUD
  */

  hudPanel =

    new THREE.Mesh(

      new THREE.PlaneGeometry(

        0.78,

        0.43

      ),

      material

    );


  hudPanel.userData.canvas =
    canvas;


  hudPanel.userData.texture =
    texture;


  scene.add(
    hudPanel
  );

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
     BACKGROUND
  */

  ctx.fillStyle =
    "rgba(13, 20, 33, 0.78)";


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
     BORDER
  */

  ctx.strokeStyle =
    "rgba(124,255,178,0.72)";


  ctx.lineWidth =
    6;


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
     TITLE
  */

  ctx.fillStyle =
    "#9fffc3";


  ctx.font =
    "bold 44px Arial";


  ctx.textAlign =
    "left";


  ctx.textBaseline =
    "alphabetic";


  ctx.fillText(

    title,

    36,

    66

  );


  /*
     BODY
  */

  ctx.fillStyle =
    "#ffffff";


  ctx.font =
    "28px Arial";


  body

    .split("\n")

    .forEach(

      (line, index) => {


        ctx.fillText(

          line,

          36,

          120 +
          index * 41

        );

      }

    );


  hudPanel
    .userData
    .texture
    .needsUpdate =
    true;

}


/* =========================================================
   HUD POSITION
========================================================= */

function updateHUDPosition() {

  if (!hudPanel) {

    return;

  }


  const camPos =

    new THREE.Vector3();


  const camDir =

    new THREE.Vector3();


  camera.getWorldPosition(
    camPos
  );


  camera.getWorldDirection(
    camDir
  );


  /*
     Calculate player-relative
     right direction.
  */

  const right =

    new THREE.Vector3()

      .crossVectors(

        camDir,

        new THREE.Vector3(

          0,

          1,

          0

        )

      )

      .normalize();


  /*
     In front of Player A.
  */

  const target =

    camPos

      .clone()

      .add(

        camDir

          .clone()

          .multiplyScalar(
            1.42
          )

      );


  /*
     Move LEFT.
  */

  target.add(

    right.multiplyScalar(
      -0.43
    )

  );


  /*
     Move UP.
  */

  target.y +=
    0.28;


  hudPanel.position.lerp(

    target,

    0.20

  );


  hudPanel.lookAt(
    camPos
  );

}


/* =========================================================
   RENDER
========================================================= */

function render() {


  /*
     SEARCH MODE
  */

  if (

    mode === "searching"

  ) {

    updateSearchGame();

  }


  /*
     KEYPAD MODE
  */

  if (

    mode === "keypad"

  ) {


    updateTimer();


    updateNoiseMonitor();


    /*
       Continuously display
       live time + noise.
    */

    if (!gameFinished) {

      updateKeypadHUD();

    }

  }


  updateStartButtonPosition();


  updateHUDPosition();


  renderer.render(

    scene,

    camera

  );

}


/* =========================================================
   ROUND RECT
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