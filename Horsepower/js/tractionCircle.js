export function createTractionCircle() {
	const canvas = document.getElementById("tractionCircle");
	if (!canvas) throw new Error("canvas #tractionCircle not found");
	const ctx = canvas.getContext("2d");

	// ---- constants ----
	const G_CONV = 9.80665;

	// ---- defaults ----
	const defaults = {
		tractionCirUnits: "mps",
		tractionCirEdgeAmt: 3,
		tractionCirDynamicEdge: false,
		tractionCirNumRings: 2,
		tractionCirNumReadouts: true,
		tractionCirNumDigits: 2,
		tractionCirNumPitchRoll: true,
		tractionCirNumVertical: true,
		tractionCirPitchRollLine: true,
		tractionCirNetReadout: true,
		tractionCirNumPastMarkers: 60,
		tractionCirMarkerScale: 3,
		tractionCirMarkerScaleInvert: false,
		tractionCirInvertVertical: false,
		tractionCirInvertHorizontal: false,
		tractionCirNumFontSize: 20,
		tractionCirNumColor: "#ffffff",
		tractionCirNumAlpha: 1,
		tractionCirMarkerSize: 20,
		tractionCirMarkerColor: "#ffffff",
		tractionCirMarkerAlpha: 1,
		tractionCirMarkerBorderSize: 3,
		tractionCirMarkerBorderColor: "#000000",
		tractionCirMarkerAlphaDecay: true,
		tractionCirMarkerCurrentColorEnabled: true,
		tractionCirMarkerCurrentColor: "#ff0000",
		tractionCirPitchRollSize: 4,
		tractionCirPitchRollColor: "#105710",
		tractionCirPitchRollAlpha: 1,
		tractionCirPitchRollWhitespace: 50,
		tractionCirRingSize: 4,
		tractionCirRingColor: "#ffffff",
		tractionCirRingAlpha: 0.33,
		tractionCirBaseColor: "#888888",
		tractionCirBaseAlpha: 0.2,
		tractionCirNumUpdateRate: 10,
		tractionCirNumEdgeRing: true,
	};

	// ---- state ----
	const inputs = {}; // loaded settings
	const trail = []; // historical markers
	const cachedNums = {
		topY: null,
		botY: null,
		leftX: null,
		rightX: null,
		topZ: null,
		pitch: null,
		roll: null,
		net: null,
	};
	let lastFrame = null;
	let showUnset = true; // draw UNSET on first render

	// ---- utilities ----
	const degToRad = (deg) => (deg * Math.PI) / 180;

	// convert #rgb, #rrggbb -> "r,g,b" (string without alpha)
	function hexToRgb(hex) {
		if (!hex) return "255,255,255";
		hex = String(hex).replace("#", "");
		if (hex.length === 3)
			hex = hex
				.split("")
				.map((c) => c + c)
				.join("");
		const n = parseInt(hex, 16);
		return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
	}

	// solve intersections of line (y = slope*x + yInt) with circle centered at (h,k)
	function getEndPoints(yInt, slope, [h, k], radius) {
		const A = 1 + slope ** 2;
		const B = -2 * h + 2 * slope * yInt - 2 * slope * k;
		const C = h ** 2 + yInt ** 2 + k ** 2 - radius ** 2 - 2 * yInt * k;
		const D = B ** 2 - 4 * A * C;
		if (D < 0) return [null, null];
		const x1 = (-B + Math.sqrt(D)) / (2 * A);
		const y1 = slope * x1 + yInt;
		const x2 = (-B - Math.sqrt(D)) / (2 * A);
		const y2 = slope * x2 + yInt;
		return [
			[x1, y1],
			[x2, y2],
		];
	}

	// ---- settings storage helpers ----
	function loadSetting(id, def) {
		const el = document.getElementById(id);
		let value = localStorage.getItem(id);
		if (value === null) value = def;
		// keep DOM in sync
		if (el) {
			if (el.type === "checkbox") el.checked = value === "true" || value === true;
			else el.value = value;
		}
		if (el?.type === "checkbox") return value === "true" || value === true;
		return isNaN(Number(value)) ? value : Number(value);
	}
	const saveSetting = (id, val) => localStorage.setItem(id, String(val));

	function onSettingChange(key, val) {
		if (key === "tractionCirUnits") {
			const edgeVal = val === "mps" ? 5 : 0.5;
			inputs.tractionCirEdgeAmt = edgeVal;
			const edgeEl = document.getElementById("tractionCirEdgeAmt");
			if (edgeEl) edgeEl.value = edgeVal;
			saveSetting("tractionCirEdgeAmt", edgeVal);
		}

		if (["tractionCirEdgeAmt", "tractionCirNumRings", "tractionCirUnits"].includes(key)) {
			updateRingDisplay();
		}

		if (lastFrame) updateDisplay(lastFrame.acc, lastFrame.pitch, lastFrame.roll);
		else resizeCanvas();
	}

	// wire DOM controls -> inputs
	for (const key in defaults) {
		inputs[key] = loadSetting(key, defaults[key]);
		const el = document.getElementById(key);
		if (!el) continue;
		el.addEventListener("change", () => {
			let val;
			if (el.type === "checkbox") val = el.checked;
			else if (el.type === "number") val = Number(el.value);
			else val = el.value;
			inputs[key] = val;
			saveSetting(key, val);
			onSettingChange(key, val);
		});
	}

	// reset button behavior
	const resetEl = document.getElementById("tractionCirReset");
	if (resetEl) {
		resetEl.addEventListener("click", () => {
			for (const key in defaults) {
				inputs[key] = defaults[key];
				const el = document.getElementById(key);
				if (!el) continue;
				if (el.type === "checkbox") el.checked = defaults[key];
				else el.value = defaults[key];
				saveSetting(key, defaults[key]);
			}
			updateRingDisplay();
			if (lastFrame) updateDisplay(lastFrame.acc, lastFrame.pitch, lastFrame.roll);
			else resizeCanvas();
		});
	}

	// ring display DOM nodes (may be absent)
	const ringDisplaySizeEl = document.getElementById("tractionCirRingDisplaySize");
	const ringDisplayUnitsEl = document.getElementById("tractionCirRingDisplayUnits");

	function updateRingDisplay() {
		if (!ringDisplaySizeEl && !ringDisplayUnitsEl) return;
		const baseInner = Number(inputs.tractionCirNumRings) || 0;
		const edgeAmt = Number(inputs.tractionCirEdgeAmt) || 0;
		const dpRing = Number(inputs.tractionCirNumDigits) || 1;
		const perRing = baseInner + 1 > 0 ? edgeAmt / (baseInner + 1) : 0;
		const zeroStr = (0).toFixed(dpRing);
		ringDisplaySizeEl.textContent = Number.isFinite(perRing) ? perRing.toFixed(dpRing) : zeroStr;
		ringDisplayUnitsEl.textContent = inputs.tractionCirUnits === "mps" ? "m/s²" : "g";
	}

	// ---- drawing base circles + rings ----
	function drawBaseCircles(ctx, paddingPx, innerRings = 0) {
		if (ctx.canvas.width < 50 || ctx.canvas.height < 50) return;
		ctx.save();
		const cenX = ctx.canvas.width / 2;
		const cenY = ctx.canvas.height / 2;
		ctx.lineWidth = Number(inputs.tractionCirRingSize) || 1;
		const outerRadius = Math.min(cenX, cenY) - ctx.lineWidth / 2 - paddingPx;
		if (outerRadius < 4) {
			ctx.restore();
			return;
		}

		// base fill
		ctx.fillStyle = `rgba(${hexToRgb(inputs.tractionCirBaseColor)},${inputs.tractionCirBaseAlpha})`;
		ctx.beginPath();
		ctx.arc(cenX, cenY, outerRadius, 0, Math.PI * 2);
		ctx.fill();

		// outermost ring + inner rings
		ctx.strokeStyle = `rgba(${hexToRgb(inputs.tractionCirRingColor)},${inputs.tractionCirRingAlpha})`;
		const totalRings = innerRings + 1;
		const ringSpacing = outerRadius / totalRings;
		for (let i = 1; i <= totalRings; i++) {
			ctx.beginPath();
			ctx.arc(cenX, cenY, ringSpacing * i, 0, Math.PI * 2);
			ctx.stroke();
		}

		ctx.restore();
	}

	// ---- resize logic (measures label width to compute padding) ----
	function resizeCanvas(unset = false) {
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;
		updateRingDisplay();

		const fontSizeNum = Number(inputs.tractionCirNumFontSize) || 20;
		ctx.font = `${fontSizeNum}px monospace`;
		const dpSample = Math.max(0, Number(inputs.tractionCirNumDigits) || 0);
		const sample = "0".repeat(Math.max(1, dpSample + 2));
		const textW = ctx.measureText(sample).width;
		const padding = inputs.tractionCirNumReadouts ? Math.ceil(textW) + 16 : 0;

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		drawBaseCircles(ctx, padding, Number(inputs.tractionCirNumRings) || 0);

		if (showUnset || unset) {
			if (unset) updateDisplay?.({ x: 0, y: 0, z: 0 }, 0, 0, 0);

			ctx.textAlign = "center";
			ctx.fillStyle = "red";
			ctx.font = `bold ${Math.max(40, fontSizeNum * 2)}px monospace`;
			ctx.textBaseline = "middle";

			ctx.fillText("UNSET", canvas.width / 2, canvas.height / 4);
			ctx.lineWidth = 2;
			ctx.strokeStyle = "black"; // border color
			ctx.strokeText("UNSET", canvas.width / 2, canvas.height / 4);
		}
	}

	window.addEventListener("resize", resizeCanvas);

	// ---- marker alpha computation (preserves original behavior) ----
	function computeAlphaForIndex(idx, len, markerAlpha, decayEnabled) {
		if (len <= 1) return markerAlpha;
		if (!decayEnabled) return markerAlpha;

		const newestIdx = len - 1;
		const secondNewestIdx = len - 2;
		if (idx === newestIdx) return markerAlpha;
		if (idx === secondNewestIdx) return markerAlpha / 2;

		const denom = Math.max(1, len - 3);
		const pos = idx; // 0 oldest ... len-3
		const alpha = (markerAlpha / 2) * (pos / denom);
		return alpha;
	}

	// ---- main update loop ----
	let lastNumUpdate = 0;

	function updateDisplay(acc = { x: 0, y: 0, z: 0 }, pitch = 0, roll = 0, timestamp = performance.now()) {
		if (showUnset) showUnset = false;

		lastFrame = { acc, pitch, roll };

		const dt = timestamp - lastNumUpdate;
		const numUpdateInterval = 1000 / (Number(inputs.tractionCirNumUpdateRate) || 60);
		const doNumUpdate = dt >= numUpdateInterval;
		if (doNumUpdate) lastNumUpdate = timestamp;

		// measure number padding
		const fontSizeNum = Number(inputs.tractionCirNumFontSize) || 20;
		ctx.font = `${fontSizeNum}px monospace`;
		const dpNum = Math.max(0, Number(inputs.tractionCirNumDigits) || 0);
		const sample = "0".repeat(Math.max(1, dpNum + 2));
		const sampleW = ctx.measureText(sample).width;
		const numberPadding = inputs.tractionCirNumReadouts ? Math.ceil(sampleW) + 16 : 0;

		const cenX = canvas.width / 2;
		const cenY = canvas.height / 2;
		const baseOuterRadius = Math.min(cenX, cenY) - numberPadding;
		if (baseOuterRadius < 8) return;

		const baseInnerRings = Number(inputs.tractionCirNumRings) || 0;
		const edgeAmt = Number(inputs.tractionCirEdgeAmt) || 1;
		const valuePerRing = edgeAmt / (baseInnerRings + 1);

		// dynamic edge behavior (preserved)
		const maxVal = Math.max(Math.abs(acc.x), Math.abs(acc.y), Math.abs(acc.z), 0);
		let displayedTotalRings = baseInnerRings + 1;
		if (inputs.tractionCirDynamicEdge && valuePerRing > 0 && maxVal > edgeAmt) {
			const neededTotal = Math.ceil(maxVal / valuePerRing);
			displayedTotalRings = Math.max(displayedTotalRings, neededTotal);
		}
		const displayedInnerRings = Math.max(0, displayedTotalRings - 1);

		const outerRadius = Math.min(baseOuterRadius, Math.min(cenX, cenY) - 4);

		// clear and redraw base
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		drawBaseCircles(ctx, numberPadding, displayedInnerRings);

		// ---- markers / trail management ----
		const maxTrailSetting = Math.max(0, Number(inputs.tractionCirNumPastMarkers) || 0);
		if (maxTrailSetting > 0) {
			trail.push({ x: acc.x, y: acc.y, z: acc.z });
			if (trail.length > maxTrailSetting) trail.splice(0, trail.length - maxTrailSetting);
		} else {
			trail.length = 0;
		}

		// marker styling values
		const markerAlpha = Number(inputs.tractionCirMarkerAlpha) || 1;
		const markerBaseSize = Number(inputs.tractionCirMarkerSize) || 4;
		const markerScale = Number(inputs.tractionCirMarkerScale) || 1; // preserved typo key
		const borderSize = Number(inputs.tractionCirMarkerBorderSize) || 0;
		const borderColor = inputs.tractionCirMarkerBorderColor || "#000000";
		const decayEnabled = !!inputs.tractionCirMarkerAlphaDecay;
		const liveColorEnabled = !!inputs.tractionCirMarkerCurrentColorEnabled;
		const liveColorHex = inputs.tractionCirMarkerCurrentColor || "#ffffff";
		const defaultMarkerHex = inputs.tractionCirMarkerColor || "#ffffff";

		const n = trail.length;

		// precompute pixel positions & radii
		const pixels = new Array(n);
		for (let i = 0; i < n; i++) {
			const p = trail[i];
			const xVal = inputs.tractionCirInvertHorizontal ? -p.x : p.x;
			const yVal = inputs.tractionCirInvertVertical ? -p.y : p.y;
			const px = cenX + (xVal / edgeAmt) * (outerRadius - 10);
			const py = cenY - (yVal / edgeAmt) * (outerRadius - 10);
			const r = Math.max(1, markerBaseSize + p.z * markerScale);
			pixels[i] = { px, py, r, raw: p };
		}

		// helper: allow input either '#rrggbb' or 'r,g,b' string
		function fillHexToRgb(hexOrRgb) {
			if (typeof hexOrRgb === "string" && hexOrRgb.includes(",")) return hexOrRgb;
			return hexToRgb(hexOrRgb);
		}

		// draw marker with optional border
		function drawMarker(x, y, r, alpha, fillHex) {
			if (borderSize > 0) {
				ctx.beginPath();
				ctx.arc(x, y, r + borderSize, 0, Math.PI * 2);
				ctx.fillStyle = `rgba(${hexToRgb(borderColor)},${alpha})`;
				ctx.fill();
			}
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fillStyle = `rgba(${fillHexToRgb(fillHex)},${alpha})`;
			ctx.fill();
		}

		// draw oldest ... up to n-3
		for (let i = 0; i <= n - 3; i++) {
			const { px, py, r } = pixels[i];
			const alpha = computeAlphaForIndex(i, n, markerAlpha, decayEnabled);
			drawMarker(px, py, r, alpha, defaultMarkerHex);
		}

		// draw second-newest if present
		if (n >= 2) {
			const idx = n - 2;
			const { px, py, r } = pixels[idx];
			const alpha = computeAlphaForIndex(idx, n, markerAlpha, decayEnabled);
			drawMarker(px, py, r, alpha, defaultMarkerHex);
		}

		// ---- pitch / roll line ----
		if (inputs.tractionCirPitchRollLine) {
			const slope = Math.tan(-degToRad(roll));
			const yInt = (Math.tan(degToRad(pitch)) * outerRadius) / Math.tan(degToRad(45));
			const [outer1, outer2] = getEndPoints(yInt, slope, [0, 0], outerRadius);
			if (outer1) {
				const midRadius = Number(inputs.tractionCirPitchRollWhitespace) || 0;
				const segments = [];
				if (midRadius > 0) {
					const [inner1, inner2] = getEndPoints(yInt, slope, [0, 0], midRadius);
					if (inner1) {
						segments.push([outer1, inner1]);
						segments.push([inner2, outer2]);
					} else segments.push([outer1, outer2]);
				} else segments.push([outer1, outer2]);

				ctx.strokeStyle = `rgba(${hexToRgb(inputs.tractionCirPitchRollColor)},${inputs.tractionCirPitchRollAlpha})`;
				ctx.lineWidth = Number(inputs.tractionCirPitchRollSize) || 1;
				segments.forEach(([p1, p2]) => {
					ctx.beginPath();
					ctx.moveTo(p1[0] + cenX, p1[1] + cenY);
					ctx.lineTo(p2[0] + cenX, p2[1] + cenY);
					ctx.stroke();
				});
			}
		}

		// draw newest on top
		if (n >= 1) {
			const idx = n - 1;
			const { px, py, r } = pixels[idx];
			const alpha = computeAlphaForIndex(idx, n, markerAlpha, decayEnabled);
			const fillHex = liveColorEnabled ? liveColorHex : defaultMarkerHex;
			drawMarker(px, py, r, alpha, fillHex);
		}

		// ---- number readouts (cached update to reduce flicker) ----
		const dp = dpNum;
		const zeroStr = (0).toFixed(dp);
		const conv = inputs.tractionCirUnits === "g" ? (v) => v / G_CONV : (v) => v;

		const dispX = inputs.tractionCirInvertHorizontal ? -acc.x : acc.x;
		const dispY = inputs.tractionCirInvertVertical ? -acc.y : acc.y;
		const dispZ = acc.z;

		const fresh = {
			topY: dispY > 0 ? conv(dispY).toFixed(dp) : zeroStr,
			botY: dispY < 0 ? Math.abs(conv(dispY)).toFixed(dp) : zeroStr,
			leftX: dispX < 0 ? Math.abs(conv(dispX)).toFixed(dp) : zeroStr,
			rightX: dispX > 0 ? conv(dispX).toFixed(dp) : zeroStr,
			topZ: `z: ${dispZ >= 0 ? "+" : "-"}${conv(Math.abs(dispZ)).toFixed(dp)}`,
			pitch: pitch.toFixed(dp),
			roll: roll.toFixed(dp),
			net: conv(Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2)).toFixed(dp),
		};

		if (doNumUpdate) Object.assign(cachedNums, fresh);
		for (const k in cachedNums) if (cachedNums[k] === null) cachedNums[k] = fresh[k];

		ctx.fillStyle = `rgba(${hexToRgb(inputs.tractionCirNumColor)},${inputs.tractionCirNumAlpha})`;
		ctx.font = `${fontSizeNum}px monospace`;
		ctx.textBaseline = "middle";

		const npHalf = inputs.tractionCirNumReadouts ? numberPadding / 2 : 5;
		const leftPadding = 5;

		if (inputs.tractionCirNumReadouts) {
			ctx.textAlign = "center";
			ctx.fillText(cachedNums.topY, cenX, cenY - outerRadius - npHalf);
			ctx.fillText(cachedNums.botY, cenX, cenY + outerRadius + npHalf);
			ctx.fillText(cachedNums.leftX, cenX - outerRadius - npHalf, cenY);
			ctx.fillText(cachedNums.rightX, cenX + outerRadius + npHalf, cenY);
		}

		if (inputs.tractionCirNumVertical) {
			ctx.textAlign = "right";
			ctx.fillText(cachedNums.topZ, canvas.width - 5, fontSizeNum);
		}

		if (inputs.tractionCirNumPitchRoll) {
			ctx.textAlign = "left";
			ctx.fillText(`Pitch: ${cachedNums.pitch}°`, leftPadding, fontSizeNum);
			ctx.fillText(`Roll: ${cachedNums.roll}°`, leftPadding, fontSizeNum * 2 + 4);
		}

		if (inputs.tractionCirNetReadout) {
			ctx.textAlign = "left";
			const unitsText = inputs.tractionCirUnits === "mps" ? "m/s²" : "g";
			ctx.fillText(`${cachedNums.net} ${unitsText}`, leftPadding, canvas.height - fontSizeNum / 2);
		}

		// bottom-right ring/edge info
		ctx.textAlign = "right";
		const unitsTextBR = inputs.tractionCirUnits === "mps" ? "m/s²" : "g";
		const fmtMin = (v) => {
			const s = v.toFixed(dp);
			return s.includes(".") ? s.replace(/\.0+$/, "") : s;
		};

		if (inputs.tractionCirNumEdgeRing) {
			const line1Y = canvas.height - ((fontSizeNum * 3) / 2 + 4);
			const line2Y = canvas.height - fontSizeNum / 2;
			ctx.fillText(`Ring: ${fmtMin(valuePerRing)} ${unitsTextBR}`, canvas.width - 5, line1Y);
			ctx.fillText(`Edge: ${fmtMin(edgeAmt)} ${unitsTextBR}`, canvas.width - 5, line2Y);
		}

		updateRingDisplay();
	}

	// init
	updateRingDisplay();
	return { updateDisplay, resizeCanvas };
}
