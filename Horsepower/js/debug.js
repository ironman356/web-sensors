



export function debugChartInit(chartElId, lineLabels, yAxisLabel, CHARTCUTOFF = 5000) {
    const chartEl = document.getElementById(chartElId);

    const colors = ["red","green","blue","yellow","cyan","magenta"];
    const series = lineLabels.map((label, i) => ({
        name: label,
        type: 'line',
        showSymbol: false,
        data: [],
        lineStyle: { color: colors[i % colors.length], width: 1 },
        smooth: false
    }));

    const chart = echarts.init(chartEl);
    chart.setOption({
        animation: false,
        tooltip: { show: false },
        grid: {
            top: '5%',
            bottom: '5%',
            left: '5%',
            right: '5%',
            containLabel: true
        },
        xAxis: { type: 'time', show: false },
        yAxis: {
            name: yAxisLabel,
            scale: true,
            nameLocation: 'middle',    // 'start', 'middle', 'end'
            nameGap: 0,               // distance from axis line
            nameTextStyle: { fontSize: 12 },
            axisLabel: { margin: 30 }
        },
        series
    });

    const buffers = lineLabels.map(() => []);
    const fullData = lineLabels.map(() => []);

    chart._buffers = buffers;
    chart._fullData = fullData;
    chart._CHARTCUTOFF = CHARTCUTOFF;

    setInterval(() => {
        let newestTimestamp = 0;
        // newest timestamp from all series
        fullData.forEach(series => {
            if (series.length) {
                const ts = series[series.length - 1][0];
                if (ts > newestTimestamp) newestTimestamp = ts;
            }
        });

        for (let i = 0; i < buffers.length; i++) {
            const buf = buffers[i];
            if (buf.length) {
                fullData[i].push(...buf);
                buffers[i] = [];

                // remove old points beyond cutoff
                while (fullData[i].length && fullData[i][0][0] < newestTimestamp - CHARTCUTOFF) {
                    fullData[i].shift();
                }

                chart.setOption({
                    series: [{
                        name: lineLabels[i],
                        data: fullData[i]
                    }]
                });
            }
        }
    }, 1000 / 60); // 60hz

    chart.pushData = (seriesIndex, timestamp, value) => {
        buffers[seriesIndex].push([timestamp, value]);
    };

    chart.setData = (seriesIndex, data) => {
        fullData[seriesIndex] = data;
        buffers[seriesIndex] = [];
        chart.setOption({
            series: [{
                name: lineLabels[seriesIndex],
                data
            }]
        });
    };

    return chart;
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

        document.getElementById(videoElId).srcObject = stream;
    } catch (err) {
        console.error(err);
        alert("Could not start 'Back Ultra Wide Camera':" + err.message);
    }
}

export function debugTableAdd(category, msg, timestamp = Date.now(), tableRef, clearOlderThanMillis = -1) {
    // remove old rows if desired
    if (clearOlderThanMillis >=  0) {
        const rowCleanupThres = Date.now() - clearOlderThanMillis;
        Array.from(tableRef.rows).forEach(row => {
            const rowTimeCell = row.cells[2];
            const rowTime = rowTimeCell ? Number(rowTimeCell.textContent) : NaN;
            
            if (rowTime < rowCleanupThres) {
                row.remove();
            }
        });
    }

    const newRow = tableRef.insertRow(1); // 1 because of top head/label row
    newRow.insertCell().textContent = category;
    newRow.insertCell().textContent = msg;
    newRow.insertCell().textContent = timestamp;
}