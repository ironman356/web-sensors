


let options, rawGeolocationArr, rawMotionArr, rawOrientaitonArr; 



function newFileProcess(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const json = JSON.parse(e.target.result);
            options = json.Options || {};
            rawGeolocationArr = json.GeolocationArr || [];
            rawMotionArr = json.DeviceMotionArr || [];
            rawOrientaitonArr = json.DeviceOrientationArr || [];

            console.log(options);

            
        } catch (err) {
            console.error("Invalid JSON:", err);
        }
    };
    reader.readAsText(file);
}

let rawLedger = [];
function createLedgerFromRaw() {
    // const startTime = options.
}


document.getElementById('fileInput').addEventListener('change', newFileProcess);