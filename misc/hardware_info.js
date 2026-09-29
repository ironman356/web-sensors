const values = Object.fromEntries(
    [...document.querySelectorAll("[data-value]")].map((element) => [element.dataset.value, element])
);

const formatNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const pixels = (width, height) => `${formatNumber.format(width)} × ${formatNumber.format(height)} px`;

function display(name, value, suffix = "") {
    const element = values[name];
    const unavailable = value === undefined || value === null || value === "";
    element.textContent = unavailable ? "Not exposed" : `${value}${suffix}`;
    element.classList.toggle("unavailable", unavailable);
}

function readGraphics() {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");

    if (!gl) {
        ["gpuRenderer", "gpuVendor", "webglVersion", "maxTextureSize"].forEach((name) => display(name));
        return;
    }

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    display("gpuRenderer", debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    display("gpuVendor", debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR));
    display("webglVersion", gl.getParameter(gl.VERSION));
    const maxTextureSize = formatNumber.format(gl.getParameter(gl.MAX_TEXTURE_SIZE));
    display("maxTextureSize", `${maxTextureSize} × ${maxTextureSize} px`);
}

function refresh() {
    const ratio = window.devicePixelRatio || 1;
    const orientationType = screen.orientation?.type;
    const orientation = orientationType
        ? orientationType.replace("-primary", "").replace("-secondary", " secondary")
        : matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape";
    const visualViewport = window.visualViewport;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const platform = navigator.userAgentData?.platform || navigator.platform;
    const isMobile = navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

    display("screenSize", pixels(screen.width, screen.height));
    display("availableScreen", pixels(screen.availWidth, screen.availHeight));
    display("pixelRatio", `${formatNumber.format(ratio)}×`);
    display("nativeResolution", pixels(Math.round(screen.width * ratio), Math.round(screen.height * ratio)));
    display("colorDepth", screen.colorDepth, " bits");
    display("orientation", orientation);

    display("layoutViewport", pixels(window.innerWidth, window.innerHeight));
    display("visualViewport", visualViewport ? pixels(Math.round(visualViewport.width), Math.round(visualViewport.height)) : undefined);
    display("documentArea", pixels(document.documentElement.clientWidth, document.documentElement.clientHeight));
    display("viewportScale", visualViewport ? `${formatNumber.format(visualViewport.scale)}×` : undefined);

    display("platform", platform);
    display("logicalCores", navigator.hardwareConcurrency);
    display("memory", navigator.deviceMemory, " GB");
    display("touchPoints", navigator.maxTouchPoints);
    display("deviceClass", isMobile ? "Mobile" : "Desktop / laptop");

    display("networkStatus", navigator.onLine ? "Connected" : "Offline");
    display("connectionType", connection?.type);
    display("effectiveType", connection?.effectiveType?.toUpperCase());
    display("downlink", connection?.downlink, " Mbps");
    display("rtt", connection?.rtt, " ms");
    display("saveData", connection ? (connection.saveData ? "On" : "Off") : undefined);

    display("language", navigator.languages?.join(", ") || navigator.language);
    display("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone);
    display("cookies", navigator.cookieEnabled ? "Enabled" : "Disabled");
    display("secureContext", window.isSecureContext ? "Yes" : "No");
    display("crossOriginIsolated", window.crossOriginIsolated ? "Yes" : "No");
    display("userAgent", navigator.userAgent);
}

const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
window.addEventListener("resize", refresh);
window.addEventListener("online", refresh);
window.addEventListener("offline", refresh);
screen.orientation?.addEventListener("change", refresh);
window.visualViewport?.addEventListener("resize", refresh);
connection?.addEventListener("change", refresh);
document.getElementById("refresh").addEventListener("click", refresh);

readGraphics();
refresh();
