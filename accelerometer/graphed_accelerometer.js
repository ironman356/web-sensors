

/* <label for="movingAvgWindow">Moving Average Window Size:</label>
<input type="number" id="movingAvgWindow" value="10" min="1" inputmode="decimal">
<br />
<label for="exponentialSmoothing">Exponential smoothing:</label>
<input type="number" id="exponentialSmoothing" value="0.1" min="0" inputmode="decimal">
<br />
<label for="regressionWindow">Local Regression Window Size:</label>
<input type="number" id="regressionWindow" value="30" min="1" inputmode="decimal">
<br />
</div>

<canvas id="rawGraph"></canvas>
<canvas id="movingAvgGraph"></canvas>
<canvas id="exponentialGraph"></canvas>
<canvas id="regressionGraph"></canvas> */

const accX = [];
const accY = [];
const accZ = [];

function createChart(canvasId, label) {
    const ctx = document.getElementById(canvasId).getContext("2d");
    return new Chart(ctx, {
        type: "line",
        data: {
            labels: Array(300).fill(""),
            datasets: [
                { label: label + " X", borderColor: "red", borderWidth: 2, pointRadius: 0, data: [], fill: false },
                { label: label + " Y", borderColor: "green", borderWidth: 2, pointRadius: 0, data: [], fill: false },
                { label: label + " Z", borderColor: "blue", borderWidth: 2, pointRadius: 0, data: [], fill: false },
                { label: label + " Total", borderColor: "black", borderWidth: 2, pointRadius: 0, data: [], fill: false },
            ],
        },
        options: {
            responsive: true,
            animation: false,
            scales: { y: {
                title: {
                    display: true,
                    text: label,
                },
                beginAtZero: false
            } },
        },
    });
}

const rawGraph = createChart("rawGraph", "Raw");
const movingAvgGraph = createChart("movingAvgGraph", "Moving Avg");
const exponentialGraph = createChart("exponentialGraph", "Exponential");
const regressionGraph = createChart("regressionGraph", "Local Regression");

function calculateMovingAverage(data, windowSize = 10) {
    return data.map((_, i, arr) => {
        if (i < windowSize - 1) return null;
        const slice = arr.slice(i - windowSize + 1, i + 1);
        return slice.reduce((a, b) => a + b, 0) / windowSize;
    });
}

function calculateExponential(data, alpha = 0.1) {
    let result = [];
    data.forEach((val, i) => {
        if (val === null) {
            result.push(null);
        } else if (i === 0 || result[i - 1] === null) {
            result.push(val);
        } else {
            result.push(alpha * val + (1 - alpha) * result[i - 1]);
        }
    });
    return result;
}

function calculateLocalRegression(data, localWindow = 30) {
    const n = data.length;
    let result = new Array(n).fill(null);
    if (n < 2 * localWindow + 1) return result;

    for (let i = localWindow; i < n - localWindow; i++) {
        let sum_w = 0, sum_wx = 0, sum_wy = 0, sum_wxx = 0, sum_wxy = 0;
        for (let j = i - localWindow; j <= i + localWindow; j++) {
            if (data[j] === null) continue;
            const d = Math.abs(i - j);
            const w = Math.pow(1 - Math.pow(d / localWindow, 3), 3);
            sum_w += w;
            sum_wx += w * j;
            sum_wy += w * data[j];
            sum_wxx += w * j * j;
            sum_wxy += w * j * data[j];
        }
        const denom = sum_w * sum_wxx - sum_wx * sum_wx;
        if (denom !== 0) {
            const slope = (sum_w * sum_wxy - sum_wx * sum_wy) / denom;
            const intercept = (sum_wy - slope * sum_wx) / sum_w;
            result[i] = slope * i + intercept;
        } else {
            result[i] = data[i];
        }
    }
    return result;
}

function startAccelerometer() {
    document.getElementById("status").textContent = "";
    if (typeof DeviceMotionEvent.requestPermission === "function") {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === "granted") enableAccelerometer();
                else document.getElementById("status").textContent = "Permission denied";
            })
            .catch(error => {
                document.getElementById("status").textContent = "Error requesting permission";
                console.error(error);
            });
    } else {
        enableAccelerometer();
    }
}

function enableAccelerometer() {
    if ("DeviceMotionEvent" in window) {
        window.addEventListener("devicemotion", accelHandler);
    } else {
        document.getElementById("status").textContent = "Accelerometer not supported";
    }
}

document.getElementById("pairButton").addEventListener("click", startAccelerometer);

function accelHandler(event) {
    const acc = event.acceleration;
    if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

    accX.push(acc.x);
    accY.push(acc.y);
    accZ.push(acc.z);

    if (accX.length > 400) {
        accX.shift();
        accY.shift();
        accZ.shift();
    }

    const maWindow = parseInt(document.getElementById("movingAvgWindow").value, 10);
    const lrWindow = parseInt(document.getElementById("regressionWindow").value, 10);
    const expAlpha = parseFloat(document.getElementById("exponentialSmoothing").value);

    const sliceLength = 300;
    const baseIndex = Math.max(0, accX.length - sliceLength);
    const slice = (arr) => arr.slice(baseIndex);


    // Raw
    const rawX = slice(accX);
    const rawY = slice(accY);
    const rawZ = slice(accZ);
    const rawTotal = rawX.map((_, i) =>
        Math.sqrt(rawX[i] ** 2 + rawY[i] ** 2 + rawZ[i] ** 2)
    );
    [rawX, rawY, rawZ].forEach((arr, i) => {
        rawGraph.data.datasets[i].data = arr;
    });
    rawGraph.data.datasets[3].data = rawTotal;
    rawGraph.update();

    // Moving Average
    const maX = slice(calculateMovingAverage(accX, maWindow));
    const maY = slice(calculateMovingAverage(accY, maWindow));
    const maZ = slice(calculateMovingAverage(accZ, maWindow));
    const maTotal = maX.map((_, i) => {
        if (maX[i] === null || maY[i] === null || maZ[i] === null) return null;
        return Math.sqrt(maX[i] ** 2 + maY[i] ** 2 + maZ[i] ** 2);
    });
    [maX, maY, maZ].forEach((arr, i) => {
        movingAvgGraph.data.datasets[i].data = arr;
    });
    movingAvgGraph.data.datasets[3].data = maTotal;
    movingAvgGraph.update();

    // Exponential
    const expX = slice(calculateExponential(accX, expAlpha));
    const expY = slice(calculateExponential(accY, expAlpha));
    const expZ = slice(calculateExponential(accZ, expAlpha));
    const expTotal = expX.map((_, i) => {
        if (expX[i] === null || expY[i] === null || expZ[i] === null) return null;
        return Math.sqrt(expX[i] ** 2 + expY[i] ** 2 + expZ[i] ** 2);
    });
    [expX, expY, expZ].forEach((arr, i) => {
        exponentialGraph.data.datasets[i].data = arr;
    });
    exponentialGraph.data.datasets[3].data = expTotal;
    exponentialGraph.update();

    // Local Regression
    const lrX = slice(calculateLocalRegression(accX, lrWindow));
    const lrY = slice(calculateLocalRegression(accY, lrWindow));
    const lrZ = slice(calculateLocalRegression(accZ, lrWindow));
    const lrTotal = lrX.map((_, i) => {
        if (lrX[i] === null || lrY[i] === null || lrZ[i] === null) return null;
        return Math.sqrt(lrX[i] ** 2 + lrY[i] ** 2 + lrZ[i] ** 2);
    });
    [lrX, lrY, lrZ].forEach((arr, i) => {
        regressionGraph.data.datasets[i].data = arr;
    });
    regressionGraph.data.datasets[3].data = lrTotal;
    regressionGraph.update();
}

let visisbleLabels = true;
function toggleLineLabels() {
    visisbleLabels = !visisbleLabels;
    rawGraph.options.plugins.legend.display = visisbleLabels;
    rawGraph.update();
    movingAvgGraph.options.plugins.legend.display = visisbleLabels;
    movingAvgGraph.update();
    exponentialGraph.options.plugins.legend.display = visisbleLabels;
    exponentialGraph.update();
    regressionGraph.options.plugins.legend.display = visisbleLabels;
    regressionGraph.update();
}
document.getElementById("lineLabels").addEventListener("change", toggleLineLabels);