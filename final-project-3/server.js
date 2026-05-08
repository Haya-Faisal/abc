const express = require("express");
const https = require("https");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const portHTTPS = 4230;

const options = {
  key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
  cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
};

let HTTPSserver = https.createServer(options, app);

const { Server } = require("socket.io");
const io = new Server(HTTPSserver);

// ── Tiles persistence ─────────────────────────────────────────────────────────
const TILES_FILE = "tiles.json";
let tiles = [];

if (fs.existsSync(TILES_FILE)) {
  try {
    tiles = JSON.parse(fs.readFileSync(TILES_FILE, "utf8"));
  } catch (e) {
    console.warn("Could not parse tiles.json, starting fresh.", e.message);
  }
} else {
  fs.writeFileSync(TILES_FILE, "[]", "utf8");
}

function saveTiles() {
  fs.writeFileSync(TILES_FILE, JSON.stringify(tiles, null, 2), "utf8");
}

// ── Active users ──────────────────────────────────────────────────────────────
const activeUsers = new Map();

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static("public"));

// ── Socket ────────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("a user connected", socket.id);

  // Send all saved tiles to new client
  socket.emit("historic-tiles", tiles);

  // New tile placed — save and broadcast
  socket.on("new-tile", (tile) => {
    if (
      typeof tile.theta !== "number" ||
      typeof tile.tiling !== "string" ||
      typeof tile.mainColor !== "string"
    ) {
      console.warn("Rejected malformed tile:", tile);
      return;
    }

    const record = {
      id: tile.id || crypto.randomUUID(),
      col: tile.col,
      row: tile.row,
      wx: tile.wx,
      wy: tile.wy,
      theta: tile.theta,
      tiling: tile.tiling,
      mainColor: tile.mainColor,
      ts: Date.now(),
    };

    const idx = tiles.findIndex((t) => t.id === record.id);
    if (idx !== -1) tiles[idx] = record;
    else tiles.push(record);

    saveTiles();
    socket.broadcast.emit("new-tile", record);
  });

  // Touch position — broadcast so other clients show the ✦ indicator
  socket.on("user-touch-move", ({ userId, x, y }) => {
    if (!userId || typeof x !== "number" || typeof y !== "number") return;
    if (activeUsers.has(userId)) {
      const u = activeUsers.get(userId);
      u.lastTouchX = x;
      u.lastTouchY = y;
      u.lastUpdate = Date.now();
    } else {
      activeUsers.set(userId, {
        socketId: socket.id,
        lastTouchX: x,
        lastTouchY: y,
        lastUpdate: Date.now(),
      });
    }
    socket.broadcast.emit("user-touch-move", { userId, x, y });
  });

  socket.on("user-touch-end", ({ userId }) => {
    if (!userId) return;
    activeUsers.delete(userId);
    socket.broadcast.emit("user-touch-end", { userId });
  });

  // Ripple — broadcast origin so other clients spawn the ripple locally
  socket.on("user-ripple", ({ userId, x, y }) => {
    if (!userId || typeof x !== "number" || typeof y !== "number") return;
    socket.broadcast.emit("user-ripple", { userId, x, y });
  });

  socket.on("disconnect", () => {
    console.log("someone disconnected", socket.id);
    for (const [uid, u] of activeUsers.entries()) {
      if (u.socketId === socket.id) {
        activeUsers.delete(uid);
        io.emit("user-touch-end", { userId: uid });
      }
    }
  });
});

HTTPSserver.listen(portHTTPS, () => {
  console.log("HTTPS Server started at port", portHTTPS);
});
