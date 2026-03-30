/**
 * Web Audio API를 이용한 오디오 처리 엔진 클래스입니다.
 * 재생, 정지, 필터(EQ), 속도 조절 등 '소리'와 관련된 로직만 담당합니다.
 */
class AudioEngine {
    constructor() {
        this.audioCtx = null;
        this.gainNode = null;
        this.sourceNode = null;
        this.audioBuffer = null;
        this.reversedBuffer = null;

        // EQ 필터 노드
        this.eqLow = null;
        this.eqMid = null;
        this.eqHigh = null;
    }

    /**
     * 오디오 컨텍스트 및 필터 노드들을 초기화하고 연결합니다.
     */
    async init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // 1. 게인 노드 (볼륨) 생성
            this.gainNode = this.audioCtx.createGain();
            this.gainNode.gain.value = 0.8; // 기본 볼륨 설정
            
            // 2. EQ 필터 노드 생성 (High, Mid, Low)
            this.eqHigh = this.createFilter('highshelf', 3000);
            this.eqMid = this.createFilter('peaking', 1000);
            this.eqLow = this.createFilter('lowshelf', 150);

            // 3. 필터 체인 연결: Low -> Mid -> High -> Gain -> Destination
            this.eqLow.connect(this.eqMid);
            this.eqMid.connect(this.eqHigh);
            this.eqHigh.connect(this.gainNode);
            this.gainNode.connect(this.audioCtx.destination);
        }
        
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
    }

    /**
     * 특정 타입의 오디오 필터를 생성합니다.
     */
    createFilter(type, frequency) {
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.Q.value = 1;
        filter.gain.value = 0; 
        return filter;
    }

    /**
     * 오디오 파일을 디코딩하여 버퍼에 저장하고 역재생용 버퍼도 생성합니다.
     */
    async decodeAudio(arrayBuffer) {
        this.audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        this.createReversedBuffer();
        return this.audioBuffer;
    }

    /**
     * 역재생을 위한 반전된 오디오 버퍼를 생성합니다.
     */
    createReversedBuffer() {
        if (!this.audioBuffer) return;

        this.reversedBuffer = this.audioCtx.createBuffer(
            this.audioBuffer.numberOfChannels, 
            this.audioBuffer.length, 
            this.audioBuffer.sampleRate
        );

        for (let i = 0; i < this.audioBuffer.numberOfChannels; i++) {
            const data = this.audioBuffer.getChannelData(i);
            const revData = this.reversedBuffer.getChannelData(i);
            for (let j = 0; j < this.audioBuffer.length; j++) {
                revData[j] = data[this.audioBuffer.length - 1 - j];
            }
        }
    }

    /**
     * 지정된 위치와 속도로 소리를 재생합니다.
     */
    play(offset, speed) {
        this.stop();

        this.sourceNode = this.audioCtx.createBufferSource();
        // 속도가 음수면 역재생 버퍼 사용
        this.sourceNode.buffer = speed < 0 ? this.reversedBuffer : this.audioBuffer;
        this.sourceNode.connect(this.eqLow);
        
        // 역재생 시 오프셋 계산 보정
        const actualOffset = speed < 0 
            ? (this.audioBuffer.duration - offset) 
            : offset;

        this.sourceNode.start(0, Math.max(0, actualOffset));
        this.setPlaybackRate(speed);
    }

    /**
     * 재생을 중단합니다.
     */
    stop() {
        if (this.sourceNode) {
            this.sourceNode.stop();
            this.sourceNode = null;
        }
    }

    /**
     * 재생 속도를 실시간으로 변경합니다.
     */
    setPlaybackRate(speed) {
        if (this.sourceNode) {
            // 정지 상태에 가까운 아주 낮은 속도 보정
            this.sourceNode.playbackRate.value = Math.max(0.001, Math.abs(speed));
        }
    }

    /**
     * 볼륨을 조절합니다.
     */
    setGain(value, time = 0.02) {
        if (this.gainNode) {
            this.gainNode.gain.setTargetAtTime(value, this.audioCtx.currentTime, time);
        }
    }

    /**
     * EQ 필터 게인을 조절합니다.
     */
    setFilterGain(type, value) {
        let filter;
        if (type === 'low') filter = this.eqLow;
        if (type === 'mid') filter = this.eqMid;
        if (type === 'high') filter = this.eqHigh;
        
        if (filter) {
            filter.gain.setTargetAtTime(value, this.audioCtx.currentTime, 0.1);
        }
    }
}