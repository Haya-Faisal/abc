const express = require('express');
const https   = require('https');
const fs      = require('fs');

const app       = express();
const portHTTPS = 4230;

app.use(express.static('public'));

const options = {
    key:  fs.readFileSync('keys-for-local-https/localhost-key.pem'),
    cert: fs.readFileSync('keys-for-local-https/localhost.pem'),
};

const HTTPSserver = https.createServer(options, app);

const { Server } = require('socket.io');
const io = new Server(HTTPSserver);

let screen1 = null;
let screen2 = null;
let levelChanged=false

// for food
// the server decides which screen and which posiiton >> screen=random, x,y in btw screen range return the values
function decidefood(){
    let screen
    if (Math.random()>0.5){
        screen=2
    }else{
        screen=1
    }
    let x=Math.floor(Math.random() * 18) *20
    let y=Math.floor(Math.random() * 25)*20
    return ({screen,x,y})
}


// Connection
io.on('connection', (socket) => {
    console.log('screen connected:', socket.id);

    
    // Assign role and socket id
    let role = null;
    if      (!screen1) { screen1 = socket.id; role = 1; }
    else if (!screen2) { screen2 = socket.id; role = 2; }
    else { //if both screens already connected, no more space
        socket.emit('lobby-full');
        socket.disconnect();
        return;
    }
    //inform the clint their role 1/2 in this case
    socket.emit('your-role', role);
    console.log(`role ${role} assigned`);

    if (screen1 && screen2) {
        //get screen one and start snake
        socket.emit('all-here');
        io.to(screen1).emit('start-snake')
        io.to(screen2).emit('level1')
        console.log('both screens ready');

        //then send values to the right screen. food.screen==screen1 io.to(screen1).emit('spawn-food,{x:food.x})
        //in server, socket.on spwen food. foodx=x and foody=y
        //both screens show food, bc of the variable defines in sketch.js since it is never set to undefined
        let food=decidefood()
        if (food.screen==1){
            io.to(screen1).emit('food-pos',{x:food.x,y:food.y})
            //explicitly claring the toher screens food
            io.to(screen2).emit('food-cleared')
        }else{
            io.to(screen2).emit('food-pos',{x:food.x,y:food.y})
            io.to(screen1).emit('food-cleared')
        }
    }

    // // Snake exits on screen and goes into another
    // //listen when snake leaves and from where
    socket.on('snake-exited', ({ side, x, y ,snakelenght}) => {
        //what screen will the snake go into now??
        let otherId; 
        if (role===1){
            otherId=screen2
        }else{
            otherId=screen1
        }
        //get that screens socket connection
        
        if (otherId) {
            io.to(otherId).emit('snake-entering', { 
            from: side, 
            x, 
            y,
            snakelenght: snakelenght
        });
        } else {
            socket.emit('snake-bounce', { side });
        }
    });
    
    //once food gets eaten, send a new food
    //server receive food eaten and sends new food pos with same emit.spawnfood    
    socket.on('food-eaten',({score })=>{
        let otherId ;
        if (role==1){
        otherId = screen2
    }else{
        otherId=screen1
    }
        if(score >= 2 && !levelChanged) {
        levelChanged = true  // ← never fires again
        console.log('emitting level-change!')
        io.emit('level-change', { level: 2 })
    }
        if(otherId)
            {io.to(otherId).emit('score-update', { score })
        } 
        
        let newfood=decidefood()
        if (newfood.screen==1){
        io.to(screen1).emit('food-pos',{x:newfood.x,y:newfood.y})
        io.to(screen2).emit('food-cleared')
    }else{
        io.to(screen2).emit('food-pos',{x:newfood.x,y:newfood.y})
        io.to(screen1).emit('food-cleared')
    }
    })

    socket.on('food-expired',()=>{
        let newfood=decidefood()
        if (newfood.screen==1){
        io.to(screen1).emit('food-pos',{x:newfood.x,y:newfood.y})
        io.to(screen2).emit('food-cleared')
    }else{
        io.to(screen2).emit('food-pos',{x:newfood.x,y:newfood.y})
        io.to(screen1).emit('food-cleared')
    }
    })

    socket.on('tilt', ({ gamma, beta }) => {
    let otherId ; 
    if (role==1){
        otherId = screen2
    }else{
        otherId=screen1
    }
    //=== 1 ? screen2 : screen1
    if(otherId){
        io.to(otherId).emit('tilt', { gamma, beta })
    }
    })

    socket.on('update-score',(socre)=>{

    })
    

    // Disconnect
    socket.on('disconnect', () => {
        if (screen1 === socket.id) screen1 = null;
        if (screen2 === socket.id) screen2 = null;
        // if (screen3 === socket.id) screen3 = null;
        io.emit('other-disconnected');
        console.log('disconnected:', socket.id);
    });
});

HTTPSserver.listen(portHTTPS, () => {
    console.log('HTTPS Server started at port', portHTTPS);
});
