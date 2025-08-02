

export function debugChartInit(chartElId, lineLabels, yAxisLabel) {
    const ctx = document.getElementById(chartElId).getContext('2d');
    return new Chart(ctx, {
        type: "line",
        data: {
            datasets:
                lineLabels.map((label, i) => ({
                    label,
                    data: [],
                    borderColor: ["red","blue","green","black","orange","purple"][i % 6],
                    borderWidth: 1,
                    tension: 0,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                }))
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
                    title: { display: true, text: yAxisLabel },
                    beginAtZero: false
                }
            },
            plugins: {
                legend: {
                    labels: {
                        font: {
                            size: 10
                        }
                    }
                }
            }
        },
    });
}

const CHARTCUTOFF = 5_000;
export function debugChartSetData(chart, datasetIndex, data) {
    // chart.data.datasets[datasetIndex].data.push({ x: timestamp, y: value });
    chart.data.datasets[datasetIndex].data = data; 

    const cutoff = data[data.length - 1].x - CHARTCUTOFF;
    chart.data.datasets.forEach(ds => {
        ds.data = ds.data.filter(pt => pt.x >= cutoff);
    });

    // chart.options.scales.x.min = cutoff;
    chart.update(datasetIndex === 0 ? 'none' : undefined);
}

export function debugChartPushData(chart, datasetIndex, timestamp, value) {
    chart.data.datasets[datasetIndex].data.push({ x: timestamp, y: value });

    const cutoff = timestamp - CHARTCUTOFF;
    chart.data.datasets.forEach(ds => {
        ds.data = ds.data.filter(pt => pt.x >= cutoff);
    });

    // chart.options.scales.x.min = cutoff;
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
            video: { deviceId: { exact: target.deviceId }, width: { ideal: 200*3 }, height: { ideal: 380*3 }, frameRate: { ideal: 60 } } // sized for portrait mount & phone size
        });

        const info = JSON.stringify(stream.getVideoTracks()[0].getSettings(), null, 2)
        document.getElementById("fineTune").textContent = `vidSettings ${info}`;

        document.getElementById(videoElId).srcObject = stream;
    } catch (err) {
        console.error(err);
        alert("Could not start 'Back Ultra Wide Camera':" + err.message);
    }
}