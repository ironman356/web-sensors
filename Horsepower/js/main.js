import { pairOrientation, removeOrientation, pairMotion, removeMotion, pairGPS, removeGPS } from "./pairing.js";
import { debugChartInit, debugChartSetData, debugChartPushData, startDebugCamera } from "./debug.js";

const pairButton = document.getElementById("pairButton");

const gpsSpeedEl = document.getElementById("gpsSpeed");
const calcSpeedEl = document.getElementById("calcSpeed");
const calcGPSdifEl = document.getElementById("calcGPSdif");
const gpsHeadingEl = document.getElementById("gpsHeading");


// const gyroAlphaEl = document.getElementById("gyroAlpha");
// const headingAlphaDifEl = document.getElementById("headingAlphaDif");

const debugChartGyroDif = debugChartInit("debugGraphGyroDif", ["Beta","Gamma"], "° from ref");
const debugChartNormAcc = debugChartInit("debugGraphNormAcceleration", ["X","Y","Z"], "normAcc m/s");
const debugSpeedChart = debugChartInit("debugGraphSpeed", ["GPS","CALC"], "Speed *MPH");
const debugAccChart = debugChartInit("debugGraphAcceleration", ["X","Y","Z"], "acc m/s");
// const debugRotRateChart = debugChartInit("debugGraphRotationRate",["Alpha","Beta","Gamma"], "°/s");
const debugHeadingChart = debugChartInit("debugGraphHeading", ["Compass","Heading"], "°");

const GPSoffset = 500;
let calcData = [{ x: 0, y: 0}];

startDebugCamera("debugCamera");

/**
 * Current normalized acceleration:
 *  X: turning ie left/right
 *  Y: acceleration ie forwards/backwards
 *  Z: vertical ie up/down
 *  normalized should equal raw values with phone laying flat w/screen up; alpha/pointed towards front/direction of travel
 */


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

const gyroReadout = {alpha: 0, beta: 0, gamma: 0};
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

function normalizeAcceleration(acc, gyro) {

    const [_, betaDeg, gammaDeg] = gyro;

    // rads
    // const alpha = alphaDeg * Math.PI / 180;
    const alpha = -refGyroDeg.alpha * Math.PI / 180;
    const beta = betaDeg * Math.PI / 180;
    let gamma = gammaDeg * Math.PI / 180;

    // accounting for gimbal lock,
    if (betaDeg > 85 && betaDeg < 95) {
        gamma = 0;
        // no need to adjust alpha as it won't actually be based on gyro for this implemtation and therefore will be consistent
    }

    // Rotation matrices
    const Rz = [
        [Math.cos(alpha), -Math.sin(alpha), 0],
        [Math.sin(alpha),  Math.cos(alpha), 0],
        [0, 0, 1]
    ];

    const Rx = [
        [1, 0, 0],
        [0, Math.cos(beta), -Math.sin(beta)],
        [0, Math.sin(beta),  Math.cos(beta)]
    ];

    const Ry = [
        [Math.cos(gamma), 0, Math.sin(gamma)],
        [0, 1, 0],
        [-Math.sin(gamma), 0, Math.cos(gamma)]
    ];

    //  rotation matrix R = Rz * Rx * Ry
    const multiply = (A, B) =>
        A.map((row, i) =>
            B[0].map((_, j) =>
                row.reduce((sum, _, k) => sum + A[i][k] * B[k][j], 0)
            )
        );
    const R = multiply(multiply(Rz, Rx), Ry);

    const rotated = {
        x: R[0][0] * acc[0] + R[0][1] * acc[1] + R[0][2] * acc[2],
        y: R[1][0] * acc[0] + R[1][1] * acc[1] + R[1][2] * acc[2],
        z: R[2][0] * acc[0] + R[2][1] * acc[1] + R[2][2] * acc[2],
    };

    return rotated;
}


function accelHandler(event) {
    const acc = event.acceleration;
    const rot = event.rotationRate;
    // document.getElementById("ACCtemp").innerHTML = (
    //     `X: ${acc.x}<br>` +
    //     `Y: ${acc.y}<br>` +
    //     `Z: ${acc.z}<br>` +
    //     `Interval: ${event.interval}<br>` +
    //     `rot a: ${rot.alpha}`
    // );
    if (!acc || !rot) { return; }

    
    const prevCalcSpeed = calcData[calcData.length - 1].y || 0; // y on graph axis, not acc.y
    const timestamp = Date.now();

    
    debugChartPushData(debugAccChart, 0, timestamp, acc.x);
    debugChartPushData(debugAccChart, 1, timestamp, acc.y);
    debugChartPushData(debugAccChart, 2, timestamp, acc.z);
    // debugChartPushData(debugAccChart, 3, timestamp, Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2));
    
    // debugChartPushData(debugRotRateChart, 0, timestamp, rot.alpha);
    // debugChartPushData(debugRotRateChart, 1, timestamp, rot.beta);
    // debugChartPushData(debugRotRateChart, 2, timestamp, rot.gamma);
    
    
    accReadout.x = acc.x;
    accReadout.y = acc.y;
    accReadout.z = acc.z;
    // Object.assign(accReadout, acc); // idk
    // const normAcc = normalizeAcceleration([accReadout.x, accReadout.y, accReadout.z], [gyroReadout.alpha, gyroReadout.beta, gyroReadout.gamma]);
    const normAcc = normalizeAcceleration([accReadout.x, accReadout.y, accReadout.z], [refGyroDeg.alpha, refGyroDeg.beta, refGyroDeg.gamma]);
    debugChartPushData(debugChartNormAcc, 0, timestamp, normAcc.x);
    debugChartPushData(debugChartNormAcc, 1, timestamp, normAcc.y);
    debugChartPushData(debugChartNormAcc, 2, timestamp, normAcc.z);
    
    const newSpeed = prevCalcSpeed + (normAcc.y * 2.236936 * event.interval);
    calcData.push({ x: timestamp, y: newSpeed});
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
    gyroReadout.alpha = event.alpha;
    gyroReadout.beta = event.beta;
    gyroReadout.gamma = event.gamma;
    debugChartPushData(debugChartGyroDif, 0, timestamp, refGyroDeg.beta-event.beta);
    if (event.beta > 95 || event.beta < 85) { // prevent gimbal lock from runining debug graph
        debugChartPushData(debugChartGyroDif, 1, timestamp, event.gamma);
    }
    
    
}
// function normalizeOrientation(alpha, beta, gamma) {
//     // normalize angles because raw device orientation is no bueno
//     let flip = false;

//     if (beta > 90) {
//         beta = 180 - beta;
//         gamma = -gamma;
//         flip = true;
//     } else if (beta < -90) {
//         beta = -180 - beta;
//         gamma = -gamma;
//         flip = true;
//     }

//     if (flip) {
//         alpha = (alpha + 180) % 360;
//     }

//     return { alpha, beta, gamma };
// }




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

function angleDist(a, b) {
  let diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}


