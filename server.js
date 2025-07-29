const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/chess', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const games = {};

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('createGame', () => {
        const gameId = uuidv4();
        games[gameId] = {
            players: [{ id: socket.id, color: 'w' }],
            moves: []
        };
        socket.join(gameId);
        socket.emit('gameCreated', { gameId });
    });

    socket.on('joinGame', (data) => {
        const gameId = data.gameId;
        if (!games[gameId]) {
            socket.emit('error', { message: 'ID permainan tidak ditemukan' });
            return;
        }
        if (games[gameId].players.length >= 2) {
            socket.emit('error', { message: 'Permainan sudah penuh' });
            return;
        }

        const whitePlayer = games[gameId].players[0];
        const blackPlayer = { id: socket.id, color: 'b' };

        games[gameId].players.push(blackPlayer);
        socket.join(gameId);

        // Kirim warna ke masing-masing pemain secara aman
        io.to(whitePlayer.id).emit('playerColor', { gameId, color: 'w' });
        io.to(blackPlayer.id).emit('playerColor', { gameId, color: 'b' });

        // Umumkan bahwa lawan sudah siap
        io.to(gameId).emit('opponentReady', { gameId });
    });

    socket.on('move', (data) => {
        const { gameId, move } = data;
        if (games[gameId]) {
            games[gameId].moves.push(move);
            socket.to(gameId).emit('opponentMove', { move });
        }
    });

    socket.on('resetGame', (data) => {
        const { gameId } = data;
        if (games[gameId]) {
            games[gameId].moves = [];
            io.to(gameId).emit('gameReset');
        }
    });

    socket.on('undoMove', (data) => {
        const { gameId } = data;
        if (games[gameId]) {
            games[gameId].moves.pop();
            io.to(gameId).emit('undoMove');
        }
    });

    socket.on('disconnect', () => {
        for (const gameId in games) {
            const game = games[gameId];
            const playerIndex = game.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                game.players.splice(playerIndex, 1);
                socket.to(gameId).emit('opponentDisconnected');
                if (game.players.length === 0) {
                    delete games[gameId];
                }
            }
        }
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
