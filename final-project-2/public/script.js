//tiling code from here: https://github.com/pierrebai/Alhambra

// --- Socket setup ---
let socket;

// p5 sketch variables
let video;
let snapped = false;
let canvas;
let mode = "camera";

let camSound;
let sendButton;
let captureButton;

// PIC pattern config
let sz = 55;
let theta = (75.5 * Math.PI) / 180;
let bgCol = "#FFF9F0";
let lineCol = "#003049";
let currentTiling = "4.8.8"; //4.8.8, 6.6.6, 3.12.12, 4.6.12
// stores every computed line segment: [{a, b}]
let allLines = [];

// Photo images in order received — each slot is null until the image loads
let photoImages = [];

//  Spotlight animation
let spotlight = null;
const FADE_IN_DUR = 600; // ms to fade to dark
const HOLD_DUR = 2000; // ms to hold the spotlight
const FADE_OUT_DUR = 800; // ms to fade back to normal

// DID current user send the photo?
let myLineIdx = -1;

//  p5 setup
function setup() {
  if (
    location.hostname.toLowerCase().startsWith("browsercircus") ||
    location.hostname.toLowerCase().startsWith("www")
  ) {
    socket = io({ path: "/canvas-photo/socket.io" });
  } else {
    socket = io();
  }

  // Socket handlers — keep photo order stable across all clients
  socket.on("historic-photos", function (data) {
    for (const photo of data) {
      addPhotoImage(photo.url);
    }
  });

  socket.on("new-photo", function (data) {
    const idx = photoImages.length; // the slot this photo will occupy
    addPhotoImage(data.url);
    triggerSpotlight(idx);
    if (mode === "pattern") redraw();
  });

  canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("canvas-wrapper");

  let canvasDisplayHeight = window.innerHeight / 3;
  canvas.elt.style.height = canvasDisplayHeight + "px";
  canvas.elt.style.width = canvasDisplayHeight * (480 / 640) + "px";

  video = createCapture({ video: { facingMode: "environment" }, audio: false });
  video.size(windowWidth, windowHeight);
  video.hide();
  background(0);

  camSound = document.querySelector("#camSound");
  sendButton = document.querySelector("#sendButton");
  captureButton = document.querySelector("#captureButton");

  captureButton.addEventListener("click", function () {
    if (!snapped) {
      snapped = true;
      sendButton.style.visibility = "visible";
      captureButton.innerText = "Try Again";
      captureButton.style.width = "30%";
      captureButton.style.backgroundColor = "rgb(156, 195, 255)";
      camSound.play();
    } else {
      resetCamera();
    }
  });

  //send image to server
  sendButton.addEventListener("click", function () {
    canvas.elt.toBlob(sendImageToServer, "image/png");
  });

  document.querySelector("#introButton").addEventListener("click", function () {
    document.querySelector("#intro-screen").style.display = "none";
    showMandalaScreen();
  });

  document.querySelector("#toCamera").addEventListener("click", function () {
    document.querySelector("#mandala-screen").style.display = "none";
    document.querySelector("#camera-screen").style.display = "block";
    mode = "camera";
    loop();
  });

  // keep looping camera
  loop();
}

function draw() {
  if (mode === "camera") {
    if (!snapped) {
      image(video, 0, 0, windowWidth, windowHeight);
    }
    return;
  }

  // ── Pattern mode ─────────────────────────────────────────────────────────────
  background(bgCol);
  noFill();

  // Compute spotlight overlay alpha (0 = fully visible, 200 = mostly dark)
  let overlayAlpha = 0;
  if (spotlight !== null) {
    const elapsed = millis() - spotlight.phaseStart;
    if (spotlight.phase === "in") {
      overlayAlpha = map(elapsed, 0, FADE_IN_DUR, 0, 200);
      if (elapsed >= FADE_IN_DUR) {
        spotlight.phase = "hold";
        spotlight.phaseStart = millis();
        overlayAlpha = 200;
      }
    } else if (spotlight.phase === "hold") {
      overlayAlpha = 200;
      if (elapsed >= HOLD_DUR) {
        spotlight.phase = "out";
        spotlight.phaseStart = millis();
      }
    } else if (spotlight.phase === "out") {
      overlayAlpha = map(elapsed, 0, FADE_OUT_DUR, 200, 0);
      if (elapsed >= FADE_OUT_DUR) {
        spotlight = null;
        noLoop();
        overlayAlpha = 0;
      }
    }
  }

  //resetting all of it
  const isSpotlighting = spotlight !== null;
  const spotIdx = isSpotlighting ? spotlight.lineIdx : -1;

  // Faint polygon outlines — dimmed during spotlight
  const polys = buildTiling(currentTiling, width, height, sz);
  for (const verts of polys) {
    stroke(lineCol + "33");
    strokeWeight(0.5);
    beginShape();
    // for (const v of verts) vertex(v.x, v.y);
    endShape(CLOSE);
  }

  // solid lines as base layer
  for (let i = 0; i < allLines.length; i++) {
    if (isSpotlighting && i === spotIdx) continue;
    const { a, b } = allLines[i];
    if (i >= photoImages.length || photoImages[i] === null) {
      drawSolidLine(a.x, a.y, b.x, b.y);
    }
  }

  //  image-textured lines on top
  for (let i = 0; i < allLines.length; i++) {
    if (isSpotlighting && i === spotIdx) continue;
    const { a, b } = allLines[i];
    if (i < photoImages.length && photoImages[i] !== null) {
      drawImgLine(a.x, a.y, b.x, b.y, 5, photoImages[i]);
    }
  }

  // Draw dark overlay on top of everything except the spotlight line
  if (isSpotlighting && overlayAlpha > 0) {
    push();
    noStroke();
    fill(53, 38, 32, overlayAlpha); // #352620 tinted dark overlay
    rect(0, 0, width, height);
    pop();
  }

  // Draw the newest image
  if (isSpotlighting) {
    const { a, b } = allLines[spotIdx];
    if (spotIdx < photoImages.length && photoImages[spotIdx] !== null) {
      drawImgLine(a.x, a.y, b.x, b.y, 30, photoImages[spotIdx]);
    } else {
      drawSolidLine(a.x, a.y, b.x, b.y);
    }
  }
}

//  Window resize
function windowResized() {
  if (mode === "pattern") {
    resizeCanvas(windowWidth, windowHeight);
    computeAllLines();
    redraw();
  }
}

// Screen switching
function switchToPattern() {
  mode = "pattern";
  canvas.parent("mandala-screen");
  resizeCanvas(windowWidth, windowHeight);
  computeAllLines();
  noLoop();
  redraw();
  firePendingSpotlight();
}

function showMandalaScreen() {
  document.querySelector("#camera-screen").style.display = "none";
  document.querySelector("#mandala-screen").style.display = "block";
  switchToPattern();
}

//  Camera helpers
function resetCamera() {
  snapped = false;
  sendButton.style.visibility = "hidden";
  captureButton.innerText = "SNAP!";
  captureButton.style.width = "50%";
  captureButton.style.backgroundColor = "initial";
}

function sendImageToServer(blob) {
  // Record which line slot will be ours (length before the new slot is added)
  myLineIdx = photoImages.length;

  fetch("upload-photo", {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: blob,
  }).then((data) => {
    console.log(data.status);
    resetCamera();
    document.querySelector("#camera-screen").style.display = "none";
    document.querySelector("#mandala-screen").style.display = "block";
    mode = "pattern";
    redraw();

    // Show toast only for the current sender, once we're on the pattern screen
    showToast(myLineIdx);
  });
}

//  Vector helpers
function vec(x, y) {
  return { x, y };
}
function vadd(a, b) {
  return vec(a.x + b.x, a.y + b.y);
}
function vsub(a, b) {
  return vec(a.x - b.x, a.y - b.y);
}
function vscale(v, s) {
  return vec(v.x * s, v.y * s);
}
function vrotV(v, a) {
  return vec(
    v.x * Math.cos(a) - v.y * Math.sin(a),
    v.x * Math.sin(a) + v.y * Math.cos(a),
  );
}
function vlen(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}
function vnormV(v) {
  const l = vlen(v);
  return vec(v.x / l, v.y / l);
}
function vdotV(a, b) {
  return a.x * b.x + a.y * b.y;
}

function rayIntersect(p, d, q, e) {
  const cross = d.x * e.y - d.y * e.x;
  if (Math.abs(cross) < 1e-9) return null;
  const dx = q.x - p.x,
    dy = q.y - p.y;
  const t = (dx * e.y - dy * e.x) / cross;
  const s = (dx * d.y - dy * d.x) / cross;
  if (t < -1e-6 || s < -1e-6) return null;
  return vec(p.x + d.x * t, p.y + d.y * t);
}

function isInsidePoly(pt, verts) {
  let inside = false;
  const n = verts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i].x,
      yi = verts[i].y;
    const xj = verts[j].x,
      yj = verts[j].y;
    if (
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

// Core PIC algorithm — returns array of [pointA, pointB] pairs
function getMotifLines(verts, th) {
  const n = verts.length;
  const rays = [];
  const cen = vscale(
    verts.reduce((acc, v) => vadd(acc, v), vec(0, 0)),
    1 / n,
  );

  for (let i = 0; i < n; i++) {
    const a = verts[i],
      b = verts[(i + 1) % n];
    const mid = vscale(vadd(a, b), 0.5);
    const edgeDir = vnormV(vsub(b, a));
    const inward = vnormV(vsub(cen, mid));

    let d1 = vrotV(edgeDir, th);
    let d2 = vrotV(vscale(edgeDir, -1), -th);
    if (vdotV(d1, inward) < 0) d1 = vscale(d1, -1);
    if (vdotV(d2, inward) < 0) d2 = vscale(d2, -1);
    rays.push({ origin: mid, dir: d1 });
    rays.push({ origin: mid, dir: d2 });
  }

  const lines = [];
  for (let i = 0; i < rays.length; i += 2) {
    const r1 = rays[i],
      r2 = rays[i + 1];
    for (let j = 0; j < rays.length; j += 2) {
      if (j === i) continue;
      const r3 = rays[j],
        r4 = rays[j + 1];
      const pt1 = rayIntersect(r1.origin, r1.dir, r3.origin, r3.dir);
      if (pt1 && isInsidePoly(pt1, verts)) lines.push({ a: r1.origin, b: pt1 });
      const pt2 = rayIntersect(r2.origin, r2.dir, r4.origin, r4.dir);
      if (pt2 && isInsidePoly(pt2, verts)) lines.push({ a: r2.origin, b: pt2 });
    }
  }
  return lines;
}

function regPoly(cx, cy, n, r, startAngle) {
  const verts = [];
  for (let i = 0; i < n; i++) {
    const a = startAngle + (TWO_PI * i) / n;
    verts.push(vec(cx + r * cos(a), cy + r * sin(a)));
  }
  return verts;
}

function buildTiling(name, W, H, s) {
  const polys = [];
  const sq2 = sqrt(2);

  if (name === "4.8.8") {
    const side = s;
    const R = side / (2 * sin(PI / 8));
    const unit = side * (1 + sq2);
    const cols = ceil(W / unit) + 3,
      rows = ceil(H / unit) + 3;
    for (let row = -2; row < rows; row++) {
      for (let col = -2; col < cols; col++) {
        const ox = col * unit - unit,
          oy = row * unit - unit;
        polys.push(regPoly(ox + unit / 2, oy + unit / 2, 8, R, PI / 8));
        polys.push(regPoly(ox + unit, oy + unit, 4, (side / 2) * sq2, PI / 4));
      }
    }
  }
  return polys;
}

// Recompute all line segments whenever canvas size changes
function computeAllLines() {
  allLines = [];
  const polys = buildTiling(currentTiling, width, height, sz);
  for (const verts of polys) {
    const motif = getMotifLines(verts, theta);
    for (const seg of motif) {
      allLines.push(seg);
    }
  }

  // Sort by distance of line midpoint from canvas center
  // so line #0 is always in the middle of the screen
  const cx = width / 2,
    cy = height / 2;
  allLines.sort((p, q) => {
    const amx = (p.a.x + p.b.x) / 2,
      amy = (p.a.y + p.b.y) / 2;
    const bmx = (q.a.x + q.b.x) / 2,
      bmy = (q.a.y + q.b.y) / 2;
    const da = (amx - cx) * (amx - cx) + (amy - cy) * (amy - cy);
    const db = (bmx - cx) * (bmx - cx) + (bmy - cy) * (bmy - cy);
    return da - db;
  });
}

// Drawing  the line & making the img into the line
function drawImgLine(x1, y1, x2, y2, lineThickness, img) {
  const lineLength = dist(x1, y1, x2, y2);
  const angleRadians = atan2(y2 - y1, x2 - x1);
  push();
  translate(x1, y1);
  rotate(angleRadians);
  image(img, 0, -lineThickness / 2, lineLength, lineThickness);
  pop();
}

function drawSolidLine(x1, y1, x2, y2) {
  stroke(lineCol);
  strokeWeight(1.8);
  line(x1, y1, x2, y2);
}

//  Spotlight
function triggerSpotlight(lineIdx) {
  if (mode !== "pattern") {
    // Pattern not shown yet — store as pending, fire after switch
    spotlight = { lineIdx, phase: "in", phaseStart: null, pending: true };
    return;
  }
  spotlight = { lineIdx, phase: "in", phaseStart: millis(), pending: false };
  loop(); // animate until spotlight finishes
}

// Called once we switch to pattern — fires any pending spotlight
function firePendingSpotlight() {
  if (spotlight && spotlight.pending) {
    spotlight.phaseStart = millis();
    spotlight.pending = false;
    loop();
  }
}

//  sign to tell what line ur image has been added to
function showToast(lineIdx) {
  const existing = document.querySelector("#pic-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "pic-toast";
  toast.innerText = `✦ Your photo is on line #${lineIdx + 1}!`;
  document.body.appendChild(toast);

  // Fade in
  requestAnimationFrame(() => {
    toast.classList.add("pic-toast-visible");
  });

  // Fade out after 3.5 s
  setTimeout(() => {
    toast.classList.remove("pic-toast-visible");
    toast.addEventListener("transitionend", () => toast.remove(), {
      once: true,
    });
  }, 3500);
}

// ==Photo loading
// Reserve the slot immediately so that order is preserved even when images
// load out of order (e.g. slow network).
function addPhotoImage(url) {
  const idx = photoImages.length;
  photoImages.push(null); // reserve slot

  loadImage(url, function (img) {
    photoImages[idx] = img;
    if (mode === "pattern") redraw();
  });
}
