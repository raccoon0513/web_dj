let audioCtx, sourceNode, audioBuffer, reversedBuffer;
let isPlaying = false;
let currentPosition = 0; // 현재 곡의 위치 (초)
let lastUpdateTime = 0;  // 마지막으로 위치를 계산한 시점
let currentAngle =0;

// 드래그 조작을 위한 변수 추가
let isDragging = false;
let lastAngle = 0;
let dragVelocity = 0; // 드래그 속도 축적


//=======================
// Config (fine-tunning)
// 곡의 배속
const tempo_rate = 5.0;
// LP 민감도
const lp_sensitivity = 0.05;
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
    sourceNode.connect(audioCtx.destination);

    // 역재생 버퍼는 데이터가 뒤집혀 있으므로 시작 지점도 뒤집어서 계산
    const startOffset = isReversed ? (audioBuffer.duration - currentPosition) : currentPosition;

    sourceNode.start(0, Math.max(0, startOffset));
    lastUpdateTime = audioCtx.currentTime;
    isPlaying = true;
    vinyl.classList.add('spinning');
    
    updateUI(); // 진행 바 업데이트 시작
}

// script.js - updateUI 함수 수정

function updateUI() {
    if (!isPlaying || !audioBuffer) return;

    // 1. 속도 결정 로직 변경
    let effectiveSpeed;
    
    if (isDragging) {
        // LP판을 잡고 있는 동안에는 슬라이더 배속(1배속 등)을 무시하고 
        // 오직 마우스 움직임(dragVelocity)에 의해서만 소리가 납니다.
        effectiveSpeed = dragVelocity; 
    } else {
        // 손을 뗐을 때만 슬라이더의 기본 배속이나 남은 관성 속도를 반영합니다.
        effectiveSpeed = parseFloat(speedSlider.value) + dragVelocity;
    }

    // 2. 배속 제한 적용 (기존 tempo_rate 활용)
    effectiveSpeed = Math.max(Math.min(effectiveSpeed, tempo_rate), -tempo_rate);

    let now = audioCtx.currentTime;
    let deltaTime = now - lastUpdateTime;
    lastUpdateTime = now;

    // 현재 위치 및 각도 업데이트
    currentPosition += deltaTime * effectiveSpeed;
    const rotationPerSecond = 360 / 1.8;
    currentAngle += rotationPerSecond * effectiveSpeed * deltaTime;
    
    vinyl.style.transform = `rotate(${currentAngle % 360}deg)`;
    
    // 오디오 엔진 및 UI 반영
    if (sourceNode) {
        sourceNode.playbackRate.value = Math.abs(effectiveSpeed);
        speedValue.textContent = effectiveSpeed.toFixed(3);
    }
    
    if (currentPosition >= audioBuffer.duration || currentPosition < 0) {
        stopPlayback();
    } else {
        requestAnimationFrame(updateUI);
    }
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
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
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

    // 클릭하는 시점의 LP판 위치와 크기를 다시 계산합니다.
    const rect = vinyl.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;

    lastAngle = calculate_angle(e.clientX, e.clientY);
    vinyl.style.cursor = 'grabbing';
    set_angle_display(lastAngle.toFixed(2));
};


// script.js
window.onmousemove = (e) => {
    if (!isDragging || !isPlaying) return;

    const currentMouseAngle = calculate_angle(e.clientX, e.clientY);
    let deltaAngle = currentMouseAngle - lastAngle;

    if (deltaAngle > 180) deltaAngle -= 360;
    else if (deltaAngle < -180) deltaAngle += 360;
    
    dragVelocity = deltaAngle * lp_sensitivity; 
    lastAngle = currentMouseAngle;

    if (sourceNode) {
        // 1. 기본 슬라이더 값에 드래그 속도를 합친 목표 배속 계산
        let targetSpeed = parseFloat(speedSlider.value) + dragVelocity;

        // TODO : 배속 상한. 후에 수치 수정
        targetSpeed = Math.max(Math.min(targetSpeed, tempo_rate), -1 * tempo_rate);

        // 3. 실제 오디오 엔진에 반영 (절대값 적용)
        // 0.06배속 미만은 소리가 거의 들리지 않으므로 최소 재생 속도를 0.1 정도로 잡는 것도 좋습니다.
        sourceNode.playbackRate.value = Math.abs(targetSpeed);
        
        // UI에도 제한된 배속을 표시
        speedValue.textContent = targetSpeed.toFixed(3);
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

