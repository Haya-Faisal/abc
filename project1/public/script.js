let socket;
if(location.hostname.toLowerCase().startsWith('browsercircus') || location.hostname.toLowerCase().startsWith('www')){
  socket = io({path: "/YOUR-NAME/YOUR-PORT/socket.io"});  // e.g. '/leon/port-4100/socket.io' or '/socket.io'
}else{
  socket = io(); 
}
// ─── CANVAS SETUP 
const canvas     = document.getElementById('game-canvas');
const ctx        = canvas.getContext('2d');
const CELL_SIZE  = 20;
const COLS       = Math.floor(window.innerWidth  / CELL_SIZE);
const ROWS       = Math.floor(window.innerHeight / CELL_SIZE);
canvas.width     = COLS * CELL_SIZE;
canvas.height    = ROWS * CELL_SIZE;

// ─── GAME STATE 
let myRole       = null;      // 'left' or 'right'
let totalScreens = 0;
let hasSnake     = false;     // does this screen currently own the snake?
let phase        = 'waiting'; // 'waiting' | 'playing' | 'disconnected' | 'full'

// Snake
let snake        = [];        // [{ x, y }, ...] head is index 0
let snakeDir     = { dx: 0, dy: 0 }; // current direction (zero = not moving yet)
let lastMoveTime = 0;
const MOVE_INTERVAL = 320;   // ms between each snake step (lower = faster)

// Tilt
let gamma        = 0;
let beta         = 0;
const THRESHOLD  = 10;       // degrees of tilt to register movement

// ─── SOCKET EVENTS 

socket.on('your-role', ({ role }) => {
    myRole = role;
    phase  = 'waiting';
    draw();
});

socket.on('screens-update', ({ count }) => {
    totalScreens = count;
    if (phase === 'waiting') draw();
});

// Server tells this screen to start the snake (only sent to LEFT)
socket.on('start-snake', () => {
    initSnake();
    draw();
});

// Server tells this screen the snake is arriving from another screen
socket.on('snake-entering', ({ from, x, y }) => {
    phase    = 'playing';
    hasSnake = true;

    // Place the snake head at the entry edge
    // 'from' is the side it exited on the OTHER screen,
    // so it enters this screen on the opposite side
    let startX, startY;

    if (from === 'right') {
        // Snake exited right on the other screen → enters left edge of this screen
        startX = 0;
        startY = y;
        snakeDir = { dx: 1, dy: 0 };
    } else if (from === 'left') {
        // Snake exited left → enters right edge
        startX = COLS - 1;
        startY = y;
        snakeDir = { dx: -1, dy: 0 };
    } else if (from === 'bottom') {
        // Snake exited bottom → enters top edge
        startX = x;
        startY = 0;
        snakeDir = { dx: 0, dy: 1 };
    } else if (from === 'top') {
        // Snake exited top → enters bottom edge
        startX = x;
        startY = ROWS - 1;
        snakeDir = { dx: 0, dy: -1 };
    }

    // Build a short snake at the entry point
    snake = [{ x: startX, y: startY }];
    for (let i = 1; i < 3; i++) {
        snake.push({
            x: startX - snakeDir.dx * i,
            y: startY - snakeDir.dy * i,
        });
    }

    requestAnimationFrame(gameLoop);
});

// Server tells this screen to bounce the snake back (other screen not connected)
socket.on('snake-bounce', ({ side }) => {
    // Reverse direction
    snakeDir = { dx: -snakeDir.dx, dy: -snakeDir.dy };
});

socket.on('other-disconnected', () => {
    phase = 'disconnected';
    draw();
});

socket.on('lobby-full', () => {
    phase = 'full';
    draw();
});

// ─── SNAKE INIT 

function initSnake() {
    // Start in the middle left area, moving right
    snakeDir = { dx: 0, dy: 0 }; 
    phase    = 'playing';
    hasSnake = true;
    const startX = Math.floor(COLS * 0.25);
    const startY = Math.floor(ROWS / 2);
    snake    = [
        { x: startX,     y: startY },
        { x: startX - 1, y: startY },
        { x: startX - 2, y: startY },
    ];
    snakeDir = { dx: 0, dy: 0 }; 
    hasSnake = true;

    requestAnimationFrame(gameLoop);
}

// ─── GAME LOOP 

function gameLoop(timestamp) {
    if (!hasSnake || phase !== 'playing') return;

    // Update tilt direction
    updateDirectionFromTilt();

    // Only move snake if enough time has passed AND we have a direction
    if (timestamp - lastMoveTime > MOVE_INTERVAL && (snakeDir.dx !== 0 || snakeDir.dy !== 0)) {
        moveSnake();
        lastMoveTime = timestamp;
    }

    draw();
    requestAnimationFrame(gameLoop);
}

function moveSnake() {
    const head   = snake[0];
    const newHead = {
        x: head.x + snakeDir.dx,
        y: head.y + snakeDir.dy,
    };

    // ── Check boundary exit ──
    if (newHead.x >= COLS) {
        // Exited right edge
        hasSnake = false;
        socket.emit('snake-exited', { side: 'right', x: newHead.x, y: head.y });
        return;
    }
    if (newHead.x < 0) {
        // Exited left edge
        hasSnake = false;
        socket.emit('snake-exited', { side: 'left', x: newHead.x, y: head.y });
        return;
    }
    if (newHead.y >= ROWS) {
        // Exited bottom edge
        hasSnake = false;
        socket.emit('snake-exited', { side: 'bottom', x: head.x, y: newHead.y });
        return;
    }
    if (newHead.y < 0) {
        // Exited top edge
        hasSnake = false;
        socket.emit('snake-exited', { side: 'top', x: head.x, y: newHead.y });
        return;
    }

    // ── Normal move ──
    snake.unshift(newHead); // add new head
    snake.pop();            // remove tail
}

// ─── TILT → DIRECTION 

function updateDirectionFromTilt() {
    let dx = 0, dy = 0;

    if (Math.abs(gamma) > Math.abs(beta - 90)) {
        if (gamma > THRESHOLD)        { dx =  1; dy = 0; }
        else if (gamma < -THRESHOLD)  { dx = -1; dy = 0; }
    } else {
        if (beta < 90 - THRESHOLD)       { dx = 0; dy = -1; }
        else if (beta > 90 + THRESHOLD)  { dx = 0; dy =  1; }
    }

    snakeDir = { dx, dy };
}

// ─── DEVICE ORIENTATION

function handleOrientation(event) {
    document.getElementById('requestOrientationButton').style.display = 'none';
    phase    = 'playing';
    gamma = event.gamma; // left/right tilt: -90 to 90
    beta  = event.beta;  // front/back tilt: -180 to 180
    console.log(gamma,beta)
}

window.requestOrientation = function() {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(state => {
                if (state === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation, true);
                }
            })
            .catch(console.error);
    } else {
        // Non-iOS devices don't need permission
        window.addEventListener('deviceorientation', handleOrientation, true);
    }
}

// ─── DRAWING 

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();

    if (phase === 'waiting')      { drawWaiting();      return; }
    if (phase === 'disconnected') { drawDisconnected();  return; }
    if (phase === 'full')         { drawFull();          return; }

    // Playing
    drawGrid();
    if (hasSnake) drawSnake();
    drawHUD();
}

function drawBackground() {
    ctx.fillStyle = '#07035A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 0.5;
    for (let c = 0; c <= COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * CELL_SIZE, 0);
        ctx.lineTo(c * CELL_SIZE, canvas.height);
        ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * CELL_SIZE);
        ctx.lineTo(canvas.width, r * CELL_SIZE);
        ctx.stroke();
    }
}

function drawSnake() {
    snake.forEach((seg, i) => {
        const isHead = i === 0;
        ctx.fillStyle = isHead ? '#FFFFFF' : '#44FF88';
        const pad = isHead ? 1 : 2;
        ctx.fillRect(
            seg.x * CELL_SIZE + pad,
            seg.y * CELL_SIZE + pad,
            CELL_SIZE - pad * 2,
            CELL_SIZE - pad * 2
        );
    });
}

function drawHUD() {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font      = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCREEN ${myRole}`, 10, 20);

    if (!hasSnake) {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font      = '13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('snake is on the other screen', canvas.width / 2, canvas.height / 2);
    }
}

function drawWaiting() {
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font      = 'bold 22px monospace';
    ctx.fillText(myRole ? `SCREEN ${myRole}` : 'CONNECTING...', canvas.width / 2, canvas.height / 2 - 30);

    ctx.font      = '14px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`${totalScreens} / 2 screens connected`, canvas.width / 2, canvas.height / 2 + 10);
    ctx.fillText('waiting for other screen...', canvas.width / 2, canvas.height / 2 + 35);
}

function drawDisconnected() {
    ctx.fillStyle = '#FF4444';
    ctx.textAlign = 'center';
    ctx.font      = 'bold 20px monospace';
    ctx.fillText('OTHER SCREEN DISCONNECTED', canvas.width / 2, canvas.height / 2 - 20);

    ctx.font      = '14px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('waiting for reconnection...', canvas.width / 2, canvas.height / 2 + 20);
}

function drawFull() {
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font      = 'bold 20px monospace';
    ctx.fillText('GAME FULL', canvas.width / 2, canvas.height / 2 - 20);

    ctx.font      = '14px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('only 2 screens allowed', canvas.width / 2, canvas.height / 2 + 20);
}

// ─── INIT 
draw();