const db = require('../config/firebase');
const roomsRef = db.collection('rooms');

const Room = {
    formatDoc(doc) {
        if (!doc.exists) return null;
        const data = doc.data();
        return {
            id: doc.id,
            name: data.name,
            password: data.password,
            plainPassword: data.plainPassword,
            createdBy: data.createdBy,
            createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : null,
            
            async destroy() {
                await doc.ref.delete();
            }
        };
    },

    async findOne({ where }) {
        if (where && where.name) {
            const snapshot = await roomsRef.where('name', '==', where.name).limit(1).get();
            if (snapshot.empty) return null;
            return this.formatDoc(snapshot.docs[0]);
        }
        return null;
    },

    async findByPk(id) {
        if (!id) return null;
        const doc = await roomsRef.doc(String(id)).get();
        return this.formatDoc(doc);
    },

    async create(roomData) {
        const newRoom = {
            name: roomData.name,
            password: roomData.password,
            plainPassword: roomData.plainPassword || null,
            createdBy: roomData.createdBy,
            createdAt: new Date()
        };
        const docRef = await roomsRef.add(newRoom);
        const doc = await docRef.get();
        return this.formatDoc(doc);
    },

    async destroy({ where }) {
        if (where && where.id) {
            await roomsRef.doc(String(where.id)).delete();
            return 1;
        }
        return 0;
    },

    async findAll() {
        const snapshot = await roomsRef.get();
        const rooms = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            rooms.push({
                id: doc.id,
                name: data.name,
                createdBy: data.createdBy,
                plainPassword: data.plainPassword,
                createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : null
            });
        });
        return rooms;
    },

    async update(updates, { where }) {
        if (where && where.id) {
            await roomsRef.doc(String(where.id)).update(updates);
            return [1];
        }
        return [0];
    }
};

module.exports = Room;
