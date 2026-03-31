let mappa = new Mappa("Leaflet");
let myMap;
let canvas;
let currentLongitude = 0; // global variables will be updated as we get GPS data
let currentLatitude = 0; // global variables will be updated as we get GPS data
let mapInit = false; // we only do map stuff once mapInit is true (see in draw)
let me; // point object showing our own location
let zoomLocked = false;

// Cloth system globals
let cloths = [];
let clusterGroups = [];
let permanentStitches = [];
let lastCloth = null;
let stitchCount = 0;
let currentGroupPair = [];
let activeStitch = null;
let imgs = [];
let socket;
let sound1;
// let socket = io();  // yields '/leon/port-4100/socket.io' or '/socket.io'
if (
  location.hostname.toLowerCase().startsWith("browsercircus") ||
  location.hostname.toLowerCase().startsWith("www")
) {
  socket = io({ path: "/haya/port-4230/socket.io" });
} else {
  socket = io();
}

// options for map
// we only actually initialize the map once we get data where we are (in draw)
// there are differnt suppliers and styles of maps available
let mappa_options = {
  lat: 0, // will change once we have data
  lng: 0, // will change once we have data
  zoom: 18,
  minZoom: 18,
  maxZoom: 18,
  scrollWheelZoom: false,
  doubleClickZoom: false,
  touchZoom: false,
  zoomControl: false,
  // style: "https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
  // style: "https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}",
  style:
    "https://webst01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=6&x={x}&y={y}&z={z}",
};

//icon imgs
function preload() {
  for (let i = 1; i <= 29; i++) imgs.push(loadImage("assets/" + i + ".JPG"));
  sound1 = loadSound("assets/stich.mp3");
}

function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("p5-canvas-container");
  canvas.elt.style.pointerEvents = "auto";
  me = new MyPoint();

  let uiLayer = document.createElement("div");
  uiLayer.id = "ui-layer";
  uiLayer.style.cssText =
    "position:fixed; top:0; left:0; width:100%; height:100%; z-index:9999; pointer-events:none;";
  document.body.appendChild(uiLayer);

  let statusTip = document.createElement("div");
  statusTip.id = "stitching-status";
  statusTip.textContent = "stitching…";
  statusTip.style.cssText =
    "position:absolute; top:20px; left:50%; transform:translateX(-50%); background:rgba(30,80,50,0.8); color:white; padding:8px 16px; border-radius:20px; font-size:14px; display:none;";
  uiLayer.appendChild(statusTip);

  let progressContainer = document.createElement("div");
  progressContainer.id = "progress-ui";
  progressContainer.style.cssText =
    "position:absolute; top:20px; left:20px; width:150px; display:none;";

  let barBg = document.createElement("div");
  barBg.style.cssText =
    "width:100%; height:10px; background:rgba(200,200,200,0.3); border:1px solid rgba(200,200,200,0.5); border-radius:5px; overflow:hidden;";

  let barFill = document.createElement("div");
  barFill.id = "progress-fill";
  barFill.style.cssText =
    "width:0%; height:100%; background:rgba(30,80,50,0.9); transition: width 0.2s ease;";

  let progressText = document.createElement("div");
  progressText.id = "progress-text";
  progressText.style.cssText =
    "margin-top:5px; color:#333; font-size:12px; font-weight:bold; text-shadow: 0 0 5px white;";

  barBg.appendChild(barFill);
  progressContainer.appendChild(barBg);
  progressContainer.appendChild(progressText);
  uiLayer.appendChild(progressContainer);

  let btn = document.createElement("button");
  btn.id = "share-btn";
  btn.textContent = "🪡 Share my kite";

  btn.style.cssText = `
    position: absolute; 
    left: 20px; 
    top: 0; 
    font-size: 14px; 
    padding: 10px 18px; 
    background: rgba(30, 80, 50, 0.85); 
    color: white; 
    border: none; 
    border-radius: 24px; 
    cursor: pointer; 
    pointer-events: auto;
    white-space: nowrap;
    z-index: 10000;
    transform-origin: center;
  `;
  btn.addEventListener("click", shareAllGroups);
  uiLayer.appendChild(btn);

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateUILayout);
    window.visualViewport.addEventListener("scroll", updateUILayout);
    updateUILayout();
  }
  imgs = shuffle(imgs);
}

function draw() {
  clear();

  noStroke();
  fill(255, 255, 255, 80);
  rect(0, 0, width, height);

  //disable users to zoom in/out
  if (mapInit && myMap && myMap.map && !zoomLocked) {
    myMap.map.setMinZoom(18);
    myMap.map.setMaxZoom(18);
    myMap.map.scrollWheelZoom.disable();
    myMap.map.doubleClickZoom.disable();
    myMap.map.dragging.disable();
    myMap.map.touchZoom.disable();
    zoomLocked = true;
  }

  // Initialize full screen map
  // runs only once to init the map
  if (
    !mapInit &&
    typeof GPS_GRANTED !== "undefined" &&
    GPS_GRANTED &&
    currentLongitude !== 0
  ) {
    mappa_options.lat = currentLatitude;
    mappa_options.lng = currentLongitude;
    myMap = mappa.tileMap(mappa_options);
    myMap.overlay(canvas);
    myMap.onChange(updateMapContent);
    mapInit = true;
    spawnCloths(currentLatitude, currentLongitude);
  }

  if (mapInit) {
    syncClothPixels();
    handleActiveStitch();
    for (let c of cloths) c.display();
    if (!activeStitch) detectAutoStitch();
    drawPermanentStitches();
    me.update();
    me.display();
    drawUI();
  }
}
//debug function
window.addEventListener("click", function (e) {
  if (!mapInit) return;
  let rect = canvas.elt.getBoundingClientRect();
  triggerStitchAt(e.clientX - rect.left, e.clientY - rect.top);
});

function triggerStitchAt(x, y) {
  //which cloth am I stepping on
  let clicked = cloths.find((c) => c.contains(x, y));
  if (!clicked) return;
  //check whether back and forth
  if (lastCloth && clicked !== lastCloth) {
    let g1 = getGroupOf(lastCloth);
    let g2 = getGroupOf(clicked);
    if (g1 !== g2) {
      if (currentGroupPair.length === 0) {
        currentGroupPair = [g1, g2];
        stitchCount = 0.5;
      } else if (
        currentGroupPair.includes(g1) &&
        currentGroupPair.includes(g2)
      ) {
        stitchCount += 0.5;
        //count:how many times back and forth
        if (stitchCount >= 2) {
          activeStitch = { mover: lastCloth, target: clicked };
          stitchCount = 0;
          currentGroupPair = [];
        }
      } else {
        currentGroupPair = [g1, g2];
        stitchCount = 0.5;
      }
    }
  }
  lastCloth = clicked;
}

//GPS position
class MyPoint {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.goalX = 0;
    this.goalY = 0;
    this.size = 14;
    this.col = color(170, 240, 190);
    this.accuracy = 0;
    this.heading = 0;
    this.emojiAdjustAngle = radians(45);
  }
  update() {
    this.x = this.goalX; //lerp(this.x, this.goalX, 0.2);
    this.y = this.goalY; //lerp(this.y, this.goalY, 0.2);
  }
  updateHeading(h) {
    this.heading = h;
  }
  display() {
    push();
    translate(this.x, this.y);
    noFill();
    stroke(255, 0, 0, 80);
    strokeWeight(1);
    let diameter = 2 * metersToPixel(this.accuracy, currentLatitude);
    // circle(0, 0, diameter);
    fill(this.col);
    stroke("pink");
    strokeWeight(3);
    // circle(0, 0, this.size + sin(frameCount * 0.1) * 2);
    push();
    rotate(radians(this.heading));
    rotate(this.emojiAdjustAngle);
    translate(0, -12);
    textAlign(CENTER, CENTER);
    textSize(36);
    text("🪡", 0, 0);
    pop();
    fill(255, 0, 0);
    noStroke();
    textAlign(LEFT);
    textSize(10);
    // text("±" + nf(this.accuracy, 1, 1) + "m", diameter / 2 + 5, 0);
    pop();
  }
}

//this parameter to control the size of the imgs
//img class
let CLOTH_LONG_SIDE_M = 12;
class Cloth {
  constructor(lat, lng, id) {
    this.lat = lat;
    this.lng = lng;
    this.pos = createVector(0, 0);
    this.id = id;
    this.img = imgs[id % imgs.length];
    this._sizeSet = false;
    this.wMeters = CLOTH_LONG_SIDE_M;
    this.hMeters = CLOTH_LONG_SIDE_M;
    this.w = 0;
    this.h = 0;
  }
  //check the image is horizontal or vertical
  initSize() {
    if (this._sizeSet || !this.img || this.img.width == 0) return;
    let ratio = this.img.width / this.img.height;
    if (ratio >= 1) {
      this.wMeters = CLOTH_LONG_SIDE_M;
      this.hMeters = CLOTH_LONG_SIDE_M / ratio;
    } else {
      this.hMeters = CLOTH_LONG_SIDE_M;
      this.wMeters = CLOTH_LONG_SIDE_M * ratio;
    }
    this._sizeSet = true;
  }

  isUserOver() {
    return this.contains(me.x, me.y);
  }

  display() {
    this.initSize();
    if (this.w == 0 || !this.img) return;
    let myGroup = getGroupOf(this);
    let hovered = this.isUserOver();
    push();
    translate(this.pos.x, this.pos.y);
    imageMode(CENTER);
    image(this.img, 0, 0, this.w, this.h);
    rectMode(CENTER);
    noFill();
    if (currentGroupPair.includes(myGroup)) {
      stroke(30, 80, 50, 160);
      strokeWeight(3);
      rect(0, 0, this.w + 10, this.h + 10);
    }
    stroke(hovered ? color(255, 100, 0) : color(180, 180, 180, 120));
    strokeWeight(hovered ? 3 : 1);
    rect(0, 0, this.w, this.h);
    pop();
  }

  contains(px, py) {
    return (
      px > this.pos.x - this.w / 2 &&
      px < this.pos.x + this.w / 2 &&
      py > this.pos.y - this.h / 2 &&
      py < this.pos.y + this.h / 2
    );
  }
  getBounds() {
    return {
      l: this.pos.x - this.w / 2,
      r: this.pos.x + this.w / 2,
      t: this.pos.y - this.h / 2,
      b: this.pos.y + this.h / 2,
    };
  }
  updateLatLng() {
    let ll = myMap.pixelToLatLng(this.pos.x, this.pos.y);
    this.lat = ll.lat;
    this.lng = ll.lng;
  }
}

//spread the cloths
function spawnCloths(lat, lng) {
  cloths = [];
  clusterGroups = [];
  let MIN_CENTER_M = 18;
  let MIN_RING_M = 20;
  let MAX_CLOTHS = 15; // updated to match total number of images
  let MAX_RING_M = 100;
  let degLat = 1 / 111000;
  let degLng = 1 / (111000 * Math.cos((lat * Math.PI) / 180));

  function distM(a, b) {
    let dy = (a.lat - b.lat) / degLat;
    let dx = (a.lng - b.lng) / degLng;
    return Math.sqrt(dx * dx + dy * dy);
  }

  let placed = [];
  let attempts = 0;
  while (placed.length < MAX_CLOTHS && attempts < 10000) {
    attempts++;
    let angle = random(TWO_PI);
    let dist = random(MIN_RING_M, MAX_RING_M);
    let candidate = {
      lat: lat + Math.cos(angle) * dist * degLat,
      lng: lng + Math.sin(angle) * dist * degLng,
    };
    if (!placed.some((p) => distM(candidate, p) < MIN_CENTER_M)) {
      placed.push(candidate);
      cloths.push(new Cloth(candidate.lat, candidate.lng, placed.length - 1));
      clusterGroups.push([cloths[cloths.length - 1]]);
    }
  }
}

function syncClothPixels() {
  for (let c of cloths) {
    let px = myMap.latLngToPixel(c.lat, c.lng);
    c.pos.x = px.x;
    c.pos.y = px.y;
    c.w = metersToPixel(c.wMeters, c.lat);
    c.h = metersToPixel(c.hMeters, c.lat);
  }
}

function detectAutoStitch() {
  //which cloth are you standing on
  let hovering = cloths.find((c) => c.isUserOver());
  if (!hovering) return;
  if (lastCloth && hovering !== lastCloth) {
    //find their group(for every cloth, it's already in a group)
    let g1 = getGroupOf(lastCloth);
    let g2 = getGroupOf(hovering);
    //case a:they're not in the same group, them combine
    if (g1 !== g2) {
      if (currentGroupPair.length === 0) {
        currentGroupPair = [g1, g2];
        stitchCount = 0.5;
      } else if (
        currentGroupPair.includes(g1) &&
        currentGroupPair.includes(g2)
      ) {
        stitchCount += 0.5;
        if (stitchCount >= 2) {
          activeStitch = { mover: lastCloth, target: hovering };
          stitchCount = 0;
          currentGroupPair = [];
        }
      } else {
        currentGroupPair = [g1, g2];
        stitchCount = 0.5;
      }
    }
  }
  lastCloth = hovering;
}

function handleActiveStitch() {
  if (!activeStitch) return;
  let gA = getGroupOf(activeStitch.mover);
  let gB = getGroupOf(activeStitch.target);
  let STEP = 2;
  let vec = p5.Vector.sub(activeStitch.target.pos, activeStitch.mover.pos)
    .normalize()
    .mult(STEP);

  let collision = null;

  for (let a of gA) {
    for (let b of gB) {
      if (wouldOverlap(a, b, vec)) {
        collision = { a, b };
        break;
      }
    }
    if (collision) break;
  }
  if (!collision) {
    for (let m of gA) {
      m.pos.add(vec);
      m.updateLatLng();
    }
  } else {
    snapToEdge(gA, collision.a, collision.b, vec);
    findPlace(gA, gB, collision.a, collision.b);
    activeStitch = null;
  }
}

function wouldOverlap(a, b, vec) {
  let aL = a.pos.x - a.w / 2 + vec.x,
    aR = a.pos.x + a.w / 2 + vec.x;
  let aT = a.pos.y - a.h / 2 + vec.y,
    aB = a.pos.y + a.h / 2 + vec.y;
  let bL = b.pos.x - b.w / 2,
    bR = b.pos.x + b.w / 2;
  let bT = b.pos.y - b.h / 2,
    bB = b.pos.y + b.h / 2;
  return !(aR <= bL || aL >= bR || aB <= bT || aT >= bB);
}

function snapToEdge(gA, cA, cB, vec) {
  let snap = createVector(0, 0);
  if (abs(vec.x) >= abs(vec.y)) {
    snap.x =
      vec.x > 0
        ? cB.pos.x - cB.w / 2 - (cA.pos.x + cA.w / 2)
        : cB.pos.x + cB.w / 2 - (cA.pos.x - cA.w / 2);
  } else {
    snap.y =
      vec.y > 0
        ? cB.pos.y - cB.h / 2 - (cA.pos.y + cA.h / 2)
        : cB.pos.y + cB.h / 2 - (cA.pos.y - cA.h / 2);
  }
  for (let m of gA) {
    m.pos.add(snap);
    m.updateLatLng();
  }
}

function findPlace(g1, g2, cA, cB) {
  let b1 = cA.getBounds();
  let b2 = cB.getBounds();
  let sd = { hostCloth: cA, points: [], revealed: 0, revealTimer: 0 };

  const STITCH_GAP = 5;

  let dx = cA.pos.x - cB.pos.x;
  let dy = cA.pos.y - cB.pos.y;

  if (abs(dx) > abs(dy)) {
    let stitchX = dx > 0 ? b1.l : b1.r;
    let intersectTop = max(b1.t, b2.t);
    let intersectBottom = min(b1.b, b2.b);
    let edgeLength = intersectBottom - intersectTop;

    //calculating how many x, based on the length of overlapping
    let count = max(floor(edgeLength / STITCH_GAP), 1);
    let totalStitchRange = (count - 1) * STITCH_GAP;
    let startY = (intersectTop + intersectBottom) / 2 - totalStitchRange / 2;

    for (let i = 0; i < count; i++) {
      let py = startY + i * STITCH_GAP;
      sd.points.push(p5.Vector.sub(createVector(stitchX, py), cA.pos));
    }
  } else {
    let stitchY = dy > 0 ? b1.t : b1.b;
    let intersectLeft = max(b1.l, b2.l);
    let intersectRight = min(b1.r, b2.r);
    let edgeWidth = intersectRight - intersectLeft;
    let count = max(floor(edgeWidth / STITCH_GAP), 1);
    let totalStitchRange = (count - 1) * STITCH_GAP;
    let startX = (intersectLeft + intersectRight) / 2 - totalStitchRange / 2;

    for (let i = 0; i < count; i++) {
      let px = startX + i * STITCH_GAP;
      sd.points.push(p5.Vector.sub(createVector(px, stitchY), cA.pos));
    }
  }

  if (sd.points.length === 0) {
    sd.points.push(createVector(0, 0));
  }

  permanentStitches.push(sd);

  let newGroup = g1.concat(g2);
  clusterGroups = clusterGroups.filter((g) => g !== g1 && g !== g2);
  clusterGroups.push(newGroup);
}

function drawPermanentStitches() {
  const S = 1;
  push();
  for (let s of permanentStitches) {
    s.revealTimer++;
    if (s.revealTimer % 2 === 0 && s.revealed < s.points.length) s.revealed++;

    for (let i = 0; i < s.revealed; i++) {
      let wp = p5.Vector.add(s.hostCloth.pos, s.points[i]);
      stroke(30, 80, 50, 230); //green
      strokeWeight(3.2);
      line(wp.x - S, wp.y - S, wp.x + S, wp.y + S);
      line(wp.x + S, wp.y - S, wp.x - S, wp.y + S);
      stroke(255, 255, 255, 250); // white stroke on top
      strokeWeight(0.5);
      line(wp.x - S, wp.y - S, wp.x + S, wp.y + S);
      line(wp.x + S, wp.y - S, wp.x - S, wp.y + S);
    }
  }
  pop();
}

function shareAllGroups() {
  let sent = 0;

  for (let group of clusterGroups) {
    if (group.length < 2) continue;

    // bounding box of this group in pixel space
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let c of group) {
      minX = min(minX, c.pos.x - c.w / 2);
      minY = min(minY, c.pos.y - c.h / 2);
      maxX = max(maxX, c.pos.x + c.w / 2);
      maxY = max(maxY, c.pos.y + c.h / 2);
    }

    let bW = maxX - minX;
    let bH = maxY - minY;
    if (bW <= 0 || bH <= 0) continue;

    // padding around the quilt
    const PAD = 12;

    // render into an offscreen p5.Graphics buffer
    let gfx = createGraphics(bW + PAD * 2, bH + PAD * 2);

    // draw each photo piece
    for (let c of group) {
      let lx = c.pos.x - c.w / 2 - minX + PAD;
      let ly = c.pos.y - c.h / 2 - minY + PAD;
      if (c.img && c.img.width > 0) {
        gfx.imageMode(CORNER);
        gfx.image(c.img, lx, ly, c.w, c.h);
      }
    }
    // draw the stitch marks on top
    const S = 1;
    gfx.strokeCap(ROUND);
    for (let s of permanentStitches) {
      if (!group.includes(s.hostCloth)) continue;
      for (let i = 0; i < s.revealed; i++) {
        let wp = p5.Vector.add(s.hostCloth.pos, s.points[i]);
        let sx = wp.x - minX + PAD;
        let sy = wp.y - minY + PAD;
        gfx.stroke(30, 80, 50, 230);
        gfx.strokeWeight(3.2);
        gfx.line(sx - S, sy - S, sx + S, sy + S);
        gfx.line(sx + S, sy - S, sx - S, sy + S);
        gfx.stroke(255, 255, 255, 250);
        gfx.strokeWeight(0.5);
        gfx.line(sx - S, sy - S, sx + S, sy + S);
        gfx.line(sx + S, sy - S, sx - S, sy + S);
      }
    }

    let imageData = gfx.elt.toDataURL("image/png");
    gfx.remove();

    // POST to server so it saves + broadcasts to sky screen
    fetch("kites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) console.log("Kite sent to sky screen!", data.kite.id);
        window.open("sky.html", "_self");
      })
      .catch((err) => console.error("Failed to send kite:", err));

    sent++;
  }

  if (sent == 0) alert("Stitch some pieces together first!");
}

function getGroupOf(c) {
  return clusterGroups.find((g) => g.includes(c));
}

function metersToPixel(meters, lat) {
  if (!myMap) return 0;
  const mpp =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) /
    Math.pow(2, myMap.zoom());
  return meters / mpp;
}

function handleNewPosition(pos) {
  me.accuracy = pos.coords.accuracy;
  let lonlat = fixForChineseMap(pos);
  currentLongitude = lonlat[0];
  currentLatitude = lonlat[1];
  if (mapInit) updateMapContent();
}

function updateMapContent() {
  let p = myMap.latLngToPixel(currentLatitude, currentLongitude);
  me.goalX = p.x;
  me.goalY = p.y;
}

function drawUI() {
  // if (stitchCount > 0 || currentGroupPair.length > 0) {
  //   let bw = 150,
  //     bh = 10,
  //     x = 20,
  //     y = 20;
  //   noFill();
  //   stroke(200);
  //   strokeWeight(1);
  //   rectMode(CORNER);
  //   rect(x, y, bw, bh, 5);
  //   if (stitchCount > 0) {
  //     noStroke();
  //     fill(30, 80, 50, 200);
  //     rect(x, y, (stitchCount / 4) * bw, bh, 5);
  //   }
  //   fill(120);
  //   noStroke();
  //   textAlign(LEFT);
  //   textSize(13);
  //   text("sewing: " + nf((stitchCount / 4) * 100, 1, 0) + "%", x, y + 25);
  // }
  // if (activeStitch) {
  //   fill(30, 80, 50, 180);
  //   noStroke();
  //   textAlign(CENTER);
  //   textSize(13);
  //   text("✦ stitching…", width / 2, height - 30);
  // }
  let statusTip = document.getElementById("stitching-status");
  let progressUI = document.getElementById("progress-ui"); // 确保是这个 ID
  let progressFill = document.getElementById("progress-fill");
  let progressText = document.getElementById("progress-text");

  if (!statusTip || !progressUI) return; // 防错

  if (activeStitch) {
    statusTip.style.display = "block";
  } else {
    statusTip.style.display = "none";
  }

  if (stitchCount > 0 || currentGroupPair.length > 0) {
    progressUI.style.display = "block";
    let percent = (stitchCount / 2) * 100;
    progressFill.style.width = percent + "%";
    progressText.innerText = "sewing: " + nf(percent, 1, 0) + "%";
  } else {
    progressUI.style.display = "none";
  }
}
function updateUILayout() {
  let vv = window.visualViewport;
  let uiLayer = document.getElementById("ui-layer");
  let btn = document.getElementById("share-btn");
  if (!uiLayer || !btn) return;

  let scale = 1 / vv.scale;

  // 同步 UI 层到当前视口左上角
  uiLayer.style.transformOrigin = "0 0";
  uiLayer.style.transform = `translate(${vv.offsetLeft}px, ${vv.offsetTop}px) scale(${scale})`;

  let targetTop = vv.height * vv.scale - 60;
  btn.style.top = targetTop + "px";

  // 保持容器填满（防穿透）
  uiLayer.style.width = vv.width * vv.scale + "px";
  uiLayer.style.height = vv.height * vv.scale + "px";
}

function windowResized() {
  //resizeCanvas(windowWidth, windowHeight);
}
