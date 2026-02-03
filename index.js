let audioCtx;
let audioTag = new Audio();
let sourceNode;
let directoryHandle;

const vinyl = document.getElementById('vinyl');
const tonearm = document.getElementById('tonearm');
const playlist = document.getElementById('playlist');
const dropZone = document.getElementById('dropZone');

// 오디오 엔진 초기화
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        sourceNode = audioCtx.createMediaElementSource(audioTag);
        sourceNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// 트랙 재생 로직
async function playTrack(file) {
    initAudio();
    
    const url = URL.createObjectURL(file);
    audioTag.src = url;
    
    // 바늘을 LP 위로 이동
    tonearm.style.transform = "rotate(12deg)"; 
    
    audioTag.oncanplaythrough = () => {
        // 바늘이 닿은 후 음악 재생되는 듯한 지연 시간
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

// 폴더 열기 기능
document.getElementById('btnOpenDir').onclick = async () => {
    try {
        directoryHandle = await window.showDirectoryPicker();
        playlist.innerHTML = "";
        for await (const entry of directoryHandle.values()) {
            if (entry.kind === 'file') addTrackToUI(entry);
        }
    } catch (e) {
        console.log("폴더 선택이 취소되었습니다.");
    }
};

// UI에 트랙 추가
function addTrackToUI(entry) {
    const div = document.createElement('div');
    div.className = 'track-item';
    div.textContent = entry.name;
    div.onclick = async () => {
        const file = await entry.getFile();
        playTrack(file);
    };
    playlist.appendChild(div);
}

// 드래그 앤 드롭 파일 저장
dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "#ff5722";
};

dropZone.ondragleave = () => {
    dropZone.style.borderColor = "rgba(255,255,255,0.2)";
};

dropZone.ondrop = async (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "rgba(255,255,255,0.2)";
    
    if (!directoryHandle) {
        alert("먼저 '폴더 연결하기' 버튼을 눌러 저장할 폴더를 지정해주세요.");
        return;
    }

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
        try {
            const handle = await directoryHandle.getFileHandle(file.name, { create: true });
            const writable = await handle.createWritable();
            await writable.write(file);
            await writable.close();
            addTrackToUI(handle);
        } catch (err) {
            console.error("파일 저장 실패:", err);
        }
    }
};