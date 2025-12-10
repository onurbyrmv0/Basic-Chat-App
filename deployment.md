# Deployment Guide: Node.js Chat App on DigitalOcean

This guide outlines how to deploy your Real-Time Chat App to a DigitalOcean Droplet.

## Prerequisites
- A DigitalOcean account (use your GitHub Student Pack credits).
- SSH Key configured (recommended) or root password.

## 1. Create a Droplet
1.  **Log in** to DigitalOcean.
2.  Click **Create** -> **Droplets**.
3.  **Choose Region**: Select one close to your target audience (e.g., London, New York).
4.  **Choose Image**: **Ubuntu 24.04 (LTS)** (or latest LTS).
5.  **Choose Size**: **Basic**, Regular Disk Type. The cheapest option (e.g., $4 or $6/mo) is sufficient for testing.
6.  **Authentication**: Select **SSH Key** (upload your public key) or **Password**.
7.  **Hostname**: Give it a name like `chat-app`.
8.  Click **Create Droplet**.

## 2. Server Setup (Basic Linux Commands)
Once the droplet is created, copy its IP address. Open your terminal (PowerShell or Git Bash) and SSH into it:

```bash
ssh root@YOUR_DROPLET_IP
# If you used password, enter it when prompted.
```

### Update System
```bash
apt update && apt upgrade -y
```

### Install Node.js
We will use `nvm` (Node Version Manager) to install Node.js.
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
node -v # Verify version
```

### Install MongoDB (Locally on Droplet)
For production, a managed database (DigitalOcean Managed MongoDB or MongoDB Atlas) is better, but you can run it locally for dev.
```bash
apt install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
   gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update
apt install -y mongodb-org
systemctl start mongod
systemctl enable mongod
```

## 3. Deploy Code
### Option A: Git Clone (Recommended)
1.  Push your code to GitHub.
2.  Clone on server:
    ```bash
    git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git chat-app
    cd chat-app
    ```

### Option B: SCP (Direct Copy)
From your local machine:
```bash
# Copy server folder
scp -r ./server root@YOUR_DROPLET_IP:/root/chat-app-server
# Build client locally and copy dist (see below)
```

## 4. Run the Application
Navigate to your server directory on the droplet:
```bash
cd chat-app/server
npm install
```

### Setup Environment Variables
Create `.env` file:
```bash
nano .env
```
Paste your content:
```env
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/chat-app
```
Save: `Ctrl+O`, `Enter`, `Ctrl+X`.

### Process Management with PM2
Keep server running after you disconnect.
```bash
npm install -g pm2
pm2 start server.js --name chat-backend
pm2 save
pm2 startup
```

## 5. Serve Frontend (Nginx Proxy)
In a real production setup, you build the Vue app and serve it via Nginx.

1.  **Build Vue App** (Locally or on server if you install devDeps):
    ```bash
    cd ../client
    npm install
    npm run build
    ```
    This creates a `dist` folder.

2.  **Install Nginx**:
    ```bash
    apt install -y nginx
    ```

3.  **Configure Nginx**:
    ```bash
    nano /etc/nginx/sites-available/default
    ```
    Replace content with:
    ```nginx
    server {
        listen 80;
        server_name YOUR_DROPLET_IP;

        # Serve Frontend
        location / {
            root /root/chat-app/client/dist;
            index index.html;
            try_files $uri $uri/ /index.html;
        }

        # Proxy API requests to Node Backend
        location /socket.io/ {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
        
        location /upload {
            proxy_pass http://localhost:3000;
        }
        
        location /uploads {
            proxy_pass http://localhost:3000;
        }
    }
    ```

4.  **Restart Nginx**:
    ```bash
    systemctl restart nginx
    ```

Now access `http://YOUR_DROPLET_IP` in your browser!

## 6. Troubleshooting
- **Frontend Issues**: If the UI looks broken, ensure the assets in `dist` were built correctly with `npm run build`.
- **Backend Issues**: Check logs with `pm2 logs`. 
- **Database Connection**: If MongoDB fails to connect, the server will enter **Fallback Mode** (Memory Storage). This allows the chat to work but messages will be lost on restart. Check your `MONGO_URI` in `.env`.

