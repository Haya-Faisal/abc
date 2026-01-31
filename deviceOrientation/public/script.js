

// window.addEventListener("deviceorientation", handleOrientation, true); // can be deleted later

function handleOrientation(eventData){
    console.log(eventData.alpha);
    // when button is pressed, its 0. u can access the compass sensor

    document.querySelector('#alpha').innerText = "alpha: " + Math.round(eventData.alpha);
    document.querySelector('#beta').innerText = "beta: " + Math.round(eventData.beta);
    document.querySelector('#gamma').innerText = "gamma: " + Math.round(eventData.gamma);

    document.querySelector('h1').style.display = "none";
    document.querySelector('#requestOrientationButton').style.display = "none";

    document.querySelector('#square').style.transform = "rotate("+eventData.alpha+"deg)";
}







