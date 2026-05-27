const db = require('../config/firebase');
const User = require('./User');
const Room = require('./Room');
const Message = require('./Message');

const sequelize = {
    authenticate: async () => {
        // Check connectivity to Firestore by doing a lightweight query
        await db.collection('users').limit(1).get();
        return true;
    },
    sync: async () => {
        // Firestore is schema-less; sync is a no-op
        return true;
    }
};

module.exports = {
    sequelize,
    User,
    Room,
    Message
};
