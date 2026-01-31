// from: https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2
// takes permission and then the code runs. 
function requestOrientation() {
    // feature detect
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
            if (permissionState === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation, true);
            // handleorientation is a function reference
            }
        })
        .catch(console.error);
    } else {
        // handle regular non iOS 13+ devices
          window.addEventListener('deviceorientation', handleOrientation, true);
    }
}
