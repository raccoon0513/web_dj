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
            isBraking: false,
            dragVelocity: 0,
            lastValidVelocity: 0,
            currentSpeed : 1,
            lastMouseMoveTime: 0,
            baseBpm: 120,
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
                
                // 역재생 상태에서 플레이를 누르면 정방향으로 복귀
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
                
                // 속도(방향) 반전
                const nextVal = parseFloat(view.speedSlider.value) * -1;
                view.speedSlider.value = nextVal;
                view.updateSpeedDisplay(nextVal);
                
                if (state.isPlaying) this.playBuffer();
            };
        }

        // 🌟 수정됨: 재생 속도 슬라이더 조작 시 현재 재생 속도가 반영된 BPM 텍스트도 함께 업데이트
        if (view.speedSlider) {
            view.speedSlider.oninput = () => {
                const speed = parseFloat(view.speedSlider.value);
                view.updateSpeedDisplay(speed);
                view.updateBPMDisplay(this.getCurrentBPM()); 
            };
        }

        // EQ 및 볼륨 조작
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

        // 멀티덱 전용 이벤트 (마디 편집기)
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

        // 🌟 수정됨: BPM 수동 입력 시, 원본 BPM을 바꾸는 대신 handleBPMInput을 호출하여 속도(Speed)를 조절
        if (view.bpmInput) {
            view.bpmInput.oninput = (e) => this.handleBPMInput(e.target.value);
        }

        // 동기화(Sync) 버튼
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
        // updateBPM 대신 setBaseBPM 호출
        this.setBaseBPM(extractedBPM || 120);

        await this.engine.init();
        const arrayBuffer = await file.arrayBuffer();
        await this.engine.decodeAudio(arrayBuffer);
        
        this.forceDrawWaveform();
        this.playBuffer();
    }

    // 1. 노래 업로드 시 '최초 1회' 원본 BPM과 마디 간격을 세팅하는 함수
    setBaseBPM(value) {
        this.state.baseBpm = parseFloat(value) || 120;
        this.state.beatInterval = 60 / this.state.baseBpm;
        
        // 새 곡이 로드되면 속도 배율을 1.0(원속도)으로 초기화
        this.view.speedSlider.value = 1;
        this.view.updateSpeedDisplay(1);
        this.view.updateBPMDisplay(this.state.baseBpm);

        this.forceDrawWaveform();
    }

    // 2. 현재 재생 속도(Speed)가 반영된 실제 귀에 들리는 BPM을 계산하는 함수
    getCurrentBPM() {
        const speed = Math.abs(parseFloat(this.view.speedSlider.value));
        return this.state.baseBpm * speed; 
    }

    // 3. 입력창에 BPM을 쳤을 때, 역으로 재생 속도(Speed Slider)를 조절하는 함수
    handleBPMInput(value) {
        const targetBpm = parseFloat(value) || this.state.baseBpm;
        
        // 역재생 중이었다면 방향 유지
        const currentDirection = parseFloat(this.view.speedSlider.value) < 0 ? -1 : 1;
        
        // 목표 BPM에 도달하기 위한 필요 속도 배율 계산
        const newSpeed = (targetBpm / this.state.baseBpm) * currentDirection;
        
        this.view.speedSlider.value = newSpeed;
        this.view.updateSpeedDisplay(newSpeed);
        this.view.updateBPMDisplay(targetBpm);
        // 주의: beatInterval을 다시 계산하지 않으므로 파형의 마디 선 간격은 유지됨!
    }

    // 4. Sync 버튼 클릭 시 상대 데크의 '현재 재생 중인 BPM'을 가져와 내 속도를 맞춤
    syncWith(otherDeck) {
        if (!otherDeck || !otherDeck.state.baseBpm) return;
        const targetBpm = otherDeck.getCurrentBPM();
        this.handleBPMInput(targetBpm); 
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
            
            // 1. 잡은 직후의 브레이크 관성 처리
            if (this.state.isBraking) {
                this.state.dragVelocity *= 0.85; // 제동력
                if (Math.abs(this.state.dragVelocity) < 0.01) {
                    this.state.dragVelocity = 0;
                    this.state.isBraking = false; // 완전히 멈추면 브레이크 해제
                }
            } 
            // 2. 스크래치 조작 중 50ms 이상 마우스 이동이 없으면 정지
            else if (performance.now() - this.state.lastMouseMoveTime > 50) {
                this.state.dragVelocity = 0;
            }
            
            effectiveSpeed = this.state.dragVelocity;
        } else {
            // 3. 손을 뗀 후의 마찰력(서서히 원속도로 복귀)
            this.state.dragVelocity *= this.config.friction;
            if (Math.abs(this.state.dragVelocity) < 0.01) this.state.dragVelocity = 0;
            
            effectiveSpeed = baseSpeed + this.state.dragVelocity;

            // --- 동기화(Sync) 로직 ---
            if (this.state.isSyncing) {
                const otherDeck = this.getOtherDeck();
                if (otherDeck && otherDeck.state.isPlaying) {
                    const otherRelPos = (otherDeck.state.currentPosition - otherDeck.state.beatOffset) % otherDeck.state.beatInterval;
                    const myRelPos = (this.state.currentPosition - this.state.beatOffset) % this.state.beatInterval;
                    
                    // 1. 내 위치에서 상대방 비트 위치까지 '앞으로' 가야 할 거리(항상 양수)를 계산
                    let forwardDrift = (otherRelPos - myRelPos + this.state.beatInterval) % this.state.beatInterval;

                    // 2. 오차가 허용 범위 이내이거나, 한 바퀴를 거의 다 돌아서 위상이 맞춰진 경우 동기화 종료
                    if (forwardDrift < 0.01 || forwardDrift > this.state.beatInterval - 0.01) {
                        this.state.isSyncing = false;
                    } else {
                        // 3. 원 속도보다 느려지지 않게 무조건 '+' 가속만 적용
                        // Math.sqrt(제곱근)를 사용하여 남은 거리가 클 때는 가속도가 높고,
                        // 목표에 가까워질수록 가속도가 0에 부드럽게 수렴하는 형태를 만듭니다.
                        let boost = Math.sqrt(forwardDrift) * 0.4; // 0.4는 부스트 강도(필요시 조절)
                        effectiveSpeed += boost; 
                    }
                } else {
                    this.state.isSyncing = false;
                }
            }
        }
        
        // 최대/최소 속도 제한
        effectiveSpeed = Math.max(Math.min(effectiveSpeed, this.config.tempo_rate), -this.config.tempo_rate);
        
        // 🌟 다음 클릭(startDragging) 시 브레이크 시작 속도로 쓰기 위해 현재 속도 저장
        this.state.currentSpeed = effectiveSpeed; 

        const now = this.engine.audioCtx.currentTime;
        const deltaTime = now - this.state.lastUpdateTime;
        this.state.lastUpdateTime = now;

        this.state.currentPosition += deltaTime * effectiveSpeed;
        
        const rotationPerSecond = 360 / 1.8;
        this.state.currentAngle += rotationPerSecond * effectiveSpeed * deltaTime;
        
        // 오디오 엔진 및 UI 업데이트
        this.engine.setPlaybackRate(effectiveSpeed);
        // 만약 스크래치 필터(저음 부스트) 로직을 AuidioEngine에 추가하셨다면 아래 주석을 해제하세요.
        // this.engine.setScratchFilterFrequency(effectiveSpeed); 
        
        this.view.updateSpeedDisplay(effectiveSpeed);
        this.view.renderVinyl(this.state.currentAngle);

        // 곡의 끝이나 처음을 벗어났을 때의 처리
        if (this.state.currentPosition >= this.engine.audioBuffer.duration || this.state.currentPosition < 0) {
            this.state.isPlaying = false;
            this.engine.stop();
            this.state.currentPosition = Math.max(0, Math.min(this.state.currentPosition, this.engine.audioBuffer.duration));
            this.forceDrawWaveform();
            return; 
        }

        // 진행 바 및 파형 UI 렌더링
        const progress = (this.state.currentPosition / this.engine.audioBuffer.duration) * 100;
        this.view.updateProgress(progress);
        this.view.updateTime(formatTime(this.state.currentPosition));
        this.forceDrawWaveform();

        // 다음 프레임 호출
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
        if (!this.state.isPlaying) return;
        
        this.state.isDragging = true;
        this.state.isBraking = true; // 잡는 순간 브레이크 모드 활성화
        
        // 현재 실제로 돌고 있던 속도(currentSpeed)를 이어받아 관성 감속 준비
        this.state.dragVelocity = this.state.currentSpeed; 
        this.state.lastMouseMoveTime = performance.now(); 
        
        const rect = this.view.vinyl.getBoundingClientRect();
        this.centerX = rect.left + rect.width / 2;
        this.centerY = rect.top + rect.height / 2;
        this.lastAngle = Math.atan2(e.clientY - this.centerY, e.clientX - this.centerX) * 180 / Math.PI;
    }

    drag(e) {
        if (!this.state.isDragging) return;

        // 마우스가 조금이라도 움직이면 브레이크 모드를 즉시 해제하고 스크래치 우선 적용
        this.state.isBraking = false; 
        
        const currentMouseAngle = Math.atan2(e.clientY - this.centerY, e.clientX - this.centerX) * 180 / Math.PI;
        let delta = currentMouseAngle - this.lastAngle;
        
        if (delta > 180) delta -= 360;
        else if (delta < -180) delta += 360;

        this.state.dragVelocity = delta * this.config.lp_sensitivity;
        this.lastAngle = currentMouseAngle;
        this.state.lastMouseMoveTime = performance.now();
    }

    stopDragging() {
        if (!this.state.isDragging) return;
        
        this.state.isDragging = false;

        const otherDeck = this.getOtherDeck();
        const isBothActive = otherDeck && otherDeck.state.isPlaying && this.state.isPlaying;
        const isTempoSynced = Math.abs(this.state.bpm - otherDeck.state.bpm) < 0.1;
    
        if (isBothActive && isTempoSynced) {
            this.state.isSyncing = true; 
        }
    }
}