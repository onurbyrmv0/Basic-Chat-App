# GitHub & Docker Deployment Guide

This guide explains how to upload your project to GitHub and then deploy it on your server using Docker.

## 1. Push Code to GitHub

I have already initialized a local Git repository and committed your files. Now you need to push it to a remote repository.

1.  **Create a New Repository** on [GitHub](https://github.com/new).
    - Do *not* add README, .gitignore, or License (we already have them).

2.  **Link Remote Repository**:
    Open your terminal in the project folder and run:
    ```bash
    git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
    git branch -M main
    git push -u origin main
    ```

## 2. Deploy on Server (using Docker)

Login to your server (DigitalOcean Droplet or CloudPanel SSH).

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git chat-app
    cd chat-app
    ```

2.  **Create .env File**:
    ```bash
    cd server
    nano .env
    ```
    Paste:
    ```env
    PORT=3000
    MONGO_URI=mongodb://mongo:27017/chat-app
    ```
    *(Note: When using Docker Compose, the mongo host is `mongo`, not localhost)*

3.  **Run with Docker Compose**:
    Back in the root `chat-app` folder:
    ```bash
    docker-compose up -d --build
    ```

4.  **Verify**:
    - Frontend: `http://YOUR_SERVER_IP:8090`
    - Backend: `http://YOUR_SERVER_IP:3000`

## 3. Updating Code
When you make changes locally:
1.  Commit and Push:
    ```bash
    git add .
    git commit -m "Updates"
    git push
    ```
2.  On Server:
    ```bash
    cd chat-app
    git pull
    docker-compose up -d --build
    ```

## 4. Domain Setup (CloudPanel)
If you want to use a domain (e.g., `chat.yourdomain.com`), you need to configure the Reverse Proxy in CloudPanel.

1.  Go to **CloudPanel** -> **Sites** -> **Manage Site** -> **Vhost**.
2.  Replace the `location /` block (and add others) with this configuration:

```nginx
    # Serve Frontend (Port 8090)
    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy Socket.io to Backend (Port 3000)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Proxy API Uploads to Backend (Port 3000)
    location /upload {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }

    location /uploads {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
```
3.  **Save** the Vhost configuration.

