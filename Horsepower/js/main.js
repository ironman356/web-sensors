// disabled @ts-check
import { pairOrientation, removeOrientation, pairMotion, removeMotion, pairGPS, removeGPS } from "./pairing.js";
import { debugChartInit, debugChartSetData, debugChartPushData, startDebugCamera, debugTableAdd } from "./debug.js";
import { pointToLineDist, getGravity, addVectors, xyzMagnitude, xyzDistance, xyzToMatrix, matrixToXYZ, makeMountMatrix, matrixTranspose, applyRotationMatrix, radToDeg } from "./math.js";
import { AdaptiveKalman, ExponentialSmooth } from "./filter.js";

document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('wheel', e => e.preventDefault(), { passive: false });


const pairButton = document.getElementById("pairButton");
const saveButton = document.getElementById("saveRecordedButton");

// "final" items
const calcSpeedEl = document.getElementById("calcSpeed");
const calcHeadingEl = document.getElementById("calcHeading");
const horsepowerEl = document.getElementById("horsepower");
const tractionCircleEl = document.getElementById("tractionCircle");

let replayMode = false;

const debugTableCleanup = 10 * 1000;
const debugTable = document.getElementById("debugLedger");

document.getElementById("pairCamera")?.addEventListener("click", () => startDebugCamera("debugCamera"));

let calcSpeed = 0;
const meterPerSecToMilePerHourC = 2.236936;

const smoothingOptions = {
    "exp": ExponentialSmooth
};
let smoothingSelection = "exp";
let smoothingSelectionVars = [ {alpha:0.07} ]; // exp -> lower = smoother  :  % approach of new value


const rawGPSarr = [];
const rawACCarr = [];
const rawGYROarr = [];
const smoothACCarr = [];
const calcSpdArr = [];

let accIntervalHZ = null;
let mountingMatrix = null;


/** @typedef {{ x:number, y:number, z:number, gpsQual:number|null, rotationQual:number, timestampPoints:number[]|null, pointAmt:number|null }} downVec */
/** @type {downVec} */
// let downVec = { x:0, y:-9.8, z:0, gpsQual:null, rotationQual:Number.MAX_SAFE_INTEGER, timestampPoints:null, pointAmt:null};
let downVec = { x:0, y:-9.8, z:0, gpsQual:10000, rotationQual:1000, timestampPoints:null, pointAmt:null};

/**@typedef {{ x:number, y:number, z:number, gDif:number|null, rotationQual:number, timestampPoints:number[]|null, pointAmt:number|null, gpsSpdInc:number }} forwardVec*/
/** @type {forwardVec} */
// let forwardVec = { x:null, y:null, z:null, gDif:null, rotationQual:Number.MAX_SAFE_INTEGER, timestampPoints:null, pointAmt:0};
let forwardVec = { x:0, y:0, z:-3, gDif:20, rotationQual:1000, timestampPoints:null, pointAmt:1, gpsSpdInc: 0};

mountingMatrix = makeMountMatrix(downVec, forwardVec);

const debugMotionAcc = debugChartInit("debugMotionAcc", ["x", "y", "z"], "m/s");
const debugMotionRot = debugChartInit("debugMotionRot", ["x", "y", "z"], "deg/s");
const debugSpeed = debugChartInit("debugGraphSpeed", ["GPS","CALC"], "Speed *MPH");
const debugInclineRoll = debugChartInit("debugIncRoll", ["Incline","0","Roll"], "Incline Roll°");


// make dynamic later?
const gpsOffsetEl = document.getElementById("gpsOffset");
let gpsOffset = Number(localStorage.getItem("gpsOffset")) || 500; // localStorage is mostly persistant - !=session
gpsOffsetEl.value = gpsOffset;
gpsOffsetEl.addEventListener("change", () => { gpsOffset = Number(gpsOffsetEl.value); localStorage.setItem("gpsOffset", gpsOffset) });
// localStorage.setItem



let startingTimeStamp = Date.now(); // -> replayer currently can change this requiring refresh if going from replay -> live

// - - pairing sensors - -
let geoWatchId = null;
pairButton.addEventListener("click", () => {

    // pair / enable everything
    if (pairButton.textContent == "Pair") {
        replayMode = false;
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



// - - save button - -
saveButton.addEventListener("click", () => {
    const jsonStr = JSON.stringify({
        Options: {
            accIntervalHZ: accIntervalHZ,
            Weight: 0,
            DragCoef: 1,
            RollResistance: 2,
            FronalArea: 3,
            startingTimeStamp: startingTimeStamp,
        },
        rawGPSarr: rawGPSarr,
        rawACCarr: rawACCarr,
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


const pages = ["Live", "Settings", "Debug", "Replayer"];
let curPage = 0;
pagesSetup: {
    const nextButtonEl = document.getElementById("nextButton");
    const prevButtonEl = document.getElementById("prevButton");
    const curPageEl = document.getElementById("curPage");



    function changePage(current, desired) {
        document.getElementById(pages[current]).style.display = 'none';
        ((desired) < 0) ? curPage = desired+pages.length : curPage = desired % pages.length;
        document.getElementById(pages[curPage]).style.display = 'grid';

        curPageEl.textContent = pages[curPage];
        nextButtonEl.textContent = pages[(curPage+1) % pages.length];
        prevButtonEl.textContent = pages[curPage-1 < 0 ? curPage-1 + pages.length : curPage-1];
    }
    nextButtonEl.addEventListener("click", () => changePage(curPage, curPage+1));
    prevButtonEl.addEventListener("click", () => changePage(curPage, curPage-1));
    changePage(0,0); // inital setup


    const topNav = document.getElementById("topNav");
    let hideTimeout;

    function showTopNav(duration = 3000) {
        topNav.classList.add("showing");

        requestAnimationFrame(() => {
        topNav.classList.add("visible");
        });

        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
        topNav.classList.remove("visible");

        setTimeout(() => {
            topNav.classList.remove("showing");
        }, 300); // Must match CSS transition duration
        }, duration);
    }

    document.addEventListener("click", (e) => {
    if (e.clientY < window.innerHeight / 5) {showTopNav();}
    });
    showTopNav();
}


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


    if (accIntervalHZ === null) { // saving seperate from arr to reduce save size
        // typical ~60hz -> this works for ~1-999hz      ios:seconds,android:millis between updates
        if (event.interval < 1) {
            accIntervalHZ = 1 / event.interval; // interval in seconds to hz
        } else {
            accIntervalHZ = 1000 / event.interval; // interval in millis to hz
        }
    };

    const rawACC = {
        timestamp: event.timeStamp || event.timestamp,         // millis since loaded (not started)
        acceleration: {
            x: event.acceleration.x,
            y: event.acceleration.y,
            z: event.acceleration.z,
        },   // m/s^2 along axis xyz
        // accelerationIncludingGravity: event.accelerationIncludingGravity,
        rotationRate: {     // rotation degrees/sec right-hand-rule
            x: event.rotationRate.alpha || event.rotationRate.x,    // i know all 3 of these look wrong, it is correct when looking at testing
            y: event.rotationRate.beta || event.rotationRate.y,     // or my phone is broken / accel&gyro mounted differently from specifications
            z: event.rotationRate.gamma || event.rotationRate.z,
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
    // console.log(`${JSON.stringify(smoothACC, null,2)}`);


    document.getElementById("ACCtemp").innerText = JSON.stringify(smoothACCarr[smoothACCarr.length - 1], null, 2);


    if (mountingMatrix === null) {
        alert("null mounting matrix");
        return;
    }
    const grav = getGravity(smoothACC);
    const grav_deviation = applyRotationMatrix(matrixTranspose(mountingMatrix), xyzToMatrix(grav));
    const curPitch = radToDeg(Math.atan2(-grav_deviation[1], grav_deviation[2])); //[1] and [0] negative to fix pitch/roll to x/z axis rhr 
    const curRoll = radToDeg(Math.atan2(-grav_deviation[0], grav_deviation[2]));

    
    const vehicleAccMat = applyRotationMatrix(matrixTranspose(mountingMatrix), xyzToMatrix(smoothACC.acceleration));
    const vehicleRotMat = applyRotationMatrix(matrixTranspose(mountingMatrix), xyzToMatrix(smoothACC.rotationRate));
 
    const vehicleAcc = matrixToXYZ(vehicleAccMat);
    const vehicleRot = matrixToXYZ(vehicleRotMat);
    
    vehicleAcc.x = -vehicleAcc.x;   // sesnsor to motion conversion
    vehicleAcc.y = -vehicleAcc.y;
    vehicleAcc.z = -vehicleAcc.z;

    
    if (pages[curPage] == "Debug") {
        debugChartPushData(debugInclineRoll, 0, smoothACC.timestamp, curPitch);
        debugChartPushData(debugInclineRoll, 1, smoothACC.timestamp, 0); //  0 for reference line
        debugChartPushData(debugInclineRoll, 2, smoothACC.timestamp, curRoll);

        debugChartPushData(debugMotionAcc, 0, smoothACC.timestamp, vehicleAcc.x);
        debugChartPushData(debugMotionAcc, 1, smoothACC.timestamp, vehicleAcc.y);
        debugChartPushData(debugMotionAcc, 2, smoothACC.timestamp, vehicleAcc.z);

        debugChartPushData(debugMotionRot, 0, smoothACC.timestamp, vehicleRot.x);
        debugChartPushData(debugMotionRot, 1, smoothACC.timestamp, vehicleRot.y);
        debugChartPushData(debugMotionRot, 2, smoothACC.timestamp, vehicleRot.z);
    }
    
    calcSpd: {
        calcSpeed += ((vehicleAcc.y * meterPerSecToMilePerHourC) / accIntervalHZ);
        calcSpdArr.push({ timestamp: smoothACC.timestamp, speed: calcSpeed });

        if (rawGPSarr.length >= 1) {
            const lastGPS = rawGPSarr.at(-1);
            const gpsTime = lastGPS.timestamp - gpsOffset;

            const idx = calcSpdArr.findIndex(p => p.timestamp > gpsTime); // no need to account for accInterval ass when triggered latest gps will always be < latest accel / calcSpd
            
            const timeSinceGPS = smoothACC.timestamp - startingTimeStamp - lastGPS.timestamp; // not using date.now for replayer -> dif should only be a few millis

            // if gps < min time -> nudge calc by gps,calc dist @ factor/sec
            const calcSpdCorrectionFactor = 0.1; // closing rate of dif between gps and accel data /second
            const calcSpdCorrectionMinTime = 1500; // min recency of gps data for correction factor in millis

            if (idx >= 0 && timeSinceGPS < calcSpdCorrectionMinTime) { // only apply correction if there is relevent data
                const estSpeedAtGPS = calcSpdArr[idx].speed;
                const gpsSpeed = lastGPS.coords.speed * meterPerSecToMilePerHourC;
                const diff = gpsSpeed - estSpeedAtGPS;

                calcSpeed += (diff / accIntervalHZ) * calcSpdCorrectionFactor;
            }
        }

        debugChartPushData(debugSpeed, 1, smoothACC.timestamp, calcSpeed);
    }

    // debugTableAdd(`ACC Handler`, `smoothAcc len:${smoothACCarr.length}`, undefined, debugTable, debugTableCleanup);


}



function gpsHandler(position) {
    // console.log(position);
    const adjusted = {
        timestamp: replayMode ? position.timestamp : position.timestamp - startingTimeStamp,      // adjusted from epoch to relative -> so only need to account for 500ms offset
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
        debugChartPushData(debugSpeed, 0, adjusted.timestamp, adjusted.coords.speed * meterPerSecToMilePerHourC);
    } else {
        return; // dont recheck mounting if speed null
    }


    mounting: {
        if (rawGPSarr.length < 3) {
            debugTableAdd(`GPS Mount`, `waiting gps len:${rawGPSarr.length}`, undefined, debugTable, debugTableCleanup);
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
            

            pathAccuracy += pointAccuracy;
        }
        pathAccuracy /= gpsSubSec.length
        // if beyond here: moving realtively straight, relatively flat
        // debugTableAdd(`GPS Mount`, `path acc ${pathAccuracy.toFixed(2)}`, undefined, debugTable, debugTableCleanup);
        // set down vector
        const firstAccITX = smoothACCarr.findIndex(obj => obj.timestamp >= gpsFirst.timestamp - gpsOffset);
        const lastAccITX = smoothACCarr.findIndex(obj => obj.timestamp >= gpsLast.timestamp - gpsOffset);
        
        if ( (lastAccITX - firstAccITX) < 30) { // should be ~ accIntervalHz * gps len - 1
            debugTableAdd(`GPS Mount`, `smoothAccArr ITX len break - last:${lastAccITX} first:${firstAccITX}`, undefined, debugTable, debugTableCleanup);
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
            debugTableAdd(`GPS Mount`, `Down Vec init x:${downVec.x.toFixed(2)} y:${downVec.y.toFixed(2)} z:${downVec.z.toFixed(2)}`, undefined, debugTable, debugTableCleanup);
        } else {
            
            // check if down is flat out better
            const downVecWeights = { gpsQual:1, rotationQual:1, pointAmt:.1 };
            
            // const potBal = propertyBalance(potentialDown, downVecWeights) + potentialDown.timestampPoints[potentialDown.timestampPoints.length-1]/10000;
            // const curBal = propertyBalance(downVec, downVecWeights) + downVec.timestampPoints[downVec.timestampPoints.length-1]/10000;
            
            // if (potBal === null || curBal === null) {
            //     //something went very very wrong
            //     window.alert("Null balance - this shouldn't be possible");
            // } else if (potBal < curBal) {
            //     downVec = potentialDown;
            // }
            
            // high qual but not same == mount changed / moved
            // at small angle differences 1deg dif ~0.175 dist - not linear completely but at small angle differences the distances scale effectively linearly
            if ( (propertyBalance(potentialDown, downVecWeights) < propertyBalance(downVec, downVecWeights)) ) {
                downVec = potentialDown;
                debugTableAdd(`GPS Mount`, `New Down Vec x:${downVec.x.toFixed(2)} y:${downVec.y.toFixed(2)} z:${downVec.z.toFixed(2)}`, undefined, debugTable, debugTableCleanup);
            }
        }
        
        // ACCOUNT FOR GPS ACCEL TO FIND STUFF - - - -

        const forwardVecAccThres = 1.5;
        const forwardVecMinPoints = 20;
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
                let potentialForward = { x:0, y:0, z:0, gDif:0, rotationQual:0, timestampPoints:[smoothACCarr[l].timestamp, smoothACCarr[r].timestamp], pointAmt:r-l, gpsSpdInc:0 };
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
                    debugTableAdd(`GPS Mount`, `Forward Vec init x:${forwardVec.x.toFixed(2)} y:${forwardVec.y.toFixed(2)} z:${forwardVec.z.toFixed(2)}`, undefined, debugTable, debugTableCleanup);
                    l=r;
                    continue;
                }

                const forwardVecWeights = { gDif:5, rotationQual:1, pointAmt:-1 };
                const timeDifBonus = (potentialForward.timestampPoints[1] - forwardVec.timestampPoints[1]) / 10000; // using newer data: 10sec = 1 weight
                if (propertyBalance(potentialForward, forwardVecWeights) - timeDifBonus < propertyBalance(forwardVec, forwardVecWeights)) {
                    forwardVec = potentialForward;
                    debugTableAdd(`GPS Mount`, `New Forward Vec x:${forwardVec.x.toFixed(2)} y:${forwardVec.y.toFixed(2)} z:${forwardVec.z.toFixed(2)}`, undefined, debugTable, debugTableCleanup);
                }
                l = r;
            } else {
                l++;
            }
        }

        mountingMatrix = makeMountMatrix(downVec, forwardVec);
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

// - - - - Basic Replayer - - - - 
const replayFileSelector = document.getElementById("replayUpload");
let currentReplayId = 0; // increments for each new replay & reset to live

function startReplay(fileGPSarr, fileACCarr) {
    replayMode = true;
    const replayId = ++currentReplayId;
    const replayInitTime = Date.now();

    function loop() {
        if (replayId !== currentReplayId) return; // stop for new file

        const curReplayTime = Date.now() - replayInitTime;

        const nextGPS = fileGPSarr[0];
        const nextACC = fileACCarr[0];

        // maintain order between GPS & ACC
        if (nextGPS && (!nextACC || nextGPS.timestamp <= nextACC.timestamp)) {
            if (nextGPS.timestamp <= curReplayTime) {
                gpsHandler(fileGPSarr.shift());
            }
        } else if (nextACC) {
            if (nextACC.timestamp <= curReplayTime) {
                accelHandler(fileACCarr.shift());
            }
        }

        if (fileGPSarr.length || fileACCarr.length) {
            requestAnimationFrame(loop);
        }
    }
    requestAnimationFrame(loop);
}

function initReplayFromData(jsonData) {
    const options = jsonData.Options;
    const fileGPSarr = [...jsonData.rawGPSarr];
    const fileACCarr = [...jsonData.rawACCarr];

    // reset live / prev modified
    accIntervalHZ = options.accIntervalHZ;
    downVec = { x:0, y:-9.8, z:0, gpsQual:10000, rotationQual:1000, timestampPoints:null, pointAmt:null};
    forwardVec = { x:0, y:0, z:-3, gDif:20, rotationQual:1000, timestampPoints:null, pointAmt:1, gpsSpdInc: 0};
    mountingMatrix = makeMountMatrix(downVec, forwardVec);
    startingTimeStamp = options.startingTimeStamp;
    debugChartSetData(debugMotionAcc, 0, []);debugChartSetData(debugMotionAcc, 1, []);debugChartSetData(debugMotionAcc, 2, []);
    debugChartSetData(debugMotionRot, 0, []);debugChartSetData(debugMotionRot, 1, []);debugChartSetData(debugMotionRot, 2, []);
    debugChartSetData(debugSpeed, 0, []);debugChartSetData(debugSpeed, 1, []);
    debugChartSetData(debugInclineRoll, 0, []);debugChartSetData(debugInclineRoll, 1, []);debugChartSetData(debugInclineRoll, 2, []);

    startReplay(fileGPSarr, fileACCarr);
}

basicReplayer: {
    if (!replayFileSelector) {
        alert("replayFileSelector Null");
        break basicReplayer;
    }

    replayFileSelector.addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (!file) { alert("file issue"); return; }

        if (pairButton.textContent == "Un-Pair") {
            pairButton.click();
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const jsonData = JSON.parse(e.target.result);
                console.log("data", jsonData);
                initReplayFromData(jsonData);
            } catch (err) {
                alert(`invalid JSON file :${err}`);
            }
        };
        reader.readAsText(file);
    });
}






debugTableAdd("JS main", "EOF main.js", undefined, debugTable, debugTableCleanup);
