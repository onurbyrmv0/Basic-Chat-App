# CloudPanel Deployment Guide

Since you have created a **Node.js Application** in CloudPanel, follow these steps to deploy your Chat App.

## 1. Upload Your Code
You can upload your code via **File Manager** (in CloudPanel) or **SFTP** (FileZilla) or **Git** (if you linked a repo).

### What to Upload:
Upload everything **EXCEPT** `node_modules`.
- `server/` folder
- `client/` folder
- `package.json` (root one if you had one, but mainly the ones inside server/client)
- `docker-compose.yml` (optional, not needed for CloudPanel direct node run)

## 2. Install Dependencies (SSH)
CloudPanel allows you to run commands via SSH. Connect to your "System User" via SSH (the user you created for the site).

```bash
# SSH into your server
ssh username@your-server-ip
```

Navigate to your app directory (usually `/home/username/htdocs/your-domain.com/`).

### Backend Setup
```bash
cd server
npm install
```

### Frontend Setup
```bash
cd ../client
npm install
npm run build
```
This will create a `dist` folder inside `client/`.

## 3. Environment Variables
In CloudPanel, go to your Site -> **Settings** (or Environment/Variables tab if available, otherwise use `.env` file).

Create a `.env` file in the `server/` directory:
```bash
cd ../server
nano .env
```
Paste:
```env
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/chat-app 
# Note: Ensure you have MongoDB installed on the server or use an external URL (Atlas).
# If no Mongo, it will run in Fallback Mode.
```

## 4. Run the Server (PM2)
CloudPanel Node.js sites usually use **PM2** or **Nodemon** specified in the "Node.js Settings".

1.  In CloudPanel -> Site -> **Node.js Settings**.
2.  **App Entry File**: `server/server.js` (Ensure path is correct relative to root).
3.  **Port**: `3000`.
4.  **Save** and **Restart**.

*Alternatively, run manually via SSH for testing:*
```bash
cd server
npm install -g pm2
pm2 start server.js --name chat-app
```

## 5. Configure Nginx (IMPORTANT for Socket.io)
CloudPanel sets up a Reverse Proxy, but you need to make sure it handles WebSockets correctly.

Go to CloudPanel -> Site -> **Vhost** (Nginx Configuration).

Find the `location /` block. You need to serve the **frontend** static files and proxy the **backend** API.

**Strategy:**
Since CloudPanel Node.js site proxies *everything* to the Node port (3000), we need to tell Node to serve the Frontend files OR config Nginx to serve them.

**Simplest CloudPanel Method (Node serves Frontend):**
1.  Modify `server/server.js` to serve the `client/dist` folder.
    *I will provide a code snippet to update `server.js` for this below.*

**Update `server/server.js` to serve static files:**
Add this before the `server.listen` line in `server/server.js`:

```javascript
// Serve Frontend Static Files
app.use(express.static(path.join(__dirname, '../client/dist')));

// Catch-all route to serve index.html for Vue Router
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});
```

With this change, your Node app (running on port 3000) serves BOTH the API/Sockets AND the Frontend. CloudPanel just sends traffic to port 3000.

## 6. Final Steps
1.  **Rebuild Frontend**: `cd client && npm run build`
2.  **Restart Node Server**: In CloudPanel or via `pm2 restart chat-app`.

Your app should now be live at your domain!
