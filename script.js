class VinylDeck {
    constructor(id, multiId) { // multiId 추가
        this.id = id;
        this.multiId = multiId; // 추가
        this.container = document.getElementById(id);
        this.multiContainer = document.getElementById(multiId);

        this.isPlaying = false;
        this.reverse = false;
        this.currentPosition = 0;
        this.lastUpdateTime = 0;
        this.currentAngle = 0;
        this.isDragging = false;
        this.dragVelocity = 0;
        this.brakeVelocity = 0;
        
        // 추가: 수동 보정을 위한 기본값
        this.bpm = 120;
        this.beatOffset = 0; 
        this.beatInterval = 60 / 120;

        this.config = {
            tempo_rate: 10,
            lp_sensitivity: 0.3,
            brake_force: 0.85,
            friction: 0.95,
            viewDuration: 1,
        };

        this.isBarEditing = false;
        this.beatOffset = 0;

        this.initDOM();
        this.initEvents();
    }
    initDOM() {
        // 1. 기존 사이드 덱 요소들 (LP, 업로드 버튼 등)
        this.vinyl = this.container.querySelector('.vinyl');
        this.speedSlider = this.container.querySelector('.speedSlider');
        this.speedValue = this.container.querySelector('.speedValue');
        this.fileInput = this.container.querySelector('.fileInput');
        this.uploadBtn = this.container.querySelector('.uploadBtn');
        this.progressSlider = this.container.querySelector('.progressSlider');
        this.currentTimeText = this.container.querySelector('.currentTime');
        this.durationText = this.container.querySelector('.duration');
        this.playBtn = this.container.querySelector('.play-btn');
        this.stopBtn = this.container.querySelector('.stop-btn');
        this.reverseBtn = this.container.querySelector('.reverse-btn');
        // EQ 슬라이더
        this.volSlider = this.container.querySelector('.vol-slider');
        this.lowSlider = this.container.querySelector('.low-slider');
        this.midSlider = this.container.querySelector('.mid-slider');
        this.highSlider = this.container.querySelector('.high-slider');

        // 2. 멀티덱 영역 (파형, BPM, BarEdit 버튼 등)
        // 이제 this.multiContainer 내부에서 찾습니다.    
        this.waveContainer = this.multiContainer.querySelector('.audio-wave-viewer');
        this.barEditBtn = this.multiContainer.querySelector('.bar-edit-btn');
        this.bpmInput = this.multiContainer.querySelector('.bpm-input');
        this.bpmDisplay = this.multiContainer.querySelector('.bpm-viewr');
        this.syncBtn = this.multiContainer.querySelector('.sync-toggle-btn');

        this.bpmInput = this.multiContainer.querySelector('.bpm-input')

        this.isBarEditing = false;
    }

    initEvents() {
        
        // 노래 업로드
        if (this.uploadBtn && this.fileInput) {
            this.uploadBtn.onclick = () => this.fileInput.click();
            this.fileInput.onchange = (e) => this.handleFile(e.target.files[0]);
        }

        // LP판 드래그 (스크래치)
        if (this.vinyl) {
            this.vinyl.onmousedown = (e) => this.startDragging(e);
            window.addEventListener('mousemove', (e) => this.drag(e));
            window.addEventListener('mouseup', () => this.stopDragging());
        }

        // 재생 속도 슬라이더
        if (this.speedSlider) {
            this.speedSlider.oninput = () => {
                this.speedValue.textContent = parseFloat(this.speedSlider.value).toFixed(3);
            };
        }

        // 재생 버튼
        if (this.playBtn) {
            this.playBtn.onclick = () => {
                if (!this.audioBuffer) return;
                if (this.reverse) {
                    this.reverse = false;
                    const currentVal = parseFloat(this.speedSlider.value);
                    this.speedSlider.value = currentVal * -1;
                    this.speedValue.textContent = (currentVal * -1).toFixed(3);
                }
                if (!this.isPlaying) {
                    if (this.currentPosition >= this.audioBuffer.duration) this.currentPosition = 0;
                    this.playBuffer();
                }
            };
        }

        // 역재생 버튼
        if (this.reverseBtn) {
            this.reverseBtn.onclick = () => {
                if (!this.audioBuffer || this.reverse) return;
                this.reverse = true;
                const nextVal = parseFloat(this.speedSlider.value) * -1;
                this.speedSlider.value = nextVal;
                this.speedValue.textContent = nextVal.toFixed(3);
                this.playBuffer(); 
            };
        }

        // 정지 버튼
        if (this.stopBtn) {
            this.stopBtn.onclick = () => {
                this.isPlaying = false;
                this.reverse = false;
                if (this.sourceNode) this.sourceNode.stop();
            };
        }

        // --- 2. 중앙 멀티덱 (this.multiContainer) 관련 이벤트 ---

        if (this.multiContainer) {
            // BarEdit 모드 토글
            if (this.barEditBtn) {
                this.barEditBtn.onclick = () => {
                    this.isBarEditing = !this.isBarEditing;
                    this.barEditBtn.classList.toggle('active', this.isBarEditing);
                    // 활성화 시 시각적 피드백 (CSS active 클래스가 있다면 스타일 생략 가능)
                    this.barEditBtn.style.backgroundColor = this.isBarEditing ? '#ff5722' : '';
                    if (this.waveContainer) {
                        this.waveContainer.style.cursor = this.isBarEditing ? 'crosshair' : 'default';
                    }
                };
            }

            // 파형 클릭 (비트 오프셋 보정)
            if (this.waveContainer) {
                this.waveContainer.onclick = (e) => {
                    const rect = this.waveContainer.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const width = rect.width;
                    
                    // 바 위치(offset) 계산 및 적용 로직 (기존 로직 유지)
                    this.barOffset = (x / width) * this.audioBuffer.duration; 

                    // [핵심] 클릭 시 편집 모드 종료
                    if (this.isBarEditing) {
                        this.isBarEditing = false;
                        if (this.barEditBtn) {
                            this.barEditBtn.textContent = 'Bar Edit'; // 버튼 텍스트 복구
                            this.barEditBtn.classList.remove('editing'); // 스타일 클래스 제거
                        }
                        console.log("Bar position set, exiting Edit Mode.");
                    }
                };
            }


            // BPM 입력창 수동 변경
            if (this.bpmInput) {
                this.bpmInput.oninput = (e) => {
                    this.updateBPM(e.target.value);
                };
            }

            // 싱크 버튼
            if (this.syncBtn) {
                this.syncBtn.onclick = () => {
                    // 전역 변수 deckA, deckB를 참조하여 상대 데크와 동기화
                    const otherDeck = (this.id === 'deck-a') ? deckB : deckA;
                    this.syncWith(otherDeck);
                };
            }
        }
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
        if(this.volSlider) {
            this.volSlider.oninput = (e) => {
                if (this.gainNode) {
                    // 게인은 value를 직접 조절하거나 setTargetAtTime 사용 가능
                    this.gainNode.gain.setTargetAtTime(parseFloat(e.target.value), this.audioCtx.currentTime, 0.02);
                }
            };
        }

        // EQ 조절 (범위: -24dB ~ +12dB 정도가 적당합니다)
        const bindEQ = (slider, filter) => {
            if(slider) {
                slider.oninput = (e) => {
                    if (filter) filter.gain.setTargetAtTime(e.target.value, this.audioCtx.currentTime, 0.1);
                };
            }
        };

        bindEQ(this.lowSlider, this.eqLow);
        bindEQ(this.midSlider, this.eqMid);
        bindEQ(this.highSlider, this.eqHigh);
            
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

        const extractedBPM = this.extractBPMFromFileName(file.name);
        if (extractedBPM) {
            this.updateBPM(extractedBPM);
            // [수정] bpmInput이 존재할 때만 value를 설정하도록 안전 장치 추가
            if (this.bpmInput) {
                this.bpmInput.value = extractedBPM;
            }
        } else {
            this.updateBPM(120); 
        }

        await this.initAudio();
        const arrayBuffer = await file.arrayBuffer();
        this.audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        
        // 1. 파형 그리기 실행
        this.drawWaveform();

        this.createReversedBuffer();
        this.playBuffer();
    }
    extractBPMFromFileName(fileName) {
        // 확장자를 제외한 파일 이름 추출
        const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
        
        // 이름 끝이 '숫자bpm'으로 끝나는지 확인하는 정규표현식
        // 예: "노래제목 80bpm" -> 80 추출
        const match = nameWithoutExt.match(/(\d+)bpm$/i);
        
        if (match && match[1]) {
            return parseInt(match[1], 10);
        }
        return null;
    }
    
    // 사용자가 입력한 BPM으로 업데이트
    updateBPM(value) {
        this.bpm = parseFloat(value) || 120;
        this.beatInterval = 60 / this.bpm;
        this.bpmDisplay.textContent = `${this.bpm} BPM`;
        this.bpmInput.value = this.bpm;
    }

    // 그리드 좌우 밀기 조절
    adjustOffset(amount) {
        this.beatOffset += amount;
    }

    // 싱크 버튼 로직: 상대 데크의 BPM을 가져와 내 데크에 적용
    syncWith(otherDeck) {
        if (!otherDeck || !otherDeck.bpm) return;
        this.speedSlider.value = otherDeck.bpm / this.bpm; 
        this.updateBPM(otherDeck.bpm);
    }
    drawWaveform() {
        // 1. 컨테이너나 오디오 데이터가 없으면 중단
        if (!this.waveContainer || !this.audioBuffer) return;

        // 2. 캔버스 요소 가져오기 또는 생성
        let canvas = this.waveContainer.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            this.waveContainer.appendChild(canvas);
        }
        const ctx = canvas.getContext('2d');

        // 3. 컨테이너 크기에 맞춰 캔버스 해상도 설정
        const rect = this.waveContainer.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }

        const width = canvas.width;
        const height = canvas.height;
        const data = this.audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / (width * 100)); // 성능 최적화를 위한 샘플링

        ctx.clearRect(0, 0, width, height);

        // 4. 파형 베이스라인 그리기
        ctx.beginPath();
        ctx.strokeStyle = '#4a4a4a';
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // 5. 현재 재생 위치 기준 파형 그리기
        // 설정된 viewDuration(초)만큼의 영역을 보여줌 (현재 위치가 25% 지점에 오도록 설정)
        const viewDuration = this.config.viewDuration;
        const startTime = this.currentPosition - (viewDuration * 0.25);
        const endTime = startTime + viewDuration;

        ctx.beginPath();
        ctx.strokeStyle = this.id === 'deck-a' ? '#00e5ff' : '#ff007b'; // 덱별 색상 차별화
        ctx.lineWidth = 2;

        for (let x = 0; x < width; x++) {
            const time = startTime + (x / width) * viewDuration;
            if (time < 0 || time >= this.audioBuffer.duration) continue;

            const index = Math.floor(time * this.audioBuffer.sampleRate);
            const val = data[index] || 0;
            const y = (val + 1) * height / 2;

            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // 6. 비트 그리드(마디 선) 그리기
        if (this.beatInterval > 0) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.setLineDash([5, 5]); // 점선 효과

            // beatOffset을 반영하여 첫 번째 비트 라인 시작점 계산
            let firstBeatTime = Math.ceil(startTime / this.beatInterval) * this.beatInterval + this.beatOffset;
            while (firstBeatTime > startTime) {
                firstBeatTime -= this.beatInterval;
            }

            for (let t = firstBeatTime; t < endTime; t += this.beatInterval) {
                if (t < startTime) continue;
                const x = ((t - startTime) / viewDuration) * width;
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
            }
            ctx.stroke();
            ctx.setLineDash([]); // 점선 초기화
        }

        // 7. 현재 재생 지점 표시 (고정선)
        const playheadX = width * 0.25;
        ctx.beginPath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
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
        this.sourceNode.connect(this.eqLow);
        
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
            // [중요] 마우스를 잡고 있는데 움직임이 멈췄다면(50ms 이상) 속도를 0으로 강제
            if (performance.now() - this.lastMouseMoveTime > 50) {
                this.dragVelocity = 0;
            }

            this.brakeVelocity *= this.config.brake_force;
            // 드래그 중에는 오직 (감속중인 베이스 + 현재 손속도)만 반영
            effectiveSpeed = this.brakeVelocity + this.dragVelocity;
        } else {
            // 릴리스 상태: 여기서만 마찰력을 적용하며 관성(dragVelocity)을 유지
            this.dragVelocity *= this.config.friction;
            
            // 임계값 처리 (멈춤)
            if (Math.abs(this.dragVelocity) < 0.001) this.dragVelocity = 0;
            
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

        if (this.currentPosition >= this.audioBuffer.duration || this.currentPosition < 0) {
            this.isPlaying = false;
            if (this.sourceNode) this.sourceNode.stop();
            this.currentPosition = Math.max(0, Math.min(this.currentPosition, this.audioBuffer.duration));
            this.drawWaveform();
            return; 
        }

        if (this.sourceNode) {
            this.sourceNode.playbackRate.value = Math.max(0.001, Math.abs(effectiveSpeed));
            this.speedValue.textContent = effectiveSpeed.toFixed(3);
        }

        // 진행 바 업데이트
        const progress = (this.currentPosition / this.audioBuffer.duration) * 100;
        this.progressSlider.value = progress;
        this.currentTimeText.textContent = this.formatTime(this.currentPosition);
        this.drawWaveform();

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
        
        // 잡는 순간 모든 관성치를 0으로 초기화
        this.dragVelocity = 0;
        this.currentDelta = 0; 
        
        this.brakeVelocity = parseFloat(this.speedSlider.value);
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

        // 현재의 움직임(delta)만 속도로 반영하고, 이전 관성과 합쳐지지 않게 함
        this.dragVelocity = delta * this.config.lp_sensitivity;
        
        this.lastAngle = currentMouseAngle;
        // 마우스가 움직이고 있음을 알림
        this.lastMouseMoveTime = performance.now(); 
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

const deckA = new VinylDeck('deck-a', 'multi-deck-container-a');
const deckB = new VinylDeck('deck-b', 'multi-deck-container-b');

const crossfader = document.querySelector('.crossfader-slider');

crossfader.oninput = (e) => {
    // 0(왼쪽 끝) ~ 100(오른쪽 끝) 사이의 값을 0 ~ 1 비율로 변환
    const value = parseFloat(e.target.value) / 100;
    
    // 왼쪽(A) 데크: 슬라이더가 오른쪽으로 갈수록 소리가 작아짐 (1 - value)
    if (deckA.gainNode) {
        deckA.gainNode.gain.setTargetAtTime(1 - value, deckA.audioCtx.currentTime, 0.02);
    }
    
    // 오른쪽(B) 데크: 슬라이더가 오른쪽으로 갈수록 소리가 커짐 (value)
    if (deckB.gainNode) {
        deckB.gainNode.gain.setTargetAtTime(value, deckB.audioCtx.currentTime, 0.02);
    }
};

