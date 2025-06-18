

document.getElementById("screenWidth").textContent = window.screen.width;
document.getElementById("screenHeight").textContent = window.screen.height;
document.getElementById("screenColorDepth").textContent = window.screen.colorDepth;
document.getElementById("screenPixelDepth").textContent = window.screen.pixelDepth;
document.getElementById("devicePixelRatio").textContent = window.devicePixelRatio || 1;

document.getElementById("logicalCores").textContent = navigator.hardwareConcurrency;
document.getElementById("memory").textContent = navigator.deviceMemory || "null";
document.getElementById("online").textContent = navigator.onLine;


