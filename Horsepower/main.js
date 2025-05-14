

const pairButton = document.getElementById("pairButton");

const gpsSpeedEl = document.getElementById("gpsSpeed");
const calcSpeedEl = document.getElementById("calcSpeed");
const calcGPSdifEl = document.getElementById("calcGPSdif");
const gpsHeadingEl = document.getElementById("gpsHeading");
const gyroAlphaEl = document.getElementById("gyroAlpha");
const headingAlphaDifEl = document.getElementById("headingAlphaDif");


let geoWatchId = null;

pairButton.addEventListener("click", () => {
    
    // pair / enable everything
    if (pairButton.textContent == "Pair") {

        enableGPS();
        enableAccelerometer();
        enableGyroscope();


        pairButton.textContent = "Un-Pair";
    }

    // un-pair / disable everything
    else {

        disableGPS();
        disableAccelerometer();
        disableGyroscope();


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
    const rot = event.rotationRate;
    document.getElementById("ACCtemp").innerHTML = (
        `X: ${acc.x}<br>` +
        `Y: ${acc.y}<br>` +
        `Z: ${acc.z}<br>` +
        `Interval: ${event.interval}ms<br>` +
        `rot a: ${rot.alpha}`
    );

    const calcSpeed = parseFloat(calcSpeedEl.textContent) || 0;
    calcSpeedEl.textContent = calcSpeed + (acc.z * 2.236936 * event.interval);
}

function enableGyroscope() {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission().then(permissionState => {
            if (permissionState === "granted") {
                if ("DeviceOrientationEvent" in window) {
                    window.addEventListener("deviceorientation", gyroHandler);
                } else {
                    alert("Gyroscope not supported");
                }
            }
            else {
                alert("Gyroscope Permission denied");
            }
        })
    } else { // ios / android differences
        if ("DeviceOrientationEvent" in window) {
            window.addEventListener("deviceorientation", gyroHandler);
        } else {
            alert("Gyroscope not supported");
        }
    }
}
function disableGyroscope() {
    if ("DeviceOrientationEvent" in window) {
        window.removeEventListener("deviceorientation", gyroHandler);
    } else {
        alert("Can't remove gyro listner - not supported");
    }
}
function gyroHandler(event) {
    document.getElementById("GYROtemp").innerHTML = (
        `Absolute: ${event.absolute}<br>` +
        `Alpha: ${event.alpha}<br>` + 
        `Beta: ${event.beta}<br>` +
        `Gamma: ${event.gamma}`
    );
    gyroAlphaEl.textContent = event.alpha.toFixed(2);
}




function enableGPS() {
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
    }
    return;
}

function disableGPS() {
    if (geoWatchId !== null) {
        navigator.geolocation.clearWatch(geoWatchId);
        geoWatchId = null;
        return;
    }
    else {
        alert("gps disable when not set");
        return;
    }
}

function gpsHandler({ coords, timestamp }) {
    const iso = new Date(timestamp).toISOString();
    const { latitude, longitude, altitude, accuracy, altitudeAccuracy, heading, speed } = coords;

    document.getElementById("GPStemp").innerHTML = (
        `${iso}<br>` + 
        `Lat: ${latitude}<br>`+ 
        `Lon: ${longitude}<br>` +
        `Alt: ${altitude ?? "n/a"} m<br>` +
        `Acc: ${accuracy} m-95%ci<br>` +
        `Alt-acc: ${altitudeAccuracy} m-95%ci<br>` +
        `Speed: ${speed} m/s<br>` +
        `Heading: ${heading}°`
    );

    gpsSpeedEl.textContent = speed;
    if (speed !== null) {
        const gpsMPH = speed * 2.236936;
        gpsSpeedEl.textContent = gpsMPH.toFixed(2);

        const calcSpeed = parseFloat(calcSpeedEl.textContent) || 0;
        const speedDif = Math.abs(calcSpeed - gpsMPH);

        calcSpeedEl.textContent = gpsMPH.toFixed(2);
        calcGPSdifEl.textContent = speedDif.toFixed(2);
    }

    gpsHeadingEl.textContent = heading;
    if (heading !== null) {
        const alpha = parseFloat(gyroAlphaEl.textContent) || 0;
        headingAlphaDifEl.textContent = angleDist(heading, alpha).toFixed(2);
    }
}

function onGPSError(error) {
    alert(`GPS error: ${error.message}`);
}

function angleDist(a, b) {
  let diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}


