import { pairOrientation, removeOrientation, pairMotion, removeMotion, pairGPS, removeGPS } from "./pairing.js";
import { debugChartInit, debugChartSetData, debugChartPushData, startDebugCamera } from "./debug.js";
import { vectorRotation3d, rotateEulerAngles } from "./math.js";
import { AdaptiveKalman, ExponentialSmooth } from "./filter.js";
const pairButton = document.getElementById("pairButton");

const gpsSpeedEl = document.getElementById("gpsSpeed");
const calcSpeedEl = document.getElementById("calcSpeed");
const calcGPSdifEl = document.getElementById("calcGPSdif");
const gpsHeadingEl = document.getElementById("gpsHeading");

const inclineEl = document.getElementById("incline");
const rollEl = document.getElementById("roll");


// const gyroAlphaEl = document.getElementById("gyroAlpha");
// const headingAlphaDifEl = document.getElementById("headingAlphaDif");

// const debugChartGyroDif = debugChartInit("debugGraphGyroDif", ["Beta","Gamma"], "° from ref");
const debugChartInclineRoll = debugChartInit("debugGraphInclineRoll", ["incline", "roll"], "°");
const debugChartNormAcc = debugChartInit("debugGraphNormAcceleration", ["X","Y","Z"], "normAcc m/s");
const debugSpeedChart = debugChartInit("debugGraphSpeed", ["GPS","CALC"], "Speed *MPH");
const debugAccChart = debugChartInit("debugGraphAcceleration", ["X","Y","Z"], "acc m/s");
// const debugRotRateChart = debugChartInit("debugGraphRotationRate",["Alpha","Beta","Gamma"], "°/s");
const debugHeadingChart = debugChartInit("debugGraphHeading", ["Compass","Heading"], "°");

const GPSoffset = 500;
let calcData = [{ x: 0, y: 0}];

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

const accReadout = {x: 0, y: 0, z: 0};
const refGyroDeg = {alpha: 20, beta: 70, gamma: 0}; // normalized rotation such that z points in travel direction. alpha, beta, gamma -> hardcoded for now

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


const kalQ = (10 * 1 / 60) ** 2;
// const expX = new ExponentialSmooth({ alpha: 1 });
// const expY = new ExponentialSmooth({ alpha: 1 });
// const expZ = new ExponentialSmooth({ alpha: 1 });
const kalmanX = new AdaptiveKalman({ Q: kalQ});
const kalmanY = new AdaptiveKalman({ Q: kalQ });
const kalmanZ = new AdaptiveKalman({ Q: kalQ });


function accelHandler(event) {
    const acc = event.acceleration;
    // const acc = event.accelerationIncludingGravity;
    const rot = event.rotationRate;
    // document.getElementById("ACCtemp").innerHTML = (
    //     `X: ${acc.x}<br>` +
    //     `Y: ${acc.y}<br>` +
    //     `Z: ${acc.z}<br>` +
    //     `Interval: ${event.interval}<br>` +
    //     `rot a: ${rot.alpha}`
    // );
    if (!acc || !rot) { return; }

    const filterAcc = {
        // x: kalmanX.update( expX.update(acc.x) ),
        // y: kalmanY.update( expY.update(acc.y) ),
        // z: kalmanZ.update( expZ.update(acc.z) )
        x: kalmanX.update( acc.x ),
        y: kalmanY.update( acc.y ),
        z: kalmanZ.update( acc.z )
    };

    
    const prevCalcSpeed = calcData[calcData.length - 1].y || 0; // y on graph axis, not acc.y
    const timestamp = Date.now();

    
    debugChartPushData(debugAccChart, 0, timestamp, acc.x);
    debugChartPushData(debugAccChart, 1, timestamp, acc.y);
    debugChartPushData(debugAccChart, 2, timestamp, acc.z);
    // debugChartPushData(debugAccChart, 3, timestamp, Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2));
    
    // debugChartPushData(debugRotRateChart, 0, timestamp, rot.alpha);
    // debugChartPushData(debugRotRateChart, 1, timestamp, rot.beta);
    // debugChartPushData(debugRotRateChart, 2, timestamp, rot.gamma);
    
    
    accReadout.x = filterAcc.x;
    accReadout.y = filterAcc.y;
    accReadout.z = filterAcc.z;
    // Object.assign(accReadout, acc); // idk
    const normAcc = vectorRotation3d([accReadout.x, accReadout.y, accReadout.z], [refGyroDeg.alpha, -refGyroDeg.beta, refGyroDeg.gamma], true);
      // -beta b/c ccw around each axis - apple trying to be dif or something idk
    normAcc.x *= -1; normAcc.y *= -1; normAcc.z *= -1;

    debugChartPushData(debugChartNormAcc, 0, timestamp, normAcc.x);
    debugChartPushData(debugChartNormAcc, 1, timestamp, normAcc.y);
    debugChartPushData(debugChartNormAcc, 2, timestamp, normAcc.z);
    
    const newSpeed = prevCalcSpeed + (normAcc.y * 2.236936 * event.interval);
    calcData.push({ x: timestamp, y: newSpeed});
    if (calcData.length > 500) calcData.shift();
    debugChartSetData(debugSpeedChart, 1, calcData);
    calcSpeedEl.textContent = newSpeed.toFixed(2);
}


function gyroHandler(event) {
    // const { alpha: normAlpha, beta: normBeta, gamma: normGamma } = normalizeOrientation(event.alpha, event.beta, event.gamma);

    document.getElementById("GYROtemp").innerHTML = (
        `Absolute: ${event.absolute}<br>` +
        `Alpha: ${event.alpha}<br>` + 
        `Beta: ${event.beta}<br>` +
        `Gamma: ${event.gamma}<br>` +
        `webkitComp: ${event.webkitCompassHeading}<br>` +
        `webkitAcc: ${event.webkitCompassAccuracy}`
    );

    // gyroAlphaEl.textContent = event.alpha.toFixed(2);

    const timestamp = Date.now();
    debugChartPushData(debugHeadingChart, 0, timestamp, event.webkitCompassHeading);
    // debugChartPushData(debugGyroHeadingChart, 0, timestamp, normAlpha);
    // debugChartPushData(debugGyroHeadingChart, 1, timestamp, normBeta);
    // debugChartPushData(debugGyroHeadingChart, 2, timestamp, normGamma);
    const gyroReadout = {alpha: refGyroDeg.alpha, beta: event.beta, gamma: event.gamma};

    const gimbalLockThreshold = 5;
    if (Math.abs(event.beta) > 90 - gimbalLockThreshold && Math.abs(event.beta) < 90 + gimbalLockThreshold) {
      gyroReadout.gamma = 0;
      // could optionally add synced axes together under gimbal lock but functionally useless 
    }

    const gyroAdjusted = rotateEulerAngles([gyroReadout.alpha, gyroReadout.beta, gyroReadout.gamma], [refGyroDeg.alpha, refGyroDeg.beta, refGyroDeg.gamma], true);
    debugChartPushData(debugChartInclineRoll, 0, timestamp, gyroAdjusted.beta);
    debugChartPushData(debugChartInclineRoll, 1, timestamp, gyroAdjusted.gamma);
    // debugChartPushData(debugChartInclineRoll, 2, timestamp, gyroAdjusted.alpha); // .alpha here is meaningless and should be ignored
    
    document.getElementById("headingAlphaDif").textContent = "e";
  }



function gpsHandler({ coords, timestamp }) {
    const iso = new Date(timestamp).toISOString();
    const { latitude, longitude, altitude, accuracy, altitudeAccuracy, heading, speed } = coords;

    // document.getElementById("GPStemp").innerHTML = (
    //     `${iso}<br>` + 
    //     `Lat: ${latitude}<br>`+ 
    //     `Lon: ${longitude}<br>` +
    //     `Alt: ${altitude ?? "n/a"} m<br>` +
    //     `Acc: ${accuracy} m-95%ci<br>` +
    //     `Alt-acc: ${altitudeAccuracy} m-95%ci<br>` +
    //     `Speed: ${speed} m/s<br>` +
    //     `Heading: ${heading}°`
    // );

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
        // const alpha = parseFloat(gyroAlphaEl.textContent) || 0;
        // headingAlphaDifEl.textContent = angleDist(heading, alpha).toFixed(2);
        debugChartPushData(debugHeadingChart, 1, Date.now()-GPSoffset, heading);
    }
}

function onGPSError(error) {
    alert(`GPS error: ${error.message}`);
}
