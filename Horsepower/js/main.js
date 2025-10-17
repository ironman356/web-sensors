// disabled @ts-check v4

// TODO : test structured copy in parts

import { pairOrientation, removeOrientation, pairMotion, removeMotion, pairGPS, removeGPS } from "./pairing.js";
import { debugChartInit, startDebugCamera, debugTableAdd } from "./debug.js";
import { pointToLineDist, getGravity, addVectors, xyzMagnitude, xyzDistance, xyzToMatrix, matrixToXYZ, makeMountMatrix, matrixTranspose, applyRotationMatrix, radToDeg } from "./math.js";
import { AdaptiveKalman, ExponentialSmooth } from "./filter.js";
import { generateSmoothedAcc, updateSmoothedAcc } from "./objs/smoothedAccs.js";
import { createTractionCircle } from "./tractionCircle.js";

// wait for dom to prevent some weird startup errors
await new Promise((resolve) => {
	if (document.readyState === "complete") resolve();
	else window.addEventListener("load", resolve);
});

// --- Manual vectors DOM elements & helpers ---
const manualEnableEl = document.getElementById("enableManualVectors");
const manualDownX = document.getElementById("manualVectorDownX");
const manualDownY = document.getElementById("manualVectorDownY");
const manualDownZ = document.getElementById("manualVectorDownZ");
const manualForwX = document.getElementById("manualVectorForwardX");
const manualForwY = document.getElementById("manualVectorForwardY");
const manualForwZ = document.getElementById("manualVectorForwardZ");

function getManualVectors() {
	// Coerce to numbers with fallback to current defaults
	const down = {
		x: Number(manualDownX?.value) || 0,
		y: Number(manualDownY?.value) || -1,
		z: Number(manualDownZ?.value) || 0,
	};
	const forward = {
		x: Number(manualForwX?.value) || 0,
		y: Number(manualForwY?.value) || 0,
		z: Number(manualForwZ?.value) || 1,
	};
	return { down, forward };
}

function isManualEnabled() {
	return !!(manualEnableEl && manualEnableEl.checked);
}

function applyManualVectorsOnce() {
	if (!manualEnableEl) return;
	if (!isManualEnabled()) return;
	const { down, forward } = getManualVectors();

	// Put manual vectors into the live downVec/forwardVec with setupQual=0 and disable runningQual changes
	downVec.x = down.x;
	downVec.y = down.y;
	downVec.z = down.z;
	downVec.setupQual = 0;
	downVec.runningQual = 0; // runningQual updates will be skipped while manual is enabled

	forwardVec.x = forward.x;
	forwardVec.y = forward.y;
	forwardVec.z = forward.z;
	forwardVec.setupQual = 0;
	forwardVec.runningQual = 0;

	// build mounting matrix once
	mountingMatrix = makeMountMatrix(downVec, forwardVec);

	// update live UI fields if present
	if (document.getElementById("downVecLiveX")) {
		document.getElementById("downVecLiveX").textContent = downVec.x.toFixed(debugTableAcc);
		document.getElementById("downVecLiveY").textContent = downVec.y.toFixed(debugTableAcc);
		document.getElementById("downVecLiveZ").textContent = downVec.z.toFixed(debugTableAcc);
	}
	if (document.getElementById("forwVecLiveX")) {
		document.getElementById("forwVecLiveX").textContent = forwardVec.x.toFixed(debugTableAcc);
		document.getElementById("forwVecLiveY").textContent = forwardVec.y.toFixed(debugTableAcc);
		document.getElementById("forwVecLiveZ").textContent = forwardVec.z.toFixed(debugTableAcc);
	}
}

function disableManualVectors() {
	// Re-enable automatic runningQual updates and set setupQual high so automatic calibration will prefer existing over immediate overwrite
	downVec.setupQual = 100;
	downVec.runningQual = 1;
	forwardVec.setupQual = 100;
	forwardVec.runningQual = 1;

	// Recompute mounting matrix from the current vectors (which might be the manual ones)
	mountingMatrix = makeMountMatrix(downVec, forwardVec);

	// Update UI displays for setup/running
	if (document.getElementById("downVecSetup")) document.getElementById("downVecSetup").textContent = downVec.setupQual?.toFixed(debugTableAcc);
	if (document.getElementById("forwVecSetup")) document.getElementById("forwVecSetup").textContent = forwardVec.setupQual?.toFixed(debugTableAcc);
	if (document.getElementById("downVecRunning")) document.getElementById("downVecRunning").textContent = downVec.runningQual?.toFixed(debugTableAcc);
	if (document.getElementById("forwVecRunning")) document.getElementById("forwVecRunning").textContent = forwardVec.runningQual?.toFixed(debugTableAcc);
}

// Listen for manual toggle changes
manualEnableEl?.addEventListener("change", () => {
	if (isManualEnabled()) {
		applyManualVectorsOnce();
		debugTableAdd("ManualVectors", "Manual vectors enabled - applied once", undefined, debugTable, debugTableCleanup);
	} else {
		disableManualVectors();
		debugTableAdd("ManualVectors", "Manual vectors disabled - re-enabled runningQual", undefined, debugTable, debugTableCleanup);
	}
});

// document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
// document.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });

const pairButtonEl = document.getElementById("pairButton");
const saveButton = document.getElementById("saveRecordedButton");

// "final" items
const calcSpeedEl = document.getElementById("calcSpeed");
const calcHeadingEl = document.getElementById("calcHeading");
const horsepowerEl = document.getElementById("horsepower");
const tractionCircleEl = document.getElementById("tractionCircle");

const tractionCir = createTractionCircle();
tractionCircleEl.addEventListener("click", () => {
	if (pairButtonEl.textContent === "Pair") pairButtonEl.click();
});

const replayProgress = {
	progressBar: document.getElementById("replayProgress"),
	textValue: document.getElementById("replayProgressSpanValue"),
	maxValue: document.getElementById("replayProgressSpanMax"),
};
replayProgress.maxValue;
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
	exp: ExponentialSmooth,
};
let smoothingSelectionVars = {
	exp: { alpha: 0.1 },
};

const rawGPSarr = [];
const rawACCarr = [];
const smoothACCarr = [];
const calcSpdArr = [];

let accIntervalHZ = null;
let mountingMatrix = null;

/** @typedef {{ x:number, y:number, z:number, setupQual:number|null, runningQual:number }} downVec */
/** @type {downVec} */
let downVec = { x: 0, y: -1, z: 0, setupQual: null, runningQual: 1 };

/**@typedef {{ x:number, y:number, z:number, setupQual:number|null, runningQual:number }} forwardVec*/
/** @type {forwardVec} */
let forwardVec = { x: 0, y: 0, z: 1, setupQual: null, runningQual: 1 };

// initialize mountingMatrix according to manual toggle or defaults
if (isManualEnabled()) {
	applyManualVectorsOnce();
} else {
	mountingMatrix = makeMountMatrix(downVec, forwardVec);
}

const debugMotionAcc = debugChartInit("debugMotionAcc", ["x", "y", "z"], "v m/s");
const debugMotionRot = debugChartInit("debugMotionRot", ["x", "y", "z"], "v deg/s");
const debugSpeed = debugChartInit("debugGraphSpeed", ["GPS", "CALC"], "Speed *MPH");
const debugInclineRoll = debugChartInit("debugIncRoll", ["Incline", "0", "Roll"], "Incline Roll°");

// make dynamic later?
const gpsOffsetEl = document.getElementById("gpsOffset");
let gpsOffset = Number(localStorage.getItem("gpsOffset")) || 500; // localStorage is mostly persistant - !=session
gpsOffsetEl.value = gpsOffset;
gpsOffsetEl.addEventListener("change", () => {
	gpsOffset = Number(gpsOffsetEl.value);
	localStorage.setItem("gpsOffset", gpsOffset);
});
// localStorage.setItem

let startingTimeStamp = Date.now(); // -> replayer currently can change this requiring refresh if going from replay -> live

// - - pairing sensors - -
let geoWatchId = null;
pairButtonEl.addEventListener("click", () => {
	// pair / enable everything
	if (pairButtonEl.textContent == "Pair") {
		replayMode = false;
		geoWatchId = pairGPS(gpsHandler, onGPSError);
		pairMotion(accelHandler);
		// pairOrientation(gyroHandler);
		pairButtonEl.textContent = "Un-Pair";
	}

	// un-pair / disable everything
	else {
		geoWatchId = removeGPS(geoWatchId);
		removeMotion(accelHandler);
		// removeOrientation(gyroHandler);
		pairButtonEl.textContent = "Pair";
	}
});

// - - save button - -
saveButton.addEventListener("click", () => {
	const jsonStr = JSON.stringify(
		{
			Options: {
				accIntervalHZ: accIntervalHZ,
				gpsOffset: gpsOffset,
				Weight: 0,
				DragCoef: 1,
				RollResistance: 2,
				FronalArea: 3,
				startingTimeStamp: startingTimeStamp,
			},
			rawGPSarr: rawGPSarr,
			rawACCarr: rawACCarr,
		},
		null,
		2
	); // 2 pretty, 0 compact

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
	const showAllBtn = document.getElementById("showAll");
	const togglesContainer = document.getElementById("pageToggles");

	function setVisiblePages() {
		for (const p of pages) {
			const el = document.getElementById(p);
			const box = document.getElementById(`toggle-${p}`);
			el.style.display = box.checked ? "grid" : "none";
		}
	}

	function ensureAtLeastOneVisible() {
		const visible = pages.filter((p) => getComputedStyle(document.getElementById(p)).display !== "none");
		if (visible.length === 0) changePage(curPage, curPage); // ensure one visible
	}

	function changePage(current, desired) {
		// hide all
		for (const p of pages) document.getElementById(p).style.display = "none";
		// cycle desired
		desired < 0 ? (curPage = desired + pages.length) : (curPage = desired % pages.length);
		document.getElementById(pages[curPage]).style.display = "grid";
		// sync checkboxes
		for (const p of pages) document.getElementById(`toggle-${p}`).checked = p === pages[curPage];

		curPageEl.textContent = pages[curPage];
		nextButtonEl.textContent = pages[(curPage + 1) % pages.length];
		prevButtonEl.textContent = pages[curPage - 1 < 0 ? curPage - 1 + pages.length : curPage - 1];

		if (pages[curPage] == "Debug") {
			debugMotionAcc.resize();
			debugMotionRot.resize();
			debugSpeed.resize();
			debugInclineRoll.resize();
		}
		tractionCir.resizeCanvas();
	}

	nextButtonEl.addEventListener("click", () => {
		changePage(curPage, curPage + 1);
	});
	prevButtonEl.addEventListener("click", () => {
		changePage(curPage, curPage - 1);
	});

	// Build checkboxes for each page
	for (const p of pages) {
		const label = document.createElement("label");
		const box = document.createElement("input");
		box.type = "checkbox";
		box.id = `toggle-${p}`;
		box.checked = p === pages[curPage];
		box.addEventListener("change", () => {
			setVisiblePages();
			ensureAtLeastOneVisible();
		});
		label.appendChild(box);
		label.append(" " + p);
		togglesContainer.appendChild(label);
	}

	// Show/Hide All
	showAllBtn.addEventListener("click", () => {
		const allHidden = pages.every((p) => getComputedStyle(document.getElementById(p)).display === "none");
		const allVisible = pages.every((p) => getComputedStyle(document.getElementById(p)).display !== "none");

		if (!allVisible) {
			for (const p of pages) {
				document.getElementById(p).style.display = "grid";
				document.getElementById(`toggle-${p}`).checked = true;
			}
			showAllBtn.textContent = "Hide Tabs";
			window.dispatchEvent(new Event("resize"));
		} else {
			for (const p of pages) {
				document.getElementById(p).style.display = "none";
				document.getElementById(`toggle-${p}`).checked = false;
			}
			changePage(curPage, curPage); // ensure 1 visible
			showAllBtn.textContent = "Show Tabs";
		}
	});

	const mq = window.matchMedia("(min-width: 1500px)");
	if (mq.matches) {
		setTimeout(() => showAllBtn.click(), 10);
	}

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
		requestAnimationFrame(() => topNav.classList.add("visible"));
		clearTimeout(hideTimeout);
		hideTimeout = setTimeout(() => {
			topNav.classList.remove("visible");
			setTimeout(() => topNav.classList.remove("showing"), 300);
		}, duration);
	}

	document.addEventListener("click", (e) => {
		if (topNav.contains(e.target)) return;
		if (e.target.tagName.toLowerCase() === "select") return;
		if (e.clientY < window.innerHeight / 5) showTopNav();
	});

	changePage(0, 0);
	showTopNav();
}

const smoothACCmethod = generateSmoothedAcc(smoothingOptions[smoothingSelection], smoothingSelectionVars[smoothingSelection]);

function accelHandler(event) {
	/**
	 * Think of the accelerometer as a spring-loaded mass measuring the springs length
	 */

	if (accIntervalHZ === null) {
		// saving seperate from arr to reduce save size
		// typical ~60hz -> this works for ~1-999hz      ios:seconds,android:millis between updates
		if (event.interval < 1) {
			accIntervalHZ = 1 / event.interval; // interval in seconds to hz
		} else {
			accIntervalHZ = 1000 / event.interval; // interval in millis to hz
		}
	}

	const rawACC = {
		timestamp: event.timeStamp || event.timestamp, // millis since loaded (not started)
		acceleration: {
			x: event.acceleration.x,
			y: event.acceleration.y,
			z: event.acceleration.z,
		}, // m/s^2 along axis xyz
		// accelerationIncludingGravity: event.accelerationIncludingGravity,
		rotationRate: {
			// rotation degrees/sec right-hand-rule
			x: event.rotationRate.alpha || event.rotationRate.x, // i know all 3 of these look wrong, it is correct when looking at testing
			y: event.rotationRate.beta || event.rotationRate.y, // or my phone is broken / accel&gyro mounted differently from specifications
			z: event.rotationRate.gamma || event.rotationRate.z,
		},
		accelerationIncludingGravity: {
			x: event.accelerationIncludingGravity.x,
			y: event.accelerationIncludingGravity.y,
			z: event.accelerationIncludingGravity.z,
		},
	};
	rawACCarr.push(rawACC);

	const smoothACC = updateSmoothedAcc(smoothACCmethod, rawACC);
	smoothACCarr.push(smoothACC);

	if (mountingMatrix === null) {
		alert("null mounting matrix");
		return;
	}
	const grav = getGravity(smoothACC);
	const grav_deviation = applyRotationMatrix(matrixTranspose(mountingMatrix), xyzToMatrix(grav));
	// console.log(grav_deviation);
	const gx = grav_deviation[0];
	const gy = grav_deviation[1];
	const gz = grav_deviation[2];

	const curPitch = radToDeg(Math.atan2(gy, -gz));
	const curRoll = radToDeg(Math.atan2(-gx, -gz));

	const vehicleAccMat = applyRotationMatrix(matrixTranspose(mountingMatrix), xyzToMatrix(smoothACC.acceleration));
	const vehicleRotMat = applyRotationMatrix(matrixTranspose(mountingMatrix), xyzToMatrix(smoothACC.rotationRate));

	const vehicleAcc = matrixToXYZ(vehicleAccMat);
	const vehicleRot = matrixToXYZ(vehicleRotMat);

	vehicleAcc.x = -vehicleAcc.x; // sesnsor to motion conversion
	vehicleAcc.y = -vehicleAcc.y;
	vehicleAcc.z = -vehicleAcc.z;

	// adjusting running qual in strict conditions for now -> can later make qual difs scale proportional to how good the conditions are
	if (flatSection.straightQual !== null && flatSection.straightQual < 1.5) {
		// base off points gpsOffset ago, not current b/c thats what flatSec is in relation to
		const pastACC = smoothACCarr.find((obj) => obj.timestamp >= smoothACC.timestamp - gpsOffset);

		// Only update runningQual when manual vectors are NOT enabled
		if (!isManualEnabled()) {
			if (xyzDistance(xyzNormalize(getGravity(pastACC)), downVec) > 0.04) {
				downVec.runningQual *= 1.01;
			} else {
				if (downVec.runningQual > 1) {
					downVec.runningQual -= 0.01;
				}
			}
		}

		if (xyzMagnitude(pastACC.acceleration) > 0.3 && xyzMagnitude(pastACC.rotationRate) < 20) {
			// accel / breaking straight
			const forwBackDist = Math.min(xyzDistance(xyzNormalize(vehicleAcc), { x: 0, y: 1, z: 0 }), xyzDistance(xyzNormalize(vehicleAcc), { x: 0, y: -1, z: 0 }));
			if (!isManualEnabled()) {
				if (forwBackDist > 0.04) {
					forwardVec.runningQual *= 1.01;
				} else {
					if (forwardVec.runningQual > 1) {
						forwardVec.runningQual -= 0.01;
					}
				}
			}
		}
	}

	// if (pages[curPage] == "Debug" || debugMode) {
	if (true) {
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

	document.getElementById("downVecSetup").textContent = downVec.setupQual?.toFixed(debugTableAcc);
	document.getElementById("downVecRunning").textContent = downVec.runningQual?.toFixed(debugTableAcc);
	document.getElementById("forwVecSetup").textContent = forwardVec.setupQual?.toFixed(debugTableAcc);
	document.getElementById("forwVecRunning").textContent = forwardVec.runningQual?.toFixed(debugTableAcc);
	document.getElementById("straightQual").textContent = flatSection.straightQual ? flatSection.straightQual.toFixed(debugTableAcc) : "--";

	calcSpd: {
		calcSpeed += (vehicleAcc.y * meterPerSecToMilePerHourC) / accIntervalHZ;

		if (rawGPSarr.length >= 1) {
			const lastGPS = rawGPSarr.at(-1);
			const gpsTime = lastGPS.timestamp - gpsOffset;

			const idx = calcSpdArr.findIndex((p) => p.timestamp > gpsTime); // no need to account for accInterval ass when triggered latest gps will always be < latest accel / calcSpd

			const timeSinceGPS = smoothACC.timestamp - startingTimeStamp - lastGPS.timestamp; // not using date.now for replayer -> dif should only be a few millis

			// if gps < min time -> nudge calc by gps,calc dist @ factor/sec
			const calcSpdCorrectionFactor = 0.1; // closing rate of dif between gps and accel data /second
			const calcSpdCorrectionMinTime = 1500; // min recency of gps data for correction factor in millis

			if (idx >= 0 && timeSinceGPS < calcSpdCorrectionMinTime) {
				// only apply correction if there is relevent data
				const estSpeedAtGPS = calcSpdArr[idx].speed;
				const gpsSpeed = lastGPS.coords.speed * meterPerSecToMilePerHourC;
				const diff = gpsSpeed - estSpeedAtGPS;

				calcSpeed += (diff / accIntervalHZ) * calcSpdCorrectionFactor;
			}
		}
		calcSpeedEl.textContent = calcSpeed.toFixed(0);
		calcSpdArr.push({ timestamp: smoothACC.timestamp, speed: calcSpeed });
		debugSpeed.pushData(1, smoothACC.timestamp, calcSpeed);
	}

	tractionCir.updateDisplay(vehicleAcc, curPitch, curRoll);
}

const flatSection = { Lidx: 0, straightQual: null };
function gpsHandler(position) {
	// console.log(position);
	const origForwardVec = JSON.stringify(forwardVec);
	const origDownVec = JSON.stringify(downVec);

	const adjusted = {
		timestamp: replayMode ? position.timestamp : position.timestamp - startingTimeStamp, // adjusted from epoch to relative -> so only need to account for gpsOffset
		coords: {
			latitude: position.coords.latitude,
			longitude: position.coords.longitude,
			altitude: position.coords.altitude, // meters
			accuracy: position.coords.accuracy, // 95%ci m lateral
			altitudeAccuracy: position.coords.altitudeAccuracy, // 95%ci m vertical
			heading: position.coords.heading,
			speed: position.coords.speed, // m/s
		},
	};

	const heading = adjusted?.coords?.heading;
	calcHeadingEl.textContent = heading != null ? heading.toFixed(0) : "N/A";

	const minSetSpd = 10 / meterPerSecToMilePerHourC;

	// baseline reset as new qual needs to be calc'd to include newest gps point
	flatSection.straightQual = null;
	if (adjusted.coords.speed == null) {
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
			coordsAcc *= Math.max(1, ((altDif * 20) / coords.speed) ** 2);
			const latDif = pointToLineDist(rawGPSarr[potLitx].coords, coords, adjusted.coords); // will be 0 on 1st/last
			coordsAcc *= Math.max(1, ((latDif * 10) / coords.speed) ** 2);

			potFlatQual += coordsAcc;
		}
		potFlatQual /= rawGPSarr.length - potLitx - 2;

		if (flatSection.straightQual == null || potFlatQual < flatSection.straightQual) {
			flatSection.Lidx = potLitx;
			flatSection.straightQual = potFlatQual;
		}
		potLitx++;
		potFlatEnum = rawGPSarr.slice(potLitx);
	} while (potFlatEnum.length >= 3);

	// console.log(flatSection.straightQual);

	mounting: {
		// If manual vectors are enabled, apply them once and bypass the automatic mounting logic.
		if (isManualEnabled()) {
			// applyManualVectorsOnce already called on startup and on toggle, but ensure the manual vectors are applied here as well
			applyManualVectorsOnce();
			// skip the whole mounting block (we already built mountingMatrix from manual vectors)
			break mounting;
		}

		// if beyond here: moving realtively straight, relatively flat
		// set down vector
		const firstAccITX = smoothACCarr.findIndex((obj) => obj.timestamp >= rawGPSarr[flatSection.Lidx].timestamp - gpsOffset);
		const lastAccITX = smoothACCarr.findIndex((obj) => obj.timestamp >= rawGPSarr.at(-1).timestamp - gpsOffset);
		const itxTimeSpan = (rawGPSarr.at(-1).timestamp - rawGPSarr[flatSection.Lidx].timestamp) / 1000;
		if (lastAccITX - firstAccITX < (accIntervalHZ * itxTimeSpan) / 1.34) {
			// should be ~ accIntervalHz * gps len - 1
			debugTableAdd(`GPS Mount`, `smoothAccArr ITX len break - last:${lastAccITX} first:${firstAccITX}`, undefined, debugTable, debugTableCleanup);
			break mounting;
		}

		/** @type {downVec} */
		let potentialDown = { x: 0, y: 0, z: 0, setupQual: 0, runningQual: 1 };

		// const potDownVecList_debug = []

		for (let i = firstAccITX; i <= lastAccITX; i++) {
			const grav = getGravity(smoothACCarr[i]);
			addVectors(potentialDown, grav); // potentialdown += gravity (xyz)
			// potDownVecList_debug.push(grav);
			potentialDown.setupQual += xyzMagnitude(smoothACCarr[i].rotationRate) ** 2;
		}

		const potentialDownAvgNorm = xyzNormalize(potentialDown);
		potentialDown.x = potentialDownAvgNorm.x;
		potentialDown.y = potentialDownAvgNorm.y;
		potentialDown.z = potentialDownAvgNorm.z;

		potentialDown.setupQual /= (lastAccITX - firstAccITX) * 10;
		if (Math.random() < 1 / 60) {
			debugTableAdd(`GPS Mount`, `Down Vec rotation: ${potentialDown.setupQual.toFixed(debugTableAcc)} gps: ${flatSection.straightQual.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
		}
		potentialDown.setupQual += flatSection.straightQual;

		if (downVec.setupQual === null) {
			downVec = potentialDown;
			debugTableAdd(`GPS Mount`, `init Down Vec x:${downVec.x.toFixed(debugTableAcc)} y:${downVec.y.toFixed(debugTableAcc)} z:${downVec.z.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
			// console.log(potDownVecList_debug);
		} else if (potentialDown.setupQual < downVec.setupQual * 0.9) {
			downVec = potentialDown;
			debugTableAdd(`GPS Mount`, `better setup Down Vec x:${downVec.x.toFixed(debugTableAcc)} y:${downVec.y.toFixed(debugTableAcc)} z:${downVec.z.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
			// console.log(potDownVecList_debug);
		} else if (downVec.runningQual > 100) {
			potentialDown.setupQual *= 1.2; // intentionally worse setupqual as running override will likely not have ideal setup on first try
			downVec = potentialDown;
			debugTableAdd(`GPS Mount`, `running reset Down Vec x:${downVec.x.toFixed(debugTableAcc)} y:${downVec.y.toFixed(debugTableAcc)} z:${downVec.z.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
			// console.log(potDownVecList_debug);
		}

		// set forward vec
		const forwardVecMinAcc = 0.5; // m/s^2

		// 2ptr biggest acceleration in flatSection via sliding window
		let finalL = 0,
			finalR = 0,
			finalLen = 0;
		let tempLen = 0;
		for (let l = flatSection.Lidx; l < rawGPSarr.length - 1; l++) {
			if (rawGPSarr[l + 1].coords.speed - rawGPSarr[l].coords.speed > forwardVecMinAcc * 0.6) {
				// not requiring full minAcc as acceleration might be for only a portion of its span
				tempLen++;
				if (tempLen > finalLen) {
					finalL = l - tempLen;
					finalR = l;
					finalLen = tempLen;
				}
			} else {
				tempLen = 0;
			}
		}

		if (finalLen <= 0) {
			break mounting;
		}
		const firstAccITXincGPS = smoothACCarr.findIndex((obj) => obj.timestamp >= rawGPSarr[finalL].timestamp - gpsOffset);
		const lastAccITXincGPS = smoothACCarr.findIndex((obj) => obj.timestamp >= rawGPSarr[finalR].timestamp - gpsOffset);

		/** @type {forwardVec} */
		let potentialForward = { x: 0, y: 0, z: 0, setupQual: 0, runningQual: 1 };

		const potForwVecList_debug = [];

		const rawCopySmoothACCarr = smoothACCarr.slice(firstAccITXincGPS, lastAccITXincGPS);
		const smoothACCmeetsMinAcc = rawCopySmoothACCarr.filter((obj) => xyzMagnitude(obj.acceleration) >= forwardVecMinAcc); // keep points >= minAcc
		// TODO?: remove points w/ too much rotation..?
		for (const acc of smoothACCmeetsMinAcc) {
			potentialForward.x += acc.acceleration.x;
			potentialForward.y += acc.acceleration.y;
			potentialForward.z += acc.acceleration.z;
			potentialForward.setupQual += xyzMagnitude(acc.rotationRate) ** 2;
			potForwVecList_debug.push(acc.acceleration);
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
			distFromAvgFactor += xyzDistance(xyzNormalize(acc.acceleration), meetsMinAccAvgNorm) ** 0.5; // .5 b/c range == 0-1
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
			coordsAcc *= Math.max(1, altDif ** 2);
			const latDif = pointToLineDist(rawGPSarr[finalL].coords, coords, rawGPSarr[finalR].coords); // will be 0 on 1st/last rn
			coordsAcc *= Math.max(1, (latDif / coords.speed) ** 2);

			forwardGPSstraightQual += coordsAcc;
		}
		forwardGPSstraightQual /= finalR - finalL - 2;

		potentialForward.setupQual /= smoothACCmeetsMinAcc.length * 10;
		if (Math.random() < 1 / 60) {
			debugTableAdd(`GPS Mount`, `Forward vec rotation: ${potentialForward.setupQual.toFixed(debugTableAcc)} avgDist: ${distFromAvgFactor.toFixed(debugTableAcc)} gps: ${forwardGPSstraightQual.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
		}
		potentialForward.setupQual += forwardGPSstraightQual;
		potentialForward.setupQual += distFromAvgFactor;

		if (forwardVec.setupQual === null) {
			forwardVec = potentialForward;
			debugTableAdd(`GPS Mount`, `init Forward Vec x:${forwardVec.x.toFixed(debugTableAcc)} y:${forwardVec.y.toFixed(debugTableAcc)} z:${forwardVec.z.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
			console.log(potForwVecList_debug);
		} else if (potentialForward.setupQual < forwardVec.setupQual * 0.9) {
			forwardVec = potentialForward;
			debugTableAdd(`GPS Mount`, `better setup Forward Vec x:${forwardVec.x.toFixed(debugTableAcc)} y:${forwardVec.y.toFixed(debugTableAcc)} z:${forwardVec.z.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
			console.log(potForwVecList_debug);
		} else if (forwardVec.runningQual > 100) {
			potentialForward.setupQual *= 1.2; // intentionally worse setupqual as running override will likely not have ideal setup on first try
			forwardVec = potentialForward;
			debugTableAdd(`GPS Mount`, `running reset Forward Vec x:${forwardVec.x.toFixed(debugTableAcc)} y:${forwardVec.y.toFixed(debugTableAcc)} z:${forwardVec.z.toFixed(debugTableAcc)}`, undefined, debugTable, debugTableCleanup);
			console.log(potForwVecList_debug);
		}
	} // end of mounting

	if (origForwardVec !== JSON.stringify(forwardVec) || origDownVec !== JSON.stringify(downVec)) {
		document.getElementById("downVecLiveX").textContent = downVec.x.toFixed(debugTableAcc);
		document.getElementById("downVecLiveY").textContent = downVec.y.toFixed(debugTableAcc);
		document.getElementById("downVecLiveZ").textContent = downVec.z.toFixed(debugTableAcc);
		document.getElementById("forwVecLiveX").textContent = forwardVec.x.toFixed(debugTableAcc);
		document.getElementById("forwVecLiveY").textContent = forwardVec.y.toFixed(debugTableAcc);
		document.getElementById("forwVecLiveZ").textContent = forwardVec.z.toFixed(debugTableAcc);
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

function startReplay(fileGPSarr, fileACCarr, speedScale = 1.0, skipStart = 30) {
	replayMode = true;
	const replayId = ++currentReplayId;

	const replayStart = performance.now() - skipStart * 1000 - fileACCarr.at(0).timestamp; // timestamp for cases where pair time

	function loop() {
		if (replayId !== currentReplayId) return;

		const elapsed = performance.now() - replayStart / speedScale;
		const curReplayTime = elapsed * speedScale;

		let processed = 0;
		const MAX_PER_FRAME = 30000000;

		while (processed < MAX_PER_FRAME && ((fileGPSarr.length && fileGPSarr[0].timestamp <= curReplayTime) || (fileACCarr.length && fileACCarr[0].timestamp <= curReplayTime))) {
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

function initReplayFromData(jsonData, speedScale = 1.0, skipStart = 30) {
	const options = jsonData.Options;
	const fileGPSarr = [...jsonData.rawGPSarr];
	const fileACCarr = [...jsonData.rawACCarr];

	// reset live / previous modified state
	rawGPSarr.length = 0;
	rawACCarr.length = 0;
	smoothACCarr.length = 0;
	calcSpdArr.length = 0;
	accIntervalHZ = options.accIntervalHZ;

	// Respect manual toggle when initializing replay state:
	if (isManualEnabled()) {
		// apply manual to down/forward (setupQual 0, disable runningQual)
		const { down, forward } = getManualVectors();
		downVec = { x: down.x, y: down.y, z: down.z, setupQual: 0, runningQual: 0 };
		forwardVec = { x: forward.x, y: forward.y, z: forward.z, setupQual: 0, runningQual: 0 };
		mountingMatrix = makeMountMatrix(downVec, forwardVec);
	} else {
		downVec = { x: 0, y: -1, z: 0, setupQual: null, runningQual: 1 };
		forwardVec = { x: 0, y: 0, z: -1, setupQual: null, runningQual: 1 };
		mountingMatrix = makeMountMatrix(downVec, forwardVec);
	}

	startingTimeStamp = options.startingTimeStamp;
	gpsOffset = options.gpsOffset;

	replayProgress.progressBar.max = fileACCarr.at(-1)?.timestamp;
	replayProgress.maxValue.textContent = milliToStrTime(fileACCarr.at(-1)?.timestamp);

	// clear debug charts
	debugMotionAcc.setData(0, []);
	debugMotionAcc.setData(1, []);
	debugMotionAcc.setData(2, []);
	debugMotionRot.setData(0, []);
	debugMotionRot.setData(1, []);
	debugMotionRot.setData(2, []);
	debugSpeed.setData(0, []);
	debugSpeed.setData(1, []);
	debugInclineRoll.setData(0, []);
	debugInclineRoll.setData(1, []);
	debugInclineRoll.setData(2, []);

	startReplay(fileGPSarr, fileACCarr, speedScale, skipStart);
}

basicReplayer: {
	if (replayFileSelector) {
		replayFileSelector.addEventListener("change", function (event) {
			const file = event.target.files[0];
			if (!file) return alert("file issue");

			if (pairButtonEl.textContent === "Un-Pair") pairButtonEl.click();

			const reader = new FileReader();
			reader.onload = function (e) {
				try {
					const jsonData = JSON.parse(e.target.result);
					initReplayFromData(jsonData, 1.0, 300);
				} catch (err) {
					alert(`invalid JSON file: ${err}`);
				}
			};
			reader.readAsText(file);
		});
	}
}

function milliToStrTime(milli) {
	if (isNaN(milli)) {
		return "_";
	}

	let totalSeconds = Math.floor(milli / 1000);
	let hours = Math.floor(totalSeconds / 3600);
	let minutes = Math.floor((totalSeconds % 3600) / 60);
	let seconds = totalSeconds % 60;
	const pad = (n) => String(n).padStart(2, "0");
	if (hours == 0) {
		return `${pad(minutes)}:${pad(seconds)}`;
	}
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

debugTableAdd("JS main", "EOF main.js", undefined, debugTable, debugTableCleanup);
