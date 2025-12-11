const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  nickname: {
    type: String,
    required: true
  },
  avatar: {
    type: String, // URL to avatar image or identifier
    default: ''
  },
  content: {
    type: String,
    required: false // Can be empty if just uploading a file? Let's say yes.
  },
  room: {
    type: String,
    default: 'General',
    index: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'file'],
    default: 'text'
  },
  fileUrl: {
    type: String,
    default: ''
  },
  replyTo: {
    id: String,
    nickname: String,
    content: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Message', messageSchema);
