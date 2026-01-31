let alpha, beta, gamma = 0;
let stones=[]
let lastStoneTime = 0;
let stoneInterval = 1000;
let windStrength = 0;
let score = 0;
let gameOver = false;
let gameStarted = false;

function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("p5-canvas-container");
}

function draw() {
  background(7, 3, 69);

  if (!gameStarted) {
  textSize(16);
  fill(255);
  textAlign(CENTER);
  text("Click the button above to start", width/2, height/2-40);
  textSize(16);
  text("Tilt your phone to move the ball", width/2, height/2 );
  text("Avoid the green balls", width/2, height/2 +40);
  }


  if (gameOver) {
    // Display game over screen
    textSize(48);
    fill(255, 255, 255);
    textAlign(CENTER);
    text("GAME OVER", width/2, height/2 - 50);
    textSize(32);
    text("Final Score: " + score, width/2, height/2 + 20);
    textSize(24);
    text("Tap to restart", width/2, height/2 + 70);
    return; // Stop further drawing
  }

  noStroke();

  
    push();
    translate(width/2, height/2);

    // ball bar
    fill(241,230,210);
    rect(-150, 100, 300, 30,20);
  
    // Gamma ranges = -90° - 90° 
    // Mapping it between -175 and 175 
    let ballX = map(gamma, -90, 90, -175, 175);
  
    // Constraining the ball so it dsnt leave the bar
    ballX = constrain(ballX, -135, 135);
  
    // ball
    fill(137,29,26);
    circle(ballX, 115, 25)
  
    pop();
  
  

  if (gameStarted && stones.length < 5 && millis() - lastStoneTime > stoneInterval) {
    let posx = random(50, width-50);
    stones.push(new Stone(posx, -5)); // Start above the screen
    lastStoneTime = millis();
  }
  
  if (gameStarted) {
    for (let i = 0; i < stones.length; i++) {
      stones[i].update();
      stones[i].display();
    }
  }

  for (let i = stones.length - 1; i >= 0; i--) {
    // Check if stone has passed ball bar 
    if (stones[i].posy > height/2 + 165) { 
      stones.splice(i, 1);
    }
  }

  for (let i = stones.length - 1; i >= 0; i--) {
  // Get the actual ball position on screen
  let ballScreenX = width/2 + ballX; 
  let ballScreenY = height/2 + 115;   // Bar Y position + ball offset
  
  let stone = stones[i];
  
  // Calculate distance between ball and stone
  let d = dist(ballScreenX, ballScreenY, stone.posx, stone.posy);
  
  // If collision detected
  if (d < (25/2 + stone.size/2)) { // 25 is ball diameter, stone.size is stone diameter
    if (stone.isSpecial) {
      // Special stone  increase score
      score++;
      stones.splice(i, 1); 
    } else {
      // regular stone
      gameOver = true;
    }
  }
}

// Display score under the bar
if (gameStarted){
 fill(255);
 textSize(24);
 textAlign(CENTER);
 text("Score: " + score, width/2, height/2 + 170);
 textAlign(LEFT); // Reset alignment
}



  // text("alpha: " + round(alpha), 10, 30);
  // text("beta: " + round(beta), 10, 40);
  // text("gamma: " + round(gamma), 10, 50);

}

class Stone{
  constructor(posx,posy){
    this.posx=posx  //position of stone
    this.posy=posy
    this.size=27  // size of stone
    this.speed=random(2,4)
    this.speedX = 0;
    this.windStrength = random(-0.2, 0.2);
    this.isSpecial = random() < 0.3;
  } 

  update(){
    this.posy+=this.speed

    this.speedX+=this.windStrength*0.1
    this.speedX *= 0.98;
    this.posx+=this.speedX

    let barLeft = width/2 - 150;  
    let barRight = width/2 + 150; 
  
    // Constrain the stone's X position
    this.posx = constrain(this.posx, barLeft + this.size/2, barRight - this.size/2);
  }

  display(){
    push()
    translate(this.posx,this.posy)
    if (this.isSpecial) {
      fill(137, 29, 26); // Same color as the ball
    } else {
      fill(136, 144, 99); // Original stone color
    }
    circle(0,0,this.size)
    pop()
  }
}

// P5 touch events: https://p5js.org/reference/#Touch

function touchStarted() {
  console.log(touches);

  if (gameOver) {
    // Reset game
    gameOver = false;
    score = 0;
    stones = []; // Clear all stones
    lastStoneTime = millis(); // Reset stone timer
  }
}

function touchMoved() {
}

function touchEnded() {
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
}

function handleOrientation(eventData){
  document.querySelector('#requestOrientationButton').style.display = "none";

  gameStarted = true;
  lastStoneTime = millis();
  // console.log(eventData.alpha, eventData.beta, eventData.gamma);
  
  alpha = eventData.alpha;
  beta = eventData.beta;
  gamma = eventData.gamma;
    
}
