import { pairOrientation, removeOrientation, pairMotion, removeMotion, pairGPS, removeGPS } from "./pairing.js";
import { debugChartInit, debugChartSetData, debugChartPushData, startDebugCamera } from "./debug.js";
import { pointToLineDist } from "./math.js";
import { AdaptiveKalman, ExponentialSmooth } from "./filter.js";

// document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
// document.addEventListener('wheel', e => e.preventDefault(), { passive: false });

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

const smoothACCarr = [];

let  accInterval = null;
let mountingMatrix;

const debugMotionAcc = debugChartInit("debugMotionAcc", ["x", "y", "z"], "m/s");
const debugMotionRot = debugChartInit("debugMotionRot", ["x", "y", "z"], "deg/s");
const debugSpeed = debugChartInit("debugGraphSpeed", ["GPS","CALC"], "Speed *MPH");

const GPSoffset = 500; // make dynamic later? -> /account for variance
const startingTimeStamp = Date.now();

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
            StartTime: startingTimeStamp,
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



// const kalQ = (10 * 1 / 60) ** 2; // expected max accel ~10 m/s^2 over 1 update
// max typical acc, break, lat = 12, 30, 8
// max acc street: <100, drag strip <250 

const expXlin = new ExponentialSmooth({ alpha: .2 });
const expYlin = new ExponentialSmooth({ alpha: .2 });
const expZlin = new ExponentialSmooth({ alpha: .2 });
const expXrot = new ExponentialSmooth({ alpha: .2 });
const expYrot = new ExponentialSmooth({ alpha: .2 });
const expZrot = new ExponentialSmooth({ alpha: .2 });
const expXgrav = new ExponentialSmooth({ alpha: .2 });
const expYgrav = new ExponentialSmooth({ alpha: .2 });
const expZgrav = new ExponentialSmooth({ alpha: .2 });
// const kalmanX = new AdaptiveKalman({ Q: kalQ});
// const kalmanY = new AdaptiveKalman({ Q: kalQ });
// const kalmanZ = new AdaptiveKalman({ Q: kalQ });


function accelHandler(event) {
    /**
     * Think of the accelerometer as a spring-loaded mass measuring the springs length
     */
    const rawACC = {
        timestamp: event.timeStamp,         // millis since loaded (not started)
        acceleration: {
            x: event.acceleration.x,
            y: event.acceleration.y,
            z: event.acceleration.z,
        },   // m/s^2 along axis xyz
        // accelerationIncludingGravity: event.accelerationIncludingGravity,
        rotationRate: {     // rotation degrees/sec right-hand-rule
            x: event.rotationRate.alpha,    // i know all 3 of these look wrong, it is correct when looking at testing
            y: event.rotationRate.beta,     // or my phone is broken / accel&gyro mounted differently from specifications
            z: event.rotationRate.gamma,    //
        },
        accelerationIncludingGravity: {
            x: event.accelerationIncludingGravity.x,
            y: event.accelerationIncludingGravity.y,
            z: event.accelerationIncludingGravity.z,
        }
    };
    // const smoothACC = {
    //     timestamp: event.timeStamp,
    //     acceleration: {
    //         x: expXlin.update(event.acceleration.x),
    //         y: expYlin.update(event.acceleration.y),
    //         z: expZlin.update(event.acceleration.z),
    //     },
    //     rotationRate: {
    //         x: expXrot.update(event.rotationRate.beta),
    //         y: expYrot.update(event.rotationRate.gamma),
    //         z: expZrot.update(event.rotationRate.alpha),
    //     },
    //     accelerationIncludingGravity: {
    //         x: expXgrav.update(event.accelerationIncludingGravity.x),
    //         y: expYgrav.update(event.accelerationIncludingGravity.y),
    //         z: expZgrav.update(event.accelerationIncludingGravity.z),
    //     }
    // };
    
    if (accInterval === null) { // saving seperate from arr to reduce save size
        // typical ~60hz -> this works for ~1-999hz      ios:seconds,android:millis between updates
        if (event.interval < 1) {
            accInterval = event.interval * 1000; //ios
        } else {
            accInterval = event.interval; //not ios
        }
    };
        
    rawACCarr.push(rawACC);
    document.getElementById("ACCtemp").innerText = JSON.stringify(rawACCarr[rawACCarr.length - 1], null, 2);

    debugChartPushData(debugMotionAcc, 0, rawACC.timestamp, rawACC.accelerationIncludingGravity.x);
    debugChartPushData(debugMotionAcc, 1, rawACC.timestamp, rawACC.accelerationIncludingGravity.y);
    debugChartPushData(debugMotionAcc, 2, rawACC.timestamp, rawACC.accelerationIncludingGravity.z);

    debugChartPushData(debugMotionRot, 0, rawACC.timestamp, rawACC.rotationRate.x);
    debugChartPushData(debugMotionRot, 1, rawACC.timestamp, rawACC.rotationRate.y);
    debugChartPushData(debugMotionRot, 2, rawACC.timestamp, rawACC.rotationRate.z);

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

}



let downVec = { x:null, y:null, z:null, gpsQual:null, rotationQual:null };
let forwardVec = { x:null, y:null, z:null, gDif:null, rotationQual:null, pointAmt:0 };


function gpsHandler(position) {
    const adjusted = {
        timestamp: position.timestamp - startingTimeStamp,      // adjusted from epoch to relative -> so only need to account for 500ms offset
        coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            altitude: position.coords.altitude,         // meters
            accuracy: position.coords.accuracy,         // 95%ci m lateral
            altitudeAccuracy: position.coords.altitudeAccuracy, // 95%ci m vertical
            heading: position.coords.heading,
            speed: position.coords.speed            // m/s
        }
    };
    rawGPSarr.push(adjusted);

    document.getElementById("GPStemp").innerText = JSON.stringify(adjusted, null, 2);

    mounting: {
        if (rawGPSarr.length < 3) {
            document.getElementById("fineTune").textContent = `length ${rawGPSarr.length}`;
            break mounting;
        }
        const gpsSubSec = rawGPSarr.slice(-3); // TODO - dynamic later for better accuracy
            // TODO? -> continous 2pointer track straight sections
            
        const gpsFirst = gpsSubSec[0];
        const gpsLast = gpsSubSec[gpsSubSec.length - 1];
        
        let pathAccuracy = 1;
    
        for (const update of gpsSubSec) {
            
            const c = update.coords;
            let pointAccuracy = 1;
            
            const spdThres = 5;
            // if (c.speed === null || c.speed < spdThres) {
            //         pointAccuracy *= 1000;
            //         break mounting;
            //     }
            pointAccuracy *= Math.max(1, c.accuracy / 2);
            pointAccuracy *= Math.max(1, c.altitudeAccuracy / 3);
            const altDif = Math.abs(gpsFirst.coords.altitude - c.altitude);
            pointAccuracy *= Math.max(1, altDif);
            const latDif = pointToLineDist(gpsFirst.coords, c, gpsLast.coords); // will be 0 on 1st/last rn
            if (c.speed !== null && c.speed > spdThres) {
                pointAccuracy *= Math.max(1, latDif / (c.speed / spdThres));
            } else {
                pointAccuracy *= 1000
            }
            
            // accuracy, dist to avg
            // DEBUG ONLY-> remove when portion adjusted
            if (update.timestamp != gpsFirst.timestamp && update.timestamp != gpsLast.timestamp) {
                document.getElementById("fineTune").textContent = `midPointacc ${pointAccuracy}`;
            }

            pathAccuracy += pointAccuracy;
        }
        pathAccuracy /= gpsSubSec.length
        // if beyond here: moving realtively straight, relatively flat
        document.getElementById("fineTune").textContent += `\npath acc ${pathAccuracy}`;
        // set down vector
        const firstAccITX = rawACCarr.findIndex(obj => obj.timestamp >= gpsFirst.timestamp - GPSoffset);
        const lastAccITX = rawACCarr.findIndex(obj => obj.timestamp >= gpsLast.timestamp - GPSoffset);
        
        if ( (lastAccITX - firstAccITX) < 30) { // should be ~60x subsec.length
            break mounting;
        }
        

        let potentialDown = { x:0, y:0, z:0, gpsQual:pathAccuracy, rotationQual:0 };
        for ( let i = firstAccITX; i <= lastAccITX; i++ ) {
            const grav = getGravity(rawACCarr[i]);
            addVectors(potentialDown, grav);
            potentialDown.rotationQual += xyzMagnitude(rawACCarr[i].rotationRate);
        }
        potentialDown.x /= lastAccITX-firstAccITX;
        potentialDown.y /= lastAccITX-firstAccITX;
        potentialDown.z /= lastAccITX-firstAccITX;
        potentialDown.rotationQual /= lastAccITX-firstAccITX;
        if (downVec.gpsQual === null) {
            downVec = potentialDown;
        } else {
            document.getElementById("fineTune").textContent += `\nPotBal: ${potentialDown.gpsQual + potentialDown.rotationQual*10}`;
            document.getElementById("fineTune").textContent += `\nCurBal: ${downVec.gpsQual + downVec.rotationQual*10}`;
            if (potentialDown.gpsQual + potentialDown.rotationQual*10 < downVec.gpsQual + downVec.rotationQual*10) {
                downVec = potentialDown;
            }
        }
        document.getElementById("fineTune").textContent += `\nDownVec ${JSON.stringify(downVec, null, 2)}`;
        
        
        const forwardVecAccThres = 2;
        const forwardVecMinPoints = 20;
        
        
        // 2pointer find periods of continuious acceleration
        let l = 0, r = 0;
        while (l < rawACCarr.length) {
            if (xyzMagnitude(rawACCarr[l].acceleration) > forwardVecAccThres) {
                r = l;
                while (xyzMagnitude(rawACCarr[r].acceleration) > forwardVecAccThres && r < rawACCarr.length) {
                    r++;
                }
                // here [l to r] meets acc thres
                if ( r-l < forwardVecMinPoints) {
                    l=r;
                    continue;
                }
                let potentialForward = { x:0, y:0, z:0, gDif:0, rotationQual:0, pointAmt:r-l };
                for (let k = l; k < r; k++) {
                    addVectors(potentialForward, rawACCarr[k].acceleration);
                    potentialForward.gDif += xyzDistance(downVec, getGravity(rawACCarr[k]));
                    potentialForward.rotationQual += xyzMagnitude(rawACCarr[k].rotationRate);
                }
                potentialForward.x /= r-l;
                potentialForward.y /= r-l;
                potentialForward.z /= r-l;
                potentialForward.gDif /= r-l;
                potentialForward.rotationQual /= r-l;
                if (forwardVec.rotationQual === null) {
                    forwardVec = potentialForward;
                    l=r;
                    continue;
                }

                // seeing if potential is better than current
                // adjust this to change balance / priority of gDif and rotaitonQual
                function vecBalance(v, weights = { gDif: 100, rotationQual: 1, pointAmt: 1 }) {
                    if (v.gDif == null || v.rotationQual == null || v.pointAmt == null) return Infinity;
                    return (
                        v.gDif * weights.gDif +
                        v.rotationQual * weights.rotationQual +
                        v.pointAmt * weights.pointAmt
                    );
                }

                // document.getElementById("fineTune").textContent += `\nfor pot bal: ${vecBalance(potentialForward)}`;
                // document.getElementById("fineTune").textContent += `\nfor cur bal: ${vecBalance(forwardVec)}`;
                if (vecBalance(potentialForward) < vecBalance(forwardVec)) {
                    forwardVec = potentialForward;
                }
                l = r;
            } else {
                l++;
            }
        }
        document.getElementById("fineTune").textContent += `\nForwardVec ${JSON.stringify(forwardVec, null, 2)}`;


    }
}
/**
 * isolate gravity vec via acceleration w/gravity - linear acceleration
 * @param {*} vec vector with accelerationIncludingGravity && acceleration properties
 * @returns vector with only xyz properties being gravity
 */
function getGravity(vec) {
    return {
        x: vec.accelerationIncludingGravity.x - vec.acceleration.x,
        y: vec.accelerationIncludingGravity.y - vec.acceleration.y,
        z: vec.accelerationIncludingGravity.z - vec.acceleration.z,
    };
}
/**
 * Adds vec2 to vec1 preserving vec1's other properties
 * @param {*} vec1 
 * @param {*} vec2 
 * @returns 
 */
function addVectors(vec1, vec2) {
    vec1.x += vec2.x;
    vec1.y += vec2.y;
    vec1.z += vec2.z;
    return vec1;
}
/**
 * gets magnitude of vector based on its xyz peroperties
 * @param {*} vec 
 * @returns number
 */
function xyzMagnitude(vec) {
    const net = vec.x**2 + vec.y**2 + vec.z**2;
    return Math.sqrt(net);
}
/**
 * Distance between 2 objects based on xyz peroperties of passed object
 * @param {*} vec1 
 * @param {*} vec2 
 */
function xyzDistance(vec1, vec2) {
    let result = 0;
    result += (vec1.x - vec2.x)**2;
    result += (vec1.y - vec2.y)**2;
    result += (vec1.z - vec2.z)**2;
    return Math.sqrt(result);
}






function onGPSError(error) {
    alert(`GPS error: ${error.message}`);
}