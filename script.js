let audioCtx, sourceNode, audioBuffer, reversedBuffer;
let isPlaying = false;
let currentPosition = 0; // 현재 곡의 위치 (초)
let lastUpdateTime = 0;  // 마지막으로 위치를 계산한 시점
let currentAngle =0;

const vinyl = document.getElementById('vinyl');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const progressSlider = document.getElementById('progressSlider');
const currentTimeText = document.getElementById('currentTime');
const durationText = document.getElementById('duration');

// 오디오 엔진 초기화
async function handleFile(file) {
    if (!file || !file.type.startsWith('audio/')) return;

    initAudio();
    const arrayBuffer = await file.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // 역재생용 버퍼 생성: 원본 데이터를 복사하여 뒤집음
    reversedBuffer = audioCtx.createBuffer(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
    );

    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        const chanData = audioBuffer.getChannelData(i);
        const revChanData = reversedBuffer.getChannelData(i);
        for (let j = 0; j < audioBuffer.length; j++) {
            revChanData[j] = chanData[audioBuffer.length - 1 - j];
        }
    }

    playBuffer();
}

function playBuffer() {
    if (sourceNode) sourceNode.stop();

    initAudio();
    sourceNode = audioCtx.createBufferSource();
    const speed = parseFloat(speedSlider.value);
    const isReversed = speed < 0;

    // 현재 위치를 기준으로 어떤 버퍼의 어느 지점에서 시작할지 결정
    sourceNode.buffer = isReversed ? reversedBuffer : audioBuffer;
    sourceNode.playbackRate.value = Math.abs(speed);
    sourceNode.connect(audioCtx.destination);

    // 역재생 버퍼는 데이터가 뒤집혀 있으므로 시작 지점도 뒤집어서 계산
    const startOffset = isReversed ? (audioBuffer.duration - currentPosition) : currentPosition;

    sourceNode.start(0, Math.max(0, startOffset));
    lastUpdateTime = audioCtx.currentTime;
    isPlaying = true;
    vinyl.classList.add('spinning');
    
    updateUI(); // 진행 바 업데이트 시작
}

// updateUI 함수 수정
function updateUI() {
    if (!isPlaying || !audioBuffer) return;

    const speed = parseFloat(speedSlider.value);
    const now = audioCtx.currentTime;
    const deltaTime = now - lastUpdateTime;
    
    // 1. 오디오 위치 업데이트
    currentPosition += deltaTime * speed;
    
    // 2. LP판 각도 업데이트 (틱 시스템)
    // 레코드판 평균 rpm : 45rpm
    const rotationPerSecond = 45 / 60;
    currentAngle += rotationPerSecond * speed * deltaTime;
    
    // 3. 시각적 반영
    vinyl.style.transform = `rotate(${currentAngle % 360}deg)`;
    
    lastUpdateTime = now;

    // 진행 바 등 기존 UI 업데이트
    const progress = (currentPosition / audioBuffer.duration) * 100;
    progressSlider.value = Math.min(Math.max(0, progress), 100);
    currentTimeText.textContent = formatTime(Math.max(0, currentPosition));

    if (currentPosition >= audioBuffer.duration || currentPosition < 0) {
        stopPlayback();
    } else {
        requestAnimationFrame(updateUI);
    }
}
// 속도 조절 시 현재 위치를 유지하며 즉시 재재생
speedSlider.oninput = (e) => {
    const val = parseFloat(e.target.value);
    speedValue.textContent = val.toFixed(1);
    vinyl.style.animationDirection = val < 0 ? 'reverse' : 'normal';

    if (isPlaying && audioBuffer) {
        const isReversing = val < 0;
        const currentlyReversed = (sourceNode.buffer === reversedBuffer);

        // 방향이 바뀌는 임계점(0)에서 버퍼를 교체해야 함
        if (isReversing !== currentlyReversed) {
            playBuffer(); 
        } else {
            sourceNode.playbackRate.value = Math.abs(val);
        }
    }
};

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function stopPlayback() {
    isPlaying = false;
    currentPosition = 0; // 초기화
    vinyl.classList.remove('spinning');
}

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// 1. 노래 업로드 버튼 클릭 시 파일 선택창 열기
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');

uploadBtn.onclick = () => fileInput.click();

fileInput.onchange = (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
};

const dropZone = document.getElementById('dropZone');

dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "#ff5722";
};

dropZone.ondragleave = () => {
    dropZone.style.borderColor = "rgba(255,255,255,0.2)";   
};

dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "rgba(255,255,255,0.2)";
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
};

