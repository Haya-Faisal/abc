// ============================================================
//  sky.js  —  Kite Sky Screen
//  Off-white background, kites made from the stitched quilt
//  images, floating with a string attached below
// ============================================================

let kites = [];
let socket;
let grass = [];
let stars = [];
const WIDTH = 2000;

// ─── SETUP ───────────────────────────────────────────────────
function setup() {
  createCanvas(WIDTH, windowHeight);

  // grass blades along the bottom
  for (let i = 0; i < width / 5; i++) {
    grass.push({
      x: random(width),
      h: random(20, 55),
      phase: random(TWO_PI),
      col: color(random(60, 110), random(120, 170), random(30, 70)),
    });
  }

  // a few soft stars / specks in the upper sky
  //   for (let i = 0; i < 60; i++) {
  //     stars.push({
  //       x: random(width),
  //       y: random(height * 0.55),
  //       r: random(0.8, 2.5),
  //     });
  //   }

  // connect to server via Socket.IO
  socket = io();

  // new kite arriving live
  socket.on("new-kite", function (kiteData) {
    let k = new Kite(kiteData);
    k.x = width + 150; // fly in from the right
    kites.push(k);
  });

  // load all kites saved on the server
  fetch("/kites")
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      for (let k of data) {
        kites.push(new Kite(k));
      }
      console.log("Loaded", data.length, "kites");
    })
    .catch(function (e) {
      console.error("Could not load kites:", e);
    });
}

// ─── DRAW ────────────────────────────────────────────────────
function draw() {
  // off-white sky
  background(245, 238, 225);

  // soft speckle texture — gives it a papery feel
  //   drawSpeckles();

  // faint specks in sky
  noStroke();
  for (let s of stars) {
    fill(180, 170, 155, 120);
    circle(s.x, s.y, s.r * 2);
  }

  // kites
  for (let k of kites) {
    k.move();
    k.display();
  }

  // ground + grass always on top
  //   drawGround();

  // empty state
  if (kites.length === 0) {
    fill(160, 145, 125, 180);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(18);
    text(
      "No kites yet — stitch some pieces and share your quilt!",
      width / 2,
      height * 0.4,
    );
  }
}

// ─── PAPERY SPECKLE TEXTURE ──────────────────────────────────
function drawSpeckles() {
  // drawn once every 90 frames so it doesn't flicker
  if (frameCount % 90 !== 1) return;
  noStroke();
  for (let i = 0; i < 400; i++) {
    let a = random(8, 25);
    fill(random(180, 210), random(165, 195), random(140, 170), a);
    circle(random(width), random(height * 0.78), random(1, 4));
  }
}

// ─── GROUND + GRASS ──────────────────────────────────────────
function drawGround() {
  let gy = height * 0.78;

  // ground strip
  noStroke();
  fill(80, 130, 55);
  rect(0, gy, width, height - gy);

  // slightly darker lower band
  fill(55, 95, 35);
  rect(0, gy + (height - gy) * 0.4, width, (height - gy) * 0.6);

  // grass blades
  let wind = sin(frameCount * 0.012) * 0.2;
  strokeCap(ROUND);
  for (let b of grass) {
    let sway = sin(frameCount * 0.018 + b.phase) * 10 + wind * 14;
    stroke(b.col);
    strokeWeight(random(1.2, 2.8));
    line(b.x, gy, b.x + sway, gy - b.h);
  }
  noStroke();
}

// ─── KITE CLASS ──────────────────────────────────────────────
class Kite {
  constructor(kiteData) {
    this.imageData = kiteData.imageData; // base64 PNG string

    // load into a p5 Image
    this.img = null;
    let self = this;
    loadImage(
      kiteData.imageData,
      function (img) {
        self.img = img;
      },
      function () {
        console.warn("Failed to load kite image");
      },
    );

    // position — random spot in the sky
    this.x = random(width * 0.1, width * 0.9);
    this.y = random(height * 0.05, height * 0.16);
    this.anchorbase = this.y;

    // very gentle drift
    this.speedX = random(-0.5, 0.5);
    this.speedY = random(-0.08, 0.08);

    // wobble
    this.wobble = random(TWO_PI);
    this.wobbleSpeed = random(0.008, 0.018);

    // how wide to display the kite (height scales with image ratio)
    this.displayW = random(120, 200);

    // string length below the kite
    this.stringLen = random(270, 500);
  }

  move() {
    this.x += this.speedX;
    this.y += sin(frameCount * 0.009 + this.wobble) * 0.35;

    // wrap left/right
    if (this.x > width + 200) this.x = -200;
    if (this.x < -200) this.x = width + 200;

    // bounce inside sky zone
    let minY = height * 0.33;
    let maxY = height * 0.53;
    if (this.y < minY) this.speedY = abs(this.speedY);
    if (this.y > maxY) this.speedY = -abs(this.speedY);
    this.y = constrain(this.y, minY, maxY);
  }

  display() {
    if (!this.img) return; // still loading

    push();
    translate(this.x, this.y);

    // gentle tilt
    let tilt = sin(frameCount * this.wobbleSpeed + this.wobble) * 0.1;
    rotate(tilt);

    // figure out display height from image ratio
    let ratio = this.img.height / this.img.width;
    let dispW = this.displayW;
    let dispH = dispW * ratio;

    // ── shadow beneath kite ──
    noStroke();
    fill(0, 0, 0, 18);
    // ellipse(6, dispH / 2 + 8, dispW * 0.9, dispH * 0.18);

    // ── kite image (the stitched quilt) ──
    imageMode(CENTER);
    image(this.img, 0, 0, dispW, dispH);

    // thin border around the kite
    // noFill();
    // stroke(160, 145, 120, 120);
    // strokeWeight(1);
    // rectMode(CENTER);
    // rect(0, 0, dispW, dispH);

    // ── string hanging below ──
    // anchor at the bottom-centre of the kite
    let anchorY = 0;
    stroke(140, 110, 70, 180);
    strokeWeight(1.5);
    noFill();

    // draw a wavy string as a series of short lines
    let segments = 24;
    let segLen = this.stringLen / segments;
    let prevX = 0,
      prevY = anchorY;
    for (let i = 1; i <= segments; i++) {
      let nx = sin(frameCount * 0.035 + i * 0.55 + this.wobble) * 5;
      let ny = anchorY + segLen * i;
      line(prevX, prevY, nx, ny);
      prevX = nx;
      prevY = ny;
    }

    // small bow / knot at the string end
    noStroke();
    fill(180, 140, 80, 200);
    ellipse(prevX, prevY, 9, 6);

    pop();
  }
}

// ─── RESIZE ──────────────────────────────────────────────────
function windowResized() {
  resizeCanvas(WIDTH, windowHeight);
  // rebuild grass for new width
  grass = [];
  for (let i = 0; i < width / 5; i++) {
    grass.push({
      x: random(width),
      h: random(20, 55),
      phase: random(TWO_PI),
      col: color(random(60, 110), random(120, 170), random(30, 70)),
    });
  }
}
