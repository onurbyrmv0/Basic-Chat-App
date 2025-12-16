<script setup>
import { ref, reactive, computed, onMounted, nextTick, watch } from 'vue';
import io from 'socket.io-client';
import axios from 'axios';

// State
const joined = ref(false);
const nickname = ref('');
const avatar = ref('https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'); // Default
const messages = ref([]);
const newMessage = ref('');
const fileInput = ref(null);
const messagesContainer = ref(null);
const socket = ref(null);
const connectionError = ref(false);
const isRecording = ref(false);
const mediaRecorder = ref(null);
const audioChunks = ref([]);
const typingUsers = ref(new Set());
const onlineUsers = ref([]);
const replyingTo = ref(null);
const showMobileMenu = ref(false);
const searchQuery = ref('');
const linkPreviews = reactive(new Map()); // url -> meta object
const password = ref('');
const isLoginMode = ref(true); // Toggle between Login and Register
let typingTimeout = null;

// ROOM STATE
const rooms = ref([]);
const currentRoom = ref('General');
const showCreateRoomModal = ref(false);
const showPasswordModal = ref(false); // For joining from link/list (kept for backward compat or direct links)
const showConnectRoomModal = ref(false); // New: For "Connect by Name"
const newRoomName = ref('');
const newRoomPassword = ref('');
const connectRoomName = ref('');
const connectRoomPassword = ref('');
const roomToJoin = ref(null);
const roomJoinPassword = ref('');
const joinedRooms = ref(new Set(['General'])); 
const currentUserId = ref('');
const isAdmin = ref(false); // Admin State
const showAdminPanel = ref(false); // Admin Modal State
const adminUsers = ref([]);
const adminRooms = ref([]);
const adminTab = ref('users'); // 'users' or 'rooms'

const avatars = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Bender',
];

// Backend URL (dynamic for production)
// Backend URL (dynamic for production)
const BACKEND_URL = ''; // Always standard relative path (proxy handles it in both dev and prod)

const handleAuth = async () => {
    if (!nickname.value.trim() || !password.value.trim()) {
        alert('Please enter nickname and password');
        return;
    }

    try {
        const endpoint = isLoginMode.value ? '/api/auth/login' : '/api/auth/register';
        const payload = {
            nickname: nickname.value,
            password: password.value,
            avatar: isLoginMode.value ? undefined : avatar.value
        };

        const res = await axios.post(`${BACKEND_URL}${endpoint}`, payload);
        
        // Success
        const user = res.data.user;
        nickname.value = user.nickname;
        avatar.value = user.avatar;
        currentUserId.value = user._id; 
        isAdmin.value = user.isAdmin || false; // Set Admin Status
        
        // Restore joined rooms from server
        if (user.joinedRooms) {
            user.joinedRooms.forEach(room => {
                joinedRooms.value.add(room.name);
                // Also add to active rooms list if not there
                if (!rooms.value.find(r => r._id === room._id)) {
                    rooms.value.push(room);
                }
            });
        }
        
        // Save to LocalStorage for persistence
        localStorage.setItem('chat_user', JSON.stringify({
            nickname: user.nickname,
            avatar: user.avatar,
            _id: user.id || user._id, // Handle both id (SQL) and _id (Mongo legacy/client compat)
            isAdmin: user.isAdmin,
            joinedRooms: Array.from(joinedRooms.value) // Save room names
        }));
        
        // Connect to Chat
        joinChat();

    } catch (err) {
        console.error('Auth Error:', err);
        alert(err.response?.data?.error || 'Authentication failed');
    }
};

const logout = () => {
    localStorage.removeItem('chat_user');
    // Reload to clear all state cleanly
    window.location.reload();
};

const joinChat = () => {
  // Connect to Socket.io
  socket.value = io(BACKEND_URL, {
    transports: ['websocket', 'polling'], 
    withCredentials: false
  });

  socket.value.on('connect', () => {
    connectionError.value = false;
    joined.value = true;
    socket.value.emit('join', { nickname: nickname.value, avatar: avatar.value, room: currentRoom.value }); 
    // fetchRooms(); // REMOVED: Hidden rooms
  });

  socket.value.on('roomDeleted', (roomId) => {
      // Remove from list
      rooms.value = rooms.value.filter(r => r._id !== roomId);
      joinedRooms.value.delete(rooms.value.find(r => r._id === roomId)?.name); // Attempt cleanup
      
      // If current room, switch to general
      if (currentRoom.value !== 'General' && !rooms.value.find(r => r.name === currentRoom.value)) {
          switchToRoom('General');
          alert('Current room was deleted by the creator.');
      }
  });

  socket.value.on('connect_error', () => {
    connectionError.value = true;
  });

  socket.value.on('history', (history) => {
    messages.value = history;
    // Detect links in history
    history.forEach(m => {
        if(m.type === 'text') detectLinks(m.content);
    });
    scrollToBottom();
  });

  socket.value.on('message', (msg) => {
    messages.value.push(msg);
    detectLinks(msg.content);
    scrollToBottom();
  });
  
  socket.value.on('notification', (text) => {
      messages.value.push({ type: 'notification', content: text, timestamp: new Date() });
      scrollToBottom();
  });

  socket.value.on('updateUserList', (users) => {
      onlineUsers.value = users;
  });

  socket.value.on('userTyping', (userNickname) => {
      typingUsers.value.add(userNickname);
      scrollToBottom();
  });

  socket.value.on('userStopTyping', (userNickname) => {
      typingUsers.value.delete(userNickname);
  });

  socket.value.on('roomCreated', (newRoom) => {
      // Add if not exists
      if (!rooms.value.find(r => r._id === newRoom._id)) {
          rooms.value.push(newRoom);
      }
  });
};

const sendMessage = () => {
  if (!newMessage.value.trim()) return;

  const msgData = {
    nickname: nickname.value,
    avatar: avatar.value,
    content: newMessage.value,
    type: 'text',
    replyTo: replyingTo.value ? {
        id: replyingTo.value._id,
        nickname: replyingTo.value.nickname,
        content: replyingTo.value.type === 'text' ? replyingTo.value.content : `[${replyingTo.value.type}]`
    } : null
  };

  socket.value.emit('sendMessage', msgData);
  newMessage.value = '';
  replyingTo.value = null; // Clear reply state
  stopTyping(); // Clear typing status
};

const handleTyping = () => {
    socket.value.emit('typing');
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.value.emit('stopTyping');
    }, 2000);
};

const stopTyping = () => {
    if (typingTimeout) clearTimeout(typingTimeout);
    socket.value.emit('stopTyping');
};

const setReply = (msg) => {
    replyingTo.value = msg;
    nextTick(() => {
        // Focus input
        const textarea = document.querySelector('textarea');
        if(textarea) textarea.focus();
    });
};

const cancelReply = () => {
    replyingTo.value = null;
};

const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await axios.post(`${BACKEND_URL}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    const { url, type } = res.data;
    let msgType = 'text';
    if (type.startsWith('image/')) msgType = 'image';
    else if (type.startsWith('video/')) msgType = 'video';
    else msgType = 'file'; // Default to generic file for audio/rar/zip/etc if not handled specifically

    const msgData = {
      nickname: nickname.value,
      avatar: avatar.value,
      content: file.name, // Use filename as content for generic files
      type: msgType,
      fileUrl: url
    };
    
    socket.value.emit('sendMessage', msgData);

  } catch (err) {
    console.error('Upload failed', err);
    alert('Upload failed: ' + (err.response?.data?.error || err.message));
  } finally {
    // Reset input
    if (fileInput.value) fileInput.value.value = '';
  }
};

const scrollToBottom = async () => {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
};

// ROOM LOGIC
// fetchRooms removed for hidden rooms logic

const handleCreateRoom = async () => {
    if (!newRoomName.value.trim() || !newRoomPassword.value.trim()) {
        alert('Room name and password are required!');
        return;
    }
    try {
        await axios.post(`${BACKEND_URL}/api/rooms`, {
            name: newRoomName.value,
            password: newRoomPassword.value, // Hashed on server
            userId: currentUserId.value // Use actual user ID
        });
        
        // Reset and refresh
        newRoomName.value = '';
        newRoomPassword.value = '';
        showCreateRoomModal.value = false;
        
        // Add to my rooms immediately
        // fetchRooms(); // Removed
        // Server emits 'roomCreated' but we might want to auto-join or just add to list
    } catch (e) {
        alert(e.response?.data?.error || 'Error creating room');
    }
}

const initiateJoinRoom = (roomName) => {
    if (roomName === 'General' || joinedRooms.value.has(roomName)) {
        switchToRoom(roomName);
    } else {
        roomToJoin.value = roomName;
        roomJoinPassword.value = '';
        showPasswordModal.value = true;
    }
}

const handleConnectRoom = async () => {
    if (!connectRoomName.value.trim() || !connectRoomPassword.value.trim()) return;

    try {
        const res = await axios.post(`${BACKEND_URL}/api/rooms/verify`, {
            name: connectRoomName.value,
            password: connectRoomPassword.value,
            userId: currentUserId.value // Send ID to persist join
        });
        

        
        // Success
        const room = { _id: res.data._id, name: res.data.name, createdBy: res.data.createdBy };
        
        // Add to active rooms if not present
        if (!rooms.value.find(r => r.name === room.name)) {
            rooms.value.push(room);
        }
        
        joinedRooms.value.add(room.name);
        showConnectRoomModal.value = false;
        connectRoomName.value = '';
        connectRoomPassword.value = '';
        switchToRoom(room.name);
        
    } catch (e) {
        alert(e.response?.data?.error || 'Failed to connect');
    }
}

// ADMIN FUNCTIONS
const openAdminPanel = async () => {
    try {
        const res = await axios.get(`${BACKEND_URL}/api/admin/data`, { params: { userId: currentUserId.value } });
        adminUsers.value = res.data.users;
        adminRooms.value = res.data.rooms;
        showAdminPanel.value = true;
    } catch (e) {
        alert('Access Denied');
    }
};

const deleteUser = async (id) => {
    if(!confirm('Ban this user?')) return;
    try {
        await axios.delete(`${BACKEND_URL}/api/admin/users/${id}`, { params: { userId: currentUserId.value } });
        adminUsers.value = adminUsers.value.filter(u => u._id !== id);
    } catch (e) { alert('Failed'); }
};

const adminDeleteRoom = async (id) => {
    if(!confirm('Delete this room completely?')) return;
    try {
        await axios.delete(`${BACKEND_URL}/api/admin/rooms/${id}`, { params: { userId: currentUserId.value } });
        adminRooms.value = adminRooms.value.filter(r => r._id !== id);
    } catch (e) { alert('Failed'); }
};

const deleteRoom = async (room) => {
    if (!confirm(`Are you sure you want to delete room "${room.name}"?`)) return;

    try {
        await axios.delete(`${BACKEND_URL}/api/rooms/${room._id}`, {
            data: { userId: currentUserId.value } // Send userId in body for DELETE
        });
        // Success handled by socket 'roomDeleted'
    } catch (e) {
        alert(e.response?.data?.error || 'Failed to delete room');
    }
}

// Deprecated or Modified: verifyAndJoinRoom for existing list actions
const verifyAndJoinRoom = async () => {
    if (!roomJoinPassword.value) return;
    
    // Find room ID from name
    const targetRoom = rooms.value.find(r => r.name === roomToJoin.value);
    if (!targetRoom) return;

    try {
        await axios.post(`${BACKEND_URL}/api/rooms/verify`, {
            roomId: targetRoom._id,
            password: roomJoinPassword.value
        });
        
        // Success
        joinedRooms.value.add(roomToJoin.value);
        showPasswordModal.value = false;
        switchToRoom(roomToJoin.value);
    } catch (e) {
        alert('Incorrect Password');
    }
}

const switchToRoom = (roomName) => {
    currentRoom.value = roomName;
    socket.value.emit('switchRoom', roomName);
    showMobileMenu.value = false; // Close drawer on mobile
}


const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getSupportedMimeType = () => {
    const types = [
        'audio/webm',
        'audio/mp4',
        'audio/ogg',
        'audio/wav',
        'audio/aac'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return ''; // Browser default
};

const startRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Choose connection-friendly mime type
    // Safari often prefers mp4 generally, Chrome prefers webm
    let mimeType = getSupportedMimeType();
    
    // Fallback options object if needed or let browser decide
    const options = mimeType ? { mimeType } : undefined;
    
    mediaRecorder.value = new MediaRecorder(stream, options);
    audioChunks.value = [];

    mediaRecorder.value.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.value.push(event.data);
      }
    };

    mediaRecorder.value.onstop = async () => {
      // Use the actual mime type of the recorder if available, or fallback to what we tried
      const finalMimeType = mediaRecorder.value.mimeType || mimeType || 'audio/webm';
      const ext = finalMimeType.split('/')[1]?.split(';')[0] || 'webm';
      
      const audioBlob = new Blob(audioChunks.value, { type: finalMimeType });
      const audioFile = new File([audioBlob], `voice-message.${ext}`, { type: finalMimeType });
      await uploadAudio(audioFile);
    };

    mediaRecorder.value.start();
  } catch (err) {
    console.error('Error accessing microphone:', err);
    alert('Microphone access denied or not supported.');
  }
};

const stopRecording = () => {
  if (mediaRecorder.value && isRecording.value) {
    mediaRecorder.value.stop();
    isRecording.value = false;
    mediaRecorder.value.stream.getTracks().forEach(track => track.stop());
  }
};

const cancelRecording = () => {
  if (mediaRecorder.value && isRecording.value) {
     mediaRecorder.value.onstop = null; // Prevent upload
     mediaRecorder.value.stop();
     isRecording.value = false;
     mediaRecorder.value.stream.getTracks().forEach(track => track.stop());
     audioChunks.value = [];
  }
};

const clearChat = () => {
    const secret = prompt('Enter Admin Key to Clear Chat:');
    if (secret) {
        socket.value.emit('clearChat', secret);
    }
};

const uploadAudio = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await axios.post(`${BACKEND_URL}/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        const { url } = res.data;
        
         const msgData = {
            nickname: nickname.value,
            avatar: avatar.value,
            content: '',
            type: 'audio',
            fileUrl: url
        };
        socket.value.emit('sendMessage', msgData);

    } catch (err) {
        console.error('Audio upload failed', err);
        alert('Failed to send voice message.');
    }
};

const detectLinks = async (text) => {
    if (!text) return;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(urlRegex);
    if (matches) {
        console.log('Links detected:', matches);
        for (const url of matches) {
            if (!linkPreviews.has(url)) {
                try {
                    console.log('Fetching meta for:', url);
                    const { data } = await axios.get(`${BACKEND_URL}/api/url-meta?url=${encodeURIComponent(url)}`);
                    console.log('Meta received:', data);
                    if (data && (data.title || data.image)) {
                        linkPreviews.set(url, data);
                    }
                } catch (e) {
                    console.error('Failed to load preview', e);
                }
            }
        }
    }
};

const filteredMessages = computed(() => {
    if (!searchQuery.value) return messages.value;
    const lower = searchQuery.value.toLowerCase();
    return messages.value.filter(msg => {
        if (msg.type === 'text') return msg.content.toLowerCase().includes(lower);
        return false;
    });
});

const getPreview = (text) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = text.match(urlRegex);
    if (match) {
        return linkPreviews.get(match[0]);
    }
    return null;
};

// AUTO-LOGIN Logic
onMounted(() => {
    const savedUser = localStorage.getItem('chat_user');
    if (savedUser) {
        try {
            const user = JSON.parse(savedUser);
            if (user.nickname && user._id) {
                nickname.value = user.nickname;
                avatar.value = user.avatar;
                currentUserId.value = user._id;
                isAdmin.value = user.isAdmin;
                
                // Restore rooms simple (could re-fetch for full freshness)
                if (user.joinedRooms && Array.isArray(user.joinedRooms)) {
                    user.joinedRooms.forEach(r => joinedRooms.value.add(r));
                }
                
                // Note: user.joinedRooms in local storage currently stores Names only from my previous logic
                // But typically we need ID to fetch messages.
                // We'll trust joinChat and server 'join' event to get fresh data or history.
                // Or better: Let's assume we just auto-join.
                
                joinChat();
            }
        } catch (e) {
            console.error('Failed to restore session', e);
            localStorage.removeItem('chat_user');
        }
    }
});
</script>

<template>
  <div class="h-screen md:h-screen w-full bg-gray-900 text-gray-100 font-sans flex items-center justify-center p-0 md:p-4 overflow-hidden" style="height: 100dvh;">
    
    <!-- Login Screen -->
    <div v-if="!joined" class="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700 mx-4 z-50">
      <h1 class="text-4xl font-extrabold mb-8 text-center text-indigo-400 tracking-tight">Welcome</h1>
      
      <div class="mb-6 space-y-4">
        <div>
            <label class="block text-sm font-semibold mb-2 text-gray-300 uppercase tracking-wide">Nickname</label>
            <input 
              v-model="nickname" 
              type="text" 
              class="w-full bg-gray-900/50 text-white rounded-xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-gray-600 focus:border-indigo-500 placeholder-gray-500 transition-all"
              placeholder="Username"
            >
        </div>
        <div>
            <label class="block text-sm font-semibold mb-2 text-gray-300 uppercase tracking-wide">Password</label>
            <input 
              v-model="password" 
              @keyup.enter="handleAuth"
              type="password" 
              class="w-full bg-gray-900/50 text-white rounded-xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-gray-600 focus:border-indigo-500 placeholder-gray-500 transition-all"
              placeholder="••••••••"
            >
        </div>
      </div>

      <div class="mb-8" v-if="!isLoginMode">
        <label class="block text-sm font-semibold mb-3 text-gray-300 uppercase tracking-wide">Select Avatar</label>
        <div class="flex flex-wrap gap-3 justify-center bg-gray-900/30 p-4 rounded-xl border border-gray-700/50">
          <img 
            v-for="url in avatars" 
            :key="url" 
            :src="url" 
            @click="avatar = url"
            :class="{'ring-2 ring-indigo-500 scale-110 shadow-lg shadow-indigo-500/30': avatar === url, 'opacity-70 grayscale hover:grayscale-0 hover:opacity-100 hover:scale-105': avatar !== url}"
            class="w-10 h-10 rounded-full cursor-pointer transition-all duration-300 bg-gray-700 object-cover"
            alt="Avatar"
          >
        </div>
      </div>

      <button 
        @click="handleAuth" 
        class="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/40 transform hover:-translate-y-1 active:scale-95 text-lg"
      >
        {{ isLoginMode ? 'Login' : 'Join Room' }}
      </button>

      <div class="mt-4 text-center">
          <button @click="isLoginMode = !isLoginMode" class="text-sm text-indigo-400 hover:text-indigo-300 underline">
              {{ isLoginMode ? 'Need an account? Sign Up' : 'Already have an account? Login' }}
          </button>
      </div>

      <p v-if="connectionError" class="mt-4 text-red-400 text-center text-sm font-medium animate-pulse">
        Waiting for server connection...
      </p>
    </div>

    <!-- ADMIN PANEL MODAL -->
    <div v-if="showAdminPanel" class="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4">
        <div class="bg-gray-800 p-6 rounded-2xl w-full max-w-4xl h-[80vh] border border-gray-700 shadow-2xl flex flex-col">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-bold text-red-500">Admin Panel</h3>
                <button @click="showAdminPanel = false" class="text-gray-400 hover:text-white">✕</button>
            </div>
            
            <div class="flex gap-4 mb-4 border-b border-gray-700 pb-2">
                <button @click="adminTab = 'users'" :class="['px-4 py-2 font-bold rounded', adminTab === 'users' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white']">Users</button>
                <button @click="adminTab = 'rooms'" :class="['px-4 py-2 font-bold rounded', adminTab === 'rooms' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white']">Rooms</button>
            </div>

            <div class="flex-1 overflow-y-auto">
                <!-- USERS TABLE -->
                <table v-if="adminTab === 'users'" class="w-full text-left border-collapse">
                    <thead>
                        <tr class="text-gray-400 border-b border-gray-700"><th class="p-3">User</th><th class="p-3">Role</th><th class="p-3 text-right">Actions</th></tr>
                    </thead>
                    <tbody>
                        <tr v-for="u in adminUsers" :key="u._id" class="border-b border-gray-700/50 hover:bg-gray-700/30">
                            <td class="p-3 flex items-center gap-3">
                                <img :src="u.avatar" class="w-8 h-8 rounded-full">
                                <span class="font-medium text-white">{{ u.nickname }}</span>
                            </td>
                            <td class="p-3 text-gray-400">{{ u.isAdmin ? 'Admin' : 'User' }}</td>
                            <td class="p-3 text-right">
                                <button v-if="!u.isAdmin" @click="deleteUser(u._id)" class="bg-red-600/20 text-red-400 px-3 py-1 rounded hover:bg-red-600 hover:text-white transition-colors">Ban</button>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <!-- ROOMS TABLE -->
                <table v-if="adminTab === 'rooms'" class="w-full text-left border-collapse">
                    <thead>
                        <tr class="text-gray-400 border-b border-gray-700"><th class="p-3">Room</th><th class="p-3">Creator</th><th class="p-3 text-right">Actions</th></tr>
                    </thead>
                    <tbody>
                        <tr v-for="r in adminRooms" :key="r._id" class="border-b border-gray-700/50 hover:bg-gray-700/30">
                            <td class="p-3 text-white font-medium">{{ r.name }}</td>
                            <td class="p-3 text-gray-400">{{ r.createdBy?.nickname || 'Unknown' }}</td>
                            <td class="p-3 text-right">
                                <button @click="adminDeleteRoom(r._id)" class="bg-red-600/20 text-red-400 px-3 py-1 rounded hover:bg-red-600 hover:text-white transition-colors">Delete</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- CONNECT ROOM MODAL -->
    <div v-if="showConnectRoomModal" class="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
        <div class="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-gray-700 shadow-2xl">
            <h3 class="text-xl font-bold mb-4 text-white">Connect to Room</h3>
            <input v-model="connectRoomName" placeholder="Room Name" class="w-full mb-3 bg-gray-700 p-3 rounded text-white focus:ring-2 focus:ring-indigo-500 outline-none">
            <input v-model="connectRoomPassword" type="password" placeholder="Password" class="w-full mb-4 bg-gray-700 p-3 rounded text-white focus:ring-2 focus:ring-indigo-500 outline-none" @keyup.enter="handleConnectRoom">
            <div class="flex gap-2">
                <button @click="showConnectRoomModal = false" class="flex-1 py-2 bg-gray-600 rounded hover:bg-gray-500 text-white">Cancel</button>
                <button @click="handleConnectRoom" class="flex-1 py-2 bg-green-600 rounded hover:bg-green-500 text-white font-bold">Connect</button>
            </div>
        </div>
    </div>

    <!-- CREATE ROOM MODAL -->
    <div v-if="showCreateRoomModal" class="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
        <div class="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-gray-700 shadow-2xl">
            <h3 class="text-xl font-bold mb-4 text-white">Create Private Room</h3>
            <input v-model="newRoomName" placeholder="Room Name" class="w-full mb-3 bg-gray-700 p-3 rounded text-white focus:ring-2 focus:ring-indigo-500 outline-none">
            <input v-model="newRoomPassword" type="password" placeholder="Password (Required)" class="w-full mb-4 bg-gray-700 p-3 rounded text-white focus:ring-2 focus:ring-indigo-500 outline-none">
            <div class="flex gap-2">
                <button @click="showCreateRoomModal = false" class="flex-1 py-2 bg-gray-600 rounded hover:bg-gray-500 text-white">Cancel</button>
                <button @click="handleCreateRoom" class="flex-1 py-2 bg-indigo-600 rounded hover:bg-indigo-500 text-white font-bold">Create</button>
            </div>
        </div>
    </div>

    <!-- PASSWORD MODAL -->
    <div v-if="showPasswordModal" class="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
        <div class="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-gray-700 shadow-2xl">
            <h3 class="text-xl font-bold mb-4 text-white">Enter Password</h3>
            <p class="text-gray-400 mb-4 text-sm">Room: <span class="text-indigo-400 font-bold">{{ roomToJoin }}</span></p>
            <input v-model="roomJoinPassword" type="password" placeholder="Password" class="w-full mb-4 bg-gray-700 p-3 rounded text-white focus:ring-2 focus:ring-indigo-500 outline-none" @keyup.enter="verifyAndJoinRoom">
            <div class="flex gap-2">
                <button @click="showPasswordModal = false" class="flex-1 py-2 bg-gray-600 rounded hover:bg-gray-500 text-white">Cancel</button>
                <button @click="verifyAndJoinRoom" class="flex-1 py-2 bg-green-600 rounded hover:bg-green-500 text-white font-bold">Join</button>
            </div>
        </div>
    </div>

    <!-- Chat Screen -->
    <div v-else-if="joined" class="flex w-full md:max-w-6xl h-full md:h-[90vh] gap-4">
        
        <!-- Online Users Sidebar (Desktop & Mobile Drawer) -->
        <div 
            class="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity" 
            v-if="showMobileMenu" 
            @click="showMobileMenu = false"
        ></div>

        <aside 
            :class="['fixed md:relative top-0 left-0 h-full md:h-auto w-64 bg-gray-800 md:rounded-3xl shadow-2xl border-r md:border border-gray-700 overflow-hidden z-50 transition-transform duration-300 transform', showMobileMenu ? 'translate-x-0' : '-translate-x-full md:translate-x-0']"
        >
            <div class="flex-1 overflow-y-auto h-full flex flex-col">
                <!-- ONLINE USERS -->
                <div class="p-4 border-b border-gray-700 bg-gray-800/95 backdrop-blur-md flex justify-between items-center sticky top-0 z-10">
                    <h3 class="font-bold text-gray-200 flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        Online ({{ onlineUsers.length }})
                    </h3>
                    <button v-if="isAdmin" @click="openAdminPanel" class="text-xs bg-red-600 px-2 py-1 rounded text-white font-bold hover:bg-red-500">Admin</button>
                    <button @click="showMobileMenu = false" class="md:hidden text-gray-400 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div class="p-3 space-y-2 border-b border-gray-700 pb-4 max-h-[40%] overflow-y-auto">
                    <div v-for="user in onlineUsers" :key="user.nickname" class="flex items-center gap-3 p-2 hover:bg-gray-700/50 rounded-xl transition-colors cursor-default">
                        <div class="relative">
                            <img :src="user.avatar" class="w-8 h-8 rounded-full bg-gray-700 border border-gray-600">
                            <span class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-gray-800 rounded-full"></span>
                        </div>
                        <span class="text-sm font-medium text-gray-300 truncate">{{ user.nickname }}</span>
                    </div>
                </div>

                <!-- ROOMS LIST -->
                <div class="p-4 border-b border-gray-700 bg-gray-800/95 backdrop-blur-md sticky top-0 z-10 flex justify-between items-center">
                    <h3 class="font-bold text-gray-200">Rooms</h3>
                    <div class="flex gap-1">
                        <button @click="showConnectRoomModal = true" class="text-xs bg-gray-600 px-2 py-1 rounded hover:bg-gray-500 text-white font-bold flex items-center gap-1" title="Connect to Room">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        </button>
                        <button @click="showCreateRoomModal = true" class="text-xs bg-indigo-600 px-2 py-1 rounded hover:bg-indigo-500 text-white font-bold" title="Create Private Room">+</button>
                    </div>
                </div>
                <div class="p-3 space-y-2 overflow-y-auto flex-1">
                     <!-- General -->
                     <div 
                        @click="initiateJoinRoom('General')"
                        :class="['p-3 rounded-lg cursor-pointer transition-colors flex justify-between items-center', currentRoom === 'General' ? 'bg-indigo-600 text-white' : 'bg-gray-700/30 hover:bg-gray-700 text-gray-300']"
                     >
                        <span class="font-medium"># General</span>
                    </div>
                    <!-- Custom Rooms -->
                    <div 
                        v-for="room in rooms" 
                        :key="room._id"
                        @click="initiateJoinRoom(room.name)"
                        :class="['p-3 rounded-lg cursor-pointer transition-colors flex justify-between items-center group', currentRoom === room.name ? 'bg-indigo-600 text-white' : 'bg-gray-700/30 hover:bg-gray-700 text-gray-300']"
                    >
                        <span class="font-medium truncate max-w-[120px]"># {{ room.name }}</span>
                        <div class="flex items-center gap-2">
                             <button 
                                v-if="room.createdBy === currentUserId"
                                @click.stop="deleteRoom(room)"
                                class="text-gray-400 hover:text-red-400 transition-colors p-1"
                                title="Delete Room"
                             >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                             </button>
                             <span v-if="!joinedRooms.has(room.name)" class="text-xs opacity-70">🔒</span>
                        </div>
                    </div>
                </div>
            </div>
        </aside>

        <!-- Main Chat Area -->
        <div class="flex flex-col flex-1 bg-gray-800 md:rounded-3xl shadow-2xl overflow-hidden border-0 md:border border-gray-700 relative">
      
      <!-- Background Pattern -->
      <div class="absolute inset-0 opacity-5 pointer-events-none" style="background-image: radial-gradient(#6366f1 1px, transparent 1px); background-size: 24px 24px;"></div>

      <!-- Header -->
      <header class="bg-gray-800/95 backdrop-blur-md p-4 border-b border-gray-700 flex justify-between items-center px-4 md:px-8 z-10 sticky top-0">
        <div class="flex items-center gap-4">
            <!-- Mobile Menu Toggle -->
            <button @click="showMobileMenu = true" class="md:hidden text-gray-400 hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>

            <div class="relative">
                <span class="absolute right-0 bottom-0 block h-3 w-3 rounded-full ring-2 ring-gray-800 bg-green-500 animate-pulse"></span>
                <div class="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
            </div>
            <div>
                <h2 class="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                    <span>{{ currentRoom }}</span>
                    <span v-if="currentRoom !== 'General'" class="text-[10px] bg-indigo-500/80 px-1.5 py-0.5 rounded text-white font-normal uppercase tracking-wider">Private</span>
                </h2>
                <div class="flex items-center gap-2">
                     <p class="text-xs text-indigo-300 font-medium hidden md:block">
                        <span class="w-1.5 h-1.5 bg-green-500 rounded-full inline-block mr-1"></span>
                        {{ onlineUsers.length }} online
                     </p>
                     <div class="relative group">
                         <input 
                            v-model="searchQuery" 
                            type="text" 
                            placeholder="Search..." 
                            class="bg-gray-700/50 text-xs text-white px-2 py-1 rounded-full border border-gray-600 focus:outline-none focus:border-indigo-500 w-24 focus:w-40 transition-all pl-7"
                         >
                         <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="absolute left-2 top-1.5 text-gray-400"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                     </div>
                </div>
            </div>
        </div>
        <div class="flex items-center gap-3 bg-gray-900/50 py-1.5 px-3 rounded-full border border-gray-700/50">
             <button @click="clearChat" class="text-gray-400 hover:text-red-400 transition-colors" title="Clear Chat (Admin)">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
             </button>
             <span class="font-semibold text-gray-200 text-sm truncate max-w-[100px]">{{ nickname }}</span>
             <div class="relative group cursor-pointer">
                 <img :src="avatar" class="w-8 h-8 rounded-full bg-gray-700 border border-gray-600">
                 <!-- Dropdown for Logout -->
                 <div class="absolute right-0 top-full mt-2 w-32 bg-gray-800 rounded-lg shadow-xl border border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                     <button @click="logout" class="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 rounded-lg">Logout</button>
                 </div>
             </div>
        </div>
      </header>

      <!-- Messages Area -->
      <main ref="messagesContainer" class="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 space-y-6 bg-gray-900 scroll-smooth relative z-0">
        <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="mb-4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <p>No messages yet. Say hello!</p>
        </div>

        <div v-for="(msg, index) in filteredMessages" :key="index" class="w-full">
            
            <!-- Notification -->
            <div v-if="msg.type === 'notification'" class="flex justify-center my-4">
                <span class="text-xs font-bold text-indigo-300 bg-indigo-500/10 px-4 py-1.5 rounded-full border border-indigo-500/20 shadow-sm uppercase tracking-wider backdrop-blur-sm">{{ msg.content }}</span>
            </div>

            <!-- User Message -->
            <div v-else :class="['flex gap-3 md:gap-4 group animate-fade-in-up relative', msg.nickname === nickname ? 'flex-row-reverse' : 'flex-row']">
                <div class="flex flex-col items-center gap-1">
                    <img :src="msg.avatar" class="w-8 h-8 md:w-10 md:h-10 rounded-full shadow-md mt-1 bg-gray-800 object-cover border-2 border-gray-700 flex-shrink-0">
                    
                    <!-- Reply Action (Under Avatar) -->
                    <button 
                        @click.stop="setReply(msg)" 
                        class="p-1.5 text-gray-500 hover:text-white hover:bg-indigo-500/50 rounded-full transition-all"
                        title="Reply"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
                    </button>
                </div>
                
                <div :class="['max-w-[85%] md:max-w-[70%] flex flex-col', msg.nickname === nickname ? 'items-end' : 'items-start']">
                    
                    <!-- Reply Context -->
                    <div v-if="msg.replyTo" class="mb-1 text-xs text-gray-400 flex items-center gap-1 opacity-75 hover:opacity-100 transition-opacity cursor-pointer">
                        <span class="bg-gray-700/50 px-2 py-1 rounded-lg border-l-2 border-indigo-500 line-clamp-1">
                            Replying to <span class="font-bold text-indigo-300">{{ msg.replyTo.nickname }}</span>: {{ msg.replyTo.content }}
                        </span>
                    </div>

                    <div class="flex items-baseline gap-2 mb-1 px-1">
                        <span class="text-xs md:text-sm font-bold text-gray-400 group-hover:text-gray-300 transition-colors">{{ msg.nickname }}</span>
                        <span class="text-[10px] md:text-xs text-gray-600">{{ formatTime(msg.timestamp) }}</span>
                    </div>

                    <div :class="['px-5 py-3 md:px-6 md:py-4 rounded-[20px] shadow-sm text-white leading-relaxed relative overflow-hidden text-sm md:text-base transition-all duration-200 hover:shadow-md', 
                        msg.nickname === nickname ? 'bg-indigo-600 rounded-tr-sm' : 'bg-gray-700 rounded-tl-sm']">
                        
                        <!-- Text with Link Preview -->
                        <div v-if="msg.type === 'text'">
                             <p class="break-words whitespace-pre-wrap font-medium">{{ msg.content }}</p>
                             
                             <!-- Link Preview Check -->
                             <div v-if="getPreview(msg.content)" class="mt-2 bg-gray-800/80 rounded-lg overflow-hidden border border-gray-600/50 hover:border-indigo-500/50 transition-colors max-w-sm">
                                 <a :href="getPreview(msg.content).url || msg.content.match(/(https?:\/\/[^\s]+)/)[0]" target="_blank" class="block group/card"> 
                                     <img v-if="getPreview(msg.content).image" :src="getPreview(msg.content).image" class="w-full h-32 object-cover opacity-80 group-hover/card:opacity-100 transition-opacity">
                                     <div class="p-2">
                                         <h4 class="font-bold text-xs text-gray-200 truncate group-hover/card:text-indigo-300">{{ getPreview(msg.content).title }}</h4>
                                         <p class="text-[10px] text-gray-400 line-clamp-2 mt-0.5">{{ getPreview(msg.content).description }}</p>
                                     </div>
                                 </a>
                             </div>
                        </div>
                        
                        <!-- Image -->
                        <img v-else-if="msg.type === 'image'" :src="msg.fileUrl" @load="scrollToBottom" class="rounded-xl max-h-72 object-cover border border-black/20 hover:scale-[1.01] transition-transform cursor-pointer bg-black/20">

                        <!-- Video -->
                        <video v-else-if="msg.type === 'video'" controls :src="msg.fileUrl" class="rounded-xl max-h-72 border border-black/20 w-full bg-black"></video>

                        <!-- Audio -->
                        <div v-else-if="msg.type === 'audio'" class="flex items-center gap-2 min-w-[200px]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-indigo-300"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                            <audio controls :src="msg.fileUrl" class="w-full h-8"></audio>
                        </div>

                        <!-- Generic File (RAR, ZIP, PDF, etc.) -->
                        <div v-else-if="msg.type === 'file'" class="flex items-center gap-3 p-2 bg-gray-800/50 rounded-xl border border-gray-600 hover:bg-gray-700/80 transition-colors min-w-[200px] cursor-pointer" @click="() => {} /* Allow click to bubble to parent or just use link */">
                            <div class="p-3 bg-indigo-500/20 rounded-lg text-indigo-400">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            </div>
                            <div class="flex flex-col overflow-hidden">
                                <span class="font-bold text-sm truncate text-white max-w-[150px]">{{ msg.content }}</span>
                                <a :href="msg.fileUrl" target="_blank" download class="text-xs text-indigo-300 hover:text-indigo-200 hover:underline flex items-center gap-1 mt-0.5">
                                    Download File
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                </a>
                            </div>
                        </div>

                        <!-- Reply Action (Inside Bubble) REMOVED -->
                    </div>
                </div>
            </div>
        </div>

         <!-- Typing Indicator -->
         <div v-if="typingUsers.size > 0" class="flex items-center gap-2 px-4 py-2 text-xs font-medium text-gray-400 animate-pulse">
            <div class="flex gap-1">
                <span class="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                <span class="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                <span class="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
            </div>
            <span>{{ Array.from(typingUsers).join(', ') }} is typing...</span>
        </div>
      </main>

      <!-- Reply Preview -->
      <div v-if="replyingTo" class="bg-gray-800/95 backdrop-blur-md px-4 py-2 border-t border-gray-700 flex justify-between items-center animate-fade-in-up">
           <div class="flex flex-col text-sm border-l-4 border-indigo-500 pl-3">
               <span class="text-indigo-400 font-bold text-xs">Replying to {{ replyingTo.nickname }}</span>
               <span class="text-gray-300 truncate max-w-xs md:max-w-md">{{ replyingTo.type === 'text' ? replyingTo.content : `[${replyingTo.type}]` }}</span>
           </div>
           <button @click="cancelReply" class="p-1 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
           </button>
      </div>

      <!-- Input Area -->
      <footer class="bg-gray-800/95 backdrop-blur-md p-4 border-t border-gray-700 z-10 relative">
        <div class="flex gap-3 md:gap-4 max-w-5xl mx-auto items-end">
            <label class="cursor-pointer text-gray-400 hover:text-indigo-400 transition-all p-3 bg-gray-700/50 hover:bg-gray-700 rounded-full border border-gray-600 hover:border-indigo-500/50 shadow-sm flex-shrink-0 active:scale-95">
                <input ref="fileInput" type="file" @change="handleFileUpload" class="hidden" accept="*/*">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
            </label>
            
            <button 
                v-if="!isRecording"
                @click="startRecording"
                class="p-3 bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-red-400 rounded-full border border-gray-600 hover:border-red-500/50 shadow-sm flex-shrink-0 active:scale-95 transition-all"
                title="Record Voice Message"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
            </button>
            <div v-else class="flex gap-2">
                 <button 
                    @click="cancelRecording"
                    class="p-3 bg-gray-600 hover:bg-gray-500 text-white rounded-full shadow-md flex-shrink-0 active:scale-95 transition-all"
                    title="Cancel Recording"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <button 
                    @click="stopRecording"
                    class="p-3 bg-red-600 hover:bg-red-500 text-white rounded-full shadow-md animate-pulse flex-shrink-0 active:scale-95 transition-all"
                    title="Send Voice Message"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
                </button>
            </div>

            
            <div class="flex-1 bg-gray-700/50 rounded-3xl flex items-center border border-gray-600 focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-500 focus-within:bg-gray-700 transition-all shadow-inner">
                <textarea 
                    v-model="newMessage" 
                    @keydown.enter.exact.prevent="sendMessage"
                    @input="handleTyping"
                    placeholder="Type a message..." 
                    class="w-full bg-transparent text-white px-5 py-3.5 focus:outline-none resize-none h-[52px] max-h-[140px] text-sm md:text-base placeholder-gray-500"
                    style="min-height: 52px;"
                ></textarea>
                <button 
                  @click="sendMessage" 
                  class="p-2.5 mr-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-indigo-500/30 transform hover:scale-105 active:scale-95"
                  :disabled="!newMessage.trim()"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="transform translate-x-px translate-y-px"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
        </div>
      </footer>
    </div>
  </div>
 </div>
</template>

<style>
/* Custom Scrollbar */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent; 
}
::-webkit-scrollbar-thumb {
  background: #4b5563; 
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: #6b7280; 
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.3s ease-out forwards;
}
</style>
