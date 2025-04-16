
// Constants
const scale = 0.5;
const text_font = 100;
const bitrate = 30000000;

// Elements
const video = document.getElementById('camera');
const canvas = document.getElementById('canvas');
const videoCanvas = canvas.getContext('2d');
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const downloadLink = document.getElementById('download');
const cameraSelect = document.getElementById('cameraSelect');
const audioCheckbox = document.getElementById('audioCheckbox');
const pairButton = document.getElementById('pairButton');
const legendCheckbox = document.getElementById('legendCheckbox');

// Variables for camera/recording and accelerometer data
let currentStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let frameCount = 0;
let lastFrameTime = 0;
let animationFrameId = null;
let recorderStream = null;
let exponentialChart = null;
let accelData = {
  x: new Array(400).fill(0),
  y: new Array(400).fill(0),
  z: new Array(400).fill(0)
};

// Accelerometer Initialization for iOS and other platforms
if (typeof DeviceMotionEvent.requestPermission === 'function') {
  pairButton.addEventListener('click', () => {
    DeviceMotionEvent.requestPermission()
      .then(response => {
        if (response === 'granted') {
          startAccel();
        } else {
          alert("Accelerometer permission denied.");
        }
      })
      .catch(error => {
        console.error(error);
        alert("Error requesting accelerometer permission: " + error);
      });
  });
} else {
  startAccel();
}

function startAccel() {
  window.addEventListener('devicemotion', (event) => {
    const a = event.acceleration || {};
    const x = a.x || 0, y = a.y || 0, z = a.z || 0;
    accelData.x.push(x);
    accelData.y.push(y);
    accelData.z.push(z);
    if (accelData.x.length > 400) {
      accelData.x.shift();
      accelData.y.shift();
      accelData.z.shift();
    }
  }, false);
}

// Camera & Recording Functions
async function getCameras() {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: audioCheckbox.checked });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    cameraSelect.innerHTML = '';
    videoDevices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${index + 1}`;
      cameraSelect.appendChild(option);
    });
    if (videoDevices.length > 0) {
      cameraSelect.value = videoDevices[0].deviceId;
      startCamera(videoDevices[0].deviceId);
    }
  } catch (error) {
    alert("Please grant camera access and reload the page.");
  }
}

async function startCamera(deviceId) {
  try {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      video.srcObject = null;
    }
    const initStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: { ideal: 9999 }, height: { ideal: 9999 } },
      audio: audioCheckbox.checked,
    });
    const track = initStream.getVideoTracks()[0];
    const { width: maxWidth, height: maxHeight } = track.getSettings();
    initStream.getTracks().forEach(track => track.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: Math.round(maxWidth * scale) },
        height: { ideal: Math.round(maxHeight * scale) }
      },
      audio: audioCheckbox.checked,
    });
    currentStream = stream;
    video.srcObject = stream;
    video.play();
    video.onplaying = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      drawLoop();
    };
    startBtn.disabled = false;
  } catch (error) {
    alert("Unable to access the selected camera.");
  }
}

function overlayTimeAndFrame() {
  if (!video.videoWidth || !video.videoHeight) return;
  const now = Date.now();
  if (now - lastFrameTime > 1000 / 30) {
    lastFrameTime = now;
    frameCount++;
    videoCanvas.clearRect(0, 0, canvas.width, canvas.height);
    videoCanvas.drawImage(video, 0, 0, canvas.width, canvas.height);
    overlayMiniChart();
    const timeStr = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}:${new Date().getSeconds().toString().padStart(2, '0')}`;
    videoCanvas.font = `${text_font}px Arial`;
    videoCanvas.fillStyle = "white";
    videoCanvas.strokeStyle = "black";
    videoCanvas.lineWidth = 2;
    videoCanvas.strokeText(`Time: ${timeStr}`, 10, text_font + 10);
    videoCanvas.fillText(`Time: ${timeStr}`, 10, text_font + 10);
    videoCanvas.strokeText(`Frame: ${frameCount}`, 10, (text_font + 10) * 2);
    videoCanvas.fillText(`Frame: ${frameCount}`, 10, (text_font + 10) * 2);
  }
}

function overlayMiniChart() {
  const sourceCanvas = document.getElementById("exponentialGraph");
  const targetWidth = 700;
  const targetHeight = 300;
  const x = 10;
  const y = canvas.height - targetHeight - 10;
  videoCanvas.fillStyle = "rgba(255,255,255,0.3)";
  videoCanvas.fillRect(x, y, targetWidth, targetHeight);
  videoCanvas.drawImage(sourceCanvas, x, y, targetWidth, targetHeight);
}

function expSmooth(data, alpha = 0.1) {
  let result = [];
  for (let i = 0; i < data.length; i++) {
    result.push(i === 0 ? data[i] : alpha * data[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

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
      responsive: false,
      animation: false,
      plugins: {
        legend: {
          display: legendCheckbox.checked,
        },
      },
      scales: {
        y: {
          title: {
            display: true,
            text: label,
            color: "black",
            font: {
              size: 16,
              weight: "bold"
            }
          },
          ticks: {
            color: "black",
            font: {
              size: 14
            }
          },
          beginAtZero: false,
        },
      },
    },
  });
}

function updateExponentialChart() {
  if (!exponentialChart) return;
  const alpha = parseFloat(document.getElementById("exponentialSmoothing").value) || 0.1;

  const xSmooth = expSmooth(accelData.x, alpha).slice(-300);
  const ySmooth = expSmooth(accelData.y, alpha).slice(-300);
  const zSmooth = expSmooth(accelData.z, alpha).slice(-300);

  const total = xSmooth.map((_, i) =>
    Math.sqrt(xSmooth[i] ** 2 + ySmooth[i] ** 2 + zSmooth[i] ** 2)
  );

  exponentialChart.data.datasets[0].data = xSmooth;
  exponentialChart.data.datasets[1].data = ySmooth;
  exponentialChart.data.datasets[2].data = zSmooth;
  exponentialChart.data.datasets[3].data = total;
  exponentialChart.update();
}

function drawLoop() {
  updateExponentialChart();
  overlayTimeAndFrame();
  animationFrameId = requestAnimationFrame(drawLoop);
}

function setupMediaRecorder() {
  recorderStream = canvas.captureStream(30);
  if (audioCheckbox.checked && currentStream) {
    const audioTracks = currentStream.getAudioTracks();
    if (audioTracks.length > 0) {
      recorderStream.addTrack(audioTracks[0]);
    }
  }
  let mimeType = "video/webm";
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/mp4";
  const options = { mimeType, videoBitsPerSecond: bitrate };
  mediaRecorder = new MediaRecorder(recorderStream, options);
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: mimeType });
    recordedChunks = [];
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = "recording";
    downloadLink.style.display = 'block';
    downloadLink.click();
    downloadLink.onload = () => URL.revokeObjectURL(url);
  };
}

startBtn.onclick = () => {
  if (!currentStream) {
    alert("Camera is not ready. Please wait.");
    return;
  }
  frameCount = 0;
  setupMediaRecorder();
  mediaRecorder.start();
  startBtn.disabled = true;
  stopBtn.disabled = false;
};

stopBtn.onclick = () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    cancelAnimationFrame(animationFrameId);
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
};

cameraSelect.onchange = () => {
  startBtn.disabled = true;
  startCamera(cameraSelect.value);
};

audioCheckbox.onchange = () => {
  startBtn.disabled = true;
  startCamera(cameraSelect.value);
};

legendCheckbox.onchange = () => {
  if (exponentialChart) {
    exponentialChart.options.plugins.legend.display = legendCheckbox.checked;
    exponentialChart.update();
  }
};

window.onload = () => {
  getCameras();
  exponentialChart = createChart("exponentialGraph", "Smoothed");
};