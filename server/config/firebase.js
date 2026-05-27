const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const keyPath = path.join(__dirname, 'serviceAccountKey.json');

if (fs.existsSync(keyPath)) {
    const serviceAccount = require(keyPath);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin initialized with serviceAccountKey.json");
} else {
    console.warn("⚠️ Warning: config/serviceAccountKey.json not found!");
    try {
        admin.initializeApp();
        console.log("✅ Firebase Admin initialized with default credentials");
    } catch (e) {
        console.error("❌ Firebase Admin SDK initialization failed! Please check your credentials.");
    }
}

const db = admin.firestore();

module.exports = db;
