const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const rooms = {};

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function getGameState(roomCode) {
    return rooms[roomCode] || null;
}

io.on('connection', (socket) => {
    console.log(`새로운 유저 접속: ${socket.id}`);

    // 방 만들기
    socket.on('createRoom', ({ playerName, profileImageSrc }) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: {},
            question: '',
            state: 'waiting'
        };
        socket.join(roomCode);
        
        rooms[roomCode].players[socket.id] = {
            id: socket.id, name: playerName, color: '#e57373',
            imageSrc: profileImageSrc, // 로비에서 설정한 이미지 사용
            value: null, submitted: false, isHost: true,
            cumulativeScore: 0 // 누적 점수 추가
        };
        
        socket.emit('roomCreated', { roomCode });
        io.to(roomCode).emit('updateGameState', getGameState(roomCode));
    });

    // 방 참가하기
    socket.on('joinRoom', ({ roomCode, playerName, profileImageSrc }) => {
        if (!rooms[roomCode]) return socket.emit('error', { message: '해당하는 방이 없습니다.' });
        if (Object.keys(rooms[roomCode].players).length >= 12) return socket.emit('error', { message: '방이 가득 찼습니다.' });

        socket.join(roomCode);
        const playerCount = Object.keys(rooms[roomCode].players).length;
        const PLAYER_COLORS = ['#e57373', '#ffb74d', '#fff176', '#81c784', '#4dd0e1', '#64b5f6', '#7986cb', '#ba68c8', '#d81b60', '#f06292', '#B0BEC5', '#757575'];

        rooms[roomCode].players[socket.id] = {
            id: socket.id, name: playerName, color: PLAYER_COLORS[playerCount % 12],
            imageSrc: profileImageSrc, // 로비에서 설정한 이미지 사용
            value: null, submitted: false, isHost: false,
            cumulativeScore: 0 // 누적 점수 추가
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

    socket.on('viewResults', ({ roomCode }) => {
        const room = rooms[roomCode];
        if(room && room.players[socket.id] && room.players[socket.id].isHost) {
            // 이미 결과 상태이면 중복 계산 방지
            if (room.state === 'results') return;
            
            const players = Object.values(room.players);
            const submittedPlayers = players.filter(p => p.submitted && p.value !== null);
            if (submittedPlayers.length === 0) return;

            // 누적 점수 계산
            const total = submittedPlayers.reduce((sum, p) => sum + p.value, 0);
            const average = total / submittedPlayers.length;

            players.forEach(p => {
                if (p.submitted && p.value !== null) {
                    const diff = Math.abs(p.value - average);
                    // 평균이 0일 경우 예외 처리
                    const diffRatio = (average > 0) ? (diff / average) * 100 : (p.value === 0 ? 0 : 100);
                    p.cumulativeScore += diffRatio;
                }
            });

            room.state = 'results';
            io.to(roomCode).emit('updateGameState', getGameState(roomCode));
        }
    });
    
    socket.on('resetRound', ({ roomCode }) => {
        const room = rooms[roomCode];
         if(room && room.players[socket.id] && room.players[socket.id].isHost) {
            room.state = 'waiting';
            Object.values(room.players).forEach(p => {
                p.submitted = false;
                p.value = null;
            });
            // 누적 점수는 초기화하지 않음
            io.to(roomCode).emit('updateGameState', getGameState(roomCode));
        }
    });

    socket.on('disconnect', () => {
        console.log(`유저 접속 종료: ${socket.id}`);
        for (const roomCode in rooms) {
            if (rooms[roomCode].players[socket.id]) {
                const deletedPlayer = rooms[roomCode].players[socket.id];
                const wasHost = deletedPlayer.isHost;
                delete rooms[roomCode].players[socket.id];

                if (Object.keys(rooms[roomCode].players).length === 0) {
                    delete rooms[roomCode];
                } else {
                    io.to(roomCode).emit('playerLeft', { playerName: deletedPlayer.name });
                    if (wasHost) {
                        const newHostId = Object.keys(rooms[roomCode].players)[0];
                        rooms[roomCode].players[newHostId].isHost = true;
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