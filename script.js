let audioCtx, sourceNode, audioBuffer, reversedBuffer;
let isPlaying = false;
let startTime = 0; // 현재 재생 위치 추적을 위함

const vinyl = document.getElementById('vinyl');
const tonearm = document.getElementById('tonearm');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');

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

    sourceNode = audioCtx.createBufferSource();
    
    const currentSpeed = parseFloat(speedSlider.value);
    
    // 슬라이더가 음수면 역재생 버퍼를, 양수면 일반 버퍼를 선택
    sourceNode.buffer = currentSpeed < 0 ? reversedBuffer : audioBuffer;
    
    // 배속은 항상 양수값으로 적용 (버퍼 자체를 뒤집었으므로)
    sourceNode.playbackRate.value = Math.abs(currentSpeed);

    sourceNode.connect(audioCtx.destination);
    
    tonearm.style.transform = "rotate(12deg)";
    
    setTimeout(() => {
        sourceNode.start(0);
        vinyl.classList.add('spinning');
        isPlaying = true;
    }, 1000);

    sourceNode.onended = () => { if (isPlaying) stopPlayback(); };
}

// 실시간 속도 조절 이벤트
speedSlider.oninput = (e) => {
    const val = parseFloat(e.target.value);
    speedValue.textContent = val.toFixed(1);
    
    if (isPlaying && audioBuffer) {
        // 재생 중에 방향이 바뀌면 새로 재생해야 함 (버퍼 교체)
        // 단순 배속 변경만 일어날 때는 playbackRate만 수정
        const isReversing = val < 0;
        const currentlyReversed = sourceNode.buffer === reversedBuffer;

        if (isReversing !== currentlyReversed) {
            playBuffer(); // 방향 전환 시 재시작
        } else {
            sourceNode.playbackRate.value = Math.abs(val);
        }
    }
};

function stopPlayback() {
    isPlaying = false;
    vinyl.classList.remove('spinning');
    tonearm.style.transform = "rotate(-35deg)";
}




// 1. 노래 업로드 버튼 클릭 시 파일 선택창 열기
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');

uploadBtn.onclick = () => fileInput.click();

// 2. 파일 선택창에서 파일이 선택되었을 때 처리
fileInput.onchange = (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
};

// 3. 드래그 앤 드롭 영역 설정
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