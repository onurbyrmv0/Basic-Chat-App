#!/bin/bash

# Create backups directory if it doesn't exist
mkdir -p ./backups

# Get current timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Backup filename
BACKUP_NAME="mongo_backup_$TIMESTAMP.archive"

echo "Starting backup: $BACKUP_NAME..."

# Run mongodump inside the mongo container
# 'chat-mongo' is the container name defined in docker-compose.yml
docker exec chat-mongo sh -c 'mongodump --archive' > "./backups/$BACKUP_NAME"

if [ $? -eq 0 ]; then
  echo "✅ Backup successful! Saved to ./backups/$BACKUP_NAME"
else
  echo "❌ Backup failed!"
fi
