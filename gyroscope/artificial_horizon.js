
const canvas = document.getElementById("attitudeIndicator");
const ctx = canvas.getContext("2d");
const pairButtonEl = document.getElementById("pairButton");

canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;


function toggleGyroPair() {
    if (pairButtonEl.textContent.startsWith("Un-Pair")) {
        window.removeEventListener("deviceorientation", handleOrientation);
        pairButtonEl.textContent = "Pair";
    } else {
        enableOrientation();
    }
}

function enableOrientation() {
    if (typeof DeviceOrientationEvent !== "undefined") {
        if (typeof DeviceOrientationEvent.requestPermission === "function") {
            DeviceOrientationEvent.requestPermission()
                .then(response => {
                    if (response === "granted") {
                        handleOrientation();
                        pairButtonEl.textContent = "Un-Pair";
                    } else {
                        pairButtonEl.textContent = "Permission Denied";
                    }
                })
                .catch(err => {
                    console.error(err);
                    pairButtonEl.textContent = "Error";
                });
        } else {
            handleOrientation();
            pairButtonEl.textContent = "Un-Pair?";
        }
    } else {
        pairButtonEl.textContent = "Not Supported";
    }
}

function degToRad(deg) {
    return deg * Math.PI / 180;
}

function handleOrientation(event) {
    let pitchDeg, rollDeg;
    if (typeof event === "undefined") {
        // testing data on desktop (or smth broke)
        pitchDeg = 15;
        rollDeg = 30;
    } else {
        pitchDeg = event.beta;
        rollDeg = event.gamma;
    }

    const cenX = canvas.width / 2;
    const cenY = canvas.width / 2; // bc is square
    
    ctx.strokeStyle = "black"; // outer border ring 
    ctx.fillStyle = "rgb(135, 206, 235)"; // base sky blue
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cenX, cenY, cenX - (ctx.lineWidth / 2), 0, Math.PI*2); // draw outer border ring
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "brown";


    const horizonOffset = Math.sin(degToRad(pitchDeg)) * canvas.width/2;
    const yIntercept = cenY - horizonOffset;
    const slope = Math.tan(-degToRad(rollDeg));
    const [p1, p2] = getEndPoints(yIntercept, slope, canvas.width);

    ctx.beginPath();
    ctx.moveTo(cenX, cenY - horizonOffset); // goto y intercept @ cenX
    ctx.lineTo(cenX, cenY);
    ctx.stroke();

    console.log(canvas.getBoundingClientRect().width);
}

function getEndPoints(yInt, slope, boundRadius) {
    const p1 = {x: null, y: null};
    const p2 = {x: null, y: null};

    

    return [p1, p2];
}


pairButtonEl.addEventListener("click", toggleGyroPair);