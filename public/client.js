document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- DOM Elements ---
    const playerCountDisplay = document.getElementById('player-count-display');
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
    const confirmQuestionBtn = document.getElementById('confirm-question-btn');
    const mainGameArea = document.getElementById('main-game-area');
    const gameBoard = document.getElementById('game-board');
    const sidePanelContainer = document.getElementById('side-panel-container');
    const sidePanelTitle = document.getElementById('side-panel-title');
    const toggleHistoryBtn = document.getElementById('toggle-history-btn');
    const rankingBoard = document.getElementById('ranking-board');
    const historyBoard = document.getElementById('history-board');
    const resultsSection = document.getElementById('results');
    const resultSummary = document.getElementById('result-summary');
    const backToGameBtn = document.getElementById('back-to-game-btn');
    const viewResultsButton = document.getElementById('view-results-button');
    const resetRoundButton = document.getElementById('reset-round-button');

    // [추가됨] 페이지 로드 시 닉네임 입력창 비우기
    playerNameInput.value = '';

    // --- Global State ---
    let myRoomCode = '';
    let myPlayerId = '';
    let myProfileImageSrc = lobbyProfilePreview.src;
    let currentGameState = null;
    let isHistoryView = false;

    // --- Lobby Logic ---
    const enterGameView = () => {
        document.body.classList.remove('in-lobby');
        lobbyContainer.classList.add('hidden');
        gameContainer.classList.remove('hidden');
    };

    lobbyProfilePreview.addEventListener('click', () => lobbyProfileInput.click());

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
        roomActions.classList.toggle('hidden', !playerNameInput.value.trim());
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
        currentGameState = gameState;
        renderGame(gameState);
    });

    socket.on('playerJoined', ({ playerName }) => showToast(`${playerName} 님이 입장했습니다.`, 'join'));
    socket.on('playerLeft', ({ playerName }) => showToast(`${playerName} 님이 퇴장했습니다.`, 'leave'));
    socket.on('error', ({ message }) => { alert(message); });
    
    socket.on('newHost', ({ playerName }) => {
        showToast(`${playerName} 님이 새로운 방장이 되었습니다.`, 'info');
    });

    // --- Game Logic ---
    copyCodeBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(myRoomCode).then(() => showToast('초대 코드가 복사되었습니다!'));
    });

    confirmQuestionBtn.addEventListener('click', () => {
        if (questionInput.disabled) {
            socket.emit('updateQuestion', { roomCode: myRoomCode, question: '' });
        } else {
            const question = questionInput.value.trim();
            if (!question) return alert('질문을 입력해주세요.');
            socket.emit('updateQuestion', { roomCode: myRoomCode, question });
        }
    });
    
    questionInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || questionInput.disabled) {
            return;
        }
        event.preventDefault();
        confirmQuestionBtn.click();
    });
    
    gameBoard.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || !event.target.classList.contains('number-input')) return;
        event.preventDefault();
        const card = event.target.closest('.player-card');
        if (card) card.querySelector('.btn-submit').click();
    });
    
    gameBoard.addEventListener('input', (event) => {
        if (!event.target.classList.contains('number-input')) return;
        event.target.value = event.target.value.replace(/[^0-9]/g, '');
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
            value: isSubmitted ? null : parseInt(numberInput.value, 10),
            submitted: !isSubmitted
        });
    });

    toggleHistoryBtn.addEventListener('click', () => {
        isHistoryView = !isHistoryView;
        renderSidePanel(currentGameState);
    });
    
    historyBoard.addEventListener('click', (event) => {
        const historyItem = event.target.closest('li[data-history-index]');
        if (historyItem && currentGameState) {
            const index = parseInt(historyItem.dataset.historyIndex, 10);
            const pastRound = currentGameState.history[index];
            if (pastRound) {
                renderPastResults(pastRound);
            }
        }
    });
    
    backToGameBtn.addEventListener('click', () => {
        renderGame(currentGameState);
    });
    
    // --- Host Controls ---
    viewResultsButton.addEventListener('click', () => socket.emit('viewResults', { roomCode: myRoomCode }));
    resetRoundButton.addEventListener('click', () => {
        socket.emit('resetRound', { roomCode: myRoomCode });
    });

    // --- Helper Functions ---
    function formatNumber(num) {
        return Number.isInteger(num) ? num : num.toFixed(1);
    }

    // --- Render Functions ---
    function renderGame(gameState) {
        const players = Object.values(gameState.players);
        const me = players.find(p => p.id === myPlayerId);
        if (!me) return;
        
        const amIHost = me.isHost;
        const isWaitingPhase = gameState.state === 'waiting';

        playerCountDisplay.textContent = `접속 인원: ${players.length} / ${gameState.maxPlayers}`;
        
        mainGameArea.classList.toggle('hidden', !isWaitingPhase);
        resultsSection.classList.add('hidden'); // 항상 숨김으로 시작
        questionContainer.classList.toggle('hidden', !isWaitingPhase);
        
        hostControls.classList.toggle('hidden', !amIHost);
        viewResultsButton.classList.toggle('hidden', !isWaitingPhase || !amIHost);
        resetRoundButton.classList.toggle('hidden', isWaitingPhase || !amIHost);

        const isQuestionConfirmed = !!gameState.question;
        questionInput.value = gameState.question;
        questionInput.classList.toggle('confirmed-question', isQuestionConfirmed);

        if (amIHost && isWaitingPhase) {
            confirmQuestionBtn.classList.remove('hidden');
            questionInput.placeholder = 'Q. 여기에 질문을 입력하세요';
            questionInput.disabled = isQuestionConfirmed;
            confirmQuestionBtn.textContent = isQuestionConfirmed ? '질문 수정' : '질문 확정';
            confirmQuestionBtn.className = isQuestionConfirmed ? 'edit-mode' : 'confirm-mode';
        } else {
            confirmQuestionBtn.classList.add('hidden');
            questionInput.disabled = true;
            if (isWaitingPhase) {
                questionInput.placeholder = isQuestionConfirmed ? 'Q. 여기에 질문을 입력하세요' : '질문 입력 중...';
            }
        }

        gameBoard.innerHTML = '';
        players.forEach(player => {
            gameBoard.appendChild(createPlayerCard(player, player.id === myPlayerId));
        });

        if (isWaitingPhase) {
            renderSidePanel(gameState);
        } else {
            resultsSection.classList.remove('hidden');
            mainGameArea.classList.add('hidden');
            renderResults(gameState);
        }

        viewResultsButton.disabled = !(players.length > 0 && players.every(p => p.submitted));
    }
    
    function createPlayerCard(player, isMe) {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.dataset.playerId = player.id;
        card.style.borderColor = player.color;
        card.style.setProperty('--tint-color', `${player.color}20`);
        card.classList.toggle('submitted', player.submitted);

        const textColor = (player.color === '#fff176') ? '#000000' : '#ffffff';
        
        const playerInfoHtml = `<div class="player-info-text"><div class="player-name">${player.name}</div></div>`;
        const actionHtml = isMe ?
            `<div class="input-area">
                <input type="text" class="number-input" placeholder="-" value="${player.value || ''}" ${player.submitted ? 'disabled' : ''}>
                <button class="btn-submit" data-action="submit" style="background-color: ${player.color}; color: ${textColor};">${player.submitted ? '취소' : '완료'}</button>
            </div>` :
            `<div class="player-status-display">${player.submitted ? '입력 완료!' : '입력 대기중...'}</div>`;
        
        card.innerHTML = `
            <div class="profile-section"><img src="${player.imageSrc}" class="profile-image-preview" alt="${player.name} profile"></div>
            <div class="content-section">${playerInfoHtml}${actionHtml}</div>`;
        return card;
    }

    function renderSidePanel(gameState) {
        rankingBoard.classList.toggle('hidden', isHistoryView);
        historyBoard.classList.toggle('hidden', !isHistoryView);

        if (isHistoryView) {
            sidePanelTitle.textContent = '과거 질문';
            toggleHistoryBtn.textContent = '랭킹 보기';
            renderHistoryBoard(gameState.history);
        } else {
            sidePanelTitle.textContent = '누적 랭킹';
            toggleHistoryBtn.textContent = '과거 기록';
            renderRankingBoard(Object.values(gameState.players));
        }
    }

    function renderRankingBoard(players) {
        const sortedPlayers = [...players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
        let rank = 1;
        for (let i = 0; i < sortedPlayers.length; i++) {
            if (i > 0 && sortedPlayers[i].cumulativeScore > sortedPlayers[i-1].cumulativeScore) {
                rank = i + 1;
            }
            sortedPlayers[i].cumulativeRank = rank;
        }

        const listItems = sortedPlayers.map(p => {
            const isFirst = p.cumulativeRank === 1;
            const rankDisplay = isFirst ? '👑' : p.cumulativeRank;
            return `
            <li class="${isFirst ? 'first-place' : ''}" style="--rank-color: ${p.color}">
                <span class="rank">${rankDisplay}</span>
                <img src="${p.imageSrc}" class="profile-image-rank" alt="${p.name} profile">
                <span class="name">${p.name}</span>
                <span class="score">${p.cumulativeScore.toFixed(1)}%</span>
            </li>`;
        }).join('');
        rankingBoard.innerHTML = `<ol>${listItems}</ol>`;
    }
    
    function renderHistoryBoard(history) {
        if (history.length === 0) {
            historyBoard.innerHTML = '<p style="text-align:center; color:#888;">기록이 없습니다.</p>';
            return;
        }
        const listItems = history.map((round, index) => `
            <li data-history-index="${index}">
                ${round.question || '질문 없는 라운드'}
            </li>
        `).reverse().join('');
        historyBoard.innerHTML = `<ol>${listItems}</ol>`;
    }

    function renderPastResults(roundData) {
        const { question, average, players } = roundData;
        const rankingHtml = renderResultsHtml(players, average);

        const resultHeader = resultSummary.querySelector('.result-header h2');
        const averageValue = resultSummary.querySelector('.average-value');
        const rankingList = resultSummary.querySelector('#ranking-list');

        resultHeader.textContent = question || '지난 라운드 결과';
        averageValue.textContent = `평균값: ${average.toFixed(2)}`;
        rankingList.innerHTML = rankingHtml;

        mainGameArea.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        backToGameBtn.classList.remove('hidden');
    }
    
    function renderResults(gameState) {
        const submittedPlayers = Object.values(gameState.players).filter(p => p.submitted);
        const resultHeader = resultSummary.querySelector('.result-header h2');
        const averageValue = resultSummary.querySelector('.average-value');
        const rankingList = resultSummary.querySelector('#ranking-list');

        if (submittedPlayers.length === 0) {
            resultHeader.textContent = gameState.question || '이번 라운드 결과';
            averageValue.textContent = '';
            rankingList.innerHTML = `<p>제출한 플레이어가 없습니다.</p>`;
            return;
        }
        
        const total = submittedPlayers.reduce((sum, p) => sum + p.value, 0);
        const average = total / submittedPlayers.length;
        
        const rankingHtml = renderResultsHtml(submittedPlayers, average);

        resultHeader.textContent = gameState.question || '이번 라운드 결과';
        averageValue.textContent = `평균값: ${average.toFixed(2)}`;
        rankingList.innerHTML = rankingHtml;
    }

    function renderResultsHtml(players, average) {
        players.forEach(p => {
            p.diff = Math.abs(p.value - average);
            p.diffRatio = (average > 0) ? (p.diff / average) * 100 : (p.value === 0 ? 0 : 100);
        });
        
        players.sort((a, b) => a.diff - b.diff);
        const maxDiffRatio = Math.max(...players.map(p => p.diffRatio), 1);
        
        let currentRank = 0;
        let lastDiff = -1;
        return players.map((p, i) => {
            if (p.diff > lastDiff) {
                currentRank = i + 1;
                lastDiff = p.diff;
            }
            
            let rankDisplay = `${currentRank}위`;
            if (currentRank === 1) rankDisplay = '👑';
            else if (currentRank === players.length && players.length > 1) rankDisplay = '💀';
            
            const isWinner = currentRank === 1;
            const barWidth = (p.diffRatio / maxDiffRatio) * 100;

            return `
            <li class="${isWinner ? 'winner' : ''}" style="${isWinner ? `--winner-color: ${p.color};` : ''}">
                <div class="player-info">
                    <span class="rank-display">${rankDisplay}</span>
                    <img src="${p.imageSrc}" class="profile-image-result" alt="${p.name} profile">
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