import { pairOrientation, removeOrientation, pairMotion, removeMotion, pairGPS, removeGPS } from "./pairing.js";
import { debugChartInit, debugChartSetData, debugChartPushData, startDebugCamera } from "./debug.js";

const pairButton = document.getElementById("pairButton");

const gpsSpeedEl = document.getElementById("gpsSpeed");
const calcSpeedEl = document.getElementById("calcSpeed");
const calcGPSdifEl = document.getElementById("calcGPSdif");
const gpsHeadingEl = document.getElementById("gpsHeading");
const gyroAlphaEl = document.getElementById("gyroAlpha");
const headingAlphaDifEl = document.getElementById("headingAlphaDif");


const debugSpeedChart = debugChartInit("debugGraphSpeed", ["GPS","CALC"], "Speed *MPH");
const debugAccChart = debugChartInit("debugGraphAcceleration", ["X","Y","Z","Total"], "acc m/s");
const debugRotRateChart = debugChartInit("debugGraphRotationRate",["Alpha","Beta","Gamma"], "°/s");
const debugGyroHeadingChart = debugChartInit("debugGraphGyroHeading", ["Alpha","Beta","Gamma","Heading"], "°");

const GPSoffset = 500;
let calcData = [];

startDebugCamera("debugCamera");

function gpsSpeedUpdate(speed, timestamp) {
    // add point setting gps speed at timestamp - offset
    let low = 0, high = calcData.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (calcData[mid].x < timestamp-GPSoffset) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    calcData.splice(low, 0, { x: timestamp-GPSoffset, y: speed });

    if (low+1 < calcData.length) {
        const calcGPSdif = calcData[low+1].y - calcData[low].y;
        
        // update calcSpeeds based off gps data
        calcData.forEach(el => {
            if (el.x > timestamp-GPSoffset) {
                el.y = el.y - calcGPSdif;
            }
        });
    }
}



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
    if (!acc || !rot) { return; }

    const prevCalcSpeed = calcData[calcData.length - 1].y || 0; // y on graph axis, not acc.y
    const newSpeed = prevCalcSpeed + (acc.z * 2.236936 * event.interval);
    const timestamp = Date.now();
    calcData.push({ x: timestamp, y: newSpeed});
    debugChartSetData(debugSpeedChart, 1, calcData);

    debugChartPushData(debugAccChart, 0, timestamp, acc.x);
    debugChartPushData(debugAccChart, 1, timestamp, acc.y);
    debugChartPushData(debugAccChart, 2, timestamp, acc.z);
    debugChartPushData(debugAccChart, 3, timestamp, Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2));

    debugChartPushData(debugRotRateChart, 0, timestamp, rot.alpha);
    debugChartPushData(debugRotRateChart, 1, timestamp, rot.beta);
    debugChartPushData(debugRotRateChart, 2, timestamp, rot.gamma);
    
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

    const timestamp = Date.now();
    debugChartPushData(debugGyroHeadingChart, 0, timestamp, event.alpha);
    debugChartPushData(debugGyroHeadingChart, 1, timestamp, event.beta);
    debugChartPushData(debugGyroHeadingChart, 2, timestamp, event.gamma);

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
        debugChartPushData(debugSpeedChart, 0, Date.now() - GPSoffset, gpsMPH); // debug only


        gpsSpeedEl.textContent = gpsMPH.toFixed(2);
        // const calcSpeed = parseFloat(calcSpeedEl.textContent) || 0;
        // const speedDif = Math.abs(calcSpeed - gpsMPH);
        // calcSpeedEl.textContent = gpsMPH.toFixed(2);
        // calcGPSdifEl.textContent = speedDif.toFixed(2);
        gpsSpeedUpdate(gpsMPH, Date.now())
    }

    gpsHeadingEl.textContent = heading;
    if (heading !== null) {
        const alpha = parseFloat(gyroAlphaEl.textContent) || 0;
        headingAlphaDifEl.textContent = angleDist(heading, alpha).toFixed(2);
        debugChartPushData(debugGyroHeadingChart, 3, Date.now()-GPSoffset, heading);
    }
}

function onGPSError(error) {
    alert(`GPS error: ${error.message}`);
}

function angleDist(a, b) {
  let diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}


