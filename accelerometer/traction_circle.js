


const canvas = document.getElementById("traction_circle");
const ctx = canvas.getContext("2d");
let ringLineWidth = canvas.width / 100;
let accPointSize = ringLineWidth * 3;

function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ringLineWidth = canvas.width / 100;
    accPointSize = ringLineWidth * 3;
}


let lateralAcc = null;
let longitudinalAcc = null;
let verticalAcc = null;
let outerRadius = 0;
let avgXLinear = null;
let avgYLinear = null;
let avgZLinear = null;

function startAccelerometer(){
    // IOS needs permission for stuff requested
    if (typeof DeviceMotionEvent.requestPermission === "function") {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === "granted") {
                    enableAccelerometer();
                } else {
                    document.getElementById("status").textContent = "Permission denied";
                }
            })
            .catch(error => {
                document.getElementById("status").textContent = "Error requesting permission";
                console.error(error);
            });
    } else {
        enableAccelerometer();
    }
}


let smoothingFactor = 0.1;
function updateSmoothing(value) {
    smoothingFactor = parseFloat(value);
    document.getElementById("status").textContent = "Smoothing: " + smoothingFactor;
}
document.getElementById("smoothing").addEventListener("input", (event) => {updateSmoothing(event.target.value); });

function enableAccelerometer() {
    document.getElementById("status").textContent = "Accelerometer running";
    if ("DeviceMotionEvent" in window) {
        window.addEventListener("devicemotion", event => {
            let accLinear = event.acceleration;
            if (accLinear.x !== null) {
                avgXLinear = smoothingFactor * accLinear.x + (1 - smoothingFactor) * avgXLinear;
            }
            if (accLinear.y !== null) {
                avgYLinear = smoothingFactor * accLinear.y + (1 - smoothingFactor) * avgYLinear;
            }
            if (accLinear.z !== null) {
                avgZLinear = smoothingFactor * accLinear.z + (1 - smoothingFactor) * avgZLinear;
            }
        });
    } else {
        document.getElementById("status").textContent = "Accelerometer not supported";
    }
}


function drawRings() {
    ctx.strokeStyle = "black";
    ctx.lineWidth = ringLineWidth;
    outerRadius = canvas.width / 2 - ctx.lineWidth / 2;

    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, outerRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, outerRadius * 2 / 3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, outerRadius / 3, 0, Math.PI * 2);
    ctx.stroke();
}


let viewAngle = 25;
function updateViewAngle(value) {
    viewAngle = parseInt(value);
    document.getElementById("status").textContent = "View Angle: " + viewAngle;
}
document.getElementById("viewAngle").addEventListener("input", (event) => {updateViewAngle(event.target.value); });


let outerCircleSpd = 9.8066 / 2;
function updateouterCircleSpd(value) {
    outerCircleSpd = 9.8066 * parseFloat(value);

    document.getElementById("status").textContent = "Outer Ring (g): " + value;
}
document.getElementById("maxVisibleAccel").addEventListener("input", (event) => {updateouterCircleSpd(event.target.value); });


function drawAccelPoint(initX, initZ) {
    let radians = viewAngle * (Math.PI / 180);
    let cos = Math.cos(radians);
    let sin = Math.sin(radians);

    let dx = -initX * outerRadius / outerCircleSpd;
    let dy = -initZ * outerRadius / outerCircleSpd;

    let xRotated = Math.round(canvas.width / 2 + (dx * cos - dy * sin));
    let yRotated = Math.round(canvas.height / 2 + (dx * sin + dy * cos));

    ctx.beginPath();
    ctx.fillStyle = "red";
    ctx.arc(xRotated, yRotated, accPointSize, 0, Math.PI * 2);
    ctx.fill();
    return [xRotated, yRotated];
}

function drawOldAccPoint(x, y) {
    ctx.beginPath();
    ctx.fillStyle = "lightpink";
    ctx.arc(x, y, accPointSize / 2, 0, Math.PI * 2);
    ctx.fill();
}

let paused = false;
function togglePause() {
    paused = !paused;
    document.getElementById("pausePoints").textContent = paused ? "Unpause" : "Pause";
    document.getElementById("status").textContent = paused ? "Unpaused" : "Paused";
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const prevPoints = new Set();

function clearPastPoints() {
    prevPoints.clear();
    document.getElementById("status").textContent = "Cleared Point History";
}


function main() {
    requestAnimationFrame(main);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);  // Clear canvas

    for (const point of prevPoints) {
        const [x, y] = point.split(',').map(Number);
        drawOldAccPoint(x, y);
    }

    drawRings();

    if (avgXLinear !== null && avgZLinear !== null) {
        if (paused) {
            drawAccelPoint(avgXLinear, avgZLinear);
        } else {
            const [prevX, prevY] = drawAccelPoint(avgXLinear, avgZLinear);
            prevPoints.add(`${prevX},${prevY}`);
        }
    }
}
main();