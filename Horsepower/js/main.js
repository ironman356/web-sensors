// @ts-check
import { pairOrientation, removeOrientation, pairMotion, removeMotion, pairGPS, removeGPS } from "./pairing.js";
import { debugChartInit, debugChartSetData, debugChartPushData, startDebugCamera } from "./debug.js";
import { pointToLineDist, getGravity, addVectors, xyzMagnitude, xyzDistance, xyzToMatrix, matrixToXYZ, makeMountMatrix, matrixTranspose, applyRotationMatrix, radToDeg } from "./math.js";
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

let calcSpeed = 0;
const meterPerSecToMilePerHourC = 2.236936;

const smoothingOptions = {
    "exp": ExponentialSmooth
};
let smoothingSelection = "exp";
let smoothingSelectionVars = [ {alpha:0.1} ];


const rawGPSarr = [];
const rawACCarr = [];
const rawGYROarr = [];

const smoothACCarr = [];
const calcSpdArr = [];

let  accInterval = null;
let mountingMatrix = null;

/** @typedef {{ x:number, y:number, z:number, gpsQual:number|null, rotationQual:number, timestampPoints:number[]|null, pointAmt:number|null }} downVec */
/** @type {downVec} */
// let downVec = { x:0, y:-9.8, z:0, gpsQual:null, rotationQual:Number.MAX_SAFE_INTEGER, timestampPoints:null, pointAmt:null};
let downVec = { x:0, y:-9.8, z:0, gpsQual:10000, rotationQual:1000, timestampPoints:null, pointAmt:null};

/**@typedef {{ x:number|null, y:number|null, z:number|null, gDif:number|null, rotationQual:number, timestampPoints:number[]|null, pointAmt:number|null, gpsSpdInc:number }} forwardVec*/
/** @type {forwardVec} */
// let forwardVec = { x:null, y:null, z:null, gDif:null, rotationQual:Number.MAX_SAFE_INTEGER, timestampPoints:null, pointAmt:0};
let forwardVec = { x:0, y:0, z:-3, gDif:20, rotationQual:1000, timestampPoints:null, pointAmt:1, gpsSpdInc: 0};

mountingMatrix = makeMountMatrix(downVec, forwardVec);

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
        // pairOrientation(gyroHandler);        
        pairButton.textContent = "Un-Pair";
    }

    // un-pair / disable everything
    else {

        geoWatchId = removeGPS(geoWatchId);
        removeMotion(accelHandler);
        // removeOrientation(gyroHandler);
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




const smoothACCmethod = {
    timestamp: null,
    acceleration: {
        x: new smoothingOptions[smoothingSelection]( smoothingSelectionVars[0] ),
        y: new smoothingOptions[smoothingSelection]( smoothingSelectionVars[0] ),
        z: new smoothingOptions[smoothingSelection]( smoothingSelectionVars[0] ),
    },
    rotationRate: {
        x: new smoothingOptions[smoothingSelection]( smoothingSelectionVars[0] ),
        y: new smoothingOptions[smoothingSelection]( smoothingSelectionVars[0] ),
        z: new smoothingOptions[smoothingSelection]( smoothingSelectionVars[0] ),
    },
    accelerationIncludingGravity: {
        x: new smoothingOptions[smoothingSelection]( smoothingSelectionVars[0] ),
        y: new smoothingOptions[smoothingSelection]( smoothingSelectionVars[0] ),
        z: new smoothingOptions[smoothingSelection]( smoothingSelectionVars[0] ),
    }
};


function accelHandler(event) {
    /**
     * Think of the accelerometer as a spring-loaded mass measuring the springs length
     */


    if (accInterval === null) { // saving seperate from arr to reduce save size
        // typical ~60hz -> this works for ~1-999hz      ios:seconds,android:millis between updates
        if (event.interval < 1) {
            accInterval = event.interval * 1000; //ios
        } else {
            accInterval = event.interval; //not ios
        }
    };

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
    rawACCarr.push(rawACC);

    const smoothACC = {
        timestamp: rawACC.timestamp,
        acceleration: {
            x: smoothACCmethod.acceleration.x.update(rawACC.acceleration.x),
            y: smoothACCmethod.acceleration.y.update(rawACC.acceleration.y),
            z: smoothACCmethod.acceleration.z.update(rawACC.acceleration.z),
        },
        rotationRate: {
            x: smoothACCmethod.rotationRate.x.update(rawACC.rotationRate.x),
            y: smoothACCmethod.rotationRate.y.update(rawACC.rotationRate.y),
            z: smoothACCmethod.rotationRate.z.update(rawACC.rotationRate.z),
        },
        accelerationIncludingGravity: {
            x: smoothACCmethod.accelerationIncludingGravity.x.update(rawACC.accelerationIncludingGravity.x),
            y: smoothACCmethod.accelerationIncludingGravity.y.update(rawACC.accelerationIncludingGravity.y),
            z: smoothACCmethod.accelerationIncludingGravity.z.update(rawACC.accelerationIncludingGravity.z),
        }
    }
    smoothACCarr.push(smoothACC);
    console.log(`${JSON.stringify(smoothACC, null,2)}`);


    document.getElementById("ACCtemp").innerText = JSON.stringify(smoothACCarr[smoothACCarr.length - 1], null, 2);


    if (mountingMatrix !== null) {
        const grav = getGravity(smoothACC);
        const grav_deviation = applyRotationMatrix(matrixTranspose(mountingMatrix), xyzToMatrix(grav));
        const curPitch = radToDeg(Math.atan2(-grav_deviation[1], grav_deviation[2])); //[1] and [0] negative to fix pitch/roll to x/z axis rhr 
        const curRoll = radToDeg(Math.atan2(-grav_deviation[0], grav_deviation[2]));
        debugChartPushData(debugMotionRot, 0, smoothACC.timestamp, curPitch);
        debugChartPushData(debugMotionRot, 1, smoothACC.timestamp, 0); // leaving 0 for reference line
        debugChartPushData(debugMotionRot, 2, smoothACC.timestamp, curRoll);


        const vehicleAccMat = applyRotationMatrix(matrixTranspose(mountingMatrix), xyzToMatrix(smoothACC.acceleration));
        // document.getElementById("fineTune").textContent = `crash?  ${JSON.stringify(vehicleAccMat, null, 2)}`;

        const vehicleAcc = matrixToXYZ(vehicleAccMat);
        // vehicleAcc.y = -vehicleAcc.y; // idk why this is inverted
        vehicleAcc.x = -vehicleAcc.x;
        vehicleAcc.y = -vehicleAcc.y;
        vehicleAcc.z = -vehicleAcc.z;

        debugChartPushData(debugMotionAcc, 0, smoothACC.timestamp, vehicleAcc.x);
        debugChartPushData(debugMotionAcc, 1, smoothACC.timestamp, vehicleAcc.y);
        debugChartPushData(debugMotionAcc, 2, smoothACC.timestamp, vehicleAcc.z);
        
        calcSpd: {
            // Step 1: Apply accel-based integration
            calcSpeed += ((vehicleAcc.y * meterPerSecToMilePerHourC) / accInterval);

            // Step 2: Save current estimate
            calcSpdArr.push({ timestamp: smoothACC.timestamp, speed: calcSpeed });

            // Step 3: Apply correction if delayed GPS is available
            if (rawGPSarr.length >= 1) {
                const lastGPS = rawGPSarr.at(-1);
                const gpsTime = lastGPS.timestamp - GPSoffset;

                const idx = calcSpdArr.findIndex(p => Math.abs(p.timestamp - gpsTime) <= accInterval);
                if (idx >= 0) {
                    const estSpeedAtGPS = calcSpdArr[idx].speed;
                    const gpsSpeed = lastGPS.coords.speed * meterPerSecToMilePerHourC;
                    const diff = gpsSpeed - estSpeedAtGPS;

                    // Small nudge toward correcting current speed
                    const correctionFactor = 0.01;
                    calcSpeed += diff * correctionFactor;
                }
            }

            // if (rawGPSarr.length < 3 || smoothACC.timestamp - rawGPSarr[rawGPSarr.length - 1].timestamp > 2000) {
            //     // no recent gps data to use
            //     calcSpeed = calcSpeed + ((vehicleAcc.y / accInterval) * meterPerSecToMilePerHourC);
            // }
            // else {
            //     const lastGPS = rawGPSarr[rawGPSarr.length - 1];
            //     const calcSpdIDX = calcSpdArr.findIndex(obj => obj.timestamp >= lastGPS.timestamp - GPSoffset);
            //     let gpsCalcDif;
            //     if (calcSpdIDX < 0) {
            //         gpsCalcDif = 0;
            //     } else {
            //         gpsCalcDif = calcSpdArr[calcSpdIDX].speed - lastGPS.coords.speed * meterPerSecToMilePerHourC
            //         document.getElementById("test").textContent = `${gpsCalcDif}`;
            //     }
            //     calcSpeed = calcSpeed + ((vehicleAcc.y / accInterval) * meterPerSecToMilePerHourC) + (gpsCalcDif / (accInterval * 2)); // this could probably be done better but i dont want to implement logs or moving exponentials rn
            // }

            // calcSpdArr.push({ timestamp: smoothACC.timestamp, speed: calcSpeed });
            debugChartPushData(debugSpeed, 1, smoothACC.timestamp, calcSpeed);
        }

    } else {
        debugChartPushData(debugMotionAcc, 0, smoothACC.timestamp, smoothACC.accelerationIncludingGravity.x);
        debugChartPushData(debugMotionAcc, 1, smoothACC.timestamp, smoothACC.accelerationIncludingGravity.y);
        debugChartPushData(debugMotionAcc, 2, smoothACC.timestamp, smoothACC.accelerationIncludingGravity.z);
        debugChartPushData(debugMotionRot, 0, smoothACC.timestamp, smoothACC.rotationRate.x);
        debugChartPushData(debugMotionRot, 1, smoothACC.timestamp, smoothACC.rotationRate.y);
        debugChartPushData(debugMotionRot, 2, smoothACC.timestamp, smoothACC.rotationRate.z);
    }




}
// const test = applyRotationMatrix(matrixTranspose([[-0.9,-0.2,0.0,],[-0.01,0.2,-0.97],[0.02,-0.97,-0.2]]), [0,-9.8,1]);
// console.log(Math.atan2(test[1],test[2]));
// console.log(Math.atan2(test[0],test[2]));







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

    document.getElementById("GPStemp").innerText = JSON.stringify(adjusted, null, 2);
    
    if (adjusted.coords.speed !== null) {
        rawGPSarr.push(adjusted);
        // calcSpeed = adjusted.coords.speed * meterPerSecToMilePerHourC;
        debugChartPushData(debugSpeed, 0, adjusted.timestamp, adjusted.coords.speed * meterPerSecToMilePerHourC);
    } else {
        return; // dont recheck mounting if speed null
    }


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
        const firstAccITX = smoothACCarr.findIndex(obj => obj.timestamp >= gpsFirst.timestamp - GPSoffset);
        const lastAccITX = smoothACCarr.findIndex(obj => obj.timestamp >= gpsLast.timestamp - GPSoffset);
        
        if ( (lastAccITX - firstAccITX) < 30) { // should be ~60x (subsec.length-1)
            document.getElementById("fineTune").textContent += `\nITX len Break`;
            break mounting;
        }
        
        /** @type {downVec} */
        let potentialDown = { x:0, y:0, z:0, gpsQual:pathAccuracy, rotationQual:0, timestampPoints:[gpsFirst.timestamp, gpsLast.timestamp], pointAmt:1 }; // point amt not setup b/c gps still static 3 point
        
        
        for ( let i = firstAccITX; i <= lastAccITX; i++ ) {
            const grav = getGravity(smoothACCarr[i]);
            addVectors(potentialDown, grav); // potentialdown += gravity (xyz)
            potentialDown.rotationQual += xyzMagnitude(smoothACCarr[i].rotationRate);
        }
        potentialDown.x /= lastAccITX-firstAccITX;
        potentialDown.y /= lastAccITX-firstAccITX;
        potentialDown.z /= lastAccITX-firstAccITX;
        potentialDown.rotationQual /= lastAccITX-firstAccITX;
        

        

        if (downVec.timestampPoints === null) {
            downVec = potentialDown;
            document.getElementById("fineTune").textContent += `\nDown point init set`;
        } else {
            
            // check if down is flat out better
            const downVecWeights = { gpsQual:1, rotationQual:1, pointAmt:.1 };
            
            const potBal = propertyBalance(potentialDown, downVecWeights) + potentialDown.timestampPoints[potentialDown.timestampPoints.length-1]/10000;
            const curBal = propertyBalance(downVec, downVecWeights) + downVec.timestampPoints[downVec.timestampPoints.length-1]/10000;
            
            if (potBal === null || curBal === null) {
                //something went very very wrong
                window.alert("Null balance - this shouldn't be possible");
            } else if (potBal < curBal) {
                downVec = potentialDown;
            }
            document.getElementById("fineTune").textContent += `\nPotBal: ${potBal}`;
            document.getElementById("fineTune").textContent += `\nCurBal: ${curBal}`;
            document.getElementById("fineTune").textContent += `\ndown pot dist ${xyzDistance(potentialDown, downVec)}`;


            // high qual but not same == mount changed / moved
            // at small angle differences 1deg dif ~0.175 dist - not linear completely but at small angle differences the distances scale effectively linearly
            if ( (propertyBalance(potentialDown, downVecWeights) < propertyBalance(downVec, downVecWeights) * 1.3) && (xyzDistance(potentialDown, downVec) > .175*5 ) ) {
                downVec = potentialDown;
                document.getElementById("fineTune").textContent += `\nDownvec Changed -|-|-|-|-`;

            }

        }
        document.getElementById("fineTune").textContent += `\nDownVec ${JSON.stringify(downVec, null, 2)}`;
        
        
        
        const forwardVecAccThres = 1.5;
        const forwardVecMinPoints = 4;
        const forwardVecRotThres = 15; // smoothed so lower is fine
                // 2pointer find periods of continuious acceleration
        let l = 0, r = 0;
        while (l < smoothACCarr.length-1) {
            if (xyzMagnitude(smoothACCarr[l].acceleration) > forwardVecAccThres && xyzMagnitude(smoothACCarr[l].rotationRate) < forwardVecRotThres) {
                r = l;
                while (r < smoothACCarr.length-1 && xyzMagnitude(smoothACCarr[r].acceleration) > forwardVecAccThres && xyzMagnitude(smoothACCarr[l].rotationRate) < forwardVecRotThres) {
                    r++;
                }
                // here [l to r] meets acc thres
                if ( r-l < forwardVecMinPoints) {
                    l=r;
                    continue;
                }
                let potentialForward = { x:0, y:0, z:0, gDif:0, rotationQual:0, timestampPoints:[smoothACCarr[l].timestamp, smoothACCarr[r].timestamp], pointAmt:r-l };
                for (let k = l; k < r; k++) {
                    addVectors(potentialForward, smoothACCarr[k].acceleration);
                    potentialForward.gDif += xyzDistance(downVec, getGravity(smoothACCarr[k]));
                    potentialForward.rotationQual += xyzMagnitude(smoothACCarr[k].rotationRate);
                }
                potentialForward.x /= r-l;
                potentialForward.y /= r-l;
                potentialForward.z /= r-l;
                potentialForward.gDif /= r-l;
                potentialForward.rotationQual /= r-l;
                if (forwardVec.timestampPoints === null) {
                    forwardVec = potentialForward;
                    l=r;
                    continue;
                }

                const forwardVecWeights = { gDif:5, rotationQual:1, pointAmt:-1 }; // todo: favor recent via timestamp 
                if (propertyBalance(potentialForward, forwardVecWeights) < propertyBalance(forwardVec, forwardVecWeights)) {
                    forwardVec = potentialForward;
                }
                l = r;
            } else {
                l++;
            }
        }

		document.getElementById("fineTune").textContent += `\nForwardVec? ${JSON.stringify(forwardVec, null, 2)}`;
        mountingMatrix = makeMountMatrix(downVec, forwardVec);
        document.getElementById("fineTune").textContent += `\n matrix made`;
        // document.getElementById("fineTune").textContent += `\nMounting Matrix ${JSON.stringify(mountingMatrix, null, 2)}`;

    }
}


function propertyBalance(obj, weights = {} ) {
    let total = 0;
    for (let key in weights) {
        if ( !(key in obj) ) {
            window.alert(`key "${key}" missing - propertyBalance`)
            return null;
        }
        total += obj[key] * weights[key];
    }
    return total;
}



function onGPSError(error) {
    alert(`GPS error: ${error.message}`);
}

window.onerror = function (message, source, lineno, colno, error) {
  window.alert(`Global error: ${message} at ${source}, ${lineno}, ${colno}`);
  // optionally send to a server for logging
};

document.getElementById("test").textContent = `end Reached`;
