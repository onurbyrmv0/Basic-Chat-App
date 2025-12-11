# 🚀 Real-Time Chat Application

A modern, full-featured real-time chat application built with **Vue 3**, **Node.js**, **Socket.io**, and **MongoDB**.

![Status](https://img.shields.io/badge/Status-Active-success)
![Docker](https://img.shields.io/badge/Docker-Supported-blue)

## ✨ Features

- **🔐 Authentication**: Secure Login & Sign Up with bcrypt password hashing.
- **💬 Real-Time Messaging**: Instant message delivery using Socket.io.
- **📎 File Sharing**: Upload and share Images, Audio, ZIP, RAR, and PDF files.
- **🔗 Link Previews**: Automatically generates rich preview cards for shared links.
- **🎤 Voice Messages**: Record and send voice notes directly in the chat.
- **👀 User Status**: See who is online and who is typing in real-time.
- **📱 Responsive Design**: Optimized for Desktop and Mobile (PWA-ready layout).
- **🛡️ Admin Tools**: Admin command to clear chat history.

## 🛠️ Tech Stack

*   **Frontend**: Vue 3, Tailwind CSS v4, Vite
*   **Backend**: Node.js, Express.js, Socket.io
*   **Database**: MongoDB (Mongoose)
*   **Deployment**: Docker, Nginx, CloudPanel

## 🚀 Quick Start (Docker)

The easiest way to run the application is using Docker.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/onurbyrmv0/Basic-Chat-App.git
    cd Basic-Chat-App
    ```

2.  **Run with Docker Compose:**
    ```bash
    docker-compose up -d --build
    ```

3.  **Access the App:**
    *   Frontend: `http://localhost:80` (or configured domain)
    *   Backend API: `http://localhost:3000`

## 📚 Documentation

Detailed guides are available in the `docs/` folder:

*   [**Deployment Guide**](docs/DOCKER_README.md): Detailed Docker setup instructions.
*   [**Nginx Configuration**](docs/FINAL_NGINX_CONFIG.md): Production Nginx setup for CloudPanel.
*   [**GitHub Workflow**](docs/GITHUB_DEPLOY.md): How to deploy updates via Git.

## 📂 Project Structure

```
├── client/           # Vue 3 Frontend
├── server/           # Node.js/Express Backend
├── docs/             # Documentation & Guides
├── docker-compose.yml # Docker Orchestration
└── README.md         # This file
```

---
*Developed by Onur Bayramov*
