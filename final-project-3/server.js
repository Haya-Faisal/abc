const express = require("express");
const https = require("https");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const portHTTPS = 3014;

const options = {
  key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
  cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
};

let HTTPSserver = https.createServer(options, app);

const { Server } = require("socket.io");
const io = new Server(HTTPSserver);

// ── Photos (existing) ────────────────────────────────────────────────────────
let photos = [];
let dataText = fs.readFileSync("photos.json", "utf8");
photos = JSON.parse(dataText);
photos = photos.filter((p) => {
  try {
    fs.accessSync("public/" + p.url);
    return true;
  } catch {
    return false;
  }
});
fs.writeFileSync("photos.json", JSON.stringify(photos, null, 2), "utf8");

// ── Tiles (new) ───────────────────────────────────────────────────────────────
// Each tile: { col, row, angleDeg, mainColor, ts }
let tiles = [];
const TILES_FILE = "tiles.json";

if (fs.existsSync(TILES_FILE)) {
  try {
    tiles = JSON.parse(fs.readFileSync(TILES_FILE, "utf8"));
  } catch (e) {
    console.warn("Could not parse tiles.json, starting fresh.", e.message);
    tiles = [];
  }
} else {
  fs.writeFileSync(TILES_FILE, "[]", "utf8");
}

function saveTiles() {
  fs.writeFileSync(TILES_FILE, JSON.stringify(tiles, null, 2), "utf8");
}

// ── Static files ─────────────────────────────────────────────────────────────
app.use(express.static("public"));

// ── Photo upload (existing) ───────────────────────────────────────────────────
app.post("/upload-photo", (req, res) => {
  console.log("someone uploaded a photo");
  const filename = crypto.randomUUID() + ".png";
  const filepath = "public/uploads/" + filename;
  const writeStream = fs.createWriteStream(filepath);
  req.pipe(writeStream);

  req.on("end", () => {
    res.sendStatus(200);
    const imageURL = "uploads/" + filename;
    photos.push({ ts: Date.now(), url: imageURL });
    fs.writeFileSync("photos.json", JSON.stringify(photos, null, 2), "utf8");
    io.emit("new-photo", { url: imageURL });
  });
});

// ── Socket ────────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("a user connected", socket.id);

  // Send existing state to the new client
  socket.emit("historic-photos", photos);
  socket.emit("historic-tiles", tiles);

  // Client placed a new tile
  socket.on("new-tile", (tile) => {
    // Validate with current schema: { col, row, theta, tiling, mainColor }
    if (
      typeof tile.col !== "number" ||
      typeof tile.row !== "number" ||
      typeof tile.theta !== "number" ||
      typeof tile.tiling !== "string" ||
      typeof tile.mainColor !== "string"
    ) {
      console.warn("Rejected malformed tile:", tile);
      return;
    }

    const record = {
      col: tile.col,
      row: tile.row,
      theta: tile.theta,
      tiling: tile.tiling,
      mainColor: tile.mainColor,
      ts: Date.now(),
    };

    // Upsert — replace if same cell already exists
    const idx = tiles.findIndex(
      (t) => t.col === tile.col && t.row === tile.row,
    );
    if (idx !== -1) tiles[idx] = record;
    else tiles.push(record);

    saveTiles();

    // Broadcast to all OTHER clients
    socket.broadcast.emit("new-tile", record);
  });

  socket.on("disconnect", () => {
    console.log("someone disconnected", socket.id);
  });
});

HTTPSserver.listen(portHTTPS, () => {
  console.log("HTTPS Server started at port", portHTTPS);
});
