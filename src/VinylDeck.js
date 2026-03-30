class VinylDeck {
    constructor(id, multiId) {
        this.id = id;
        this.engine = new AudioEngine();
        this.view = new DeckView(id, multiId);

        this.state = {
            isPlaying: false,
            reverse: false,
            currentPosition: 0,
            lastUpdateTime: 0,
            currentAngle: 0,
            isDragging: false,
            dragVelocity: 0,
            bpm: 120,
            beatOffset: 0,
            beatInterval: 60 / 120,
            isBarEditing: false,
            isSyncing: false
        };

        this.config = {
            tempo_rate: 10,
            lp_sensitivity: 0.3,
            friction: 0.95,
            viewDuration: 1,
        };

        this.initEvents();
    }

    initEvents() {
        const { view, state, engine } = this;

        // 업로드
        if (view.uploadBtn && view.fileInput) {
            view.uploadBtn.onclick = () => view.fileInput.click();
            view.fileInput.onchange = (e) => this.handleFile(e.target.files[0]);
        }

        // 제어 버튼
        if (view.playBtn) {
            view.playBtn.onclick = () => {
                if (!engine.audioBuffer) return;
                if (state.reverse) {
                    state.reverse = false;
                    const currentVal = parseFloat(view.speedSlider.value);
                    view.updateSpeedDisplay(currentVal * -1);
                }
                if (!state.isPlaying) {
                    if (state.currentPosition >= engine.audioBuffer.duration) state.currentPosition = 0;
                    this.playBuffer();
                }
            };
        }

        if (view.stopBtn) {
            view.stopBtn.onclick = () => {
                state.isPlaying = false;
                state.reverse = false;
                engine.stop();
            };
        }

        if (view.reverseBtn) {
            view.reverseBtn.onclick = () => {
                if (!engine.audioBuffer) return;
                const nextVal = parseFloat(view.speedSlider.value) * -1;
                view.updateSpeedDisplay(nextVal);
                if (state.isPlaying) this.playBuffer();
            };
        }

        // 슬라이더 조작
        if (view.speedSlider) {
            view.speedSlider.oninput = () => view.updateSpeedDisplay(parseFloat(view.speedSlider.value));
        }

        if (view.volSlider) {
            view.volSlider.oninput = (e) => engine.setGain(parseFloat(e.target.value));
        }

        ['low', 'mid', 'high'].forEach(type => {
            const slider = view[`${type}Slider`];
            if (slider) {
                slider.oninput = (e) => engine.setFilterGain(type, parseFloat(e.target.value));
            }
        });

        // LP 스크래치 드래그 이벤트
        if (view.vinyl) {
            view.vinyl.onmousedown = (e) => this.startDragging(e);
            window.addEventListener('mousemove', (e) => this.drag(e));
            window.addEventListener('mouseup', () => this.stopDragging());
        }

        // 멀티덱 전용 이벤트
        if (view.barEditBtn) {
            view.barEditBtn.onclick = () => {
                state.isBarEditing = !state.isBarEditing;
                view.toggleBarEditUI(state.isBarEditing);
            };
        }

        if (view.waveContainer) {
            view.waveContainer.onclick = (e) => {
                if (!state.isBarEditing || !engine.audioBuffer) return;
                const rect = view.waveContainer.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const clickedTime = (state.currentPosition - (this.config.viewDuration * 0.25)) + (x / rect.width) * this.config.viewDuration;
                
                state.isBarEditing = false;
                view.toggleBarEditUI(false);
                state.beatOffset = clickedTime % state.beatInterval;
                this.forceDrawWaveform();
            };
        }

        if (view.bpmInput) {
            view.bpmInput.oninput = (e) => this.updateBPM(e.target.value);
        }

        if (view.syncBtn) {
            view.syncBtn.onclick = () => {
                const otherDeck = this.getOtherDeck();
                this.syncWith(otherDeck);
            };
        }
    }

    async handleFile(file) {
        if (!file) return;

        const extractedBPM = extractBPMFromFileName(file.name);
        this.updateBPM(extractedBPM || 120);

        await this.engine.init();
        const arrayBuffer = await file.arrayBuffer();
        await this.engine.decodeAudio(arrayBuffer);
        
        this.forceDrawWaveform();
        this.playBuffer();
    }

    updateBPM(value) {
        this.state.bpm = parseFloat(value) || 120;
        this.state.beatInterval = 60 / this.state.bpm;
        this.view.updateBPMDisplay(this.state.bpm);
    }

    syncWith(otherDeck) {
        if (!otherDeck || !otherDeck.state.bpm) return;
        this.view.speedSlider.value = otherDeck.state.bpm / this.state.bpm;
        this.updateBPM(otherDeck.state.bpm);
    }

    getOtherDeck() {
        return this.id === 'deck-a' ? window.deckB : window.deckA;
    }

    playBuffer() {
        const speed = parseFloat(this.view.speedSlider.value);
        this.engine.play(this.state.currentPosition, speed);
        this.state.lastUpdateTime = this.engine.audioCtx.currentTime;
        this.state.isPlaying = true;
        this.updateLoop();
    }

    updateLoop() {
        if (!this.state.isPlaying || !this.engine.sourceNode) return;

        const baseSpeed = parseFloat(this.view.speedSlider.value);
        let effectiveSpeed;

        if (this.state.isDragging) {
            this.state.isSyncing = false;
            effectiveSpeed = this.state.dragVelocity;
        } else {
            this.state.dragVelocity *= this.config.friction;
            if (Math.abs(this.state.dragVelocity) < 0.01) this.state.dragVelocity = 0;
            effectiveSpeed = baseSpeed + this.state.dragVelocity;

            if (this.state.isSyncing) {
                const otherDeck = this.getOtherDeck();
                if (otherDeck && otherDeck.state.isPlaying) {
                    const otherRelPos = (otherDeck.state.currentPosition - otherDeck.state.beatOffset) % otherDeck.state.beatInterval;
                    const myRelPos = (this.state.currentPosition - this.state.beatOffset) % this.state.beatInterval;
                    let drift = otherRelPos - myRelPos;
                    if (drift > this.state.beatInterval / 2) drift -= this.state.beatInterval;
                    if (drift < -this.state.beatInterval / 2) drift += this.state.beatInterval;

                    if (Math.abs(drift) < 0.005) this.state.isSyncing = false;
                    else effectiveSpeed += (drift * 0.4);
                } else {
                    this.state.isSyncing = false;
                }
            }
        }
        effectiveSpeed = Math.max(Math.min(effectiveSpeed, this.config.tempo_rate), -this.config.tempo_rate);

        const now = this.engine.audioCtx.currentTime;
        const deltaTime = now - this.state.lastUpdateTime;
        this.state.lastUpdateTime = now;

        this.state.currentPosition += deltaTime * effectiveSpeed;
        
        const rotationPerSecond = 360 / 1.8;
        this.state.currentAngle += rotationPerSecond * effectiveSpeed * deltaTime;
        
        this.engine.setPlaybackRate(effectiveSpeed);
        this.view.updateSpeedDisplay(effectiveSpeed);
        this.view.renderVinyl(this.state.currentAngle);

        if (this.state.currentPosition >= this.engine.audioBuffer.duration || this.state.currentPosition < 0) {
            this.state.isPlaying = false;
            this.engine.stop();
            this.state.currentPosition = Math.max(0, Math.min(this.state.currentPosition, this.engine.audioBuffer.duration));
            this.forceDrawWaveform();
            return;
        }

        const progress = (this.state.currentPosition / this.engine.audioBuffer.duration) * 100;
        this.view.updateProgress(progress);
        this.view.updateTime(formatTime(this.state.currentPosition));
        this.forceDrawWaveform();

        requestAnimationFrame(() => this.updateLoop());
    }

    forceDrawWaveform() {
        this.view.drawWaveform(
            this.engine.audioBuffer, 
            this.state.currentPosition, 
            this.state.beatInterval, 
            this.state.beatOffset, 
            this.config.viewDuration
        );
    }

    startDragging(e) {
        if (!this.isPlaying) return;
        this.isDragging = true;
        this.dragVelocity = 0;
        this.lastValidVelocity = 0; // 마지막 유효 속도 기록용 버퍼
        this.lastDragTime = performance.now();
        
        const rect = this.vinyl.getBoundingClientRect();
        this.centerX = rect.left + rect.width / 2;
        this.centerY = rect.top + rect.height / 2;
        this.lastAngle = Math.atan2(e.clientY - this.centerY, e.clientX - this.centerX) * 180 / Math.PI;
    }

    drag(e) {
        if (!this.isDragging) return;
        
        const now = performance.now();
        const currentMouseAngle = Math.atan2(e.clientY - this.centerY, e.clientX - this.centerX) * 180 / Math.PI;
        let delta = currentMouseAngle - this.lastAngle;
        
        if (delta > 180) delta -= 360;
        else if (delta < -180) delta += 360;

        const instantaneousVelocity = delta * this.config.lp_sensitivity;
        
        // 변위가 존재하는 유효한 움직임일 경우에만 백업 데이터 갱신
        if (Math.abs(delta) > 0.5) {
            this.lastValidVelocity = instantaneousVelocity;
        }

        this.dragVelocity = instantaneousVelocity;
        this.lastAngle = currentMouseAngle;
        this.lastDragTime = now;
    }

    stopDragging() {
        this.isDragging = false;

        // 마우스를 떼기 직전(50ms 이내)의 조작 상태를 검증
        // 멈춰있지 않고 던지는 중이었다면, 마지막으로 기록된 유효 관성 속도를 복원
        if (performance.now() - this.lastDragTime < 50) {
            this.dragVelocity = this.lastValidVelocity;
        }

        const otherDeck = (this.id === 'deck-a') ? deckB : deckA;
        const isBothActive = otherDeck && otherDeck.isPlaying && this.isPlaying;
        const isTempoSynced = Math.abs(this.bpm - otherDeck.bpm) < 0.1;
    
        if (isBothActive && isTempoSynced) {
            this.isSyncing = true; 
        }
    }
}