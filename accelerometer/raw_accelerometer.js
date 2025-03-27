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

function enableAccelerometer() {
    let numUpdates = 0;
    const movingAvgGravity = { x: [], y: [], z: [] };
    const movingAvgLinear = { x: [], y: [], z: [] };
    if ("DeviceMotionEvent" in window) {
        window.addEventListener("devicemotion", event => {
            numUpdates++;
            document.getElementById("numUpdates").textContent = numUpdates.toString();
            
            const accGravity = event.accelerationIncludingGravity;
            document.getElementById("xGravityRaw").textContent = accGravity.x ? accGravity.x.toFixed(3) : "null";
            document.getElementById("yGravityRaw").textContent = accGravity.y ? accGravity.y.toFixed(3) : "null";
            document.getElementById("zGravityRaw").textContent = accGravity.z ? accGravity.z.toFixed(3) : "null";

            const accLinear = event.acceleration;
            document.getElementById("xLinearRaw").textContent = accLinear.x ? accLinear.x.toFixed(3) : "null";
            document.getElementById("yLinearRaw").textContent = accLinear.y ? accLinear.y.toFixed(3) : "null";
            document.getElementById("zLinearRaw").textContent = accLinear.z ? accLinear.z.toFixed(3) : "null";
            
            const intervalTime = event.interval;
            document.getElementById("intervalLen").textContent = intervalTime ? (intervalTime*1000).toFixed(2) : "null";
            const intervalHZ = (1 / intervalTime);
            document.getElementById("intervalHZ").textContent = intervalTime ? intervalHZ.toFixed(2) : "null";
            
            // snapshot update
            if (numUpdates % intervalHZ.toFixed(0) == 0) {
                document.getElementById("xGravitySnapshot").textContent = accGravity.x ? accGravity.x.toFixed(3) : "null";
                document.getElementById("yGravitySnapshot").textContent = accGravity.y ? accGravity.y.toFixed(3) : "null";
                document.getElementById("zGravitySnapshot").textContent = accGravity.z ? accGravity.z.toFixed(3) : "null";
                document.getElementById("xLinearSnapshot").textContent = accLinear.x ? accLinear.x.toFixed(3) : "null";
                document.getElementById("yLinearSnapshot").textContent = accLinear.y ? accLinear.y.toFixed(3) : "null";
                document.getElementById("zLinearSnapshot").textContent = accLinear.z ? accLinear.z.toFixed(3) : "null";
            }

            const windowSize = intervalHZ.toFixed(0);

            // moving average gravity
            if (accGravity.x !== null) {
                movingAvgGravity.x.push(accGravity.x);
                if (movingAvgGravity.x.length > windowSize) movingAvgGravity.x.shift(); // remove oldest element
            }
            if (accGravity.y !== null) {
                movingAvgGravity.y.push(accGravity.y);
                if (movingAvgGravity.y.length > windowSize) movingAvgGravity.y.shift();
            }
            if (accGravity.z !== null) {
                movingAvgGravity.z.push(accGravity.z);
                if (movingAvgGravity.z.length > windowSize) movingAvgGravity.z.shift();
            }

            const avgXGravity = movingAvgGravity.x.reduce((a, b) => a + b, 0) / movingAvgGravity.x.length;
            const avgYGravity = movingAvgGravity.y.reduce((a, b) => a + b, 0) / movingAvgGravity.y.length;
            const avgZGravity = movingAvgGravity.z.reduce((a, b) => a + b, 0) / movingAvgGravity.z.length;

            document.getElementById("xGravityAvg").textContent = avgXGravity.toFixed(3);
            document.getElementById("yGravityAvg").textContent = avgYGravity.toFixed(3);
            document.getElementById("zGravityAvg").textContent = avgZGravity.toFixed(3);


            // moving average linear
            if (accLinear.x !== null) {
                movingAvgLinear.x.push(accLinear.x);
                if (movingAvgLinear.x.length > windowSize) movingAvgLinear.x.shift(); // remove oldest element
            }
            if (accLinear.y !== null) {
                movingAvgLinear.y.push(accLinear.y);
                if (movingAvgLinear.y.length > windowSize) movingAvgLinear.y.shift();
            }
            if (accLinear.z !== null) {
                movingAvgLinear.z.push(accLinear.z);
                if (movingAvgLinear.z.length > windowSize) movingAvgLinear.z.shift();
            }

            const avgXLinear = movingAvgLinear.x.reduce((a, b) => a + b, 0) / movingAvgLinear.x.length;
            const avgYLinear = movingAvgLinear.y.reduce((a, b) => a + b, 0) / movingAvgLinear.y.length;
            const avgZLinear = movingAvgLinear.z.reduce((a, b) => a + b, 0) / movingAvgLinear.z.length;

            document.getElementById("xLinearAvg").textContent = avgXLinear.toFixed(3);
            document.getElementById("yLinearAvg").textContent = avgYLinear.toFixed(3);
            document.getElementById("zLinearAvg").textContent = avgZLinear.toFixed(3);

            
            document.getElementById("status").textContent = "Accelerometer active";
        });
    } else {
        document.getElementById("status").textContent = "Accelerometer not supported";
    }
}