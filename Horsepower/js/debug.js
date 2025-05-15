

export function debugChartInit() {
    const ctx = document.getElementById("debugGraph").getContext('2d');
    return new Chart(ctx, {
        type: "line",
        data: {
            datasets: [
                {
                    label: "GPS",
                    data: [],
                    borderColor: "red",
                    borderWidth: 2,
                    tension: 0,
                    pointRadius: 0,
                    pointHoverRadius: 0
                },
                {
                    label: "CALC",
                    data: [],
                    borderColor: "blue",
                    borderWidth: 2,
                    tension: 0,
                    pointRadius: 0,
                    pointHoverRadius: 0
                }
            ],
        },
        options: {
            responsive: true,
            animation: false,
            transitions: {
                'default': false
            },
            elements: {
                line: {
                    fill: false
                }
            },
            scales: {
                x: {
                    type: 'time',
                    display: false
                },
                y: {
                    title: { display: true, text: "Speed" },
                    beginAtZero: false
                }
            },
        },
    });
}


export function pushData(chart, datasetIndex, timestamp, value) {
    chart.data.datasets[datasetIndex].data.push({ x: timestamp, y: value });

    const cutoff = timestamp - 5_000;
    chart.data.datasets.forEach(ds => {
        ds.data = ds.data.filter(pt => pt.x >= cutoff);
    });

    chart.options.scales.x.min = cutoff;
    chart.update(datasetIndex === 0 ? 'none' : undefined);
}

export async function startDebugCamera(videoElId) {
    try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        const target = videoDevices.find(d =>
            d.label.toLowerCase().includes('back ultra wide camera')
        );

        if (!target) {
            throw new Error("Back Ultra Wide Camera not found");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: target.deviceId } }
        });

        document.getElementById(videoElId).srcObject = stream;
    } catch (err) {
        console.error(err);
        alert("Could not start 'Back Ultra Wide Camera':" + err.message);
    }
}