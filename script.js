// 전역 객체 등록 (Sync 기능에서 상대 덱을 참조하기 위함)
window.deckA = new VinylDeck('deck-a', 'multi-deck-container-a');
window.deckB = new VinylDeck('deck-b', 'multi-deck-container-b');

const crossfader = document.querySelector('.crossfader-slider');

if (crossfader) {
    crossfader.oninput = (e) => {
        const value = parseFloat(e.target.value) / 100;
        
        if (window.deckA.engine) {
            window.deckA.engine.setGain(1 - value);
        }
        
        if (window.deckB.engine) {
            window.deckB.engine.setGain(value);
        }
    };
}// script.js 최하단에 추가

const masterPlayBtn = document.getElementById('master-play-btn');
const masterPauseBtn = document.getElementById('master-pause-btn');

if (masterPlayBtn) {
    masterPlayBtn.onclick = () => {
        if (window.deckA && !window.deckA.state.isPlaying) window.deckA.view.playBtn.click();
        if (window.deckB && !window.deckB.state.isPlaying) window.deckB.view.playBtn.click();
    };
}

if (masterPauseBtn) {
    masterPauseBtn.onclick = () => {
        if (window.deckA && window.deckA.state.isPlaying) window.deckA.view.pauseBtn.click();
        if (window.deckB && window.deckB.state.isPlaying) window.deckB.view.pauseBtn.click();
    };
}