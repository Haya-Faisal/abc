// --- Socket setup ---
let socket;

// p5 sketch variables
let video;
let snapped = false;
let canvas;
let mode = "camera"; // camera or mandala

let baseSymmetry = 12;
let maxLayers = 0;
let maxLimit = 20;
let layerStep = 1 / baseSymmetry;
let photoImages = [];
let lineCounter = 0;

let camSound;
let sendButton;
let captureButton;

function setup() {
  if (
    location.hostname.toLowerCase().startsWith("browsercircus") ||
    location.hostname.toLowerCase().startsWith("www")
  ) {
    socket = io({ path: "/canvas-photo/socket.io" });
  } else {
    socket = io();
  }

  //  Socket handlers

  socket.on("historic-photos", function (data) {
    for (photo of data) {
      addMandalaLayer(photo.url);
    }
  });

  socket.on("new-photo", function (data) {
    console.log(data);
    addMandalaLayer(data.url);
  });

  canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("canvas-wrapper");

  let canvasDisplayHeight = window.innerHeight / 3;
  canvas.elt.style.height = canvasDisplayHeight + "px";
  canvas.elt.style.width =
    canvasDisplayHeight * (windowWidth / windowHeight) + "px";

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
      captureButton.style.backgroundColor = "rgb(255, 191, 191)";
      camSound.play();
    } else {
      resetCamera();
    }
  });

  sendButton.addEventListener("click", function () {
    canvas.elt.toBlob(sendImageToServer, "image/png");
  });
}

function draw() {
  if (mode === "camera") {
    if (!snapped) {
      image(video, 0, 0, width, height);
    }
  }

  if (mode === "mandala") {
    lineCounter = 0;
    background(200);
    translate(width / 2, height / 2);

    let scaleFactor = 0.8 + 0.1 * sin(frameCount * 0.02);
    scale(scaleFactor);

    let fullLayers = floor(maxLayers);
    let partial = maxLayers - fullLayers;

    for (let layer = 1; layer <= fullLayers; layer++) {
      push();
      let radius = layer * 70 + 20 * sin(frameCount * 0.01 + layer);
      rotate(frameCount * 0.002 * layer);
      drawMandalaLayer(radius, baseSymmetry, layer);
      pop();
    }

    if (partial > 0) {
      let layer = fullLayers + 1;
      push();
      let radius = layer * 70 + 20 * sin(frameCount * 0.01 + layer);
      rotate(frameCount * 0.002 * layer);
      drawMandalaLayerPartial(
        radius,
        baseSymmetry,
        layer,
        floor(baseSymmetry * partial),
      );
      pop();
    }
  }
}

function windowResized() {
  if (mode === "mandala") {
    resizeCanvas(windowWidth, windowHeight);
  }
}

// Screen switching

function switchToMandala() {
  mode = "mandala";
  canvas.parent("mandala-screen");
  resizeCanvas(windowWidth, windowHeight);
}

function showMandalaScreen() {
  document.querySelector("#camera-screen").style.display = "none";
  document.querySelector("#mandala-screen").style.display = "block";
  switchToMandala();
}

// Camera functions

function resetCamera() {
  snapped = false;
  sendButton.style.visibility = "hidden";
  captureButton.innerText = "SNAP!";
  captureButton.style.width = "50%";
  captureButton.style.backgroundColor = "initial";
}

function sendImageToServer(blob) {
  console.log(blob);
  fetch("upload-photo", {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: blob,
  }).then((data) => {
    console.log(data.status);
    resetCamera();
    showMandalaScreen();
  });
}

// called from socket handlers

function addMandalaLayer(url) {
  loadImage(url, function (img) {
    photoImages.push(img);
    if (maxLayers < maxLimit) maxLayers += layerStep;
  });
}

//  Mandala drawing functions

function drawMandalaLayer(radius, symmetry, layer) {
  let angleStep = PI / symmetry;
  for (let i = 0; i < symmetry; i++) {
    push();
    rotate(i * angleStep);
    noFill();
    let t = frameCount * 0.01 + layer;
    stroke(120 + 20 * sin(t), 10 + 10 * sin(t * 0.8), 10 + 10 * cos(t), 180);
    drawStarPattern(radius, 0.5, layer);
    pop();
  }
}

function drawMandalaLayerPartial(radius, symmetry, layer, segments) {
  let angleStep = PI / symmetry;
  for (let i = 0; i < segments; i++) {
    push();
    rotate(i * angleStep);
    noFill();
    let t = frameCount * 0.01 + layer;
    stroke(120 + 20 * sin(t), 10 + 10 * sin(t * 0.8), 10 + 10 * cos(t), 180);
    drawStarPattern(radius, 0.5, layer);
    pop();
  }
}

function drawStarPattern(radius, morph, layer) {
  let points = 3 + layer;
  let angleStep = TWO_PI / points;
  for (let i = 0; i < points; i++) {
    let angle1 = i * angleStep;
    let angle2 = ((i + 3) % points) * angleStep;
    let rA = i % 2 === 0 ? radius : radius * (0.5 + 0.3 * morph);
    let rB = (i + 1) % 2 === 0 ? radius : radius * (0.5 + 0.3 * morph);
    let x1 = rA * cos(angle1);
    let y1 = rA * sin(angle1);
    let x2 = rB * cos(angle2);
    let y2 = rB * sin(angle2);
    let img = photoImages[lineCounter % photoImages.length];
    if (img) drawImgLine(x1, y1, x2, y2, 10, img);
    lineCounter++;
  }
  drawConnections(radius, points);
}

function drawConnections(radius, points) {
  let angleStep = TWO_PI / points;
  for (let i = 0; i < points; i++) {
    let a1 = i * angleStep;
    let a2 = ((i + 2) % points) * angleStep;
    let x1 = radius * cos(a1);
    let y1 = radius * sin(a1);
    let x2 = radius * cos(a2);
    let y2 = radius * sin(a2);
    let img = photoImages[lineCounter % photoImages.length];
    if (img) drawImgLine(x1, y1, x2, y2, 10, img);
    lineCounter++;
  }
}

function drawImgLine(x1, y1, x2, y2, lineThickness, img) {
  let lineLength = dist(x1, y1, x2, y2);
  let angleRadians = atan2(y2 - y1, x2 - x1);
  push();
  translate(x1, y1);
  rotate(angleRadians);
  image(img, 0, -lineThickness / 2, lineLength, lineThickness);
  pop();
}
