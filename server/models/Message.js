const db = require('../config/firebase');
const messagesRef = db.collection('messages');

const Message = {
    formatDoc(doc) {
        if (!doc.exists) return null;
        const data = doc.data();
        return {
            id: doc.id,
            content: data.content,
            type: data.type || 'text',
            sender: data.sender,
            room: data.room || 'General',
            avatar: data.avatar || null,
            timestamp: data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp)) : null,
            fileUrl: data.fileUrl || null,
            replyTo: data.replyTo || null,
            deletedFor: data.deletedFor || []
        };
    },

    async create(msgData) {
        const timestamp = msgData.timestamp || new Date();
        const newMessage = {
            content: msgData.content,
            type: msgData.type || 'text',
            sender: msgData.sender,
            room: msgData.room || 'General',
            avatar: msgData.avatar || null,
            timestamp: timestamp,
            fileUrl: msgData.fileUrl || null,
            replyTo: msgData.replyTo || null,
            deletedFor: []
        };
        const docRef = await messagesRef.add(newMessage);
        const doc = await docRef.get();
        return this.formatDoc(doc);
    },

    async findAll({ where, order, limit, userId }) {
        let query = messagesRef;
        if (where && where.room) {
            query = query.where('room', '==', where.room);
        }
        
        const snapshot = await query.get();
        const messages = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const deletedFor = data.deletedFor || [];
            
            // Filter out if user has deleted this message for themselves in Firestore
            if (userId && deletedFor.includes(userId)) {
                return;
            }
            
            messages.push(this.formatDoc(doc));
        });

        // Sort in memory
        let orderByField = 'timestamp';
        let direction = 'desc';
        if (order && order[0]) {
            orderByField = order[0][0] || 'timestamp';
            direction = (order[0][1] || 'desc').toLowerCase();
        }

        messages.sort((a, b) => {
            const valA = a[orderByField];
            const valB = b[orderByField];
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        if (limit) {
            return messages.slice(0, limit);
        }
        return messages;
    },

    async destroy({ where }) {
        if (where && where.id) {
            await messagesRef.doc(String(where.id)).delete();
            return 1;
        }
        if (where && where.room) {
            const snapshot = await messagesRef.where('room', '==', where.room).get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            return snapshot.size;
        }
        return 0;
    }
};

module.exports = Message;
