// ═══════════════════════════════════════════════════════════════════════════
// IGP GENERATOR — Hankin method, pixelated tiles, swipe preview
// ═══════════════════════════════════════════════════════════════════════════

let socket;
let canvas;

// ─── Grid ─────────────────────────────────────────────────────────────────────
const CELL_SIZE = 6;
const TILE_CELLS = 21;
let gridCols, gridRows;
let grid = [];
let placedTiles = new Map();
let pendingTiles = [];
const rasterCache = {};

// ─── IGP settings ─────────────────────────────────────────────────────────────
let igpTheta = Math.PI / 4;
let igpTiling = "square";
let igpMainColor = "#1a4a8a";

// ─── Physics ──────────────────────────────────────────────────────────────────
const REPULSION_RADIUS = 90;
const REPULSION_FORCE = 5;
const DAMPING = 0.74;
const PIXEL_STAGGER = 12;
let activeCells = [];

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

// ─── Modal / preview ──────────────────────────────────────────────────────────
let igpModalOpen = false;
let igpGraphics = null; // p5 graphics buffer for preview
let previewDragY = 0;
let previewLastX = null,
  previewLastY = null;
let previewSegCache = null,
  previewSegKey = null,
  previewBBox = null;

const TILINGS = ["square", "squareOctagon", "rhombitrihexagonal"];
const TILING_LABELS = {
  square: "Square",
  squareOctagon: "Sq-Octagon",
  rhombitrihexagonal: "3-4-6-4",
};

// ─── Multi-user touch sync ────────────────────────────────────────────────────
const TOUCH_SYNC_THROTTLE = 50;
let lastTouchSyncTime = 0;
const remoteUsers = new Map();
let userId = null;

// ─── Audio ────────────────────────────────────────────────────────────────────
let audioContext = null;
let masterGain = null;
let lastPluckTime = 0;
const PLUCK_COOLDOWN = 100;

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO
// ═══════════════════════════════════════════════════════════════════════════
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
    const dA = rotVec(px, py, theta);
    const dB = rotVec(px, py, -theta);
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
  if (tilingType === "square") {
    const h = size / 2;
    polys.push([
      { x: -h, y: -h },
      { x: h, y: -h },
      { x: h, y: h },
      { x: -h, y: h },
    ]);
  } else if (tilingType === "squareOctagon") {
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
        a2 = Math.PI / 6 + ((k + 1) * Math.PI) / 3;
      const tR = rH + sH * 2,
        amid = (a1 + a2) / 2;
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

// ═══════════════════════════════════════════════════════════════════════════
// RASTERIZE
// ═══════════════════════════════════════════════════════════════════════════
function cacheKey(theta, tilingType) {
  return `${tilingType}_${Math.round(theta * 1000)}`;
}

function rasterizeTile(theta, tilingType) {
  const key = cacheKey(theta, tilingType);
  if (rasterCache[key]) return rasterCache[key];

  const SZ = 512;
  const unitPolys = buildUnitPolygons(tilingType, 1.0);
  const allSegs = [];
  for (const verts of unitPolys)
    for (const s of hankinLines(verts, theta)) allSegs.push(s);

  if (!allSegs.length) {
    rasterCache[key] = [];
    return [];
  }

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
  const scale = (SZ * 0.92) / range;
  const offX = SZ / 2 - (minX + (maxX - minX) / 2) * scale;
  const offY = SZ / 2 - (minY + (maxY - minY) / 2) * scale;

  const off = document.createElement("canvas");
  off.width = off.height = SZ;
  const ctx = off.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SZ, SZ);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = (SZ / TILE_CELLS) * 0.9;
  ctx.lineCap = "square";
  for (const s of allSegs) {
    ctx.beginPath();
    ctx.moveTo(s.ax * scale + offX, s.ay * scale + offY);
    ctx.lineTo(s.bx * scale + offX, s.by * scale + offY);
    ctx.stroke();
  }

  const img = ctx.getImageData(0, 0, SZ, SZ);
  const cellPx = SZ / TILE_CELLS;
  const pixels = [];
  for (let drow = 0; drow < TILE_CELLS; drow++)
    for (let dcol = 0; dcol < TILE_CELLS; dcol++) {
      const px = Math.floor(dcol * cellPx + cellPx / 2),
        py = Math.floor(drow * cellPx + cellPx / 2);
      const idx = (py * SZ + px) * 4;
      pixels.push({
        dcol,
        drow,
        lit: (img.data[idx] + img.data[idx + 1] + img.data[idx + 2]) / 3 > 80,
      });
    }

  rasterCache[key] = pixels;
  return pixels;
}

// ═══════════════════════════════════════════════════════════════════════════
// p5 SETUP
// ═══════════════════════════════════════════════════════════════════════════
function setup() {
  socket =
    location.hostname.toLowerCase().startsWith("browsercircus") ||
    location.hostname.toLowerCase().startsWith("www")
      ? io({ path: "/canvas-photo/socket.io" })
      : io();

  userId = "user_" + Math.random().toString(36).substr(2, 9);

  socket.on("historic-tiles", (savedTiles) => {
    for (const t of savedTiles)
      grid.length === 0 ? pendingTiles.push(t) : restoreTile(t);
    loop();
  });
  socket.on("new-tile", (t) => {
    grid.length === 0 ? pendingTiles.push(t) : restoreTile(t);
    loop();
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

  canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("mandala-screen");
  background("#0a0a0f");

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

  // Pan momentum
  if (!isPanning && (Math.abs(panVX) > 0.1 || Math.abs(panVY) > 0.1)) {
    panX += panVX;
    panY += panVY;
    panVX *= PAN_DAMPING;
    panVY *= PAN_DAMPING;
    clampPan();
  }

  push();
  translate(panX, panY);

  const now = millis();
  let anyAnimating = false;

  ripples = ripples.filter((r) => now - r.startTime < RIPPLE_DURATION);
  const hasRipple = ripples.length > 0;

  for (const cell of activeCells) {
    const curX = cell.x + CELL_SIZE / 2 + cell.dx;
    const curY = cell.y + CELL_SIZE / 2 + cell.dy;

    // Own repulsion
    if (isTouching) {
      const dx = curX - touchX,
        dy = curY - touchY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < REPULSION_RADIUS && d > 0) {
        const str = (1 - d / REPULSION_RADIUS) * REPULSION_FORCE;
        cell.vx += (dx / d) * str;
        cell.vy += (dy / d) * str;
        if (Math.abs(cell.vx) + Math.abs(cell.vy) > 0.5) playPluck(curX);
      }
    }

    // Remote repulsion
    for (const [, u] of remoteUsers) {
      if (!u.isActive) continue;
      const dx = curX - u.x,
        dy = curY - u.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < REPULSION_RADIUS && d > 0) {
        const str = (1 - d / REPULSION_RADIUS) * REPULSION_FORCE;
        cell.vx += (dx / d) * str;
        cell.vy += (dy / d) * str;
      }
    }

    // Ripple
    if (hasRipple) {
      for (const r of ripples) {
        const elapsed = now - r.startTime;
        const waveFront = (elapsed / 1000) * RIPPLE_SPEED;
        const dx = curX - r.x,
          dy = curY - r.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const diff = d - waveFront;
        if (Math.abs(diff) < RIPPLE_WIDTH) {
          const str =
            Math.exp((-diff * diff) / (RIPPLE_WIDTH * RIPPLE_WIDTH * 0.5)) *
            RIPPLE_FORCE *
            (1 - elapsed / RIPPLE_DURATION);
          if (d > 0) {
            cell.vx += (dx / d) * str;
            cell.vy += (dy / d) * str;
          }
        }
      }
    }

    // Spring + damping
    cell.vx += -cell.dx * 0.16;
    cell.vy += -cell.dy * 0.16;
    cell.vx *= DAMPING;
    cell.vy *= DAMPING;
    cell.dx += cell.vx;
    cell.dy += cell.vy;

    if (
      Math.abs(cell.vx) +
        Math.abs(cell.vy) +
        Math.abs(cell.dx) +
        Math.abs(cell.dy) >
      0.05
    )
      anyAnimating = true;

    if (!cell.visible) {
      if (now >= cell.visDelay) cell.visible = true;
      else {
        anyAnimating = true;
        continue;
      }
    }
    drawPixelCell(cell);
  }

  pop();

  // Touch indicators (screen space)
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
// GRID
// ═══════════════════════════════════════════════════════════════════════════
function initGrid() {
  worldW = width * 4;
  worldH = height * 4;
  gridCols = Math.ceil(worldW / CELL_SIZE) + 1;
  gridRows = Math.ceil(worldH / CELL_SIZE) + 1;
  panX = -(worldW - width) / 2;
  panY = -(worldH - height) / 2;
  panVX = 0;
  panVY = 0;
  grid = [];
  placedTiles = new Map();
  activeCells = [];
  ripples = [];

  for (let row = 0; row < gridRows; row++)
    for (let col = 0; col < gridCols; col++)
      grid.push({
        col,
        row,
        x: col * CELL_SIZE,
        y: row * CELL_SIZE,
        tileId: null,
        color: null,
        lit: false,
        visible: false,
        visDelay: 0,
        dx: 0,
        dy: 0,
        vx: 0,
        vy: 0,
      });

  for (const t of pendingTiles) restoreTile(t);
  pendingTiles = [];
}

function getCell(col, row) {
  if (col < 0 || row < 0 || col >= gridCols || row >= gridRows) return null;
  return grid[row * gridCols + col];
}

function addOneTile() {
  let originCol,
    originRow,
    found = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    const visCol0 = Math.max(1, Math.floor(-panX / CELL_SIZE) - TILE_CELLS);
    const visRow0 = Math.max(1, Math.floor(-panY / CELL_SIZE) - TILE_CELLS);
    const visCol1 = Math.min(
      gridCols - TILE_CELLS - 1,
      Math.ceil((-panX + width) / CELL_SIZE) + TILE_CELLS,
    );
    const visRow1 = Math.min(
      gridRows - TILE_CELLS - 1,
      Math.ceil((-panY + height) / CELL_SIZE) + TILE_CELLS,
    );
    originCol = Math.floor(Math.random() * (visCol1 - visCol0)) + visCol0;
    originRow = Math.floor(Math.random() * (visRow1 - visRow0)) + visRow0;
    let overlap = false;
    for (let dr = 0; dr < TILE_CELLS && !overlap; dr++)
      for (let dc = 0; dc < TILE_CELLS && !overlap; dc++) {
        const c = getCell(originCol + dc, originRow + dr);
        if (c && c.tileId !== null) overlap = true;
      }
    if (!overlap) {
      found = true;
      break;
    }
  }
  if (!found) return;

  placeTileAt(originCol, originRow, igpTheta, igpTiling, igpMainColor, true);
  socket.emit("new-tile", {
    col: originCol,
    row: originRow,
    theta: igpTheta,
    tiling: igpTiling,
    mainColor: igpMainColor,
  });
}

function restoreTile(t) {
  if (typeof t.theta !== "number" || !t.tiling || !t.mainColor) return;
  placeTileAt(t.col, t.row, t.theta, t.tiling, t.mainColor, false);
}

function placeTileAt(
  originCol,
  originRow,
  theta,
  tilingType,
  mainColor,
  animate,
) {
  const tileId = `${originCol}_${originRow}`;
  if (placedTiles.has(tileId)) return;
  placedTiles.set(tileId, {
    id: tileId,
    originCol,
    originRow,
    theta,
    tilingType,
    mainColor,
  });

  const pixels = rasterizeTile(theta, tilingType);
  const now = millis();
  const cDC = TILE_CELLS / 2,
    cDR = TILE_CELLS / 2;

  for (const px of pixels) {
    const cell = getCell(originCol + px.dcol, originRow + px.drow);
    if (!cell) continue;
    cell.tileId = tileId;
    cell.lit = px.lit;
    cell.color = mainColor;
    if (animate && px.lit) {
      cell.visDelay =
        now +
        Math.sqrt((px.dcol - cDC) ** 2 + (px.drow - cDR) ** 2) * PIXEL_STAGGER;
      cell.visible = false;
    } else {
      cell.visible = true;
    }
    if (px.lit) activeCells.push(cell);
  }
  loop();
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAW HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function drawPixelCell(cell) {
  if (!cell.lit) return;
  noStroke();
  fill(cell.color);
  rect(cell.x + cell.dx, cell.y + cell.dy, CELL_SIZE - 1, CELL_SIZE - 1);
}

function screenToWorld(sx, sy) {
  return { x: sx - panX, y: sy - panY };
}
function clampPan() {
  panX = Math.min(0, Math.max(-(worldW - width), panX));
  panY = Math.min(0, Math.max(-(worldH - height), panY));
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
    document.getElementById("pan-hint")?.classList.add("hidden");
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
    checkShatter(touchX, touchY);
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
    checkShatter(w.x, w.y);
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
  }
}

// ─── Shatter ─────────────────────────────────────────────────────────────────
function checkShatter(x, y) {
  const cell = getCell(Math.floor(x / CELL_SIZE), Math.floor(y / CELL_SIZE));
  if (!cell || !cell.tileId) return;
  const tileCells = activeCells.filter((c) => c.tileId === cell.tileId);
  if (!tileCells.length) return;
  let sumX = 0,
    sumY = 0;
  for (const c of tileCells) {
    sumX += c.x;
    sumY += c.y;
  }
  const tcx = sumX / tileCells.length + CELL_SIZE / 2,
    tcy = sumY / tileCells.length + CELL_SIZE / 2;
  for (const c of tileCells) {
    const px = c.x + CELL_SIZE / 2 - tcx,
      py = c.y + CELL_SIZE / 2 - tcy;
    const d = Math.sqrt(px * px + py * py) || 1;
    const speed = 6 + Math.random() * 8;
    c.vx = (px / d) * speed + (Math.random() - 0.5) * 4;
    c.vy = (py / d) * speed + (Math.random() - 0.5) * 4;
  }
  loop();
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN SWITCHING
// ═══════════════════════════════════════════════════════════════════════════
function showMandalaScreen() {
  document.querySelector("#mandala-screen").style.display = "block";
  canvas.parent("mandala-screen");
  resizeCanvas(windowWidth, windowHeight);
  initGrid();
  loop();
}
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  initGrid();
  redraw();
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
  document.getElementById("pan-hint")?.classList.add("hidden");

  document.getElementById("igp-color-main").value = igpMainColor;
  document.getElementById("swatch-main").style.background = igpMainColor;
  document.getElementById("igp-color-main").oninput = (e) => {
    igpMainColor = e.target.value;
    document.getElementById("swatch-main").style.background = igpMainColor;
    drawPreviewTile();
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
      drawPreviewTile();
    };
  });

  initPreviewGraphics();
  document.getElementById("igp-close").onclick = closeIGPModal;
  document.getElementById("igp-apply").onclick = applyAndGenerate;
}

function closeIGPModal() {
  igpModalOpen = false;
  document.getElementById("igp-modal").style.display = "none";
  document.querySelector("canvas").style.pointerEvents = "auto";
  // Remove preview buffer from DOM and destroy
  if (igpGraphics) {
    igpGraphics.elt.remove();
    igpGraphics.remove();
    igpGraphics = null;
  }
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

// ─── p5 Graphics preview ─────────────────────────────────────────────────────
function initPreviewGraphics() {
  const ctr = document.getElementById("igp-canvas-container");
  const side = Math.round(ctr.getBoundingClientRect().width);

  // Remove any stale canvas
  document.getElementById("igp-canvas")?.remove();
  if (igpGraphics) {
    igpGraphics.remove();
    igpGraphics = null;
  }

  // Create p5 graphics buffer and slot it into the container
  igpGraphics = createGraphics(side, side);
  igpGraphics.pixelDensity(1);
  igpGraphics.elt.id = "igp-canvas";
  ctr.prepend(igpGraphics.elt);

  // Swipe listeners
  ctr.addEventListener("touchstart", prevTouchStart, { passive: false });
  ctr.addEventListener("touchmove", prevTouchMove, { passive: false });
  ctr.addEventListener("touchend", prevTouchEnd, { passive: false });
  ctr.addEventListener("mousemove", prevMouseMove);

  drawPreviewTile();
}

// Draw the preview using p5 drawing API on the graphics buffer
function drawPreviewTile() {
  if (!igpGraphics) return;
  const g = igpGraphics;
  const W = g.width,
    H = g.height;

  g.background("#0a0a0f");

  // Grid dots
  g.noStroke();
  g.fill(255, 255, 255, 26);
  for (let x = 0; x <= W; x += 6)
    for (let y = 0; y <= H; y += 6) g.ellipse(x, y, 1.5, 1.5);

  // Segment cache keyed to theta + tiling
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

  // Draw all segments as one batched shape
  g.noFill();
  g.stroke(igpMainColor);
  g.strokeWeight(1.5);
  g.strokeCap(ROUND);
  g.strokeJoin(ROUND);
  g.beginShape(LINES);
  for (const s of previewSegCache) {
    g.vertex(s.ax * sc + ox, s.ay * sc + oy);
    g.vertex(s.bx * sc + ox, s.by * sc + oy);
  }
  g.endShape();

  // Labels
  const deg = Math.round((igpTheta * 180) / Math.PI);
  g.noStroke();
  g.fill(255, 255, 255, 90);
  g.textSize(11);
  g.textAlign(CENTER, BOTTOM);
  g.text("← drag  ·  angle & tiling", W / 2, H - 8);
  g.fill(255, 255, 255, 150);
  g.textSize(13);
  g.textAlign(CENTER, TOP);
  g.text(`${TILING_LABELS[igpTiling]}  ·  ${deg}°`, W / 2, 10);
}

// ─── Preview touch/mouse ─────────────────────────────────────────────────────
function prevTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  previewLastX = t.clientX;
  previewLastY = t.clientY;
}

function prevTouchMove(e) {
  e.preventDefault();
  if (!igpGraphics) return;
  const t = e.touches[0];
  const dx = t.clientX - previewLastX,
    dy = t.clientY - previewLastY;
  igpTheta = Math.max(
    (10 * Math.PI) / 180,
    Math.min(
      (80 * Math.PI) / 180,
      igpTheta + (dx * ((70 * Math.PI) / 180)) / igpGraphics.width,
    ),
  );
  previewDragY = Math.max(
    0,
    Math.min(TILINGS.length - 1, previewDragY - dy / 80),
  );
  const idx = Math.round(previewDragY);
  if (TILINGS[idx] !== igpTiling) {
    igpTiling = TILINGS[idx];
    document
      .querySelectorAll(".tiling-btn")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.tiling === igpTiling),
      );
  }
  document.getElementById("igp-angle-val").textContent =
    Math.round((igpTheta * 180) / Math.PI) + "°";
  previewLastX = t.clientX;
  previewLastY = t.clientY;
  drawPreviewTile();
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
  if (!igpGraphics) return;
  const rect = igpGraphics.elt.getBoundingClientRect();
  igpTheta =
    ((10 + ((e.clientX - rect.left) / rect.width) * 70) * Math.PI) / 180;
  document.getElementById("igp-angle-val").textContent =
    Math.round((igpTheta * 180) / Math.PI) + "°";
  drawPreviewTile();
}
