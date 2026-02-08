let socket = io();

let formeElm = document.querySelector("#chatForm");
console.log(formeElm);
let msgInput = document.querySelector("#newMessage");
console.log(msgInput);
let nameInput = document.querySelector("#nameWrapper input"); // <---------

const messageTransformers = [
    // 1. SpOnGeBoB mOcKiNg CaSe
    msg => {
        return msg.split('').map((char, i) => 
            i % 2 === 0 ? char.toLowerCase() : char.toUpperCase()
        ).join('');
    },
    
    // 2. Reverse the words 
    msg => {
        return msg.split(' ').reverse().join(' ');
    },
    
    // 3. Replace vowels with duck emoji
    msg => {
        return msg.replace(/[aeiou]/gi, '🦆');
    },
    
    // 4. Whisper mode
    msg => {
        return `(psst... ${msg.toLowerCase()})`;
    },
    // 2. Reverse the words 
    msg => {
        return msg.split(' ').reverse().join(' ');
    },
    
    // 5. Leetspeak
    msg => {
        const leetMap = {
            'a': '4', 'e': '3', 'i': '1', 'o': '0', 's': '5',
            't': '7', 'b': '8', 'g': '9', 'l': '1'
        };
        return msg.toLowerCase().split('').map(char => 
            leetMap[char] || char
        ).join('');
    },
    
    // 6. SUPER EXCITED!!!
    msg => {
        return `${msg.toUpperCase()}!!!`;
    },
];

// Control how often transformations happen 
const transformationChance = 0.60; 

// function to apply random transformation
function applyRandomTransformation(message) {
    if (Math.random() < transformationChance) {
        const randomIndex = Math.floor(Math.random() * messageTransformers.length);
        const transformer = messageTransformers[randomIndex];
        return {
            transformed: true,
            original: message,
            text: transformer(message),
            transformerIndex: randomIndex
        };
    }
    return {
        transformed: false,
        text: message
    };
}

// LISTEN FOR NEWLY TYPES MESSAGES, 
formeElm.addEventListener("submit", newMessageSubmitted);

function newMessageSubmitted(event){
    console.log("typed a message!", event);
    event.preventDefault();

    // console.log(msgInput.value);
    let newMsg = msgInput.value.trim();
    // appendMessage(newMsg)

     const processed = applyRandomTransformation(newMsg);

    let messageData = { // <---------
        sender: nameInput.value, // <---------
        message: processed.text // <-adding the text after it has passed through the random transformation function
    }
    // SEND THEM TO THE SERVER
    socket.emit("messageFromClient", messageData); // <---------

    // clear textbox:
    msgInput.value = "";    // <---------
}

// LISTEN FOR NEW MESSAGES FROM SERVER
// APPEND THEM TO THE MESSAGE BOX
// AUTO SCROLL TO BOTTOM
socket.on("messageFromServer", function(msgData){
    console.log("got a message i think? ", msgData);
    appendMessage(msgData)
})

// APPEND MESSAGES TO BOX
function appendMessage(data){  
    // console.log(data)
    // select list (ul) first
    let chatThreadList = document.querySelector("#threadWrapper ul");
    console.log(chatThreadList)

    // create new list item (li)
    let newListItem = document.createElement("li");

    //sender
    let who = document.createElement("span"); // <---------
    who.className = "who";  // <---------
    who.innerText = data.sender+":" || "anonymous:"; // <---------

    newListItem.append(who); // <---------

    //messsage
    let words = document.createElement("span"); // <---------
    words.className = "words"; // <---------
    words.innerText = data.message; // <---------

    newListItem.append(words); // <---------

    // append new li to the list 
    chatThreadList.append(newListItem);

    // scroll to bottom of textbox:
    chatThreadList.scrollTop = chatThreadList.scrollHeight;
}

// OPTIONAL: LISTEN FOR NEW NAME
// SEND IT TO SERVER