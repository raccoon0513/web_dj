let audioCtx, sourceNode, audioBuffer, reversedBuffer;
let isPlaying = false;
let currentPosition = 0; // 현재 곡의 위치 (초)
let currentAcceleration = 0; //현재 가속도 // TODO : 안쓴다?삭제
let lastUpdateTime = 0;  // 마지막으로 위치를 계산한 시점
let currentAngle =0;

// 드래그 조작을 위한 변수 추가
let isDragging = false;
let lastY = 0;
let lastX = 0;
let lastAngle = 0;
let dragVelocity = 0; // 드래그 속도 축적


const vinyl = document.getElementById('vinyl');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const progressSlider = document.getElementById('progressSlider');
const currentTimeText = document.getElementById('currentTime');
const durationText = document.getElementById('duration');

// TODO : 테스트용 angle display 출력기임. 후에 html 내 div태그랑 같이 삭제할 것
//angle_display_tester자체를 날릴 것
const angle_display= document.getElementsById('angle_display')

//레코드판 중심 위치 가져오기
const rect = vinyl.getBoundingClientRect();
// 중심 X 좌표 = 요소의 왼쪽 시작점 + (너비 / 2)
const centerX = rect.left + rect.width / 2;

// 중심 Y 좌표 = 요소의 위쪽 시작점 + (높이 / 2)
const centerY = rect.top + rect.height / 2;


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

function updateUI() {
    if (!isPlaying || !audioBuffer) return;

    // 드래그 중일 때는 드래그 속도를 반영하여 판을 돌림
    let baseSpeed = parseFloat(speedSlider.value);
    let effectiveSpeed = isDragging ? baseSpeed + dragVelocity : baseSpeed;

    let now = audioCtx.currentTime;
    let deltaTime = now - lastUpdateTime;
    lastUpdateTime = now;

    // 드래그 중에는 오디오 위치도 드래그 속도에 맞춰 변화
    currentPosition += deltaTime * effectiveSpeed;
    
    // LP판 각도 업데이트 (동기화)
    const rotationPerSecond = 360 / 1.8;
    currentAngle += rotationPerSecond * effectiveSpeed * deltaTime;
    
    vinyl.style.transform = `rotate(${currentAngle % 360}deg)`;
    
    // ... 기존 UI 업데이트 로직 (progressSlider 등) 동일

    if (currentPosition >= audioBuffer.duration || currentPosition < 0) {
        stopPlayback();
    } else {
        requestAnimationFrame(updateUI);
    }
}
// 속도 조절 시 현재 위치를 유지하며 즉시 재재생
speedSlider.oninput = (e) => {
    const val = parseFloat(e.target.value);

    //인터페이스 속도 표시창 값 변경
    speedValue.textContent = val.toFixed(3);

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

// 1. LP판 클릭/드래그 이벤트 설정
vinyl.onmousedown = (e) => {
    if (!isPlaying) return;
    isDragging = true;
    lastY = e.clientY;
    lastX = e.clientX;
    vinyl.style.cursor = 'grabbing';
};

window.onmousemove = (e) => {
    if (!isDragging || !isPlaying) return;

    // 드래그 방향 및 거리 계산 (Y축 기준)
    let deltaY = lastY - e.clientY; // 위로 밀면 양수, 아래로 밀면 음수
    let deltaX = lastX - e.clientY; // 위로 밀면 양수, 아래로 밀면 음수
    lastY = e.clientY;
    lastX = e.clientX;

    // 드래그 속도를 실제 재생 속도에 반영 (감도 조절: 0.05)
    dragVelocity = deltaY * 0.05;
    
    // 현재 슬라이더 값에 드래그 속도를 더함
    let targetSpeed = parseFloat(speedSlider.value) + dragVelocity;
    
    // 오디오 노드에 즉시 속도 반영
    if (sourceNode) {
        // 일시적으로 아주 빠른 스크래치 소리를 위해 절대값 적용
        speedValue.textContent = targetSpeed.toFixed(3);
        sourceNode.playbackRate.value = Math.abs(targetSpeed); 
    }
};

window.onmouseup = () => {
    if (isDragging) {
        isDragging = false;
        vinyl.style.cursor = 'pointer';
        
        // 마우스를 떼면 다시 슬라이더의 설정 속도로 부드럽게 복귀
        if (sourceNode && isPlaying) {
            sourceNode.playbackRate.value = Math.abs(parseFloat(speedSlider.value));
        }
    }
};

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

