const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const Message = require('./models/Message');
const User = require('./models/User');
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
let messageMemoryStore = []; // Fallback store

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
    console.log('🔹 register request:', req.body);
    try {
        let { nickname, password, avatar } = req.body;
        
        // Validation
        if (!nickname || !password || password.length < 4) {
            return res.status(400).json({ error: 'Nickname and password (min 4 chars) required.' });
        }

        nickname = nickname.trim(); // TRIM INPUT

        // Case-insensitive check
        const existingUser = await User.findOne({ nickname: { $regex: new RegExp(`^${nickname}$`, 'i') } });
        if (existingUser) {
            console.log('⚠️ Nickname taken:', nickname);
            return res.status(400).json({ error: 'Nickname already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = new User({
            nickname, // We save the trimmed, original casing (or we could lowercase it)
            password: hashedPassword,
            avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${nickname}`
        });

        await newUser.save();
        console.log('✅ User registered:', newUser.nickname);

        res.status(201).json({ 
            message: 'User registered successfully',
            user: { nickname: newUser.nickname, avatar: newUser.avatar, _id: newUser._id } 
        });

    } catch (err) {
        console.error('❌ Registration Error:', err);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
    console.log('🔹 login request:', req.body);
    try {
        let { nickname, password } = req.body;

        if(!nickname || !password) return res.status(400).json({ error: 'Missing fields' });

        nickname = nickname.trim();

        // Case-insensitive find
        const user = await User.findOne({ nickname: { $regex: new RegExp(`^${nickname}$`, 'i') } });
        if (!user) {
            console.log('⚠️ Login failed: User not found for:', nickname);
            return res.status(400).json({ error: 'User not found.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('⚠️ Login failed: Invalid password for:', nickname);
            return res.status(400).json({ error: 'Invalid credentials.' });
        }

        console.log('✅ User logged in:', user.nickname);
        res.json({ 
            message: 'Login successful',
            user: { nickname: user.nickname, avatar: user.avatar, _id: user._id }
        });

    } catch (err) {
        console.error('❌ Login Error:', err);
        res.status(500).json({ error: 'Server error during login.' });
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
        res.json({}); // Return empty on failure to prevent frontend break
    }
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  // Use relative path to avoid Mixed Content issues (http vs https)
  // The frontend or Nginx will handle the domain/protocol resolution
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, type: req.file.mimetype });
});

// Catch-all route to serve index.html for Vue Router (SPA)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const onlineUsers = new Map(); // socket.id -> { nickname, avatar }

// ---------------- SOCKET.IO LOGIC ----------------
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Send last 50 messages on join
  const loadMessages = async () => {
    try {
      if (mongoConnected) {
          const messages = await Message.find().sort({ timestamp: -1 }).limit(50);
          socket.emit('history', messages.reverse());
      } else {
          // Fallback memory store
          socket.emit('history', messageMemoryStore.slice(-50));
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  };
  loadMessages();

  socket.on('join', (userData) => {
    console.log(`User joined: ${userData.nickname}`);
    onlineUsers.set(socket.id, userData);
    
    socket.join('General'); 
    io.to('General').emit('notification', `${userData.nickname} joined the chat`);
    io.to('General').emit('updateUserList', Array.from(onlineUsers.values()));
  });

  socket.on('typing', () => {
      const user = onlineUsers.get(socket.id);
      if (user) socket.to('General').emit('userTyping', user.nickname);
  });

  socket.on('stopTyping', () => {
      const user = onlineUsers.get(socket.id);
      if (user) socket.to('General').emit('userStopTyping', user.nickname);
  });

  socket.on('sendMessage', async (data) => {
    console.log('Received message:', data);
    
    try {
      const msgPayload = {
          ...data,
          timestamp: new Date()
      };

      if (mongoConnected) {
          const newMessage = new Message(data);
          await newMessage.save();
          io.to('General').emit('message', newMessage);
      } else {
          messageMemoryStore.push(msgPayload);
          io.to('General').emit('message', msgPayload);
      }
    } catch (err) {
      console.error('Error saving message:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const user = onlineUsers.get(socket.id);
    if (user) {
        onlineUsers.delete(socket.id);
        io.to('General').emit('notification', `${user.nickname} left the chat`);
        io.to('General').emit('updateUserList', Array.from(onlineUsers.values()));
    }
  });
  
  // Admin Features
  const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';
  
  socket.on('clearChat', async (secret) => {
      if (secret === ADMIN_SECRET) {
          try {
              if (mongoConnected) {
                  await Message.deleteMany({});
              } else {
                  messageMemoryStore = [];
              }
              io.emit('history', []); // Clear client view
              io.emit('notification', '⚠ Chat history has been cleared by an Admin');
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
