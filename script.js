// script.js
let audioCtx;
let sourceNode;
let audioBuffer; // 오디오 데이터를 담을 버퍼
let isPlaying = false;

const vinyl = document.getElementById('vinyl');
const tonearm = document.getElementById('tonearm');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');

// 오디오 엔진 초기화
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// 파일 처리 및 재생 로직
async function handleFile(file) {
    if (!file || !file.type.startsWith('audio/')) return;

    initAudio();
    const arrayBuffer = await file.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer); // 데이터 디코딩

    playBuffer();
}

function playBuffer() {
    if (sourceNode) sourceNode.stop();

    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(audioCtx.destination);
    
    // 슬라이더의 현재 값 적용 (역재생 포함)
    const currentSpeed = parseFloat(speedSlider.value);
    sourceNode.playbackRate.value = currentSpeed;

    tonearm.style.transform = "rotate(12deg)";
    
    setTimeout(() => {
        sourceNode.start(0);
        vinyl.classList.add('spinning');
        isPlaying = true;
    }, 1000);

    sourceNode.onended = () => {
        if (isPlaying) stopPlayback();
    };
}

// 실시간 속도 조절 이벤트
speedSlider.oninput = (e) => {
    const val = parseFloat(e.target.value);
    speedValue.textContent = val.toFixed(1);
    
    if (sourceNode && isPlaying) {
        // Web Audio API는 playbackRate에 음수값을 허용하여 역재생을 지원합니다
        sourceNode.playbackRate.value = val;
    }
};

function stopPlayback() {
    isPlaying = false;
    vinyl.classList.remove('spinning');
    tonearm.style.transform = "rotate(-35deg)";
}

// ... (기존 업로드 관련 이벤트 리스너는 유지)