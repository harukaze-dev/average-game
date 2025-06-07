document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- DOM Elements ---
    const toastContainer = document.getElementById('toast-container');
    const lobbyContainer = document.getElementById('lobby-container');
    const gameContainer = document.getElementById('game-container');
    const playerNameInput = document.getElementById('player-name-input');
    const lobbyProfilePreview = document.getElementById('lobby-profile-preview');
    const lobbyProfileInput = document.getElementById('lobby-profile-input');
    const roomActions = document.getElementById('room-actions');
    const createRoomBtn = document.getElementById('create-room-btn');
    const roomCodeInput = document.getElementById('room-code-input');
    const joinRoomBtn = document.getElementById('join-room-btn');
    
    const copyCodeBtn = document.getElementById('copy-code-btn');
    const hostControls = document.getElementById('host-controls');
    const questionContainer = document.getElementById('question-container');
    const questionInput = document.getElementById('question-input');
    const gameBoard = document.getElementById('game-board');
    const resultsSection = document.getElementById('results');
    const resultSummary = document.getElementById('result-summary');
    const viewResultsButton = document.getElementById('view-results-button');
    const resetRoundButton = document.getElementById('reset-round-button');

    // --- Global State ---
    let myRoomCode = '';
    let myPlayerId = '';
    let myProfileImageSrc = lobbyProfilePreview.src;

    // --- Lobby Logic ---
    const enterGameView = () => {
        document.body.classList.remove('in-lobby');
        lobbyContainer.classList.add('hidden');
        gameContainer.classList.remove('hidden');
    };

    lobbyProfilePreview.addEventListener('click', () => {
        lobbyProfileInput.click();
    });

    lobbyProfileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                myProfileImageSrc = e.target.result;
                lobbyProfilePreview.src = myProfileImageSrc;
            };
            reader.readAsDataURL(file);
        }
    });

    playerNameInput.addEventListener('input', () => {
        if (playerNameInput.value.trim()) {
            roomActions.classList.remove('hidden');
        } else {
            roomActions.classList.add('hidden');
        }
    });

    createRoomBtn.addEventListener('click', () => {
        const playerName = playerNameInput.value.trim();
        if (!playerName) return alert('이름을 입력하세요!');
        socket.emit('createRoom', { playerName, profileImageSrc: myProfileImageSrc });
    });

    joinRoomBtn.addEventListener('click', () => {
        const playerName = playerNameInput.value.trim();
        const roomCode = roomCodeInput.value.trim().toUpperCase();
        if (!playerName || !roomCode) return alert('이름과 초대 코드를 모두 입력하세요!');
        socket.emit('joinRoom', { roomCode, playerName, profileImageSrc: myProfileImageSrc });
    });

    // --- Socket Event Handlers ---
    socket.on('connect', () => { myPlayerId = socket.id; });
    
    const onRoomJoined = ({ roomCode }) => {
        myRoomCode = roomCode;
        enterGameView();
    };
    socket.on('roomCreated', onRoomJoined);
    socket.on('roomJoined', onRoomJoined);
    
    socket.on('updateGameState', (gameState) => {
        if (!gameState) return;
        renderGame(gameState);
    });

    socket.on('playerJoined', ({ playerName }) => showToast(`${playerName} 님이 입장했습니다.`, 'join'));
    socket.on('playerLeft', ({ playerName }) => showToast(`${playerName} 님이 퇴장했습니다.`, 'leave'));
    socket.on('error', ({ message }) => { alert(message); });

    // --- Game Logic ---
    copyCodeBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(myRoomCode).then(() => showToast('초대 코드가 복사되었습니다!'));
    });

    questionInput.addEventListener('input', () => {
        socket.emit('updateQuestion', { roomCode: myRoomCode, question: questionInput.value });
    });
    
    gameBoard.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        const target = event.target;
        if (target.classList.contains('number-input')) {
            event.preventDefault();
            const card = target.closest('.player-card');
            if (card) card.querySelector('.btn-submit').click();
        }
    });
    
    gameBoard.addEventListener('input', (event) => {
        const target = event.target;
        if (target.classList.contains('number-input')) {
            const originalValue = target.value;
            const numericValue = originalValue.replace(/[^0-9]/g, '');
            if (originalValue !== numericValue) {
                alert('숫자만 입력할 수 있습니다.');
            }
            target.value = numericValue;
        }
    });

    gameBoard.addEventListener('click', (event) => {
        const target = event.target;
        if (target.dataset.action !== 'submit') return;
        
        const card = target.closest('.player-card');
        if (!card || card.dataset.playerId !== myPlayerId) return;
        
        const numberInput = card.querySelector('.number-input');
        const isSubmitted = target.textContent === '취소';

        if (!isSubmitted && numberInput.value === '') return alert('숫자를 입력해주세요!');

        socket.emit('submitValue', { 
            roomCode: myRoomCode, 
            value: isSubmitted ? null : parseInt(numberInput.value),
            submitted: !isSubmitted
        });
    });
    
    // --- Host Controls ---
    viewResultsButton.addEventListener('click', () => socket.emit('viewResults', { roomCode: myRoomCode }));
    resetRoundButton.addEventListener('click', () => socket.emit('resetRound', { roomCode: myRoomCode }));

    // --- Render Functions ---
    function renderGame(gameState) {
        const players = Object.values(gameState.players);
        const me = players.find(p => p.id === myPlayerId);
        const amIHost = me && me.isHost;

        questionContainer.classList.toggle('hidden', gameState.state === 'results');
        gameBoard.classList.toggle('hidden', gameState.state === 'results');
        resultsSection.classList.toggle('hidden', gameState.state !== 'results');
        hostControls.classList.toggle('hidden', !amIHost);
        viewResultsButton.classList.toggle('hidden', gameState.state === 'results' || !amIHost);
        resetRoundButton.classList.toggle('hidden', gameState.state !== 'results' || !amIHost);

        questionInput.value = gameState.question;
        questionInput.disabled = !amIHost;

        gameBoard.innerHTML = '';
        players.forEach(player => {
            gameBoard.appendChild(createPlayerCard(player, player.id === myPlayerId));
        });
        
        const allSubmitted = players.length > 0 && players.every(p => p.submitted);
        viewResultsButton.disabled = !allSubmitted;
        
        if (gameState.state === 'results') {
            renderResults(gameState);
        }
    }
    
    function createPlayerCard(player, isMe) {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.dataset.playerId = player.id;
        card.style.borderColor = player.color;
        card.style.setProperty('--tint-color', player.color + '20');

        if (player.submitted) card.classList.add('submitted');

        const textColor = (player.color === '#fff176') ? '#000000' : '#ffffff';
        const numberInputType = (player.submitted) ? 'password' : 'text';

        let contentHtml;
        if (isMe) {
            contentHtml = `
                <div class="player-info-text">
                    <div class="player-name">${player.name}</div>
                </div>
                <div class="input-area">
                    <input type="${numberInputType}" class="number-input" placeholder="-" value="${player.value || ''}" ${player.submitted ? 'disabled' : ''}>
                    <button class="btn-submit" data-action="submit" style="background-color: ${player.color}; color: ${textColor};">${player.submitted ? '취소' : '완료'}</button>
                </div>
            `;
        } else {
            contentHtml = `
                <div class="player-info-text">
                    <div class="player-name">${player.name}</div>
                    <div class="player-status">${player.submitted ? '입력 완료!' : '입력 대기중...'}</div>
                </div>
            `;
        }
        
        card.innerHTML = `
            <div class="profile-section">
                <div class="profile-image-container">
                    <img src="${player.imageSrc}" class="profile-image-preview">
                </div>
            </div>
            <div class="content-section">
                ${contentHtml}
            </div>`;
        return card;
    }
    
    function renderResults(gameState) {
        const players = Object.values(gameState.players);
        const total = players.reduce((sum, p) => sum + p.value, 0);
        const average = total / players.length;

        players.forEach(p => p.diff = Math.abs(p.value - average));
        players.sort((a, b) => a.diff - b.diff);

        let rank = 1;
        for (let i = 0; i < players.length; i++) {
            if (i > 0 && players[i].diff > players[i-1].diff) rank = i + 1;
            players[i].rank = rank;
        }
        const maxRank = Math.max(...players.map(p => p.rank));
        const maxDiff = Math.max(...players.map(p => p.diff), 1);
        
        const rankingHtml = players.map(p => {
            let rankDisplay;
            if (p.rank === 1) { rankDisplay = '👑'; } 
            else if (p.rank === maxRank && players.length > 1) { rankDisplay = '💀'; }
            else { rankDisplay = `${p.rank}위`; }
            
            const isWinner = p.rank === 1;
            const barWidth = (p.diff / maxDiff) * 100;

            return `
            <li class="${isWinner ? 'winner' : ''}" style="${isWinner ? `--winner-color: ${p.color};` : ''}">
                <div class="player-info">
                    <span class="rank-display">${rankDisplay}</span>
                    <img src="${p.imageSrc}" class="profile-image-result">
                    <span>${p.name}</span>
                </div>
                <div class="result-details">
                    <span class="submitted-value">입력: <b>${p.value}</b></span>
                    <span class="diff-value">(차이: ${p.diff.toFixed(2)})</span>
                    <div class="diff-bar-wrapper">
                        <div class="diff-bar" style="width: ${barWidth}%; background-color: ${p.color};"></div>
                    </div>
                </div>
            </li>`;
        }).join('');

        resultSummary.innerHTML = `
            <h2>${gameState.question || '게임 결과'}</h2>
            <p class="average-value">평균값: ${average.toFixed(2)}</p>
            <ol id="ranking-list">${rankingHtml}</ol>`;
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }
});