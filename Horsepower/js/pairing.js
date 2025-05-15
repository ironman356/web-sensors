


/**
 * Adds revent handler to eventListener accounting for ios/android difs
 * Alerts() on issues
 * 
 * @param {function} handler - adds handler to eventListerner for orientation
 */
export function pairOrientation(handler) {
    // ios requires permission request sent -> android automatically does it when listner is tried
    // ^as far as i'm aware
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission().then(permissionState => {
            if (permissionState === "granted") {
                if ("DeviceOrientationEvent" in window) {
                    window.addEventListener("deviceorientation", handler);
                } else {
                    alert("Orientation not supported");
                }
            }
            else {
                alert("Orientation Permission denied");
            }
        })
    } else {
        if ("DeviceOrientationEvent" in window) {
            window.addEventListener("deviceorientation", handler);
        } else {
            alert("Orientation not supported");
        }
    }
}
/**
 * 
 * @param {function} handler -  handler to be unset from orientation event 
 */
export function removeOrientation(handler) {
    if ("DeviceOrientationEvent" in window) {
        window.removeEventListener("deviceorientation", handler);
    } else {
        alert("Can't remove orientation listner - not supported");
    }
}


export function pairMotion(handler) {
    if (typeof DeviceMotionEvent.requestPermission === "function") {
        DeviceMotionEvent.requestPermission().then(permissionState => {
            if (permissionState === "granted") {
                if ("DeviceMotionEvent" in window) {
                    window.addEventListener("devicemotion", handler);
                } else {
                    alert("Motion not supported");
                }
            }
            else {
                alert("Motion Permission denied");
            }
        })
    } else { // ios / android differences
        if ("DeviceMotionEvent" in window) {
            window.addEventListener("devicemotion", handler);
        } else {
            alert("Motion not supported");
        }
    }
}

export function removeMotion(handler) {
    if ("DeviceMotionEvent" in window) {
        window.removeEventListener("devicemotion", handler);
    } else {
        alert("Can't remove accel listner - not supported");
    }
}


export function pairGPS(eventHandler, errorHandler) {
    if ("geolocation" in navigator) {
        return navigator.geolocation.watchPosition(
            eventHandler,
            errorHandler,
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 5000
            }
        );
    } else {
        alert("geolocation not supported");
    }
    return null;
}

export function removeGPS(watchID) {
    if (typeof watchID !== 'number') {
        alert("GPS disable when not set");
        return null;
    }
    navigator.geolocation.clearWatch(watchID);
    return null;
}