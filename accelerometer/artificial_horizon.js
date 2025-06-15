
const canvas = document.getElementById("attitudeIndicator");
const ctx = canvas.getContext("2d");
const pairButtonEl = document.getElementById("pairButton");

canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;


function togglAccPair() {
    if (pairButtonEl.textContent.startsWith("Un-Pair")) {
        window.removeEventListener("devicemotion", handleMotion);
        pairButtonEl.textContent = "Pair";
    } else {
        enableMotion();
    }
}

function enableMotion() {
    if (typeof DeviceMotionEvent.requestPermission === "function") {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === "granted") {
                    window.addEventListener("devicemotion", handleMotion);
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
            window.addEventListener("devicemotion", handleMotion);
            handleMotion();
        } catch (error) {
            console.log(error);
        }
            
        pairButtonEl.textContent = "Un-Pair?";
    }
}


function handleMotion(event) {
    let pitchDeg, rollDeg;

    if (typeof event === "undefined") {
        pitchDeg = Math.random() * 40 - 20;
        rollDeg = Math.random() * 40 - 20;
        console.log(pitchDeg, rollDeg);
    } else {
        const accGrav = event.accelerationIncludingGravity;
        const acc = event.acceleration;
        const z = normalize([0, -1, 0]); // down
        const y = normalize([0, 0, 1]); // forward
        const x = normalize(cross(y, z)); // right
        const y_corrected = cross(z, x);  // recompute orthogonal y - in case of noise / not originally orthogonal

        const R_mount = [
            [x[0], y_corrected[0], z[0]],
            [x[1], y_corrected[1], z[1]],
            [x[2], y_corrected[2], z[2]],
        ];

        const g = [accGrav.x-acc.x, accGrav.y-acc.y, accGrav.z-acc.z];
        const g_dev = matTransposeMultVec(R_mount, g);
        pitchDeg = radToDeg(Math.atan2(g_dev[1], g_dev[2])); // forward -> down
        rollDeg = radToDeg(Math.atan2(g_dev[0], g_dev[2])); // right -> down


        document.getElementById("pitch").innerHTML = pitchDeg.toFixed(2);
        document.getElementById("roll").innerHTML = rollDeg.toFixed(2);
        
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
    
    // console.log(canvas.getBoundingClientRect().width);
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


pairButtonEl.addEventListener("click", togglAccPair);


function degToRad(deg) {
    return deg * Math.PI / 180;
}
function radToDeg(rad) {
    return rad * 180 / Math.PI;
}
function matTransposeMultVec(M, v) {
  return [
    M[0][0]*v[0] + M[1][0]*v[1] + M[2][0]*v[2],
    M[0][1]*v[0] + M[1][1]*v[1] + M[2][1]*v[2],
    M[0][2]*v[0] + M[1][2]*v[1] + M[2][2]*v[2],
  ];
}
function normalize(v) {
    const len = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
    if (len === 0) return [0,0,0];
    return [v[0]/len, v[1]/len, v[2]/len];
}
function cross(a, b) {
    return [
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0]
    ];
}
