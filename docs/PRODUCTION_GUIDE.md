# 📘 Chat Application Running & Deployment Guide

This guide details how to run the application for local development and how to manage its production VPS deployment.

---

## 💻 1. Local Development Setup

To run the application locally on your computer:

### Prerequisites
- Node.js installed (v18+)
- A Firebase project setup with Firestore enabled
- Firebase credentials file saved as `server/config/serviceAccountKey.json`

### Steps

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/onurbyrmv0/Basic-Chat-App.git
    cd Basic-Chat-App
    ```

2.  **Configure environment variables:**
    Create a `server/.env` file with the following variables:
    ```env
    PORT=3000
    ADMIN_SECRET=your_admin_secret_key
    ```

3.  **Run the Backend (API & WebSocket):**
    ```bash
    cd server
    npm install
    npm start # runs node server.js
    ```
    The backend server will run on `http://localhost:3000`.

4.  **Run the Frontend (Vue 3 Dev Server):**
    Open a new terminal window:
    ```bash
    cd client
    npm install
    npm run dev
    ```
    The frontend dev server will start (typically on `http://localhost:5173` or similar) and proxy requests to `http://localhost:3000`.

---

## ☁️ 2. Production VPS Architecture

In production (VPS via CloudPanel), the application runs natively (without Docker) as a background process managed by `systemd` under the service name `chat-app`.

- **Service File Location:** `/etc/systemd/system/chat-app.service`
- **Command list to manage service:**
  ```bash
  # Check status of the app
  sudo systemctl status chat-app

  # Restart the application manually
  sudo systemctl restart chat-app

  # View live application logs (useful for debugging)
  sudo journalctl -u chat-app.service -f --no-pager
  ```

---

## 🤖 4. CI/CD Deployment Pipeline

Deployments are fully automated via **GitHub Actions** (`.github/workflows/deploy.yml`).

Whenever you push code to the `main` branch, the workflow:
1. Automatically SSHs into your VPS.
2. Navigates to `/home/onurbayramov-chat/htdocs/chat.onurbayramov.codes`.
3. Runs `git pull origin main`.
4. Installs packages and builds the production frontend (`npm run build`).
5. Installs backend dependencies.
6. Restarts `chat-app` systemd service so users immediately see updates.
