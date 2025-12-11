# Critical: Update Nginx Configuration

Your chat functionality (Link Previews and File Uploads) is failing because the Nginx server is not forwarding requests to the backend correctly.

You MUST update your Nginx configuration.

## Steps (CloudPanel)

1.  Log in to CloudPanel.
2.  Go to **Sites** -> Your Domain.
3.  Click **Vhost** (or Nginx Config).
4.  Find the `location /` block.
5.  **ADD** the following blocks immediately after it (or replace existing `/socket.io` block):

```nginx
    # WebSocket Proxy
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # API Proxy (Link Previews)
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Uploads Proxy (Files)
    location /upload {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static Uploads Proxy (Images/Audio)
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

6.  **Save** the configuration.
7.  Restart Nginx (usually happens automatically on save, or click Restart Services).
