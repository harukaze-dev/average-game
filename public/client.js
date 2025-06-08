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
    const mainGameArea = document.getElementById('main-game-area'); // 메인 영역
    const gameBoard = document.getElementById('game-board');
    const rankingBoardContainer = document.getElementById('ranking-board-container'); // 질문 페이즈 랭킹 보드
    const rankingBoardContainerResult = document.getElementById('ranking-board-container-result'); // 결과 페이즈 랭킹 보드
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

    // --- Helper Functions ---
    function formatNumber(num) {
        if (Number.isInteger(num)) return num;
        return num.toFixed(1);
    }

    // --- Render Functions ---
    function renderGame(gameState) {
        const players = Object.values(gameState.players);
        const me = players.find(p => p.id === myPlayerId);
        const amIHost = me && me.isHost;
        const isWaitingPhase = gameState.state !== 'results';

        // UI 요소 보이기/숨기기
        questionContainer.classList.toggle('hidden', !isWaitingPhase);
        mainGameArea.classList.toggle('hidden', !isWaitingPhase);
        resultsSection.classList.toggle('hidden', isWaitingPhase);
        hostControls.classList.toggle('hidden', !amIHost);
        viewResultsButton.classList.toggle('hidden', !isWaitingPhase || !amIHost);
        resetRoundButton.classList.toggle('hidden', isWaitingPhase || !amIHost);

        questionInput.value = gameState.question;
        questionInput.disabled = !amIHost;

        // 누적 순위 계산 (점수가 낮을수록 순위가 높음)
        const sortedByScore = [...players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
        let currentRank = 1;
        for (let i = 0; i < sortedByScore.length; i++) {
            if (i > 0 && sortedByScore[i].cumulativeScore > sortedByScore[i-1].cumulativeScore) {
                currentRank = i + 1;
            }
            const playerToUpdate = players.find(p => p.id === sortedByScore[i].id);
            if (playerToUpdate) {
                playerToUpdate.cumulativeRank = currentRank;
            }
        }
        
        // 플레이어 카드 렌더링
        gameBoard.innerHTML = '';
        players.forEach(player => {
            gameBoard.appendChild(createPlayerCard(player, player.id === myPlayerId));
        });

        // 누적 랭킹 보드 렌더링 (화면 상태에 따라 다른 위치에)
        if (isWaitingPhase) {
            renderRankingBoard(sortedByScore, rankingBoardContainer);
        } else {
            renderRankingBoard(sortedByScore, rankingBoardContainerResult);
        }
        
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
        
        let contentHtml;
        if (isMe) {
            // 본인 카드
            contentHtml = `
                <div class="player-info-text">
                    <div class="player-name">${player.name}</div>
                </div>
                <div class="input-area">
                    <input type="text" class="number-input" placeholder="-" value="${player.value || ''}" ${player.submitted ? 'disabled' : ''}>
                    <button class="btn-submit" data-action="submit" style="background-color: ${player.color}; color: ${textColor};">${player.submitted ? '취소' : '완료'}</button>
                </div>
            `;
        } else {
            // 다른 플레이어 카드
            const statusMessage = player.submitted ? '입력 완료!' : '입력 대기중...';
            contentHtml = `
                <div class="player-info-text">
                     <div class="player-name">${player.name}</div>
                </div>
                <div class="player-status-display">${statusMessage}</div>
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

    function renderRankingBoard(sortedPlayers, container) {
        const rankingListHtml = sortedPlayers.map(p => {
            const isFirst = p.cumulativeRank === 1;
            const rankDisplay = isFirst ? '👑' : p.cumulativeRank;
            // 1위인 경우, 플레이어 색상으로 스타일링
            const rankStyle = isFirst ? `style="--rank-color: ${p.color}"` : '';
            return `
            <li class="${isFirst ? 'first-place' : ''}" ${rankStyle}>
                <span class="rank">${rankDisplay}</span>
                <img src="${p.imageSrc}" class="profile-image-rank">
                <span class="name">${p.name}</span>
                <span class="score">${p.cumulativeScore.toFixed(1)}%</span>
            </li>
        `;
        }).join('');

        container.innerHTML = `
            <h3>누적 랭킹</h3>
            <ol>${rankingListHtml}</ol>
        `;
    }
    
    function renderResults(gameState) {
        const players = Object.values(gameState.players).filter(p => p.submitted);
        if (players.length === 0) return;
        
        const total = players.reduce((sum, p) => sum + p.value, 0);
        const average = total / players.length;

        players.forEach(p => {
            p.diff = Math.abs(p.value - average);
            p.diffRatio = (average > 0) ? (p.diff / average) * 100 : (p.value === 0 ? 0 : 100);
        });
        
        players.sort((a, b) => a.diff - b.diff);

        let rank = 1;
        for (let i = 0; i < players.length; i++) {
            if (i > 0 && players[i].diff > players[i-1].diff) rank = i + 1;
            players[i].rank = rank;
        }
        const maxRank = Math.max(...players.map(p => p.rank));
        const maxDiffRatio = Math.max(...players.map(p => p.diffRatio), 1);
        
        const rankingHtml = players.map(p => {
            let rankDisplay;
            if (p.rank === 1) { rankDisplay = '👑'; } 
            else if (p.rank === maxRank && players.length > 1) { rankDisplay = '💀'; }
            else { rankDisplay = `${p.rank}위`; }
            
            const isWinner = p.rank === 1;
            const barWidth = (p.diffRatio / maxDiffRatio) * 100;

            return `
            <li class="${isWinner ? 'winner' : ''}" style="${isWinner ? `--winner-color: ${p.color};` : ''}">
                <div class="player-info">
                    <span class="rank-display">${rankDisplay}</span>
                    <img src="${p.imageSrc}" class="profile-image-result">
                    <span>${p.name}</span>
                </div>
                <div class="result-details">
                    <span class="submitted-value">입력: <b>${p.value}</b></span>
                    <span class="diff-value">(차이: ${formatNumber(p.diff)}, 비율: ${p.diffRatio.toFixed(1)}%)</span>
                    <div class="diff-bar-wrapper">
                        <div class="diff-bar" style="width: ${barWidth}%; background-color: ${p.color};"></div>
                    </div>
                </div>
            </li>`;
        }).join('');

        resultSummary.innerHTML = `
            <h2>${gameState.question || '이번 라운드 결과'}</h2>
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