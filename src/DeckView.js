class DeckView {
    constructor(id, multiId) {
        this.id = id;
        this.container = document.getElementById(id);
        this.multiContainer = document.getElementById(multiId);

        // 1. 단일 덱 (Single Deck) DOM 요소
        this.vinyl = this.container.querySelector('.vinyl');
        this.speedSlider = this.container.querySelector('.speedSlider');
        this.speedValue = this.container.querySelector('.speedValue');
        this.fileInput = this.container.querySelector('.fileInput');
        this.uploadBtn = this.container.querySelector('.uploadBtn');
        this.progressSlider = this.container.querySelector('.progressSlider');
        this.currentTimeText = this.container.querySelector('.currentTime');
        this.durationText = this.container.querySelector('.duration');
        
        // 전송 및 제어 버튼
        this.playBtn = this.container.querySelector('.play-btn');
        this.pauseBtn = this.container.querySelector('.pause-btn');
        this.stopBtn = this.container.querySelector('.stop-btn');
        this.reverseBtn = this.container.querySelector('.reverse-btn');
        this.speedResetBtn = this.container.querySelector('.speed-reset-btn');
        
        // EQ 슬라이더
        this.volSlider = this.container.querySelector('.vol-slider');
        this.lowSlider = this.container.querySelector('.low-slider');
        this.midSlider = this.container.querySelector('.mid-slider');
        this.highSlider = this.container.querySelector('.high-slider');

        // 2. 멀티 덱 (Multi Deck) DOM 요소
        if (this.multiContainer) {
            this.waveContainer = this.multiContainer.querySelector('.audio-wave-viewer');
            this.barEditBtn = this.multiContainer.querySelector('.bar-edit-btn');
            this.bpmInput = this.multiContainer.querySelector('.bpm-input');
            this.bpmDisplay = this.multiContainer.querySelector('.bpm-viewr');
            this.syncBtn = this.multiContainer.querySelector('.sync-toggle-btn');
        }
    }

    /**
    *lp판을 회전시킵니다
    *@param {float} angle - 도수법
    */
    renderVinyl(angle) {
        if (this.vinyl) {
            this.vinyl.style.transform = `rotate(${angle % 360}deg)`;
        }
    }

    updateTime(timeStr) {
        if (this.currentTimeText) this.currentTimeText.textContent = timeStr;
    }

    /**
     * input.progressSlider 재생속도 바의 값을 컨트롤합니다.
     * @param {*} speedVal 
     */
    
    updateSpeedDisplay(speedVal) {
        if (this.speedValue) {
            this.speedValue.textContent = speedVal.toFixed(3);
        }
    }
    /**
     * this.bpmDisplay 텍스트 변경
     * this.bpmInput 변경
     * @param {*} bpm 
     */
    updateBPMDisplay(bpm) {
        // 화면 표출 시에만 소수점 첫째 자리로 가공
        const displayBpm = parseFloat(bpm).toFixed(1);
        
        if (this.bpmDisplay) this.bpmDisplay.textContent = `${displayBpm} BPM`;
        // input 창 내부의 텍스트도 가공된 값으로 할당
        if (this.bpmInput) this.bpmInput.value = displayBpm; 
    }

    /**
     * 곡의 진행 바 위치값을 컨트롤합니다.
     * this.progressSlider 값 변경
     * @param {*} percent 
     */
    updateProgress(percent) {
        if (this.progressSlider) this.progressSlider.value = percent;
    }

    /**
     * barEdit 클릭시 이벤트를 설정합니다.
     * @param {*} isActive 
     * @returns 
     */
    toggleBarEditUI(isActive) {
        if (!this.barEditBtn) return;
        this.barEditBtn.classList.toggle('active', isActive);
        this.barEditBtn.style.backgroundColor = isActive ? '#ff5722' : '';
        if (this.waveContainer) {
            this.waveContainer.style.cursor = isActive ? 'crosshair' : 'default';
        }
    }

    drawWaveform(audioBuffer, currentPosition, beatInterval, beatOffset, viewDuration) {
        if (!this.waveContainer || !audioBuffer) return;

        let canvas = this.waveContainer.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            this.waveContainer.appendChild(canvas);
        }
        const ctx = canvas.getContext('2d');

        const rect = this.waveContainer.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }

        const width = canvas.width;
        const height = canvas.height;
        const data = audioBuffer.getChannelData(0);

        ctx.clearRect(0, 0, width, height);

        // 파형 베이스라인
        ctx.beginPath();
        ctx.strokeStyle = '#4a4a4a';
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        const startTime = currentPosition - (viewDuration * 0.25);
        const endTime = startTime + viewDuration;

        // 파형 렌더링
        ctx.beginPath();
        // ctx.strokeStyle = this.id === 'deck-a' ? '#00e5ff' : '#ff007b';
        ctx.strokeStyle = '#dadadaaf';
        ctx.lineWidth = 2;

        for (let x = 0; x < width; x++) {
            const time = startTime + (x / width) * viewDuration;
            if (time < 0 || time >= audioBuffer.duration) continue;

            const index = Math.floor(time * audioBuffer.sampleRate);
            const val = data[index] || 0;
            const y = (val + 1) * height / 2;

            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // 비트 그리드 렌더링
        if (beatInterval > 0) {
            ctx.beginPath();
            // ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.strokeStyle = 'rgb(238, 0, 0)';
            // ctx.setLineDash([5, 5]); //점선 사용시
            ctx.setLineDash([]); //직선
            

            let firstBeatTime = Math.ceil(startTime / beatInterval) * beatInterval + beatOffset;
            while (firstBeatTime > startTime) {
                firstBeatTime -= beatInterval;
            }

            for (let t = firstBeatTime; t < endTime; t += beatInterval) {
                if (t < startTime) continue;
                const x = ((t - startTime) / viewDuration) * width;
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 현재 재생 지점 (고정선)
        const playheadX = width * 0.25;
        ctx.beginPath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
    }
}