let kites = [];
let socket;
let grass = [];
let stars = [];
const WIDTH = 2000;
if (
  location.hostname.toLowerCase().startsWith("browsercircus") ||
  location.hostname.toLowerCase().startsWith("www")
) {
  socket = io({ path: "/haya/port-4230/socket.io" });
} else {
  socket = io();
}

function setup() {
  createCanvas(WIDTH, windowHeight);

  for (let i = 0; i < width / 5; i++) {
    grass.push({
      x: random(width),
      h: random(20, 55),
      phase: random(TWO_PI),
      col: color(random(60, 110), random(120, 170), random(30, 70)),
    });
  }

  // new kite arriving live
  socket.on("new-kite", function (kiteData) {
    let k = new Kite(kiteData);
    k.x = width + 150; // fly in from the right
    kites.push(k);
  });

  // load all kites saved on the server
  fetch("kites")
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
  background(245, 238, 225);
  //do need for this line. it makes the code crash since there is no mymap on sky screen.
  // myMap.map.dragging.disable();

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

//  KITE CLASS
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

    // ── kite image (the stitched quilt) ──
    imageMode(CENTER);
    image(this.img, 0, 0, dispW, dispH);

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

    // small dot at the string end
    noStroke();
    fill(180, 140, 80, 200);
    ellipse(prevX, prevY, 9, 6);

    pop();
  }
}

// ─── RESIZE ──────────────────────────────────────────────────
function windowResized() {
  resizeCanvas(WIDTH, windowHeight);
  for (let i = 0; i < width / 5; i++) {
    grass.push({
      x: random(width),
      h: random(20, 55),
      phase: random(TWO_PI),
      col: color(random(60, 110), random(120, 170), random(30, 70)),
    });
  }
}
