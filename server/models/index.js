const sequelize = require('../config/database');
const User = require('./User');
const Room = require('./Room');
const Message = require('./Message');

// Associations

// Users can join many Rooms, Rooms can have many Users
User.belongsToMany(Room, { through: 'UserRooms', as: 'joinedRooms' });
Room.belongsToMany(User, { through: 'UserRooms', as: 'members' });

// Room has many messages (optional, messages store room name string currently)
// For strict relational integrity we could do:
// Room.hasMany(Message);
// Message.belongsTo(Room);

module.exports = {
    sequelize,
    User,
    Room,
    Message
};
