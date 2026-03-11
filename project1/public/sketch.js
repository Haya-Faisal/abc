// Socket setup
let socket;
if(location.hostname.toLowerCase().startsWith('browsercircus') || location.hostname.toLowerCase().startsWith('www')){
  socket = io({path: "/haya/port-4230/socket.io"});  
}else{
  socket = io(); 
}

// Variables
let beta, gamma = 0;
let currentDir = "";
let score = 0;
let gameOver = false;
let gameStarted = false;
let hassnake=false
let exiting=false
let Snake=[]
let snakedirx=0
let snakediry=0
let snakesize=20

let state="waiting"
let currentrole=null

let cellsize=20
let column,rows;

let foodposx;
let foodposy;
let foodtimer=0

let MOVE_INTERVAL=320
let lastmove=0

let img

function preload(){
  img=loadImage("./assets/qrcodehongkong.png")
}

// Socket event 
//startsnake, your role, lobby full, snake enter, snake bouce, snake leave
socket.on('start-snake',()=>{
  initSnake()
  document.getElementById('waiting-message').style.display = 'none'
  document.getElementById('instructions').style.display = 'none'
  document.getElementById('level1-message').style.display = 'block'
  document.getElementById('score-display').style.display = 'block'
  // document.getElementById('requestOrientationButton').style.display = 'block'
})

socket.on('your-role',(role)=>{
  currentrole=role
  state="waitforotherstojoin"

})

socket.on('all-here',()=>{
  state='waiting'
})

socket.on('lobby-full',()=>{
   state="full"
   console.log("lobby full")
})

socket.on('level1',()=>{
  state='level1'
  hassnake=false
  document.getElementById('waiting-message').style.display = 'none'
  document.getElementById('level1-message').style.display = 'block'
  document.getElementById('score-display').style.display = 'block'
  // document.getElementById('requestOrientationButton').style.display = 'block'
  document.getElementById('instructions').style.display = 'none'
})

socket.on('snake-entering',({from,x,y,snakelenght})=>{
  let startX, startY

  if (from === 'right') {
    startX = 0
    startY = y
    snakedirx = 1
    snakediry = 0
  } else if (from === 'left') {
    startX = column * cellsize - cellsize
    startY = y
    snakedirx = -1
    snakediry = 0
  } else if (from === 'bottom') {
    startX = x
    startY = 0
    snakedirx = 0
    snakediry = 1
  } else if (from === 'top') {
    startX = x
    startY = rows * cellsize - cellsize
    snakedirx = 0
    snakediry = -1
  }

    // build snake at entry point
    Snake = [{ x: startX, y: startY }]
    for (let i = 1; i < snakelenght; i++) {
      Snake.push({
        x: startX - snakedirx * cellsize * i,
        y: startY - snakediry * cellsize * i,
      })
    }

    hassnake = true
    // state    = 'level1'

    updateLevel2Instructions()
    // console.log(Snake)

})

socket.on('snake-bounce',()=>{
  snakedirx=-snakedirx
  snakediry=-snakediry

})

socket.on('other-disconnected',()=>{
  state="disconnected"
  hassnake=false

})

socket.on('food-pos',({x,y})=>{
  // console.log('food received at', x, y)
  foodposx=x
  foodposy=y

  foodtimer=millis()

})

//explicitly setting food cordinates to undefined if other screen has food
socket.on('food-cleared', () => {
  foodposx = undefined
  foodposy = undefined
  
})

socket.on('tilt', ({ gamma: g, beta: b }) => {
    gamma = g
    beta = b
})

socket.on('score-update', ({ score: s }) => {
    score = s
    document.getElementById('score-display').innerText = 'SCORE: ' + score
    if(score>= 5){
      // option1 
      // redirect to level 2
      state="level2"
      // options 2
      // show 'congrats...' text
      // setTimeout 3 seconds
      //       redirect to level 2  
    }
})

socket.on('level-change', ({ level }) => {
    if(level === 2){
        state = 'level2'
        
        // show the overlay
        let overlay = document.getElementById('congrats-overlay')
        overlay.style.display = 'flex'
        console.log("congrats",score)
        
        // hide it after 3 seconds
        setTimeout(() => {
            overlay.style.display = 'none'
            let instructions = document.getElementById('instructions')
            instructions.style.display = 'block'
            // update instructions after overlay disappears
            //initial idea was for the text to alternate. but not working right
            if(hassnake){
                instructions.innerText = ' The snake is controlled by the screen it is not displayed on!'
            } else {
                instructions.innerText = 'The snake is controlled by the screen it is not displayed on!'
            }
        }, 3000)
        document.getElementById('level1-message').style.display = 'none'
    }
})
// p5js stuff
function setup() {
  // total no. of cols and rows
  column=360/cellsize
  rows=500/cellsize
  // making the canvas
   let canvas = createCanvas(360, 500);
   canvas.parent("p5-canvas-container");
   textFont('Press Start 2P');
   textSize(12);
}

function draw() {
  background(2,59,30);

  if(state=="level1"){
    // gameStarted=true
    updatedirection()
    if(hassnake){
      if(millis() - lastmove>MOVE_INTERVAL){
        moveSnake()
        lastmove=millis()
      }
    }
  }

  if(state=="level2"){
    updatedirection()
    if(hassnake){
      if(millis() - lastmove>MOVE_INTERVAL){
        moveSnake()
        lastmove=millis()
      }
    }
  }

  if(state === 'level1' && hassnake){
    drawArrows()  // show arrows on this screen
  }

  if(state === 'level2' && !hassnake){
    drawArrows()  // this screen is controlling, show arrows 
  }
  
  drawSnake()
  if(foodposx !== undefined){
    if(millis() - foodtimer > 20000){  // 10 seconds
        foodposx = undefined
        foodposy = undefined
        socket.emit('food-expired')
    } else {
        food()  // only draw if not expired
    }
}

  if (state=="waitforotherstojoin"){
    fill(245,250,247);
    textAlign(CENTER);
    text("waitt", width/2, height/2-40);
    image(img,0,0,360,500)
  }

  if(state=="waiting"){
    fill(245,250,247);
    textAlign(CENTER);
    text("Snake on other screen", width/2, height/2-40);
  }

//   if(beta && gamma){
// text(beta, 40, 35);
//   text(gamma, 40, 50);
//   }
  
  // text(currentDir, 40, 65)
  fill(245,250,247)
  text("role " + currentrole, 40, 25);
  // text(" state " + state,40,40)
  
  // stroke(0)
  // for(let x = 0; x < column*cellsize; x+=cellsize){
  //   line(x, 0, x, height)
  // }
  
}

function drawSnake(){
  noStroke()
  for(i=0;i<Snake.length;i++){ //
    if (i==0){
      fill(0,210,0)
    }else{
      fill(0,158,58)
    }
    square(Snake[i].x,Snake[i].y,snakesize-2)
  }
}
function initSnake() {
  //cellsize=20
    Snake = [
        { x: cellsize*5, y: cellsize*10 },
        { x: cellsize*4, y: cellsize*10 },
        { x: cellsize*3, y: cellsize*10 },
    ]
    snakedirx = 0
    snakediry = 0
    hassnake  = true
    state='level1'
}

function moveSnake(){
  if (snakedirx === 0 && snakediry === 0) return;

  let head=Snake[0]
  let newhead={
    x: head.x + (snakedirx * cellsize),  
    y: head.y + (snakediry * cellsize)
  }
  // console.log( head)

  if(!exiting){
    if (newhead.x >= 360) {
    exiting=true
    socket.emit('snake-exited', { side: 'right', x: newhead.x, y: head.y,snakelenght:Snake.length })
    updateLevel2Instructions()
    return
  }
  if (newhead.x < 0) {
    exiting=true
    socket.emit('snake-exited', { side: 'left', x: newhead.x, y: head.y,snakelenght:Snake.length })
    updateLevel2Instructions()
    return
  }
  if (newhead.y >= 500) {
    exiting=true
    socket.emit('snake-exited', { side: 'bottom', x: head.x, y: newhead.y,snakelenght:Snake.length })
    updateLevel2Instructions()
    return
  }
  if (newhead.y < 0) {
    exiting=true
    socket.emit('snake-exited', { side: 'top', x: head.x, y: newhead.y,snakelenght:Snake.length })
    updateLevel2Instructions()
    return
  }
  }
  

  //once the head reches the corner, stop drawing the head and start popping the tail. 
  if(exiting){
    Snake.pop()
    if (Snake.length==0){
      hassnake=false
      exiting=false
    }
  }

 //once snake head reches the food, dont pop, j unshift. inform the server
  if(foodposx==newhead.x && foodposy==newhead.y){
    Snake.unshift(newhead)
    //making the food disappear after its eaten
    foodposx = undefined
    foodposy = undefined
    foodtimer=millis()
    //inc snake speed
    MOVE_INTERVAL-=10
    score++ 
    socket.emit('food-eaten',{ score })
    document.getElementById('score-display').innerText = 'SCORE: ' + score
    if(score>= 5){
      // option1 
      // redirect to level 2
      state="level2"
      // options 2
      // show 'congrats...' text
      // setTimeout 3 seconds
      //       redirect to level 2  
    }
  }else{//unshift and pop
     Snake.unshift(newhead)
     Snake.pop()
  }
  
}

function updatedirection(){ 
  
  let movingThreshold = 10;
  let newdirx=snakedirx
  let newdiry=snakediry
  // are we moving vetical or horizontal?
  if(abs(gamma)>abs(beta)){
    // left or right

    // are we moving at all? update new direction
    if(gamma > movingThreshold){
      // move right
      newdirx=1
      newdiry=0;
      currentDir = "right"
    }else if(gamma < -movingThreshold){
      // move left
      newdirx=-1
      newdiry=0
      currentDir = "left"
    }
  }else{
    // up or down
    // are we moving at all? 
    if(beta > movingThreshold){
      // move down
      newdirx=0
      newdiry=1
      currentDir = "down"
    }else if(beta < -movingThreshold){
      // move up
      newdirx=0
      newdiry=-1
      currentDir = "up"
    }
  }

    //check if new direction is same as old direction, if so, return, else old direction=newdirectio
    if(newdirx === -snakedirx && newdiry === -snakediry) {
       return
    }
    //  console.log('setting direction to', newdirx, newdiry) 
   
    snakedirx=newdirx
    snakediry=newdiry

}

function updateLevel2Instructions(){
    if(state !== 'level2') return
    let instructions = document.getElementById('instructions')
    if(hassnake){
        instructions.innerText = 'The other phone controls your snake!'
    } else {
        instructions.innerText = 'Tilt your phone to control the snake on the other screen!'
    }
}

function drawArrows(){
    let dull = color(0, 80, 30)    // dull green
    let bright = color(0, 255, 80) // bright green

    // top arrow — lights up when moving up
    fill(snakediry === -1 ? bright : dull)
    noStroke()
    triangle(180, 10, 160, 40, 200, 40)

    // bottom arrow — lights up when moving down
    fill(snakediry === 1 ? bright : dull)
    triangle(180, 490, 160, 460, 200, 460)

    // left arrow — lights up when moving left
    fill(snakedirx === -1 ? bright : dull)
    triangle(10, 250, 40, 230, 40, 270)

    // right arrow — lights up when moving right
    fill(snakedirx === 1 ? bright : dull)
    triangle(350, 250, 320, 230, 320, 270)
}

function food(){
  //draw food in function
  fill(49,0,89)
  square(foodposx,foodposy,18)

}

function handleOrientation(eventData){
  // console.log("")
  document.querySelector('#requestOrientationButton').style.display = "none";

  console.log(eventData.alpha, eventData.beta, eventData.gamma);
  
  if(state == 'level1'){
        // if(state == 'level1'){
    if(hassnake){
        beta = eventData.beta
        gamma = eventData.gamma
    } 
// }
    } else if(state == 'level2'){
        if(!hassnake){
            // level 2: 
            beta = eventData.beta
            gamma = eventData.gamma
            socket.emit('tilt', { gamma, beta })
        }
       
    }
    
}


//add the jpy stock thing
