# Docker Deployment Guide

This project includes Docker support for easy deployment and local development.

## Prerequisites
- Docker installed on your machine.
- Docker Compose installed.

## Running the App

1.  **Build and Start Services**
    Run the following command in the root directory:
    ```bash
    docker-compose up --build
    ```

2.  **Access the Application**
    - **Frontend:** [http://localhost:8090](http://localhost:8090)
    - **Backend:** [http://localhost:3000](http://localhost:3000) (API)
    - **MongoDB:** `localhost:27017`

3.  **Stop the App**
    Press `Ctrl+C` or run:
    ```bash
    docker-compose down
    ```

## Persistence
- The MongoDB data is persisted in a Docker volume named `mongo-data`.
- Uploaded files are persisted in the `./server/uploads` directory (mapped to `/app/uploads` in the container).

## Troubleshooting
- If the backend cannot connect to MongoDB, it will automatically switch to **Fallback Mode** (Memory Storage). Check the logs for "Fallback Mode" warnings.
- Ensure ports 3000, 8080, and 27017 are not in use by other applications.
