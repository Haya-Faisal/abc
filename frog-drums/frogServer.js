const express = require('express');

const https = require("https");
// to read certificates from the filesystem (fs)
const fs = require("fs");

const app = express(); // the server "app", the server behaviour
const portHTTPS = 4101; // port for https

// returning to the client anything that is
// inside the public folder
app.use(express.static('public'));


// Creating object of key and certificate
// for SSL
const options = {
    key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
    cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
};

let HTTPSserver = https.createServer(options, app)


const { Server } = require('socket.io'); // include library
const { arrayBuffer } = require('stream/consumers');
const io = new Server(HTTPSserver); // start socket io 


let frogs = [];
let conductor;

io.on('connection', (socket) => {

    // we manage the connection inside here
    console.log('a user connected', socket.id);


    // LISTEN TO
    // client self-reporting role:
    socket.on("my-role", function(data){
        console.log(data)
        // if frog:
        //     add object with socket id to frog array
        //     inform conductor of new frog
        if (data.role=="frog"){
            frogData={
                id:socket.id,
                frogIdx:data.myfrogIdx,
            }
            frogs.push(frogData)
            console.log(frogs)
        
        // if conductor:
        //     store conductor socket id to conductor global variable
        // }else if(data.role=="conductor"){
        //     conductor=socket.id
        //     socket.emit("frogs-online",frogs)
            if(conductor!=undefined){
                io.to(conductor).emit("new-frog",frogData)
            }
        }else if(data.role=="conductor"){
           conductor=socket.id
            socket.emit("frogs-online",frogs)
    }})
    //socket.emit-socket sends back to one who send
    // io.emit socket send to everyone
    // io.to(socketID).emit() send it socketID only

    // always comes from conductor
    // listen to frogs being triggered

        // check if frog exists
        // option A: tell taht frog to make sounds
        // option B: chck if the frog currently makes sounds
        //      either tell them to start or stop





    
    // DISCONNECT
    // manage the roles
    socket.on("disconnect", function(){
        console.log("someone disconnected", socket.id)
        // console.log(frogs);

        // delete frog from the global array
        // that keeps track of all frogs online
        
        // find index
        let idx = frogs.findIndex(function(f){
            return f.id == socket.id
        });
        console.log("idx",idx)

        // if its a frog
        if(idx>-1){
            frogs.splice(idx,1)
        }
        console.log(frogs)
            // delete frog
        // if it's a cnductpr
        if(socket.id==conductor){
            conductor=undefined
        }

            // delete conductor


        // if the condiuctr is still online
        // tell them which frg has been deleted
        if(conductor!=undefined){
            io.to(conductor).emit("delete-frog",socket.id)
        }

    })

})




// Creating servers and make them listen at their ports:

HTTPSserver.listen(portHTTPS, function (req, res) {
    console.log("HTTPS Server started at port", portHTTPS);
});