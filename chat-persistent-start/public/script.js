function getOrCreateUserId() {
  let userID = localStorage.getItem("user-id");
  // check if we have a userID already in local storage
  //it stores in the local storage j my userid
  // if yes, return it
  // if not, create one and return it
  if (userID == undefined) {
    userID = crypto.randomUUID();
    localStorage.setItem("user-id", userID);
  }
  console.log(userID);
  return userID;
}

let nameInput = document.querySelector("#nameInput");

const myUserId = getOrCreateUserId();
console.log("My userId:", myUserId);

function getOrCreateUserName() {
  let username = localStorage.getItem("user-name");
  // check if we have a userID already in local storage
  //it stores in the local storage j my username
  // if yes, return it
  // if not, create one and return it
  if (username == undefined) {
    username = "";
    localStorage.setItem("user-name", username);
  } else {
    nameInput.value = username;
  }
  return username;
}

//check if we have a username already
let myUsername = getOrCreateUserName();

// start socket
if (
  location.hostname.toLowerCase().startsWith("browsercircus") ||
  location.hostname.toLowerCase().startsWith("www")
) {
  socket = io({ path: "/YOURPATH-and-PORT/socket.io" }); // yields '/leon/port-4100/socket.io' or '/socket.io'
} else {
  socket = io();
}

let myInfo = {
  userId: myUserId,
  username: myUsername,
};
// "login" to server, sending out "identify"

//handle username change
nameInput.addEventListener("change", function () {
  console.log("changed name", nameInput.value);
  let name = nameInput.value;
  // locally
  //   let username = localStorage.getItem("nameInput.value");
  localStorage.setItem("user-name", name);
  //   socket.emit("name-change",name)
  //   return name;
  // tell server about it
});

let formeElm = document.querySelector("#chatForm");
console.log(formeElm);
let msgInput = document.querySelector("#newMessage");
console.log(msgInput);

// LISTEN FOR NEWLY TYPED MESSAGES,
// SEND THEM TO THE SERVER
formeElm.addEventListener("submit", newMessagesSubmitted);

function newMessagesSubmitted(event) {
  console.log(event);
  //stop form element from refreshing the page
  event.preventDefault();

  let newMsg = msgInput.value;
  console.log(newMsg);

  // appendMessage(newMsg); // just for fun,
  // actuaally we need to
  // send the new message to
  // the server first:
  socket.emit("message-from-client", {
    message: newMsg,
  });

  // clear out input:
  msgInput.value = "";
}

socket.on("message-from-server", function (data) {
  // waht do to with the messaeg from server
  console.log("got message", data);
  appendMessage(data);
});

socket.on("chat-history", function (data) {
  // deal with chat history
});

// APPEND MESSAGES TO BOX
function appendMessage(data) {
  // console.log(data)
  // select list (ul) first
  let chatThreadList = document.querySelector("#threadWrapper ul");
  // console.log(chatThreadList)

  // create new list item (li)
  let newListItem = document.createElement("li");
  // class name if message is out own message

  //sender
  let who = document.createElement("span");
  who.className = "who";
  // who.innerText =

  newListItem.append(who);

  //messsage
  let words = document.createElement("span");
  words.className = "words";
  words.innerText = data.text;

  newListItem.append(words);

  // append new li to the list
  chatThreadList.append(newListItem);

  // scroll to bottom of textbox:
  chatThreadList.scrollTop = chatThreadList.scrollHeight;
}
