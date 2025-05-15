import { pairOrientation, removeOrientation, pairMotion, removeMotion, pairGPS, removeGPS } from "./pairing.js";
import { debugChartInit, pushData, startDebugCamera } from "./debug.js";

const pairButton = document.getElementById("pairButton");

const gpsSpeedEl = document.getElementById("gpsSpeed");
const calcSpeedEl = document.getElementById("calcSpeed");
const calcGPSdifEl = document.getElementById("calcGPSdif");
const gpsHeadingEl = document.getElementById("gpsHeading");
const gyroAlphaEl = document.getElementById("gyroAlpha");
const headingAlphaDifEl = document.getElementById("headingAlphaDif");


const chart = debugChartInit();

startDebugCamera("debugCamera");




let geoWatchId = null;

pairButton.addEventListener("click", () => {

    // pair / enable everything
    if (pairButton.textContent == "Pair") {

        geoWatchId = pairGPS(gpsHandler, onGPSError);
        pairMotion(accelHandler);
        pairOrientation(gyroHandler);
        pairButton.textContent = "Un-Pair";
    }

    // un-pair / disable everything
    else {

        geoWatchId = removeGPS(geoWatchId);
        removeMotion(accelHandler);
        removeOrientation(gyroHandler);
        pairButton.textContent = "Pair";
    }
});


function accelHandler(event) {
    const acc = event.acceleration;
    const rot = event.rotationRate;
    document.getElementById("ACCtemp").innerHTML = (
        `X: ${acc.x}<br>` +
        `Y: ${acc.y}<br>` +
        `Z: ${acc.z}<br>` +
        `Interval: ${event.interval}<br>` +
        `rot a: ${rot.alpha}`
    );

    const calcSpeed = parseFloat(calcSpeedEl.textContent) || 0;
    const newSpeed = calcSpeed + (acc.z * 2.236936 * event.interval);
    pushData(chart, 1, Date.now(), newSpeed);
    calcSpeedEl.textContent = newSpeed.toFixed(2);
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
        pushData(chart, 0, Date.now(), gpsMPH);


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


