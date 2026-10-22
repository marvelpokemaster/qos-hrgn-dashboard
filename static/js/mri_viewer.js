// Clinical PACS Slice Viewer & Interactive Canvas Engine

class PacsViewer {
    constructor(canvasId, hudId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.hud = document.getElementById(hudId);

        this.currentPatient = null;
        this.currentImageUrl = null;
        this.img = new Image();

        // Transform state
        this.scale = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;

        // Image filter state
        this.brightness = 100;
        this.contrast = 100;
        this.inverted = false;
        this.opacity = 100;

        this.initEvents();
    }

    initEvents() {
        this.canvas.addEventListener('mousedown', e => {
            this.isDragging = true;
            this.startX = e.clientX - this.panX;
            this.startY = e.clientY - this.panY;
        });

        window.addEventListener('mousemove', e => {
            if (!this.isDragging) return;
            this.panX = e.clientX - this.startX;
            this.panY = e.clientY - this.startY;
            this.render();
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const zoomFactor = 1.1;
            if (e.deltaY < 0) {
                this.scale = Math.min(this.scale * zoomFactor, 5.0);
            } else {
                this.scale = Math.max(this.scale / zoomFactor, 0.4);
            }
            this.render();
        });

        this.img.onload = () => {
            this.resetView();
        };
    }

    loadPatientImage(caseId, imageUrl, patientData = null) {
        this.currentPatient = caseId;
        this.currentImageUrl = imageUrl;
        this.img.src = imageUrl;
        this.updateHUD(caseId, patientData);
    }

    updateHUD(caseId, pdata) {
        if (!this.hud) return;
        if (!pdata) {
            this.hud.innerHTML = `
                <div class="flex items-center justify-between">
                    <div>
                        <div class="text-xs text-gray-400 uppercase font-semibold">Selected Subject</div>
                        <div class="text-lg font-bold text-cyan-400">${caseId}</div>
                    </div>
                </div>
            `;
            return;
        }

        const wt = (parseFloat(pdata.Dice_WT || 0) * 100).toFixed(1);
        const tc = (parseFloat(pdata.Dice_TC || 0) * 100).toFixed(1);
        const et = (parseFloat(pdata.Dice_ET || 0) * 100).toFixed(1);
        const hd95_wt = parseFloat(pdata.HD95_WT || 0).toFixed(1);

        this.hud.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <div class="text-xs text-gray-400 uppercase tracking-wider font-semibold">Subject Identifier</div>
                    <div class="text-xl font-bold text-cyan-400">${caseId}</div>
                    <div class="text-xs text-gray-400 mt-0.5">${pdata.reason || 'Held-out Test Cohort'}</div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="px-3 py-1.5 rounded-lg badge-wt tabular-nums text-center">
                        <div class="text-xs font-semibold">WT Dice</div>
                        <div class="text-base font-bold">${wt}%</div>
                    </div>
                    <div class="px-3 py-1.5 rounded-lg badge-tc tabular-nums text-center">
                        <div class="text-xs font-semibold">TC Dice</div>
                        <div class="text-base font-bold">${tc}%</div>
                    </div>
                    <div class="px-3 py-1.5 rounded-lg badge-et tabular-nums text-center">
                        <div class="text-xs font-semibold">ET Dice</div>
                        <div class="text-base font-bold">${et}%</div>
                    </div>
                    <div class="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 tabular-nums text-center">
                        <div class="text-xs font-semibold text-gray-400">WT HD95</div>
                        <div class="text-base font-bold text-gray-200">${hd95_wt} mm</div>
                    </div>
                </div>
            </div>
        `;
    }

    resetView() {
        if (!this.img.width || !this.img.height) return;
        const cw = this.canvas.width = this.canvas.parentElement.clientWidth;
        const ch = this.canvas.height = this.canvas.parentElement.clientHeight || 560;

        const ratio = Math.min(cw / this.img.width, ch / this.img.height) * 0.95;
        this.scale = ratio;
        this.panX = (cw - this.img.width * this.scale) / 2;
        this.panY = (ch - this.img.height * this.scale) / 2;
        this.render();
    }

    setFilter(brightness, contrast, inverted, opacity) {
        this.brightness = brightness;
        this.contrast = contrast;
        this.inverted = inverted;
        this.opacity = opacity;
        this.render();
    }

    render() {
        if (!this.img.complete || !this.img.naturalWidth) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.translate(this.panX, this.panY);
        this.ctx.scale(this.scale, this.scale);

        let filterStr = `brightness(${this.brightness}%) contrast(${this.contrast}%)`;
        if (this.inverted) filterStr += ' invert(100%)';
        this.ctx.filter = filterStr;
        this.ctx.globalAlpha = this.opacity / 100;

        this.ctx.drawImage(this.img, 0, 0);
        this.ctx.restore();
    }
}

window.PacsViewer = PacsViewer;
