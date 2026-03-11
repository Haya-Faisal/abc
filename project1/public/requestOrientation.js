// from: https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2
function requestOrientation() {
    // feature detect
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
            if (permissionState === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation, true);
            document.querySelector('#requestOrientationButton').style.display = "none";
            }
        })
        .catch(console.error);
    } else {
        // handle regular non iOS 13+ devices
        console.log('iOS device — requesting permission')
        window.addEventListener('deviceorientation', handleOrientation, true);
        document.querySelector('#requestOrientationButton').style.display = "none";
    }
}
// node server.js
// add local host with https in browser