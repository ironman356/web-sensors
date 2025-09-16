// disabled @ts-check v4

// TODO : test structured copy in parts

await new Promise(resolve => {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", resolve);
    } else {
        resolve(); // already loaded
    }
});

import { pairOrientation, removeOrientation, pairMotion, removeMotion, pairGPS, removeGPS } from "./pairing.js";
import { debugChartInit, startDebugCamera, debugTableAdd } from "./debug.js";
import { pointToLineDist, getGravity, addVectors, xyzMagnitude, xyzDistance, xyzToMatrix, matrixToXYZ, makeMountMatrix, matrixTranspose, applyRotationMatrix, radToDeg } from "./math.js";
import { AdaptiveKalman, ExponentialSmooth } from "./filter.js";
import { generateSmoothedAcc, updateSmoothedAcc } from "./objs/smoothedAccs.js"
document.addEventListener("DOMContentLoaded", () => {});
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('wheel', e => e.preventDefault(), { passive: false });

const pairButton = document.getElementById("pairButton");
const saveButton = document.getElementById("saveRecordedButton");

// "final" items
const calcSpeedEl = document.getElementById("calcSpeed");
const calcHeadingEl = document.getElementById("calcHeading");
const horsepowerEl = document.getElementById("horsepower");
const tractionCircleEl = document.getElementById("tractionCircle");

const replayProgress = {
    progressBar: document.getElementById("replayProgress"),
    textValue: document.getElementById("replayProgressSpanValue"),
    maxValue: document.getElementById("replayProgressSpanMax")
};
replayProgress.maxValue
let replayMode = false;
let debugMode = false;

const debugTableCleanup = 10 * 1000;
const debugTable = document.getElementById("debugLedger");
const debugTableAcc = 3;

document.getElementById("pairCamera")?.addEventListener("click", () => startDebugCamera("debugCamera"));

let calcSpeed = 0;
const meterPerSecToMilePerHourC = 2.236936;

let smoothingSelection = "exp";
const smoothingOptions = {
    "exp": ExponentialSmooth
};
let smoothingSelectionVars = {
    "exp": {alpha:0.1}
};


const rawGPSarr = [];
const rawACCarr = [];
const smoothACCarr = [];
const calcSpdArr = [];

let accIntervalHZ = null;
let mountingMatrix = null;


/** @typedef {{ x:number, y:number, z:number, setupQual:number|null, runningQual:number }} downVec */
/** @type {downVec} */
let downVec = { x:0, y:-1, z:0, setupQual:null, runningQual:1 };

/**@typedef {{ x:number, y:number, z:number, setupQual:number|null, runningQual:number }} forwardVec*/
/** @type {forwardVec} */
let forwardVec = { x:0, y:0, z:-1, setupQual:null, runningQual:1 };

mountingMatrix = makeMountMatrix(downVec, forwardVec);

const debugMotionAcc = debugChartInit("debugMotionAcc", ["x", "y", "z"], "v m/s");
const debugMotionRot = debugChartInit("debugMotionRot", ["x", "y", "z"], "v deg/s");
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

        if (pages[desired] == "Debug") {
            debugMotionAcc.resize();
            debugMotionRot.resize();
            debugSpeed.resize();
            debugInclineRoll.resize();
        }
    }
    nextButtonEl.addEventListener("click", () => changePage(curPage, curPage+1));
    prevButtonEl.addEventListener("click", () => changePage(curPage, curPage-1));
    changePage(0,0); // inital setup

    window.addEventListener("resize", () => {
        debugMotionAcc.resize();
        debugMotionRot.resize();
        debugSpeed.resize();
        debugInclineRoll.resize();
    });



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
document.getElementById("showAll").addEventListener("click", () => {
    for (const e of pages) { document.getElementById(e).style.display = 'grid'; }
    debugMode = !debugMode;
    window.dispatchEvent(new Event("resize")); // trigger resize for hidden graphs
});





const smoothACCmethod = generateSmoothedAcc(smoothingOptions[smoothingSelection], smoothingSelectionVars[smoothingSelection]);


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


    const smoothACC = updateSmoothedAcc(smoothACCmethod, rawACC);
    smoothACCarr.push(smoothACC);


    document.getElementById("ACCtemp").innerText = JSON.stringify(smoothACCarr[smoothACCarr.length - 1], null, 2);


    if (mountingMatrix === null) {
        alert("null mounting matrix");
        return;
    }
    const grav = getGravity(smoothACC);
    const grav_deviation = applyRotationMatrix(matrixTranspose(mountingMatrix), xyzToMatrix(grav));
    const curPitch = radToDeg(Math.atan2(-grav_deviation[1], grav_deviation[2]));
    const curRoll = radToDeg(Math.atan2(-grav_deviation[0], grav_deviation[2]));

    const vehicleAccMat = applyRotationMatrix(matrixTranspose(mountingMatrix), xyzToMatrix(smoothACC.acceleration));
    const vehicleRotMat = applyRotationMatrix(matrixTranspose(mountingMatrix), xyzToMatrix(smoothACC.rotationRate));
 
    const vehicleAcc = matrixToXYZ(vehicleAccMat);
    const vehicleRot = matrixToXYZ(vehicleRotMat);
    
    vehicleAcc.x = -vehicleAcc.x;   // sesnsor to motion conversion
    vehicleAcc.y = -vehicleAcc.y;
    vehicleAcc.z = -vehicleAcc.z;

    // adjusting running qual in strict conditions for now -> can later make qual difs scale proportional to how good the conditions are
    if (flatSection.straightQual !== null && flatSection.straightQual < 1.5) {

        // base off points gpsOffset ago, not current b/c thats what flatSec is in relation to
        const pastACC = smoothACCarr.find(obj => obj.timestamp >= smoothACC.timestamp - gpsOffset);

        if (xyzDistance(xyzNormalize(getGravity(pastACC)), downVec) > 0.04) {
            downVec.runningQual *= 1.01;
        }
        else {
            if (downVec.runningQual > 1) {
                downVec.runningQual -= 0.01;
            }
        }

        if (xyzMagnitude(pastACC.acceleration) > 0.3 && xyzMagnitude(pastACC.rotationRate) < 20) {
            // accel / breaking straight
            const forwBackDist = Math.min(  xyzDistance(xyzNormalize(vehicleAcc), {x:0,y:1,z:0}),   xyzDistance(xyzNormalize(vehicleAcc), {x:0,y:-1,z:0})  );
            if ( forwBackDist > 0.04 ) {
                forwardVec.runningQual *= 1.01;
            }
            else {
                if (forwardVec.runningQual > 1) {
                    forwardVec.runningQual -= 0.01;
                }
            }
        }
    }
    
    if (pages[curPage] == "Debug" || debugMode) {
        debugInclineRoll.pushData(0, smoothACC.timestamp, curPitch); // debugChartPushData(debugInclineRoll, 0, smoothACC.timestamp, curPitch);
        debugInclineRoll.pushData(1, smoothACC.timestamp, 0); // debugChartPushData(debugInclineRoll, 1, smoothACC.timestamp, 0); //  0 for reference line
        debugInclineRoll.pushData(2, smoothACC.timestamp, curRoll); // debugChartPushData(debugInclineRoll, 2, smoothACC.timestamp, curRoll);

        debugMotionAcc.pushData(0, smoothACC.timestamp, vehicleAcc.x); // debugChartPushData(debugMotionAcc, 0, smoothACC.timestamp, vehicleAcc.x);
        debugMotionAcc.pushData(1, smoothACC.timestamp, vehicleAcc.y); // debugChartPushData(debugMotionAcc, 1, smoothACC.timestamp, vehicleAcc.y);
        debugMotionAcc.pushData(2, smoothACC.timestamp, vehicleAcc.z); // debugChartPushData(debugMotionAcc, 2, smoothACC.timestamp, vehicleAcc.z);

        debugMotionRot.pushData(0, smoothACC.timestamp, vehicleRot.x); // debugChartPushData(debugMotionRot, 0, smoothACC.timestamp, vehicleRot.x);
        debugMotionRot.pushData(1, smoothACC.timestamp, vehicleRot.y); // debugChartPushData(debugMotionRot, 1, smoothACC.timestamp, vehicleRot.y);
        debugMotionRot.pushData(2, smoothACC.timestamp, vehicleRot.z); // debugChartPushData(debugMotionRot, 2, smoothACC.timestamp, vehicleRot.z);
    }

    // TODO : remove once rough constants set - debug table should still give some rough idea 
    document.getElementById("downVecSetup").textContent = downVec.setupQual?.toFixed(debugTableAcc);
    document.getElementById("downVecRunning").textContent = downVec.runningQual?.toFixed(debugTableAcc);
    document.getElementById("forwVecSetup").textContent = forwardVec.setupQual?.toFixed(debugTableAcc);
    document.getElementById("forwVecRunning").textContent = forwardVec.runningQual?.toFixed(debugTableAcc);
    document.getElementById("straightQual").textContent = flatSection.straightQual?.toFixed(debugTableAcc);
    
    
    calcSpd: {
        calcSpeed += ((vehicleAcc.y * meterPerSecToMilePerHourC) / accIntervalHZ);
        
        if (rawGPSarr.length >= 1) {
            const lastGPS = rawGPSarr.at(-1);
            const gpsTime = lastGPS.timestamp - gpsOffset;
            
            const idx = calcSpdArr.findIndex(p => p.timestamp > gpsTime); // no need to account for accInterval ass when triggered latest gps will always be < latest accel / calcSpd
            
            const timeSinceGPS = smoothACC.timestamp - startingTimeStamp - lastGPS.timestamp; // not using date.now for replayer -> dif should only be a few millis
            
            // if gps < min time -> nudge calc by gps,calc dist @ factor/sec
            const calcSpdCorrectionFactor = 0.10; // closing rate of dif between gps and accel data /second
            const calcSpdCorrectionMinTime = 1500; // min recency of gps data for correction factor in millis
            
            if (idx >= 0 && timeSinceGPS < calcSpdCorrectionMinTime) { // only apply correction if there is relevent data
                const estSpeedAtGPS = calcSpdArr[idx].speed;
                const gpsSpeed = lastGPS.coords.speed * meterPerSecToMilePerHourC;
                const diff = gpsSpeed - estSpeedAtGPS;
                
                calcSpeed += (diff / accIntervalHZ) * calcSpdCorrectionFactor;
            }
        }
        calcSpeedEl.textContent = calcSpeed.toFixed(0);
        calcSpdArr.push({ timestamp: smoothACC.timestamp, speed: calcSpeed });
        debugSpeed.pushData(1, smoothACC.timestamp, calcSpeed); //debugChartPushData(debugSpeed, 1, smoothACC.timestamp, calcSpeed);
    }

    
    // tractionCircleEl
    // function updateTractionCircle(tractionCircleRef, acc, pitch, roll, settings) {}

    // function updateLeafletMap
    // map.flyTo() based on expected location in 1 second?

    // debugTableAdd(`ACC Handler`, `smoothAcc len:${smoothACCarr.length}`, undefined, debugTable, debugTableCleanup);


}


const flatSection = { Lidx:0, straightQual:null };
function gpsHandler(position) {
    // console.log(position);
    const origForwardVec = JSON.stringify(forwardVec);
    const origDownVec = JSON.stringify(downVec);

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
    
    const minSetSpd = 10 / meterPerSecToMilePerHourC;

    // baseline reset as new qual needs to be calc'd to include newest gps point
    flatSection.straightQual = null;
    if ( adjusted.coords.speed == null ) {
        flatSection.Lidx = rawGPSarr.length; // reseting idx in case of intermitten null spds
        return;
    } else if (adjusted.coords.speed < minSetSpd) {
        flatSection.Lidx = rawGPSarr.length;
    }
    rawGPSarr.push(adjusted);
    debugSpeed.pushData(0, adjusted.timestamp, adjusted.coords.speed * meterPerSecToMilePerHourC); // debugChartPushData(debugSpeed, 0, adjusted.timestamp, adjusted.coords.speed * meterPerSecToMilePerHourC);

    // adjust flat section
    let potLitx = flatSection.Lidx;
    let potFlatEnum = rawGPSarr.slice(potLitx);

    if (potFlatEnum.length < 3) {
        // debugTableAdd(`GPS`, `waiting on potFlatEnum len:${potFlatEnum.length}`, undefined, debugTable, debugTableCleanup);
        return;
    }
    do {
        let potFlatQual = 1;
        
        for (const entry of potFlatEnum) {
            const coords = entry.coords;
            let coordsAcc = 1;

            // coordsAcc *= Math.max(1, coords.accuracy / 2);
            // coordsAcc *= Math.max(1, coords.altitudeAccuracy / 3);
            // const altDif = Math.abs(adjusted.coords.altitude - coords.altitude); // will be 0 on last
            // coordsAcc *= Math.max(1, (altDif * 20 / coords.speed) ** 2);
            // const latDif = pointToLineDist(rawGPSarr[potLitx].coords, coords, adjusted.coords); // will be 0 on 1st/last
            // coordsAcc *= Math.max(1, (latDif * 10 / coords.speed) ** 2);
            coordsAcc *= coords.accuracy / 2;
            coordsAcc *= coords.altitudeAccuracy / 3;
            const altDif = Math.abs(adjusted.coords.altitude - coords.altitude); // will be 0 on last
            coordsAcc *= Math.max(1, (altDif * 20 / coords.speed) ** 2);
            const latDif = pointToLineDist(rawGPSarr[potLitx].coords, coords, adjusted.coords); // will be 0 on 1st/last
            coordsAcc *= Math.max(1, (latDif * 10 / coords.speed) ** 2);

            potFlatQual += coordsAcc;
        }
        potFlatQual /= (rawGPSarr.length - potLitx - 2);


        if (flatSection.straightQual == null || potFlatQual < flatSection.straightQual) {
            flatSection.Lidx = potLitx;
            flatSection.straightQual = potFlatQual;
        }
        potLitx++;
        potFlatEnum = rawGPSarr.slice(potLitx);
    } while (potFlatEnum.length >= 3)

    // console.log(flatSection.straightQual);


    mounting: {
        // if beyond here: moving realtively straight, relatively flat
        // set down vector
        const firstAccITX = smoothACCarr.findIndex(obj => obj.timestamp >= rawGPSarr[flatSection.Lidx].timestamp - gpsOffset);
        const lastAccITX = smoothACCarr.findIndex(obj => obj.timestamp >= rawGPSarr.at(-1).timestamp - gpsOffset);
        const itxTimeSpan = (rawGPSarr.at(-1).timestamp - rawGPSarr[flatSection.Lidx].timestamp) / 1000;
        if ( (lastAccITX - firstAccITX) < accIntervalHZ * itxTimeSpan / 1.34) { // should be ~ accIntervalHz * gps len - 1
            debugTableAdd(`GPS Mount`, `smoothAccArr ITX len break - last:${lastAccITX} first:${firstAccITX}`, undefined, debugTable, debugTableCleanup);
            break mounting;
        }
        
        /** @type {downVec} */
        let potentialDown = { x:0, y:0, z:0, setupQual:0, runningQual:1 }; // point amt not setup b/c gps still static 3 point
        
        for ( let i = firstAccITX; i <= lastAccITX; i++ ) {
            const grav = getGravity(smoothACCarr[i]);
            addVectors(potentialDown, grav); // potentialdown += gravity (xyz)
            potentialDown.setupQual += xyzMagnitude(smoothACCarr[i].rotationRate) ** 2 ;
        }
        const potentialDownAvgNorm = xyzNormalize(potentialDown);
        potentialDown.x = potentialDownAvgNorm.x;
        potentialDown.y = potentialDownAvgNorm.y;
        potentialDown.z = potentialDownAvgNorm.z;
        
        potentialDown.setupQual /= (lastAccITX-firstAccITX) * 10;
        if (Math.random() < 1/60) {
            debugTableAdd(`GPS Mount`, `Down Vec rotation: ${potentialDown.setupQual.toFixed(debugTableAcc)} gps: ${flatSection.straightQual.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
        }
        potentialDown.setupQual += flatSection.straightQual;

        if (downVec.setupQual === null) {
            downVec = potentialDown;
            debugTableAdd(`GPS Mount`, `init Down Vec x:${downVec.x.toFixed(debugTableAcc)} y:${downVec.y.toFixed(debugTableAcc)} z:${downVec.z.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
        } 
        else if (potentialDown.setupQual < downVec.setupQual * .9) {
            downVec = potentialDown;
            debugTableAdd(`GPS Mount`, `better setup Down Vec x:${downVec.x.toFixed(debugTableAcc)} y:${downVec.y.toFixed(debugTableAcc)} z:${downVec.z.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
        }
        else if (downVec.runningQual > 100) {
            potentialDown.setupQual *= 1.2 // intentionally worse setupqual as running override will likely not have ideal setup on first try
            downVec = potentialDown;
            debugTableAdd(`GPS Mount`, `running reset Down Vec x:${downVec.x.toFixed(debugTableAcc)} y:${downVec.y.toFixed(debugTableAcc)} z:${downVec.z.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
        }

            
        
        // set forward vec
        const forwardVecMinAcc = 0.5; // m/s^2

        // 2ptr biggest acceleration in flatSection via sliding window
        let finalL = 0, finalR = 0, finalLen = 0;
        let tempLen = 0;
        for (let l = flatSection.Lidx; l < rawGPSarr.length-1; l++) {
            if (rawGPSarr[l+1].coords.speed - rawGPSarr[l].coords.speed > forwardVecMinAcc * .6) { // not requiring full minAcc as acceleration might be for only a portion of its span 
                tempLen++;
                if (tempLen > finalLen) {
                    finalL = l - tempLen;
                    finalR = l;
                    finalLen = tempLen;
                }
            } else {
                tempLen = 0
            }
        }


        if ( finalLen <= 0 ) {
            break mounting;
        }
        const firstAccITXincGPS = smoothACCarr.findIndex(obj => obj.timestamp >= rawGPSarr[finalL].timestamp - gpsOffset);
        const lastAccITXincGPS = smoothACCarr.findIndex(obj => obj.timestamp >= rawGPSarr[finalR].timestamp - gpsOffset);
        
        /** @type {forwardVec} */
        let potentialForward = { x:0, y:0, z:0, setupQual:0, runningQual:1 };
        
        const rawCopySmoothACCarr = smoothACCarr.slice(firstAccITXincGPS, lastAccITXincGPS);
        const smoothACCmeetsMinAcc = rawCopySmoothACCarr.filter(obj => xyzMagnitude(obj.acceleration) >= forwardVecMinAcc); // keep points >= minAcc
        // TODO?: remove points w/ too much rotation..?
        for (const acc of smoothACCmeetsMinAcc) {
            potentialForward.x += acc.acceleration.x;
            potentialForward.y += acc.acceleration.y;
            potentialForward.z += acc.acceleration.z;
            potentialForward.setupQual += xyzMagnitude(acc.rotationRate) ** 2 ;
        }
        if (xyzMagnitude(potentialForward) == 0) {
            break mounting;
        }
        const meetsMinAccAvgNorm = xyzNormalize(potentialForward);
        potentialForward.x = meetsMinAccAvgNorm.x;
        potentialForward.y = meetsMinAccAvgNorm.y;
        potentialForward.z = meetsMinAccAvgNorm.z;
        
        let distFromAvgFactor = 0;
        for (const acc of smoothACCmeetsMinAcc) {
            distFromAvgFactor += xyzDistance(xyzNormalize(acc.acceleration), meetsMinAccAvgNorm) ** 0.5 ; // .5 b/c range == 0-1
        }
        distFromAvgFactor /= smoothACCmeetsMinAcc.length;

        let forwardGPSstraightQual = 1;
        for (const entry of rawGPSarr.slice(finalL, finalR)) {
            const coords = entry.coords;
            let coordsAcc = 1;

            coordsAcc *= Math.max(1, coords.accuracy / 2);
            coordsAcc *= Math.max(1, coords.altitudeAccuracy / 3);
            //TODO: change altitude here to only account for inconsistent diferences, not net altitude - not an immediate problem but setupQual will be worse uphill/downhill when it doesn't really matter
            const altDif = Math.abs(adjusted.coords.altitude - coords.altitude);
            coordsAcc *= Math.max(1, altDif**2);
            const latDif = pointToLineDist(rawGPSarr[finalL].coords, coords, rawGPSarr[finalR].coords); // will be 0 on 1st/last rn
            coordsAcc *= Math.max(1, (latDif / coords.speed)**2);

            forwardGPSstraightQual += coordsAcc;
        }
        forwardGPSstraightQual /= (finalR - finalL - 2);

        potentialForward.setupQual /= (smoothACCmeetsMinAcc.length * 10);
        if (Math.random() < 1/60) {
            debugTableAdd(`GPS Mount`, `Forward vec rotation: ${potentialForward.setupQual.toFixed(debugTableAcc)} avgDist: ${distFromAvgFactor.toFixed(debugTableAcc)} gps: ${forwardGPSstraightQual.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
        }
        potentialForward.setupQual += forwardGPSstraightQual;
        potentialForward.setupQual += distFromAvgFactor;

        if (forwardVec.setupQual === null) {
            forwardVec = potentialForward;
            debugTableAdd(`GPS Mount`, `init Forward Vec x:${forwardVec.x.toFixed(debugTableAcc)} y:${forwardVec.y.toFixed(debugTableAcc)} z:${forwardVec.z.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
        } 
        else if (forwardVec.setupQual < forwardVec.setupQual * .9) {
            forwardVec = potentialForward;
            debugTableAdd(`GPS Mount`, `better setup Forward Vec x:${forwardVec.x.toFixed(debugTableAcc)} y:${forwardVec.y.toFixed(debugTableAcc)} z:${forwardVec.z.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
        }
        else if (forwardVec.runningQual > 100) {
            potentialForward.setupQual *= 1.2 // intentionally worse setupqual as running override will likely not have ideal setup on first try
            forwardVec = potentialForward;
            debugTableAdd(`GPS Mount`, `running reset Forward Vec x:${forwardVec.x.toFixed(debugTableAcc)} y:${forwardVec.y.toFixed(debugTableAcc)} z:${forwardVec.z.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
        }


    }
    if (origForwardVec !== JSON.stringify(forwardVec) || origDownVec !== JSON.stringify(downVec)) {
        // debugTableAdd(`Mounting Matrix`, `new Mounting matrix made`, undefined, debugTable, debugTableCleanup);
        mountingMatrix = makeMountMatrix(downVec, forwardVec);
    }
}

// move to math once working
function xyzNormalize(obj) {
    const denominator = xyzMagnitude(obj);
    return {
        x: obj.x / denominator,
        y: obj.y / denominator,
        z: obj.z / denominator,
    };
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
replayUpload.value = "";
let currentReplayId = 0; // increments for each new replay & reset to live

function startReplay(fileGPSarr, fileACCarr, speedScale = 1.0) {
    replayMode = true;
    const replayId = ++currentReplayId;

    const skipStart = 50; //seconds

    const replayStart = performance.now() - skipStart * 1000;

    function loop() {
        if (replayId !== currentReplayId) return;

        const elapsed = performance.now() - replayStart / speedScale;
        const curReplayTime = elapsed * speedScale;

        let processed = 0;
        const MAX_PER_FRAME = 30000000;

        while (processed < MAX_PER_FRAME &&
               ((fileGPSarr.length && fileGPSarr[0].timestamp <= curReplayTime) ||
                (fileACCarr.length && fileACCarr[0].timestamp <= curReplayTime))) {

            const nextGPS = fileGPSarr[0];
            const nextACC = fileACCarr[0];

            if (!nextACC || (nextGPS && nextGPS.timestamp <= nextACC.timestamp)) {
                gpsHandler(fileGPSarr.shift());
            } else {
                accelHandler(fileACCarr.shift());
            }

            processed++;
        }

        if (fileGPSarr.length || fileACCarr.length) {
            const ts = Number(rawACCarr.at(-1)?.timestamp ?? 0);
            replayProgress.progressBar.value = isFinite(ts) ? ts : 0;
            replayProgress.textValue.textContent = milliToStrTime(isFinite(ts) ? ts : 0);

            requestAnimationFrame(loop);
        } else {
            console.log("Replay finished");
        }
    }

    requestAnimationFrame(loop);
}


function initReplayFromData(jsonData, speedScale = 1.0) {
    const options = jsonData.Options;
    const fileGPSarr = [...jsonData.rawGPSarr];
    const fileACCarr = [...jsonData.rawACCarr];
    
    // reset live / previous modified state
    rawGPSarr.length = 0;
    rawACCarr.length = 0;
    smoothACCarr.length = 0;
    calcSpdArr.length = 0;
    accIntervalHZ = options.accIntervalHZ;
    downVec = { x:0, y:-1, z:0, setupQual:null, runningQual:1 };
    forwardVec = { x:0, y:0, z:-1, setupQual:null, runningQual:1 };
    mountingMatrix = makeMountMatrix(downVec, forwardVec);
    startingTimeStamp = options.startingTimeStamp;

    replayProgress.progressBar.max = fileACCarr.at(-1)?.timestamp;
    replayProgress.maxValue.textContent = milliToStrTime(fileACCarr.at(-1)?.timestamp);

    // clear debug charts
    debugMotionAcc.setData(0, []); debugMotionAcc.setData(1, []); debugMotionAcc.setData(2, []);
    debugMotionRot.setData(0, []); debugMotionRot.setData(1, []); debugMotionRot.setData(2, []);
    debugSpeed.setData(0, []); debugSpeed.setData(1, []);
    debugInclineRoll.setData(0, []); debugInclineRoll.setData(1, []); debugInclineRoll.setData(2, []);

    startReplay(fileGPSarr, fileACCarr, speedScale);
}

basicReplayer: {
    if (replayFileSelector) {
        replayFileSelector.addEventListener('change', function(event) {
            const file = event.target.files[0];
            if (!file) return alert("file issue");

            if (pairButton.textContent === "Un-Pair") pairButton.click();

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const jsonData = JSON.parse(e.target.result);
                    initReplayFromData(jsonData, 1.0);
                } catch (err) {
                    alert(`invalid JSON file: ${err}`);
                }
            };
            reader.readAsText(file);
        });
    }
}

function milliToStrTime(milli) {
    if (isNaN(milli)) { return "_"; }

    let totalSeconds = Math.floor(milli / 1000);
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;
    const pad = n => String(n).padStart(2, "0");
    if (hours == 0) {
        return `${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

debugTableAdd("JS main", "EOF main.js", undefined, debugTable, debugTableCleanup);
