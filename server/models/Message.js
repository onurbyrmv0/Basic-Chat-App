const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Message = sequelize.define('Message', {
    content: {
        type: DataTypes.TEXT, // Could be text or file URL
        allowNull: false
    },
    type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'text' // 'text', 'image', 'video'
    },
    sender: {
        type: DataTypes.STRING, // storing nickname for easy access, or could link to User
        allowNull: false
    },
    room: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'General'
    },
    avatar: {
        type: DataTypes.STRING 
    },
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

module.exports = Message;
