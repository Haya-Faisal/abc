const segCount = 9; // number of string segments
const segLength = 50; // rest length of each segment (px)
const stiffness = 0.08; // spring stiffness
const gravity = 0.15;
const upForce = -1; // lift applied to kite node
const windAmp = 0.4; // how much the wind pushes sideways
const windFreq = 0.007; // speed of wind
const nodeM = 25;
const kiteM = 10;
const ROT_DAMPING = 0.92;
const ROT_STIFF = 0.0000001;
const WIND_TORQUE = 0.08;

let KITE_SPACING; // horizontal pixels between kite anchors
const LEFT_MARGIN = 200; // gap before the first kite
const RIGHT_MARGIN = 200; // gap after the last kite

let kites = [];
let socket;

// canvas width grows as kites are added
// starts wide enough for at least one kite
let windowWidth = 500;
let canvasWidth = windowWidth;

if (
  location.hostname.toLowerCase().startsWith("browsercircus") ||
  location.hostname.toLowerCase().startsWith("www")
) {
  socket = io({ path: "/lesley/port-4290/socket.io" });
} else {
  socket = io();
}

// calculate the anchor X for a kite at a given index
function anchorXForIndex(i) {
  KITE_SPACING = random(40, 100);
  return LEFT_MARGIN + i * KITE_SPACING;
}

// calculate the total canvas width needed for n kites
function widthForKiteCount(n) {
  if (n === 0) return windowWidth;
  return max(windowWidth, LEFT_MARGIN + (n - 1) * KITE_SPACING + RIGHT_MARGIN);
}

// grow the canvas if needed and update the body/scroll container
function growCanvasIfNeeded() {
  let needed = widthForKiteCount(kites.length);
  if (needed > canvasWidth) {
    canvasWidth = needed;
    resizeCanvas(canvasWidth, windowHeight);
  }
}

function setup() {
  // canvasWidth = widthForKiteCount(0);
  createCanvas(canvasWidth, windowHeight);

  socket.on("new-kite", function (kiteData) {
    let index = kites.length; // next slot in order
    let k = new Kite(kiteData, index);
    kites.push(k);
    growCanvasIfNeeded();
  });

  // load all kites saved on the server
  fetch("kites")
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      let limit = 10;
      let recentData =
        data.length > limit ? data.slice(data.length - limit) : data;

      for (let i = 0; i < recentData.length; i++) {
        kites.push(new Kite(recentData[i], i));
      }
      console.log("Loaded", recentData.length, "recent kites");
      growCanvasIfNeeded();
    });
}

function draw() {
  background(245, 238, 220);

  // ground strip
  noStroke();
  fill(90, 145, 55);
  rect(0, height - 30, canvasWidth, 30);

  // update + draw all kites
  for (let k of kites) {
    k.update();
    k.display();
  }

  // empty state message
  if (kites.length === 0) {
    fill(160, 145, 125, 180);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(18);
    text("waiting for the kites to come", windowWidth / 2, height * 0.4);
  }
}

class Kite {
  constructor(kiteData, index) {
    // ── image loading ──
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

    // ── display size ──
    this.displayW = random(120, 200);

    // ── anchor position — placed in order, evenly spaced ──
    this.anchorX = anchorXForIndex(index);
    this.anchorY = height - 30;

    // ── build the string: chain of Ball nodes ──
    this.nodes = [];
    for (let j = 0; j <= segCount; j++) {
      let n = new Ball(this.anchorX, this.anchorY - j * segLength, 5);
      if (j === 0) {
        n.mass = 0; // anchor — fixed
      } else if (j === segCount) {
        n.mass = kiteM; // kite node
      } else {
        n.mass = nodeM; // middle string nodes
      }
      this.nodes.push(n);
    }

    // ── build springs between consecutive nodes ──
    this.springs = [];
    for (let j = 0; j < this.nodes.length - 1; j++) {
      this.springs.push(
        new Spring(this.nodes[j], this.nodes[j + 1], segLength, stiffness),
      );
    }

    // ── per-kite variation ──
    this.phase = random(TWO_PI);
    this.angle = 0;
    this.angleR = 0;
    this.angularVel = 0;
  }

  update() {
    let kiteNode = this.nodes[this.nodes.length - 1];

    kiteNode.applyForce(createVector(0, upForce));

    let wx =
      sin(frameCount * windFreq + this.phase) * windAmp + random(-0.02, 0.02);
    kiteNode.applyForce(createVector(wx, 0));

    for (let s of this.springs) s.update();

    for (let j = 1; j < this.nodes.length; j++) {
      this.nodes[j].update();
      if (this.nodes[j].pos.y > height - 32) {
        this.nodes[j].pos.y = height - 32;
        this.nodes[j].vel.y *= -0.2;
      }
    }

    let torque = wx * WIND_TORQUE * 10 - this.angle * ROT_STIFF;
    this.angularVel = (this.angularVel + torque) * ROT_DAMPING;
    this.angle = constrain(this.angle + this.angularVel, -0.5, 0.5);
    this.angleR = lerp(this.angleR, this.angle, 0.005);
  }

  display() {
    let kiteNode = this.nodes[this.nodes.length - 1];

    // string as smooth curve
    stroke(140, 100, 60, 210);
    strokeWeight(1.5);
    noFill();
    beginShape();
    curveVertex(this.nodes[0].pos.x, this.nodes[0].pos.y);
    for (let n of this.nodes) curveVertex(n.pos.x, n.pos.y);
    curveVertex(kiteNode.pos.x, kiteNode.pos.y);
    endShape();

    // anchor dot
    noStroke();
    fill(70, 50, 30);
    circle(this.nodes[0].pos.x, this.nodes[0].pos.y, 9);

    // kite image
    push();
    translate(kiteNode.pos.x, kiteNode.pos.y);
    rotate(this.angleR);

    if (this.img && this.img.width > 0) {
      let ratio = this.img.height / this.img.width;
      let dispW = this.displayW;
      let dispH = dispW * ratio;
      imageMode(CENTER);
      image(this.img, 0, 0, dispW, dispH);
    } else {
      // fallback while image loads
      fill(200, 180, 160);
      stroke(255, 255, 255, 130);
      strokeWeight(1.5);
      rectMode(CENTER);
      rect(0, 0, 38, 38, 5);
    }

    pop();
  }
}

class Ball {
  constructor(x, y, rad) {
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.acc = createVector(0, 0);
    this.rad = rad;
    this.mass = rad * 0.5;
    this.damping = 0.97;
  }

  update() {
    this.vel.add(this.acc);
    this.pos.add(this.vel);
    this.acc.mult(0);
    this.vel.mult(this.damping);
  }

  applyForce(f) {
    if (this.mass <= 0) return;
    this.acc.add(p5.Vector.div(f, this.mass));
  }
}

class Spring {
  constructor(a, b, restLength, k) {
    this.bobA = a;
    this.bobB = b;
    this.len = restLength;
    this.k = k;
  }

  update() {
    let vec = p5.Vector.sub(this.bobB.pos, this.bobA.pos);
    let stretch = vec.mag() - this.len;
    let force = vec
      .copy()
      .normalize()
      .mult(-1 * stretch * this.k);
    this.bobB.applyForce(force);
    this.bobA.applyForce(force.copy().mult(-1));
  }
}

function windowResized() {
  canvasWidth = widthForKiteCount(kites.length);
  resizeCanvas(canvasWidth, windowHeight);
}
