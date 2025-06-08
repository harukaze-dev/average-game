const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const rooms = {};
const PLAYER_COLORS = ['#e57373', '#ffb74d', '#fff176', '#81c784', '#4dd0e1', '#64b5f6', '#7986cb', '#ba68c8', '#d81b60', '#f06292', '#B0BEC5', '#757575'];
const MAX_PLAYERS = 12;

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function getGameState(roomCode) {
    return rooms[roomCode] || null;
}

io.on('connection', (socket) => {
    console.log(`새로운 유저 접속: ${socket.id}`);

    socket.on('createRoom', ({ playerName, profileImageSrc }) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: {},
            question: '',
            state: 'waiting',
            maxPlayers: MAX_PLAYERS,
            history: [] // [추가됨] 라운드 기록을 저장할 배열
        };
        socket.join(roomCode);
        
        rooms[roomCode].players[socket.id] = {
            id: socket.id, name: playerName, color: PLAYER_COLORS[0],
            imageSrc: profileImageSrc,
            value: null, submitted: false, isHost: true,
            cumulativeScore: 0
        };
        
        socket.emit('roomCreated', { roomCode });
        io.to(roomCode).emit('updateGameState', getGameState(roomCode));
    });

    socket.on('joinRoom', ({ roomCode, playerName, profileImageSrc }) => {
        if (!rooms[roomCode]) return socket.emit('error', { message: '해당하는 방이 없습니다.' });
        if (Object.keys(rooms[roomCode].players).length >= MAX_PLAYERS) return socket.emit('error', { message: '방이 가득 찼습니다.' });

        socket.join(roomCode);
        
        const usedColors = new Set(Object.values(rooms[roomCode].players).map(p => p.color));
        const availableColor = PLAYER_COLORS.find(c => !usedColors.has(c)) || PLAYER_COLORS[0];

        rooms[roomCode].players[socket.id] = {
            id: socket.id, name: playerName, color: availableColor,
            imageSrc: profileImageSrc,
            value: null, submitted: false, isHost: false,
            cumulativeScore: 0
        };
        
        socket.emit('roomJoined', { roomCode });
        socket.to(roomCode).emit('playerJoined', { playerName });
        io.to(roomCode).emit('updateGameState', getGameState(roomCode));
    });
    
    socket.on('updateQuestion', ({ roomCode, question }) => {
        const room = rooms[roomCode];
        if(room && room.players[socket.id] && room.players[socket.id].isHost) {
            room.question = question;
            io.to(roomCode).emit('updateGameState', getGameState(roomCode));
        }
    });

    socket.on('submitValue', ({ roomCode, value, submitted }) => {
        const room = rooms[roomCode];
        if(room && room.players[socket.id]) {
            const player = room.players[socket.id];
            player.submitted = submitted;
            player.value = submitted ? value : null;
            io.to(roomCode).emit('updateGameState', getGameState(roomCode));
        }
    });

    // [수정됨] 결과 보기에 기록 저장 로직 추가
    socket.on('viewResults', ({ roomCode }) => {
        const room = rooms[roomCode];
        if(room && room.players[socket.id] && room.players[socket.id].isHost) {
            if (room.state === 'results') return;
            
            const players = Object.values(room.players);
            const submittedPlayers = players.filter(p => p.submitted && p.value !== null);
            if (submittedPlayers.length === 0) return;

            const total = submittedPlayers.reduce((sum, p) => sum + p.value, 0);
            const average = total / submittedPlayers.length;

            submittedPlayers.forEach(p => {
                p.diff = Math.abs(p.value - average);
                p.diffRatio = (average > 0) ? (p.diff / average) * 100 : (p.value === 0 ? 0 : 100);
            });
            submittedPlayers.sort((a,b) => a.diff - b.diff);

            // 누적 점수 계산 및 순위 부여
            players.forEach(p => {
                if (p.submitted && p.value !== null) {
                    const diff = Math.abs(p.value - average);
                    const diffRatio = (average > 0) ? (diff / average) * 100 : (p.value === 0 ? 0 : 100);
                    p.cumulativeScore += diffRatio;
                }
            });

            // [추가됨] 현재 라운드 결과 기록
            const roundResult = {
                question: room.question,
                average: average,
                // 플레이어 데이터는 깊은 복사하여 저장
                players: JSON.parse(JSON.stringify(submittedPlayers)),
                timestamp: Date.now()
            };
            room.history.push(roundResult);

            room.state = 'results';
            io.to(roomCode).emit('updateGameState', getGameState(roomCode));
        }
    });
    
    socket.on('resetRound', ({ roomCode }) => {
        const room = rooms[roomCode];
         if(room && room.players[socket.id] && room.players[socket.id].isHost) {
            room.state = 'waiting';
            room.question = '';
            
            Object.values(room.players).forEach(player => {
                player.submitted = false;
                player.value = null;
            });
            
            io.to(roomCode).emit('updateGameState', getGameState(roomCode));
        }
    });

    socket.on('disconnect', () => {
        console.log(`유저 접속 종료: ${socket.id}`);
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            if (room.players[socket.id]) {
                const deletedPlayerName = room.players[socket.id].name;
                const wasHost = room.players[socket.id].isHost;
                
                delete room.players[socket.id];

                if (Object.keys(room.players).length === 0) {
                    delete rooms[roomCode];
                    console.log(`방 ${roomCode}가 비어서 삭제되었습니다.`);
                } else {
                    io.to(roomCode).emit('playerLeft', { playerName: deletedPlayerName });
                    
                    if (wasHost) {
                        const newHostId = Object.keys(room.players)[0];
                        if (room.players[newHostId]) {
                            room.players[newHostId].isHost = true;
                            io.to(roomCode).emit('newHost', { playerName: room.players[newHostId].name });
                        }
                    }
                    io.to(roomCode).emit('updateGameState', getGameState(roomCode));
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`));