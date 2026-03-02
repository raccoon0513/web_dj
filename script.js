class VinylDeck {
    constructor(id) {
        this.id = id;
        this.container = document.getElementById(id);
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

        this.initDOM();
        this.initEvents();
    }
    initDOM() {
        // 이제 id 대신 클래스로만 요소를 가져옵니다.
        this.vinyl = this.container.querySelector('.vinyl');
        this.speedSlider = this.container.querySelector('.speedSlider');
        this.speedValue = this.container.querySelector('.speedValue');
        this.fileInput = this.container.querySelector('.fileInput');
        this.uploadBtn = this.container.querySelector('.uploadBtn');
        this.progressSlider = this.container.querySelector('.progressSlider');
        this.currentTimeText = this.container.querySelector('.currentTime');
        this.durationText = this.container.querySelector('.duration');
        
        // 추가될 버튼들
        this.playBtn = this.container.querySelector('.play-btn');
        this.stopBtn = this.container.querySelector('.stop-btn');
        this.reverseBtn = this.container.querySelector('.reverse-btn');

        // EQ 및 볼륨 슬라이더도 부모 컨테이너 내부에서 찾도록 변경 가능합니다.
        this.volSlider = this.container.querySelector('.vol-slider');
        this.lowSlider = this.container.querySelector('.low-slider');
        this.midSlider = this.container.querySelector('.mid-slider');
        this.highSlider = this.container.querySelector('.high-slider');
        
        const suffix = this.id.split('-')[1];
        this.bpmInput = document.getElementById(`bpm-input-${suffix}`);

        this.barEditBtn = this.container.querySelector('.bar-edit-btn');
        this.waveContainer = this.container.querySelector('.audio-wave-viewer');
        this.isBarEditing = false; // 편집 모드 상태 변수
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

        this.playBtn.onclick = () => {
            if (!this.audioBuffer) return;
            
            // reverse가 true일 때 재생을 누르면 정방향으로 전환
            if (this.reverse) {
                this.reverse = false;
                const currentVal = parseFloat(this.speedSlider.value);
                this.speedSlider.value = currentVal * -1; // 배속에 -1 곱하기
                this.speedValue.textContent = (currentVal * -1).toFixed(3);
            }

            if (!this.isPlaying) {
                if (this.currentPosition >= this.audioBuffer.duration) {
                    this.currentPosition = 0;
                }
                this.playBuffer();
            }
        };

        // [수정 1] REV 버튼 로직 개선
        this.reverseBtn.onclick = () => {
            if (!this.audioBuffer) return;
            
            // 이미 reverse가 true라면 동작하지 않음
            if (this.reverse) return;

            this.reverse = true;
            const currentVal = parseFloat(this.speedSlider.value);
            const nextVal = currentVal * -1; // 현재 속도에 -1 곱하기
            
            this.speedSlider.value = nextVal;
            this.speedValue.textContent = nextVal.toFixed(3);
            
            // 재생 중이 아니었다면 재생 시작, 중이었다면 버퍼 교체를 위해 다시 호출
            this.playBuffer(); 
        };

        // 정지 시 reverse 상태 초기화 (선택 사항)
        this.stopBtn.onclick = () => {
            this.isPlaying = false;
            this.reverse = false; // 정지하면 다시 정방향 준비
            if (this.sourceNode) this.sourceNode.stop();
        };

        this.barEditBtn.onclick = () => {
            this.isBarEditing = !this.isBarEditing;
            this.barEditBtn.classList.toggle('active', this.isBarEditing);
            this.barEditBtn.style.backgroundColor = this.isBarEditing ? '#ff5722' : ''; // 활성화 시 색상 변경
            this.waveContainer.style.cursor = this.isBarEditing ? 'crosshair' : 'default';
        };
        this.waveContainer.onclick = (e) => {
            if (!this.isBarEditing || !this.audioBuffer) return;

            const rect = this.waveContainer.getBoundingClientRect();
            const x = e.clientX - rect.left; // 클릭한 X 좌표
            const width = rect.width;

            // 현재 파형 뷰의 시간 계산 로직 역산
            const viewDuration = this.config.viewDuration;
            const startTime = this.currentPosition - (viewDuration * 0.25);
            
            // 클릭한 지점의 실제 노래 시간(초) 계산
            const clickedTime = startTime + (x / width) * viewDuration;

            // 클릭한 지점을 새로운 비트의 시작점(Offset)으로 설정
            // (clickedTime - n * beatInterval = beatOffset)
            // 가장 가까운 마디로 맞추기 위해 현재 시간을 beatInterval로 나눈 나머지를 오프셋으로 활용
            this.beatOffset = clickedTime % this.beatInterval;
            
            // 즉시 파형 다시 그리기
            this.drawWaveform();
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

        // 파일 이름에서 BPM 추출 시도
        const extractedBPM = this.extractBPMFromFileName(file.name);
        if (extractedBPM) {
            this.updateBPM(extractedBPM);
            this.bpmInput.value = extractedBPM;
        } else {
            // 포맷이 다를 경우 기본 BPM(예: 120) 사용
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
        const suffix = this.id.split('-')[1];
        const display = document.getElementById(`bpm-viewr-${suffix}`);
        if (display) display.textContent = `${this.bpm} BPM`;
    }

    // 그리드 좌우 밀기 조절
    adjustOffset(amount) {
        this.beatOffset += amount;
    }

    // 싱크 버튼 로직: 상대 데크의 BPM을 가져와 내 데크에 적용
    syncWith(otherDeck) {
        if (!otherDeck || !otherDeck.bpm) return;
        this.updateBPM(otherDeck.bpm);
        // 슬라이더 위치도 자동으로 맞춰주면 좋습니다.
        this.speedSlider.value = 1.0; 
    }
    drawWaveform() {
        const suffix = this.id.split('-')[1];
        const container = document.getElementById(`audio-wave-viewer-${suffix}`);
        if (!container || !this.audioBuffer) return;

        let canvas = container.querySelector('canvas');
        if (!canvas) {
            container.innerHTML = '<canvas></canvas>';
            canvas = container.querySelector('canvas');
        }
        const ctx = canvas.getContext('2d');
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;

        const data = this.audioBuffer.getChannelData(0);
        const sampleRate = this.audioBuffer.sampleRate;
        const amp = canvas.height / 2;
        const currentSample = this.currentPosition * sampleRate;
        const samplesPerPixel = (this.config.viewDuration * sampleRate) / canvas.width;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 1. 파형 그리기
        ctx.fillStyle = '#ff5722';
        for (let i = 0; i < canvas.width; i++) {
            const sampleIdx = Math.floor(currentSample + (i - canvas.width * 0.25) * samplesPerPixel);
            let maxAmp = 0;
            const checkWindow = Math.max(1, Math.floor(samplesPerPixel)); 
            for (let j = 0; j < checkWindow; j++) {
                if (sampleIdx + j < data.length) {
                    const val = Math.abs(data[sampleIdx + j]);
                    if (val > maxAmp) maxAmp = val;
                }
            }
            const lineHeight = maxAmp * amp * 1.5;
            ctx.fillRect(i, amp - lineHeight / 2, 1, lineHeight || 1);
        }

        // 2. 박자 그리드 (수정된 로직)
        if (this.beatInterval) {
            ctx.save(); // 투명도 간섭을 막기 위해 상태 저장
            const viewDuration = this.config.viewDuration;
            const startTime = this.currentPosition - (viewDuration * 0.25);
            const endTime = startTime + viewDuration;

            // beatOffset 반영
            let firstBeat = Math.ceil((startTime - this.beatOffset) / this.beatInterval) * this.beatInterval + this.beatOffset;

            for (let t = firstBeat; t < endTime; t += this.beatInterval) {
                const x = ((t - startTime) / viewDuration) * canvas.width;
                const beatNumber = Math.round((t - this.beatOffset) / this.beatInterval);
                
                if (beatNumber % 4 === 0) {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; // 마디 선
                    ctx.lineWidth = 2;
                } else {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; // 박자 선
                    ctx.lineWidth = 1;
                }
                
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
            }
            ctx.restore(); // 상태 복구
        }

        // 3. 재생 지점 가이드
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(canvas.width * 0.25, 0);
        ctx.lineTo(canvas.width * 0.25, canvas.height);
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

const deckA = new VinylDeck('deck-a');
const deckB = new VinylDeck('deck-b');

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

