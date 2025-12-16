const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { sequelize, User, Room, Message } = require('./models');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const { exec } = require('child_process');
require('dotenv').config();

const app = express();
app.enable('trust proxy'); 
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

// Database Connection & Sync
let dbConnected = false;

const connectWithRetry = async () => {
  console.log('⏳ Connecting to PostgreSQL...');
  try {
      await sequelize.authenticate();
      console.log('✅ PostgreSQL connected');
      await sequelize.sync({ force: false }); // Set force: true to drop/recreate tables (WARNING: DATA LOSS)
      console.log('✅ Models synced');
      dbConnected = true;

      // SEED ADMIN USER 'sakal'
      try {
          const adminName = 'sakal';
          const adminPass = 'sakal';
          const existingAdmin = await User.findOne({ where: { nickname: adminName } });
          
          if (!existingAdmin) {
              const hashedPassword = await bcrypt.hash(adminPass, 10);
              await User.create({
                  nickname: adminName,
                  password: hashedPassword,
                  isAdmin: true,
                  avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${adminName}`
              });
              console.log('Admin user "sakal" created.');
          } else if (!existingAdmin.isAdmin) {
               existingAdmin.isAdmin = true;
               await existingAdmin.save();
               console.log('User "sakal" promoted to admin.');
          }
      } catch (e) {
          console.error('Admin Seed Error:', e);
      }

  } catch (err) {
      console.error('❌ Database connection error:', err.message);
      console.log('🔄 Retrying in 5 seconds...');
      setTimeout(connectWithRetry, 5000);
  }
};

connectWithRetry();

// ---------------- AUTH ROUTES ----------------

// REGISTER
app.post('/api/auth/register', async (req, res) => {
    try {
        if (!dbConnected) return res.status(503).json({ error: 'Database not ready' });
        
        const { nickname, password, avatar } = req.body;
        
        if (!nickname || !password || password.length < 4) {
            return res.status(400).json({ error: 'Nickname and password (min 4 chars) required.' });
        }

        const existingUser = await User.findOne({ where: { nickname } });
        if (existingUser) {
            return res.status(400).json({ error: 'Nickname already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = await User.create({
            nickname,
            password: hashedPassword,
            avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${nickname}`
        });

        res.status(201).json({ 
            message: 'User registered successfully',
            user: { nickname: newUser.nickname, avatar: newUser.avatar, _id: newUser.id } 
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

        const user = await User.findOne({ 
            where: { nickname },
            include: [{ 
                model: Room, 
                as: 'joinedRooms', 
                attributes: ['name', 'createdBy'],
                through: { attributes: [] } 
            }]
        });

        if (!user) return res.status(400).json({ error: 'User not found.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials.' });

        res.json({ 
            message: 'Login successful',
            user: { 
                nickname: user.nickname, 
                avatar: user.avatar, 
                _id: user.id,
                joinedRooms: user.joinedRooms.map(r => ({ _id: r.id, name: r.name, createdBy: r.createdBy })),
                isAdmin: user.isAdmin
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
        if (!dbConnected) return res.json([]);
        const rooms = await Room.findAll({ attributes: ['id', 'name', 'createdAt', 'createdBy'] }); 
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

        const existingRoom = await Room.findOne({ where: { name } });
        if (existingRoom) {
            return res.status(400).json({ error: 'Room name already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newRoom = await Room.create({
            name,
            password: hashedPassword,
            createdBy: userId
        });
        
        // Add to creator's joined list
        const user = await User.findByPk(userId);
        if (user) {
            await user.addJoinedRoom(newRoom);
        }

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
        const { name, password, userId } = req.body; 
        const room = await Room.findOne({ where: { name } });
        
        if (!room) return res.status(404).json({ error: 'Room not found' });

        const isMatch = await bcrypt.compare(password, room.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid password' });

        // Add to user's joined list if userId is provided
        if (userId) {
            const user = await User.findByPk(userId);
            if (user) {
                await user.addJoinedRoom(room);
            }
        }

        res.json({ success: true, name: room.name, _id: room.id, createdBy: room.createdBy });

    } catch (err) {
        console.error('Verify Room Error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE ROOM
app.delete('/api/rooms/:id', async (req, res) => {
    try {
        const { userId } = req.body; 
        const roomId = req.params.id;

        const room = await Room.findByPk(roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        // Check if creator (Note: createdBy is int, userId might be string/int)
        if (room.createdBy.toString() !== userId.toString()) {
            return res.status(403).json({ error: 'Only the creator can delete this room.' });
        }

        await room.destroy();
        
        // Association cleanup is handled by Sequelize cascades usually, or simple deletion from join table handles it.
        
        io.emit('roomDeleted', roomId);
        res.json({ message: 'Room deleted' });

    } catch (err) {
        console.error('Delete Room Error:', err);
        res.status(500).json({ error: 'Error deleting room' });
    }
});

// ---------------- ADMIN ROUTES ----------------
const verifyAdmin = async (req, res, next) => {
    try {
        const { userId } = req.query; 
        if(!userId) return res.status(401).json({error: 'Unauthorized'});
        
        const user = await User.findByPk(userId);
        if(!user || !user.isAdmin) return res.status(403).json({error: 'Forbidden'});
        
        next();
    } catch(e) {
        res.status(500).json({error: 'Auth Error'});
    }
};

app.get('/api/admin/data', verifyAdmin, async (req, res) => {
    try {
        const users = await User.findAll({ attributes: ['id', 'nickname', 'avatar', 'isAdmin', 'createdAt'] });
        const rooms = await Room.findAll({ attributes: ['id', 'name', 'createdBy', 'createdAt'] });
        
        // Enrich room data with creator nickname if possible (would need manual fetch or association include if strictly defined)
        // For simplicity, just sending IDs or we can add association: Room.belongsTo(User, {foreignKey: 'createdBy'})
        
        res.json({ users, rooms });
    } catch (e) {
        console.log(e);
        res.status(500).json({ error: 'Error fetching admin data' });
    }
});

app.delete('/api/admin/users/:id', verifyAdmin, async (req, res) => {
    try {
        await User.destroy({ where: { id: req.params.id } });
        io.emit('userDeleted', req.params.id); 
        res.json({ message: 'User deleted' });
    } catch (e) {
        res.status(500).json({ error: 'Error deleting user' });
    }
});

app.delete('/api/admin/rooms/:id', verifyAdmin, async (req, res) => {
    try {
        await Room.destroy({ where: { id: req.params.id } });
        io.emit('roomDeleted', req.params.id);
        res.json({ message: 'Room deleted' });
    } catch (e) {
        res.status(500).json({ error: 'Error deleting room' });
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

  // Send last 50 messages on join
  const loadMessages = async (roomName) => {
    try {
        if (dbConnected) {
            const messages = await Message.findAll({ 
                where: { room: roomName },
                order: [['timestamp', 'DESC']],
                limit: 50
            });
            socket.emit('history', messages.reverse());
        } else {
             socket.emit('history', []);
        }
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  };

  socket.on('join', (data) => {
    const room = data.room || 'General';
    console.log(`User joined room ${room}: ${data.nickname}`);
    
    onlineUsers.set(socket.id, { ...data, room });
    socket.join(room);
    loadMessages(room);

    socket.to(room).emit('notification', `${data.nickname} joined the chat`);
    
    const requestRoomUsers = Array.from(onlineUsers.values()).filter(u => u.room === room);
    io.to(room).emit('updateUserList', requestRoomUsers);
  });
  
  socket.on('switchRoom', (newRoom) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    const oldRoom = user.room || 'General';
    
    socket.leave(oldRoom);
    socket.to(oldRoom).emit('notification', `${user.nickname} left the chat`);
    const oldRoomUsers = Array.from(onlineUsers.values()).filter(u => u.room === oldRoom && u.nickname !== user.nickname);
    io.to(oldRoom).emit('updateUserList', oldRoomUsers);

    user.room = newRoom;
    onlineUsers.set(socket.id, user); 
    socket.join(newRoom);
    
    loadMessages(newRoom);

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
    const user = onlineUsers.get(socket.id);
    const room = user ? user.room : 'General';
    
    console.log(`Message in ${room}:`, data);
    
    try {
      const msgPayload = {
          ...data,
          room: room, 
          sender: data.sender || user.nickname, // Ensure sender is present
          timestamp: new Date()
      };

      if (dbConnected) {
          const newMessage = await Message.create(msgPayload);
          io.to(room).emit('message', newMessage);
      } else {
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
      const user = onlineUsers.get(socket.id);
      const room = user ? user.room : 'General';

      if (secret === ADMIN_SECRET) {
          try {
              if (dbConnected) {
                  await Message.destroy({ where: { room: room } }); 
              }
              io.to(room).emit('history', []); 
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

// ---------------- SCHEDULED BACKUPS ----------------
// Run every hour: 0 * * * *
cron.schedule('0 * * * *', () => {
    console.log('⏳ Starting scheduled backup...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.sql`;
    const backupPath = path.join(__dirname, '../backups', filename); 

    if (!fs.existsSync(path.join(__dirname, '../backups'))) {
        fs.mkdirSync(path.join(__dirname, '../backups'));
    }

    const dbHost = process.env.DB_HOST || 'localhost';
    const dbUser = process.env.DB_USER || 'postgres';
    const dbPass = process.env.DB_PASS || 'sakal';
    const dbName = process.env.DB_NAME || 'chat-app';

    const cmd = `set PGPASSWORD=${dbPass}&& pg_dump -h ${dbHost} -U ${dbUser} -d ${dbName} -f "${backupPath}"`;

    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Backup failed: ${error.message}`);
            return;
        }
        console.log(`✅ Backup successful: ${filename}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { 
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
