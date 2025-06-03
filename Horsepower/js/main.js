import { pairOrientation, removeOrientation, pairMotion, removeMotion, pairGPS, removeGPS } from "./pairing.js";
import { debugChartInit, debugChartSetData, debugChartPushData, startDebugCamera } from "./debug.js";
import { vectorRotation3d, rotateEulerAngles } from "./math.js";
import { AdaptiveKalman, ExponentialSmooth } from "./filter.js";

const pairButton = document.getElementById("pairButton");
const settingsButton = document.getElementById("settingsMenuButton");
const saveButton = document.getElementById("saveRecordedButton");

// "final" items
const calcSpeedEl = document.getElementById("calcSpeed");
const calcHeadingEl = document.getElementById("calcHeading");
const horsepowerEl = document.getElementById("horsepower");
const tractionCircleEl = document.getElementById("tractionCircle");


startDebugCamera("debugCamera");

const rawGPSarr = [];
const rawACCarr = [];
const rawGYROarr = [];
let  accInterval = null;
const gyroMountAngle = { alpha: null, beta: null, gamma: null };

const debugSensors = debugChartInit("debugSensors", ["x", "y", "z", "a", "b", "g"], "m/s & rads");
const debugSpeed = debugChartInit("debugGraphSpeed", ["GPS","CALC"], "Speed *MPH");

const GPSoffset = 500; // make dynamic later? -> /account for variance


// - - pairing sensors - -
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

// - - settings menu - -
settingsButton.addEventListener("click", () => {
    return;
    // TODO
});

// - - save button - -
saveButton.addEventListener("click", () => {
    const jsonStr = JSON.stringify({
        Options: {
            Weight: 0,
            DragCoef: 1,
            RollResistance: 2,
            FronalArea: 3,
            StartTime: 4,
            Weather: {

            },
            MountingAngle: {

            },
            ForwardVec: {

            },
            accInterval: accInterval,
        },
        GeolocationArr: rawGPSarr,
        DeviceMotionArr: rawACCarr,
        DeviceOrientationArr: rawGYROarr,
    }, null, 2); // 2 pretty, 0 compact

    const curTime = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `temp-${curTime}.json`;

    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob); 
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url); // clean up
});



const kalQ = (10 * 1 / 60) ** 2; // expected max accel ~10 m/s^2 over 1 update
// max typical acc, break, lat = 12, 30, 8
// max acc street: <100, drag strip <250 

// const expX = new ExponentialSmooth({ alpha: 1 });
// const expY = new ExponentialSmooth({ alpha: 1 });
// const expZ = new ExponentialSmooth({ alpha: 1 });
const kalmanX = new AdaptiveKalman({ Q: kalQ});
const kalmanY = new AdaptiveKalman({ Q: kalQ });
const kalmanZ = new AdaptiveKalman({ Q: kalQ });


const invertAcc = true;

function accelHandler(event) {
    const acc = {
        timestamp: event.timeStamp,         // millis since loaded (not started)
        acceleration: event.acceleration,   // m/s^2 along axis xyz
        // accelerationIncludingGravity: event.accelerationIncludingGravity,
        rotationRate: {     // rotation degrees/sec right-hand-rule, adjusted to axis to prevent confusion with gyro readout
            x: event.rotationRate.alpha,
            y: event.rotationRate.beta,
            z: event.rotationRate.gamma,
        } 
    };

    if (accInterval === null) { // saving seperate from arr to reduce save size
        // typical ~60hz -> this works for 1-999hz      ios:seconds,android:millis between updates
        if (event.interval < 1) {
            accInterval = event.interval * 1000; //ios
        } else {
            accInterval = event.interval; //not ios
        }
    };
        
    // to match internal mental model: acc screen up = +z so on
    // might be os / device dependent idk
    if (invertAcc) {
        acc.acceleration.x = -acc.acceleration.x;
        acc.acceleration.y = -acc.acceleration.y;
        acc.acceleration.z = -acc.acceleration.z;
    }
    rawACCarr.push(acc);
    document.getElementById("ACCtemp").innerText = JSON.stringify(rawACCarr[rawACCarr.length - 1], null, 2);


    // const filterAcc = {
    //     // x: kalmanX.update( expX.update(acc.x) ),
    //     // y: kalmanY.update( expY.update(acc.y) ),
    //     // z: kalmanZ.update( expZ.update(acc.z) )
    //     x: kalmanX.update( acc.x ),
    //     y: kalmanY.update( acc.y ),
    //     z: kalmanZ.update( acc.z )
    // };
    
    // const timestamp = Date.now();

    // accReadout.x = filterAcc.x;
    // accReadout.y = filterAcc.y;
    // accReadout.z = filterAcc.z;
    debugChartPushData(debugSensors, 0, acc.timestamp, acc.acceleration.x);
    debugChartPushData(debugSensors, 1, acc.timestamp, acc.acceleration.y);
    debugChartPushData(debugSensors, 2, acc.timestamp, acc.acceleration.z);
    debugChartPushData(debugSensors, 3, acc.timestamp, acc.rotationRate.z);
    debugChartPushData(debugSensors, 4, acc.timestamp, acc.rotationRate.x);
    debugChartPushData(debugSensors, 5, acc.timestamp, acc.rotationRate.y);

    // const newSpeed = prevCalcSpeed + (normAcc.y * 2.236936 * event.interval);
    // calcData.push({ x: timestamp, y: newSpeed});
    // if (calcData.length > 500) calcData.shift();
    // debugChartSetData(debugSpeedChart, 1, calcData);
    // calcSpeedEl.textContent = newSpeed.toFixed(2);
}


function gyroHandler(event) {
    let gyro = {};
    if ('webkitCompassHeading' in event) { // ios
        gyro = {
            timestamp: event.timeStamp,
            alpha: event.alpha,
            beta: event.beta,
            gamma: event.gamma,
            compassHeading: event.webkitCompassHeading,
            compassAccuracy: event.webkitCompassAccuracy,
        };
    } else { //android
        gyro = {
            timestamp: event.timeStamp,
            alpha: event.alpha,
            beta: event.beta,
            gamma: event.gamma,
        };
    }
    rawGYROarr.push(gyro);
    document.getElementById("GYROtemp").innerText = JSON.stringify(gyro, null, 2);

        // const { alpha: normAlpha, beta: normBeta, gamma: normGamma } = normalizeOrientation(event.alpha, event.beta, event.gamma);

    // document.getElementById("GYROtemp").innerHTML = (
    //     `Absolute: ${event.absolute}<br>` +
    //     `Alpha: ${event.alpha}<br>` + 
    //     `Beta: ${event.beta}<br>` +
    //     `Gamma: ${event.gamma}<br>` +
    //     `webkitComp: ${event.webkitCompassHeading}<br>` +
    //     `webkitAcc: ${event.webkitCompassAccuracy}`
    // );
    // const props = {};
    // for (let key in event) {
    // try {
    //     props[key] = event[key];
    // } catch (e) {
    //     props[key] = "[unreadable]";
    // }
    // }
    // document.getElementById("GYROtemp").innerText = JSON.stringify({event});

    // gyroAlphaEl.textContent = event.alpha.toFixed(2);

    // const timestamp = Date.now();
    // // debugChartPushData(debugHeadingChart, 0, timestamp, event.webkitCompassHeading);
    // // debugChartPushData(debugGyroHeadingChart, 0, timestamp, normAlpha);
    // // debugChartPushData(debugGyroHeadingChart, 1, timestamp, normBeta);
    // // debugChartPushData(debugGyroHeadingChart, 2, timestamp, normGamma);
    // // const gyroReadout = {alpha: 0, beta: event.beta, gamma: event.gamma};

    // // const gimbalLockThreshold = 5;
    // // if (Math.abs(event.beta) > 90 - gimbalLockThreshold && Math.abs(event.beta) < 90 + gimbalLockThreshold) {
    // //   gyroReadout.gamma = 0;
    //   // could optionally add synced axes together under gimbal lock but functionally useless 
    // // }
    // debugChartPushData(debugSensors, 3, timestamp, degToRad(event.alpha));
    // debugChartPushData(debugSensors, 4, timestamp, degToRad(event.beta));
    // debugChartPushData(debugSensors, 5, timestamp, degToRad(event.gamma));

    // const gyro = {alpha: event.alpha, beta: event.beta, gamma: event.gamma, timestamp: event.timestamp}
    // gyroUpdates.push(gyro);
    // if (gyroUpdates.length > 600) {
    //     gyroUpdates.shift();
    // }

    // const gyroAdjusted = rotateEulerAngles([gyroReadout.alpha, gyroReadout.beta, gyroReadout.gamma], [refGyroDeg.alpha, refGyroDeg.beta, refGyroDeg.gamma], true);
    // debugChartPushData(debugChartInclineRoll, 0, timestamp, gyroAdjusted.beta);
    // debugChartPushData(debugChartInclineRoll, 1, timestamp, gyroAdjusted.gamma);
    // debugChartPushData(debugChartInclineRoll, 2, timestamp, gyroAdjusted.alpha); // .alpha here is meaningless and should be ignored
    
    // document.getElementById("headingAlphaDif").textContent = "e";
  }
function degToRad(deg) {
    return deg * Math.PI / 180;
}
function radToDeg(rad) {
    return rad * 180 / Math.PI;
}


function toXY(lat, lon, lat0, lon0) {
    const R = 6371000; // earth radius in meters
    const dLat = (lat - lat0) * Math.PI / 180;
    const dLon = (lon - lon0) * Math.PI / 180;
    const x = R * dLon * Math.cos(lat0 * Math.PI / 180);
    const y = R * dLat;
    return [x, y];
}

function pointToLineDist(p1, p2, p3) {
    // p1 = start, p3 = end, p2 = point to check
    const lat0 = p1.latitude;
    const lon0 = p1.longitude;

    const A = toXY(p1.latitude, p1.longitude, lat0, lon0);
    const B = toXY(p2.latitude, p2.longitude, lat0, lon0);
    const C = toXY(p3.latitude, p3.longitude, lat0, lon0);

    const AC = [C[0] - A[0], C[1] - A[1]];
    const AB = [B[0] - A[0], B[1] - A[1]];

    const cross = Math.abs(AC[0] * AB[1] - AC[1] * AB[0]);
    const len = Math.hypot(AC[0], AC[1]);

    return cross / len; // distance in meters
} 

function gpsHandler(position) {
    rawGPSarr.push(position);
    document.getElementById("GPStemp").innerText = JSON.stringify(position, null, 2);
    
    return;
    document.getElementById("betaGamma").innerHTML = "bg";
    document.getElementById("status").innerHTML = "ste";

    const { latitude, longitude, altitude, accuracy, altitudeAccuracy, heading, speed } = position.coords;
    document.getElementById("GPStemp").textContent = "test";
    document.getElementById("GPStemp").innerHTML = (
            `${new Date(position.timestamp).toISOString()}<br>` + 
            `Lat: ${latitude}<br>`+ 
            `Lon: ${longitude}<br>` +
            `Alt: ${altitude ?? "n/a"} m<br>` +
            `Acc: ${accuracy} m-95%ci<br>` +
            `Alt-acc: ${altitudeAccuracy} m-95%ci<br>` +
            `Speed: ${speed} m/s<br>` +
            `Heading: ${heading}°`
        );
        
        // gpsSpeedEl.textContent = speed;
        // if (speed !== null) {
        //     const gpsMPH = speed * 2.236936;
        //     // debugChartPushData(debugSpeedChart, 0, Date.now() - GPSoffset, gpsMPH); // debug only
            
            
        //     // gpsSpeedEl.textContent = gpsMPH.toFixed(2);
        //     // const calcSpeed = parseFloat(calcSpeedEl.textContent) || 0;
        //     // const speedDif = Math.abs(calcSpeed - gpsMPH);
        //     // calcSpeedEl.textContent = gpsMPH.toFixed(2);
        //     // calcGPSdifEl.textContent = speedDif.toFixed(2);
        //     // gpsSpeedUpdate(gpsMPH, position.timestamp);
        // }

        // gpsHeadingEl.textContent = heading;
        // if (heading !== null) {
            // const alpha = parseFloat(gyroAlphaEl.textContent) || 0;
            // headingAlphaDifEl.textContent = angleDist(heading, alpha).toFixed(2);
            // debugChartPushData(debugHeadingChart, 1, position.timestamp-GPSoffset, heading);
        // }

        // -----------------------------------------------------
        const modPos = {
            coords: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                altitude: position.coords.altitude,
                accuracy: position.coords.accuracy,
                altitudeAccuracy: position.coords.altitudeAccuracy,
                heading: position.coords.heading,
                speed: position.coords.speed,
            },
            timestamp: position.timestamp - GPSoffset,
        };

        // document.getElementById("betaGamma").textContent = `${JSON.stringify(modPos)}`;
        // document.getElementById("betaGamma").textContent += `<br/>${JSON.stringify(position)}`;

        gpsUpdates.push(modPos);
        if (gpsUpdates.length > 20) {
            gpsUpdates.shift();
        } else {
            document.getElementById("status").innerHTML = `${gpsUpdates.length}`;
        }
        mountingBetaGamma: {
            if (true) { // mounting
                if (gpsUpdates.length < 3) {
                    break mountingBetaGamma;
                }
                const portion = gpsUpdates.slice(-3); // dynamic later for better accuracy
                const first = portion[0];
                const last = portion[portion.length - 1];
                
                for (const update of portion) {
                    const c = update.coords;
                    if (c.speed < 5 || c.speed == null ) { // m/s spd thres
                        document.getElementById("status").textContent = "not enough spd";
                        break mountingBetaGamma;
                    }
                    if (c.accuracy < 4) { // lat long acc 95%ci (m) tested openair gives ~2m
                        document.getElementById("status").textContent = "normal acc lacking";
                        break mountingBetaGamma;
                    }
                    if (c.altitudeAccuracy < 4) { // alt acc 95%ci (m) tested openair gives ~3m
                        document.getElementById("status").textContent = "alt acc lacking";
                        break mountingBetaGamma;
                    }
                    if (Math.abs(first.coords.altitude - c.altitude) > 1) { // needs to be flat for zeroing beta/gamma
                        document.getElementById("status").textContent = "alt dif too big";
                        break mountingBetaGamma;
                    }
                    if (pointToLineDist(first.coords, c, last.coords) > 3) { // max horiz dist over area
                        document.getElementById("status").textContent = "not straight enough";
                        break mountingBetaGamma;
                    }
                }
    
                
                const firstGyroItx = gyroUpdates.findIndex(obj => obj.timeStamp > first.timestamp);
                const lastGyroItx = gyroUpdates.findIndex(obj => obj.timeStamp > last.timestamp) - 1;
                
                if (firstGyroItx < 0 || lastGyroItx < 0) {
                    document.getElementById("status").textContent = "itx went wrong";
                    break mountingBetaGamma;
                }
                // if beyond here: valid for beta/gamma mount set

                const gyroAvg = { alpha: 0, beta: 0, gamma: 0 };
                for (let i = firstGyroItx; i < lastGyroItx; i++) {
                    gyroAvg.alpha += degToRad(gyroUpdates[i].alpha);
                    gyroAvg.beta += degToRad(gyroUpdates[i].beta);
                    gyroAvg.gamma += gyroUpdates[i].gamma;
                }
                gyroAvg.alpha /= lastGyroItx - firstGyroItx;
                gyroAvg.beta /= lastGyroItx - firstGyroItx;
                gyroAvg.gamma /= lastGyroItx - firstGyroItx;

                gyroAvg.alpha = radToDeg(gyroAvg.alpha);
                gyroAvg.beta = radToDeg(gyroAvg.beta);
                gyroAvg.gamma = radToDeg(gyroAvg.gamma);
                
                document.getElementById("betaGamma").innerHTML = `${new Date(modPos.timestamp).toISOString()} <br /> ${gyroAvg.alpha} <br /> ${gyroAvg.beta} <br /> ${gyroAvg.gamma}`;
                
                
    
    
    
            }
        }
    }
    
    function onGPSError(error) {
        alert(`GPS error: ${error.message}`);
    }

function angleDist(a, b) {
  let diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}