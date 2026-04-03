// 

/**
 * 초 단위의 시간을 '분:초' 형식의 문자열로 변환합니다.
 * @param {number} sec - 변환할 초 단위 시간
 * @returns {string} '0:00' 형식의 문자열
 */
const formatTime = (sec) => {
    const m = Math.floor(Math.max(0, sec) / 60);
    const s = Math.floor(Math.max(0, sec) % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
};

/**
 * 파일 이름에서 BPM 정보를 추출합니다. 
 * 예: "song_128bpm.mp3" -> 128
 * @param {string} fileName - 파일명
 * @returns {number|null} 추출된 BPM 값 또는 null
 */
const extractBPMFromFileName = (fileName) => {
    // 확장자를 제외한 파일 이름 추출
    const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
    
    // 이름 끝이 '숫자bpm'으로 끝나는지 확인하는 정규표현식 (대소문자 무시)
    const match = nameWithoutExt.match(/(\d+)bpm$/i);
    
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    return null;
};

/**
 * 선형 보간(Linear Interpolation) 등 향후 추가될 
 * 공통 계산 로직들을 이 파일에 추가해 나갈 수 있습니다.
 */