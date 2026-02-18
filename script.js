class VinylDeck {
    constructor(id) {
        this.id = id;
        this.container = document.getElementById(id);
        this.isPlaying = false;
        this.currentPosition = 0;
        this.currentAngle = 0;
        this.isDragging = false;
        this.dragVelocity = 0;
        this.brakeVelocity = 0;
        
        // 설정값
        this.config = {
            tempo_rate: 5.0,
            lp_sensitivity: 0.05,
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
    }

    async initAudio() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.filterNode = this.audioCtx.createBiquadFilter();
            this.filterNode.type = 'lowpass';
            this.filterNode.connect(this.audioCtx.destination);
        }
    }

    // 기존의 updateUI, playBuffer, handleFile 로직을 
    // 클래스 메서드(this.updateUI 등)로 이식합니다.
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

        // 오디오 및 필터 처리
        this.applyAudioEffect(effectiveSpeed);
        
        // 시각적 회전 처리
        this.renderVinyl(effectiveSpeed);

        requestAnimationFrame(() => this.updateUI());
    }

    renderVinyl(speed) {
        const rotationPerSecond = 360 / 1.8;
        this.currentAngle += rotationPerSecond * speed * 0.016; // deltaTime 대략치
        this.vinyl.style.transform = `rotate(${this.currentAngle % 360}deg)`;
    }
}

// 두 개의 데크 인스턴스 생성
const deckA = new VinylDeck('deck-a');
const deckB = new VinylDeck('deck-b');