# Full Nginx VHost Configuration for CloudPanel

Since your Node.js server (Port 3000) handles BOTH the Frontend (React/Vue files) and the Backend (API/Socket), the configuration is very simple. We just need to forward **everything** to port 3000.

**Replace your entire VHost config with this (keeping your specific SSL paths active):**

```nginx
server {
  listen 80;
  listen [::]:80;
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  {{ssl_certificate_key}}
  {{ssl_certificate}}
  server_name {{domain_name}};
  root {{root_path}};

  # Security Headers
  add_header X-Frame-Options "SAMEORIGIN";
  add_header X-XSS-Protection "1; mode=block";
  add_header X-Content-Type-Options "nosniff";

  index index.html;

  charset utf-8;

  # Proxy EVERYTHING to Node.js Backend (Port 3000)
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Increase timeouts for long-running socket connections
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
  }

  # Prevent access to hidden files
  location ~ /\.(?!well-known).* {
    deny all;
  }
}
```

## Why this works?
Your `server.js` is already configured to serve the frontend files (`client/dist`) AND handle the API. So Nginx doesn't need to split traffic. It just sends everything to your Node app, and your Node app decides "Is this an API call? Or should I show the website?".
