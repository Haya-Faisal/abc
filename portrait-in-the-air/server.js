const express = require("express");
const https = require("https");
// to read certificates from the filesystem (fs)
const fs = require("fs");
const path = require("path");
const app = express();
const portHTTPS = 4290;
const KITES_FILE = path.join(__dirname, "kites.json");
// returning to the client anything that is
// inside the public folder
//taking the images from the json file
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));
const options = {
  key: fs.readFileSync("localhost-key.pem"),
  cert: fs.readFileSync("localhost.pem"),
};

const HTTPSserver = https.createServer(options, app);

const { Server } = require("socket.io");
const io = new Server(HTTPSserver);

let currentlyConnected = [];

//does kite.json exist
if (!fs.existsSync(KITES_FILE)) {
  fs.writeFileSync(KITES_FILE, JSON.stringify([]));
}

function loadKites() {
  try {
    return JSON.parse(fs.readFileSync(KITES_FILE, "utf8"));
  } catch (e) {
    return [];
  }
}

function saveKite(kite) {
  const kites = loadKites();
  kites.push(kite);
  fs.writeFileSync(KITES_FILE, JSON.stringify(kites, null, 2));
}

// base64 images can be a few MB so raise the limit
app.use(express.json({ limit: "10mb" }));

// GET /kites  — return all saved kites (for sky screen on load)
app.get("/kites", (req, res) => {
  //respond with json. string parameter
  res.json(loadKites());
});

// POST /kites — save a new kite, broadcast to all sky screens
app.post("/kites", (req, res) => {
  const kite = req.body;
  if (!kite || !kite.imageData) {
    return res.status(400).json({ error: "missing imageData" });
  }
  //save new kite
  //emit out
  //res with json file stringify
  kite.id = Date.now();
  kite.createdAt = new Date().toISOString();
  saveKite(kite);
  console.log("New kite saved:", kite.id);
  io.emit("new-kite", kite);
  res.json({ ok: true, kite });
});

io.on("connection", (socket) => {
  console.log("a user connected", socket.id);
  currentlyConnected.push(socket.id);

  socket.on("disconnect", function () {
    console.log("someone disconnected", socket.id);
    currentlyConnected = currentlyConnected.filter((id) => id !== socket.id);
  });
});

HTTPSserver.listen(portHTTPS, () => {
  console.log("HTTPS Server started at port", portHTTPS);
  console.log("Map : https://localhost:" + portHTTPS);
  console.log("Sky : https://localhost:" + portHTTPS + "/sky.html");
});
