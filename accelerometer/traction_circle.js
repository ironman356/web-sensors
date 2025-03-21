

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
        enableAccelerometer(); // Non-iOS devices
    }
}


const smoothingFactor = 0.2;
function enableAccelerometer() {
    if ("DeviceMotionEvent" in window) {
        window.addEventListener("devicemotion", event => {
            const accLinear = event.acceleration;
            if (accLinear.x !== null) {
                avgXLinear = smoothingFactor * accLinear.x + (1 - smoothingFactor) * avgXLinear;
            }
            if (accLinear.y !== null) {
                avgYLinear = smoothingFactor * accLinear.y + (1 - smoothingFactor) * avgYLinear;
            }
            if (accLinear.z !== null) {
                avgZLinear = smoothingFactor * accLinear.z + (1 - smoothingFactor) * avgZLinear;
            }
            document.getElementById("status").textContent = "Accelerometer active";
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

let outerCircleSpd = 9.81 / 2;
function drawAccelPoint() {
    let x = canvas.width / 2 - avgXLinear * outerRadius / outerCircleSpd;
    let y = canvas.height / 2 + avgZLinear * outerRadius / outerCircleSpd;
    ctx.beginPath();
    ctx.fillStyle = "red";
    ctx.arc(x, y, accPointSize, 0, Math.PI * 2);
    ctx.fill();
}


resizeCanvas();
window.addEventListener("resize", resizeCanvas);
main();

function main() {
    requestAnimationFrame(main);
    ctx.clearRect(0, 0, canvas.width, canvas.height);  // Clear canvas
    drawRings();

    if (avgXLinear !== null && avgZLinear !== null) {
        drawAccelPoint()
    }
}
