let audioCtx, sourceNode, audioBuffer, reversedBuffer, filterNode;
let isPlaying = false;
let currentPosition = 0; // 현재 곡의 위치 (초)
let lastUpdateTime = 0;  // 마지막으로 위치를 계산한 시점
let currentAngle = 0;

// 드래그 조작을 위한 변수 추가
let isDragging = false;
let lastAngle = 0;
let dragVelocity = 0; // 드래그 속도 축적

//정지시 컨트롤을 위한 변수
let brakeVelocity = 0;

//=======================
// Config (fine-tunning)
// 곡의 배속 한계(기본 5.0)
const tempo_rate = 10;

// LP 민감도 (기본 0.3)
const lp_sensitivity = 0.3;

// 민감도에 곱해지는 델타상수값?
const alpha_delta = 1.3;

// 마우스 클릭시 감쇄도
const brake_force = 0.85; // 0에 가까울수록 급정거

// 마우스 뗐을 때 관성도 (기본값 0.95)
const friction = 0.95; // 1에 가까울수록 오래 돌고, 작을수록 빨리 멈춥니다.

//=======================

const vinyl = document.getElementById('vinyl');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const progressSlider = document.getElementById('progressSlider');
const currentTimeText = document.getElementById('currentTime');
const durationText = document.getElementById('duration');

// TODO : 테스트용 angle display 출력기임. 후에 html 내 div태그랑 같이 삭제할 것
//angle_display_tester자체를 날릴 것
const angle_display= document.getElementById('angle_display')


let centerX, centerY;


// 오디오 엔진 초기화
async function handleFile(file) { //file input 관련 함수
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

function playBuffer() { //재생관련함수
    if (sourceNode) sourceNode.stop();

    initAudio();
    sourceNode = audioCtx.createBufferSource();
    const speed = parseFloat(speedSlider.value);
    const isReversed = speed < 0;

    // 현재 위치를 기준으로 어떤 버퍼의 어느 지점에서 시작할지 결정
    sourceNode.buffer = isReversed ? reversedBuffer : audioBuffer;
    sourceNode.playbackRate.value = Math.abs(speed);
    sourceNode.connect(filterNode);

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

    let baseSpeed = parseFloat(speedSlider.value);
    let effectiveSpeed;

    if (isDragging) {
        // [수정] 잡은 직후에는 기존 속도에서 brake_force만큼 서서히 0으로 감쇄
        if (Math.abs(brakeVelocity) > 0.001) {
            brakeVelocity *= brake_force;
        } else {
            brakeVelocity = 0;
        }
        // 잡고 있는 동안은 브레이크 속도 + 드래그 속도만 반영
        effectiveSpeed = (brakeVelocity + dragVelocity) * lp_sensitivity;
    } else {
        // 손을 뗐을 때의 로직은 기존 관성 로직 유지
        if (Math.abs(dragVelocity) > 0.001) dragVelocity *= friction;
        else dragVelocity = 0;
        
        effectiveSpeed = baseSpeed + dragVelocity;
    }

    if (filterNode) {
        // 배속(effectiveSpeed)이 높을수록 컷오프 주파수를 낮춰서 먹먹한 소리를 냄
        // 예: 1배속일 때 20kHz, 5배속일 때 5kHz로 제한
        let cutoff = Math.max(2000, 20000 - Math.abs(effectiveSpeed) * 3000);
        filterNode.frequency.setTargetAtTime(cutoff, audioCtx.currentTime, 0.1);
    }


    // 2. 배속 제한 적용 (Config에 설정한 tempo_rate 활용)
    effectiveSpeed = Math.max(Math.min(effectiveSpeed, tempo_rate), -tempo_rate);

    let now = audioCtx.currentTime;
    let deltaTime = now - lastUpdateTime;
    lastUpdateTime = now;

    // 3. 현재 오디오 위치 및 LP 각도 업데이트
    currentPosition += deltaTime * effectiveSpeed;
    const rotationPerSecond = 360 / 1.8; // 45RPM 기준 회전수 계산
    currentAngle += rotationPerSecond * effectiveSpeed * deltaTime;
    
    // LP판 시각적 회전 반영
    vinyl.style.transform = `rotate(${currentAngle % 360}deg)`;
    
    // 4. 오디오 엔진 및 속도 표시 UI 반영
    if (sourceNode) {
        sourceNode.playbackRate.value = Math.abs(effectiveSpeed);
        speedValue.textContent = effectiveSpeed.toFixed(3);
    }

    // 5. 진행 바 및 시간 표시 업데이트 (동일 로직)
    const progress = (currentPosition / audioBuffer.duration) * 100;
    progressSlider.value = Math.min(Math.max(0, progress), 100);
    currentTimeText.textContent = formatTime(Math.max(0, currentPosition));

    // 6. 재생 종료 조건 확인 및 루프
    if (currentPosition >= audioBuffer.duration || currentPosition < 0) {
        stopPlayback();
    } else {
        requestAnimationFrame(updateUI);
    }
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    // 초가 10보다 작으면 앞에 '0'을 붙여 "01", "02" 처럼 표시합니다.
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// 속도 조절 시 현재 위치를 유지하며 즉시 재 재생
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

function stopPlayback() {
    isPlaying = false;
    currentPosition = 0; // 초기화
    vinyl.classList.remove('spinning');
}

function initAudio() { // 오디오 버퍼 초기화
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = 20000; // 기본은 모든 소리 통과
        filterNode.connect(audioCtx.destination);
    }
}

// TODO : 이벤트 리스너 및 기타 함수 찾아서 angle_display 값 변경하는 코드 짜기
// get/set으로 설정할까?

function set_angle_display(value){
    angle_display.textContent = value;
    return
}
function get_angle_display(value){
    return angle_display.textContent;
}

function calculate_angle(x, y) {
    // Math.atan2(y, x) 순서이며, 결과에 180/PI를 곱해 degree로 변환합니다.
    return Math.atan2(y - centerY, x - centerX) * 180 / Math.PI;
}

function set_tempo(){//곡 속도 컨트롤

}

// 1. LP판 클릭/드래그 이벤트 설정
vinyl.onmousedown = (e) => {
    if (!isPlaying) return;
    isDragging = true;

    // lp 정지시 관성을 가지고 속도 줄임
    brakeVelocity = parseFloat(speedSlider.value) + dragVelocity;

    // 클릭하는 시점의 LP판 위치와 크기를 다시 계산합니다.
    const rect = vinyl.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;

    lastAngle = calculate_angle(e.clientX, e.clientY);
    vinyl.style.cursor = 'grabbing';
    set_angle_display(lastAngle.toFixed(2));
};

window.onmousemove = (e) => {
    if (!isDragging || !isPlaying) return;

    const currentMouseAngle = calculate_angle(e.clientX, e.clientY);
    let deltaAngle = currentMouseAngle - lastAngle;

    if (deltaAngle > 180) deltaAngle -= 360;
    else if (deltaAngle < -180) deltaAngle += 360;
    
    // 1. 드래그 속도 값만 갱신합니다.
    dragVelocity = deltaAngle; 
    lastAngle = currentMouseAngle;

    // 2. 디버깅용 각도 표시만 업데이트합니다.
    set_angle_display(currentMouseAngle.toFixed(2));
    
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

