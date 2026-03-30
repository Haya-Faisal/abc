// ============================================================
//  sky.js  —  Kite Sky Screen
// ============================================================

let kites = [];
let socket;

// simple list of star positions
let stars = [];

// simple list of grass blades
let grass = [];

// ─── SETUP ───────────────────────────────────────────────────
function setup() {
  createCanvas(windowWidth, windowHeight);

  // make some random stars
  for (let i = 0; i < 100; i++) {
    stars.push({
      x: random(width),
      y: random(height * 0.6),
      size: random(1, 3),
    });
  }

  // make some random grass blades
  for (let i = 0; i < width / 4; i++) {
    grass.push({
      x: random(width),
      h: random(15, 50),
      phase: random(TWO_PI),
    });
  }

  // connect to server
  socket = io();

  // when a new kite is launched from the map screen, add it here
  socket.on("new-kite", function (kiteData) {
    let k = new Kite(kiteData);
    k.x = width + 100; // start off screen right
    kites.push(k);
  });

  // load all kites that were saved before
  fetch("/kites")
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      for (let k of data) {
        kites.push(new Kite(k));
      }
    });
}

// ─── DRAW ────────────────────────────────────────────────────
function draw() {
  // sky background
  background(20, 30, 80);

  // draw stars
  noStroke();
  for (let s of stars) {
    // make stars twinkle a little
    let brightness = 150 + 100 * sin(frameCount * 0.02 + s.x);
    fill(255, 255, 255, brightness);
    circle(s.x, s.y, s.size);
  }

  // draw all kites
  for (let k of kites) {
    k.move();
    k.display();
  }

  // draw ground and grass on top
  drawGround();

  // if no kites yet show a message
  if (kites.length === 0) {
    fill(255, 255, 255, 150);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(20);
    text(
      "No kites yet! Go stitch some icons and launch one.",
      width / 2,
      height / 2,
    );
  }
}

// ─── GROUND AND GRASS ────────────────────────────────────────
function drawGround() {
  let groundY = height * 0.78;

  // flat green ground
  noStroke();
  fill(40, 100, 30);
  rect(0, groundY, width, height - groundY);

  // grass blades
  stroke(60, 140, 40);
  strokeWeight(2);
  for (let b of grass) {
    let sway = sin(frameCount * 0.02 + b.phase) * 8;
    line(b.x, groundY, b.x + sway, groundY - b.h);
  }
  noStroke();
}

// ─── KITE CLASS ──────────────────────────────────────────────
class Kite {
  constructor(kiteData) {
    this.icons = kiteData.icons; // list of { name, ox, oy, scale }

    // position in the sky
    this.x = random(width);
    this.y = random(height * 0.1, height * 0.65);

    // slow drifting speed
    this.speedX = random(-0.4, 0.4);
    this.speedY = random(-0.1, 0.1);

    // wobble angle
    this.wobble = random(TWO_PI);

    // how big each icon unit is in pixels
    this.unitPx = random(40, 60);

    // preload images for all icons in this kite
    this.imgs = {};
    for (let ic of this.icons) {
      let key = ic.name.toLowerCase();
      this.imgs[key] = loadImage(
        "assets/icons/" + key + ".png",
        function () {}, // success: do nothing
        function () {}, // fail: do nothing, fallback will show
      );
    }
  }

  move() {
    // drift slowly across the sky
    this.x += this.speedX;
    this.y += sin(frameCount * 0.01 + this.wobble) * 0.3;

    // wrap around when off screen
    if (this.x > width + 200) this.x = -200;
    if (this.x < -200) this.x = width + 200;

    // stay in the sky area
    if (this.y < height * 0.05) this.speedY = abs(this.speedY);
    if (this.y > height * 0.68) this.speedY = -abs(this.speedY);
  }

  display() {
    push();
    translate(this.x, this.y);

    // gentle tilt
    let tilt = sin(frameCount * 0.012 + this.wobble) * 0.12;
    rotate(tilt);

    let u = this.unitPx;

    // draw each icon in the kite
    for (let ic of this.icons) {
      let s = u * ic.scale; // size of this icon in pixels
      let ix = ic.ox * u; // x offset from kite centre
      let iy = ic.oy * u; // y offset from kite centre

      push();
      translate(ix, iy);
      rectMode(CENTER);
      imageMode(CENTER);

      // white rounded background
      fill(255);
      noStroke();
      rect(0, 0, s, s, s * 0.2);

      // try to draw the icon image
      let img = this.imgs[ic.name.toLowerCase()];
      if (img && img.width > 0) {
        image(img, 0, 0, s * 0.85, s * 0.85);
      } else {
        // fallback: coloured square with the first letter
        fill(100, 150, 220);
        rect(0, 0, s, s, s * 0.2);
        fill(255);
        textAlign(CENTER, CENTER);
        textSize(s * 0.45);
        text(ic.name.charAt(0), 0, 0);
      }

      pop();
    }

    // draw the string hanging below
    let bottomY = (max(this.icons.map((i) => i.oy)) + 0.5) * u;
    stroke(150, 120, 80);
    strokeWeight(1.5);
    noFill();
    for (let i = 0; i < 10; i++) {
      let y1 = bottomY + i * 8;
      let y2 = bottomY + (i + 1) * 8;
      let x1 = sin(frameCount * 0.04 + i * 0.6 + this.wobble) * 4;
      let x2 = sin(frameCount * 0.04 + (i + 1) * 0.6 + this.wobble) * 4;
      line(x1, y1, x2, y2);
    }

    pop();
  }
}

// ─── RESIZE ──────────────────────────────────────────────────
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
