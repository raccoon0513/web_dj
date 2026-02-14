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
const angle_display= document.getElementById('angle_display')

//레코드판 중심 위치 가져오기
const rect = vinyl.getBoundingClientRect();
// 중심 X 좌표 = 요소의 왼쪽 시작점 + (너비 / 2)
const centerX = rect.left + rect.width / 2;

// 중심 Y 좌표 = 요소의 위쪽 시작점 + (높이 / 2)
const centerY = rect.top + rect.height / 2;


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

function updateUI() { //ui 갱신 관련 함수
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
    lastY = e.clientY;
    lastX = e.clientX;
    lastAngle = calculate_angle(x=lastX,y=lastY)
    vinyl.style.cursor = 'grabbing';

    set_angle_display(calculate_angle(x=lastX, y=lastY))
};


window.onmousemove = (e) => {
    if (!isDragging || !isPlaying) return;

    // 1. 현재 각도만 구합니다. (좌표 오타 수정 완료)
    const currentMouseAngle = calculate_angle(e.clientX, e.clientY);
    
    // 2. 이전 각도와의 차이(deltaAngle)를 구합니다.
    let deltaAngle = currentMouseAngle - lastAngle

    // 3. 180도 경계선 보정
    if (deltaAngle > 180) deltaAngle -= 360;
    else if (deltaAngle < -180) deltaAngle += 360;
    
    // 4. 드래그 속도 반영 (감도는 0.01~0.02 추천)
    dragVelocity = deltaAngle * 0.1; 
    
    // 5. 다음 계산을 위해 현재 각도를 '마지막 각도'로 저장
    lastAngle = currentMouseAngle;

    // UI 및 오디오 반영
    set_angle_display(currentMouseAngle.toFixed(2));
    if (sourceNode) {
        sourceNode.playbackRate.value = Math.abs(parseFloat(speedSlider.value) + dragVelocity); 
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

