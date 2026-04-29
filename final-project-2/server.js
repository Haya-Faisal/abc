const express = require("express");

const https = require("https");
// to read certificates from the filesystem (fs)
const fs = require("fs");

const app = express(); // the server "app", the server behaviour!
const portHTTPS = 3014; // port for https

// Creating object of key and certificate
// for SSL
const options = {
  key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
  cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
};

let HTTPSserver = https.createServer(options, app);

const { Server } = require("socket.io"); // include library
const io = new Server(HTTPSserver); // start socket io

let photos = [];
let dataText = fs.readFileSync("photos.json", "utf8");
photos = JSON.parse(dataText);

// Filter out any photos whose files no longer exist on disk
photos = photos.filter((p) => {
  try {
    fs.accessSync("public/" + p.url);
    return true;
  } catch {
    return false;
  }
});
// Save the cleaned list back
fs.writeFileSync("photos.json", JSON.stringify(photos, null, 2), "utf8");

// HTTPS ROUTES:

// returning to the client anything that is
// inside the public folder
app.use(express.static("public"));

// app.get("/", (req, res) =>{
//     res.sendFile(__dirname + '/public/index.html')
// });

app.post("/upload-photo", (req, res) => {
  console.log("someone upload photo");
  const filename = crypto.randomUUID() + ".png"; // filename with timestamp
  const filepath = "public/uploads/" + filename;
  const writeStream = fs.createWriteStream(filepath);
  req.pipe(writeStream);

  req.on("end", () => {
    // res.json({ url: 'uploads/' + filename });
    res.sendStatus(200);
    // save path to json file
    // let online users know
    let imageURL = "uploads/" + filename;
    photos.push({
      ts: Date.now(),
      url: imageURL,
    });
    let dataAsText = JSON.stringify(photos, null, 2);
    fs.writeFileSync("photos.json", dataAsText, "utf8");
    io.emit("new-photo", { url: imageURL });
  });
});

// SOCKET HANDLING:

io.on("connection", (socket) => {
  // we manage the connection inside here
  console.log("a user connected", socket.id);
  socket.emit("historic-photos", photos);

  socket.on("disconnect", function () {
    console.log("someone disconnected", socket.id);
  });
});

// Creating servers and make them listen at their ports:

HTTPSserver.listen(portHTTPS, function (req, res) {
  console.log("HTTPS Server started at port", portHTTPS);
});
