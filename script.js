// script.js
let audioCtx;
let audioTag = new Audio();
let sourceNode;

const vinyl = document.getElementById('vinyl');
const tonearm = document.getElementById('tonearm');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const dropZone = document.getElementById('dropZone');
const trackDisplay = document.getElementById('currentTrack');

// 오디오 엔진 초기화
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        sourceNode = audioCtx.createMediaElementSource(audioTag);
        sourceNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// 파일 처리 및 재생 로직
async function handleFile(file) {
    if (!file || !file.type.startsWith('audio/')) {
        alert("오디오 파일만 업로드 가능합니다.");
        return;
    }

    initAudio();
    
    // 기존 URL 해제 및 새 URL 생성
    const url = URL.createObjectURL(file);
    audioTag.src = url;
    
    // UI 업데이트
    trackDisplay.textContent = `재생 준비 완료: ${file.name}`;
    
    // 바늘 이동 및 재생 연출
    tonearm.style.transform = "rotate(12deg)"; 
    
    audioTag.oncanplaythrough = () => {
        setTimeout(() => {
            audioTag.play();
            vinyl.classList.add('spinning');
        }, 1000);
    };

    audioTag.onended = () => {
        stopPlayback();
    };
}

function stopPlayback() {
    vinyl.classList.remove('spinning');
    tonearm.style.transform = "rotate(-35deg)";
}

// 이벤트 리스너: 버튼 클릭
uploadBtn.onclick = () => fileInput.click();

// 이벤트 리스너: 파일 선택
fileInput.onchange = (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
};

// 이벤트 리스너: 드래그 앤 드롭
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