
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
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === "granted") {
                    window.addEventListener("deviceorientation", handleOrientation);
                    pairButtonEl.textContent = "Un-Pair";
                } else {
                    pairButtonEl.textContent = "Permission Denied";
                }
            })
            .catch(err => {
                // console.error(err);
                pairButtonEl.textContent = "Error";
            });
    } else {
        try {
            window.addEventListener("deviceorientation", handleOrientation);
            handleOrientation();
        } catch (error) {
            console.log(error);
        }
            
        pairButtonEl.textContent = "Un-Pair?";
    }
}

function degToRad(deg) {
    return deg * Math.PI / 180;
}

function handleOrientation(event) {
    let pitchDeg, rollDeg;
    console.log(typeof event);

    if (typeof event === "undefined") {
        pitchDeg = Math.random() * 40 - 20;
        rollDeg = Math.random() * 40 - 20;
        console.log(pitchDeg, rollDeg);
    } else {
        // adjusting pitch to level at beta=90 will cause problems due to gimbal lock
        // thank you apple for only supporting orientation in euler angles - android has options to get quaternions directly from webapi
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

    const horizonOffset = Math.tan(degToRad(pitchDeg)) * (canvas.width / 2);
    // console.log(horizonOffset);

    const slope = Math.tan(-degToRad(rollDeg));
    // console.log(`slope ${slope}`);
    const [p1, p2] = getEndPoints(horizonOffset, slope, [0, 0], canvas.width/2);
    // console.log(horizonOffset, slope, [canvas.width/2, canvas.height/2], canvas.width/2);
    // console.log(p1);
    // console.log(p2);

    if (p1 !== null && p2 !== null) {
        ctx.beginPath();
        ctx.moveTo(p1[0]+canvas.width/2, p1[1]+canvas.width/2);
        ctx.lineTo(p2[0]+canvas.width/2, p2[1]+canvas.width/2);
        
        ctx.stroke();
    }
    

    console.log(canvas.getBoundingClientRect().width);
}

function getEndPoints(yInt, slope, cirMid, radius) {
    /**
     * y=mx+b - line formula, (x-h)^2 + (y-k)^2 = r^2 - circle formula
     * subbing line formula into y of circle formula and rearranged gives
     * x^2(1+m^2) + x(-2h+2mb-2mk) + (h^2+b^2+k^2-r^2-2bk) = 0
     * from which quadratic equation can be used to find x in line formula
     */
    const A = 1 + slope ** 2;
    const B = -2 * cirMid[0] + 2 * slope * yInt - 2 * slope * cirMid[1];
    const C = cirMid[0] ** 2 + yInt ** 2 + cirMid[1] ** 2 - radius ** 2 - 2 * yInt * cirMid[1]; 
    const inRoot = B ** 2 - 4 * A * C;
    // console.log(inRoot)
    if (inRoot < 0) {
        return [null, null];
    }
    const x1 = (-B + Math.sqrt(inRoot)) / (2 * A);
    const y1 = slope * x1 + yInt;
    const x2 = (-B - Math.sqrt(inRoot)) / (2 * A);
    const y2 = slope * x2 + yInt;

    return [[x1, y1], [x2, y2]];
}


pairButtonEl.addEventListener("click", toggleGyroPair);



function degToRad(deg) {
    return deg * Math.PI / 180;
}
