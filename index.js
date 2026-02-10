const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let rooms = {};

// Helper to determine board size based on player count
function getBoardConfig(playerCount) {
    if (playerCount <= 2) return { rows: 9, cols: 6 };
    if (playerCount <= 4) return { rows: 10, cols: 7 };
    if (playerCount <= 6) return { rows: 12, cols: 8 };
    return { rows: 15, cols: 10 }; // 7-8 players
}

io.on('connection', (socket) => {
    socket.on('join-room', ({ roomName, playerName, isHost }) => {
        if (!rooms[roomName]) {
            if (!isHost) return socket.emit('error-msg', 'Room does not exist.');
            rooms[roomName] = { players: [], hostId: socket.id, started: false };
        }

        const room = rooms[roomName];
        if (room.started) return socket.emit('error-msg', 'Game already started.');
        if (room.players.length >= 8) return socket.emit('error-msg', 'Room is full.');

        const player = {
            id: socket.id,
            name: playerName,
            color: getPlayerColor(room.players.length)
        };
        
        room.players.push(player);
        socket.join(roomName);
        socket.roomName = roomName;

        io.to(roomName).emit('lobby-update', {
            players: room.players,
            hostId: room.hostId
        });
    });

    socket.on('start-game', () => {
        const room = rooms[socket.roomName];
        if (room && room.hostId === socket.id) {
            room.started = true;
            const config = getBoardConfig(room.players.length);
            io.to(socket.roomName).emit('game-init', {
                config,
                players: room.players
            });
        }
    });

    socket.on('reset-room', () => {
        const room = rooms[socket.roomName];
        if (room && room.hostId === socket.id) {
            room.started = false;
            io.to(socket.roomName).emit('return-to-lobby');
        }
    });

    socket.on('make-move', (data) => {
        socket.to(socket.roomName).emit('receive-move', data);
    });

    socket.on('disconnect', () => {
        const roomName = socket.roomName;
        if (rooms[roomName]) {
            rooms[roomName].players = rooms[roomName].players.filter(p => p.id !== socket.id);
            if (rooms[roomName].players.length === 0) {
                delete rooms[roomName];
            } else {
                if (rooms[roomName].hostId === socket.id) {
                    rooms[roomName].hostId = rooms[roomName].players[0].id;
                }
                io.to(roomName).emit('lobby-update', {
                    players: rooms[roomName].players,
                    hostId: rooms[roomName].hostId
                });
            }
        }
    });
});

function getPlayerColor(index) {
    const colors = ['#ff4d4d', '#4dff4d', '#4d4dff', '#ffff4d', '#ff4dff', '#4dffff', '#ff944d', '#ffffff'];
    return colors[index];
}

const PORT = process.env.PORT || 10000; // Render uses 10000 by default

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});