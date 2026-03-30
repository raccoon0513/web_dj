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
}