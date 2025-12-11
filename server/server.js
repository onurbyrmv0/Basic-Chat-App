const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const Message = require('./models/Message');
require('dotenv').config();

const app = express();
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

// Routes
const axios = require('axios');
const cheerio = require('cheerio');

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
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, type: req.file.mimetype });
});

// Catch-all route to serve index.html for Vue Router
// Catch-all route to serve index.html for Vue Router
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const onlineUsers = new Map(); // socket.id -> { nickname, avatar }

// Socket.io Logic
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
    
    // AI INTEGRATION POINT: 
    // const analysis = await analyzeWithGemini(data.content);

    try {
      const msgPayload = {
          ...data,
          timestamp: new Date()
      };

      if (mongoConnected) {
          const newMessage = new Message(data);
          await newMessage.save();
          // Mongoose adds _id and correct timestamp, so emit that
          io.to('General').emit('message', newMessage);
      } else {
          // Fallback
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
server.listen(PORT, '0.0.0.0', () => { // Listen on all interfaces
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
