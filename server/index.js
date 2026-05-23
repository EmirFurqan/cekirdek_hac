const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for development
    methods: ['GET', 'POST']
  }
});

// Store users in rooms: { roomId: [socketId1, socketId2, ...] }
const rooms = {};

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // When a user joins a room
  socket.on('join-room', (payload) => {
    let roomId, username;
    
    // Support both direct string (backward compatibility) and object payload
    if (payload && typeof payload === 'object') {
      roomId = payload.roomId;
      username = payload.username || `Kullanıcı ${socket.id.substring(0, 4)}`;
    } else {
      roomId = payload;
      username = `Kullanıcı ${socket.id.substring(0, 4)}`;
    }

    console.log(`[Room Join] User ${username} (${socket.id}) joined room: ${roomId}`);
    
    socket.username = username;
    socket.roomId = roomId;

    // Create room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }

    // Add user if they aren't already in the list
    if (!rooms[roomId].some(u => u.id === socket.id)) {
      rooms[roomId].push({ id: socket.id, username });
    }

    // Socket joins the channel for room broadcasting
    socket.join(roomId);

    // Get all OTHER users in the room with usernames
    const otherUsersInRoom = rooms[roomId].filter(u => u.id !== socket.id);
    
    // Return all existing users in this room to the joining user
    socket.emit('all-users', otherUsersInRoom);
  });

  // Relay initiator's signal to the target user (receiver)
  socket.on('sending-signal', (payload) => {
    const { userToSignal, callerID, signal } = payload;
    console.log(`[Signaling] Relaying signal from caller ${socket.username} (${callerID}) to target ${userToSignal}`);
    io.to(userToSignal).emit('user-joined', {
      signal,
      callerID,
      callerUsername: socket.username
    });
  });

  // Relay returning signal back to the initiator
  socket.on('returning-signal', (payload) => {
    const { signal, callerID } = payload;
    console.log(`[Signaling] Returning signal from ${socket.username} (${socket.id}) to caller ${callerID}`);
    io.to(callerID).emit('receiving-returned-signal', {
      signal,
      id: socket.id
    });
  });

  // Relay speaking state to other users in the room
  socket.on('speaking-state', (payload) => {
    const { roomId, isSpeaking } = payload;
    socket.to(roomId).emit('user-speaking', {
      userId: socket.id,
      isSpeaking
    });
  });

  // Relay sound ping to other users in the room
  socket.on('send-ping-sound', (payload) => {
    const { roomId } = payload;
    socket.to(roomId).emit('receive-ping-sound', { senderId: socket.id });
  });

  // Relay custom audio effect trigger to other users in the room
  socket.on('send-audio-effect', (payload) => {
    const { roomId, effectName } = payload;
    socket.to(roomId).emit('receive-audio-effect', { senderId: socket.id, effectName });
  });

  // Handle client disconnection
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id} (${socket.username})`);
    const { roomId } = socket;

    if (roomId && rooms[roomId]) {
      // Filter out user
      rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
      
      // Notify other room members that this user left
      socket.to(roomId).emit('user-left', socket.id);
      
      console.log(`[Room Leave] Removed ${socket.username} from room: ${roomId}`);

      // Clean up empty room
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
        console.log(`[Room Cleanup] Room ${roomId} is empty and deleted.`);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[Signaling Server] Running on http://localhost:${PORT}`);
});
