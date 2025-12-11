const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const Message = require('./models/Message');
const User = require('./models/User');
const Room = require('./models/Room');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
app.enable('trust proxy'); // Fix for Mixed Content (HTTPS) behind Nginx
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve Frontend Static Files
app.use(express.static(path.join(__dirname, '../client/dist')));

// Ensure uploads directory exists
const fs = require('fs');
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// Multer Storage Setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/\s+/g, '-'));
  }
});

const upload = multer({ storage: storage });

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chat-app';
let mongoConnected = false;
let messageMemoryStore = []; // Fallback store (Only for General)

mongoose.connect(MONGO_URI)
  .then(() => {
      console.log('✅ MongoDB connected');
      mongoConnected = true;
  })
  .catch(err => {
      console.error('❌ MongoDB connection error (Running in Fallback Mode):', err.message);
      mongoConnected = false;
  });

// ---------------- AUTH ROUTES ----------------

// REGISTER
app.post('/api/auth/register', async (req, res) => {
    try {
        const { nickname, password, avatar } = req.body;
        
        if (!nickname || !password || password.length < 4) {
            return res.status(400).json({ error: 'Nickname and password (min 4 chars) required.' });
        }

        const existingUser = await User.findOne({ nickname });
        if (existingUser) {
            return res.status(400).json({ error: 'Nickname already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = new User({
            nickname,
            password: hashedPassword,
            avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${nickname}`
        });

        await newUser.save();

        res.status(201).json({ 
            message: 'User registered successfully',
            user: { nickname: newUser.nickname, avatar: newUser.avatar, _id: newUser._id } 
        });

    } catch (err) {
        console.error('Registration Error:', err);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
    try {
        const { nickname, password } = req.body;

        const user = await User.findOne({ nickname }).populate('joinedRooms', 'name');
        if (!user) return res.status(400).json({ error: 'User not found.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials.' });

        res.json({ 
            message: 'Login successful',
            user: { 
                nickname: user.nickname, 
                avatar: user.avatar, 
                _id: user._id,
                joinedRooms: user.joinedRooms // Return populated rooms
            }
        });

    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// ---------------- ROOM ROUTES ----------------

// GET ROOMS
app.get('/api/rooms', async (req, res) => {
    try {
        if (!mongoConnected) return res.json([]);
        // Return only names and IDs
        const rooms = await Room.find({}, 'name createdAt createdBy'); 
        res.json(rooms);
    } catch (err) {
        console.error('Get Rooms Error:', err);
        res.status(500).json({ error: 'Error fetching rooms' });
    }
});

// CREATE ROOM
app.post('/api/rooms', async (req, res) => {
    try {
        const { name, password, userId } = req.body;

        if (!name || !password || !userId) {
            return res.status(400).json({ error: 'Name, Password and UserID required.' });
        }

        const existingRoom = await Room.findOne({ name });
        if (existingRoom) {
            return res.status(400).json({ error: 'Room name already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newRoom = new Room({
            name,
            password: hashedPassword,
            createdBy: userId
        });

        await newRoom.save();
        
        // Add to creator's joined list
        await User.findByIdAndUpdate(userId, {
            $addToSet: { joinedRooms: newRoom._id }
        });

        io.emit('roomCreated', newRoom); // Broadcast to all
        res.status(201).json(newRoom);

    } catch (err) {
        console.error('Create Room Error:', err);
        res.status(500).json({ error: 'Error creating room' });
    }
});

// VERIFY ROOM PASSWORD
app.post('/api/rooms/verify', async (req, res) => {
    try {
        const { name, password, userId } = req.body; // userId needed to save persistence
        const room = await Room.findOne({ name });
        
        if (!room) return res.status(404).json({ error: 'Room not found' });

        const isMatch = await bcrypt.compare(password, room.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid password' });

        // Add to user's joined list if userId is provided
        if (userId) {
            await User.findByIdAndUpdate(userId, {
                $addToSet: { joinedRooms: room._id }
            });
        }

        res.json({ success: true, name: room.name, _id: room._id });

    } catch (err) {
        console.error('Verify Room Error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ---------------- API ROUTES ----------------

app.get('/api/url-meta', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });

    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
        const $ = cheerio.load(data);
        
        const getMeta = (prop) => $(`meta[property="${prop}"]`).attr('content') || $(`meta[name="${prop}"]`).attr('content');

        const meta = {
            title: getMeta('og:title') || $('title').text() || '',
            description: getMeta('og:description') || getMeta('description') || '',
            image: getMeta('og:image') || ''
        };

        res.json(meta);
    } catch (err) {
        console.error('Metadata fetch error:', err.message);
        res.json({}); 
    }
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, type: req.file.mimetype });
});

// Catch-all route to serve index.html for Vue Router (SPA)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const onlineUsers = new Map(); // socket.id -> { nickname, avatar, room }

// ---------------- SOCKET.IO LOGIC ----------------
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Send last 50 messages on join (ROOM AWARE)
  const loadMessages = async (roomName) => {
    try {
      if (mongoConnected) {
          const messages = await Message.find({ room: roomName }).sort({ timestamp: -1 }).limit(50);
          socket.emit('history', messages.reverse());
      } else {
          // Fallback memory store (only supports 'General' effectively)
          if (roomName === 'General') {
             socket.emit('history', messageMemoryStore.slice(-50));
          } else {
             socket.emit('history', []);
          }
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  };

  socket.on('join', (data) => {
    // data: { nickname, avatar, room (optional, default General) }
    const room = data.room || 'General';
    console.log(`User joined room ${room}: ${data.nickname}`);
    
    // Save user info with room
    onlineUsers.set(socket.id, { ...data, room });
    
    // Join socket room
    socket.join(room);

    // Initial load
    loadMessages(room);

    // Notify others in room
    socket.to(room).emit('notification', `${data.nickname} joined the chat`);
    
    // Update USER LIST for that room
    const requestRoomUsers = Array.from(onlineUsers.values()).filter(u => u.room === room);
    io.to(room).emit('updateUserList', requestRoomUsers);
  });
  
  // SWITCH ROOM
  socket.on('switchRoom', (newRoom) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    const oldRoom = user.room || 'General';
    
    // Leave old
    socket.leave(oldRoom);
    socket.to(oldRoom).emit('notification', `${user.nickname} left the chat`);
    const oldRoomUsers = Array.from(onlineUsers.values()).filter(u => u.room === oldRoom && u.nickname !== user.nickname);
    io.to(oldRoom).emit('updateUserList', oldRoomUsers);

    // Join new
    user.room = newRoom;
    onlineUsers.set(socket.id, user); 
    socket.join(newRoom);
    
    // Load history for new room
    loadMessages(newRoom);

    // Notify new room
    socket.to(newRoom).emit('notification', `${user.nickname} joined the chat`);
    const newRoomUsers = Array.from(onlineUsers.values()).filter(u => u.room === newRoom);
    io.to(newRoom).emit('updateUserList', newRoomUsers);
  });

  socket.on('typing', () => {
      const user = onlineUsers.get(socket.id);
      if (user) socket.to(user.room).emit('userTyping', user.nickname);
  });

  socket.on('stopTyping', () => {
      const user = onlineUsers.get(socket.id);
      if (user) socket.to(user.room).emit('userStopTyping', user.nickname);
  });

  socket.on('sendMessage', async (data) => {
    // data needs to include 'room' now.
    // However, we can trust the server's knowledge of the user's room to prevent spoofing
    const user = onlineUsers.get(socket.id);
    const room = user ? user.room : 'General';
    
    console.log(`Message in ${room}:`, data);
    
    try {
      const msgPayload = {
          ...data,
          room: room, 
          timestamp: new Date()
      };

      if (mongoConnected) {
          const newMessage = new Message(msgPayload);
          await newMessage.save();
          io.to(room).emit('message', newMessage);
      } else {
          if (room === 'General') messageMemoryStore.push(msgPayload);
          io.to(room).emit('message', msgPayload);
      }
    } catch (err) {
      console.error('Error saving message:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const user = onlineUsers.get(socket.id);
    if (user) {
        const room = user.room || 'General';
        onlineUsers.delete(socket.id);
        
        io.to(room).emit('notification', `${user.nickname} left the chat`);
        const remainingUsers = Array.from(onlineUsers.values()).filter(u => u.room === room);
        io.to(room).emit('updateUserList', remainingUsers);
    }
  });
  
  // Admin Features
  const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';
  
  socket.on('clearChat', async (secret) => {
      // NOTE: This currently clears ALL chat. We might want to scope it to rooms later.
      // For now, let's keep it global or assume it clears 'General'.
      // Let's make it clear ONLY the room the admin is in?
      
      const user = onlineUsers.get(socket.id);
      const room = user ? user.room : 'General';

      if (secret === ADMIN_SECRET) {
          try {
              if (mongoConnected) {
                  await Message.deleteMany({ room: room }); // Clear only current room
              } else {
                  if (room === 'General') messageMemoryStore = [];
              }
              io.to(room).emit('history', []); // Clear view in room
              io.to(room).emit('notification', `⚠ ${room} chat history has been cleared by an Admin`);
          } catch (e) {
              console.error(e);
              socket.emit('notification', 'Error clearing chat');
          }
      } else {
           socket.emit('notification', '❌ Invalid Admin Secret!');
      }
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => { 
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
