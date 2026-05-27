const db = require('../config/firebase');
const usersRef = db.collection('users');

const User = {
    // Helper to format doc to match existing output structure
    formatDoc(doc) {
        if (!doc.exists) return null;
        const data = doc.data();
        return {
            id: doc.id,
            nickname: data.nickname,
            password: data.password,
            avatar: data.avatar,
            isAdmin: data.isAdmin,
            plainPassword: data.plainPassword,
            joinedRooms: data.joinedRooms || [],
            createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : null,
            
            async addJoinedRoom(room) {
                const roomInfo = {
                    id: room.id,
                    name: room.name,
                    createdBy: room.createdBy
                };
                const currentRooms = this.joinedRooms || [];
                if (!currentRooms.some(r => r.id === room.id)) {
                    currentRooms.push(roomInfo);
                    this.joinedRooms = currentRooms;
                    await doc.ref.update({ joinedRooms: currentRooms });
                }
            },
            
            async save() {
                await doc.ref.update({
                    nickname: this.nickname,
                    password: this.password,
                    avatar: this.avatar,
                    isAdmin: this.isAdmin,
                    plainPassword: this.plainPassword,
                    joinedRooms: this.joinedRooms
                });
            }
        };
    },

    async findOne({ where }) {
        if (where && where.nickname) {
            const snapshot = await usersRef.where('nickname', '==', where.nickname).limit(1).get();
            if (snapshot.empty) return null;
            return this.formatDoc(snapshot.docs[0]);
        }
        return null;
    },

    async findByPk(id) {
        if (!id) return null;
        const doc = await usersRef.doc(String(id)).get();
        return this.formatDoc(doc);
    },

    async create(userData) {
        const newUser = {
            nickname: userData.nickname,
            password: userData.password,
            plainPassword: userData.plainPassword || null,
            avatar: userData.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
            isAdmin: userData.isAdmin || false,
            joinedRooms: userData.joinedRooms || [],
            createdAt: new Date()
        };
        const docRef = await usersRef.add(newUser);
        const doc = await docRef.get();
        return this.formatDoc(doc);
    },

    async update(updates, { where }) {
        if (where && where.id) {
            await usersRef.doc(String(where.id)).update(updates);
            return [1];
        }
        return [0];
    },

    async destroy({ where }) {
        if (where && where.id) {
            await usersRef.doc(String(where.id)).delete();
            return 1;
        }
        return 0;
    },

    async findAll() {
        const snapshot = await usersRef.get();
        const users = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            users.push({
                id: doc.id,
                nickname: data.nickname,
                avatar: data.avatar,
                isAdmin: data.isAdmin,
                plainPassword: data.plainPassword,
                createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : null
            });
        });
        return users;
    }
};

module.exports = User;
