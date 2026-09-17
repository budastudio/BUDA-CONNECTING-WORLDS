/**
 * ============================================================================
 * BUDA STUDIO — CONNECTING WORLDS
 * ----------------------------------------------------------------------------
 * First functional version: load a Blender-authored GLB gallery and let the
 * user walk through it in first person.
 *
 * This file is organized into clearly commented sections instead of one
 * giant function:
 *
 *   1. Config
 *   2. Scene / Camera / Renderer
 *   3. Lights
 *   4. Gallery loader (GLTF) + model analysis
 *   5. Input (keyboard + pointer lock)
 *   6. Navigation (movement, look, provisional collision)
 *   7. Debug overlay
 *   8. Resize
 *   9. Animation loop
 *
 * Nothing here is final. This build exists to discover how the Blender
 * export behaves in Three.js (scale, materials, lighting, performance)
 * before designing the real experience (portals, artworks, other worlds).
 * ============================================================================
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/* ============================================================================
 * 1. CONFIG
 * ========================================================================== */

const CONFIG = {
  modelUrl: "/models/2GALERIADUPLACHACKRAS.glb",

  // Human eye height in meters. Assumes the GLB was exported from Blender
  // using meters as the unit scale (Blender's default). If the gallery feels
  // gigantic or tiny, the export scale is almost certainly the cause —
  // check the "Size" log printed after loading.
  eyeHeight: 1.65,

  // Movement speed in meters/second.
  walkSpeed: 2.2,
  runMultiplier: 2.2,

  // How quickly velocity approaches the target velocity (higher = snappier,
  // lower = floatier). This is the "damping" requested: enough smoothing to
  // avoid jitter, not so much that movement feels weightless.
  moveDamping: 12,

  // Mouse look sensitivity.
  lookSensitivity: 0.0022,

  // Camera
  fov: 70,
  near: 0.05,
  far: 500,

  // Background / fog
  backgroundColor: 0x050505,
  fogColor: 0x050505,
  fogDensity: 0.008, // subtle — mostly to soften far clipping, not to obscure

  // Provisional bounding-box "keep the visitor inside" margin, in meters.
  boundsMargin: 0.3,
};

/* ============================================================================
 * 2. SCENE / CAMERA / RENDERER
 * ========================================================================== */

const canvas = document.getElementById("scene");

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.backgroundColor);
scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity);

const camera = new THREE.PerspectiveCamera(
  CONFIG.fov,
  window.innerWidth / window.innerHeight,
  CONFIG.near,
  CONFIG.far
);
// Placed properly once the gallery has loaded and we know its real bounds.
camera.position.set(0, CONFIG.eyeHeight, 0);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// Respect the original Blender/GLB materials as closely as possible.
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
// NOTE: if the gallery looks washed out or too dark compared to Blender's
// render, this is the first place to adjust (toneMapping / exposure), and
// the second place is each material's own color-space assumptions —
// GLTFLoader sets those automatically for most exported PBR materials.

// Shadows are off by default. Turn on only if a specific light truly needs
// to cast one — most galleries read fine with baked/ambient lighting alone.
renderer.shadowMap.enabled = false;

/* ============================================================================
 * 3. LIGHTS
 * ----------------------------------------------------------------------------
 * Dark, elegant, contemporary-gallery lighting — just enough to evaluate the
 * architecture. This is a starting point, not the final mood.
 * ========================================================================== */

const hemiLight = new THREE.HemisphereLight(0x8899aa, 0x0a0a0a, 0.6);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(5, 10, 3);
dirLight.castShadow = false; // enable later if a specific surface needs it
scene.add(dirLight);

// Two very subtle fill points, repositioned once we know the gallery size.
const fillLightA = new THREE.PointLight(0xffffff, 0.25, 0, 2);
const fillLightB = new THREE.PointLight(0xffffff, 0.25, 0, 2);
scene.add(fillLightA, fillLightB);

/* ============================================================================
 * 4. GALLERY LOADER (GLTF) + MODEL ANALYSIS
 * ========================================================================== */

const loadingScreen = document.getElementById("loading-screen");
const loadingPercentEl = document.getElementById("loading-percent");

let gallery = null; // root Object3D of the loaded GLB
let galleryBox = new THREE.Box3();
let gallerySize = new THREE.Vector3();
let galleryCenter = new THREE.Vector3();

const loader = new GLTFLoader();

loader.load(
  CONFIG.modelUrl,
  onGalleryLoaded,
  onGalleryProgress,
  onGalleryError
);

function onGalleryProgress(event) {
  if (!event.lengthComputable) return;
  const percent = Math.round((event.loaded / event.total) * 100);
  loadingPercentEl.textContent = `${percent}%`;
}

function onGalleryError(error) {
  console.error("[BUDA] Failed to load gallery GLB:", error);
  loadingPercentEl.textContent = "ERROR — see console";
}

function onGalleryLoaded(gltf) {
  gallery = gltf.scene;

  // We deliberately do NOT touch materials here. Respect whatever Blender
  // exported. If something looks wrong (a fully black material, a texture
  // that failed to embed, double-sided faces missing, etc.) leave it as-is
  // for now and note it — see the per-mesh console log below.
  scene.add(gallery);

  analyzeGallery(gallery);
  positionCameraForGallery();
  positionFillLights();
  revealDebugPanel();
  hideLoadingScreen();
}

/**
 * Walks the loaded scene graph once to gather the numbers requested for
 * the console + on-screen debug readout. This does not mutate the model.
 */
function analyzeGallery(root) {
  galleryBox.setFromObject(root);
  galleryBox.getSize(gallerySize);
  galleryBox.getCenter(galleryCenter);

  let meshCount = 0;
  let triangleCount = 0;
  const materialSet = new Set();

  root.traverse((node) => {
    if (!node.isMesh) return;

    meshCount++;

    const geometry = node.geometry;
    if (geometry) {
      if (geometry.index) {
        triangleCount += geometry.index.count / 3;
      } else if (geometry.attributes && geometry.attributes.position) {
        triangleCount += geometry.attributes.position.count / 3;
      }
    }

    const mats = Array.isArray(node.material) ? node.material : [node.material];
    mats.forEach((m) => m && materialSet.add(m));

    // Per-mesh debug log, as requested.
    const materialNames = mats.map((m) => (m ? m.name || "(unnamed)" : "none")).join(", ");
    console.log(`MESH: ${node.name || "(unnamed)"}`);
    console.log(`MATERIAL: ${materialNames}`);
  });

  triangleCount = Math.round(triangleCount);

  console.log("GALLERY LOADED");
  console.log("Size:", gallerySize);
  console.log("Center:", galleryCenter);
  console.log("Meshes:", meshCount);
  console.log("Approx triangles:", triangleCount);
  console.log("Materials:", materialSet.size);

  console.log("[BUDA] Gallery loaded");
  console.log("[BUDA] Bounds", galleryBox);
  console.log("[BUDA] Size", gallerySize);
  console.log("[BUDA] Center", galleryCenter);
  console.log("[BUDA] Mesh count", meshCount);
  console.log("[BUDA] Triangle count", triangleCount);
  console.log("[BUDA] Material count", materialSet.size);

  debugState.meshes = meshCount;
  debugState.triangles = triangleCount;
  debugState.size = gallerySize.clone();
}

/**
 * Places the camera at a reasonable starting point based on the GLB's
 * actual measured bounds — we never assume a fixed scale.
 */
function positionCameraForGallery() {
  // Start near the center of the gallery footprint, at human eye height
  // above the lowest point of the model (assumed to be the floor).
  const floorY = galleryBox.min.y;

  player.position.set(galleryCenter.x, floorY + CONFIG.eyeHeight, galleryCenter.z);
  camera.position.copy(player.position);

  // Look toward the center of the gallery volume (slightly ahead, not just
  // at the geometric center point, which could be inside a wall).
  const lookTarget = new THREE.Vector3(
    galleryCenter.x,
    player.position.y,
    galleryBox.max.z
  );
  camera.lookAt(lookTarget);

  // Derive initial yaw/pitch from the lookAt so mouse-look continues smoothly
  // from wherever the camera actually ended up facing.
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  yaw = Math.atan2(forward.x, forward.z) * -1;
  pitch = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
}

function positionFillLights() {
  // Two subtle points placed at roughly 3/4 height, offset across the
  // gallery footprint — enough to break up flatness without overpowering
  // the directional light.
  const y = galleryBox.min.y + gallerySize.y * 0.75;
  fillLightA.position.set(
    galleryCenter.x - gallerySize.x * 0.25,
    y,
    galleryCenter.z - gallerySize.z * 0.25
  );
  fillLightB.position.set(
    galleryCenter.x + gallerySize.x * 0.25,
    y,
    galleryCenter.z + gallerySize.z * 0.25
  );
}

function hideLoadingScreen() {
  loadingScreen.classList.add("hidden");
}

/* ============================================================================
 * 5. INPUT (keyboard + pointer lock)
 * ========================================================================== */

const keys = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  run: false,
};

const crosshair = document.getElementById("crosshair");
const controlsHint = document.getElementById("controls-hint");

let yaw = 0; // rotation around Y axis (left/right)
let pitch = 0; // rotation around X axis (up/down), clamped to avoid flipping

const PITCH_LIMIT = Math.PI / 2 - 0.05;

function onKeyDown(event) {
  setKeyState(event.code, true);
}

function onKeyUp(event) {
  setKeyState(event.code, false);
}

function setKeyState(code, isDown) {
  switch (code) {
    case "KeyW":
    case "ArrowUp":
      keys.forward = isDown;
      break;
    case "KeyS":
    case "ArrowDown":
      keys.backward = isDown;
      break;
    case "KeyA":
    case "ArrowLeft":
      keys.left = isDown;
      break;
    case "KeyD":
    case "ArrowRight":
      keys.right = isDown;
      break;
    case "ShiftLeft":
    case "ShiftRight":
      keys.run = isDown;
      break;
  }
}

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

// --- Pointer Lock -----------------------------------------------------------

canvas.addEventListener("click", () => {
  canvas.requestPointerLock();
});

document.addEventListener("pointerlockchange", () => {
  const isLocked = document.pointerLockElement === canvas;
  document.body.classList.toggle("locked", isLocked);
  crosshair.hidden = !isLocked;
  controlsHint.style.pointerEvents = "none";

  if (isLocked) {
    document.addEventListener("mousemove", onMouseMove);
  } else {
    document.removeEventListener("mousemove", onMouseMove);
  }
});

function onMouseMove(event) {
  yaw -= event.movementX * CONFIG.lookSensitivity;
  pitch -= event.movementY * CONFIG.lookSensitivity;
  pitch = THREE.MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
}

/* ============================================================================
 * 6. NAVIGATION (movement + provisional collision)
 * ----------------------------------------------------------------------------
 * IMPORTANT: the bounding-box check below is only a placeholder so the
 * visitor doesn't wander out of the whole gallery volume. It is NOT real
 * architectural collision (it knows nothing about walls, columns, doors,
 * or individual floors). Proper colliders come later.
 * ========================================================================== */

const player = new THREE.Object3D();
const velocity = new THREE.Vector3();

const clock = new THREE.Clock();

// Reused objects to avoid per-frame allocations.
const moveDirection = new THREE.Vector3();
const forwardVector = new THREE.Vector3();
const rightVector = new THREE.Vector3();
const downRaycaster = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);

function updateNavigation(delta) {
  // --- Look ---
  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  // --- Movement input, relative to look direction (flattened to XZ) ---
  forwardVector.set(Math.sin(yaw), 0, Math.cos(yaw));
  rightVector.set(forwardVector.z, 0, -forwardVector.x);

  moveDirection.set(0, 0, 0);
  if (keys.forward) moveDirection.add(forwardVector);
  if (keys.backward) moveDirection.sub(forwardVector);
  if (keys.right) moveDirection.add(rightVector);
  if (keys.left) moveDirection.sub(rightVector);

  if (moveDirection.lengthSq() > 0) {
    moveDirection.normalize();
  }

  const speed = CONFIG.walkSpeed * (keys.run ? CONFIG.runMultiplier : 1);
  const targetVelocityX = moveDirection.x * speed;
  const targetVelocityZ = moveDirection.z * speed;

  // Damping: ease current velocity toward target velocity instead of
  // snapping, so movement feels smooth without feeling weightless.
  const damp = 1 - Math.exp(-CONFIG.moveDamping * delta);
  velocity.x += (targetVelocityX - velocity.x) * damp;
  velocity.z += (targetVelocityZ - velocity.z) * damp;

  player.position.x += velocity.x * delta;
  player.position.z += velocity.z * delta;

  // --- Provisional horizontal bounds (see comment above) ---
  if (gallery) {
    const margin = CONFIG.boundsMargin;
    player.position.x = THREE.MathUtils.clamp(
      player.position.x,
      galleryBox.min.x + margin,
      galleryBox.max.x - margin
    );
    player.position.z = THREE.MathUtils.clamp(
      player.position.z,
      galleryBox.min.z + margin,
      galleryBox.max.z - margin
    );

    // --- Provisional "floor follow" ---
    // This gallery is a duplex (two levels), so a single fixed eye height
    // is not enough. We cast a ray straight down from above the player and
    // rest the eye height on whatever surface it hits, which lets walking
    // up/down between the two levels work without a real collider system.
    // If no surface is hit (e.g. the visitor is over a void/opening), we
    // fall back to the last known floor height.
    downRaycaster.set(
      new THREE.Vector3(player.position.x, galleryBox.max.y + 5, player.position.z),
      DOWN
    );
    const hits = downRaycaster.intersectObject(gallery, true);
    if (hits.length > 0) {
      const floorY = hits[0].point.y;
      const targetY = floorY + CONFIG.eyeHeight;
      // Smooth vertical transitions (e.g. stepping onto a stair) instead of
      // snapping the camera.
      player.position.y += (targetY - player.position.y) * Math.min(1, delta * 10);
    }
  }

  camera.position.copy(player.position);
}

/* ============================================================================
 * 7. DEBUG OVERLAY
 * ========================================================================== */

const debugEl = document.getElementById("debug");
const debugMeshesEl = document.getElementById("debug-meshes");
const debugTrianglesEl = document.getElementById("debug-triangles");
const debugSizeEl = document.getElementById("debug-size");

const debugState = {
  meshes: 0,
  triangles: 0,
  size: new THREE.Vector3(),
};

function revealDebugPanel() {
  debugEl.hidden = false;
  updateDebugPanel();
}

function updateDebugPanel() {
  debugMeshesEl.textContent = `MESHES: ${debugState.meshes}`;
  debugTrianglesEl.textContent = `TRIANGLES: ${debugState.triangles}`;
  debugSizeEl.textContent = `SIZE: ${debugState.size.x.toFixed(1)} × ${debugState.size.y.toFixed(
    1
  )} × ${debugState.size.z.toFixed(1)} m`;
}

/* ============================================================================
 * 8. RESIZE
 * ========================================================================== */

window.addEventListener("resize", onWindowResize);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ============================================================================
 * 9. ANIMATION LOOP
 * ========================================================================== */

renderer.setAnimationLoop(animate);

function animate() {
  const delta = Math.min(clock.getDelta(), 0.1); // clamp to avoid big jumps on tab switch

  updateNavigation(delta);

  renderer.render(scene, camera);
}
