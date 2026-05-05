let socket;
let canvas;

// Grid
const CELL_SIZE = 6;
const TILE_CELLS = 21;
let gridCols, gridRows;
let grid = [];
let placedTiles = new Map();
let pendingTiles = [];
const rasterCache = {};

//  IGP settings
let igpTheta = Math.PI / 4; // Hankin angle (radians)
let igpTiling = "square"; // "square" | "hexagonal" | "squareOctagon"
let igpMainColor = "#1a4a8a";

//  Repulsion
const REPULSION_RADIUS = 90;
const REPULSION_FORCE = 5;
const DAMPING = 0.74;
let touchX = -9999,
  touchY = -9999;
let touchStartX = -9999,
  touchStartY = -9999; // for tap detection
let isTouching = false;

//  Animation
const PIXEL_STAGGER = 12;

// Active cells (only lit cells — avoids iterating whole grid)
let activeCells = [];

// Ripples

const RIPPLE_SPEED = 280;
const RIPPLE_FORCE = 9;
const RIPPLE_WIDTH = 40;
const RIPPLE_DURATION = 1400;
let ripples = [];

let longPressTimer = null;
let longPressX = 0;
let longPressY = 0;
const LONG_PRESS_MS = 500;

// Pan / virtual camera
let panX = 0,
  panY = 0; // current pan offset (pixels)
let panVX = 0,
  panVY = 0; // pan velocity for momentum
let isPanning = false;
let panLastX = 0,
  panLastY = 0;
let worldW, worldH; // set in initGrid
const PAN_DAMPING = 0.88; // momentum decay

//  Modal
let igpModalOpen = false;
let previewDragX = 0;
let previewDragY = 0;
let previewLastX = null;
let previewLastY = null;
let previewSegCache = null;
let previewSegKey = null;
let previewBBox = null;
const TILINGS = ["squareOctagon", "rhombitrihexagonal"];

//Touch Position Sync
const TOUCH_SYNC_THROTTLE = 50;
let lastTouchSyncTime = 0;
const remoteUsers = new Map(); // { userId: { x, y, lastUpdate, isActive } }
let userId = null;

//  Web Audio API
let audioContext = null;
let masterGain = null;
let lastPluckTime = 0;
const PLUCK_COOLDOWN = 100;

// AUDIO INITIALIZATION
function initAudio() {
  if (audioContext) return; // Already initialized

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.25; // Overall volume control
  masterGain.connect(audioContext.destination);
}

// Play pluck sound (triggered on particle collision)
function playPluck(x, y) {
  if (!audioContext) initAudio();

  const now = Date.now();
  if (now - lastPluckTime < PLUCK_COOLDOWN) return;
  lastPluckTime = now;

  // Pluck oscillator
  const pluckOsc = audioContext.createOscillator();
  pluckOsc.type = "triangle";

  // Map x position to frequency (left = low, right = high)
  const minFreq = 300;
  const maxFreq = 800;
  const freq = minFreq + (x / worldW) * (maxFreq - minFreq);
  pluckOsc.frequency.value = freq;

  // Pluck envelope (quick attack, decay)
  const pluckGain = audioContext.createGain();
  pluckGain.gain.setValueAtTime(0.3, audioContext.currentTime);
  pluckGain.gain.exponentialRampToValueAtTime(
    0.01,
    audioContext.currentTime + 0.15,
  );

  pluckOsc.connect(pluckGain);
  pluckGain.connect(masterGain);

  pluckOsc.start(audioContext.currentTime);
  pluckOsc.stop(audioContext.currentTime + 0.15);
}

// HANKIN - some parts are taken from Shiffman's IGP pattern code
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

    // Edge direction unit vector
    const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    const ex = (b.x - a.x) / len,
      ey = (b.y - a.y) / len;

    // Inward perpendicular
    let px = -ey,
      py = ex;
    const toCx = cen.x - mid.x,
      toCy = cen.y - mid.y;
    if (px * toCx + py * toCy < 0) {
      px = -px;
      py = -py;
    }

    // Two ray directions rotated ±theta from inward perp
    const dA = rotVec(px, py, theta);
    const dB = rotVec(px, py, -theta);

    // Intersect the two rays
    const pt = hankinIntersect(a, { x: a.x + dA.x, y: a.y + dA.y }, b, {
      x: b.x + dB.x,
      y: b.y + dB.y,
    });
    if (!pt) continue;

    // Check pt is inside polygon (rough: close to centroid side)
    lines.push({ ax: a.x, ay: a.y, bx: pt.x, by: pt.y });
    lines.push({ ax: b.x, ay: b.y, bx: pt.x, by: pt.y });
  }
  return lines;
}

// Build one  polygon unit centered at (0,0)
function buildUnitPolygons(tilingType, size) {
  const polys = [];

  if (tilingType === "squareOctagon") {
    // Octagon
    const r8 = size / (2 * Math.cos(Math.PI / 8));
    const oct = [];
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + (k * Math.PI * 2) / 8;
      oct.push({ x: r8 * Math.cos(a), y: r8 * Math.sin(a) });
    }
    polys.push(oct);
    // Four connector squares
    const a2 = size / (1 + Math.sqrt(2));
    const offs = [
      { x: size * 0.5 + a2 * 0.5, y: 0 },
      { x: -(size * 0.5 + a2 * 0.5), y: 0 },
      { x: 0, y: size * 0.5 + a2 * 0.5 },
      { x: 0, y: -(size * 0.5 + a2 * 0.5) },
    ];
    for (const o of offs) {
      const h = a2 / 2;
      polys.push([
        { x: o.x - h, y: o.y - h },
        { x: o.x + h, y: o.y - h },
        { x: o.x + h, y: o.y + h },
        { x: o.x - h, y: o.y + h },
      ]);
    }
  } else if (tilingType === "rhombitrihexagonal") {
    //  one central hexagon + 6 surrounding squares + 6 triangles
    // Central hexagon
    const hex = [];
    const rH = size * 0.38;
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      hex.push({ x: rH * Math.cos(a), y: rH * Math.sin(a) });
    }
    polys.push(hex);

    // 6 squares arranged around the hexagon
    const rS = rH + (rH * Math.sqrt(3)) / 2; // distance from centre to square centre
    const sH = (rH * Math.sqrt(3)) / 2; // half-side of square
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      const scx = (rH + sH) * Math.cos(a);
      const scy = (rH + sH) * Math.sin(a);
      // Square perpendicular to the radial direction
      const nx = Math.cos(a + Math.PI / 2) * sH;
      const ny = Math.sin(a + Math.PI / 2) * sH;
      const rx = Math.cos(a) * sH;
      const ry = Math.sin(a) * sH;
      polys.push([
        { x: scx - nx - rx, y: scy - ny - ry },
        { x: scx + nx - rx, y: scy + ny - ry },
        { x: scx + nx + rx, y: scy + ny + ry },
        { x: scx - nx + rx, y: scy - ny + ry },
      ]);
    }

    // 6 equilateral triangles filling the gaps between squares
    for (let k = 0; k < 6; k++) {
      const a1 = Math.PI / 6 + (k * Math.PI) / 3;
      const a2 = Math.PI / 6 + ((k + 1) * Math.PI) / 3;
      const tR = rH + sH * 2;
      // Triangle: two outer corners of adjacent squares + far tip
      const ax =
        (rH + sH) * Math.cos(a1) +
        Math.cos(a1 + Math.PI / 2) * sH +
        Math.cos(a1) * sH;
      const ay =
        (rH + sH) * Math.sin(a1) +
        Math.sin(a1 + Math.PI / 2) * sH +
        Math.sin(a1) * sH;
      const bx =
        (rH + sH) * Math.cos(a2) -
        Math.cos(a2 + Math.PI / 2) * sH +
        Math.cos(a2) * sH;
      const by =
        (rH + sH) * Math.sin(a2) -
        Math.sin(a2 + Math.PI / 2) * sH +
        Math.sin(a2) * sH;
      const amid = (a1 + a2) / 2;
      const tx = tR * Math.cos(amid);
      const ty = tR * Math.sin(amid);
      polys.push([
        { x: ax, y: ay },
        { x: bx, y: by },
        { x: tx, y: ty },
      ]);
    }
  }

  return polys;
}

// RASTERIZE —
function cacheKey(theta, tilingType) {
  return `${tilingType}_${Math.round(theta * 1000)}`;
}

function rasterizeTile(theta, tilingType) {
  const key = cacheKey(theta, tilingType);
  if (rasterCache[key]) return rasterCache[key];

  const RENDER_SIZE = 512;

  // Step 1: generate all segments at unit scale (size=1, centered at 0,0)
  const unitPolys = buildUnitPolygons(tilingType, 1.0);
  const allSegs = [];
  for (const verts of unitPolys) {
    const segs = hankinLines(verts, theta);
    for (const s of segs) allSegs.push(s);
  }
  if (allSegs.length === 0) {
    rasterCache[key] = [];
    return [];
  }

  // Step 2: find true bounding box of ALL segment endpoints
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

  // Step 3: scale so the full bounding box fits RENDER_SIZE with padding
  const pad = 0.04;
  const range = Math.max(maxX - minX, maxY - minY);
  const scale = (RENDER_SIZE * (1 - pad * 2)) / range;
  const offX = RENDER_SIZE / 2 - (minX + (maxX - minX) / 2) * scale;
  const offY = RENDER_SIZE / 2 - (minY + (maxY - minY) / 2) * scale;

  // Step 4: draw into offscreen canvas
  const off = document.createElement("canvas");
  off.width = off.height = RENDER_SIZE;
  const ctx = off.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, RENDER_SIZE, RENDER_SIZE);

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = (RENDER_SIZE / TILE_CELLS) * 0.9;
  ctx.lineCap = "square";

  for (const s of allSegs) {
    ctx.beginPath();
    ctx.moveTo(s.ax * scale + offX, s.ay * scale + offY);
    ctx.lineTo(s.bx * scale + offX, s.by * scale + offY);
    ctx.stroke();
  }

  // Step 5: downsample full canvas into TILE_CELLS grid
  const imgData = ctx.getImageData(0, 0, RENDER_SIZE, RENDER_SIZE);
  const cellPx = RENDER_SIZE / TILE_CELLS;
  const pixels = [];
  for (let drow = 0; drow < TILE_CELLS; drow++) {
    for (let dcol = 0; dcol < TILE_CELLS; dcol++) {
      const px = Math.floor(dcol * cellPx + cellPx / 2);
      const py = Math.floor(drow * cellPx + cellPx / 2);
      const idx = (py * RENDER_SIZE + px) * 4;
      const b =
        (imgData.data[idx] + imgData.data[idx + 1] + imgData.data[idx + 2]) / 3;
      pixels.push({ dcol, drow, lit: b > 80 });
    }
  }

  rasterCache[key] = pixels;
  return pixels;
}

function setup() {
  if (
    location.hostname.toLowerCase().startsWith("browsercircus") ||
    location.hostname.toLowerCase().startsWith("www")
  ) {
    socket = io({ path: "/canvas-photo/socket.io" });
  } else {
    socket = io();
  }

  userId = "user_" + Math.random().toString(36).substr(2, 9);

  // Listen for historic tiles
  socket.on("historic-tiles", function (savedTiles) {
    for (const t of savedTiles) {
      if (grid.length === 0) pendingTiles.push(t);
      else restoreTile(t);
    }
    loop();
  });

  // Listen for new tiles
  socket.on("new-tile", function (t) {
    if (grid.length === 0) pendingTiles.push(t);
    else restoreTile(t);
    loop();
  });

  // Listen for remote user touch positions
  socket.on("user-touch-move", function (data) {
    const { userId: remoteUserId, x, y } = data;
    if (remoteUserId === userId) return; // Ignore own updates

    if (!remoteUsers.has(remoteUserId)) {
      remoteUsers.set(remoteUserId, {
        x,
        y,
        lastUpdate: Date.now(),
        isActive: true,
      });
    } else {
      const user = remoteUsers.get(remoteUserId);
      user.x = x;
      user.y = y;
      user.lastUpdate = Date.now();
      user.isActive = true;
    }
    loop();
  });

  // Listen for remote user stop touching
  socket.on("user-touch-end", function (data) {
    const { userId: remoteUserId } = data;
    if (remoteUsers.has(remoteUserId)) {
      const user = remoteUsers.get(remoteUserId);
      user.isActive = false;
      // Remove after 500ms
      setTimeout(() => {
        remoteUsers.delete(remoteUserId);
      }, 500);
    }
    loop();
  });

  canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("mandala-screen");

  const introBtn = document.querySelector("#introButton");
  if (introBtn)
    introBtn.addEventListener("click", function () {
      document.querySelector("#intro-screen").style.display = "none";
      showMandalaScreen();
    });

  // Initialize audio on first user interaction
  document.addEventListener("click", initAudio, { once: true });
  document.addEventListener("touchstart", initAudio, { once: true });

  noLoop();
}

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

  // Apply camera transform
  push();
  translate(panX, panY);
  // drawGridDots();

  const now = millis();
  let anyAnimating = false;

  // Cull dead ripples
  ripples = ripples.filter((r) => now - r.startTime < RIPPLE_DURATION);
  const hasRipple = ripples.length > 0;

  for (const cell of activeCells) {
    const homeX = cell.x + CELL_SIZE / 2;
    const homeY = cell.y + CELL_SIZE / 2;
    const curX = homeX + cell.dx;
    const curY = homeY + cell.dy;

    // Repulsion (own touch)
    if (isTouching) {
      const distX = curX - touchX,
        distY = curY - touchY;
      const d = Math.sqrt(distX * distX + distY * distY);
      if (d < REPULSION_RADIUS && d > 0) {
        const str = (1 - d / REPULSION_RADIUS) * REPULSION_FORCE;
        cell.vx += (distX / d) * str;
        cell.vy += (distY / d) * str;
        // Play pluck sound if particle was hit
        if (Math.abs(cell.vx) + Math.abs(cell.vy) > 0.5) {
          playPluck(curX, curY);
        }
      }
    }

    // Repulsion (remote users)
    for (const [remoteUserId, remoteUser] of remoteUsers) {
      if (remoteUser.isActive) {
        const distX = curX - remoteUser.x,
          distY = curY - remoteUser.y;
        const d = Math.sqrt(distX * distX + distY * distY);
        if (d < REPULSION_RADIUS && d > 0) {
          const str = (1 - d / REPULSION_RADIUS) * REPULSION_FORCE;
          cell.vx += (distX / d) * str;
          cell.vy += (distY / d) * str;
        }
      }
    }

    // Ripple
    if (hasRipple) {
      for (const r of ripples) {
        const elapsed = now - r.startTime;
        const waveFront = (elapsed / 1000) * RIPPLE_SPEED;
        const distX = curX - r.x,
          distY = curY - r.y;
        const d = Math.sqrt(distX * distX + distY * distY);
        const diff = d - waveFront;
        // Gaussian band: push outward as wave passes
        if (Math.abs(diff) < RIPPLE_WIDTH) {
          const falloff = 1 - elapsed / RIPPLE_DURATION;
          const strength =
            Math.exp((-diff * diff) / (RIPPLE_WIDTH * RIPPLE_WIDTH * 0.5)) *
            RIPPLE_FORCE *
            falloff;
          if (d > 0) {
            cell.vx += (distX / d) * strength;
            cell.vy += (distY / d) * strength;
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

    const moving =
      Math.abs(cell.vx) +
        Math.abs(cell.vy) +
        Math.abs(cell.dx) +
        Math.abs(cell.dy) >
      0.05;
    if (moving) anyAnimating = true;

    // ── Reveal animation
    if (!cell.visible) {
      if (now >= cell.visDelay) {
        cell.visible = true;
      } else {
        anyAnimating = true;
        continue;
      }
    }

    drawPixelCell(cell);
  }

  pop(); // end camera transform

  // ── Draw remote user touch indicators
  for (const [remoteUserId, remoteUser] of remoteUsers) {
    if (remoteUser.isActive) {
      drawRemoteTouchIndicator(remoteUser.x, remoteUser.y);
    }
  }

  // ── Draw own touch indicator
  if (isTouching) {
    drawOwnTouchIndicator(touchX, touchY);
  }

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

function drawOwnTouchIndicator(wx, wy) {
  const sx = wx + panX;
  const sy = wy + panY;
  push();
  noStroke();
  fill(255, 255, 255, 255);
  textSize(18);
  textAlign(CENTER, CENTER);
  text("✦", sx, sy);
  pop();
}

function drawRemoteTouchIndicator(wx, wy) {
  const sx = wx + panX;
  const sy = wy + panY;
  push();
  noStroke();
  fill(255, 255, 255, 77);
  textSize(18);
  textAlign(CENTER, CENTER);
  text("✦", sx, sy);
  pop();
}

// GRID
function initGrid() {
  worldW = width * 4;
  worldH = height * 4;
  gridCols = Math.ceil(worldW / CELL_SIZE) + 1;
  gridRows = Math.ceil(worldH / CELL_SIZE) + 1;
  // Start panned to centre of world
  panX = -(worldW - width) / 2;
  panY = -(worldH - height) / 2;
  panVX = 0;
  panVY = 0;
  grid = [];
  placedTiles = new Map();

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
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
    }
  }

  activeCells = [];
  ripples = [];
  for (const t of pendingTiles) restoreTile(t);
  pendingTiles = [];
}

function getCell(col, row) {
  if (col < 0 || row < 0 || col >= gridCols || row >= gridRows) return null;
  return grid[row * gridCols + col];
}

function addOneTile() {
  const maxAttempts = 80;
  let originCol,
    originRow,
    found = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Place within the currently visible viewport + a little padding
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
        const cell = getCell(originCol + dc, originRow + dr);
        if (cell && cell.tileId !== null) overlap = true;
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
  // Guard against stale tiles saved with old schema
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
      const dist = Math.sqrt((px.dcol - cDC) ** 2 + (px.drow - cDR) ** 2);
      cell.visDelay = now + dist * PIXEL_STAGGER;
      cell.visible = false;
    } else {
      cell.visible = true;
    }
    // Only track lit cells in activeCells for perf
    if (px.lit) activeCells.push(cell);
  }
  loop();
}

// DRAW HELPERS
function drawGridDots() {
  // Only draw dots visible in current view (perf optimisation)
  const startCol = Math.max(0, Math.floor(-panX / CELL_SIZE) - 1);
  const startRow = Math.max(0, Math.floor(-panY / CELL_SIZE) - 1);
  const endCol = Math.min(
    gridCols,
    startCol + Math.ceil(width / CELL_SIZE) + 2,
  );
  const endRow = Math.min(
    gridRows,
    startRow + Math.ceil(height / CELL_SIZE) + 2,
  );

  stroke(255, 255, 255, 10);
  strokeWeight(0.4);
  noFill();
  for (let col = startCol; col <= endCol; col++)
    line(
      col * CELL_SIZE,
      startRow * CELL_SIZE,
      col * CELL_SIZE,
      endRow * CELL_SIZE,
    );
  for (let row = startRow; row <= endRow; row++)
    line(
      startCol * CELL_SIZE,
      row * CELL_SIZE,
      endCol * CELL_SIZE,
      row * CELL_SIZE,
    );
  fill(255, 255, 255, 22);
  noStroke();
  for (let col = startCol; col <= endCol; col++)
    for (let row = startRow; row <= endRow; row++)
      ellipse(col * CELL_SIZE, row * CELL_SIZE, 2, 2);
}

function drawPixelCell(cell) {
  if (!cell.lit) return;
  noStroke();
  fill(cell.color);
  rect(cell.x + cell.dx, cell.y + cell.dy, CELL_SIZE - 1, CELL_SIZE - 1);
}

// TOUCH / MOUSE
// Convert screen coords → world coords
function screenToWorld(sx, sy) {
  return { x: sx - panX, y: sy - panY };
}

function touchStarted() {
  if (igpModalOpen) return;

  // Check if touch is on a button or modal — if so, let browser handle it
  if (touches[0]) {
    const el = document.elementFromPoint(touches[0].x, touches[0].y);
    if (
      el &&
      (el.tagName === "BUTTON" ||
        el.closest("button") ||
        el.closest("#igp-modal"))
    ) {
      // Don't preventDefault — let browser fire click event
      return;
    }
  }

  if (touches.length >= 2) {
    // Two fingers → pan
    cancelLongPress();
    isPanning = true;
    isTouching = false;
    panLastX = (touches[0].x + touches[1].x) / 2;
    panLastY = (touches[0].y + touches[1].y) / 2;
    panVX = 0;
    panVY = 0;
    loop();
    return false; // Only preventDefault for canvas touch
  } else if (touches.length === 1) {
    // One finger → start long-press timer + repulsion
    isPanning = false;
    const w = screenToWorld(touches[0].x, touches[0].y);
    touchX = w.x;
    touchY = w.y;
    touchStartX = touchX;
    touchStartY = touchY;
    isTouching = true;

    // Start long-press countdown
    longPressX = touches[0].x;
    longPressY = touches[0].y;
    longPressTimer = setTimeout(() => {
      // Only fire if finger hasn't moved much
      isTouching = false;
      cancelLongPress();
      openIGPModal();
    }, LONG_PRESS_MS);
    loop();
    return false; // Only preventDefault for canvas touch
  }
}

function touchMoved() {
  if (igpModalOpen) return false;

  if (isPanning && touches.length >= 2) {
    const cx = (touches[0].x + touches[1].x) / 2;
    const cy = (touches[0].y + touches[1].y) / 2;
    const dx = cx - panLastX;
    const dy = cy - panLastY;
    panVX = dx;
    panVY = dy;
    panX += dx;
    panY += dy;
    clampPan();
    panLastX = cx;
    panLastY = cy;
    const hint = document.getElementById("pan-hint");
    if (hint) hint.classList.add("hidden");
    loop();
    return false;
  }

  if (isTouching && touches.length === 1) {
    const w = screenToWorld(touches[0].x, touches[0].y);
    touchX = w.x;
    touchY = w.y;

    // Cancel long press if finger moves more than 10px
    const moved = Math.sqrt(
      (touches[0].x - longPressX) ** 2 + (touches[0].y - longPressY) ** 2,
    );
    if (moved > 10) cancelLongPress();

    // Wake ripple while dragging
    if (Math.random() < 0.15) {
      ripples.push({ x: touchX, y: touchY, startTime: millis() });
    }

    const now = Date.now();
    if (now - lastTouchSyncTime > TOUCH_SYNC_THROTTLE) {
      socket.emit("user-touch-move", {
        userId: userId,
        x: touchX,
        y: touchY,
      });
      lastTouchSyncTime = now;
    }

    loop();
    return false;
  }

  // If not panning or touching on canvas, don't preventDefault
  return;
}

function touchEnded() {
  cancelLongPress();
  if (isPanning) {
    isPanning = false;
    loop();
    return false;
  }
  if (!isTouching) {
    // Not on canvas, let browser handle
    return;
  }
  isTouching = false;
  const moved = Math.sqrt(
    (touchX - touchStartX) ** 2 + (touchY - touchStartY) ** 2,
  );
  if (moved < 14) {
    ripples.push({ x: touchX, y: touchY, startTime: millis() });
    checkShatter(touchX, touchY);
  }

  socket.emit("user-touch-end", {
    userId: userId,
  });

  loop();
  return false;
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

// Mouse equivalents (desktop)
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
  const moved = Math.sqrt((w.x - touchStartX) ** 2 + (w.y - touchStartY) ** 2);
  if (moved < 14) {
    ripples.push({ x: w.x, y: w.y, startTime: millis() });
    checkShatter(w.x, w.y);
  }

  // ── Notify other users that we stopped touching
  socket.emit("user-touch-end", {
    userId: userId,
  });
}
function mouseDragged() {
  // Cancel long press if mouse moves
  const moved = Math.sqrt(
    (mouseX - longPressX) ** 2 + (mouseY - longPressY) ** 2,
  );
  if (moved > 10) cancelLongPress();

  // ── Throttled sync of touch position to other users (desktop)
  if (isTouching) {
    const now = Date.now();
    if (now - lastTouchSyncTime > TOUCH_SYNC_THROTTLE) {
      socket.emit("user-touch-move", {
        userId: userId,
        x: touchX,
        y: touchY,
      });
      lastTouchSyncTime = now;
    }
  }
}

function checkShatter(x, y) {
  // x,y already in world coords
  const col = Math.floor(x / CELL_SIZE);
  const row = Math.floor(y / CELL_SIZE);
  const cell = getCell(col, row);
  if (!cell || !cell.tileId) return;

  shatterTile(cell.tileId);
}

function shatterTile(tileId) {
  const tileCells = activeCells.filter((c) => c.tileId === tileId);
  if (tileCells.length === 0) return;

  // Find tile centre
  let sumX = 0,
    sumY = 0;
  for (const c of tileCells) {
    sumX += c.x;
    sumY += c.y;
  }
  const tcx = sumX / tileCells.length + CELL_SIZE / 2;
  const tcy = sumY / tileCells.length + CELL_SIZE / 2;

  for (const c of tileCells) {
    const px = c.x + CELL_SIZE / 2 - tcx;
    const py = c.y + CELL_SIZE / 2 - tcy;
    const d = Math.sqrt(px * px + py * py) || 1;
    // Outward burst + random scatter
    const speed = 6 + Math.random() * 8;
    c.vx = (px / d) * speed + (Math.random() - 0.5) * 4;
    c.vy = (py / d) * speed + (Math.random() - 0.5) * 4;
  }
  loop();
}

// SCREEN SWITCHING
function clampPan() {
  panX = Math.min(0, Math.max(-(worldW - width), panX));
  panY = Math.min(0, Math.max(-(worldH - height), panY));
}

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

// IGP MODAL
function openIGPModal() {
  igpModalOpen = true;
  previewDragX = igpTheta; // start from current theta
  previewDragY = TILINGS.indexOf(igpTiling);
  previewLastX = null;
  previewLastY = null;
  document.getElementById("igp-modal").style.display = "flex";
  // Disable canvas pointer events so buttons receive touches
  document.querySelector("canvas").style.pointerEvents = "none";
  // Hide hint once user discovers long-press
  const hint = document.getElementById("pan-hint");
  if (hint) hint.classList.add("hidden");

  // Color picker
  document.getElementById("igp-color-main").value = igpMainColor;
  document.getElementById("swatch-main").style.background = igpMainColor;
  document.getElementById("igp-color-main").oninput = function (e) {
    igpMainColor = e.target.value;
    document.getElementById("swatch-main").style.background = igpMainColor;
    renderPreview();
  };

  // Tiling buttons
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
  // Re-enable canvas pointer events
  document.querySelector("canvas").style.pointerEvents = "auto";
  // Remove preview touch listeners
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

// ── Preview canvas ──────────────────────────────────────────────────────────
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

  // Touch/swipe handlers on the preview
  ctr.addEventListener("touchstart", prevTouchStart, { passive: false });
  ctr.addEventListener("touchmove", prevTouchMove, { passive: false });
  ctr.addEventListener("touchend", prevTouchEnd, { passive: false });
  ctr.addEventListener("mousemove", prevMouseMove);

  renderPreview();
}

// Two-finger swipe: X → theta, Y → tiling index
function prevTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 2) {
    previewLastX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    previewLastY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
  } else if (e.touches.length === 1) {
    previewLastX = e.touches[0].clientX;
    previewLastY = e.touches[0].clientY;
  }
}

function prevTouchMove(e) {
  e.preventDefault();
  const cx = document.getElementById("igp-canvas");
  const W = cx ? cx.width : 300;

  let curX, curY;
  if (e.touches.length === 2) {
    curX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    curY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
  } else {
    curX = e.touches[0].clientX;
    curY = e.touches[0].clientY;
  }

  if (previewLastX !== null) {
    const dx = curX - previewLastX;
    const dy = curY - previewLastY;

    // X drag → theta (10°–80°)
    igpTheta = Math.max(
      (10 * Math.PI) / 180,
      Math.min(
        (80 * Math.PI) / 180,
        igpTheta + (dx * ((70 * Math.PI) / 180)) / W,
      ),
    );

    // Y drag → tiling type (snap zones)
    previewDragY = Math.max(
      0,
      Math.min(TILINGS.length - 1, previewDragY - dy / 80),
    );
    const newTilingIdx = Math.round(previewDragY);
    if (TILINGS[newTilingIdx] !== igpTiling) {
      igpTiling = TILINGS[newTilingIdx];
      document
        .querySelectorAll(".tiling-btn")
        .forEach((b) =>
          b.classList.toggle("active", b.dataset.tiling === igpTiling),
        );
    }

    // Update angle display
    const deg = Math.round((igpTheta * 180) / Math.PI);
    document.getElementById("igp-angle-val").textContent = deg + "°";

    renderPreview();
  }
  previewLastX = curX;
  previewLastY = curY;
}

function prevTouchEnd() {
  previewLastX = null;
  previewLastY = null;
}

let _prevMouseThrottle = 0;
function prevMouseMove(e) {
  const now = Date.now();
  if (now - _prevMouseThrottle < 32) return; // ~30fps
  _prevMouseThrottle = now;
  const cvs = document.getElementById("igp-canvas");
  if (!cvs) return;
  const rect = cvs.getBoundingClientRect();
  const t = (e.clientX - rect.left) / rect.width;
  igpTheta = ((10 + t * 70) * Math.PI) / 180;
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

  // Background + grid dots
  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  for (let x = 0; x <= W; x += 6)
    for (let y = 0; y <= H; y += 6) {
      ctx.beginPath();
      ctx.arc(x, y, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

  // Recompute segments + bbox only when theta or tiling changes
  const segKey = `${igpTiling}_${Math.round(igpTheta * 1000)}`;
  if (segKey !== previewSegKey) {
    const unitPolys = buildUnitPolygons(igpTiling, 1.0);
    const allSegs = [];
    for (const verts of unitPolys)
      for (const s of hankinLines(verts, igpTheta)) allSegs.push(s);

    if (allSegs.length > 0) {
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

  if (!previewSegCache || previewSegCache.length === 0) return;

  const { minX, maxX, minY, maxY } = previewBBox;
  const pad = 0.06;
  const range = Math.max(maxX - minX, maxY - minY);
  const scale = (Math.min(W, H) * (1 - pad * 2)) / range;
  const offX = W / 2 - (minX + (maxX - minX) / 2) * scale;
  const offY = H / 2 - (minY + (maxY - minY) / 2) * scale;

  ctx.strokeStyle = igpMainColor;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  for (const s of previewSegCache) {
    ctx.moveTo(s.ax * scale + offX, s.ay * scale + offY);
    ctx.lineTo(s.bx * scale + offX, s.by * scale + offY);
  }
  ctx.stroke();

  // Labels
  ctx.fillStyle = "rgba(255,255,255)";
  ctx.font = "11px 'Cormorant Garamond', serif";
  ctx.textAlign = "center";
  ctx.fillText("← drag to change angle", W / 2, H - 10);
  const deg = Math.round((igpTheta * 180) / Math.PI);
}
