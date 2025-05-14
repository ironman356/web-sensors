

const pairButton = document.getElementById("pairButton");

const gpsSpeed = document.getElementById("gpsSpeed");
const clacSpeed = document.getElementById("clacSpeed");
const calcGPSdif = document.getElementById("calcGPSdif");




let geoWatchId = null;

pairButton.addEventListener("click", () => {
    
    // pair / enable everything
    if (pairButton.textContent == "Pair") {

        if (geoWatchId == null) { toggleGPS(); }
        enableAccelerometer();


        pairButton.textContent = "Un-Pair";
    }

    // un-pair / disable everything
    else {

        if (geoWatchId !== null) { toggleGPS(); }
        disableAccelerometer();


        pairButton.textContent = "Pair";
    }



});

function enableAccelerometer() {
    if (typeof DeviceMotionEvent.requestPermission === "function") {
        DeviceMotionEvent.requestPermission().then(permissionState => {
            if (permissionState === "granted") {
                if ("DeviceMotionEvent" in window) {
                    window.addEventListener("devicemotion", accelHandler);
                } else {
                    alert("Accelerometer not supported");
                }
            }
            else {
                alert("Accel Permission denied");
            }
        })
    } else { // ios / android differences
        if ("DeviceMotionEvent" in window) {
            window.addEventListener("devicemotion", accelHandler);
        } else {
            alert("Accelerometer not supported");
        }
    }
}

function disableAccelerometer() {
    if ("DeviceMotionEvent" in window) {
        window.removeEventListener("devicemotion", accelHandler);
    } else {
        alert("Can't remove accel listner - not supported");
    }
}

function accelHandler(event) {
    const acc = event.acceleration;
    document.getElementById("ACCtemp").innerHTML = (
        `${acc.x}`
    );
}

function toggleGPS() {
    if (geoWatchId !== null) {
        navigator.geolocation.clearWatch(geoWatchId);
        geoWatchId = null;
        return;
    }
    if ("geolocation" in navigator) {
        geoWatchId = navigator.geolocation.watchPosition(
            gpsHandler,
            onGPSError,
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 5000
            }
        );
    } else {
        alert("geolocation not supported");
        return;
    }
    return;
}

function gpsHandler({ coords, timestamp }) {
    const iso = new Date(timestamp).toISOString();
    const { latitude, longitude, accuracy, altitude, altitudeAccuracy, speed, heading} = coords;

    if (speed !== null) {
        const gpsSpeedMph = speed * 2.236936;
        const calcSpeedValue = parseFloat(clacSpeed.textContent) || 0;
        const speedDifference = Math.abs(calcSpeedValue - gpsSpeedMph);
        
        clacSpeed.textContent =  gpsSpeedMph.toFixed(2);
        gpsSpeed.textContent = gpsSpeedMph.toFixed(2);
        calcGPSdif.textContent = speedDifference.toFixed(2);
    }

    document.getElementById("GPStemp").innerHTML = (
        `${iso}<br>` + 
        `Lat: ${latitude}<br>`+ 
        `Lon: ${longitude}<br>` +
        `Alt: ${altitude ?? "n/a"} m<br>` +
        `Acc: ${accuracy} m-95%ci<br>` +
        `Alt-acc: ${altitudeAccuracy} m-95%ci<br>` +
        `Speed: ${speed ?? "n/a"} m/s<br>` +
        `Heading: ${heading ?? "n/a"}°`
    );
}

function onGPSError(error) {
    alert(`GPS error: ${error.message}`);
}
