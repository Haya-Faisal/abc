const express = require('express');

const https = require("https");
const fs = require("fs");
const app = express();
const portHTTPS = 3010;

app.use(express.static('public'));

const options = {
    key: fs.readFileSync("localhost-key.pem"),
    cert: fs.readFileSync("localhost.pem"),
};

let HTTPSserver = https.createServer(options, app)

const { Server } = require('socket.io');
const io = new Server(HTTPSserver);

let currentlyConntected = [];

io.on('connection', (socket) => {

    console.log('a user connected', socket.id);
    currentlyConntected.push(socket.id);
    console.log(currentlyConntected);

    socket.on('share-group', (payload) => {
        console.log('sharing group from', socket.id, '- pieces:', payload.pieces.length);
        socket.broadcast.emit('receive-group', payload);
    });

    socket.on("disconnect", function(){
        console.log("someone disconnected", socket.id)
        let idx = currentlyConntected.indexOf(socket.id);
        if(idx > -1){
            currentlyConntected.splice(idx, 1);
            console.log(currentlyConntected);
        }
    })

})

HTTPSserver.listen(portHTTPS, function (req, res) {
    console.log("HTTPS Server started at port", portHTTPS);
});