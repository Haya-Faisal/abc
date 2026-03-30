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
if (location.hostname.toLowerCase().startsWith("browsercircus")) {
  socket = io({ path: "/gps-see-everyone/socket.io" });
} else {
  socket = io();
}
//kites from others
let receivedGroups = [];

socket.on("receive-group", (payload) => {
  receivedGroups.push(payload);
  console.log("Received group with", payload.pieces.length, "pieces");
});

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
  for (let i = 1; i <= 9; i++) imgs.push(loadImage("assets/" + i + ".JPG"));
  sound1 = loadSound("assets/stich.mp3");
}

function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("p5-canvas-container");
  canvas.elt.style.pointerEvents = "none";
  me = new MyPoint();

  //send my kite to others BUTTON
  let btn = document.createElement("button");
  btn.textContent = "🪡 Share my quilt";
  btn.style.cssText =
    "position:fixed;left:20px;bottom:30px;font-size:14px;padding:10px 18px;background:rgba(30,80,50,0.85);color:white;border:none;border-radius:24px;cursor:pointer;z-index:9999;pointer-events:auto;";
  btn.addEventListener("click", shareAllGroups);
  document.body.appendChild(btn);
}

function draw() {
  clear();
  //disable users to zoom in/out
  if (mapInit && myMap && myMap.map && !zoomLocked) {
    myMap.map.setMinZoom(18);
    myMap.map.setMaxZoom(18);
    myMap.map.scrollWheelZoom.disable();
    myMap.map.doubleClickZoom.disable();
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
    drawReceivedGroups();
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
        if (stitchCount >= 3) {
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

//your GPS position
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
    this.x = lerp(this.x, this.goalX, 0.2);
    this.y = lerp(this.y, this.goalY, 0.2);
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
    circle(0, 0, diameter);
    fill(this.col);
    stroke("pink");
    strokeWeight(3);
    circle(0, 0, this.size + sin(frameCount * 0.1) * 2);
    push();
    rotate(radians(this.heading));
    rotate(this.emojiAdjustAngle);
    translate(0, -12);
    textAlign(CENTER, CENTER);
    textSize(26);
    text("🪡", 0, 0);
    pop();
    fill(255, 0, 0);
    noStroke();
    textAlign(LEFT);
    textSize(10);
    text("±" + nf(this.accuracy, 1, 1) + "m", diameter / 2 + 5, 0);
    pop();
  }
}

const CLOTH_LONG_SIDE_M = 12;

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
  _initSize() {
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
    this._initSize();
    if (this.w === 0 || !this.img) return;
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

function spawnCloths(lat, lng) {
  cloths = [];
  clusterGroups = [];
  const MIN_CENTER_M = 18;
  const MIN_RING_M = 10;
  const MAX_CLOTHS = 10;
  const MAX_RING_M = 30;
  const degLat = 1 / 111000;
  const degLng = 1 / (111000 * Math.cos((lat * Math.PI) / 180));

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
  console.log("Spawned", cloths.length, "cloths in", attempts, "attempts");
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
  let hovering = cloths.find((c) => c.isUserOver());
  if (!hovering) return;
  if (lastCloth && hovering !== lastCloth) {
    let g1 = getGroupOf(lastCloth);
    let g2 = getGroupOf(hovering);
    if (g1 !== g2) {
      if (currentGroupPair.length === 0) {
        currentGroupPair = [g1, g2];
        stitchCount = 0.5;
      } else if (
        currentGroupPair.includes(g1) &&
        currentGroupPair.includes(g2)
      ) {
        stitchCount += 0.5;
        if (stitchCount >= 4) {
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
  const STEP = 2;
  let vec = p5.Vector.sub(activeStitch.target.pos, activeStitch.mover.pos)
    .normalize()
    .mult(STEP);

  let collision = null;
  outer: for (let a of gA) {
    for (let b of gB) {
      if (wouldOverlap(a, b, vec)) {
        collision = { a, b };
        break outer;
      }
    }
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

// ─── MERGE & STITCH (Fixed: Higher Density Stitches) ──────────
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

    // 根据长度动态计算数量
    // floor(edgeLength / STITCH_GAP) 算出能放几个，max(..., 1) 确保起码有一个
    let count = max(floor(edgeLength / STITCH_GAP), 1);

    // 计算起始位置，让针脚在边缘居中
    let totalStitchRange = (count - 1) * STITCH_GAP;
    let startY = (intersectTop + intersectBottom) / 2 - totalStitchRange / 2;

    for (let i = 0; i < count; i++) {
      let py = startY + i * STITCH_GAP;
      // 这里的坐标是相对于 cA 中心点的
      sd.points.push(p5.Vector.sub(createVector(stitchX, py), cA.pos));
    }
  } else {
    // 【上下撞击】 -> 水平缝合线
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

  // 极端保底（防止极其偶然的计算错误导致点位为空）
  if (sd.points.length === 0) {
    sd.points.push(createVector(0, 0));
  }

  permanentStitches.push(sd);

  let newGroup = g1.concat(g2);
  clusterGroups = clusterGroups.filter((g) => g !== g1 && g !== g2);
  clusterGroups.push(newGroup);
}

// ─── DRAW PERMANENT STITCHES (Fixed: Thick Green + Thin White) ───
function drawPermanentStitches() {
  // 叉叉的半径保持 2.5px，不放大
  const S = 1;

  push();
  // 优化：设置一次线段端点样式为圆头，看起来更像线
  strokeCap(ROUND);

  for (let s of permanentStitches) {
    // 逐渐显现的动画逻辑保持不变
    s.revealTimer++;
    if (s.revealTimer % 2 === 0 && s.revealed < s.points.length) s.revealed++;

    for (let i = 0; i < s.revealed; i++) {
      let wp = p5.Vector.add(s.hostCloth.pos, s.points[i]);

      // --- 关键修改：双色叠加逻辑 ---

      // 1. 先画底层的绿色粗叉叉 (作为轮廓/阴影)
      stroke(30, 80, 50, 230); // 墨绿色，保持高透明度
      strokeWeight(3.2); // 【粗】从1.2增加到3.2
      line(wp.x - S, wp.y - S, wp.x + S, wp.y + S);
      line(wp.x + S, wp.y - S, wp.x - S, wp.y + S);

      // 2. 再在上面画顶层的白色细叉叉 (作为线芯)
      stroke(255, 255, 255, 250); // 【白色】，几乎不透明
      strokeWeight(0.5); // 【细】设为1.0像素
      line(wp.x - S, wp.y - S, wp.x + S, wp.y + S);
      line(wp.x + S, wp.y - S, wp.x - S, wp.y + S);

      // ----------------------------
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
    // off-white background — no transparency
    let gfx = createGraphics(bW + PAD * 2, bH + PAD * 2);
    // gfx.background(245, 240, 228); // warm off-white

    // draw each photo piece
    for (let c of group) {
      let lx = c.pos.x - c.w / 2 - minX + PAD;
      let ly = c.pos.y - c.h / 2 - minY + PAD;
      if (c.img && c.img.width > 0) {
        gfx.imageMode(CORNER);
        gfx.image(c.img, lx, ly, c.w, c.h);
      }
      // thin border between pieces
      //   gfx.noFill();
      //   gfx.stroke(180, 170, 160, 100);
      //   gfx.strokeWeight(0.5);
      //   gfx.rectMode(CORNER);
      //   gfx.rect(lx, ly, c.w, c.h);
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

    // get base64 PNG from the graphics buffer
    let imageData = gfx.elt.toDataURL("image/png");
    gfx.remove();

    // POST to server so it saves + broadcasts to sky screen
    fetch("/kites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) console.log("Kite sent to sky screen!", data.kite.id);
      })
      .catch((err) => console.error("Failed to send kite:", err));

    // also emit via socket for the local received-groups preview (legacy)
    let pieces = group.map((c) => ({
      imgIndex: c.id % imgs.length,
      x: c.pos.x - c.w / 2 - minX,
      y: c.pos.y - c.h / 2 - minY,
      w: c.w,
      h: c.h,
    }));
    let stitchPoints = [];
    for (let s of permanentStitches) {
      if (!group.includes(s.hostCloth)) continue;
      for (let i = 0; i < s.revealed; i++) {
        let wp = p5.Vector.add(s.hostCloth.pos, s.points[i]);
        stitchPoints.push({ x: wp.x - minX, y: wp.y - minY });
      }
    }
    socket.emit("share-group", { pieces, stitches: stitchPoints });

    sent++;
  }

  if (sent === 0)
    alert("还没有缝合任何布料！ (Stitch some pieces together first!)");

  window.open("sky.html", "_blank");
}

// ─── DRAW RECEIVED GROUPS ────────────────────────────────────
function drawReceivedGroups() {
  if (receivedGroups.length === 0) return;

  const PREVIEW_MAX = 180;
  const MARGIN = 12;
  const PADDING = 8;
  let panelX = width - PREVIEW_MAX - MARGIN - PADDING * 2;
  let panelY = MARGIN;

  for (let gi = 0; gi < receivedGroups.length; gi++) {
    let g = receivedGroups[gi];
    if (!g.pieces || g.pieces.length === 0) continue;

    // 推算包围盒尺寸
    let rawW = 0,
      rawH = 0;
    for (let p of g.pieces) {
      rawW = max(rawW, p.x + p.w);
      rawH = max(rawH, p.y + p.h);
    }
    if (rawW === 0 || rawH === 0) continue;

    let sc = min(PREVIEW_MAX / rawW, PREVIEW_MAX / rawH);
    let dispW = rawW * sc;
    let dispH = rawH * sc;

    push();
    translate(panelX, panelY);

    // 背景卡片
    fill(245, 240, 230, 230);
    stroke(180);
    strokeWeight(1);
    rectMode(CORNER);
    rect(-PADDING, -PADDING, dispW + PADDING * 2, dispH + PADDING * 2, 6);

    // 图片
    for (let p of g.pieces) {
      let img = imgs[p.imgIndex];
      if (!img) continue;
      imageMode(CORNER);
      image(img, p.x * sc, p.y * sc, p.w * sc, p.h * sc);
      noFill();
      stroke(180, 180, 180, 80);
      strokeWeight(0.5);
      rect(p.x * sc, p.y * sc, p.w * sc, p.h * sc);
    }

    // 叉叉
    const S = 2;
    stroke(30, 80, 50, 200);
    strokeWeight(1);
    for (let st of g.stitches) {
      let sx = st.x * sc,
        sy = st.y * sc;
      line(sx - S, sy - S, sx + S, sy + S);
      line(sx + S, sy - S, sx - S, sy + S);
    }

    // 标签
    fill(100);
    noStroke();
    textAlign(LEFT);
    textSize(10);
    text("from friend " + (gi + 1), 0, dispH + PADDING + 10);

    pop();
    panelY += dispH + PADDING * 2 + 20;
  }
}

// ─── HELPERS ─────────────────────────────────────────────────
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

// ─── GPS CALLBACKS ───────────────────────────────────────────
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

// ─── UI ──────────────────────────────────────────────────────
function drawUI() {
  if (stitchCount > 0 || currentGroupPair.length > 0) {
    let bw = 150,
      bh = 10,
      x = 20,
      y = 20;
    noFill();
    stroke(200);
    strokeWeight(1);
    rectMode(CORNER);
    rect(x, y, bw, bh, 5);
    if (stitchCount > 0) {
      noStroke();
      fill(30, 80, 50, 200);
      rect(x, y, (stitchCount / 4) * bw, bh, 5);
    }
    fill(120);
    noStroke();
    textAlign(LEFT);
    textSize(13);
    text("sewing: " + nf((stitchCount / 4) * 100, 1, 0) + "%", x, y + 25);
  }
  if (activeStitch) {
    fill(30, 80, 50, 180);
    noStroke();
    textAlign(CENTER);
    textSize(13);
    text("✦ stitching…", width / 2, height - 30);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
