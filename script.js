class VinylDeck {
    constructor(id) {
        this.id = id;
        this.container = document.getElementById(id);
        this.isPlaying = false;
        this.currentPosition = 0;
        this.lastUpdateTime = 0;
        this.currentAngle = 0;
        this.isDragging = false;
        this.dragVelocity = 0;
        this.brakeVelocity = 0;
        
        this.config = {
            tempo_rate: 10,
            lp_sensitivity: 0.3,
            brake_force: 0.85,
            friction: 0.95
        };

        this.initDOM();
        this.initEvents();
    }

    initDOM() {
        this.vinyl = this.container.querySelector('.vinyl');
        this.speedSlider = this.container.querySelector('.speedSlider');
        this.speedValue = this.container.querySelector('.speedValue');
        this.fileInput = this.container.querySelector('.fileInput');
        this.uploadBtn = this.container.querySelector('.uploadBtn');
        this.progressSlider = this.container.querySelector('.progressSlider');
        this.currentTimeText = this.container.querySelector('.currentTime');
        this.durationText = this.container.querySelector('.duration');

        const suffix = this.id.split('-')[1]; // 'a' 또는 'b'
    
        this.volSlider = document.getElementById(`vol-${suffix}`);
        this.lowSlider = document.getElementById(`low-${suffix}`);
        this.midSlider = document.getElementById(`mid-${suffix}`);
        this.highSlider = document.getElementById(`high-${suffix}`);
    }

    initEvents() {
        this.uploadBtn.onclick = () => this.fileInput.click();
        this.fileInput.onchange = (e) => this.handleFile(e.target.files[0]);
        
        this.vinyl.onmousedown = (e) => this.startDragging(e);
        window.addEventListener('mousemove', (e) => this.drag(e));
        window.addEventListener('mouseup', () => this.stopDragging());

        this.speedSlider.oninput = () => {
            this.speedValue.textContent = parseFloat(this.speedSlider.value).toFixed(3);
        };
    }

    async initAudio() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // 1. 게인 노드 (볼륨) 생성
            this.gainNode = this.audioCtx.createGain();
            
            // 2. EQ 필터 노드들 생성 (High, Mid, Low)
            this.eqHigh = this.createFilter('highshelf', 3000);
            this.eqMid = this.createFilter('peaking', 1000);
            this.eqLow = this.createFilter('lowshelf', 150);

            // 3. 필터 체인 연결: Source -> Low -> Mid -> High -> Gain -> Destination
            this.eqLow.connect(this.eqMid);
            this.eqMid.connect(this.eqHigh);
            this.eqHigh.connect(this.gainNode);
            this.gainNode.connect(this.audioCtx.destination);
        }
        
    }
    createFilter(type, frequency) {
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.Q.value = 1;
        filter.gain.value = 0; // 기본값 0dB
        return filter;
    }

    async handleFile(file) {
        if (!file) return;
        await this.initAudio();
        const arrayBuffer = await file.arrayBuffer();
        this.audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        this.createReversedBuffer();
        this.playBuffer();
    }

    createReversedBuffer() {
        this.reversedBuffer = this.audioCtx.createBuffer(
            this.audioBuffer.numberOfChannels, this.audioBuffer.length, this.audioBuffer.sampleRate
        );
        for (let i = 0; i < this.audioBuffer.numberOfChannels; i++) {
            const data = this.audioBuffer.getChannelData(i);
            const revData = this.reversedBuffer.getChannelData(i);
            for (let j = 0; j < this.audioBuffer.length; j++) {
                revData[j] = data[this.audioBuffer.length - 1 - j];
            }
        }
    }

    playBuffer() {
        if (this.sourceNode) this.sourceNode.stop();
        this.sourceNode = this.audioCtx.createBufferSource();
        const speed = parseFloat(this.speedSlider.value);
        this.sourceNode.buffer = speed < 0 ? this.reversedBuffer : this.audioBuffer;
        this.sourceNode.connect(this.filterNode);
        
        const offset = speed < 0 ? (this.audioBuffer.duration - this.currentPosition) : this.currentPosition;
        this.sourceNode.start(0, Math.max(0, offset));
        this.lastUpdateTime = this.audioCtx.currentTime;
        this.isPlaying = true;
        this.updateUI();
    }

    updateUI() {
        if (!this.isPlaying) return;

        let baseSpeed = parseFloat(this.speedSlider.value);
        let effectiveSpeed;

        if (this.isDragging) {
            this.brakeVelocity *= this.config.brake_force;
            effectiveSpeed = this.brakeVelocity + this.dragVelocity;
        } else {
            this.dragVelocity *= this.config.friction;
            effectiveSpeed = baseSpeed + this.dragVelocity;
        }

        effectiveSpeed = Math.max(Math.min(effectiveSpeed, this.config.tempo_rate), -this.config.tempo_rate);
        
        // 오디오 필터 및 속도 적용
        if (this.filterNode) {
            let cutoff = Math.max(2000, 20000 - Math.abs(effectiveSpeed) * 3000);
            this.filterNode.frequency.setTargetAtTime(cutoff, this.audioCtx.currentTime, 0.1);
        }

        let now = this.audioCtx.currentTime;
        let deltaTime = now - this.lastUpdateTime;
        this.lastUpdateTime = now;

        this.currentPosition += deltaTime * effectiveSpeed;
        this.renderVinyl(effectiveSpeed, deltaTime);

        if (this.sourceNode) {
            this.sourceNode.playbackRate.value = Math.max(0.001, Math.abs(effectiveSpeed));
            this.speedValue.textContent = effectiveSpeed.toFixed(3);
        }

        // 진행 바 업데이트
        const progress = (this.currentPosition / this.audioBuffer.duration) * 100;
        this.progressSlider.value = progress;
        this.currentTimeText.textContent = this.formatTime(this.currentPosition);

        requestAnimationFrame(() => this.updateUI());
    }

    renderVinyl(speed, deltaTime) {
        const rotationPerSecond = 360 / 1.8;
        this.currentAngle += rotationPerSecond * speed * deltaTime;
        this.vinyl.style.transform = `rotate(${this.currentAngle % 360}deg)`;
    }

    startDragging(e) {
        if (!this.isPlaying) return;
        this.isDragging = true;
        this.brakeVelocity = parseFloat(this.speedSlider.value) + this.dragVelocity;
        const rect = this.vinyl.getBoundingClientRect();
        this.centerX = rect.left + rect.width / 2;
        this.centerY = rect.top + rect.height / 2;
        this.lastAngle = Math.atan2(e.clientY - this.centerY, e.clientX - this.centerX) * 180 / Math.PI;
    }

    drag(e) {
        if (!this.isDragging) return;
        const currentMouseAngle = Math.atan2(e.clientY - this.centerY, e.clientX - this.centerX) * 180 / Math.PI;
        let delta = currentMouseAngle - this.lastAngle;
        if (delta > 180) delta -= 360;
        else if (delta < -180) delta += 360;
        this.dragVelocity = delta * this.config.lp_sensitivity;
        this.lastAngle = currentMouseAngle;
    }

    stopDragging() {
        this.isDragging = false;
    }

    formatTime(sec) {
        const m = Math.floor(Math.max(0, sec) / 60);
        const s = Math.floor(Math.max(0, sec) % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }
}

const deckA = new VinylDeck('deck-a');
const deckB = new VinylDeck('deck-b');