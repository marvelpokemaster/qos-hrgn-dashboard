// Apache ECharts Configuration Engine for QoS-HRGN Research Dashboard

let chartInstances = {};

function getChart(domId) {
    const el = document.getElementById(domId);
    if (!el) return null;
    if (chartInstances[domId]) {
        chartInstances[domId].dispose();
    }
    const chart = echarts.init(el, 'dark', { renderer: 'canvas' });
    chartInstances[domId] = chart;
    window.addEventListener('resize', () => chart.resize());
    return chart;
}

// 1. Leaderboard Multi-Model Bar Comparison
function renderLeaderboardChart(leaderboard) {
    const chart = getChart('chart-leaderboard');
    if (!chart || !leaderboard || !leaderboard.length) return;

    const names = leaderboard.map(r => r.experiment === 'full' ? 'QoS-HRGN (Ours)' : r.experiment);
    const wtScores = leaderboard.map(r => (parseFloat(r.Dice_WT_mean) * 100).toFixed(2));
    const tcScores = leaderboard.map(r => (parseFloat(r.Dice_TC_mean) * 100).toFixed(2));
    const etScores = leaderboard.map(r => (parseFloat(r.Dice_ET_mean) * 100).toFixed(2));

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: params => {
                let s = `<div class="font-bold mb-1">${params[0].name}</div>`;
                params.forEach(p => {
                    s += `<div style="color:${p.color}">● ${p.seriesName}: <b>${p.value}%</b></div>`;
                });
                return s;
            }
        },
        legend: {
            data: ['Whole Tumor (WT)', 'Tumor Core (TC)', 'Enhancing Tumor (ET)'],
            textStyle: { color: '#94A3B8' },
            top: 5
        },
        grid: { left: '3%', right: '4%', bottom: '5%', top: '15%', containLabel: true },
        xAxis: {
            type: 'category',
            data: names,
            axisLabel: { color: '#CBD5E1', fontSize: 11, interval: 0, rotate: names.length > 4 ? 15 : 0 }
        },
        yAxis: {
            type: 'value',
            min: 65,
            max: 100,
            name: 'Dice Score (%)',
            nameTextStyle: { color: '#94A3B8' },
            axisLabel: { color: '#94A3B8', formatter: '{value}%' },
            splitLine: { lineStyle: { color: '#1E293B' } }
        },
        series: [
            {
                name: 'Whole Tumor (WT)',
                type: 'bar',
                data: wtScores,
                itemStyle: { color: '#10B981', borderRadius: [4, 4, 0, 0] },
                barGap: '15%'
            },
            {
                name: 'Tumor Core (TC)',
                type: 'bar',
                data: tcScores,
                itemStyle: { color: '#F59E0B', borderRadius: [4, 4, 0, 0] }
            },
            {
                name: 'Enhancing Tumor (ET)',
                type: 'bar',
                data: etScores,
                itemStyle: { color: '#F43F5E', borderRadius: [4, 4, 0, 0] }
            }
        ]
    };
    chart.setOption(option);
}

// 2. 189-Patient Boxplot & Scatter Swarm
function renderPatientSwarmChart(patientMetrics, activeModel = 'full') {
    const chart = getChart('chart-patient-swarm');
    if (!chart || !patientMetrics || !patientMetrics.length) return;

    const filtered = patientMetrics.filter(r => r.experiment === activeModel);
    if (!filtered.length) return;

    const wtData = filtered.map(r => [0, parseFloat(r.Dice_WT) * 100, r.case_id, parseFloat(r.HD95_WT).toFixed(2)]);
    const tcData = filtered.map(r => [1, parseFloat(r.Dice_TC) * 100, r.case_id, parseFloat(r.HD95_TC).toFixed(2)]);
    const etData = filtered.map(r => [2, parseFloat(r.Dice_ET) * 100, r.case_id, parseFloat(r.HD95_ET).toFixed(2)]);

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            formatter: p => {
                const [_, dice, cid, hd95] = p.value;
                return `<div class="font-bold">${cid}</div>
                        <div>Region: <b>${p.seriesName}</b></div>
                        <div>Dice: <b style="color:${p.color}">${dice.toFixed(2)}%</b></div>
                        <div>HD95: <b>${hd95} mm</b></div>
                        <div class="text-xs text-cyan-400 mt-1">Click to inspect scan</div>`;
            }
        },
        grid: { left: '5%', right: '5%', bottom: '8%', top: '12%', containLabel: true },
        xAxis: {
            type: 'category',
            data: ['Whole Tumor (WT)', 'Tumor Core (TC)', 'Enhancing Tumor (ET)'],
            axisLabel: { color: '#E2E8F0', fontSize: 12, fontWeight: 600 }
        },
        yAxis: {
            type: 'value',
            min: 40,
            max: 100,
            name: 'Patient Dice (%)',
            nameTextStyle: { color: '#94A3B8' },
            axisLabel: { color: '#94A3B8', formatter: '{value}%' },
            splitLine: { lineStyle: { color: '#1E293B' } }
        },
        series: [
            {
                name: 'Whole Tumor (WT)',
                type: 'scatter',
                data: wtData.map(d => [d[0] + (Math.random() - 0.5) * 0.35, d[1], d[2], d[3]]),
                itemStyle: { color: 'rgba(16, 185, 129, 0.75)' },
                symbolSize: 7
            },
            {
                name: 'Tumor Core (TC)',
                type: 'scatter',
                data: tcData.map(d => [d[0] + (Math.random() - 0.5) * 0.35, d[1], d[2], d[3]]),
                itemStyle: { color: 'rgba(245, 158, 11, 0.75)' },
                symbolSize: 7
            },
            {
                name: 'Enhancing Tumor (ET)',
                type: 'scatter',
                data: etData.map(d => [d[0] + (Math.random() - 0.5) * 0.35, d[1], d[2], d[3]]),
                itemStyle: { color: 'rgba(244, 63, 94, 0.75)' },
                symbolSize: 7
            }
        ]
    };
    chart.setOption(option);

    chart.on('click', params => {
        if (params.value && params.value[2]) {
            const cid = params.value[2];
            if (window.selectPatientCase) {
                window.selectPatientCase(cid);
                window.switchTab('pacs');
            }
        }
    });
}

// 3. Modality Shapley Value Attributions
function renderShapleyChart(shapley) {
    const chart = getChart('chart-shapley');
    if (!chart || !shapley) return;

    const modalities = ['T1', 'T1ce', 'T2', 'FLAIR'];
    const wtMean = shapley.WT ? shapley.WT.mean : [0.08, 0.12, 0.18, 0.45];
    const tcMean = shapley.TC ? shapley.TC.mean : [0.05, 0.48, 0.15, 0.12];
    const etMean = shapley.ET ? shapley.ET.mean : [0.02, 0.76, 0.04, 0.06];

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: params => {
                let s = `<div class="font-bold mb-1">Modality: ${params[0].name}</div>`;
                params.forEach(p => {
                    s += `<div style="color:${p.color}">● ${p.seriesName}: <b>${(p.value * 100).toFixed(1)}% attribution</b></div>`;
                });
                return s;
            }
        },
        legend: {
            data: ['Whole Tumor (WT)', 'Tumor Core (TC)', 'Enhancing Tumor (ET)'],
            textStyle: { color: '#94A3B8' },
            top: 5
        },
        grid: { left: '3%', right: '4%', bottom: '5%', top: '15%', containLabel: true },
        xAxis: {
            type: 'category',
            data: modalities,
            axisLabel: { color: '#E2E8F0', fontSize: 12, fontWeight: 600 }
        },
        yAxis: {
            type: 'value',
            name: 'Normalized Shapley Value',
            nameTextStyle: { color: '#94A3B8' },
            axisLabel: { color: '#94A3B8' },
            splitLine: { lineStyle: { color: '#1E293B' } }
        },
        series: [
            {
                name: 'Whole Tumor (WT)',
                type: 'bar',
                data: wtMean,
                itemStyle: { color: '#10B981', borderRadius: [4, 4, 0, 0] }
            },
            {
                name: 'Tumor Core (TC)',
                type: 'bar',
                data: tcMean,
                itemStyle: { color: '#F59E0B', borderRadius: [4, 4, 0, 0] }
            },
            {
                name: 'Enhancing Tumor (ET)',
                type: 'bar',
                data: etMean,
                itemStyle: { color: '#F43F5E', borderRadius: [4, 4, 0, 0] }
            }
        ]
    };
    chart.setOption(option);
}

// 4. Dual-Axis SLIC Pareto Frontier Curve
function renderSlicParetoChart(slicData) {
    const chart = getChart('chart-slic-pareto');
    if (!chart || !slicData || !slicData.length) return;

    // Sort by segments
    const sorted = [...slicData].sort((a, b) => parseInt(a.n_segments_per_partition) - parseInt(b.n_segments_per_partition));
    const labels = sorted.map(r => `${parseInt(r.n_segments_per_partition)/1000}k`);
    const wtScores = sorted.map(r => (parseFloat(r.Dice_WT_mean) * 100).toFixed(2));
    const tcScores = sorted.map(r => (parseFloat(r.Dice_TC_mean) * 100).toFixed(2));
    const etScores = sorted.map(r => (parseFloat(r.Dice_ET_mean) * 100).toFixed(2));
    const nodes = sorted.map(r => Math.round(parseFloat(r.graph_nodes_mean || r.mean_nodes || 0)));

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            formatter: params => {
                let s = `<div class="font-bold mb-1">Supervoxels: ${params[0].name}</div>`;
                params.forEach(p => {
                    s += `<div style="color:${p.color}">● ${p.seriesName}: <b>${p.value} ${p.seriesName.includes('Nodes') ? 'nodes' : '%'}</b></div>`;
                });
                return s;
            }
        },
        legend: {
            data: ['WT Dice', 'TC Dice', 'ET Dice', 'Graph Nodes (Compute Cost)'],
            textStyle: { color: '#94A3B8' },
            top: 5
        },
        grid: { left: '4%', right: '5%', bottom: '8%', top: '15%', containLabel: true },
        xAxis: {
            type: 'category',
            data: labels,
            axisLabel: { color: '#E2E8F0', fontSize: 12, fontWeight: 600 },
            name: 'Supervoxel Resolution',
            nameLocation: 'middle',
            nameGap: 25,
            nameTextStyle: { color: '#94A3B8' }
        },
        yAxis: [
            {
                type: 'value',
                min: 60,
                max: 86,
                name: 'Validation Dice (%)',
                nameTextStyle: { color: '#94A3B8' },
                axisLabel: { color: '#94A3B8', formatter: '{value}%' },
                splitLine: { lineStyle: { color: '#1E293B' } }
            },
            {
                type: 'value',
                name: 'Graph Nodes',
                nameTextStyle: { color: '#06B6D4' },
                axisLabel: { color: '#06B6D4' },
                splitLine: { show: false }
            }
        ],
        series: [
            {
                name: 'WT Dice',
                type: 'line',
                data: wtScores,
                itemStyle: { color: '#10B981' },
                lineStyle: { width: 3 },
                symbolSize: 8
            },
            {
                name: 'TC Dice',
                type: 'line',
                data: tcScores,
                itemStyle: { color: '#F59E0B' },
                lineStyle: { width: 3 },
                symbolSize: 8
            },
            {
                name: 'ET Dice',
                type: 'line',
                data: etScores,
                itemStyle: { color: '#F43F5E' },
                lineStyle: { width: 3 },
                symbolSize: 8
            },
            {
                name: 'Graph Nodes (Compute Cost)',
                type: 'bar',
                yAxisIndex: 1,
                data: nodes,
                itemStyle: { color: 'rgba(6, 182, 212, 0.25)', borderRadius: [4, 4, 0, 0] },
                barWidth: 35
            }
        ]
    };
    chart.setOption(option);
}
