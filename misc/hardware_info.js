
function getAndDisplay() {
    document.getElementById("screenWidth").textContent = window.screen.width;
    document.getElementById("screenHeight").textContent = window.screen.height;
    document.getElementById("screenColorDepth").textContent = window.screen.colorDepth;
    document.getElementById("screenPixelDepth").textContent = window.screen.pixelDepth;
    document.getElementById("devicePixelRatio").textContent = window.devicePixelRatio || 1;

    document.getElementById("logicalCores").textContent = navigator.hardwareConcurrency;
    document.getElementById("memory").textContent = navigator.deviceMemory || "null";
    document.getElementById("online").textContent = navigator.onLine;


    const orientation = screen.orientation?.type || "";
    const isPortrait = orientation.startsWith("portrait");
    document.getElementById("orientaiton").textContent = isPortrait ? "portrait" : "landscape";

}



window.addEventListener("resize", getAndDisplay);
getAndDisplay();