// ═══════════════════════════════════════════════════════════════════════════
// IGP GENERATOR — vector line tiles on a snapping grid
// ═══════════════════════════════════════════════════════════════════════════

let socket;
let canvas;

// ─── Grid ─────────────────────────────────────────────────────────────────────
const CELL_PX = 140; // size of each grid box in world pixels
const TILE_SIZE = 132; // pattern fills the box tightly (CELL_PX - 2×4px border)
const REVEAL_DUR = 700; // ms for draw-on animation

let gridCols, gridRows; // number of cells in world
// Map of "col_row" → tile object (or null if empty)
let cellMap = new Map();
let placedTiles = []; // ordered list for drawing
let pendingTiles = [];

// ─── IGP settings ─────────────────────────────────────────────────────────────
let igpTheta = Math.PI / 4;
let igpTiling = "squareOctagon";
let igpMainColor = "#1a4a8a";

// ─── Touch ────────────────────────────────────────────────────────────────────
let touchX = -9999,
  touchY = -9999;
let touchStartX = -9999,
  touchStartY = -9999;
let isTouching = false;
let longPressTimer = null;
let longPressX = 0,
  longPressY = 0;
const LONG_PRESS_MS = 500;

// ─── Ripples ──────────────────────────────────────────────────────────────────
const RIPPLE_SPEED = 280;
const RIPPLE_FORCE = 9;
const RIPPLE_WIDTH = 40;
const RIPPLE_DURATION = 1400;
let ripples = [];

// ─── Pan ──────────────────────────────────────────────────────────────────────
let panX = 0,
  panY = 0;
let panVX = 0,
  panVY = 0;
let isPanning = false;
let panLastX = 0,
  panLastY = 0;
let worldW, worldH;
const PAN_DAMPING = 0.88;

// ─── Physics ──────────────────────────────────────────────────────────────────
const REPULSION_RADIUS = 160;
const REPULSION_FORCE = 5;

// ─── Modal / preview ──────────────────────────────────────────────────────────
let igpModalOpen = false;
let previewDragY = 0;
let previewLastX = null,
  previewLastY = null;
let previewSegCache = null,
  previewSegKey = null,
  previewBBox = null;

const TILINGS = ["squareOctagon", "rhombitrihexagonal"];
const TILING_LABELS = {
  squareOctagon: "Sq-Octagon",
  rhombitrihexagonal: "3-4-6-4",
};

// ─── Multi-user ───────────────────────────────────────────────────────────────
const TOUCH_SYNC_THROTTLE = 50;
let lastTouchSyncTime = 0;
const remoteUsers = new Map();
let userId = null;

// ─── Audio ────────────────────────────────────────────────────────────────────
let audioContext = null,
  masterGain = null;
let lastPluckTime = 0;
const PLUCK_COOLDOWN = 100;

function initAudio() {
  if (audioContext) return;
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.25;
  masterGain.connect(audioContext.destination);
}

function playPluck(x) {
  if (!audioContext) return;
  const now = Date.now();
  if (now - lastPluckTime < PLUCK_COOLDOWN) return;
  lastPluckTime = now;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = "triangle";
  osc.frequency.value = 300 + (x / worldW) * 500;
  gain.gain.setValueAtTime(0.3, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.15);
}

// ═══════════════════════════════════════════════════════════════════════════
// HANKIN ENGINE
// ═══════════════════════════════════════════════════════════════════════════
function hankinIntersect(e1a, e1b, e2a, e2b) {
  const x1 = e1a.x,
    y1 = e1a.y,
    x2 = e1b.x,
    y2 = e1b.y;
  const x3 = e2a.x,
    y3 = e2a.y,
    x4 = e2b.x,
    y4 = e2b.y;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

function rotVec(vx, vy, a) {
  return {
    x: vx * Math.cos(a) - vy * Math.sin(a),
    y: vx * Math.sin(a) + vy * Math.cos(a),
  };
}

function centroid(verts) {
  let cx = 0,
    cy = 0;
  for (const v of verts) {
    cx += v.x;
    cy += v.y;
  }
  return { x: cx / verts.length, y: cy / verts.length };
}

function hankinLines(verts, theta) {
  const cen = centroid(verts);
  const lines = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const a = verts[i],
      b = verts[(i + 1) % n];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    const ex = (b.x - a.x) / len,
      ey = (b.y - a.y) / len;
    let px = -ey,
      py = ex;
    if (px * (cen.x - mid.x) + py * (cen.y - mid.y) < 0) {
      px = -px;
      py = -py;
    }
    const dA = rotVec(px, py, theta),
      dB = rotVec(px, py, -theta);
    const pt = hankinIntersect(a, { x: a.x + dA.x, y: a.y + dA.y }, b, {
      x: b.x + dB.x,
      y: b.y + dB.y,
    });
    if (!pt) continue;
    lines.push({ ax: a.x, ay: a.y, bx: pt.x, by: pt.y });
    lines.push({ ax: b.x, ay: b.y, bx: pt.x, by: pt.y });
  }
  return lines;
}

function buildUnitPolygons(tilingType, size) {
  const polys = [];
  if (tilingType === "squareOctagon") {
    const r8 = size / (2 * Math.cos(Math.PI / 8));
    const oct = [];
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + (k * Math.PI * 2) / 8;
      oct.push({ x: r8 * Math.cos(a), y: r8 * Math.sin(a) });
    }
    polys.push(oct);
    const a2 = size / (1 + Math.sqrt(2));
    for (const o of [
      { x: size * 0.5 + a2 * 0.5, y: 0 },
      { x: -(size * 0.5 + a2 * 0.5), y: 0 },
      { x: 0, y: size * 0.5 + a2 * 0.5 },
      { x: 0, y: -(size * 0.5 + a2 * 0.5) },
    ]) {
      const h = a2 / 2;
      polys.push([
        { x: o.x - h, y: o.y - h },
        { x: o.x + h, y: o.y - h },
        { x: o.x + h, y: o.y + h },
        { x: o.x - h, y: o.y + h },
      ]);
    }
  } else if (tilingType === "rhombitrihexagonal") {
    const rH = size * 0.38,
      sH = (rH * Math.sqrt(3)) / 2;
    const hex = [];
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      hex.push({ x: rH * Math.cos(a), y: rH * Math.sin(a) });
    }
    polys.push(hex);
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      const scx = (rH + sH) * Math.cos(a),
        scy = (rH + sH) * Math.sin(a);
      const nx = Math.cos(a + Math.PI / 2) * sH,
        ny = Math.sin(a + Math.PI / 2) * sH;
      const rx = Math.cos(a) * sH,
        ry = Math.sin(a) * sH;
      polys.push([
        { x: scx - nx - rx, y: scy - ny - ry },
        { x: scx + nx - rx, y: scy + ny - ry },
        { x: scx + nx + rx, y: scy + ny + ry },
        { x: scx - nx + rx, y: scy - ny + ry },
      ]);
    }
    for (let k = 0; k < 6; k++) {
      const a1 = Math.PI / 6 + (k * Math.PI) / 3,
        a2 = Math.PI / 6 + ((k + 1) * Math.PI) / 3,
        amid = (a1 + a2) / 2,
        tR = rH + sH * 2;
      polys.push([
        {
          x:
            (rH + sH) * Math.cos(a1) +
            Math.cos(a1 + Math.PI / 2) * sH +
            Math.cos(a1) * sH,
          y:
            (rH + sH) * Math.sin(a1) +
            Math.sin(a1 + Math.PI / 2) * sH +
            Math.sin(a1) * sH,
        },
        {
          x:
            (rH + sH) * Math.cos(a2) -
            Math.cos(a2 + Math.PI / 2) * sH +
            Math.cos(a2) * sH,
          y:
            (rH + sH) * Math.sin(a2) -
            Math.sin(a2 + Math.PI / 2) * sH +
            Math.sin(a2) * sH,
        },
        { x: tR * Math.cos(amid), y: tR * Math.sin(amid) },
      ]);
    }
  }
  return polys;
}

function buildTileSegs(theta, tilingType) {
  const unitPolys = buildUnitPolygons(tilingType, 1.0);
  const allSegs = [];
  for (const verts of unitPolys)
    for (const s of hankinLines(verts, theta)) allSegs.push(s);
  if (!allSegs.length) return { segs: [], sc: 1, ox: 0, oy: 0 };

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const s of allSegs) {
    minX = Math.min(minX, s.ax, s.bx);
    maxX = Math.max(maxX, s.ax, s.bx);
    minY = Math.min(minY, s.ay, s.by);
    maxY = Math.max(maxY, s.ay, s.by);
  }
  const range = Math.max(maxX - minX, maxY - minY);
  const sc = TILE_SIZE / range;
  const ox = -((minX + (maxX - minX) / 2) * sc);
  const oy = -((minY + (maxY - minY) / 2) * sc);
  // Add per-segment physics state
  for (const s of allSegs) {
    s.dx = 0;
    s.dy = 0;
    s.vx = 0;
    s.vy = 0;
  }
  return { segs: allSegs, sc, ox, oy };
}

// ═══════════════════════════════════════════════════════════════════════════
// p5 SETUP
// ═══════════════════════════════════════════════════════════════════════════
function setup() {
  if (
    location.hostname.toLowerCase().startsWith("browsercircus") ||
    location.hostname.toLowerCase().startsWith("www")
  ) {
    socket = io({ path: "/haya/port-4230/socket.io" });
  } else {
    socket = io();
  }

  userId = "user_" + Math.random().toString(36).substr(2, 9);

  socket.on("historic-tiles", (savedTiles) => {
    for (const t of savedTiles) {
      if (!worldW) pendingTiles.push(t);
      else restoreTile(t);
    }
    if (worldW) loop();
  });
  socket.on("new-tile", (t) => {
    if (!worldW) pendingTiles.push(t);
    else {
      restoreTile(t);
      loop();
    }
  });
  socket.on("user-touch-move", ({ userId: uid, x, y }) => {
    if (uid === userId) return;
    const u = remoteUsers.get(uid) || {};
    remoteUsers.set(uid, {
      ...u,
      x,
      y,
      lastUpdate: Date.now(),
      isActive: true,
    });
    loop();
  });
  socket.on("user-touch-end", ({ userId: uid }) => {
    const u = remoteUsers.get(uid);
    if (u) {
      u.isActive = false;
      setTimeout(() => remoteUsers.delete(uid), 500);
    }
    loop();
  });

  // Remote ripple — spawn locally so all clients feel it
  socket.on("user-ripple", ({ x, y }) => {
    ripples.push({ x, y, startTime: millis() });
    loop();
  });

  canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("mandala-screen");

  document.querySelector("#introButton")?.addEventListener("click", () => {
    document.querySelector("#intro-screen").style.display = "none";
    showMandalaScreen();
  });
  document.addEventListener("click", initAudio, { once: true });
  document.addEventListener("touchstart", initAudio, { once: true });
  noLoop();
}

// ═══════════════════════════════════════════════════════════════════════════
// p5 DRAW
// ═══════════════════════════════════════════════════════════════════════════
function draw() {
  background("#0a0a0f");

  if (!isPanning && (Math.abs(panVX) > 0.1 || Math.abs(panVY) > 0.1)) {
    panX += panVX;
    panY += panVY;
    panVX *= PAN_DAMPING;
    panVY *= PAN_DAMPING;
    clampPan();
  }

  push();
  translate(panX, panY);

  drawGrid();

  const now = millis();
  let anyAnimating = false;
  ripples = ripples.filter((r) => now - r.startTime < RIPPLE_DURATION);
  const hasRipple = ripples.length > 0;

  for (const tile of placedTiles) {
    // Reveal
    let progress = 1;
    if (tile.revealStart) {
      const elapsed = now - tile.revealStart;
      progress = Math.min(1, elapsed / REVEAL_DUR);
      if (progress < 1) anyAnimating = true;
      else tile.revealStart = null;
    }

    // Per-segment physics
    const tileCX = tile.wx,
      tileCY = tile.wy;
    const { segs, sc, ox, oy } = tile;
    let tileAnimating = false;

    for (const s of segs) {
      // Home position of segment midpoint in world space
      const hmx = tileCX + ((s.ax + s.bx) / 2) * sc + ox;
      const hmy = tileCY + ((s.ay + s.by) / 2) * sc + oy;
      // Current position
      const cmx = hmx + s.dx;
      const cmy = hmy + s.dy;

      // Repulsion from own touch
      if (isTouching) {
        const dx = cmx - touchX,
          dy = cmy - touchY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < REPULSION_RADIUS && d > 0) {
          const str = (1 - d / REPULSION_RADIUS) * REPULSION_FORCE;
          s.vx += (dx / d) * str;
          s.vy += (dy / d) * str;
          if (d < REPULSION_RADIUS * 0.5) playPluck(cmx);
        }
      }
      // Repulsion from remote users
      for (const [, u] of remoteUsers) {
        if (!u.isActive) continue;
        const dx = cmx - u.x,
          dy = cmy - u.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < REPULSION_RADIUS && d > 0) {
          const str = (1 - d / REPULSION_RADIUS) * REPULSION_FORCE * 0.6;
          s.vx += (dx / d) * str;
          s.vy += (dy / d) * str;
        }
      }
      // Ripple
      if (hasRipple) {
        for (const r of ripples) {
          const elapsed = now - r.startTime;
          const waveFront = (elapsed / 1000) * RIPPLE_SPEED;
          const dx = cmx - r.x,
            dy = cmy - r.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const diff = d - waveFront;
          if (Math.abs(diff) < RIPPLE_WIDTH) {
            const str =
              Math.exp((-diff * diff) / (RIPPLE_WIDTH * RIPPLE_WIDTH * 0.5)) *
              RIPPLE_FORCE *
              (1 - elapsed / RIPPLE_DURATION);
            if (d > 0) {
              s.vx += (dx / d) * str;
              s.vy += (dy / d) * str;
            }
          }
        }
      }
      // Spring back to home
      s.vx += -s.dx * 0.14;
      s.vy += -s.dy * 0.14;
      s.vx *= 0.74;
      s.vy *= 0.74;
      s.dx += s.vx;
      s.dy += s.vy;
      if (
        Math.abs(s.vx) + Math.abs(s.vy) + Math.abs(s.dx) + Math.abs(s.dy) >
        0.05
      )
        tileAnimating = true;
    }

    if (tileAnimating) anyAnimating = true;
    drawVectorTile(tile, progress);
  }

  pop();

  for (const [, u] of remoteUsers)
    if (u.isActive) drawTouchIndicator(u.x + panX, u.y + panY, 77);
  if (isTouching) drawTouchIndicator(touchX + panX, touchY + panY, 255);

  const anyRemoteActive = [...remoteUsers.values()].some((u) => u.isActive);
  if (
    !anyAnimating &&
    !isTouching &&
    !hasRipple &&
    Math.abs(panVX) < 0.1 &&
    Math.abs(panVY) < 0.1 &&
    !anyRemoteActive
  )
    noLoop();
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAW HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function drawGrid() {
  // Only draw cells visible in current viewport
  const startCol = Math.max(0, Math.floor(-panX / CELL_PX) - 1);
  const startRow = Math.max(0, Math.floor(-panY / CELL_PX) - 1);
  const endCol = Math.min(
    gridCols - 1,
    startCol + Math.ceil(width / CELL_PX) + 2,
  );
  const endRow = Math.min(
    gridRows - 1,
    startRow + Math.ceil(height / CELL_PX) + 2,
  );

  noFill();
  stroke(255, 255, 255, 18);
  strokeWeight(0.5);
  for (let col = startCol; col <= endCol; col++)
    for (let row = startRow; row <= endRow; row++)
      rect(col * CELL_PX, row * CELL_PX, CELL_PX, CELL_PX);

  // Corner dots at intersections
  fill(255, 255, 255, 30);
  noStroke();
  for (let col = startCol; col <= endCol + 1; col++)
    for (let row = startRow; row <= endRow + 1; row++)
      ellipse(col * CELL_PX, row * CELL_PX, 3, 3);
}

function drawVectorTile(tile, progress) {
  const { segs, sc, ox, oy } = tile;
  if (!segs || !segs.length) return;

  push();
  // Draw in world space (no tile-level translate — each seg has own offset)
  translate(tile.wx, tile.wy);
  stroke(tile.color);
  strokeWeight(1.2);
  noFill();
  const count = Math.floor(segs.length * progress);
  for (let i = 0; i < count; i++) {
    const s = segs[i];
    // Both endpoints of the segment shift by the segment's own dx/dy
    line(
      s.ax * sc + ox + s.dx,
      s.ay * sc + oy + s.dy,
      s.bx * sc + ox + s.dx,
      s.by * sc + oy + s.dy,
    );
  }
  pop();
}

function drawTouchIndicator(sx, sy, alpha) {
  push();
  noStroke();
  fill(255, 255, 255, alpha);
  textSize(18);
  textAlign(CENTER, CENTER);
  text("✦", sx, sy);
  pop();
}

// ═══════════════════════════════════════════════════════════════════════════
// TILE PLACEMENT — snaps to grid cell centre
// ═══════════════════════════════════════════════════════════════════════════
function cellKey(col, row) {
  return `${col}_${row}`;
}

function cellCenter(col, row) {
  return { x: col * CELL_PX + CELL_PX / 2, y: row * CELL_PX + CELL_PX / 2 };
}

function addOneTile() {
  // Find which cell the long-press happened in (world coords)
  const wx = longPressX - panX;
  const wy = longPressY - panY;
  const col = Math.floor(wx / CELL_PX);
  const row = Math.floor(wy / CELL_PX);

  // Clamp to grid bounds
  const c = Math.max(0, Math.min(gridCols - 1, col));
  const r = Math.max(0, Math.min(gridRows - 1, row));

  // If cell is already occupied, do nothing
  if (cellMap.has(cellKey(c, r))) return;

  const { x: cx, y: cy } = cellCenter(c, r);
  const id = cellKey(c, r);

  placeTileAt(id, c, r, cx, cy, igpTheta, igpTiling, igpMainColor, true);
  socket.emit("new-tile", {
    id,
    col: c,
    row: r,
    wx: cx,
    wy: cy,
    theta: igpTheta,
    tiling: igpTiling,
    mainColor: igpMainColor,
  });
}

function restoreTile(t) {
  if (typeof t.theta !== "number" || !t.tiling || !t.mainColor) return;

  let col, row, wx, wy;

  if (typeof t.col === "number" && typeof t.row === "number") {
    // New format — col/row are authoritative
    col = t.col;
    row = t.row;
    wx = typeof t.wx === "number" ? t.wx : cellCenter(col, row).x;
    wy = typeof t.wy === "number" ? t.wy : cellCenter(col, row).y;
  } else if (typeof t.wx === "number" && typeof t.wy === "number") {
    // Old format — derive col/row from world position
    wx = t.wx;
    wy = t.wy;
    col = Math.floor(wx / CELL_PX);
    row = Math.floor(wy / CELL_PX);
    col = Math.max(0, Math.min(gridCols - 1, col));
    row = Math.max(0, Math.min(gridRows - 1, row));
    const c = cellCenter(col, row);
    wx = c.x;
    wy = c.y;
  } else {
    return;
  }

  const id = t.id || cellKey(col, row);
  placeTileAt(id, col, row, wx, wy, t.theta, t.tiling, t.mainColor, false);
}

function placeTileAt(id, col, row, wx, wy, theta, tilingType, color, animate) {
  const key = cellKey(col, row);
  if (cellMap.has(key)) return; // cell already occupied
  const { segs, sc, ox, oy } = buildTileSegs(theta, tilingType);
  const tile = {
    id,
    col,
    row,
    wx,
    wy,
    theta,
    tilingType,
    color,
    segs,
    sc,
    ox,
    oy,
    revealStart: animate ? millis() : null,
  };
  cellMap.set(key, tile);
  placedTiles.push(tile);
  loop();
}

// ═══════════════════════════════════════════════════════════════════════════
// WORLD / PAN
// ═══════════════════════════════════════════════════════════════════════════
function initWorld() {
  worldW = 10000;
  worldH = 10000;
  gridCols = Math.ceil(worldW / CELL_PX);
  gridRows = Math.ceil(worldH / CELL_PX);
  panX = -(worldW - width) / 2;
  panY = -(worldH - height) / 2;
  panVX = 0;
  panVY = 0;
  placedTiles = [];
  cellMap = new Map();
  ripples = [];
}

function clampPan() {
  panX = Math.min(0, Math.max(-(worldW - width), panX));
  panY = Math.min(0, Math.max(-(worldH - height), panY));
}

function screenToWorld(sx, sy) {
  return { x: sx - panX, y: sy - panY };
}

function showMandalaScreen() {
  document.querySelector("#mandala-screen").style.display = "block";
  canvas.parent("mandala-screen");
  resizeCanvas(windowWidth, windowHeight);
  initWorld();
  for (const t of pendingTiles) restoreTile(t);
  pendingTiles = [];
  loop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  const savedTiles = [...placedTiles];
  initWorld();
  for (const t of savedTiles)
    placeTileAt(
      t.id,
      t.col,
      t.row,
      t.wx,
      t.wy,
      t.theta,
      t.tilingType,
      t.color,
      false,
    );
  redraw();
  redraw();
}

// ═══════════════════════════════════════════════════════════════════════════
// TOUCH / MOUSE
// ═══════════════════════════════════════════════════════════════════════════
function touchStarted() {
  if (igpModalOpen) return;
  if (touches[0]) {
    const el = document.elementFromPoint(touches[0].x, touches[0].y);
    if (
      el &&
      (el.tagName === "BUTTON" ||
        el.closest("button") ||
        el.closest("#igp-modal"))
    )
      return;
  }
  if (touches.length >= 2) {
    cancelLongPress();
    isPanning = true;
    isTouching = false;
    panLastX = (touches[0].x + touches[1].x) / 2;
    panLastY = (touches[0].y + touches[1].y) / 2;
    panVX = 0;
    panVY = 0;
  } else if (touches.length === 1) {
    isPanning = false;
    const w = screenToWorld(touches[0].x, touches[0].y);
    touchX = w.x;
    touchY = w.y;
    touchStartX = w.x;
    touchStartY = w.y;
    isTouching = true;
    longPressX = touches[0].x;
    longPressY = touches[0].y;
    longPressTimer = setTimeout(() => {
      isTouching = false;
      cancelLongPress();
      openIGPModal();
    }, LONG_PRESS_MS);
  }
  loop();
  return false;
}

function touchMoved() {
  if (igpModalOpen) return false;
  if (isPanning && touches.length >= 2) {
    const cx = (touches[0].x + touches[1].x) / 2,
      cy = (touches[0].y + touches[1].y) / 2;
    panVX = cx - panLastX;
    panVY = cy - panLastY;
    panX += panVX;
    panY += panVY;
    clampPan();
    panLastX = cx;
    panLastY = cy;
    loop();
    return false;
  }
  if (isTouching && touches.length === 1) {
    const w = screenToWorld(touches[0].x, touches[0].y);
    touchX = w.x;
    touchY = w.y;
    if (
      Math.sqrt(
        (touches[0].x - longPressX) ** 2 + (touches[0].y - longPressY) ** 2,
      ) > 10
    )
      cancelLongPress();
    if (Math.random() < 0.15)
      ripples.push({ x: touchX, y: touchY, startTime: millis() });
    const now = Date.now();
    if (now - lastTouchSyncTime > TOUCH_SYNC_THROTTLE) {
      socket.emit("user-touch-move", { userId, x: touchX, y: touchY });
      lastTouchSyncTime = now;
    }
    loop();
    return false;
  }

  if (Math.random() < 0.15) {
    const ripple = { x: touchX, y: touchY };
    ripples.push({ ...ripple, startTime: millis() });
    socket.emit("user-ripple", { userId, ...ripple });
  }
}

function touchEnded() {
  cancelLongPress();
  if (isPanning) {
    isPanning = false;
    loop();
    return false;
  }
  if (!isTouching) return;
  isTouching = false;
  if (
    Math.sqrt((touchX - touchStartX) ** 2 + (touchY - touchStartY) ** 2) < 14
  ) {
    ripples.push({ x: touchX, y: touchY, startTime: millis() });
    // NEW: Broadcast ripple to other users
    socket.emit("user-ripple", { userId, x: touchX, y: touchY });
  }
  socket.emit("user-touch-end", { userId });
  loop();
  return false;
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function mouseMoved() {
  if (igpModalOpen) return;
  const w = screenToWorld(mouseX, mouseY);
  touchX = w.x;
  touchY = w.y;
  isTouching = true;
  loop();
}
function mousePressed() {
  if (igpModalOpen) return;
  const w = screenToWorld(mouseX, mouseY);
  touchStartX = w.x;
  touchStartY = w.y;
  longPressX = mouseX;
  longPressY = mouseY;
  longPressTimer = setTimeout(() => {
    cancelLongPress();
    isTouching = false;
    openIGPModal();
  }, LONG_PRESS_MS);
}
function mouseReleased() {
  cancelLongPress();
  if (igpModalOpen) return;
  isTouching = false;
  const w = screenToWorld(mouseX, mouseY);
  if (Math.sqrt((w.x - touchStartX) ** 2 + (w.y - touchStartY) ** 2) < 14) {
    ripples.push({ x: w.x, y: w.y, startTime: millis() });
    // NEW: Broadcast ripple to other users
    socket.emit("user-ripple", { userId, x: w.x, y: w.y });
  }
  socket.emit("user-touch-end", { userId });
}
function mouseDragged() {
  if (Math.sqrt((mouseX - longPressX) ** 2 + (mouseY - longPressY) ** 2) > 10)
    cancelLongPress();
  if (isTouching) {
    const now = Date.now();
    if (now - lastTouchSyncTime > TOUCH_SYNC_THROTTLE) {
      socket.emit("user-touch-move", { userId, x: touchX, y: touchY });
      lastTouchSyncTime = now;
    }
    // NEW: Emit ripples during drag
    if (Math.random() < 0.15) {
      const ripple = { x: touchX, y: touchY };
      ripples.push({ ...ripple, startTime: millis() });
      socket.emit("user-ripple", { userId, ...ripple });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// IGP MODAL
// ═══════════════════════════════════════════════════════════════════════════
function openIGPModal() {
  igpModalOpen = true;
  previewDragY = TILINGS.indexOf(igpTiling);
  previewLastX = null;
  previewLastY = null;
  document.getElementById("igp-modal").style.display = "flex";
  document.querySelector("canvas").style.pointerEvents = "none";

  document.getElementById("igp-color-main").value = igpMainColor;
  document.getElementById("swatch-main").style.background = igpMainColor;
  document.getElementById("igp-color-main").oninput = (e) => {
    igpMainColor = e.target.value;
    document.getElementById("swatch-main").style.background = igpMainColor;
    renderPreview();
  };

  document.querySelectorAll(".tiling-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tiling === igpTiling);
    btn.onclick = function () {
      igpTiling = this.dataset.tiling;
      previewDragY = TILINGS.indexOf(igpTiling);
      document
        .querySelectorAll(".tiling-btn")
        .forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      renderPreview();
    };
  });

  initPreviewCanvas();
  document.getElementById("igp-close").onclick = closeIGPModal;
  document.getElementById("igp-apply").onclick = applyAndGenerate;
}

function closeIGPModal() {
  igpModalOpen = false;
  document.getElementById("igp-modal").style.display = "none";
  document.querySelector("canvas").style.pointerEvents = "auto";
  const ctr = document.getElementById("igp-canvas-container");
  ctr.removeEventListener("touchstart", prevTouchStart);
  ctr.removeEventListener("touchmove", prevTouchMove);
  ctr.removeEventListener("touchend", prevTouchEnd);
  ctr.removeEventListener("mousemove", prevMouseMove);
}

function applyAndGenerate() {
  closeIGPModal();
  addOneTile();
}

// ─── Preview canvas ───────────────────────────────────────────────────────────
function initPreviewCanvas() {
  const ctr = document.getElementById("igp-canvas-container");
  const side = Math.round(ctr.getBoundingClientRect().width);
  let cvs = document.getElementById("igp-canvas");
  if (!cvs) {
    cvs = document.createElement("canvas");
    cvs.id = "igp-canvas";
    ctr.prepend(cvs);
  }
  cvs.width = side;
  cvs.height = side;
  ctr.addEventListener("touchstart", prevTouchStart, { passive: false });
  ctr.addEventListener("touchmove", prevTouchMove, { passive: false });
  ctr.addEventListener("touchend", prevTouchEnd, { passive: false });
  ctr.addEventListener("mousemove", prevMouseMove);
  renderPreview();
}

function prevTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  previewLastX = t.clientX;
  previewLastY = t.clientY;
}

function prevTouchMove(e) {
  e.preventDefault();
  if (!previewLastX) return;
  const cvs = document.getElementById("igp-canvas");
  if (!cvs) return;
  const t = e.touches[0];
  const dx = t.clientX - previewLastX,
    dy = t.clientY - previewLastY;
  igpTheta = Math.max(
    (10 * Math.PI) / 180,
    Math.min(
      (100 * Math.PI) / 180,
      igpTheta + (dx * ((70 * Math.PI) / 180)) / cvs.width,
    ),
  );
  previewDragY = Math.max(
    0,
    Math.min(TILINGS.length - 1, previewDragY - dy / 80),
  );
  document.getElementById("igp-angle-val").textContent =
    Math.round((igpTheta * 180) / Math.PI) + "°";
  previewLastX = t.clientX;
  previewLastY = t.clientY;
  renderPreview();
}

function prevTouchEnd() {
  previewLastX = null;
  previewLastY = null;
}

let _mouseThrottle = 0;
function prevMouseMove(e) {
  const now = Date.now();
  if (now - _mouseThrottle < 32) return;
  _mouseThrottle = now;
  const cvs = document.getElementById("igp-canvas");
  if (!cvs) return;
  const rect = cvs.getBoundingClientRect();
  igpTheta =
    ((10 + ((e.clientX - rect.left) / rect.width) * 70) * Math.PI) / 180;
  document.getElementById("igp-angle-val").textContent =
    Math.round((igpTheta * 180) / Math.PI) + "°";
  renderPreview();
}

function renderPreview() {
  const cvs = document.getElementById("igp-canvas");
  if (!cvs) return;
  const ctx = cvs.getContext("2d");
  const W = cvs.width,
    H = cvs.height;

  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  for (let x = 0; x <= W; x += 6)
    for (let y = 0; y <= H; y += 6) {
      ctx.beginPath();
      ctx.arc(x, y, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

  const segKey = `${igpTiling}_${Math.round(igpTheta * 1000)}`;
  if (segKey !== previewSegKey) {
    const allSegs = [];
    for (const verts of buildUnitPolygons(igpTiling, 1.0))
      for (const s of hankinLines(verts, igpTheta)) allSegs.push(s);
    if (allSegs.length) {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const s of allSegs) {
        minX = Math.min(minX, s.ax, s.bx);
        maxX = Math.max(maxX, s.ax, s.bx);
        minY = Math.min(minY, s.ay, s.by);
        maxY = Math.max(maxY, s.ay, s.by);
      }
      previewBBox = { minX, maxX, minY, maxY };
      previewSegCache = allSegs;
    }
    previewSegKey = segKey;
  }
  if (!previewSegCache?.length) return;

  const { minX, maxX, minY, maxY } = previewBBox;
  const range = Math.max(maxX - minX, maxY - minY);
  const sc = (Math.min(W, H) * 0.88) / range;
  const ox = W / 2 - (minX + (maxX - minX) / 2) * sc;
  const oy = H / 2 - (minY + (maxY - minY) / 2) * sc;

  ctx.strokeStyle = igpMainColor;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const s of previewSegCache) {
    ctx.moveTo(s.ax * sc + ox, s.ay * sc + oy);
    ctx.lineTo(s.bx * sc + ox, s.by * sc + oy);
  }
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "15px 'Cormorant Garamond',serif";
  ctx.textAlign = "center";
  ctx.fillText("← drag to change angle →", W / 2, H - 10);
}
