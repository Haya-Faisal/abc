let grid = [];
let gridSize = 4;
let cellWidth, cellHeight;
let bgImage;
let one,two,three,four;

function preload() {
  // Load image with callback to know when it's loaded
  bgImage = loadImage("assets/apartment.jpg");
  one=loadSound("assets/one.mp3")
  two=loadSounds("assets/two.mp3")
  three=loadSounds("assets/three.mp3")
  four=loadSounds("assets/four.mp3")
}

function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("p5-canvas-container");

  for (let i = 0; i < gridSize; i++) {
    grid[i] = [];
    for (let j = 0; j < gridSize; j++) {
      grid[i][j] = 0; 
    }
  }
 
  cellWidth = width / gridSize;
  cellHeight = height / gridSize;
}

function draw() {
  image(bgImage, 0, 0, width, height);
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      if (grid[i][j] === 0) {
        fill(0); 
      } else {
        noFill()
      } 
      rect(i * cellWidth, j * cellHeight, cellWidth, cellHeight);
    }
  }
}
// P5 touch events: https://p5js.org/reference/#Touch

function touchStarted() {
  if (mouseX >= 0 && mouseX < width && mouseY >= 0 && mouseY < height) {
    
    let col = floor(mouseX / cellWidth);
    let row = floor(mouseY / cellHeight);
    
    
    if (col >= 0 && col < gridSize && row >= 0 && row < gridSize) {
      
      
      if (grid[col][row] === 0) {
        grid[col][row] = 1; 
      } else {
        grid[col][row] = 0; 
      }
      
      if (row === 0) {
        one.play();
      } else if (row === 1) {
        two.play();  
      } else if (row === 2) {
        three.play();
      } else if (row === 3) {
        four.play();
      }
    }
  }
}

function touchMoved() {
}

function touchEnded() {
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
}