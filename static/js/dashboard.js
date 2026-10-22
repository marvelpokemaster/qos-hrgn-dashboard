// Main Dashboard Controller & Application State

let globalManifest = null;
let pacsViewer = null;
let currentPatientIndex = 0;
let qualitativeCases = [];
let showDeltas = false;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Canvas Viewer
    pacsViewer = new PacsViewer('pacs-canvas', 'pacs-hud');

    // 2. Fetch Data Manifest
    try {
        const resp = await fetch('/api/manifest');
        globalManifest = await resp.json();
        initDashboard();
    } catch (err) {
        console.error('Failed to load manifest:', err);
    }

    // 3. Setup Keyboard Shortcuts
    setupKeyboardShortcuts();
});

function initDashboard() {
    if (!globalManifest) return;

    // A. Animate KPI Counters
    animateCounter('kpi-wt-dice', globalManifest.kpis.wt_dice * 100, '%');
    animateCounter('kpi-tc-dice', globalManifest.kpis.tc_dice * 100, '%');
    animateCounter('kpi-et-dice', globalManifest.kpis.et_dice * 100, '%');
    animateCounter('kpi-et-hd95', globalManifest.kpis.et_hd95, ' mm', 1);

    // B. Setup Qualitative Patient Selector
    setupPatientSelector();

    // C. Render Tables
    renderLeaderboardTable();

    // D. Initialize Default Charts
    renderLeaderboardChart(globalManifest.leaderboard);
    renderPatientSwarmChart(globalManifest.patient_metrics, 'full');
    renderShapleyChart(globalManifest.shapley);
    renderSlicParetoChart(globalManifest.slic_pilot);

    // E. Populate XAI & SLIC images
    populateGalleryImages();
}

// Tab Switching
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('bg-cyan-500/10', 'text-cyan-400', 'border-cyan-500');
        btn.classList.add('text-gray-400', 'border-transparent');
    });

    const activeContent = document.getElementById(`tab-content-${tabId}`);
    const activeButton = document.getElementById(`tab-btn-${tabId}`);

    if (activeContent) activeContent.classList.remove('hidden');
    if (activeButton) {
        activeButton.classList.add('bg-cyan-500/10', 'text-cyan-400', 'border-cyan-500');
        activeButton.classList.remove('text-gray-400', 'border-transparent');
    }

    // Trigger chart resize on tab reveal
    setTimeout(() => {
        if (tabId === 'benchmark') {
            renderLeaderboardChart(globalManifest.leaderboard);
            renderPatientSwarmChart(globalManifest.patient_metrics, document.getElementById('swarm-model-select')?.value || 'full');
        } else if (tabId === 'xai') {
            renderShapleyChart(globalManifest.shapley);
        } else if (tabId === 'slic') {
            renderSlicParetoChart(globalManifest.slic_pilot);
        } else if (tabId === 'pacs' && pacsViewer) {
            pacsViewer.resetView();
        }
    }, 50);
}
window.switchTab = switchTab;

// Counter Animation
function animateCounter(id, target, suffix = '', decimals = 2) {
    const el = document.getElementById(id);
    if (!el) return;
    let start = 0;
    const duration = 1200;
    const stepTime = 20;
    const steps = duration / stepTime;
    const increment = target / steps;

    const timer = setInterval(() => {
        start += increment;
        if (start >= target) {
            start = target;
            clearInterval(timer);
        }
        el.textContent = start.toFixed(decimals) + suffix;
    }, stepTime);
}

// Patient Selector & PACS Integration
function setupPatientSelector() {
    const select = document.getElementById('patient-selector');
    if (!select || !globalManifest.qualitative_cases) return;

    qualitativeCases = globalManifest.qualitative_cases;
    select.innerHTML = '';

    qualitativeCases.forEach((c, idx) => {
        const opt = document.createElement('option');
        opt.value = c.case_id;
        opt.textContent = `${c.case_id} — ${c.reason || 'Held-out Case'}`;
        select.appendChild(opt);
    });

    select.addEventListener('change', e => {
        selectPatientCase(e.target.value);
    });

    // Select first case
    if (qualitativeCases.length > 0) {
        selectPatientCase(qualitativeCases[0].case_id);
    }
}

function selectPatientCase(caseId) {
    const idx = qualitativeCases.findIndex(c => c.case_id === caseId);
    if (idx !== -1) currentPatientIndex = idx;

    const select = document.getElementById('patient-selector');
    if (select) select.value = caseId;

    const imageUrl = globalManifest.images.qualitative[caseId];
    if (imageUrl) {
        const pmetrics = (globalManifest.patient_metrics || []).find(p => p.case_id === caseId && p.experiment === 'full');
        const reasonObj = qualitativeCases.find(c => c.case_id === caseId);
        const combinedData = Object.assign({}, pmetrics || {}, { reason: reasonObj?.reason });

        pacsViewer.loadPatientImage(caseId, imageUrl, combinedData);
    }
}
window.selectPatientCase = selectPatientCase;

// Render Leaderboard Table with Delta Toggle
function renderLeaderboardTable() {
    const tbody = document.getElementById('leaderboard-tbody');
    if (!tbody || !globalManifest.leaderboard) return;

    const baseline = globalManifest.leaderboard.find(r => r.experiment === 'full');
    const baseWT = baseline ? parseFloat(baseline.Dice_WT_mean) * 100 : 0;
    const baseTC = baseline ? parseFloat(baseline.Dice_TC_mean) * 100 : 0;
    const baseET = baseline ? parseFloat(baseline.Dice_ET_mean) * 100 : 0;
    const baseHD95 = baseline ? parseFloat(baseline.HD95_ET_mean) : 0;

    tbody.innerHTML = '';
    globalManifest.leaderboard.forEach(row => {
        const isFull = row.experiment === 'full';
        const isSegRes = row.experiment === 'segresnet';

        const wt = (parseFloat(row.Dice_WT_mean) * 100).toFixed(2);
        const tc = (parseFloat(row.Dice_TC_mean) * 100).toFixed(2);
        const et = (parseFloat(row.Dice_ET_mean) * 100).toFixed(2);
        const hd95_wt = parseFloat(row.HD95_WT_mean).toFixed(2);
        const hd95_tc = parseFloat(row.HD95_TC_mean).toFixed(2);
        const hd95_et = parseFloat(row.HD95_ET_mean).toFixed(2);

        let deltaWT = '', deltaTC = '', deltaET = '', deltaHD = '';
        if (showDeltas && !isFull) {
            const dWT = (parseFloat(wt) - baseWT).toFixed(2);
            const dTC = (parseFloat(tc) - baseTC).toFixed(2);
            const dET = (parseFloat(et) - baseET).toFixed(2);
            const dHD = (parseFloat(hd95_et) - baseHD95).toFixed(2);

            deltaWT = `<span class="text-xs ${dWT >= 0 ? 'text-emerald-400' : 'text-rose-400'} ml-1">(${dWT >= 0 ? '+' : ''}${dWT}%)</span>`;
            deltaTC = `<span class="text-xs ${dTC >= 0 ? 'text-emerald-400' : 'text-rose-400'} ml-1">(${dTC >= 0 ? '+' : ''}${dTC}%)</span>`;
            deltaET = `<span class="text-xs ${dET >= 0 ? 'text-emerald-400' : 'text-rose-400'} ml-1">(${dET >= 0 ? '+' : ''}${dET}%)</span>`;
            deltaHD = `<span class="text-xs ${dHD <= 0 ? 'text-emerald-400' : 'text-rose-400'} ml-1">(${dHD <= 0 ? '' : '+'}${dHD})</span>`;
        }

        const tr = document.createElement('tr');
        tr.className = `border-b border-gray-800 ${isFull ? 'bg-cyan-950/20 font-semibold' : 'hover:bg-gray-800/40'}`;

        let nameDisplay = row.experiment;
        if (isFull) {
            nameDisplay = `<span class="text-cyan-400 flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>QoS-HRGN (Ours)</span>`;
        } else if (isSegRes) {
            nameDisplay = `<span class="text-purple-400 font-semibold">SegResNet (SOTA 3D CNN)</span>`;
        }

        tr.innerHTML = `
            <td class="py-3 px-4">${nameDisplay}</td>
            <td class="py-3 px-4 tabular-nums text-emerald-400 font-medium">${wt}% ${deltaWT}</td>
            <td class="py-3 px-4 tabular-nums text-amber-400 font-medium">${tc}% ${deltaTC}</td>
            <td class="py-3 px-4 tabular-nums text-rose-400 font-medium">${et}% ${deltaET}</td>
            <td class="py-3 px-4 tabular-nums text-gray-300">${hd95_wt}</td>
            <td class="py-3 px-4 tabular-nums text-gray-300">${hd95_tc}</td>
            <td class="py-3 px-4 tabular-nums text-cyan-300 font-semibold">${hd95_et} ${deltaHD}</td>
        `;
        tbody.appendChild(tr);
    });
}

function toggleDeltas() {
    showDeltas = !showDeltas;
    const btn = document.getElementById('btn-toggle-deltas');
    if (btn) {
        btn.textContent = showDeltas ? 'Hide Δ vs QoS-HRGN' : 'Show Δ vs QoS-HRGN';
        btn.classList.toggle('bg-cyan-500/20', showDeltas);
    }
    renderLeaderboardTable();
}
window.toggleDeltas = toggleDeltas;

// Populate static XAI & SLIC images from manifest
function populateGalleryImages() {
    if (!globalManifest.images) return;

    // XAI Figures
    const localGraphImg = document.getElementById('img-local-graph');
    if (localGraphImg && globalManifest.images.xai['reports/local_graph.png']) {
        localGraphImg.src = globalManifest.images.xai['reports/local_graph.png'];
    }

    const hopDistImg = document.getElementById('img-hop-dist');
    if (hopDistImg && globalManifest.images.xai['reports/hop_distributions.png']) {
        hopDistImg.src = globalManifest.images.xai['reports/hop_distributions.png'];
    }

    const gateSummaryImg = document.getElementById('img-gate-summary');
    if (gateSummaryImg && globalManifest.images.xai['reports/gate_hop_summary.png']) {
        gateSummaryImg.src = globalManifest.images.xai['reports/gate_hop_summary.png'];
    }

    // SLIC Pareto figure
    const slicCostImg = document.getElementById('img-slic-cost');
    if (slicCostImg && globalManifest.images.slic['slic_pilot/reports/val_slic_performance_cost.png']) {
        slicCostImg.src = globalManifest.images.slic['slic_pilot/reports/val_slic_performance_cost.png'];
    }
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
    window.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

        if (e.key === '1') switchTab('pacs');
        if (e.key === '2') switchTab('benchmark');
        if (e.key === '3') switchTab('xai');
        if (e.key === '4') switchTab('slic');

        if (e.key === 'ArrowRight' || e.key === ']') {
            if (qualitativeCases.length > 0) {
                currentPatientIndex = (currentPatientIndex + 1) % qualitativeCases.length;
                selectPatientCase(qualitativeCases[currentPatientIndex].case_id);
            }
        } else if (e.key === 'ArrowLeft' || e.key === '[') {
            if (qualitativeCases.length > 0) {
                currentPatientIndex = (currentPatientIndex - 1 + qualitativeCases.length) % qualitativeCases.length;
                selectPatientCase(qualitativeCases[currentPatientIndex].case_id);
            }
        } else if (e.key === 'f' || e.key === 'F') {
            toggleFullscreen();
        }
    });
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.log(err));
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}
window.toggleFullscreen = toggleFullscreen;
