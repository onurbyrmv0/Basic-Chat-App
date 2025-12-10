<script setup>
import { ref, onMounted, nextTick, watch } from 'vue';
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

const avatars = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Bender',
];

// Backend URL (dynamic for production)
const BACKEND_URL = import.meta.env.PROD ? '/' : 'http://localhost:3000';

const joinChat = () => {
  if (!nickname.value.trim()) return;
  
  // Connect to Socket.io
  socket.value = io(BACKEND_URL, {
    transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
    withCredentials: false
  });

  socket.value.on('connect', () => {
    connectionError.value = false;
    joined.value = true;
    socket.value.emit('join', { nickname: nickname.value, avatar: avatar.value });
  });

  socket.value.on('connect_error', () => {
    connectionError.value = true;
  });

  socket.value.on('history', (history) => {
    messages.value = history;
    scrollToBottom();
  });

  socket.value.on('message', (msg) => {
    messages.value.push(msg);
    scrollToBottom();
  });
  
  socket.value.on('notification', (text) => {
      messages.value.push({ type: 'notification', content: text, timestamp: new Date() });
      scrollToBottom();
  });
};

const sendMessage = () => {
  if (!newMessage.value.trim()) return;

  const msgData = {
    nickname: nickname.value,
    avatar: avatar.value,
    content: newMessage.value,
    type: 'text'
  };

  socket.value.emit('sendMessage', msgData);
  newMessage.value = '';
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
    // Determine type based on mimetype
    let msgType = 'text';
    if (type.startsWith('image/')) msgType = 'image';
    if (type.startsWith('video/')) msgType = 'video';

    const msgData = {
      nickname: nickname.value,
      avatar: avatar.value,
      content: '', // No text content for file message
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

const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

</script>

<template>
  <div class="h-screen w-full bg-gray-900 text-gray-100 font-sans flex items-center justify-center p-0 md:p-4 overflow-hidden">
    
    <!-- Login Screen -->
    <div v-if="!joined" class="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700 mx-4">
      <h1 class="text-4xl font-extrabold mb-8 text-center text-indigo-400 tracking-tight">Welcome</h1>
      
      <div class="mb-6">
        <label class="block text-sm font-semibold mb-2 text-gray-300 uppercase tracking-wide">Nickname</label>
        <input 
          v-model="nickname" 
          @keyup.enter="joinChat"
          type="text" 
          class="w-full bg-gray-900/50 text-white rounded-xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-gray-600 focus:border-indigo-500 placeholder-gray-500 transition-all"
          placeholder="Who are you?"
        >
      </div>

      <div class="mb-8">
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
        @click="joinChat" 
        class="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/40 transform hover:-translate-y-1 active:scale-95 text-lg"
      >
        Join Room
      </button>

      <p v-if="connectionError" class="mt-4 text-red-400 text-center text-sm font-medium animate-pulse">
        Waiting for server connection...
      </p>
    </div>

    <!-- Chat Screen -->
    <div v-else class="flex flex-col w-full md:max-w-5xl h-full md:h-[90vh] bg-gray-800 md:rounded-3xl shadow-2xl overflow-hidden border-0 md:border border-gray-700 relative">
      
      <!-- Background Pattern -->
      <div class="absolute inset-0 opacity-5 pointer-events-none" style="background-image: radial-gradient(#6366f1 1px, transparent 1px); background-size: 24px 24px;"></div>

      <!-- Header -->
      <header class="bg-gray-800/95 backdrop-blur-md p-4 border-b border-gray-700 flex justify-between items-center px-4 md:px-8 z-10 sticky top-0">
        <div class="flex items-center gap-4">
            <div class="relative">
                <span class="absolute right-0 bottom-0 block h-3 w-3 rounded-full ring-2 ring-gray-800 bg-green-500 animate-pulse"></span>
                <div class="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
            </div>
            <div>
                <h2 class="text-lg font-bold text-white tracking-wide">General Room</h2>
                <p class="text-xs text-indigo-300 font-medium">Live Chat</p>
            </div>
        </div>
        <div class="flex items-center gap-3 bg-gray-900/50 py-1.5 px-3 rounded-full border border-gray-700/50">
             <span class="font-semibold text-gray-200 text-sm truncate max-w-[100px]">{{ nickname }}</span>
             <img :src="avatar" class="w-8 h-8 rounded-full bg-gray-700 border border-gray-600">
        </div>
      </header>

      <!-- Messages Area -->
      <main ref="messagesContainer" class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-gray-900 scroll-smooth relative z-0">
        <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="mb-4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <p>No messages yet. Say hello!</p>
        </div>

        <div v-for="(msg, index) in messages" :key="index" class="w-full">
            
            <!-- Notification -->
            <div v-if="msg.type === 'notification'" class="flex justify-center my-4">
                <span class="text-xs font-bold text-indigo-300 bg-indigo-500/10 px-4 py-1.5 rounded-full border border-indigo-500/20 shadow-sm uppercase tracking-wider backdrop-blur-sm">{{ msg.content }}</span>
            </div>

            <!-- User Message -->
            <div v-else :class="['flex gap-3 md:gap-4 group animate-fade-in-up', msg.nickname === nickname ? 'flex-row-reverse' : 'flex-row']">
                <img :src="msg.avatar" class="w-8 h-8 md:w-10 md:h-10 rounded-full shadow-md mt-1 bg-gray-800 object-cover border-2 border-gray-700 flex-shrink-0">
                
                <div :class="['max-w-[85%] md:max-w-[70%] flex flex-col', msg.nickname === nickname ? 'items-end' : 'items-start']">
                    <div class="flex items-baseline gap-2 mb-1 px-1">
                        <span class="text-xs md:text-sm font-bold text-gray-400 group-hover:text-gray-300 transition-colors">{{ msg.nickname }}</span>
                        <span class="text-[10px] md:text-xs text-gray-600">{{ formatTime(msg.timestamp) }}</span>
                    </div>

                    <div :class="['px-5 py-3 md:px-6 md:py-4 rounded-[20px] shadow-sm text-white leading-relaxed relative overflow-hidden text-sm md:text-base transition-all duration-200 hover:shadow-md', 
                        msg.nickname === nickname ? 'bg-indigo-600 rounded-tr-sm' : 'bg-gray-700 rounded-tl-sm']">
                        
                        <!-- Text -->
                        <p v-if="msg.type === 'text'" class="break-words whitespace-pre-wrap font-medium">{{ msg.content }}</p>
                        
                        <!-- Image -->
                        <img v-else-if="msg.type === 'image'" :src="msg.fileUrl" @load="scrollToBottom" class="rounded-xl max-h-72 object-cover border border-black/20 hover:scale-[1.01] transition-transform cursor-pointer bg-black/20">

                        <!-- Video -->
                        <video v-else-if="msg.type === 'video'" controls :src="msg.fileUrl" class="rounded-xl max-h-72 border border-black/20 w-full bg-black"></video>
                    </div>
                </div>
            </div>
        </div>
      </main>

      <!-- Input Area -->
      <footer class="bg-gray-800/95 backdrop-blur-md p-4 border-t border-gray-700 z-10 relative">
        <div class="flex gap-3 md:gap-4 max-w-5xl mx-auto items-end">
            <label class="cursor-pointer text-gray-400 hover:text-indigo-400 transition-all p-3 bg-gray-700/50 hover:bg-gray-700 rounded-full border border-gray-600 hover:border-indigo-500/50 shadow-sm flex-shrink-0 active:scale-95">
                <input ref="fileInput" type="file" @change="handleFileUpload" class="hidden" accept="image/*,video/*">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
            </label>
            
            <div class="flex-1 bg-gray-700/50 rounded-3xl flex items-center border border-gray-600 focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-indigo-500 focus-within:bg-gray-700 transition-all shadow-inner">
                <textarea 
                    v-model="newMessage" 
                    @keydown.enter.exact.prevent="sendMessage"
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
